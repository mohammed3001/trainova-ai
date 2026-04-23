import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });
  app.setGlobalPrefix('api');

  // Trust the upstream reverse proxy (Next.js API route / nginx / Vercel).
  // Required so @Ip() and req.ip resolve the real client address from
  // X-Forwarded-For rather than the proxy loopback. The Next.js proxy
  // forwards X-Forwarded-For, so this value ends up in the audit trail.
  app.set('trust proxy', true);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Trainova AI API')
    .setDescription('Global marketplace and evaluation platform for AI training talent.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`🚀 Trainova AI API running on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`📚 Swagger docs at http://localhost:${port}/docs`, 'Bootstrap');
}
bootstrap();
