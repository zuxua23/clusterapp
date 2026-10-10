import { BadRequestException } from '@nestjs/common';

export interface PeriodeItem {
  bulan: string;
  tahun: string;
  label: string;
}

export interface ResolvedPeriode {
  periodeList: PeriodeItem[];
  periodeOr: { bulanPeriode: string; tahunPeriode: string }[];
  dariYm: string;
  sampaiYm: string;
}

/** ?dari=YYYY-MM&sampai=YYYY-MM -> daftar periode (maks 12 bulan, sisi terbalik ditukar, tanpa param = null). */
export function resolvePeriode(
  dari?: string,
  sampai?: string,
): ResolvedPeriode | null {
  const parseYm = (v?: string) => {
    if (!v || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return null;
    const [tahun, bulan] = v.split('-');
    return { bulan, tahun, ym: `${tahun}-${bulan}` };
  };

  const dariP = parseYm(dari);
  const sampaiP = parseYm(sampai);

  if ((dari && !dariP) || (sampai && !sampaiP)) {
    throw new BadRequestException(
      'Format periode tidak valid. Gunakan YYYY-MM, contoh: 2026-01.',
    );
  }
  if (!dariP && !sampaiP) return null;

  let awal = dariP ?? sampaiP!;
  let akhir = sampaiP ?? dariP!;
  if (awal.ym > akhir.ym) [awal, akhir] = [akhir, awal];

  const periodeList: PeriodeItem[] = [];
  const cursor = new Date(Number(awal.tahun), Number(awal.bulan) - 1, 1);
  const end = new Date(Number(akhir.tahun), Number(akhir.bulan) - 1, 1);
  while (cursor <= end) {
    const bulan = String(cursor.getMonth() + 1).padStart(2, '0');
    const tahun = String(cursor.getFullYear());
    periodeList.push({
      bulan,
      tahun,
      label: cursor.toLocaleDateString('id-ID', {
        month: 'short',
        year: '2-digit',
      }),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  if (periodeList.length > 12) {
    throw new BadRequestException('Rentang periode maksimal 12 bulan.');
  }

  return {
    periodeList,
    periodeOr: periodeList.map((p) => ({
      bulanPeriode: p.bulan,
      tahunPeriode: p.tahun,
    })),
    dariYm: `${periodeList[0].tahun}-${periodeList[0].bulan}`,
    sampaiYm: `${periodeList[periodeList.length - 1].tahun}-${periodeList[periodeList.length - 1].bulan}`,
  };
}

/**
 * Batas tanggal (inklusif-awal, eksklusif-akhir) dari YM agar bisa dipakai
 * untuk filter kolom DateTime seperti KasTransaksi.tanggal.
 */
export function ymRangeToDates(dariYm: string, sampaiYm: string) {
  const [y1, m1] = dariYm.split('-').map(Number);
  const [y2, m2] = sampaiYm.split('-').map(Number);
  return {
    gte: new Date(y1, m1 - 1, 1),
    lt: new Date(y2, m2, 1),
  };
}

/** YM bulan berjalan, mis. "2026-09". */
export function currentYm() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
