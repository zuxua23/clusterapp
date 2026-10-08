// backend/src/main.ts
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import {
  PesanIndonesiaFilter,
  validasiIndonesia,
} from './common/pesan-indonesia';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // <-- 2. Pengaturan CORS (whitelist origin)
  // - Di laptop (NODE_ENV bukan 'production'): localhost/127.0.0.1 (:3000 Next.js,
  //   :3001 cadangan, :5173 Vite) lolos OTOMATIS agar clone -> jalan tanpa setting env.
  // - Di deploy (NODE_ENV=production): default dev di atas MATI TOTAL, yang lolos hanya
  //   origin eksplisit dari env CORS_ORIGINS (custom domain) + *.vercel.app
  //   (preview deployment Vercel dapat URL unik tiap deploy, jadi dipakai pola,
  //   bukan daftar statis — tetap aman karena subdomain itu hanya bisa dibuat dari project Vercel kita)
  // - request tanpa header Origin (server-to-server/curl, bukan browser) tetap diizinkan
  // exposedHeaders: agar fetch browser boleh MEMBACA Content-Disposition
  // (dipakai tombol Export agar nama file dari server ikut terpakai).
  // Tetap Bearer token (tanpa credentials:true) — frontend kirim Authorization header.
  const logger = new Logger('CORS');
  const isProd = process.env.NODE_ENV === 'production';
  const originEksplisit = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const defaultDev = isProd
    ? []
    : [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3001',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
      ];
  const originDiizinkan = new Set([...defaultDev, ...originEksplisit]);
  const polaVercel = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

  app.enableCors({
    origin(origin, callback) {
      if (!origin || originDiizinkan.has(origin) || polaVercel.test(origin)) {
        callback(null, true);
      } else {
        // Tolak diam-diam (tanpa header CORS) agar browser memblokir,
        // tapi JANGAN lempar Error: itu jadi 500 + spam log ERROR Nest.
        logger.warn(`Origin ${origin} ditolak oleh CORS`);
        callback(null, false);
      }
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'],
  });

  // <-- 3. Tambahkan ValidationPipe untuk class-validator
  // transform:true agar @Type() pada DTO berjalan (mis. nominal string
  // dari multipart FormData dikonversi ke number sebelum divalidasi)
  // exceptionFactory + filter: pesan error bawaan library ikut berbahasa Indonesia.
  // whitelist: buang field yang tidak ada di DTO; forbidNonWhitelisted: tolak requestnya
  // (bukan cuma dibuang diam-diam) kalau ada field ekstra yang tidak dikenal — mencegah
  // mass assignment (mis. klien iseng kirim `roleId`/`isVerified` di body).
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: validasiIndonesia,
    }),
  );
  app.useGlobalFilters(new PesanIndonesiaFilter());

  // Semua file upload disimpan di database (tb_File). File publik diambil lewat GET /files/:id;
  // bukti finansial & notulen hanya lewat endpoint modulnya (cek login + wilayah).

  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
}
void bootstrap();
