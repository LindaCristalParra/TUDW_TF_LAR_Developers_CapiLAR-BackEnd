import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
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
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);

  // Security headers (PWA-267). Cross-Origin-Resource-Policy is cross-origin, not helmet's
  // same-origin: the web, on another origin, shows the profile and service photos in <img>.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

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
