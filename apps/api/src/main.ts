import './common/serialize';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './common/redis-io.adapter';

async function bootstrap() {
  if (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be set (≥ 32 chars)');
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1); // behind Cloudflare / Next.js proxy
  app.setGlobalPrefix('api');
  // REQ-SEC-01: HSTS and other security headers.
  app.use(helmet({ hsts: { maxAge: 31536000, includeSubDomains: true } }));
  app.use(cookieParser());
  app.enableCors({ origin: (process.env.WEB_ORIGIN || 'http://localhost:3000').split(','), credentials: true });
  // REQ-SEC-03: input validation on every endpoint.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  if (process.env.REDIS_URL) {
    const adapter = new RedisIoAdapter(app);
    await adapter.connect(process.env.REDIS_URL);
    app.useWebSocketAdapter(adapter);
  }
  app.enableShutdownHooks();
  const port = Number(process.env.PORT) || 4000;
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on :${port}`);
}
bootstrap();
