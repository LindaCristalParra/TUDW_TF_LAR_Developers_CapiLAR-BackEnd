import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationError } from 'class-validator';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// The messages of every field, nested ones included. Nest's default would prefix the nested
// ones with their path ("formulas.0.El volumen..."); the messages already say which field it is.
function mensajes(errores: ValidationError[]): string[] {
  return errores.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...mensajes(error.children ?? []),
  ]);
}

async function bootstrap() {
  // rawBody: the WhatsApp webhook checks Meta's signature over the exact bytes received.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const configService = app.get(ConfigService);

  // Behind a proxy (deploy), the request limits count by the client's IP from X-Forwarded-For
  // instead of the proxy's (PWA-269). It's how many proxies to trust ("1" = the one in front;
  // validarEntorno only accepts 1 to 9); without it, X-Forwarded-For is ignored, so a client
  // can't fake its IP.
  const trustProxy = configService.get<string>('TRUST_PROXY')?.trim();
  if (trustProxy) {
    app.set('trust proxy', Number(trustProxy));
  }

  // Security headers (PWA-267), helmet's defaults with two changes:
  // - Cross-Origin-Resource-Policy cross-origin, not same-origin: the web, on another origin, shows
  //   the profile and service photos in <img>.
  // - No upgrade-insecure-requests in the CSP: it made Swagger UI ask for its files over HTTPS,
  //   so it came up blank on a host served over plain HTTP (not localhost). HTTPS in production
  //   is enforced by the server in front of the app and by HSTS, not by this directive.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
    }),
  );

  // Closed list of allowed origins. Without it, cors() would accept any origin.
  const corsOrigins = configService
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (!corsOrigins.length) {
    throw new Error('CORS_ORIGINS is empty');
  }
  app.enableCors({ origin: corsOrigins, credentials: true });
  // The web keeps the refresh token in an httpOnly cookie (see AuthController).
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // One message per field. Validators run bottom-up, so DTOs list the basic rule last.
      stopAtFirstError: true,
      // Without duplicates: the same mistake in two formulas is shown once.
      exceptionFactory: (errores) =>
        new BadRequestException([...new Set(mensajes(errores))]),
    }),
  );

  // Swagger only when asked for (decided 07/11, PWA-267): without SWAGGER=true a deploy doesn't
  // publish the whole API by mistake.
  if (configService.get<string>('SWAGGER') === 'true') {
    const config = new DocumentBuilder()
      .setTitle('CapiLAR API')
      .setDescription('Listado de endpoints de CapiLAR API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
