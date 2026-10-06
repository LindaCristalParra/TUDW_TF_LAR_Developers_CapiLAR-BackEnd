import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {});

  // Closed list of allowed origins. Without it, cors() would accept any origin.
  const corsOrigins = app
    .get(ConfigService)
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (!corsOrigins.length) {
    throw new Error('CORS_ORIGINS is empty');
  }
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // One message per field. Validators run bottom-up, so DTOs list the basic rule last.
      stopAtFirstError: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('CapiLAR API')
    .setDescription('Listado de endpoints de CapiLAR API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
