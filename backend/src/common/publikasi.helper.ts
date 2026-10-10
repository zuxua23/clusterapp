import { Area } from '@prisma/client';
import { AccessContext } from '../auth/auth.types';

/** Scope ALL lihat semua; selain itu: area sendiri + konten RW + konten RT yang sudah di-ACC RW. */
export function visibilitasWhere(ctx: AccessContext) {
  if (ctx.scope === 'ALL') return {};
  const or: Array<Record<string, unknown>> = [
    { area: 'RW' },
    { statusPengajuan: 'DISETUJUI' },
  ];
  if (ctx.user.area) or.push({ area: ctx.user.area });
  return { OR: or };
}

/** Halaman kelola: pengurus hanya melihat konten area sendiri; scope ALL melihat semua. */
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
