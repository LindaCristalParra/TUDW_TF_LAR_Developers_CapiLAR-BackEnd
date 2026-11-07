import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

// The session id of the access token, kept on the request apart from req.user, so routes that
// return req.user (GET /auth/me) don't start showing it.
const SID = Symbol('sid');

type RequestConSid = Request & { [SID]?: string };

/** Called by JwtStrategy once the access token is verified. */
export function guardarSid(req: Request, sid: string | undefined): void {
  (req as RequestConSid)[SID] = sid;
}

/**
 * The calling device's Sesion.sid. 401 for an access token issued before it carried one: the app
 * refreshes it, as with an expired one, and gets a token that does.
 */
export const SidActual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const sid = ctx.switchToHttp().getRequest<RequestConSid>()[SID];
    if (!sid) {
      throw new UnauthorizedException(
        'Tu sesión venció. Iniciá sesión de nuevo.',
      );
    }
    return sid;
  },
);
