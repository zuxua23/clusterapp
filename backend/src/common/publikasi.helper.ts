import { Area } from '@prisma/client';
import { AccessContext } from '../auth/auth.types';

/**
 * Kegiatan & pengumuman default milik RT pembuatnya. Yang boleh dilihat user:
 *   - scope ALL  : semuanya (pengurus RW, admin)
 *   - selain itu : milik area-nya + konten level RW + konten RT yang sudah di-ACC RW
 */
export function visibilitasWhere(ctx: AccessContext) {
  if (ctx.scope === 'ALL') return {};
  const or: Array<Record<string, unknown>> = [
    { area: 'RW' },
    { statusPengajuan: 'DISETUJUI' },
  ];
  if (ctx.user.area) or.push({ area: ctx.user.area });
  return { OR: or };
}

/**
 * Khusus halaman kelola (findAll admin/pengurus) — beda dari visibilitasWhere di atas.
 * Pengurus RT hanya mengelola kontennya SENDIRI (area-nya), titik — walau sudah di-ACC
 * RW (DISETUJUI) atau sedang diajukan (DIAJUKAN), tetap muncul karena memang masih
 * miliknya; konten RT/RW lain (termasuk yang sudah tampil ke semua warga) tidak perlu
 * ikut nongol di sini karena bukan yang dia kelola. Scope ALL (RW/admin) tetap lihat semua.
 */
export function visibilitasKelolaWhere(ctx: AccessContext) {
  if (ctx.scope === 'ALL') return {};
  return { area: ctx.user.area ?? 'RW' };
}

/** Konten yang tampil ke semua orang (landing page): level RW atau sudah di-ACC RW. */
export const tampilKeSemua = {
  OR: [{ area: 'RW' as Area }, { statusPengajuan: 'DISETUJUI' as const }],
};

/** Batas tampil di dashboard warga: tanpa batas, atau belum lewat. */
export function belumLewatBatasTampil() {
  return {
    OR: [{ tampilSampai: null }, { tampilSampai: { gte: new Date() } }],
  };
}

/**
 * Input "berapa hari tampil" -> tanggal batas.
 *   undefined = tidak diubah, 0 = tanpa batas (null), N = N hari dari sekarang.
 */
export function tampilSampaiDari(durasiHari?: number): Date | null | undefined {
  if (durasiHari === undefined) return undefined;
  if (durasiHari <= 0) return null;
  const batas = new Date();
  batas.setDate(batas.getDate() + durasiHari);
  return batas;
}
