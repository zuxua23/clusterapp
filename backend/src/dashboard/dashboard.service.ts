import { ForbiddenException, Injectable } from '@nestjs/common';
import { RT } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessContext } from '../auth/auth.types';
import {
  currentYm,
  resolvePeriode,
  ymRangeToDates,
} from '../common/periode.helper';

// RT di RW ini tetap 4 (enum Area/RT) — penyebut "a dari b RT" selalu 4.
const RT_LIST: RT[] = ['RT_01', 'RT_02', 'RT_03', 'RT_04'];

@Injectable()
export class DashboardRwService {
  constructor(private prisma: PrismaService) {}

  async ringkasanRw(
    ctx: AccessContext,
    params: { dari?: string; sampai?: string },
  ) {
    if (ctx.scope !== 'ALL') {
      throw new ForbiddenException('Dashboard ini hanya untuk Bendahara RW.');
    }
    const ym = currentYm();
    const resolved = resolvePeriode(params.dari, params.sampai) ?? {
      periodeList: [{ bulan: ym.slice(5), tahun: ym.slice(0, 4), label: '' }],
      periodeOr: [{ bulanPeriode: ym.slice(5), tahunPeriode: ym.slice(0, 4) }],
      dariYm: ym,
      sampaiYm: ym,
    };
    const { gte, lt } = ymRangeToDates(resolved.dariYm, resolved.sampaiYm);
    const nowYm = currentYm();
    const rangeYm = new Set(
      resolved.periodeList.map((p) => `${p.tahun}-${p.bulan}`),
    );

    const [
      tertagihAgg,
      setoranDikonf,
      setoranTunggu,
      lunasRows,
      setoranDitolak,
      tagihanRtRows,
      kasPeriode,
      kasSemua,
      setoranPeriodeIpl,
      setoranSemua,
      aktivitasRows,
    ] = await Promise.all([
      this.prisma.ipl.aggregate({
        _sum: { nominalIpl: true },
        where: { OR: resolved.periodeOr, rumah: { status: { not: 'KOSONG' } } },
      }),
      // Diterima = total setoran utuh (semantik sama dengan summary menu
      // Setoran: setoran dihitung penuh di tiap periode yang disentuhnya).
      this.prisma.setoranIpl.findMany({
        where: {
          status: 'DIKONFIRMASI',
          tagihan: { some: { OR: resolved.periodeOr } },
        },
        select: {
          id: true,
          area: true,
          totalIpl: true,
          createDate: true,
          tagihan: { select: { bulanPeriode: true, tahunPeriode: true } },
        },
      }),
      this.prisma.setoranIpl.findMany({
        where: {
          status: 'MENUNGGU_KONFIRMASI',
          tagihan: { some: { OR: resolved.periodeOr } },
        },
        select: {
          id: true,
          area: true,
          totalIpl: true,
          jumlahTagihan: true,
          createBy: true,
          createDate: true,
        },
        orderBy: { createDate: 'desc' },
      }),
      this.prisma.ipl.findMany({
        where: { OR: resolved.periodeOr, statusPembayaran: 'LUNAS' },
        select: {
          nominalIpl: true,
          rumah: { select: { rt: true, status: true } },
        },
      }),
      this.prisma.setoranIpl.findMany({
        where: {
          status: 'DITOLAK',
          tagihan: { some: { OR: resolved.periodeOr } },
        },
        select: {
          id: true,
          area: true,
          catatan: true,
          createDate: true,
          tanggalKonfirmasi: true,
        },
        orderBy: { tanggalKonfirmasi: 'desc' },
      }),
      this.prisma.ipl.findMany({
        where: { OR: resolved.periodeOr },
        select: { rumah: { select: { rt: true } } },
      }),
      this.prisma.kasTransaksi.findMany({
        where: { area: 'RW', tanggal: { gte, lt } },
        select: { tipe: true, nominal: true },
      }),
      this.prisma.kasTransaksi.findMany({
        where: { area: 'RW' },
        select: { tipe: true, nominal: true },
      }),
      // Setoran IPL periode ini dihitung per tagihan (sum nominalIpl) agar
      // 1:1 dengan keuangan.service getRingkasan area=RW (bukan totalIpl
      // utuh per setoran yang bisa double-count lintas bulan).
      this.prisma.ipl.findMany({
        where: { OR: resolved.periodeOr, setoran: { status: 'DIKONFIRMASI' } },
        select: { nominalIpl: true },
      }),
      this.prisma.ipl.findMany({
        where: { setoran: { status: 'DIKONFIRMASI' } },
        select: { nominalIpl: true },
      }),
      this.prisma.setoranIpl.findMany({
        where: { tagihan: { some: { OR: resolved.periodeOr } } },
        select: {
          id: true,
          area: true,
          status: true,
          totalIpl: true,
          createBy: true,
          createDate: true,
          konfirmasiBy: true,
          tanggalKonfirmasi: true,
        },
        orderBy: { createDate: 'desc' },
        take: 5,
      }),
    ]);

    // ── KPI 1: diterima vs tertagih (total setoran utuh, sama dengan menu) ──
    const iplTertagih = tertagihAgg._sum.nominalIpl ?? 0;
    const diterima = setoranDikonf.reduce((s, r) => s + r.totalIpl, 0);
    const rtSudahSetor = new Set(setoranDikonf.map((r) => r.area)).size;
    const persen =
      iplTertagih > 0
        ? Math.min(100, Math.round((diterima / iplTertagih) * 100))
        : null;

    // ── KPI 2: menunggu ──
    const tungguNominal = setoranTunggu.reduce((s, r) => s + r.totalIpl, 0);
    const tungguRt = new Set(setoranTunggu.map((r) => r.area));

    // ── Agregat per RT untuk KPI 3 ──
    const terkumpul: Record<string, number> = {};
    const rtAdaTagihan = new Set<string>();
    for (const r of tagihanRtRows) rtAdaTagihan.add(r.rumah.rt);
    for (const r of lunasRows) {
      if (r.rumah.status === 'KOSONG') continue;
      terkumpul[r.rumah.rt] = (terkumpul[r.rumah.rt] ?? 0) + r.nominalIpl;
    }
    const dikonfPerRt: Record<string, number> = {};
    for (const r of setoranDikonf) {
      dikonfPerRt[r.area] = (dikonfPerRt[r.area] ?? 0) + r.totalIpl;
    }
    const tungguPerRt: Record<string, number> = {};
    for (const r of setoranTunggu) {
      tungguPerRt[r.area] = (tungguPerRt[r.area] ?? 0) + r.totalIpl;
    }
    // Setoran terakhir per RT di periode ini (untuk status mini-list).
    const terakhirPerRt: Record<string, { status: string; tgl: Date }> = {};
    const catatTerakhir = (
      area: string,
      status: string,
      tgl: Date | null,
      fallback: Date,
    ) => {
      const t = tgl ?? fallback;
      if (!terakhirPerRt[area] || t > terakhirPerRt[area].tgl) {
        terakhirPerRt[area] = { status, tgl: t };
      }
    };
    for (const r of setoranDikonf)
      catatTerakhir(r.area, 'DIKONFIRMASI', null, r.createDate);
    for (const r of setoranTunggu)
      catatTerakhir(r.area, 'MENUNGGU_KONFIRMASI', null, r.createDate);
    for (const r of setoranDitolak) {
      catatTerakhir(r.area, 'DITOLAK', r.tanggalKonfirmasi, r.createDate);
    }

    const belumItems = RT_LIST.map((rt) => ({
      rt,
      nominal: Math.max(
        0,
        (terkumpul[rt] ?? 0) - (dikonfPerRt[rt] ?? 0) - (tungguPerRt[rt] ?? 0),
      ),
      status:
        terakhirPerRt[rt]?.status === 'DITOLAK' ? 'Ditolak' : 'Belum setor',
    }))
      .filter((r) => r.nominal > 0)
      .sort((a, b) => b.nominal - a.nominal);
    const belumTotal = belumItems.reduce((s, r) => s + r.nominal, 0);

    // ── KPI 4: kas RW (Opsi A — mirror keuangan.service area=RW) ──
    // Saldo = setoran IPL DIKONFIRMASI + manual RW (tanpa kas RT yang
    // masih dipegang RT). Masuk periode = setoran periode + manual masuk.
    const sumRows = (rows: { nominal: number }[]) =>
      rows.reduce((s, r) => s + r.nominal, 0);
    const setoranMasuk = setoranPeriodeIpl.reduce(
      (s, r) => s + r.nominalIpl,
      0,
    );
    const manualMasuk = sumRows(
      kasPeriode.filter((t) => t.tipe === 'PEMASUKAN'),
    );
    const manualKeluar = sumRows(
      kasPeriode.filter((t) => t.tipe === 'PENGELUARAN'),
    );
    const masuk = setoranMasuk + manualMasuk;
    const keluar = manualKeluar;
    const masukCount =
      setoranDikonf.length +
      kasPeriode.filter((t) => t.tipe === 'PEMASUKAN').length;
    const keluarCount = kasPeriode.filter(
      (t) => t.tipe === 'PENGELUARAN',
    ).length;
    const saldo =
      setoranSemua.reduce((s, r) => s + r.nominalIpl, 0) +
      sumRows(kasSemua.filter((t) => t.tipe === 'PEMASUKAN')) -
      sumRows(kasSemua.filter((t) => t.tipe === 'PENGELUARAN'));

    // ── Tren mengikuti range terpilih (default 1 bar bulan berjalan).
    // Bar per bulan = total utuh setoran DIKONFIRMASI yang menyentuh bulan itu
    // (semantik `some`, sama dengan menu Setoran & KPI).
    const trenDiterima = new Map<string, number>();
    for (const r of setoranDikonf) {
      const touched = new Set(
        r.tagihan.map((t) => `${t.tahunPeriode}-${t.bulanPeriode}`),
      );
      for (const key of touched) {
        if (rangeYm.has(key)) {
          trenDiterima.set(key, (trenDiterima.get(key) ?? 0) + r.totalIpl);
        }
      }
    }
    const tren = resolved.periodeList.map((p) => {
      const ymKey = `${p.tahun}-${p.bulan}`;
      return {
        ym: ymKey,
        label: p.label,
        diterima: trenDiterima.get(ymKey) ?? 0,
        berjalan: ymKey === nowYm,
      };
    });

    // ── Perlu tindakan ──
    const rtAdaSusulan = new Set([
      ...setoranDikonf.map((r) => r.area),
      ...setoranTunggu.map((r) => r.area),
    ]);
    const ditolakAktif = setoranDitolak.filter(
      (r) => !rtAdaSusulan.has(r.area),
    );
    const rtKosong = RT_LIST.filter((rt) => !rtAdaTagihan.has(rt)).map(
      (rt) => ({ rt, alasan: 'belum-buat' as const }),
    );
    const rtBelumTerkumpul = RT_LIST.filter(
      (rt) =>
        rtAdaTagihan.has(rt) && (terkumpul[rt] ?? 0) === 0 && !tungguRt.has(rt),
    ).map((rt) => ({ rt, alasan: 'belum-terkumpul' as const }));

    return {
      periode: { dari: resolved.dariYm, sampai: resolved.sampaiYm },
      kpi: {
        diterima: {
          nominal: diterima,
          persen,
          iplTertagih,
          rtSudahSetor,
          totalRt: RT_LIST.length,
        },
        menunggu: {
          nominal: tungguNominal,
          count: setoranTunggu.length,
          rtCount: tungguRt.size,
        },
        belumDisetor: {
          total: belumTotal,
          rtCount: belumItems.length,
          items: belumItems.slice(0, 3),
          sisa: Math.max(0, belumItems.length - 3),
        },
        kasRw: {
          saldo,
          masuk,
          masukCount,
          keluar,
          keluarCount,
          net: masuk - keluar,
          // Breakdown agar frontend bisa menampilkan "termasuk Setor IPL".
          setoranMasuk,
          setoranCount: setoranDikonf.length,
          manualMasuk,
          manualKeluar,
        },
      },
      tren,
      perluTindakan: {
        total:
          setoranTunggu.length +
          ditolakAktif.length +
          rtKosong.length +
          rtBelumTerkumpul.length,
        menunggu: setoranTunggu.map((r) => ({
          id: r.id,
          rt: r.area,
          nominal: r.totalIpl,
          penyetor: r.createBy,
          jumlahTagihan: r.jumlahTagihan,
          waktuKirim: r.createDate,
        })),
        ditolak: ditolakAktif.map((r) => ({
          id: r.id,
          rt: r.area,
          tanggalDitolak: r.tanggalKonfirmasi ?? r.createDate,
          alasan: r.catatan,
        })),
        rtKosong: [...rtKosong, ...rtBelumTerkumpul],
      },
      aktivitas: aktivitasRows.map((r) => ({
        id: r.id,
        rt: r.area,
        status: r.status,
        nominal: r.totalIpl,
        oleh: r.status === 'MENUNGGU_KONFIRMASI' ? r.createBy : r.konfirmasiBy,
        waktu:
          r.status === 'MENUNGGU_KONFIRMASI'
            ? r.createDate
            : (r.tanggalKonfirmasi ?? r.createDate),
      })),
    };
  }
}
