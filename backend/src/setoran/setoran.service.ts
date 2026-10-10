import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RT, StatusSetoran } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotifikasiService } from '../notifikasi/notifikasi.service';
import { AuditService } from '../audit/audit.service';
import { FileService } from '../common/file/file.service';
import { AccessContext } from '../auth/auth.types';
import { areaFilter, assertInArea } from '../common/scope.helper';
import { resolvePeriode } from '../common/periode.helper';
import { KonfirmasiSetoranDto } from './dto/setoran.dto';

const labelRt = (rt: string) => rt.replace('_', ' ');

@Injectable()
export class SetoranService {
  constructor(
    private prisma: PrismaService,
    private notifikasiService: NotifikasiService,
    private audit: AuditService,
    private files: FileService,
  ) {}

  /** Tentukan RT yang disetor: RT sendiri untuk bendahara RT, atau dipilih untuk scope ALL. */
  private resolveRt(ctx: AccessContext, rt?: RT): RT {
    const area = areaFilter(ctx);
    if (area === null) {
      if (!rt) throw new BadRequestException('Pilih RT yang akan disetor.');
      return rt;
    }
    if (area === 'RW')
      throw new ForbiddenException('Setoran dibuat oleh bendahara RT.');
    return area;
  }

  /**
   * Tagihan lunas yang porsi IPL-nya belum pernah disetor. Rumah KOSONG
   * dikecualikan: porsi IPL-nya dialihkan menjadi kas RT (tidak disetor ke RW).
   */
  private tagihanSiapSetor(rt: RT): Prisma.IplWhereInput {
    return {
      statusPembayaran: 'LUNAS',
      setoranId: null,
      rumah: { rt, status: { not: 'KOSONG' } },
    };
  }

  /** Tagihan lunas rumah KOSONG: tetap dibayar pemiliknya tapi masuk kas RT. */
  private tagihanKosongDikecualikan(rt: RT): Prisma.IplWhereInput {
    return {
      statusPembayaran: 'LUNAS',
      setoranId: null,
      rumah: { rt, status: 'KOSONG' },
    };
  }

  // ================================================================
  // PRATINJAU — berapa yang akan disetor bila klik "Setor" sekarang
  // ================================================================

  async siapSetor(ctx: AccessContext, rt?: RT) {
    const target = this.resolveRt(ctx, rt);
    const [rows, dikecualikan] = await Promise.all([
      this.prisma.ipl.findMany({
        where: this.tagihanSiapSetor(target),
        select: { nominalIpl: true },
      }),
      this.prisma.ipl.findMany({
        where: this.tagihanKosongDikecualikan(target),
        select: { nominalIpl: true, nominalKas: true },
      }),
    ]);
    return {
      rt: target,
      jumlahTagihan: rows.length,
      totalIpl: rows.reduce((s, r) => s + r.nominalIpl, 0),
      dikecualikanRumahKosong: {
        jumlahTagihan: dikecualikan.length,
        totalMasukKasRt: dikecualikan.reduce(
          (s, r) => s + r.nominalIpl + r.nominalKas,
          0,
        ),
      },
    };
  }

  // ================================================================
  // BUAT SETORAN — bendahara RT mengumpulkan semua porsi IPL yang belum disetor
  // ================================================================

  async create(
    ctx: AccessContext,
    rt: RT | undefined,
    file?: Express.Multer.File,
  ) {
    const target = this.resolveRt(ctx, rt);
    if (!file)
      throw new BadRequestException('Bukti transfer setoran wajib diunggah.');

    const buktiId = await this.files.simpan(file);
    const setoran = await this.prisma
      .$transaction(async (tx) => {
        const tagihan = await tx.ipl.findMany({
          where: this.tagihanSiapSetor(target),
          select: { id: true, nominalIpl: true },
        });
        if (tagihan.length === 0) {
          const kosong = await tx.ipl.count({
            where: this.tagihanKosongDikecualikan(target),
          });
          throw new BadRequestException(
            kosong > 0
              ? `Belum ada tagihan lunas ${labelRt(target)} yang perlu disetor. ${kosong} tagihan rumah kosong dikecualikan dan masuk kas RT.`
              : `Belum ada tagihan lunas ${labelRt(target)} yang perlu disetor.`,
          );
        }

        const created = await tx.setoranIpl.create({
          data: {
            area: target,
            totalIpl: tagihan.reduce((s, t) => s + t.nominalIpl, 0),
            jumlahTagihan: tagihan.length,
            buktiTransaksi: buktiId,
            createBy: ctx.user.nama,
          },
        });

        // Klaim hanya yang masih kosong; kalau ada yang keburu diambil setoran lain, batalkan semua.
        const diklaim = await tx.ipl.updateMany({
          where: { id: { in: tagihan.map((t) => t.id) }, setoranId: null },
          data: { setoranId: created.id },
        });
        if (diklaim.count !== tagihan.length) {
          throw new ConflictException(
            'Data tagihan berubah saat diproses. Coba setor lagi.',
          );
        }
        return created;
      })
      .catch(async (err) => {
        // Setoran gagal dibuat: jangan tinggalkan bukti yatim di database.
        await this.files.hapus(buktiId);
        throw err;
      });

    await this.audit.catat(ctx.user.sub, 'setoran.buat', {
      target: 'SetoranIpl',
      targetId: setoran.id,
      keterangan: `${labelRt(target)}: ${setoran.jumlahTagihan} tagihan, Rp ${setoran.totalIpl.toLocaleString('id-ID')}`,
    });

    await this.notifikasiService.kirimKePermission(
      'setoran.konfirmasi',
      'RW',
      'SETORAN_MASUK',
      'Setoran IPL Masuk',
      `${labelRt(target)} menyetor IPL sebesar Rp ${setoran.totalIpl.toLocaleString('id-ID')} (${setoran.jumlahTagihan} tagihan), menunggu konfirmasi.`,
      '/dashboard/iuran',
      ctx.user.sub,
    );

    return {
      message: 'Setoran berhasil dikirim. Menunggu konfirmasi bendahara RW.',
      data: setoran,
    };
  }

  // ================================================================
  // DAFTAR & DETAIL
  // ================================================================

  async findAll(
    ctx: AccessContext,
    params: { status?: string; rt?: string; dari?: string; sampai?: string },
  ) {
    const area = areaFilter(ctx);
    const range = resolvePeriode(params.dari, params.sampai);
    const where: Prisma.SetoranIplWhereInput = {
      ...(area ? { area } : params.rt ? { area: params.rt as RT } : {}),
      ...(params.status &&
        params.status !== 'SEMUA' && {
          status: params.status as StatusSetoran,
        }),
      // Filter berdasarkan periode tagihan yang ada di dalam setoran (bukan tanggal setor),
      // agar tracking per RT sinkron dengan filter periode di tabel Tagihan IPL.
      ...(range && { tagihan: { some: { OR: range.periodeOr } } }),
    };
    const data = await this.prisma.setoranIpl.findMany({
      where,
      orderBy: { createDate: 'desc' },
    });

    const aktif = data.filter((s) => s.status !== 'DITOLAK');
    return {
      setoran: data,
      summary: {
        total: data.length,
        menunggu: data.filter((s) => s.status === 'MENUNGGU_KONFIRMASI').length,
        dikonfirmasi: data.filter((s) => s.status === 'DIKONFIRMASI').length,
        ditolak: data.filter((s) => s.status === 'DITOLAK').length,
        totalDikonfirmasi: data
          .filter((s) => s.status === 'DIKONFIRMASI')
          .reduce((s, r) => s + r.totalIpl, 0),
        totalMenunggu: aktif
          .filter((s) => s.status === 'MENUNGGU_KONFIRMASI')
          .reduce((s, r) => s + r.totalIpl, 0),
      },
    };
  }

  async findOne(ctx: AccessContext, id: number) {
    const setoran = await this.prisma.setoranIpl.findUnique({
      where: { id },
      include: {
        tagihan: {
          select: {
            id: true,
            bulanPeriode: true,
            tahunPeriode: true,
            nominalIpl: true,
            rumah: {
              select: {
                blokRumah: true,
                penghuni: { select: { namaUser: true } },
              },
            },
          },
          orderBy: [{ tahunPeriode: 'asc' }, { bulanPeriode: 'asc' }],
        },
      },
    });
    if (!setoran)
      throw new NotFoundException(`Setoran dengan ID ${id} tidak ditemukan.`);
    assertInArea(ctx, setoran.area);

    // Konteks RW: tagihan periode yang sama yang tidak ikut setoran (rumah kosong, menunggu konfirmasi, belum lunas).
    const periodeSet = new Map(
      setoran.tagihan.map((t) => [
        `${t.tahunPeriode}-${t.bulanPeriode}`,
        { bulanPeriode: t.bulanPeriode, tahunPeriode: t.tahunPeriode },
      ]),
    );
    const periodeOr = [...periodeSet.values()];
    if (periodeOr.length === 0) {
      return {
        ...setoran,
        konteks: { kosongDikecualikan: [], menunggu: [], belumBayar: [] },
      };
    }
    const [kosongDikecualikan, menunggu, belumBayar] = await Promise.all([
      this.prisma.ipl.findMany({
        where: {
          statusPembayaran: {
            in: ['LUNAS', 'MENUNGGU_KONFIRMASI', 'BELUM_LUNAS'],
          },
          setoranId: null,
          OR: periodeOr,
          rumah: { rt: setoran.area as RT, status: 'KOSONG' },
        },
        select: {
          id: true,
          bulanPeriode: true,
          tahunPeriode: true,
          nominalIpl: true,
          nominalKas: true,
          statusPembayaran: true,
          rumah: {
            select: {
              blokRumah: true,
              penghuni: { select: { namaUser: true } },
            },
          },
        },
        orderBy: [{ tahunPeriode: 'asc' }, { bulanPeriode: 'asc' }],
      }),
      this.prisma.pembayaranIpl.findMany({
        where: {
          ipl: {
            statusPembayaran: 'MENUNGGU_KONFIRMASI',
            OR: periodeOr,
            rumah: { rt: setoran.area as RT, status: { not: 'KOSONG' } },
          },
        },
        select: {
          idPembayaran: true,
          nominal: true,
          tanggalBayar: true,
          user: { select: { namaUser: true } },
          ipl: {
            select: {
              bulanPeriode: true,
              tahunPeriode: true,
              rumah: { select: { blokRumah: true } },
            },
          },
        },
        orderBy: { tanggalBayar: 'desc' },
      }),
      this.prisma.ipl.findMany({
        where: {
          statusPembayaran: 'BELUM_LUNAS',
          OR: periodeOr,
          rumah: { rt: setoran.area as RT, status: { not: 'KOSONG' } },
        },
        select: {
          id: true,
          bulanPeriode: true,
          tahunPeriode: true,
          nominalIpl: true,
          nominalKas: true,
          statusPembayaran: true,
          rumah: {
            select: {
              blokRumah: true,
              penghuni: { select: { namaUser: true } },
            },
          },
        },
        orderBy: [{ tahunPeriode: 'asc' }, { bulanPeriode: 'asc' }],
      }),
    ]);
    return {
      ...setoran,
      konteks: { kosongDikecualikan, menunggu, belumBayar },
    };
  }

  /** Id file bukti transfer setoran; dicek scope dulu, file ini tidak boleh diambil lewat GET /files/:id publik. */
  async fileIdBukti(ctx: AccessContext, id: number) {
    const setoran = await this.findOne(ctx, id);
    if (!setoran.buktiTransaksi)
      throw new NotFoundException('Setoran ini tidak memiliki bukti transfer.');
    return setoran.buktiTransaksi;
  }

  // ================================================================
  // KONFIRMASI / TOLAK — bendahara RW
  // ================================================================

  async konfirmasi(ctx: AccessContext, id: number, dto: KonfirmasiSetoranDto) {
    const setoran = await this.findOne(ctx, id);
    if (setoran.status !== 'MENUNGGU_KONFIRMASI') {
      throw new BadRequestException(
        'Setoran ini tidak dalam status "Menunggu Konfirmasi".',
      );
    }

    if (dto.action === 'TERIMA') {
      await this.prisma.setoranIpl.update({
        where: { id },
        data: {
          status: 'DIKONFIRMASI',
          konfirmasiBy: ctx.user.nama,
          tanggalKonfirmasi: new Date(),
          catatan: dto.catatan ?? null,
        },
      });
      await this.audit.catat(ctx.user.sub, 'setoran.konfirmasi', {
        target: 'SetoranIpl',
        targetId: id,
        keterangan: `${labelRt(setoran.area)}: Rp ${setoran.totalIpl.toLocaleString('id-ID')}`,
      });
      await this.notifikasiService.kirimKePermission(
        'setoran.read',
        setoran.area,
        'SETORAN_DIKONFIRMASI',
        'Setoran IPL Dikonfirmasi',
        `Setoran IPL ${labelRt(setoran.area)} sebesar Rp ${setoran.totalIpl.toLocaleString('id-ID')} sudah dikonfirmasi bendahara RW.`,
        '/dashboard/iuran',
        ctx.user.sub,
      );
      return {
        message: 'Setoran dikonfirmasi dan tercatat sebagai pemasukan kas RW.',
      };
    }

    if (!dto.catatan?.trim()) {
      throw new BadRequestException('Alasan penolakan wajib diisi.');
    }
    // Tagihan dilepas lagi supaya otomatis ikut setoran berikutnya.
    await this.prisma.$transaction([
      this.prisma.ipl.updateMany({
        where: { setoranId: id },
        data: { setoranId: null },
      }),
      this.prisma.setoranIpl.update({
        where: { id },
        data: {
          status: 'DITOLAK',
          konfirmasiBy: ctx.user.nama,
          tanggalKonfirmasi: new Date(),
          catatan: dto.catatan,
        },
      }),
    ]);
    await this.audit.catat(ctx.user.sub, 'setoran.tolak', {
      target: 'SetoranIpl',
      targetId: id,
      keterangan: dto.catatan,
    });
    await this.notifikasiService.kirimKePermission(
      'setoran.read',
      setoran.area,
      'SETORAN_DITOLAK',
      'Setoran IPL Ditolak',
      `Setoran IPL ${labelRt(setoran.area)} ditolak. Alasan: ${dto.catatan}`,
      '/dashboard/iuran',
      ctx.user.sub,
    );
    return {
      message: 'Setoran ditolak. Tagihan akan ikut setoran berikutnya.',
    };
  }
}
