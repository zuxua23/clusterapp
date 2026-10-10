import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import compression from 'compression';
import helmet from 'helmet';
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

function cekKonfigurasi(isProd: boolean) {
  const secret = process.env.JWT_SECRET ?? '';
  if (secret.length < 32) {
    const pesan =
      'JWT_SECRET wajib diisi minimal 32 karakter acak (mis. `openssl rand -hex 32`).';
    const log = new Logger('Config');
    if (isProd) log.error(`TIDAK AMAN: ${pesan}`);
    else log.warn(pesan);
  }
}

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  cekKonfigurasi(isProd);

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('CORS');

  // Di belakang reverse proxy (Railway/Render/Nginx) set TRUST_PROXY=1 supaya rate limit membaca IP asli.
  if (process.env.TRUST_PROXY)
    app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

  app.use(
    helmet({
      // File (/files/:id) dipakai frontend yang beda domain.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // API tidak menyajikan HTML; CSP dimatikan supaya viewer PDF bawaan browser tetap jalan.
      contentSecurityPolicy: false,
    }),
  );
  app.use(compression());

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
