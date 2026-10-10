import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import compression from 'compression';
import { AppModule } from './app.module';
import {
  PesanIndonesiaFilter,
  validasiIndonesia,
} from './common/pesan-indonesia';

const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
// Preview deployment Vercel dapat subdomain unik tiap deploy.
const POLA_VERCEL = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('CORS');

  app.use(compression());

  const isProd = process.env.NODE_ENV === 'production';
  const originEnv = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const originDiizinkan = new Set([
    ...(isProd ? [] : DEV_ORIGINS),
    ...originEnv,
  ]);

  app.enableCors({
    origin(origin, callback) {
      // Tanpa Origin = request server-to-server/curl.
      if (!origin || originDiizinkan.has(origin) || POLA_VERCEL.test(origin)) {
        callback(null, true);
      } else {
        logger.warn(`Origin ${origin} ditolak oleh CORS`);
        callback(null, false);
      }
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    // Supaya nama file export terbaca di browser.
    exposedHeaders: ['Content-Disposition'],
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: validasiIndonesia,
    }),
  );
  app.useGlobalFilters(new PesanIndonesiaFilter());

  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
}
void bootstrap();
