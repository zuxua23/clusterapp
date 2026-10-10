import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  RT,
  StatusPembayaran,
  StatusPendaftaran,
  StatusRumah,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { NotifikasiService } from '../notifikasi/notifikasi.service';
import { AuditService } from '../audit/audit.service';
import { FileService } from '../common/file/file.service';
import { SALT_ROUNDS } from '../auth/auth.service';
import { AccessContext } from '../auth/auth.types';
import { PermissionsService } from '../auth/permissions.service';
import { labelBulan, resolvePeriode } from '../common/periode.helper';
import {
  areaFilter,
  assertInArea,
  rtFilter,
  wargaBacaWhere,
} from '../common/scope.helper';
import {
  generatePassword,
  LEVEL_WARGA,
  totalTagihan,
  withTotal,
} from '../common/helpers';
import { CreateWargaDto } from './dto/create-warga.dto';
import { UpdateWargaDto } from './dto/update-warga.dto';
import { CreateRumahDto } from './dto/create-rumah.dto';
import { UpdateRumahDto } from './dto/update-rumah.dto';
import { DaftarMandiriDto } from './dto/daftar-mandiri.dto';

const SEMUA_RT: RT[] = ['RT_01', 'RT_02', 'RT_03', 'RT_04'];

export interface RingkasanRumah {
  id: number;
  blokRumah: string;
  rt: RT;
  nominal: number;
  status: StatusPembayaran;
}

export interface RingkasanPeriode {
  bulan: string;
  tahun: string;
  label: string;
  totalNominal: number;
  totalTagihan: number;
  lunas: number;
  belumLunas: number;
  menunggu: number;
  rumah: RingkasanRumah[];
}

const RUMAH_SELECT = {
  id: true,
  rt: true,
  blokRumah: true,
  status: true,
  userId: true,
} satisfies Prisma.RumahSelect;

// Password tidak pernah ikut keluar dari service ini.
const WARGA_SELECT = {
  id: true,
  namaUser: true,
  username: true,
  email: true,
  noTelp: true,
  area: true,
  wajibGantiPassword: true,
  createAt: true,
  role: { select: { kode: true, nama: true, level: true } },
  rumah: {
    where: { isDelete: false },
    orderBy: [{ rt: 'asc' }, { blokRumah: 'asc' }],
    select: RUMAH_SELECT,
  },
} satisfies Prisma.UserSelect;

const PENGHUNI_SELECT = {
  id: true,
  namaUser: true,
  username: true,
  email: true,
  noTelp: true,
  area: true,
  _count: { select: { rumah: { where: { isDelete: false } } } },
} satisfies Prisma.UserSelect;

@Injectable()
export class WargaService {
  constructor(
    private prisma: PrismaService,
    private notifikasiService: NotifikasiService,
    private audit: AuditService,
    private files: FileService,
    private permissions: PermissionsService,
  ) {}

  // ================================================================
  // PORTAL WARGA — tagihan & pembayaran milik sendiri
  // ================================================================

  /** OWN: diri sendiri. AREA: warga areanya. ALL: semua. Data milik sendiri selalu lolos. */
  private async assertBolehLihatUser(ctx: AccessContext, targetUserId: number) {
    if (targetUserId === ctx.user.sub) return;
    if (ctx.scope === 'ALL') return;
    if (ctx.scope === 'OWN') {
      throw new ForbiddenException(
        'Anda hanya dapat melihat data milik sendiri.',
      );
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { area: true },
    });
    if (!target) throw new NotFoundException('Warga tidak ditemukan');
    assertInArea(ctx, target.area);
  }

  async getRumahByUser(ctx: AccessContext, userId: number) {
    await this.assertBolehLihatUser(ctx, userId);
    return this.prisma.rumah.findMany({
      where: { userId, isDelete: false },
      orderBy: [{ rt: 'asc' }, { blokRumah: 'asc' }],
    });
  }

  /** Semua tagihan IPL untuk 1 rumah, diurutkan terbaru di atas */
  async getTagihanByRumah(ctx: AccessContext, rumahId: number) {
    const rumah = await this.prisma.rumah.findFirst({
      where: { id: rumahId, isDelete: false },
    });
    if (!rumah)
      throw new NotFoundException(`Rumah dengan ID ${rumahId} tidak ditemukan`);

    // Rumah milik sendiri selalu boleh dilihat, apa pun scope-nya (lihat catatan di
    // assertBolehLihatUser) — baru cek area kalau bukan rumah sendiri.
    if (rumah.userId !== ctx.user.sub) {
      if (ctx.scope === 'OWN') {
        throw new ForbiddenException('Rumah ini bukan milik Anda.');
      }
      assertInArea(ctx, rumah.rt);
    }

    const tagihan = await this.prisma.ipl.findMany({
      where: { idRumah: rumahId },
      include: {
        pembayaran: {
          orderBy: { tanggalBayar: 'desc' },
          take: 1,
          select: {
            idPembayaran: true,
            buktiTransaksi: true,
            tanggalBayar: true,
            tanggalKonfirmasi: true,
          },
        },
      },
      orderBy: [{ tahunPeriode: 'desc' }, { bulanPeriode: 'desc' }],
    });

    return { rumah, tagihan: tagihan.map(withTotal) };
  }

  /** Tagihan IPL gabungan semua rumah milik user.
   * Filter: bulan+tahun tunggal (legacy) atau range dari/sampai YYYY-MM (maks 12 bln),
   * plus status & search — mirror pola IplService.findAll. */
  async getTagihanByUser(
    ctx: AccessContext,
    userId: number,
    opts: {
      bulan?: string;
      tahun?: string;
      dari?: string;
      sampai?: string;
      status?: string;
      search?: string;
    },
  ) {
    await this.assertBolehLihatUser(ctx, userId);
    const { bulan, tahun: th, dari, sampai, status, search } = opts;

    const rumah = await this.prisma.rumah.findMany({
      where: { userId, isDelete: false },
      orderBy: [{ rt: 'asc' }, { blokRumah: 'asc' }],
    });

    if (rumah.length === 0) {
      return {
        rumah: [],
        tagihan: [],
        summaryByPeriode: {},
        totalSummary: null,
      };
    }

    const where: Prisma.IplWhereInput = {
      idRumah: { in: rumah.map((r) => r.id) },
    };
    const and: Prisma.IplWhereInput[] = [];
    const range = resolvePeriode(dari, sampai);
    if (range) {
      and.push({ OR: range.periodeOr });
    } else {
      if (bulan) and.push({ bulanPeriode: bulan });
      if (th) and.push({ tahunPeriode: th });
    }
    if (status && status !== 'SEMUA')
      and.push({ statusPembayaran: status as StatusPembayaran });
    if (search) {
      const q = search.trim();
      if (q) {
        const num = Number(q.replace(/[^0-9]/g, ''));
        const or: Prisma.IplWhereInput[] = [
          { bulanPeriode: { contains: q } },
          { tahunPeriode: { contains: q } },
          { rumah: { blokRumah: { contains: q } } },
        ];
        if (num) or.push({ nominalIpl: num }, { nominalKas: num });
        and.push({ OR: or });
      }
    }
    if (and.length > 0) where.AND = and;

    const rows = await this.prisma.ipl.findMany({
      where,
      include: {
        rumah: { select: { id: true, blokRumah: true, rt: true } },
        pembayaran: {
          orderBy: { tanggalBayar: 'desc' },
          take: 1,
          select: {
            idPembayaran: true,
            buktiTransaksi: true,
            tanggalBayar: true,
            tanggalKonfirmasi: true,
            nominal: true,
          },
        },
      },
      orderBy: [
        { tahunPeriode: 'desc' },
        { bulanPeriode: 'desc' },
        { rumah: { rt: 'asc' } },
        { rumah: { blokRumah: 'asc' } },
      ],
    });
    const tagihan = rows.map(withTotal);

    const summaryByPeriode: Record<string, RingkasanPeriode> = {};
    for (const t of tagihan) {
      const key = `${t.bulanPeriode}/${t.tahunPeriode}`;
      if (!summaryByPeriode[key]) {
        summaryByPeriode[key] = {
          bulan: t.bulanPeriode,
          tahun: t.tahunPeriode,
          label: `${labelBulan(t.bulanPeriode)} ${t.tahunPeriode}`,
          totalNominal: 0,
          totalTagihan: 0,
          lunas: 0,
          belumLunas: 0,
          menunggu: 0,
          rumah: [],
        };
      }
      const s = summaryByPeriode[key];
      s.totalNominal += t.nominal;
      s.totalTagihan += 1;
      if (t.statusPembayaran === 'LUNAS') s.lunas += 1;
      else if (t.statusPembayaran === 'BELUM_LUNAS') s.belumLunas += 1;
      else if (t.statusPembayaran === 'MENUNGGU_KONFIRMASI') s.menunggu += 1;
      s.rumah.push({
        id: t.rumah.id,
        blokRumah: t.rumah.blokRumah,
        rt: t.rumah.rt,
        nominal: t.nominal,
        status: t.statusPembayaran,
      });
    }

    const totalSummary = {
      totalRumah: rumah.length,
      totalTagihan: tagihan.length,
      totalNominal: tagihan.reduce((sum, t) => sum + t.nominal, 0),
      totalLunas: tagihan.filter((t) => t.statusPembayaran === 'LUNAS').length,
      totalBelumLunas: tagihan.filter(
        (t) => t.statusPembayaran === 'BELUM_LUNAS',
      ).length,
      totalMenunggu: tagihan.filter(
        (t) => t.statusPembayaran === 'MENUNGGU_KONFIRMASI',
      ).length,
    };

    return { rumah, tagihan, summaryByPeriode, totalSummary };
  }

  /** Warga mengirim bukti pembayaran untuk tagihan rumahnya sendiri. */
  async uploadBuktiPembayaran(
    ctx: AccessContext,
    data: { idIpl: number; nominal?: number; bukti?: Express.Multer.File },
  ) {
    if (!data.bukti)
      throw new BadRequestException('Bukti pembayaran wajib diunggah.');

    const ipl = await this.prisma.ipl.findUnique({
      where: { id: data.idIpl },
      include: { rumah: true },
    });
    if (!ipl) throw new NotFoundException('Tagihan tidak ditemukan');

    if (ctx.scope === 'OWN') {
      if (ipl.rumah.userId !== ctx.user.sub) {
        throw new ForbiddenException('Tagihan ini bukan milik Anda.');
      }
    } else {
      assertInArea(ctx, ipl.rumah.rt);
    }
    if (ipl.statusPembayaran === 'LUNAS') {
      throw new BadRequestException('Tagihan ini sudah lunas.');
    }
    if (ipl.statusPembayaran === 'MENUNGGU_KONFIRMASI') {
      throw new BadRequestException(
        'Bukti pembayaran untuk tagihan ini sedang menunggu konfirmasi.',
      );
    }

    const buktiId = await this.files.simpan(data.bukti);
    const pembayaran = await this.prisma
      .$transaction(async (tx) => {
        const p = await tx.pembayaranIpl.create({
          data: {
            idUser: ctx.user.sub,
            idIpl: data.idIpl,
            nominal:
              data.nominal && data.nominal > 0
                ? data.nominal
                : totalTagihan(ipl),
            buktiTransaksi: buktiId,
          },
        });
        await tx.ipl.update({
          where: { id: data.idIpl },
          data: { statusPembayaran: 'MENUNGGU_KONFIRMASI' },
        });
        return p;
      })
      .catch(async (err) => {
        // Pembayaran gagal dicatat: jangan tinggalkan bukti yatim di database.
        await this.files.hapus(buktiId);
        throw err;
      });

    // Kalau yang bayar pengurus, notifikasi ke pemegang ipl.konfirmasi_pengurus (mis.
    // Ketua RT untuk pembayaran Bendahara RT), bukan ke pemegang ipl.konfirmasi biasa —
    // supaya pemegang ipl.konfirmasi (Bendahara RT) tidak dapat notifikasi bukti bayarnya
    // sendiri saat dia yang membayar.
    const pembayarRole = await this.prisma.role.findUnique({
      where: { id: ctx.user.roleId },
      select: { level: true },
    });
    const kodePermissionNotif =
      pembayarRole && pembayarRole.level < LEVEL_WARGA
        ? 'ipl.konfirmasi_pengurus'
        : 'ipl.konfirmasi';

    await this.notifikasiService.kirimKePermission(
      kodePermissionNotif,
      ipl.rumah.rt,
      'PEMBAYARAN_MASUK',
      'Bukti Pembayaran Baru',
      `Warga blok ${ipl.rumah.blokRumah} mengirim bukti pembayaran IPL, menunggu konfirmasi.`,
      '/dashboard/iuran',
      ctx.user.sub,
    );

    return {
      message: 'Bukti pembayaran berhasil dikirim. Menunggu konfirmasi.',
      data: pembayaran,
    };
  }

  // ================================================================
  // USER / WARGA CRUD — dikerjakan pengurus RT untuk warga RT-nya
  // ================================================================

  /** Baca: semua penghuni di wilayahnya. Tulis: hanya warga biasa di areanya (pengurus diatur admin). */
  private async findWargaScoped(ctx: AccessContext, id: number, tulis = false) {
    const area = areaFilter(ctx);
    const warga = await this.prisma.user.findFirst({
      where: tulis
        ? { id, role: { level: LEVEL_WARGA }, ...(area && { area }) }
        : { AND: [{ id }, wargaBacaWhere(area)] },
      select: WARGA_SELECT,
    });
    if (!warga)
      throw new NotFoundException(`Warga dengan ID ${id} tidak ditemukan`);
    return warga;
  }

  private handleUniqueError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = error.meta?.target;
      const targetStr = Array.isArray(target) ? target.join(',') : '';
      if (targetStr.includes('email')) {
        throw new ConflictException(
          'Email ini sudah terdaftar. Gunakan email lain atau kosongkan.',
        );
      }
      throw new ConflictException(
        'Nama pengguna / no HP ini sudah terdaftar. Gunakan yang lain.',
      );
    }
    throw error;
  }

  async create(ctx: AccessContext, dto: CreateWargaDto) {
    assertInArea(ctx, dto.rt);

    const roleWarga = await this.prisma.role.findFirst({
      where: { level: LEVEL_WARGA, isSystem: true },
    });
    if (!roleWarga) {
      throw new InternalServerErrorException(
        'Peran warga belum tersedia. Jalankan seed database.',
      );
    }

    const username = (dto.username ?? dto.no_hp).trim();
    const passwordAwal = dto.password ?? generatePassword();
    const password = await bcrypt.hash(passwordAwal, SALT_ROUNDS);
    const status = dto.statusRumah ?? StatusRumah.DIHUNI_TETAP;
    const actor = ctx.user.nama;

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const rumah = await tx.rumah.findUnique({
          where: { rt_blokRumah: { rt: dto.rt, blokRumah: dto.blokRumah } },
        });
        if (!rumah || rumah.isDelete) {
          throw new NotFoundException(
            `Blok ${dto.blokRumah} di ${dto.rt.replace('_', ' ')} belum terdaftar. Minta admin menambahkan rumah ini terlebih dahulu.`,
          );
        }
        if (rumah.userId) {
          throw new ConflictException(
            `Blok ${dto.blokRumah} sudah ada pemilik/penanggung jawab lain.`,
          );
        }

        const created = await tx.user.create({
          data: {
            namaUser: dto.nama.trim(),
            username,
            email: dto.email ?? null,
            noTelp: dto.no_hp,
            password,
            roleId: roleWarga.id,
            area: dto.rt,
            wajibGantiPassword: true,
          },
          select: { id: true },
        });

        await tx.rumah.update({
          where: { id: rumah.id },
          data: {
            userId: created.id,
            status,
            isDelete: false,
            updateBy: actor,
            updateDate: new Date(),
          },
        });
        return created;
      });

      return {
        message: 'Akun warga dan data rumah berhasil dibuat!',
        data: await this.findWargaScoped(ctx, user.id),
        // Hanya dikirim bila digenerate; pengurus wajib menyampaikannya ke warga.
        ...(dto.password ? {} : { passwordAwal }),
      };
    } catch (error) {
      this.handleUniqueError(error);
    }
  }

  async findAll(
    ctx: AccessContext,
    params: { search?: string; rt?: string } = {},
  ) {
    const area = areaFilter(ctx);
    const and: Prisma.UserWhereInput[] = [
      wargaBacaWhere(area ?? (params.rt ? (params.rt as RT) : null)),
    ];
    if (params.search?.trim()) {
      const q = params.search.trim();
      and.push({
        OR: [
          { namaUser: { contains: q } },
          { username: { contains: q } },
          { noTelp: { contains: q } },
          { rumah: { some: { blokRumah: { contains: q }, isDelete: false } } },
        ],
      });
    }
    return this.prisma.user.findMany({
      where: { AND: and },
      select: WARGA_SELECT,
      orderBy: [{ area: 'asc' }, { namaUser: 'asc' }],
    });
  }

  /** Dropdown di form Tambah / Edit Rumah */
  async findAllUsers(ctx: AccessContext) {
    const area = areaFilter(ctx);
    return this.prisma.user.findMany({
      where: wargaBacaWhere(area),
      select: PENGHUNI_SELECT,
      orderBy: { namaUser: 'asc' },
    });
  }

  findOne(ctx: AccessContext, id: number) {
    return this.findWargaScoped(ctx, id);
  }

  async update(ctx: AccessContext, id: number, dto: UpdateWargaDto) {
    await this.findWargaScoped(ctx, id, true);

    try {
      await this.prisma.user.update({
        where: { id },
        data: {
          ...(dto.nama !== undefined && { namaUser: dto.nama.trim() }),
          ...(dto.no_hp !== undefined && { noTelp: dto.no_hp }),
          ...(dto.username !== undefined && { username: dto.username.trim() }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.password && {
            password: await bcrypt.hash(dto.password, SALT_ROUNDS),
            wajibGantiPassword: true,
          }),
        },
      });
    } catch (error) {
      this.handleUniqueError(error);
    }
    this.permissions.invalidateUser(id);
    return this.findWargaScoped(ctx, id);
  }

  async remove(ctx: AccessContext, id: number) {
    await this.findWargaScoped(ctx, id, true);

    // Rumah kosong pun sudah pasti terjual: akun tidak boleh dihapus selama masih
    // jadi satu-satunya pemilik/penanggung jawab rumah mana pun. Pengurus wajib
    // menunjuk pemilik pengganti dulu lewat Ubah Rumah.
    const rumahMilik = await this.prisma.rumah.findMany({
      where: { userId: id, isDelete: false },
      select: { id: true, blokRumah: true, rt: true, status: true },
    });
    if (rumahMilik.length > 0) {
      const daftar = rumahMilik
        .map((r) => `${r.blokRumah} (${r.rt.replace('_', ' ')})`)
        .join(', ');
      throw new BadRequestException(
        `Warga ini masih tercatat sebagai pemilik/penanggung jawab rumah: ${daftar}. Tunjuk pemilik pengganti dulu lewat Ubah Rumah sebelum menghapus akun.`,
      );
    }

    const [pembayaran, pengaduan] = await Promise.all([
      this.prisma.pembayaranIpl.count({ where: { idUser: id } }),
      this.prisma.pengaduan.count({ where: { idUser: id } }),
    ]);
    if (pembayaran > 0 || pengaduan > 0) {
      throw new BadRequestException(
        'Warga ini punya riwayat pembayaran/pengaduan sehingga tidak bisa dihapus. Kosongkan rumahnya bila sudah pindah.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.notifikasi.deleteMany({ where: { idUser: id } }),
      this.prisma.user.delete({ where: { id } }),
    ]);
    this.permissions.invalidateUser(id);
    await this.audit.catat(ctx.user.sub, 'warga.hapus', {
      target: 'User',
      targetId: id,
    });

    return { message: 'Warga berhasil dihapus.' };
  }

  /** Pengurus RT membuatkan password sementara untuk warga yang lupa password. */
  async resetPassword(ctx: AccessContext, id: number) {
    const warga = await this.findWargaScoped(ctx, id, true);

    const passwordSementara = generatePassword();
    await this.prisma.user.update({
      where: { id },
      data: {
        password: await bcrypt.hash(passwordSementara, SALT_ROUNDS),
        wajibGantiPassword: true,
      },
    });
    this.permissions.invalidateUser(id);
    await this.audit.catat(ctx.user.sub, 'warga.reset_password', {
      target: 'User',
      targetId: id,
      keterangan: `Atur ulang kata sandi ${warga.namaUser} (${warga.username})`,
    });

    return {
      message: `Kata sandi ${warga.namaUser} berhasil diatur ulang. Sampaikan kata sandi sementara ini ke warga.`,
      passwordSementara,
    };
  }

  // ================================================================
  // RUMAH / BLOK RUMAH
  // ================================================================

  /** DIHUNI_* wajib ada pemilik; KOSONG boleh ada/tidak (userId null = pemilik belum punya akun). */
  private resolveStatus(
    userId: number | null,
    status?: StatusRumah,
  ): StatusRumah {
    if (status === 'KOSONG') {
      return StatusRumah.KOSONG;
    }
    if (status === 'DIHUNI_KONTRAK' || status === 'DIHUNI_TETAP') {
      if (!userId) {
        throw new BadRequestException(
          'Rumah berstatus dihuni harus memiliki pemilik/penghuni.',
        );
      }
      return status;
    }
    // Status tidak diisi: ikuti kepemilikan (ada pemilik -> tetap, tanpa pemilik -> kosong).
    return userId ? StatusRumah.DIHUNI_TETAP : StatusRumah.KOSONG;
  }

  private async assertPenghuniBoleh(ctx: AccessContext, userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, area: true },
    });
    if (!user)
      throw new NotFoundException(`User dengan ID ${userId} tidak ditemukan`);
    assertInArea(ctx, user.area);
  }

  async findAllRumah(ctx: AccessContext) {
    const area = areaFilter(ctx);
    return this.prisma.rumah.findMany({
      where: { isDelete: false, ...rtFilter(area) },
      include: { penghuni: { select: PENGHUNI_SELECT } },
      orderBy: [{ rt: 'asc' }, { blokRumah: 'asc' }],
    });
  }

  async createRumah(ctx: AccessContext, dto: CreateRumahDto) {
    assertInArea(ctx, dto.rt);
    const userId = dto.userId ?? null;
    if (userId) await this.assertPenghuniBoleh(ctx, userId);
    const status = this.resolveStatus(userId, dto.status);

    const existing = await this.prisma.rumah.findUnique({
      where: { rt_blokRumah: { rt: dto.rt, blokRumah: dto.blokRumah } },
    });
    if (existing && !existing.isDelete) {
      throw new ConflictException(
        `Blok ${dto.blokRumah} di ${dto.rt.replace('_', ' ')} sudah terdaftar.`,
      );
    }

    const include = { penghuni: { select: PENGHUNI_SELECT } };
    // Blok yang pernah dihapus (soft delete) dihidupkan lagi, karena kombinasi RT+blok unik.
    if (existing) {
      const revived = await this.prisma.rumah.update({
        where: { id: existing.id },
        data: {
          userId,
          status,
          isDelete: false,
          updateBy: ctx.user.nama,
          updateDate: new Date(),
        },
        include,
      });
      await this.audit.catat(ctx.user.sub, 'rumah.ubah_status', {
        target: 'Rumah',
        targetId: existing.id,
        keterangan: `Blok ${existing.blokRumah} (${dto.rt.replace('_', ' ')}) diaktifkan lagi: ${status}${userId ? '' : ' (tanpa pemilik)'}`,
      });
      return revived;
    }
    const created = await this.prisma.rumah.create({
      data: {
        rt: dto.rt,
        blokRumah: dto.blokRumah,
        userId,
        status,
        createBy: ctx.user.nama,
      },
      include,
    });
    await this.audit.catat(ctx.user.sub, 'rumah.ubah_status', {
      target: 'Rumah',
      targetId: created.id,
      keterangan: `Blok ${dto.blokRumah} (${dto.rt.replace('_', ' ')}) didaftarkan: ${status}${userId ? '' : ' (tanpa pemilik)'}`,
    });
    return created;
  }

  async updateRumah(ctx: AccessContext, id: number, dto: UpdateRumahDto) {
    const existing = await this.prisma.rumah.findFirst({
      where: { id, isDelete: false },
    });
    if (!existing)
      throw new NotFoundException(`Rumah dengan ID ${id} tidak ditemukan`);
    assertInArea(ctx, existing.rt);
    if (dto.rt) assertInArea(ctx, dto.rt);

    const userId = dto.userId !== undefined ? dto.userId : existing.userId;
    if (dto.userId) await this.assertPenghuniBoleh(ctx, dto.userId);

    // Status eksplisit dari klien menang; kalau penghuni berubah tanpa status, ikuti penghuni.
    const statusDiminta =
      dto.status ??
      (dto.userId !== undefined &&
      (dto.userId === null) !== (existing.userId === null)
        ? undefined
        : existing.status);
    const status = this.resolveStatus(userId, statusDiminta);

    try {
      const updated = await this.prisma.rumah.update({
        where: { id },
        data: {
          ...(dto.blokRumah !== undefined && { blokRumah: dto.blokRumah }),
          ...(dto.rt !== undefined && { rt: dto.rt }),
          userId,
          status,
          updateBy: ctx.user.nama,
          updateDate: new Date(),
        },
        include: { penghuni: { select: PENGHUNI_SELECT } },
      });
      // Jejak audit anti-kecurangan: perubahan status/pemilik selalu tercatat.
      // Flip ke KOSONG diteruskan ke pimpinan RW karena porsi IPL rumah itu
      // berhenti disetor ke RW dan masuk kas RT.
      if (existing.status !== status || existing.userId !== userId) {
        const rtLabel = (existing.rt as string).replace('_', ' ');
        await this.audit.catat(ctx.user.sub, 'rumah.ubah_status', {
          target: 'Rumah',
          targetId: id,
          keterangan: `Blok ${existing.blokRumah} (${rtLabel}): ${existing.status}${existing.userId ? '' : ' (tanpa pemilik)'} -> ${status}${userId ? '' : ' (tanpa pemilik)'}`,
        });
        if (status === 'KOSONG' && existing.status !== 'KOSONG') {
          await this.notifikasiService.kirimKePermissionAreaPersis(
            'setoran.read',
            'RW',
            'PERUBAHAN_DATA',
            'Rumah Diubah Kosong',
            `${ctx.user.nama} mengubah blok ${existing.blokRumah} (${rtLabel}) dari ${existing.status} menjadi KOSONG. Tagihan rumah ini masuk kas RT dan tidak disetor ke RW.`,
            '/dashboard/warga/blok-rumah',
            ctx.user.sub,
          );
        }
      }
      return updated;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Blok rumah tersebut sudah terdaftar di RT ini.',
        );
      }
      throw error;
    }
  }

  async removeRumah(ctx: AccessContext, id: number) {
    const existing = await this.prisma.rumah.findFirst({
      where: { id, isDelete: false },
    });
    if (!existing)
      throw new NotFoundException(`Rumah dengan ID ${id} tidak ditemukan`);
    assertInArea(ctx, existing.rt);

    await this.prisma.rumah.update({
      where: { id },
      data: {
        isDelete: true,
        userId: null,
        status: 'KOSONG',
        updateBy: ctx.user.nama,
        updateDate: new Date(),
      },
    });
    return { message: 'Rumah berhasil dihapus.' };
  }

  // REGISTRASI MANDIRI — pendaftaran publik, disetujui pengurus RT (warga.approve_registrasi).

  /** Publik: rumah KOSONG yang pemiliknya belum punya akun, untuk form register. */
  async getRumahKosong(rt: string) {
    if (!SEMUA_RT.includes(rt as RT)) {
      throw new BadRequestException('RT tidak valid.');
    }
    return this.prisma.rumah.findMany({
      where: { rt: rt as RT, isDelete: false, status: 'KOSONG', userId: null },
      select: { id: true, blokRumah: true },
      orderBy: { blokRumah: 'asc' },
    });
  }

  async daftarMandiri(dto: DaftarMandiriDto) {
    const rumah = await this.prisma.rumah.findFirst({
      where: {
        id: dto.rumahId,
        rt: dto.rt,
        isDelete: false,
        status: 'KOSONG',
        userId: null,
      },
    });
    if (!rumah) {
      throw new BadRequestException(
        'Rumah yang dipilih tidak tersedia lagi. Muat ulang halaman dan pilih blok lain.',
      );
    }

    const [userDuplikat, pendaftaranDuplikat] = await Promise.all([
      this.prisma.user.findFirst({
        where: {
          OR: [
            { username: dto.noTelp },
            ...(dto.email ? [{ email: dto.email }] : []),
          ],
        },
        select: { id: true },
      }),
      this.prisma.pendaftaranWarga.findFirst({
        where: { noTelp: dto.noTelp, status: 'PENDING' },
        select: { id: true },
      }),
    ]);
    if (userDuplikat) {
      throw new ConflictException(
        'Nomor HP atau email ini sudah terdaftar sebagai akun.',
      );
    }
    if (pendaftaranDuplikat) {
      throw new ConflictException(
        'Nomor HP ini sudah punya pendaftaran yang masih menunggu persetujuan pengurus.',
      );
    }

    const password = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const pendaftaran = await this.prisma.pendaftaranWarga.create({
      data: {
        namaUser: dto.namaUser.trim(),
        noTelp: dto.noTelp.trim(),
        email: dto.email ?? null,
        password,
        rt: dto.rt,
        rumahId: dto.rumahId,
      },
    });

    // Area di sini selalu RT (tidak pernah 'RW'), jadi kirimKePermission biasa sudah
    // mencocokkan area persis — lihat catatan seluruhRw di NotifikasiService.
    await this.notifikasiService.kirimKePermission(
      'warga.approve_registrasi',
      dto.rt,
      'PENDAFTARAN_BARU',
      'Pendaftaran Warga Baru',
      `${pendaftaran.namaUser} mendaftar untuk blok ${rumah.blokRumah}, menunggu persetujuan.`,
      '/dashboard/warga',
    );

    return {
      message:
        'Pendaftaran berhasil dikirim. Menunggu persetujuan pengurus RT.',
    };
  }

  /** Pengurus: daftar pendaftaran di area-nya (default hanya yang masih Menunggu). */
  async getPendaftaran(ctx: AccessContext, status?: string) {
    const area = areaFilter(ctx);
    return this.prisma.pendaftaranWarga.findMany({
      where: {
        ...(area !== null && { rt: area as RT }),
        status: (status && status !== 'SEMUA'
          ? status
          : 'PENDING') as StatusPendaftaran,
      },
      // Tanpa kolom password (hash) — jangan pernah dikirim ke klien.
      select: {
        id: true,
        namaUser: true,
        noTelp: true,
        email: true,
        rt: true,
        rumahId: true,
        status: true,
        alasanTolak: true,
        diprosesOleh: true,
        diprosesAt: true,
        createdAt: true,
        rumah: { select: { id: true, blokRumah: true, rt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findPendaftaranScoped(ctx: AccessContext, id: number) {
    const pendaftaran = await this.prisma.pendaftaranWarga.findUnique({
      where: { id },
    });
    if (!pendaftaran)
      throw new NotFoundException(
        `Pendaftaran dengan ID ${id} tidak ditemukan`,
      );
    assertInArea(ctx, pendaftaran.rt);
    if (pendaftaran.status !== 'PENDING') {
      throw new BadRequestException(
        'Pendaftaran ini sudah diproses sebelumnya.',
      );
    }
    return pendaftaran;
  }

  async setujuiPendaftaran(
    ctx: AccessContext,
    id: number,
    statusHunian?: StatusRumah,
  ) {
    const pendaftaran = await this.findPendaftaranScoped(ctx, id);
    // Default KOSONG: pendaftar umumnya pemilik rumah kosong yang tetap tidak
    // menempati rumahnya (tetap ditagih IPL, masuk kas RT). Pengurus dapat
    // memilih DIHUNI_* bila pendaftar langsung menempati rumah tersebut.
    const statusAwal: StatusRumah = statusHunian ?? StatusRumah.KOSONG;

    const roleWarga = await this.prisma.role.findFirst({
      where: { level: LEVEL_WARGA, isSystem: true },
    });
    if (!roleWarga) {
      throw new InternalServerErrorException(
        'Peran warga belum tersedia. Jalankan seed database.',
      );
    }

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        // Cek ulang rumah masih kosong — bisa saja sudah diisi pengurus lewat menu Data
        // Warga sejak pendaftaran ini masuk.
        const rumah = await tx.rumah.findUnique({
          where: { id: pendaftaran.rumahId },
        });
        if (!rumah || rumah.isDelete || rumah.userId) {
          throw new ConflictException(
            'Rumah yang dipilih sudah terisi warga lain. Tolak pendaftaran ini dan minta warga mendaftar ulang.',
          );
        }

        const created = await tx.user.create({
          data: {
            namaUser: pendaftaran.namaUser,
            username: pendaftaran.noTelp,
            email: pendaftaran.email,
            noTelp: pendaftaran.noTelp,
            password: pendaftaran.password, // sudah di-hash sejak daftarMandiri()
            roleId: roleWarga.id,
            area: pendaftaran.rt,
            wajibGantiPassword: false, // password sudah dipilih sendiri, bukan sementara
          },
          select: { id: true },
        });

        await tx.rumah.update({
          where: { id: rumah.id },
          data: {
            userId: created.id,
            status: statusAwal,
            updateBy: ctx.user.nama,
            updateDate: new Date(),
          },
        });

        await tx.pendaftaranWarga.update({
          where: { id: pendaftaran.id },
          data: {
            status: 'DISETUJUI',
            diprosesOleh: ctx.user.nama,
            diprosesAt: new Date(),
          },
        });

        return created;
      });

      return {
        message: `${pendaftaran.namaUser} disetujui dan akun warga dibuat.`,
        data: user,
      };
    } catch (error) {
      this.handleUniqueError(error);
    }
  }

  async tolakPendaftaran(ctx: AccessContext, id: number, alasan: string) {
    const pendaftaran = await this.findPendaftaranScoped(ctx, id);
    await this.prisma.pendaftaranWarga.update({
      where: { id: pendaftaran.id },
      data: {
        status: 'DITOLAK',
        alasanTolak: alasan,
        diprosesOleh: ctx.user.nama,
        diprosesAt: new Date(),
      },
    });
    return { message: `Pendaftaran ${pendaftaran.namaUser} ditolak.` };
  }
}
