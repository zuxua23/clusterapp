import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Area } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FileService } from '../common/file/file.service';
import { AuthUser } from '../auth/auth.types';
import { LEVEL_ADMIN, LEVEL_WARGA } from '../common/helpers';
import { AssignPengurusDto, VacatePengurusDto } from './rbac.dto';

const AREA_RT: Area[] = ['RT_01', 'RT_02', 'RT_03', 'RT_04'];
const label = (a: Area) => a.replace('_', ' ');

/** Area yang valid untuk sebuah role: level 1 = RW, level 2 = tiap RT. */
function areaUntukLevel(level: number): Area[] {
  if (level === 1) return ['RW'];
  if (level === 2) return AREA_RT;
  return [];
}

@Injectable()
export class PengurusService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private files: FileService,
  ) {}

  private async roleWarga() {
    const role = await this.prisma.role.findFirst({
      where: { level: LEVEL_WARGA, isSystem: true },
    });
    if (!role)
      throw new BadRequestException(
        'Peran warga belum tersedia. Jalankan seed database.',
      );
    return role;
  }

  // ================================================================
  // DATA PUBLIK — susunan pengurus untuk landing page (tanpa login)
  // ================================================================

  /** Ketua/Sekretaris/Bendahara RW + Ketua RT 01-04. Dipakai landing page, jadi tidak membawa kontak pribadi. */
  async publik() {
    const kodeRW = ['KETUA_RW', 'SEKRE_RW', 'BENDAHARA_RW'];
    const roles = await this.prisma.role.findMany({
      where: { kode: { in: [...kodeRW, 'KETUA_RT'] } },
    });
    const roleKetuaRt = roles.find((r) => r.kode === 'KETUA_RT');

    const slots = [
      ...kodeRW
        .map((kode) => roles.find((r) => r.kode === kode))
        .filter((role): role is NonNullable<typeof role> => !!role)
        .map((role) => ({ role, area: 'RW' as const, jabatan: role.nama })),
      ...(roleKetuaRt
        ? AREA_RT.map((area) => ({
            role: roleKetuaRt,
            area,
            jabatan: `Ketua ${label(area)}`,
          }))
        : []),
    ];

    const pemegang = await this.prisma.user.findMany({
      where: { OR: slots.map((s) => ({ roleId: s.role.id, area: s.area })) },
      select: {
        namaUser: true,
        foto: true,
        kontakPublik: true,
        roleId: true,
        area: true,
      },
    });

    return slots.map((s) => {
      const p = pemegang.find(
        (x) => x.roleId === s.role.id && x.area === s.area,
      );
      return {
        kode: s.role.kode,
        area: s.area,
        jabatan: s.jabatan,
        nama: p?.namaUser ?? null,
        foto: p?.foto ?? null,
        kontak: p?.kontakPublik ?? null,
      };
    });
  }

  // ================================================================
  // DAFTAR JABATAN — tiap role RW/RT x area, beserta pemegangnya
  // ================================================================

  async slots() {
    const roles = await this.prisma.role.findMany({
      where: { level: { in: [1, 2] } },
      orderBy: [{ level: 'asc' }, { id: 'asc' }],
    });
    const pemegang = await this.prisma.user.findMany({
      where: { roleId: { in: roles.map((r) => r.id) } },
      select: {
        id: true,
        namaUser: true,
        username: true,
        noTelp: true,
        foto: true,
        kontakPublik: true,
        roleId: true,
        area: true,
      },
    });

    return roles.flatMap((role) =>
      areaUntukLevel(role.level).map((area) => ({
        role: {
          id: role.id,
          kode: role.kode,
          nama: role.nama,
          level: role.level,
        },
        area,
        pemegang:
          pemegang.find((p) => p.roleId === role.id && p.area === area) ?? null,
      })),
    );
  }

  /** Calon pemegang jabatan: warga biasa. Untuk jabatan RT, hanya warga RT itu. */
  kandidat(area?: Area) {
    return this.prisma.user.findMany({
      where: {
        role: { level: LEVEL_WARGA },
        ...(area && area !== 'RW' && { area }),
      },
      select: {
        id: true,
        namaUser: true,
        username: true,
        area: true,
        rumah: {
          where: { isDelete: false },
          select: { blokRumah: true },
          take: 3,
        },
      },
      orderBy: { namaUser: 'asc' },
    });
  }

  // ================================================================
  // FOTO PENGURUS
  // ================================================================

  /** Pemegang jabatan RW/RT; warga biasa & admin tidak punya foto pengurus. */
  private async pemegangJabatan(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        namaUser: true,
        foto: true,
        role: { select: { level: true } },
      },
    });
    if (!user) throw new NotFoundException('Pengurus tidak ditemukan.');
    if (user.role.level === LEVEL_ADMIN || user.role.level === LEVEL_WARGA) {
      throw new BadRequestException(
        `${user.namaUser} bukan pemegang jabatan pengurus.`,
      );
    }
    return user;
  }

  async setFoto(actor: AuthUser, userId: number, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('File foto wajib diunggah.');
    const user = await this.pemegangJabatan(userId);

    // Foto pengurus tampil di landing page, jadi bertanda publik (GET /files/:id).
    const fotoId = await this.files.simpan(file, { publik: true });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { foto: fotoId },
    });
    await this.files.hapus(user.foto);

    await this.audit.catat(actor.sub, 'pengurus.foto', {
      target: 'User',
      targetId: user.id,
      keterangan: `Foto ${user.namaUser} diperbarui`,
    });
    return {
      message: `Foto ${user.namaUser} berhasil disimpan.`,
      foto: fotoId,
    };
  }

  /** Normalisasi ke format 62xxxxxxxxxx (dipakai langsung oleh tautan wa.me). */
  private normalisasiNomor(nomor: string) {
    return nomor.replace(/^\+?62/, '62').replace(/^0/, '62');
  }

  async setKontak(actor: AuthUser, userId: number, kontak?: string | null) {
    const user = await this.pemegangJabatan(userId);
    const nomor = kontak ? this.normalisasiNomor(kontak) : null;

    await this.prisma.user.update({
      where: { id: user.id },
      data: { kontakPublik: nomor },
    });

    await this.audit.catat(actor.sub, 'pengurus.kontak', {
      target: 'User',
      targetId: user.id,
      keterangan: nomor
        ? `Kontak publik ${user.namaUser} diatur`
        : `Kontak publik ${user.namaUser} dihapus`,
    });
    return {
      message: nomor
        ? `Kontak ${user.namaUser} kini tampil di halaman depan.`
        : `Kontak ${user.namaUser} tidak lagi tampil di halaman depan.`,
      kontak: nomor,
    };
  }

  async hapusFoto(actor: AuthUser, userId: number) {
    const user = await this.pemegangJabatan(userId);
    if (!user.foto)
      throw new BadRequestException('Pengurus ini belum punya foto.');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { foto: null },
    });
    await this.files.hapus(user.foto);

    await this.audit.catat(actor.sub, 'pengurus.foto', {
      target: 'User',
      targetId: user.id,
      keterangan: `Foto ${user.namaUser} dihapus`,
    });
    return { message: `Foto ${user.namaUser} dihapus.` };
  }

  // ================================================================
  // TETAPKAN / KOSONGKAN JABATAN
  // ================================================================

  /** Kembalikan pemegang lama jadi warga di RT tempat rumahnya berada. */
  private async kembalikanJadiWarga(
    tx: Pick<PrismaService, 'user' | 'rumah'>,
    userId: number,
    warga: { id: number },
    areaCadangan: Area | null,
  ) {
    const rumah = await tx.rumah.findFirst({
      where: { userId, isDelete: false },
      select: { rt: true },
      orderBy: { id: 'asc' },
    });
    await tx.user.update({
      where: { id: userId },
      // kontakPublik dikosongkan: publikasi nomor itu izin untuk jabatan ini, bukan untuk selamanya.
      data: {
        roleId: warga.id,
        area: rumah?.rt ?? areaCadangan,
        kontakPublik: null,
      },
    });
  }

  async assign(actor: AuthUser, dto: AssignPengurusDto) {
    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
    });
    if (!role) throw new NotFoundException('Peran tidak ditemukan.');
    if (role.level === LEVEL_ADMIN || role.level === LEVEL_WARGA) {
      throw new BadRequestException('Peran ini bukan jabatan pengurus.');
    }
    if (!areaUntukLevel(role.level).includes(dto.area)) {
      throw new BadRequestException(
        `${role.nama} hanya valid untuk ${role.level === 1 ? 'RW' : 'RT 1-4'}.`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      include: { role: true },
    });
    if (!user) throw new NotFoundException('Warga tidak ditemukan.');
    if (user.role.level !== LEVEL_WARGA) {
      throw new BadRequestException(
        `${user.namaUser} sudah menjabat sebagai ${user.role.nama}. Kosongkan jabatannya dulu.`,
      );
    }
    // Pengurus RT harus warga RT itu sendiri.
    if (role.level === 2 && user.area !== dto.area) {
      throw new BadRequestException(
        `${user.namaUser} bukan warga ${label(dto.area)}.`,
      );
    }

    const warga = await this.roleWarga();
    const lama = await this.prisma.user.findFirst({
      where: { roleId: role.id, area: dto.area },
      select: { id: true, namaUser: true },
    });

    await this.prisma.$transaction(async (tx) => {
      // Satu jabatan satu orang per area: pemegang lama otomatis kembali jadi warga.
      if (lama) await this.kembalikanJadiWarga(tx, lama.id, warga, dto.area);
      await tx.user.update({
        where: { id: user.id },
        data: { roleId: role.id, area: dto.area },
      });
    });

    await this.audit.catat(actor.sub, 'pengurus.tetapkan', {
      target: 'User',
      targetId: user.id,
      keterangan: `${user.namaUser} -> ${role.nama} ${label(dto.area)}${lama ? ` (menggantikan ${lama.namaUser})` : ''}`,
    });

    return {
      message: `${user.namaUser} kini menjabat ${role.nama} ${label(dto.area)}.${lama ? ` ${lama.namaUser} kembali menjadi warga.` : ''}`,
    };
  }

  async vacate(actor: AuthUser, dto: VacatePengurusDto) {
    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
    });
    if (!role) throw new NotFoundException('Peran tidak ditemukan.');

    const pemegang = await this.prisma.user.findFirst({
      where: { roleId: role.id, area: dto.area },
      select: { id: true, namaUser: true },
    });
    if (!pemegang)
      throw new BadRequestException(
        'Jabatan ini memang belum ada pemegangnya.',
      );

    const warga = await this.roleWarga();
    await this.prisma.$transaction((tx) =>
      this.kembalikanJadiWarga(
        tx,
        pemegang.id,
        warga,
        dto.area === 'RW' ? null : dto.area,
      ),
    );

    await this.audit.catat(actor.sub, 'pengurus.kosongkan', {
      target: 'User',
      targetId: pemegang.id,
      keterangan: `${pemegang.namaUser} dilepas dari ${role.nama} ${label(dto.area)}`,
    });
    return {
      message: `${pemegang.namaUser} dilepas dari jabatan ${role.nama} ${label(dto.area)}.`,
    };
  }
}
