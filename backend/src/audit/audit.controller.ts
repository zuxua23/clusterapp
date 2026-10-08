import { Controller, Get, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermission } from '../auth/permission.decorators';
import { ymRangeToDates } from '../common/periode.helper';

/** Aksi yang dicatat sistem, untuk filter dropdown di halaman Riwayat Aktivitas. */
export const AKSI_AUDIT = [
  'rumah.ubah_status',
  'ipl.generate',
  'ipl.koreksi',
  'ipl.konfirmasi',
  'setoran.buat',
  'setoran.konfirmasi',
  'setoran.tolak',
  'warga.hapus',
  'warga.reset_password',
] as const;

/**
 * GET /audit — riwayat aktivitas sensitif (append-only, hanya-baca).
 * Dipakai pimpinan RW memeriksa siapa mengubah apa: flip status rumah,
 * koreksi nominal, generate, konfirmasi, dan setoran.
 */
@Controller('audit')
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @RequirePermission('audit', 'read')
  async findAll(
    @Query('aksi') aksi?: string,
    @Query('search') search?: string,
    @Query('dari') dari?: string,
    @Query('sampai') sampai?: string,
    @Query('limit') limit?: string,
  ) {
    const and: Prisma.AuditLogWhereInput[] = [];
    if (aksi && aksi !== 'SEMUA') and.push({ aksi });
    if (dari || sampai) {
      const ym = /^\d{4}-\d{2}$/;
      const d = ym.test(dari ?? '') ? dari! : (sampai ?? '');
      const s = ym.test(sampai ?? '') ? sampai! : (dari ?? '');
      if (d && s) {
        const [awal, akhir] = d > s ? [s, d] : [d, s];
        const { gte, lt } = ymRangeToDates(awal, akhir);
        and.push({ createdAt: { gte, lt } });
      }
    }
    if (search?.trim()) {
      const q = search.trim();
      and.push({
        OR: [
          { keterangan: { contains: q } },
          { target: { contains: q } },
          { aksi: { contains: q } },
        ],
      });
    }

    const take = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const rows = await this.prisma.auditLog.findMany({
      where: and.length > 0 ? { AND: and } : {},
      orderBy: { createdAt: 'desc' },
      take,
    });

    const ids = [
      ...new Set(
        rows.map((r) => r.idUser).filter((v): v is number => v !== null),
      ),
    ];
    const users =
      ids.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, namaUser: true },
          })
        : [];
    const nama = new Map(users.map((u) => [u.id, u.namaUser]));

    return {
      riwayat: rows.map((r) => ({
        ...r,
        namaUser: r.idUser !== null ? (nama.get(r.idUser) ?? '—') : 'Sistem',
      })),
      aksiTersedia: [...AKSI_AUDIT],
    };
  }
}
