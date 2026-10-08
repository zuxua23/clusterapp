import { ForbiddenException } from '@nestjs/common';
import { Area, Prisma, RT } from '@prisma/client';
import { AccessContext } from '../auth/auth.types';
import { LEVEL_ADMIN } from './helpers';

/**
 * Terjemahkan scope permission jadi filter area.
 *   null  -> tidak dibatasi (scope ALL)
 *   Area  -> hanya data area itu (scope AREA)
 * Scope OWN bukan urusan area; pemanggil yang mendukung OWN harus menanganinya
 * sebelum memanggil helper ini.
 */
export function areaFilter(ctx: AccessContext): Area | null {
  if (ctx.scope === 'ALL') return null;
  if (ctx.scope === 'AREA') {
    if (!ctx.user.area) {
      throw new ForbiddenException('Akun Anda belum memiliki area (RW/RT).');
    }
    return ctx.user.area;
  }
  throw new ForbiddenException('Akses hanya untuk data milik sendiri.');
}

/** Pastikan data berarea `area` boleh disentuh user ini. */
export function assertInArea(
  ctx: AccessContext,
  area: Area | RT | null | undefined,
) {
  const allowed = areaFilter(ctx);
  if (allowed !== null && allowed !== area) {
    throw new ForbiddenException('Data ini di luar wilayah Anda.');
  }
}

/** Filter kolom bertipe RT (tb_Rumah.rt). Area RW tidak punya rumah, jadi hasilnya kosong. */
export function rtFilter(area: Area | null): { rt?: RT | { in: RT[] } } {
  if (area === null) return {};
  if (area === 'RW') return { rt: { in: [] } };
  return { rt: area };
}

export function isRtArea(area: Area | null | undefined): area is RT {
  return !!area && area !== 'RW';
}

/**
 * Penghuni yang boleh DILIHAT di data warga: semua akun selain admin. Pengurus juga
 * penghuni, jadi ikut tampil di RT tempat rumahnya berada (mis. Ketua RW yang tinggal di RT 1
 * terlihat oleh pengurus RT 1). Melihat tidak berarti boleh mengubah; lihat `wargaTulisWhere`.
 */
export function wargaBacaWhere(area: Area | null): Prisma.UserWhereInput {
  const bukanAdmin: Prisma.UserWhereInput = {
    role: { level: { gt: LEVEL_ADMIN } },
  };
  if (area === null) return bukanAdmin;
  const rumahDiArea: Prisma.UserWhereInput[] =
    area === 'RW' ? [] : [{ rumah: { some: { rt: area, isDelete: false } } }];
  return { AND: [bukanAdmin, { OR: [{ area }, ...rumahDiArea] }] };
}
