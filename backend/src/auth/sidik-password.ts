import { createHash } from 'node:crypto';

/** Sidik jari hash password di dalam token: ganti/reset password otomatis membatalkan token lama. */
export const sidikPassword = (hash: string) =>
  createHash('sha256').update(hash).digest('hex').slice(0, 16);
