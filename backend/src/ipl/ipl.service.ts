import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RT, ScopeAkses, StatusPembayaran } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GenerateIplDto } from './dto/generate-ipl.dto';
import { UpdateIplDto } from './dto/update-ipl.dto';
import { KonfirmasiIplDto } from './dto/konfirmasi-ipl.dto';
import { NotifikasiService } from '../notifikasi/notifikasi.service';
import { PermissionsService } from '../auth/permissions.service';
import { AccessContext, AuthUser } from '../auth/auth.types';
import { resolvePeriode } from '../common/periode.helper';
import {
  areaFilter,
  assertInArea,
  rtFilter,
  wargaBacaWhere,
} from '../common/scope.helper';
import { LEVEL_WARGA, totalTagihan, withTotal } from '../common/helpers';

const SEMUA_RT: RT[] = ['RT_01', 'RT_02', 'RT_03', 'RT_04'];

@Injectable()
export class IplService {
  constructor(
    private prisma: PrismaService,
    private notifikasiService: NotifikasiService,
    private permissions: PermissionsService,
    private audit: AuditService,
  ) {}

  /** Batasan data tagihan sesuai scope: OWN = rumah sendiri, AREA = RT sendiri, ALL = semua. */
  private scopeWhere(ctx: AccessContext, rt?: string): Prisma.IplWhereInput {
    if (ctx.scope === 'OWN') return { rumah: { userId: ctx.user.sub } };
    const area = areaFilter(ctx);
    if (area === null) return rt ? { rumah: { rt: rt as RT } } : {};
    return { rumah: rtFilter(area) };
  }

  // ================================================================
  // GENERATE TAGIHAN MASSAL — dikerjakan bendahara RT untuk RT-nya
  // ================================================================

  async generateTagihan(ctx: AccessContext, dto: GenerateIplDto) {
    const { bulanPeriode, tahunPeriode, nominalIpl, nominalKas } = dto;

    const area = areaFilter(ctx);
    let rt: RT;
    if (area === null) {
      if (!dto.rt)
        throw new BadRequestException(
          'Pilih RT yang akan digenerate tagihannya.',
        );
      rt = dto.rt;
    } else if (area === 'RW') {
      throw new ForbiddenException(
        'Tagihan IPL digenerate oleh bendahara RT, bukan RW.',
      );
    } else {
      rt = area;
    }

    // Rumah tertagih = punya pemilik/penanggung jawab (termasuk rumah KOSONG
    // yang pemiliknya sudah terdaftar akun). Rumah yang pemiliknya belum daftar
    // akun belum bisa ditagih; penagihan pertamanya mengikuti periode saat akun
    // dibuat, tanpa tunggakan mundur.
    const rumahAktif = await this.prisma.rumah.findMany({
      where: { rt, isDelete: false, userId: { not: null } },
      select: { id: true, userId: true },
    });
    if (rumahAktif.length === 0) {
      throw new BadRequestException(
        `Tidak ada rumah tertagih di ${rt.replace('_', ' ')}.`,
      );
    }

    // Idempotent: rumah yang sudah punya tagihan periode ini dilewati, sehingga
    // pemilik yang baru terdaftar di tengah bulan bisa disusulkan dengan
    // generate ulang periode berjalan tanpa error duplikat.
    const sudahAda = await this.prisma.ipl.findMany({
      where: {
        bulanPeriode,
        tahunPeriode,
        idRumah: { in: rumahAktif.map((r) => r.id) },
      },
      select: { idRumah: true },
    });
    const sudahAdaIds = new Set(sudahAda.map((r) => r.idRumah));
    const rumahBaru = rumahAktif.filter((r) => !sudahAdaIds.has(r.id));
    if (rumahBaru.length === 0) {
      throw new BadRequestException(
        `Tagihan ${rt.replace('_', ' ')} untuk periode ${bulanPeriode}/${tahunPeriode} sudah pernah digenerate dan tidak ada rumah baru yang perlu ditagih.`,
      );
    }

    await this.prisma.ipl.createMany({
      data: rumahBaru.map((r) => ({
        idRumah: r.id,
        bulanPeriode,
        tahunPeriode,
        nominalIpl,
        nominalKas,
      })),
    });

    const total = nominalIpl + nominalKas;
    await this.notifikasiService.kirimBanyak(
      rumahBaru.map((r) => r.userId).filter((id): id is number => id !== null),
      'TAGIHAN_BARU',
      'Tagihan IPL Baru',
      `Tagihan IPL periode ${bulanPeriode}/${tahunPeriode} sebesar Rp ${total.toLocaleString('id-ID')} telah diterbitkan.`,
      '/dashboard/iuran',
    );

    await this.audit.catat(ctx.user.sub, 'ipl.generate', {
      target: 'Ipl',
      keterangan: `${rt.replace('_', ' ')} periode ${bulanPeriode}/${tahunPeriode}: ${rumahBaru.length} tagihan baru (IPL Rp ${nominalIpl.toLocaleString('id-ID')} + kas Rp ${nominalKas.toLocaleString('id-ID')})`,
    });

    const dilewati = rumahAktif.length - rumahBaru.length;
    return {
      message:
        dilewati > 0
          ? `Berhasil generate ${rumahBaru.length} tagihan IPL ${rt.replace('_', ' ')} untuk periode ${bulanPeriode}/${tahunPeriode} (${dilewati} rumah sudah ada tagihannya, dilewati).`
          : `Berhasil generate ${rumahBaru.length} tagihan IPL ${rt.replace('_', ' ')} untuk periode ${bulanPeriode}/${tahunPeriode}.`,
      jumlahTagihan: rumahBaru.length,
      dilewati,
      rt,
      nominalIpl,
      nominalKas,
      nominal: total,
      periode: `${bulanPeriode}/${tahunPeriode}`,
    };
  }

  // ================================================================
  // GET ALL TAGIHAN (dengan filter)
  // ================================================================

  async findAll(
    ctx: AccessContext,
    params: {
      bulan?: string;
      tahun?: string;
      dari?: string;
      sampai?: string;
      status?: string;
      search?: string;
      rt?: string;
    },
  ) {
    const { bulan, tahun, dari, sampai, status, search, rt } = params;

    const and: Prisma.IplWhereInput[] = [this.scopeWhere(ctx, rt)];
    const range = resolvePeriode(dari, sampai);
    if (range) {
      // Range diutamakan bila diberikan
      and.push({ OR: range.periodeOr });
    } else {
      if (bulan) and.push({ bulanPeriode: bulan });
      if (tahun) and.push({ tahunPeriode: tahun });
    }
    if (status && status !== 'SEMUA')
      and.push({ statusPembayaran: status as StatusPembayaran });
    if (search) {
      and.push({
        OR: [
          { rumah: { blokRumah: { contains: search } } },
          { rumah: { penghuni: { namaUser: { contains: search } } } },
        ],
      });
    }

    const rows = await this.prisma.ipl.findMany({
      where: { AND: and },
      include: {
        rumah: {
          include: {
            penghuni: {
              select: {
                id: true,
                namaUser: true,
                email: true,
                noTelp: true,
                role: { select: { level: true } },
              },
            },
          },
        },
        // NOTE: rumah.status ikut terbawa via include di atas (kolom scalar
        // selalu disertakan) dan dipakai untuk memisahkan porsi rumah kosong.
        setoran: { select: { id: true, status: true } },
        pembayaran: {
          orderBy: { tanggalBayar: 'desc' },
          take: 1,
          select: {
            idPembayaran: true,
            buktiTransaksi: true,
            tanggalBayar: true,
            tanggalKonfirmasi: true,
            nominal: true,
            catatan: true,
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

    const lunas = tagihan.filter((t) => t.statusPembayaran === 'LUNAS');
    const sum = (
      list: typeof tagihan,
      pick: (t: (typeof tagihan)[number]) => number,
    ) => list.reduce((s, t) => s + pick(t), 0);

    const summary = {
      total: tagihan.length,
      lunas: lunas.length,
      belumLunas: tagihan.filter((t) => t.statusPembayaran === 'BELUM_LUNAS')
        .length,
      menungguKonfirmasi: tagihan.filter(
        (t) => t.statusPembayaran === 'MENUNGGU_KONFIRMASI',
      ).length,
      totalNominal: sum(tagihan, (t) => t.nominal),
      totalTerkumpul: sum(lunas, (t) => t.nominal),
      totalTertunggak: sum(
        tagihan.filter((t) => t.statusPembayaran !== 'LUNAS'),
        (t) => t.nominal,
      ),
      // Pecahan dari yang sudah terkumpul: porsi RW vs kas RT.
      // Rumah KOSONG: porsi IPL dialihkan ke kas RT (tidak disetor ke RW).
      terkumpulIpl: sum(
        lunas.filter((t) => t.rumah.status !== 'KOSONG'),
        (t) => t.nominalIpl,
      ),
      terkumpulKas: sum(
        lunas,
        (t) => t.nominalKas + (t.rumah.status === 'KOSONG' ? t.nominalIpl : 0),
      ),
    };

    return { tagihan, summary };
  }

  // ================================================================
  // REKAP PER RT — tampilan RW: berapa yang terkumpul & sudah disetor tiap RT
  // ================================================================

  async rekapPerRt(
    ctx: AccessContext,
    params: { dari?: string; sampai?: string; status?: string; rt?: string },
  ) {
    if (ctx.scope === 'OWN')
      throw new ForbiddenException(
        'Rekap per RT tidak tersedia untuk akun ini.',
      );
    const range = resolvePeriode(params.dari, params.sampai);
    const now = new Date();
    const periodeOr = range?.periodeOr ?? [
      {
        bulanPeriode: String(now.getMonth() + 1).padStart(2, '0'),
        tahunPeriode: String(now.getFullYear()),
      },
    ];

    const and: Prisma.IplWhereInput[] = [
      this.scopeWhere(ctx, params.rt),
      { OR: periodeOr },
    ];
    if (params.status && params.status !== 'SEMUA')
      and.push({ statusPembayaran: params.status as StatusPembayaran });

    const rows = await this.prisma.ipl.findMany({
      where: { AND: and },
      select: {
        nominalIpl: true,
        nominalKas: true,
        statusPembayaran: true,
        setoranId: true,
        setoran: { select: { status: true } },
        rumah: { select: { rt: true, status: true } },
      },
    });

    const area = areaFilter(ctx);
    let daftarRt =
      area === null ? [...SEMUA_RT] : SEMUA_RT.filter((r) => r === area);
    if (params.rt && params.rt !== 'SEMUA') {
      const requested = params.rt as RT;
      if ((SEMUA_RT as string[]).includes(requested))
        daftarRt = daftarRt.filter((r) => r === requested);
    }

    // Rumah KOSONG: porsi IPL dialihkan ke kas RT (tidak disetor ke RW).
    const kosong = (r: (typeof rows)[number]) => r.rumah.status === 'KOSONG';
    const kasRt = (r: (typeof rows)[number]) =>
      r.nominalKas + (kosong(r) ? r.nominalIpl : 0);
    const perRt = daftarRt.map((rt) => {
      const list = rows.filter((r) => r.rumah.rt === rt);
      const lunas = list.filter((r) => r.statusPembayaran === 'LUNAS');
      const menunggu = list.filter(
        (r) => r.statusPembayaran === 'MENUNGGU_KONFIRMASI',
      ).length;
      const lunasDihuni = lunas.filter((r) => !kosong(r));
      const lunasKosong = lunas.filter((r) => kosong(r));
      const disetor = lunasDihuni.filter(
        (r) => r.setoranId !== null && r.setoran?.status !== 'DITOLAK',
      );
      const sum = (l: typeof list, f: (r: (typeof list)[number]) => number) =>
        l.reduce((s, r) => s + f(r), 0);
      return {
        rt,
        totalTagihan: list.length,
        lunas: lunas.length,
        menungguKonfirmasi: menunggu,
        belumLunas: list.length - lunas.length,
        nominalTagihan: sum(list, totalTagihan),
        terkumpulIpl: sum(lunasDihuni, (r) => r.nominalIpl),
        terkumpulKas: sum(lunas, (r) => kasRt(r)),
        // Penjelas selisih: tagihan rumah kosong yang dikecualikan dari setoran.
        terkumpulRumahKosong: {
          jumlahTagihan: lunasKosong.length,
          nominal: sum(lunasKosong, (r) => totalTagihan(r)),
        },
        sudahDisetor: sum(disetor, (r) => r.nominalIpl),
        belumDisetor:
          sum(lunasDihuni, (r) => r.nominalIpl) -
          sum(disetor, (r) => r.nominalIpl),
      };
    });

    const total = perRt.reduce(
      (t, r) => ({
        totalTagihan: t.totalTagihan + r.totalTagihan,
        lunas: t.lunas + r.lunas,
        menungguKonfirmasi: t.menungguKonfirmasi + r.menungguKonfirmasi,
        belumLunas: t.belumLunas + r.belumLunas,
        nominalTagihan: t.nominalTagihan + r.nominalTagihan,
        terkumpulIpl: t.terkumpulIpl + r.terkumpulIpl,
        terkumpulKas: t.terkumpulKas + r.terkumpulKas,
        terkumpulRumahKosong: {
          jumlahTagihan:
            t.terkumpulRumahKosong.jumlahTagihan +
            r.terkumpulRumahKosong.jumlahTagihan,
          nominal:
            t.terkumpulRumahKosong.nominal + r.terkumpulRumahKosong.nominal,
        },
        sudahDisetor: t.sudahDisetor + r.sudahDisetor,
        belumDisetor: t.belumDisetor + r.belumDisetor,
      }),
      {
        totalTagihan: 0,
        lunas: 0,
        menungguKonfirmasi: 0,
        belumLunas: 0,
        nominalTagihan: 0,
        terkumpulIpl: 0,
        terkumpulKas: 0,
        terkumpulRumahKosong: { jumlahTagihan: 0, nominal: 0 },
        sudahDisetor: 0,
        belumDisetor: 0,
      },
    );

    return {
      periode: range
        ? { dari: range.dariYm, sampai: range.sampaiYm }
        : {
            dari: `${periodeOr[0].tahunPeriode}-${periodeOr[0].bulanPeriode}`,
            sampai: `${periodeOr[0].tahunPeriode}-${periodeOr[0].bulanPeriode}`,
          },
      perRt,
      total,
    };
  }

  // ================================================================
  // UBAH / HAPUS SATU TAGIHAN (koreksi oleh bendahara RT)
  // ================================================================

  private async findTagihanScoped(ctx: AccessContext, id: number) {
    const ipl = await this.prisma.ipl.findUnique({
      where: { id },
      include: {
        rumah: { select: { rt: true } },
        _count: { select: { pembayaran: true } },
      },
    });
    if (!ipl)
      throw new NotFoundException(`Tagihan dengan ID ${id} tidak ditemukan.`);
    assertInArea(ctx, ipl.rumah.rt);
    return ipl;
  }

  async update(ctx: AccessContext, id: number, dto: UpdateIplDto) {
    const ipl = await this.findTagihanScoped(ctx, id);
    if (ipl.statusPembayaran !== 'BELUM_LUNAS') {
      throw new BadRequestException(
        'Hanya tagihan berstatus BELUM LUNAS yang bisa diubah.',
      );
    }
    const nominalBerubah =
      (dto.nominalIpl !== undefined && dto.nominalIpl !== ipl.nominalIpl) ||
      (dto.nominalKas !== undefined && dto.nominalKas !== ipl.nominalKas);
    if (nominalBerubah && !dto.alasan?.trim()) {
      throw new BadRequestException(
        'Alasan koreksi wajib diisi bila nominal berubah.',
      );
    }
    const data = await this.prisma.ipl.update({
      where: { id },
      data: {
        ...(dto.nominalIpl !== undefined && { nominalIpl: dto.nominalIpl }),
        ...(dto.nominalKas !== undefined && { nominalKas: dto.nominalKas }),
      },
    });
    if (nominalBerubah) {
      const before = `IPL Rp ${ipl.nominalIpl.toLocaleString('id-ID')} + kas Rp ${ipl.nominalKas.toLocaleString('id-ID')}`;
      const after = `IPL Rp ${data.nominalIpl.toLocaleString('id-ID')} + kas Rp ${data.nominalKas.toLocaleString('id-ID')}`;
      await this.audit.catat(ctx.user.sub, 'ipl.koreksi', {
        target: 'Ipl',
        targetId: id,
        keterangan: `${ipl.rumah.rt.replace('_', ' ')} periode ${ipl.bulanPeriode}/${ipl.tahunPeriode}: ${before} -> ${after}. Alasan: ${dto.alasan!.trim()}`,
      });
      // Koreksi nominal memengaruhi porsi setoran RW — selalu beri tahu pimpinan RW.
      await this.notifikasiService.kirimKePermissionAreaPersis(
        'setoran.read',
        'RW',
        'PERUBAHAN_DATA',
        'Koreksi Nominal Tagihan',
        `${ctx.user.nama} mengoreksi tagihan ${ipl.rumah.rt.replace('_', ' ')} periode ${ipl.bulanPeriode}/${ipl.tahunPeriode}: ${before} -> ${after}.`,
        '/dashboard/kelola-ipl/tagihan',
        ctx.user.sub,
      );
    }
    return { message: 'Tagihan berhasil diperbarui.', data: withTotal(data) };
  }

  async remove(ctx: AccessContext, id: number) {
    const ipl = await this.findTagihanScoped(ctx, id);
    if (ipl.statusPembayaran !== 'BELUM_LUNAS' || ipl._count.pembayaran > 0) {
      throw new BadRequestException(
        'Tagihan yang sudah ada pembayarannya tidak bisa dihapus.',
      );
    }
    await this.prisma.ipl.delete({ where: { id } });
    return { message: 'Tagihan berhasil dihapus.' };
  }

  // ================================================================
  // DASHBOARD STATS — ringkasan per rentang periode (maks 12 bulan)
  // Query: ?dari=YYYY-MM&sampai=YYYY-MM. Tanpa param = bulan berjalan.
  // ================================================================

  async getDashboardStats(
    ctx: AccessContext,
    params?: { dari?: string; sampai?: string; rt?: string },
  ) {
    const now = new Date();
    const bulanIni = String(now.getMonth() + 1).padStart(2, '0');
    const tahunIni = String(now.getFullYear());

    const resolved = resolvePeriode(params?.dari, params?.sampai);
    const periodeList = resolved?.periodeList ?? [
      {
        bulan: bulanIni,
        tahun: tahunIni,
        label: new Date(
          now.getFullYear(),
          now.getMonth(),
          1,
        ).toLocaleDateString('id-ID', {
          month: 'short',
          year: '2-digit',
        }),
      },
    ];
    const periodeOr =
      resolved?.periodeOr ??
      periodeList.map((p) => ({
        bulanPeriode: p.bulan,
        tahunPeriode: p.tahun,
      }));

    const scope = this.scopeWhere(ctx, params?.rt);
    const area = ctx.scope === 'OWN' ? null : areaFilter(ctx);
    const wargaWhere = wargaBacaWhere(
      area ?? (params?.rt ? (params.rt as RT) : null),
    );

    const [tagihanPeriode, totalWarga, menungguKonfirmasi, pembayaranTerbaru] =
      await Promise.all([
        this.prisma.ipl.findMany({
          where: { AND: [scope, { OR: periodeOr }] },
          select: {
            statusPembayaran: true,
            nominalIpl: true,
            nominalKas: true,
          },
        }),
        ctx.scope === 'OWN'
          ? Promise.resolve(1)
          : this.prisma.user.count({ where: wargaWhere }),
        this.prisma.ipl.count({
          where: {
            AND: [
              scope,
              { statusPembayaran: 'MENUNGGU_KONFIRMASI' },
              { OR: periodeOr },
            ],
          },
        }),
        // 5 pembayaran terbaru yang tagihannya masuk rentang periode
        this.prisma.pembayaranIpl.findMany({
          where: { ipl: { AND: [scope, { OR: periodeOr }] } },
          orderBy: { tanggalBayar: 'desc' },
          take: 5,
          select: {
            idPembayaran: true,
            tanggalBayar: true,
            tanggalKonfirmasi: true,
            nominal: true,
            buktiTransaksi: true,
            user: { select: { namaUser: true } },
            ipl: {
              select: {
                bulanPeriode: true,
                tahunPeriode: true,
                statusPembayaran: true,
                rumah: { select: { blokRumah: true, rt: true } },
              },
            },
          },
        }),
      ]);

    const lunasRows = tagihanPeriode.filter(
      (t) => t.statusPembayaran === 'LUNAS',
    );
    const lunasBulanIni = lunasRows.length;
    const belumLunasBulanIni = tagihanPeriode.length - lunasBulanIni;
    const totalKasMasukBulanIni = lunasRows.reduce(
      (s, t) => s + totalTagihan(t),
      0,
    );

    // Tren kas masuk mengikuti rentang periode yang dipilih
    const trenData = await Promise.all(
      periodeList.map(async ({ bulan, tahun, label }) => {
        const rows = await this.prisma.ipl.findMany({
          where: {
            AND: [
              scope,
              {
                bulanPeriode: bulan,
                tahunPeriode: tahun,
                statusPembayaran: 'LUNAS',
              },
            ],
          },
          select: { nominalIpl: true, nominalKas: true },
        });
        return {
          label,
          bulan,
          tahun,
          kasMasuk: rows.reduce((s, r) => s + totalTagihan(r), 0),
          jumlahLunas: rows.length,
        };
      }),
    );

    const first = periodeList[0];
    const last = periodeList[periodeList.length - 1];

    return {
      totalWarga,
      lunasBulanIni,
      belumLunasBulanIni,
      menungguKonfirmasi,
      totalTagihanBulanIni: tagihanPeriode.length,
      totalKasMasukBulanIni,
      bulanIni,
      tahunIni,
      periode: {
        dari: `${first.tahun}-${first.bulan}`,
        sampai: `${last.tahun}-${last.bulan}`,
        jumlahBulan: periodeList.length,
      },
      trenPemasukan: trenData,
      pembayaranTerbaru,
    };
  }

  /**
   * Id file bukti transfer; dicek scope dulu (OWN = punya sendiri, AREA/ALL = wilayah
   * sesuai RT rumah), karena file ini tidak boleh diambil lewat GET /files/:id publik.
   */
  async fileIdBukti(ctx: AccessContext, pembayaranId: number) {
    const pembayaran = await this.prisma.pembayaranIpl.findUnique({
      where: { idPembayaran: pembayaranId },
      include: { ipl: { include: { rumah: { select: { rt: true } } } } },
    });
    if (!pembayaran) {
      throw new NotFoundException(
        `Pembayaran dengan ID ${pembayaranId} tidak ditemukan.`,
      );
    }
    if (ctx.scope === 'OWN') {
      if (pembayaran.idUser !== ctx.user.sub) {
        throw new ForbiddenException(
          'Anda hanya boleh melihat bukti pembayaran milik sendiri.',
        );
      }
    } else {
      assertInArea(ctx, pembayaran.ipl.rumah.rt);
    }
    if (!pembayaran.buktiTransaksi)
      throw new NotFoundException(
        'Pembayaran ini tidak memiliki bukti transfer.',
      );
    return pembayaran.buktiTransaksi;
  }

  // ================================================================
  // KONFIRMASI / TOLAK PEMBAYARAN
  // ================================================================

  async konfirmasiPembayaran(
    user: AuthUser,
    pembayaranId: number,
    dto: KonfirmasiIplDto,
  ) {
    const pembayaran = await this.prisma.pembayaranIpl.findUnique({
      where: { idPembayaran: pembayaranId },
      include: {
        ipl: {
          select: {
            statusPembayaran: true,
            bulanPeriode: true,
            tahunPeriode: true,
            rumah: { select: { rt: true, blokRumah: true } },
          },
        },
      },
    });

    if (!pembayaran) {
      throw new NotFoundException(
        `Pembayaran dengan ID ${pembayaranId} tidak ditemukan.`,
      );
    }

    if (pembayaran.idUser === user.sub) {
      throw new ForbiddenException(
        'Anda tidak bisa mengonfirmasi pembayaran milik sendiri.',
      );
    }

    // Pemegang `ipl.konfirmasi` (konfirmasi warga & pengurus) diutamakan; kalau tidak
    // punya itu, cek `ipl.konfirmasi_pengurus` (mis. Ketua RT) yang hanya boleh
    // dipakai untuk pembayaran pengurus (role.level < LEVEL_WARGA), bukan warga biasa.
    const [scopeUmum, scopePengurus] = await Promise.all([
      this.permissions.scopeOf(user.roleId, 'ipl.konfirmasi'),
      this.permissions.scopeOf(user.roleId, 'ipl.konfirmasi_pengurus'),
    ]);

    let scope: ScopeAkses;
    if (scopeUmum) {
      scope = scopeUmum;
    } else if (scopePengurus) {
      const pembayar = await this.prisma.user.findUnique({
        where: { id: pembayaran.idUser },
        select: { role: { select: { level: true } } },
      });
      if (!pembayar || pembayar.role.level >= LEVEL_WARGA) {
        throw new ForbiddenException(
          'Anda hanya boleh mengonfirmasi pembayaran pengurus.',
        );
      }
      scope = scopePengurus;
    } else {
      throw new ForbiddenException('Anda tidak memiliki akses untuk aksi ini.');
    }

    const ctx: AccessContext = { user, scope };
    assertInArea(ctx, pembayaran.ipl.rumah.rt);

    if (pembayaran.ipl.statusPembayaran !== 'MENUNGGU_KONFIRMASI') {
      throw new BadRequestException(
        'Pembayaran ini tidak dalam status "Menunggu Konfirmasi".',
      );
    }

    if (dto.action === 'TERIMA') {
      await this.prisma.$transaction([
        this.prisma.ipl.update({
          where: { id: pembayaran.idIpl },
          data: { statusPembayaran: 'LUNAS' },
        }),
        this.prisma.pembayaranIpl.update({
          where: { idPembayaran: pembayaranId },
          data: { tanggalKonfirmasi: new Date() },
        }),
      ]);

      await this.notifikasiService.kirim(
        pembayaran.idUser,
        'PEMBAYARAN_DIKONFIRMASI',
        'Pembayaran Dikonfirmasi',
        'Pembayaran IPL kamu sudah dikonfirmasi dan berstatus Lunas.',
        '/dashboard/iuran',
      );

      await this.audit.catat(user.sub, 'ipl.konfirmasi', {
        target: 'PembayaranIpl',
        targetId: pembayaranId,
        keterangan: `Terima pembayaran blok ${pembayaran.ipl.rumah.blokRumah} (${pembayaran.ipl.rumah.rt.replace('_', ' ')}) periode ${pembayaran.ipl.bulanPeriode}/${pembayaran.ipl.tahunPeriode}`,
      });

      return {
        message: 'Pembayaran berhasil dikonfirmasi. Status menjadi LUNAS.',
      };
    }

    // TOLAK: kembalikan status ke BELUM_LUNAS + simpan catatan
    await this.prisma.$transaction([
      this.prisma.ipl.update({
        where: { id: pembayaran.idIpl },
        data: { statusPembayaran: 'BELUM_LUNAS' },
      }),
      this.prisma.pembayaranIpl.update({
        where: { idPembayaran: pembayaranId },
        data: { catatan: dto.catatan ?? null },
      }),
    ]);

    await this.notifikasiService.kirim(
      pembayaran.idUser,
      'PEMBAYARAN_DITOLAK',
      'Pembayaran Ditolak',
      `Pembayaran IPL kamu ditolak.${dto.catatan ? ` Catatan: ${dto.catatan}` : ''}`,
      '/dashboard/iuran',
    );

    await this.audit.catat(user.sub, 'ipl.konfirmasi', {
      target: 'PembayaranIpl',
      targetId: pembayaranId,
      keterangan: `Tolak pembayaran blok ${pembayaran.ipl.rumah.blokRumah} (${pembayaran.ipl.rumah.rt.replace('_', ' ')}) periode ${pembayaran.ipl.bulanPeriode}/${pembayaran.ipl.tahunPeriode}.${dto.catatan ? ` Alasan: ${dto.catatan}` : ''}`,
    });

    return {
      message: 'Pembayaran ditolak. Status dikembalikan ke BELUM LUNAS.',
      catatan: dto.catatan ?? null,
    };
  }
}
