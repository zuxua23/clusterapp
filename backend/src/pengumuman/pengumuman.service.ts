import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Area, Prisma, StatusPengajuan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePengumumanDto } from './dto/create-pengumuman.dto';
import { UpdatePengumumanDto } from './dto/update-pengumuman.dto';
import { UpdateStatusPengumumanDto } from './dto/update-status-pengumuman.dto';
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
  filePengumuman: true,
  keteranganPengumuman: true,
  createDate: true,
  status: true,
  area: true,
} satisfies Prisma.PengumumanSelect;

@Injectable()
export class PengumumanService {
  constructor(
    private prisma: PrismaService,
    private notifikasiService: NotifikasiService,
    private permissions: PermissionsService,
    private audit: AuditService,
    private files: FileService,
  ) {}

  private async bolehApprove(ctx: AccessContext) {
    return (
      (await this.permissions.scopeOf(
        ctx.user.roleId,
        'pengumuman.approve',
      )) !== null
    );
  }

  // ================================================================
  // CRUD
  // ================================================================

  async create(
    ctx: AccessContext,
    dto: CreatePengumumanDto,
    file?: Express.Multer.File,
  ) {
    const area: Area = areaFilter(ctx) ?? dto.area ?? ctx.user.area ?? 'RW';
    const approver = await this.bolehApprove(ctx);

    const filePengumuman = file
      ? await this.files.simpan(file, { publik: true })
      : undefined;
    const data = await this.prisma.pengumuman.create({
      data: {
        judul: dto.judul,
        keteranganPengumuman: dto.keteranganPengumuman,
        status: dto.status,
        filePengumuman,
        area,
        createBy: ctx.user.nama,
        ...(approver && { tampilSampai: tampilSampaiDari(dto.durasiHari) }),
      },
    });

    if (data.status === 'active') {
      await this.notifikasiService.kirimKePermission(
        'pengumuman.read',
        data.area,
        'PENGUMUMAN_BARU',
        'Pengumuman Baru',
        data.judul,
        '/dashboard',
        ctx.user.sub,
      );
    }

    return { message: 'Pengumuman berhasil dibuat', data };
  }

  findAll(
    ctx: AccessContext,
    params: { pengajuan?: string; area?: string } = {},
  ) {
    const and: Prisma.PengumumanWhereInput[] = [
      { isDelete: false },
      visibilitasKelolaWhere(ctx),
    ];
    if (params.pengajuan)
      and.push({ statusPengajuan: params.pengajuan as StatusPengajuan });
    if (params.area && ctx.scope === 'ALL')
      and.push({ area: params.area as Area });
    return this.prisma.pengumuman.findMany({
      where: { AND: and },
      orderBy: { createDate: 'desc' },
    });
  }

  /** Umpan dashboard warga: yang boleh dilihatnya, aktif, dan belum lewat batas tampil. */
  feed(ctx: AccessContext) {
    return this.prisma.pengumuman.findMany({
      where: {
        AND: [
          { isDelete: false, status: 'active' },
          visibilitasWhere(ctx),
          belumLewatBatasTampil(),
        ],
      },
      orderBy: { createDate: 'desc' },
      take: 20,
    });
  }

  /** Publik (landing): hanya konten level RW / yang sudah di-ACC RW. */
  findActive(scope?: 'aktif' | 'arsip') {
    if (scope === 'arsip') {
      return this.prisma.pengumuman.findMany({
        where: { isDelete: false, status: 'unactived', ...tampilKeSemua },
        orderBy: { createDate: 'desc' },
        take: 5,
        select: RINGKAS,
      });
    }
    // aktif: masih aktif (status active, tidak deleted) — berbasis status, tidak terfilter tanggal upload
    return this.prisma.pengumuman.findMany({
      where: { isDelete: false, status: 'active', ...tampilKeSemua },
      orderBy: { createDate: 'desc' },
      take: 5,
      select: RINGKAS,
    });
  }

  async findOne(ctx: AccessContext, id: number) {
    const pengumuman = await this.prisma.pengumuman.findFirst({
      where: { AND: [{ id, isDelete: false }, visibilitasWhere(ctx)] },
    });
    if (!pengumuman) {
      throw new NotFoundException(`Pengumuman dengan ID ${id} tidak ditemukan`);
    }
    return pengumuman;
  }

  private async findForWrite(ctx: AccessContext, id: number) {
    const pengumuman = await this.prisma.pengumuman.findFirst({
      where: { id, isDelete: false },
    });
    if (!pengumuman) {
      throw new NotFoundException(`Pengumuman dengan ID ${id} tidak ditemukan`);
    }
    assertInArea(ctx, pengumuman.area);
    return pengumuman;
  }

  async update(
    ctx: AccessContext,
    id: number,
    dto: UpdatePengumumanDto,
    file?: Express.Multer.File,
  ) {
    const existing = await this.findForWrite(ctx, id);
    const approver = await this.bolehApprove(ctx);

    const fileBaru = file
      ? await this.files.simpan(file, { publik: true })
      : undefined;

    const data = await this.prisma.pengumuman.update({
      where: { id },
      data: {
        judul: dto.judul,
        keteranganPengumuman: dto.keteranganPengumuman,
        status: dto.status,
        filePengumuman: fileBaru,
        updateBy: ctx.user.nama,
        updateDate: new Date(),
        ...(approver && { tampilSampai: tampilSampaiDari(dto.durasiHari) }),
        // Isi diubah setelah diajukan/disetujui: harus diajukan ulang.
        ...(!approver &&
          (existing.statusPengajuan === 'DIAJUKAN' ||
            existing.statusPengajuan === 'DISETUJUI') && {
            statusPengajuan: 'TIDAK' as const,
            alasanTolak: null,
          }),
      },
    });

    if (fileBaru) await this.files.hapus(existing.filePengumuman);

    return { message: 'Pengumuman berhasil diperbarui', data };
  }

  async updateStatus(
    ctx: AccessContext,
    id: number,
    dto: UpdateStatusPengumumanDto,
  ) {
    await this.findForWrite(ctx, id);

    const data = await this.prisma.pengumuman.update({
      where: { id },
      data: {
        status: dto.status,
        updateBy: ctx.user.nama,
        updateDate: new Date(),
      },
    });

    return { message: 'Status pengumuman berhasil diperbarui', data };
  }

  async remove(ctx: AccessContext, id: number) {
    await this.findForWrite(ctx, id);

    await this.prisma.pengumuman.update({
      where: { id },
      data: { isDelete: true, updateBy: ctx.user.nama, updateDate: new Date() },
    });

    return { message: 'Pengumuman berhasil dihapus' };
  }

  // ================================================================
  // PENGAJUAN TAMPIL KE SELURUH RW
  // ================================================================

  async ajukan(ctx: AccessContext, id: number) {
    const pengumuman = await this.findForWrite(ctx, id);
    if (pengumuman.area === 'RW') {
      throw new BadRequestException(
        'Pengumuman level RW sudah tampil ke seluruh warga.',
      );
    }
    if (
      pengumuman.statusPengajuan === 'DIAJUKAN' ||
      pengumuman.statusPengajuan === 'DISETUJUI'
    ) {
      throw new BadRequestException('Pengumuman ini sudah diajukan.');
    }

    const data = await this.prisma.pengumuman.update({
      where: { id },
      data: {
        statusPengajuan: 'DIAJUKAN',
        alasanTolak: null,
        updateBy: ctx.user.nama,
        updateDate: new Date(),
      },
    });

    await this.notifikasiService.kirimKePermission(
      'pengumuman.approve',
      'RW',
      'PENGAJUAN_MASUK',
      'Pengajuan Pengumuman',
      `${pengumuman.area.replace('_', ' ')} mengajukan pengumuman "${pengumuman.judul}" untuk ditampilkan ke seluruh warga.`,
      '/dashboard/pengumuman',
      ctx.user.sub,
    );

    return { message: 'Pengumuman diajukan ke RW untuk disetujui.', data };
  }

  async putuskanPengajuan(
    ctx: AccessContext,
    id: number,
    dto: KeputusanPengajuanDto,
  ) {
    const pengumuman = await this.prisma.pengumuman.findFirst({
      where: { id, isDelete: false },
    });
    if (!pengumuman)
      throw new NotFoundException(`Pengumuman dengan ID ${id} tidak ditemukan`);
    assertInArea(ctx, pengumuman.area);
    if (pengumuman.statusPengajuan !== 'DIAJUKAN') {
      throw new BadRequestException('Pengumuman ini tidak sedang diajukan.');
    }

    if (dto.action === 'TOLAK') {
      if (!dto.alasan?.trim())
        throw new BadRequestException('Alasan penolakan wajib diisi.');
      const data = await this.prisma.pengumuman.update({
        where: { id },
        data: {
          statusPengajuan: 'DITOLAK',
          alasanTolak: dto.alasan,
          updateBy: ctx.user.nama,
          updateDate: new Date(),
        },
      });
      await this.audit.catat(ctx.user.sub, 'pengumuman.tolak', {
        target: 'Pengumuman',
        targetId: id,
        keterangan: dto.alasan,
      });
      await this.notifikasiService.kirimKePermission(
        'pengumuman.ajukan',
        pengumuman.area,
        'PENGAJUAN_DITOLAK',
        'Pengajuan Pengumuman Ditolak',
        `Pengajuan pengumuman "${pengumuman.judul}" ditolak RW. Alasan: ${dto.alasan}`,
        '/dashboard/pengumuman',
        ctx.user.sub,
      );
      return { message: 'Pengajuan ditolak.', data };
    }

    const data = await this.prisma.pengumuman.update({
      where: { id },
      data: {
        statusPengajuan: 'DISETUJUI',
        alasanTolak: null,
        tampilSampai: tampilSampaiDari(dto.durasiHari),
        updateBy: ctx.user.nama,
        updateDate: new Date(),
      },
    });
    await this.audit.catat(ctx.user.sub, 'pengumuman.setujui', {
      target: 'Pengumuman',
      targetId: id,
    });
    await this.notifikasiService.kirimKePermission(
      'pengumuman.ajukan',
      pengumuman.area,
      'PENGAJUAN_DISETUJUI',
      'Pengajuan Pengumuman Disetujui',
      `Pengumuman "${pengumuman.judul}" disetujui RW dan kini tampil ke seluruh warga.`,
      '/dashboard/pengumuman',
      ctx.user.sub,
    );
    if (pengumuman.status === 'active') {
      await this.notifikasiService.kirimKePermission(
        'pengumuman.read',
        'RW',
        'PENGUMUMAN_BARU',
        'Pengumuman Baru',
        pengumuman.judul,
        '/dashboard',
        ctx.user.sub,
      );
    }
    return {
      message: 'Pengajuan disetujui. Pengumuman tampil ke seluruh warga.',
      data,
    };
  }
}
