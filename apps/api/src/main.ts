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
  if (process.env.OTP_FIXED_CODE) {
    if (process.env.NODE_ENV === 'production') throw new Error('OTP_FIXED_CODE must not be set in production');
    new Logger('Bootstrap').warn(`OTP_FIXED_CODE is set: every OTP is "${process.env.OTP_FIXED_CODE}" and no SMS is sent`);
  }
  if (process.env.DEPOSIT_SIMULATION === 'true') {
    if (process.env.NODE_ENV === 'production') throw new Error('DEPOSIT_SIMULATION must not be set in production');
    new Logger('Bootstrap').warn('DEPOSIT_SIMULATION is on: players can credit fake payments with "Simulate payment"');
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Number of proxies in front of the API: 1 = one load balancer (e.g. Railway alone),
  // 2 = browser → Vercel rewrite → Railway → API. Wrong values make every user share one IP
  // for rate limits, so set TRUST_PROXY to match the deployment.
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.setGlobalPrefix('api');
  // REQ-SEC-01: HSTS and other security headers.
  app.use(helmet({ hsts: { maxAge: 31536000, includeSubDomains: true } }));
  app.use(cookieParser());
  app.enableCors({ origin: (process.env.WEB_ORIGIN || 'http://localhost:3000').split(','), credentials: true });
  // REQ-SEC-03: input validation on every endpoint.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, stopAtFirstError: true }));
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
