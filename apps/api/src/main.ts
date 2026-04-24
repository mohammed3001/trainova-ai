import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { Request } from 'express';
import { json, raw } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true,
    // Raw-body needed on the Stripe webhook path so signature verification
    // runs against the exact bytes Stripe hashed. The JSON parser below
    // only mounts for every *other* route.
    bodyParser: false,
  });
  app.setGlobalPrefix('api');

  // Stripe webhooks hit /api/payments/webhook — keep the raw buffer on
  // `req.rawBody` so `webhooks.constructEvent` can verify the HMAC, but
  // also parse a JSON body so handlers can read it normally. This must
  // be registered *before* the global JSON parser.
  app.use(
    '/api/payments/webhook',
    raw({
      type: 'application/json',
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = Buffer.from(buf);
      },
    }),
  );
  // Every other route gets the normal JSON body parser (restores the
  // default we disabled via `bodyParser: false`).
  app.use(json({ limit: '10mb' }));

  // Trust ONLY the loopback proxy hop. `trust proxy: true` would have
  // Express accept the leftmost X-Forwarded-For value from any caller,
  // letting a client spoof its own IP and bypass the per-IP rate limits
  // on the auth endpoints. `loopback` means the X-Forwarded-For / X-Real-IP
  // headers are honoured only when the immediate TCP peer is 127.0.0.1/::1,
  // i.e. our own Next.js proxy — which sanitises client-supplied IP
  // headers before forwarding (see apps/web/src/app/api/proxy/[...path]).
  // Any other reverse proxy in front of the API (Vercel, nginx, Cloudflare)
  // should be added to this list explicitly rather than via `true`.
  app.set('trust proxy', 'loopback');

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
