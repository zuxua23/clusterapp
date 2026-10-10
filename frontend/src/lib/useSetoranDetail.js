"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { setoranApi } from "@/lib/api";
import { showMessage } from "@/lib/message";
import { MONTHS as SD_BULAN, formatRupiah, formatTanggalPendek as formatTanggal } from "@/lib/format";

export { SD_BULAN, formatRupiah, formatTanggal };

export function formatJam(d) {
  if (!d) return "-";
  return new Date(d).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function formatTanggalJam(d) {
  return `${formatTanggal(d)} · ${formatJam(d)}`;
}

export function periodeKey(tahun, bulan) {
  const y = Number(tahun);
  const m = Number(bulan);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return NaN;
  return y * 100 + m;
}

function labelPeriode(tahun, bulan) {
  return `${SD_BULAN[Number(bulan) - 1] || bulan} ${tahun}`;
}

/** State modal Detail Setoran, dipisah dari view supaya tidak hilang saat tampilan desktop/mobile bertukar. */
export function useSetoranDetail(id, { onSuccess, onClose } = {}) {
  const [data, setData] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [modeTolak, setModeTolak] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [submitting, setSubmitting] = useState(null); // "TERIMA" | "TOLAK" | null
  const [actionError, setActionError] = useState(null);

  const reload = useCallback(async () => {
    setLoadingDetail(true);
    setLoadError(null);
    try {
      const res = await setoranApi.getById(id);
      setData(res);
    } catch (e) {
      setLoadError(e?.message || "Gagal memuat detail setoran.");
    } finally {
      setLoadingDetail(false);
    }
  }, [id]);

  useEffect(() => {
    // Fetch awal; state berikutnya mengalir dari promise, bukan render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  const derived = useMemo(() => {
    const tagihan = data?.tagihan ?? [];
    const rows = [...tagihan];
    const totalRows = rows.reduce((s, t) => s + (t.nominalIpl || 0), 0);
    const unitCount = new Set(rows.map((t) => t.rumah?.blokRumah).filter(Boolean)).size;
    const keys = rows.map((t) => periodeKey(t.tahunPeriode, t.bulanPeriode)).filter(Number.isFinite).sort((a, b) => a - b);
    let rangeLabel = "-";
    if (keys.length > 0) {
      const first = rows.find((t) => periodeKey(t.tahunPeriode, t.bulanPeriode) === keys[0]);
      const last = rows.find((t) => periodeKey(t.tahunPeriode, t.bulanPeriode) === keys[keys.length - 1]);
      const a = labelPeriode(first.tahunPeriode, first.bulanPeriode);
      const b = labelPeriode(last.tahunPeriode, last.bulanPeriode);
      rangeLabel = a === b ? a : `${a} - ${b}`;
    }
    const totalSetoran = data?.totalIpl ?? 0;
    const selisih = totalSetoran - totalRows;
    return {
      rows,
      count: rows.length,
      totalRows,
      totalSetoran,
      unitCount,
      rangeLabel,
      selisih,
      cocok: selisih === 0,
    };
  }, [data]);

  const batalTolak = useCallback(() => {
    setModeTolak(false);
    setAlasan("");
    setActionError(null);
  }, []);

  const terima = useCallback(async () => {
    if (submitting) return;
    setSubmitting("TERIMA");
    setActionError(null);
    try {
      const res = await setoranApi.konfirmasi(id, { action: "TERIMA" });
      await showMessage("Dikonfirmasi", res?.message || "Setoran dikonfirmasi.", "success");
      onSuccess?.();
      onClose?.();
    } catch (e) {
      setActionError(e?.message || "Gagal mengkonfirmasi setoran.");
    } finally {
      setSubmitting(null);
    }
  }, [id, submitting, onSuccess, onClose]);

  const kirimTolak = useCallback(async () => {
    const catatan = alasan.trim();
    if (!catatan || submitting) return;
    setSubmitting("TOLAK");
    setActionError(null);
    try {
      const res = await setoranApi.konfirmasi(id, { action: "TOLAK", catatan });
      await showMessage("Ditolak", res?.message || "Setoran ditolak.", "info");
      onSuccess?.();
      onClose?.();
    } catch (e) {
      setActionError(e?.message || "Gagal menolak setoran.");
    } finally {
      setSubmitting(null);
    }
  }, [id, alasan, submitting, onSuccess, onClose]);

  return {
    data,
    loadingDetail,
    loadError,
    reload,
    modeTolak,
    setModeTolak,
    alasan,
    setAlasan,
    batalTolak,
    submitting,
    actionError,
    terima,
    kirimTolak,
    derived,
    menunggu: data?.status === "MENUNGGU_KONFIRMASI",
  };
}
