import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Area, Prisma, StatusPengajuan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKegiatanDto } from './dto/create-kegiatan.dto';
import { UpdateKegiatanDto } from './dto/update-kegiatan.dto';
import { UpdateStatusKegiatanDto } from './dto/update-status-kegiatan.dto';
import { KeputusanPengajuanDto } from '../common/dto/pengajuan.dto';
import { NotifikasiService } from '../notifikasi/notifikasi.service';
import { PermissionsService } from '../auth/permissions.service';
import { AuditService } from '../audit/audit.service';
import { FileService } from '../common/file/file.service';
import { AccessContext } from '../auth/auth.types';
import { areaFilter, assertInArea } from '../common/scope.helper';
import {
  belumLewatBatasTampil,
  tampilKeSemua,
  tampilSampaiDari,
  visibilitasKelolaWhere,
  visibilitasWhere,
} from '../common/publikasi.helper';

const RINGKAS = {
  id: true,
  judul: true,
  deskripsi: true,
  gambarUrl: true,
  tanggalAcara: true,
  area: true,
} satisfies Prisma.KegiatanSelect;

@Injectable()
export class KegiatanService {
  constructor(
    private prisma: PrismaService,
    private notifikasiService: NotifikasiService,
    private permissions: PermissionsService,
    private audit: AuditService,
    private files: FileService,
  ) {}

  /** Apakah user ini berhak menyetujui pengajuan (menentukan boleh atur portofolio & durasi tampil). */
  private async bolehApprove(ctx: AccessContext) {
    return (
      (await this.permissions.scopeOf(ctx.user.roleId, 'kegiatan.approve')) !==
      null
    );
  }

  // ================================================================
  // CRUD
  // ================================================================

  async create(
    ctx: AccessContext,
    dto: CreateKegiatanDto,
    file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Gambar kegiatan wajib diunggah');
    }

    const area: Area = areaFilter(ctx) ?? dto.area ?? ctx.user.area ?? 'RW';
    const approver = await this.bolehApprove(ctx);

    const gambarUrl = await this.files.simpan(file, { publik: true });
    const data = await this.prisma.kegiatan.create({
      data: {
        judul: dto.judul,
        deskripsi: dto.deskripsi,
        tanggalAcara: new Date(dto.tanggalAcara),
        status: dto.status,
        gambarUrl,
        area,
        createBy: ctx.user.nama,
        ...(approver && {
          tampilDiLanding: dto.tampilDiLanding ?? false,
          tampilSampai: tampilSampaiDari(dto.durasiHari),
        }),
      },
    });

    if (data.status === 'active') {
      await this.notifikasiService.kirimKePermission(
        'kegiatan.read',
        data.area,
        'KEGIATAN_BARU',
        'Kegiatan Baru',
        data.judul,
        '/dashboard',
        ctx.user.sub,
      );
    }

    return { message: 'Kegiatan berhasil dibuat', data };
  }

  /** Daftar untuk halaman kelola. Filter opsional: ?pengajuan=DIAJUKAN, ?area=RT_01 (scope ALL). */
  findAll(
    ctx: AccessContext,
    params: { pengajuan?: string; area?: string } = {},
  ) {
    const and: Prisma.KegiatanWhereInput[] = [
      { isDelete: false },
      visibilitasKelolaWhere(ctx),
    ];
    if (params.pengajuan)
      and.push({ statusPengajuan: params.pengajuan as StatusPengajuan });
    if (params.area && ctx.scope === 'ALL')
      and.push({ area: params.area as Area });
    return this.prisma.kegiatan.findMany({
      where: { AND: and },
      orderBy: { tanggalAcara: 'desc' },
    });
  }

  /** Umpan dashboard warga: yang boleh dilihatnya, aktif, dan belum lewat batas tampil. */
  feed(ctx: AccessContext) {
    return this.prisma.kegiatan.findMany({
      where: {
        AND: [
          { isDelete: false, status: 'active' },
          visibilitasWhere(ctx),
          belumLewatBatasTampil(),
        ],
      },
      orderBy: { tanggalAcara: 'desc' },
      take: 20,
    });
  }

  /** Publik (landing): hanya konten level RW / yang sudah di-ACC RW. */
  findActive(scope?: 'aktif' | 'arsip') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (scope === 'arsip') {
      return this.prisma.kegiatan.findMany({
        where: {
          isDelete: false,
          ...tampilKeSemua,
          tanggalAcara: { lt: today },
        },
        orderBy: { tanggalAcara: 'desc' },
        take: 5,
        select: RINGKAS,
      });
    }
    // default aktif: akan datang/berlangsung (tanggalAcara >= hari ini) + status active
    return this.prisma.kegiatan.findMany({
      where: {
        isDelete: false,
        status: 'active',
        ...tampilKeSemua,
        tanggalAcara: { gte: today },
      },
      orderBy: { tanggalAcara: 'asc' },
      take: 5,
      select: RINGKAS,
    });
  }

  /** Publik (landing): portofolio cluster 5 tahun ke belakang s/d 5 tahun ke depan, dikelompokkan per tahun. */
  async portofolio() {
    const mulai = new Date();
    mulai.setFullYear(mulai.getFullYear() - 5);
    const batas = new Date();
    batas.setFullYear(batas.getFullYear() + 5);
    const rows = await this.prisma.kegiatan.findMany({
      where: {
        isDelete: false,
        status: 'active',
        tampilDiLanding: true,
        ...tampilKeSemua,
        tanggalAcara: { gte: mulai, lte: batas },
      },
      orderBy: { tanggalAcara: 'asc' },
      select: RINGKAS,
    });

    const perTahun = new Map<number, typeof rows>();
    for (const r of rows) {
      const tahun = r.tanggalAcara.getFullYear();
      perTahun.set(tahun, [...(perTahun.get(tahun) ?? []), r]);
    }
    return {
      total: rows.length,
      tahun: [...perTahun.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([tahun, kegiatan]) => ({ tahun, kegiatan })),
    };
  }

  async findOne(ctx: AccessContext, id: number) {
    const kegiatan = await this.prisma.kegiatan.findFirst({
      where: { AND: [{ id, isDelete: false }, visibilitasWhere(ctx)] },
    });
    if (!kegiatan) {
      throw new NotFoundException(`Kegiatan dengan ID ${id} tidak ditemukan`);
    }
    return kegiatan;
  }

  /** Ambil untuk diubah/dihapus: harus di dalam wilayah tulis user. */
  private async findForWrite(ctx: AccessContext, id: number) {
    const kegiatan = await this.prisma.kegiatan.findFirst({
      where: { id, isDelete: false },
    });
    if (!kegiatan) {
      throw new NotFoundException(`Kegiatan dengan ID ${id} tidak ditemukan`);
    }
    assertInArea(ctx, kegiatan.area);
    return kegiatan;
  }

  async update(
    ctx: AccessContext,
    id: number,
    dto: UpdateKegiatanDto,
    file?: Express.Multer.File,
  ) {
    const existing = await this.findForWrite(ctx, id);
    const approver = await this.bolehApprove(ctx);

    const gambarBaru = file
      ? await this.files.simpan(file, { publik: true })
      : undefined;

    const data = await this.prisma.kegiatan.update({
      where: { id },
      data: {
        judul: dto.judul,
        deskripsi: dto.deskripsi,
        tanggalAcara: dto.tanggalAcara ? new Date(dto.tanggalAcara) : undefined,
        status: dto.status,
        gambarUrl: gambarBaru,
        updateBy: ctx.user.nama,
        updatedAt: new Date(),
        ...(approver && {
          tampilDiLanding: dto.tampilDiLanding,
          tampilSampai: tampilSampaiDari(dto.durasiHari),
        }),
        // Isi diubah setelah diajukan/disetujui: harus diajukan ulang supaya tidak lolos ACC dengan konten lain.
        ...(!approver &&
          (existing.statusPengajuan === 'DIAJUKAN' ||
            existing.statusPengajuan === 'DISETUJUI') && {
            statusPengajuan: 'TIDAK' as const,
            alasanTolak: null,
          }),
      },
    });

    if (gambarBaru) await this.files.hapus(existing.gambarUrl);

    return { message: 'Kegiatan berhasil diperbarui', data };
  }

  async updateStatus(
    ctx: AccessContext,
    id: number,
    dto: UpdateStatusKegiatanDto,
  ) {
    await this.findForWrite(ctx, id);

    const data = await this.prisma.kegiatan.update({
      where: { id },
      data: {
        status: dto.status,
        updateBy: ctx.user.nama,
        updatedAt: new Date(),
      },
    });

    return { message: 'Status kegiatan berhasil diperbarui', data };
  }

  async remove(ctx: AccessContext, id: number) {
    await this.findForWrite(ctx, id);

    await this.prisma.kegiatan.update({
      where: { id },
      data: { isDelete: true, updateBy: ctx.user.nama, updatedAt: new Date() },
    });

    return { message: 'Kegiatan berhasil dihapus' };
  }

  // ================================================================
  // PENGAJUAN TAMPIL KE SELURUH RW — sekre RT mengajukan, ketua/sekre RW memutuskan
  // ================================================================

  async ajukan(ctx: AccessContext, id: number) {
    const kegiatan = await this.findForWrite(ctx, id);
    if (kegiatan.area === 'RW') {
      throw new BadRequestException(
        'Kegiatan level RW sudah tampil ke seluruh warga.',
      );
    }
    if (
      kegiatan.statusPengajuan === 'DIAJUKAN' ||
      kegiatan.statusPengajuan === 'DISETUJUI'
    ) {
      throw new BadRequestException('Kegiatan ini sudah diajukan.');
    }

    const data = await this.prisma.kegiatan.update({
      where: { id },
      data: {
        statusPengajuan: 'DIAJUKAN',
        alasanTolak: null,
        updateBy: ctx.user.nama,
        updatedAt: new Date(),
      },
    });

    await this.notifikasiService.kirimKePermission(
      'kegiatan.approve',
      'RW',
      'PENGAJUAN_MASUK',
      'Pengajuan Kegiatan',
      `${kegiatan.area.replace('_', ' ')} mengajukan kegiatan "${kegiatan.judul}" untuk ditampilkan ke seluruh warga.`,
      '/dashboard/kegiatan',
      ctx.user.sub,
    );

    return { message: 'Kegiatan diajukan ke RW untuk disetujui.', data };
  }

  async putuskanPengajuan(
    ctx: AccessContext,
    id: number,
    dto: KeputusanPengajuanDto,
  ) {
    const kegiatan = await this.prisma.kegiatan.findFirst({
      where: { id, isDelete: false },
    });
    if (!kegiatan)
      throw new NotFoundException(`Kegiatan dengan ID ${id} tidak ditemukan`);
    assertInArea(ctx, kegiatan.area);
    if (kegiatan.statusPengajuan !== 'DIAJUKAN') {
      throw new BadRequestException('Kegiatan ini tidak sedang diajukan.');
    }

    if (dto.action === 'TOLAK') {
      if (!dto.alasan?.trim())
        throw new BadRequestException('Alasan penolakan wajib diisi.');
      const data = await this.prisma.kegiatan.update({
        where: { id },
        data: {
          statusPengajuan: 'DITOLAK',
          alasanTolak: dto.alasan,
          updateBy: ctx.user.nama,
          updatedAt: new Date(),
        },
      });
      await this.audit.catat(ctx.user.sub, 'kegiatan.tolak', {
        target: 'Kegiatan',
        targetId: id,
        keterangan: dto.alasan,
      });
      await this.notifikasiService.kirimKePermission(
        'kegiatan.ajukan',
        kegiatan.area,
        'PENGAJUAN_DITOLAK',
        'Pengajuan Kegiatan Ditolak',
        `Pengajuan kegiatan "${kegiatan.judul}" ditolak RW. Alasan: ${dto.alasan}`,
        '/dashboard/kegiatan',
        ctx.user.sub,
      );
      return { message: 'Pengajuan ditolak.', data };
    }

    const data = await this.prisma.kegiatan.update({
      where: { id },
      data: {
        statusPengajuan: 'DISETUJUI',
        alasanTolak: null,
        tampilSampai: tampilSampaiDari(dto.durasiHari),
        updateBy: ctx.user.nama,
        updatedAt: new Date(),
      },
    });
    await this.audit.catat(ctx.user.sub, 'kegiatan.setujui', {
      target: 'Kegiatan',
      targetId: id,
    });
    await this.notifikasiService.kirimKePermission(
      'kegiatan.ajukan',
      kegiatan.area,
      'PENGAJUAN_DISETUJUI',
      'Pengajuan Kegiatan Disetujui',
      `Kegiatan "${kegiatan.judul}" disetujui RW dan kini tampil ke seluruh warga.`,
      '/dashboard/kegiatan',
      ctx.user.sub,
    );
    if (kegiatan.status === 'active') {
      await this.notifikasiService.kirimKePermission(
        'kegiatan.read',
        'RW',
        'KEGIATAN_BARU',
        'Kegiatan Baru',
        kegiatan.judul,
        '/dashboard',
        ctx.user.sub,
      );
    }
    return {
      message: 'Pengajuan disetujui. Kegiatan tampil ke seluruh warga.',
      data,
    };
  }
}
