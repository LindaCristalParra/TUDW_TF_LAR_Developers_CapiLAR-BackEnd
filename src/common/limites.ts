import {
  applyDecorators,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { ApiTooManyRequestsResponse } from '@nestjs/swagger';
import {
  hours,
  minutes,
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerOptions,
} from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { PublicUser } from '../users/users.service';

// Request limits (PWA-269, decided 08/11). Only the routes marked with @Limite() have one: there
// is no general limit for the rest of the API. Counted in memory, so they assume one instance
// of the app and start over when it restarts.
export type NombreLimite = 'cuenta' | 'mail' | 'token' | 'youcam';

const LIMITE_KEY = 'limite';

/** Puts the route under one of the limits below, and documents its 429 in Swagger. */
export const Limite = (nombre: NombreLimite) =>
  applyDecorators(
    SetMetadata(LIMITE_KEY, nombre),
    ApiTooManyRequestsResponse({
      description: `${LIMITES[nombre].doc} Trae \`Retry-After\` (segundos).`,
    }),
  );

const limiteDe = (context: ExecutionContext): NombreLimite | undefined =>
  Reflect.getMetadata(LIMITE_KEY, context.getHandler()) as
    NombreLimite | undefined;

const LIMITES: Record<
  NombreLimite,
  Pick<ThrottlerOptions, 'ttl' | 'limit' | 'getTracker'> & {
    mensaje: string;
    // For Swagger.
    doc: string;
  }
> = {
  // Login and sign-up, per IP: enough for a typo, not for trying passwords.
  cuenta: {
    ttl: minutes(1),
    limit: 5,
    mensaje: 'Hiciste demasiados intentos seguidos.',
    doc: 'Más de 5 pedidos por minuto desde la misma IP.',
  },
  // Routes that send an email (or use the reset link), per IP.
  mail: {
    ttl: minutes(15),
    limit: 3,
    mensaje: 'Hiciste demasiados pedidos seguidos.',
    doc: 'Más de 3 pedidos cada 15 minutos desde la misma IP.',
  },
  // Public routes with a token from an email or WhatsApp, per IP.
  token: {
    ttl: minutes(1),
    limit: 20,
    mensaje: 'Hiciste demasiados pedidos seguidos.',
    doc: 'Más de 20 pedidos por minuto desde la misma IP.',
  },
  // Each real YouCam try-on spends a unit of the account: per user, not per IP.
  youcam: {
    ttl: hours(1),
    limit: 10,
    getTracker: (req) =>
      `usuario:${(req as Request & { user?: PublicUser }).user?.id}`,
    mensaje: 'Llegaste al límite de pruebas de color por hora.',
    doc: 'Más de 10 pruebas por hora del mismo usuario.',
  },
};

/** The throttlers for ThrottlerModule: each one only applies to the routes marked with its name. */
export const throttlers: ThrottlerOptions[] = (
  Object.keys(LIMITES) as NombreLimite[]
).map((nombre) => {
  const { ttl, limit, getTracker } = LIMITES[nombre];
  return {
    name: nombre,
    ttl,
    limit,
    getTracker,
    skipIf: (context: ExecutionContext) => limiteDe(context) !== nombre,
    // The headers would carry the throttler's name (Retry-After-cuenta); Retry-After goes below.
    setHeaders: false,
  };
});

// "45 segundos", "1 minuto", "14 minutos".
function espera(segundos: number): string {
  if (segundos < 60) {
    return `${segundos} ${segundos === 1 ? 'segundo' : 'segundos'}`;
  }
  const min = Math.ceil(segundos / 60);
  return `${min} ${min === 1 ? 'minuto' : 'minutos'}`;
}

/** 429 in the API's format, with the message in Spanish and Retry-After in seconds. */
@Injectable()
export class LimiteGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    context: ExecutionContext,
    detalle: ThrottlerLimitDetail,
  ): Promise<void> {
    const segundos = Math.max(1, Math.ceil(detalle.timeToBlockExpire));
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Retry-After', String(segundos));
    const { mensaje } = LIMITES[limiteDe(context) ?? 'token'];
    throw new HttpException(
      {
        message: `${mensaje} Probá de nuevo en ${espera(segundos)}.`,
        error: 'Too Many Requests',
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
