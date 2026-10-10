import { randomInt } from 'crypto';

/** Level role di tb_Role: 0 admin, 1 RW, 2 RT, 3 warga. */
export const LEVEL_ADMIN = 0;
export const LEVEL_WARGA = 3;

/** Format blok rumah: E7/15 */
export const BLOK_RUMAH_REGEX = /^E\d{1,2}\/\d{1,2}$/;
export const BLOK_RUMAH_MESSAGE = 'Format blok rumah harus seperti E7/15';

// Tolak < dan > di nama supaya tidak bisa disisipi HTML/script.
export const NAMA_REGEX = /^[^<>]+$/;
export const NAMA_MESSAGE = 'Nama tidak boleh berisi karakter < atau >.';

// Tanpa 0/O, 1/l/I supaya mudah dibacakan ke warga.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Password sementara yang dikasih pengurus ke warga (wajib diganti saat login pertama). */
export function generatePassword(length = 8): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Tagihan dengan total (IPL + kas) yang dibayar warga. */
export function withTotal<T extends { nominalIpl: number; nominalKas: number }>(
  t: T,
): T & { nominal: number } {
  return { ...t, nominal: t.nominalIpl + t.nominalKas };
}

export const totalTagihan = (t: { nominalIpl: number; nominalKas: number }) =>
  t.nominalIpl + t.nominalKas;
