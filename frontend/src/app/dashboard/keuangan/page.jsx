"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Plus,
  Search,
  Wallet,
  TrendingUp,
  TrendingDown,
  Scale,
  PiggyBank,
  Eye,
  Pencil,
  Trash2,
  Download,
  ChevronDown,
} from "lucide-react";
import { keuanganApi, openProtectedFile } from "@/lib/api";
import { areaLabel, can, isWargaView, scopeOf } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import { showMessage, showConfirm } from "@/lib/message";
import FilterPopover, { FilterField } from "@/components/ui/FilterPopover";
import Pagination from "@/components/ui/Pagination";
import Select from "@/components/ui/Select";
import FileDropzone from "@/components/ui/FileDropzone";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { usePagination } from "@/lib/usePagination";
import { useMediaQuery } from "@/lib/useMediaQuery";
import {
  formatRupiah,
  formatTanggalPendek as formatTanggal,
  getCurrentYm,
  formatYmPendek,
  formatYmPanjang as formatYmLengkap,
} from "@/lib/format";

// ── Helpers & opsi ────────────────────────────────────────────────────────────
const KATEGORI_MASUK = ["Dana Sosial", "Sewa Fasilitas", "Donasi", "Lainnya"];
const KATEGORI_KELUAR = ["Operasional", "Perawatan & Perbaikan", "Acara & Kegiatan", "Lainnya"];

const TIPE_FILTER_OPTIONS = [
  { val: "SEMUA", label: "Semua Tipe" },
  { val: "PEMASUKAN", label: "Pemasukan" },
  { val: "PENGELUARAN", label: "Pengeluaran" },
];

function toDateInput(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toISOString().slice(0, 10);
}

function KasTipeBadge({ tipe }) {
  return (
    <span className={`ipl-badge ${tipe === "PEMASUKAN" ? "badge-lunas" : "badge-belum"}`}>
      {tipe === "PEMASUKAN" ? "Pemasukan" : "Pengeluaran"}
    </span>
  );
}

// Hanya transaksi kas manual (sumber "MANUAL") yang punya file bukti sendiri —
// baris agregat IPL_KAS/SETORAN adalah gabungan banyak pembayaran, tidak punya satu file.
function getBuktiPath(t) {
  if (!t?.buktiFile) return null;
  return keuanganApi.buktiPath(t.id);
}

// ── Grafik batang grup: pemasukan vs pengeluaran per bulan ────────────────────
function ArusKasChart({ data }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.flatMap((d) => [d.pemasukan, d.pengeluaran]), 1);
  const bar = (value, color, title) => (
    <div
      title={title}
      style={{
        width: 18,
        height: `${Math.max((value / max) * 100, 3)}%`,
        background: color,
        borderRadius: "4px 4px 2px 2px",
      }}
    />
  );
  return (
    <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "12px 4px 0" }}>
      {data.map((d) => (
        <div
          key={`${d.tahun}-${d.bulan}`}
          style={{ flex: "1 0 44px", minWidth: 44, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
        >
          <div style={{ height: 150, display: "flex", alignItems: "flex-end", gap: 4 }}>
            {bar(d.pemasukan, "#16a34a", `Pemasukan ${d.label}: ${formatRupiah(d.pemasukan)}`)}
            {bar(d.pengeluaran, "#dc2626", `Pengeluaran ${d.label}: ${formatRupiah(d.pengeluaran)}`)}
          </div>
          <span style={{ fontSize: 11, color: "#64748b" }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Modal: Catat / Ubah Transaksi ─────────────────────────────────────────────
function KasFormModal({ initial, pilihArea = false, onClose, onSuccess }) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    tipe: initial?.tipe || "PENGELUARAN",
    kategori: initial?.kategori || "",
    nominal: initial?.nominal || "",
    tanggal: toDateInput(initial?.tanggal) || new Date().toISOString().slice(0, 10),
    keterangan: initial?.keterangan || "",
    area: initial?.area || "RW",
  });
  const [bukti, setBukti] = useState(null);
  const [loading, setLoading] = useState(false);

  const isIplKasEdit = initial?.sumber === "IPL_KAS";
  const baseKategoriOptions = form.tipe === "PEMASUKAN" ? KATEGORI_MASUK : KATEGORI_KELUAR;
  const kategoriOptions = isIplKasEdit && initial?.kategori && !baseKategoriOptions.includes(initial.kategori)
    ? [...baseKategoriOptions, initial.kategori]
    : baseKategoriOptions;

  const handleTipeChange = (tipe) => {
    setForm((f) => ({ ...f, tipe, kategori: "" }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.kategori) {
      showMessage("Validasi", "Pilih kategori transaksi.", "warning");
      return;
    }
    if (!form.nominal || Number(form.nominal) <= 0) {
      showMessage("Validasi", "Nominal harus lebih dari 0.", "warning");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        tipe: form.tipe,
        kategori: form.kategori,
        nominal: Number(form.nominal),
        tanggal: new Date(form.tanggal).toISOString(),
        keterangan: form.keterangan || undefined,
        // Pengurus otomatis menulis ke kas wilayahnya sendiri; hanya scope ALL (admin) boleh memilih.
        ...(pilihArea ? { area: form.area } : {}),
      };
      if (bukti) payload.bukti = bukti;
      const res = isEdit
        ? await keuanganApi.update(initial.id, payload)
        : await keuanganApi.create(payload);
      showMessage("Berhasil!", res.message, "success");
      onSuccess();
      onClose();
    } catch (err) {
      showMessage("Gagal Menyimpan", err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ipl-modal-overlay" onClick={onClose}>
      <div className="ipl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ipl-modal-header">
          <h3>{isEdit ? "Ubah Transaksi Kas" : "Catat Transaksi Kas"}</h3>
          <button className="ipl-modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="ipl-modal-body">
          {pilihArea && (
            <div className="ipl-form-group">
              <label>Wilayah kas</label>
              <Select
                value={form.area}
                onChange={(v) => setForm({ ...form, area: v })}
                className="ipl-select"
                options={["RW", "RT_01", "RT_02", "RT_03", "RT_04"].map((a) => ({ value: a, label: areaLabel(a) }))}
              />
            </div>
          )}
          <div className="ipl-form-row">
            <div className="ipl-form-group">
              <label>Tipe</label>
              <Select
                value={form.tipe}
                onChange={handleTipeChange}
                className="ipl-select"
                options={[
                  { value: "PEMASUKAN", label: "Pemasukan" },
                  { value: "PENGELUARAN", label: "Pengeluaran" },
                ]}
              />
            </div>
            <div className="ipl-form-group">
              <label>Kategori</label>
              <Select
                value={form.kategori}
                onChange={(v) => setForm({ ...form, kategori: v })}
                className="ipl-select"
                placeholder="- Pilih -"
                options={kategoriOptions.map((k) => ({ value: k, label: k }))}
              />
            </div>
          </div>
          <div className="ipl-form-row">
            <div className="ipl-form-group">
              <label>Nominal (Rp)</label>
              <CurrencyInput
                placeholder="Contoh: 500.000"
                value={form.nominal}
                onChange={(v) => setForm({ ...form, nominal: v })}
                required
              />
            </div>
            <div className="ipl-form-group">
              <label>Tanggal</label>
              <input
                type="date"
                value={form.tanggal}
                onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
                className="ipl-input"
                required
              />
            </div>
          </div>
          <div className="ipl-form-group">
            <label>Keterangan <span className="label-optional">(opsional)</span></label>
            <textarea
              rows={3}
              placeholder="Contoh: Beli lampu taman blok A..."
              value={form.keterangan}
              onChange={(e) => setForm({ ...form, keterangan: e.target.value })}
              className="ipl-textarea"
            />
          </div>
          <div className="ipl-form-group">
            <label>Bukti / Nota <span className="label-optional">(opsional, JPG/PNG/PDF)</span></label>
            <FileDropzone
              file={bukti}
              onFileSelect={setBukti}
              onRemove={() => setBukti(null)}
              accept=".jpg,.jpeg,.png,.pdf"
              maxSizeMB={10}
              placeholder="Klik atau seret file ke sini (opsional)"
              hint="JPG / PNG / PDF · Maks. 10 MB"
              onError={(msg) => showMessage("File Terlalu Besar", msg, "warning")}
            />
            {isEdit && !bukti && initial?.buktiFile && (
              <button
                type="button"
                className="portal-download-link"
                style={{ marginTop: 6, display: "inline-block" }}
                onClick={() => openProtectedFile(keuanganApi.buktiPath(initial.id))}
              >
                <Eye size={12} /> Lihat bukti saat ini
              </button>
            )}
          </div>
          <div className="ipl-modal-footer">
            <button type="button" className="btn-ipl-secondary" onClick={onClose} disabled={loading}>
              Batal
            </button>
            <button type="submit" className="btn-ipl-primary" disabled={loading}>
              {loading ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Catat Transaksi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Admin/Pengurus: laporan keuangan ──────────────────────────────────────────
function AdminKeuanganView({ user }) {
  const bolehTambah = can(user, "keuangan.create");
  const bolehUbah = can(user, "keuangan.update");
  const bolehHapus = can(user, "keuangan.delete");
  // Scope ALL (ketua/bendahara RW, admin) melihat RW + semua RT; scope AREA hanya wilayahnya.
  const semuaArea = scopeOf(user, "keuangan.read") === "ALL";
  // Isolasi kas per wilayah: hanya admin yang boleh memilih wilayah lain.
  // Pengurus (RT maupun RW) terkunci ke kas areanya sendiri.
  const isAdmin = user?.role === "ADMIN";
  const pilihAreaTulis = scopeOf(user, "keuangan.create") === "ALL" && isAdmin;
  const hideRincianRT = ["BENDAHARA_RT", "KETUA_RT", "SEKRE_RT", "BENDAHARA_RW"].includes(user?.role);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const formatYmPanjang = formatYmPendek;
  const formatYmFull = formatYmLengkap;
  const monthDiffInclusive = (dari, sampai) => {
    const [y1, m1] = dari.split("-").map(Number);
    const [y2, m2] = sampai.split("-").map(Number);
    return (y2 - y1) * 12 + (m2 - m1) + 1;
  };

  const [ringkasan, setRingkasan] = useState(null);
  const [riwayat, setRiwayat] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter periode (sama seperti Tagihan IPL)
  const [periodeDari, setPeriodeDari] = useState(getCurrentYm);
  const [periodeSampai, setPeriodeSampai] = useState(getCurrentYm);
  const [filterTipe, setFilterTipe] = useState("SEMUA");
  const [filterKategori, setFilterKategori] = useState("SEMUA");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [draftPeriodeDari, setDraftPeriodeDari] = useState(getCurrentYm);
  const [draftPeriodeSampai, setDraftPeriodeSampai] = useState(getCurrentYm);
  const [draftFilterTipe, setDraftFilterTipe] = useState("SEMUA");
  const [draftFilterKategori, setDraftFilterKategori] = useState("SEMUA");
  // Deep-link dari Dashboard RW ("Lihat di Keuangan" → ?area=RW) agar
  // filter langsung menampilkan kas RW-murni yang angkanya 1:1 dengan KPI.
  // Lazy initializer (bukan useEffect) agar lolos react-hooks/set-state-in-effect.
  const areaAwal = () => {
    if (typeof window === "undefined") return "SEMUA";
    const area = new URLSearchParams(window.location.search).get("area");
    return area && ["SEMUA", "RW", "RT_01", "RT_02", "RT_03", "RT_04"].includes(area)
      ? area
      : "SEMUA";
  };
  const [filterArea, setFilterArea] = useState(areaAwal);
  const [draftFilterArea, setDraftFilterArea] = useState(areaAwal);

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);

  // Export CSV/XLSX
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(null);
  const exportRef = useRef(null);

  const [dari, sampai] = periodeDari > periodeSampai
    ? [periodeSampai, periodeDari]
    : [periodeDari, periodeSampai];
  const rangeError = monthDiffInclusive(dari, sampai) > 12
    ? "Rentang periode maksimal 12 bulan."
    : "";

  const [draftDariN, draftSampaiN] = draftPeriodeDari > draftPeriodeSampai
    ? [draftPeriodeSampai, draftPeriodeDari]
    : [draftPeriodeDari, draftPeriodeSampai];
  const draftRangeError = draftPeriodeDari && draftPeriodeSampai &&
    monthDiffInclusive(draftDariN, draftSampaiN) > 12
    ? "Rentang periode maksimal 12 bulan."
    : "";

  const isDefaultPeriode = periodeDari === getCurrentYm() && periodeSampai === getCurrentYm();
  const periodeLabel = periodeDari === periodeSampai
    ? formatYmPanjang(periodeDari)
    : `${formatYmPanjang(periodeDari)} - ${formatYmPanjang(periodeSampai)}`;
  const periodeLabelFull = periodeDari === periodeSampai
    ? formatYmFull(periodeDari)
    : `${formatYmFull(periodeDari)} - ${formatYmFull(periodeSampai)}`;

  const kategoriOptions = [
    ...new Set(
      draftFilterTipe === "PEMASUKAN"
        ? [...KATEGORI_MASUK, "Setor IPL"]
        : draftFilterTipe === "PENGELUARAN"
          ? KATEGORI_KELUAR
          : [...KATEGORI_MASUK, ...KATEGORI_KELUAR, "Setor IPL"]
    ),
  ];

  const loadData = useCallback(async () => {
    if (rangeError) return;
    setIsLoading(true);
    try {
      const [ring, riw] = await Promise.all([
        keuanganApi.getRingkasan({ dari, sampai, area: filterArea }),
        keuanganApi.getAll({ dari, sampai, tipe: filterTipe, kategori: filterKategori, search, area: filterArea }),
      ]);
      setRingkasan(ring);
      setRiwayat(riw.riwayat || []);
    } catch (err) {
      showMessage("Gagal Memuat Data", err.message, "error");
    } finally {
      setIsLoading(false);
    }
  }, [dari, sampai, rangeError, filterTipe, filterKategori, search, filterArea]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const { page, totalPages, paginatedItems: riwayatPage, prev, next } = usePagination(riwayat, [riwayat]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleFilterOpen = () => {
    setDraftPeriodeDari(periodeDari);
    setDraftPeriodeSampai(periodeSampai);
    setDraftFilterTipe(filterTipe);
    setDraftFilterKategori(filterKategori);
    setDraftFilterArea(filterArea);
  };
  const handleFilterApply = () => {
    if (draftRangeError) return;
    setPeriodeDari(draftPeriodeDari);
    setPeriodeSampai(draftPeriodeSampai);
    setFilterTipe(draftFilterTipe);
    setFilterKategori(draftFilterKategori);
    setFilterArea(draftFilterArea);
  };
  const handleFilterReset = () => {
    const cur = getCurrentYm();
    setPeriodeDari(cur);
    setPeriodeSampai(cur);
    setFilterTipe("SEMUA");
    setFilterKategori("SEMUA");
    setDraftPeriodeDari(cur);
    setDraftPeriodeSampai(cur);
    setDraftFilterTipe("SEMUA");
    setDraftFilterKategori("SEMUA");
    setFilterArea("SEMUA");
    setDraftFilterArea("SEMUA");
  };

  // Tutup menu export saat klik di luar / tekan Escape
  useEffect(() => {
    if (!exportOpen) return;
    const onDown = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setExportOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [exportOpen]);

  const handleExport = async (format) => {
    setExportOpen(false);
    setExporting(format);
    try {
      // Nama cadangan bila header server tak terbaca browser — dirakit dari
      // filter yang tampil di layar sehingga periode selalu ikut.
      const rtSuffix =
        filterArea && filterArea !== "SEMUA" && filterArea !== "RW" ? `${filterArea.replace("_", "")}-` : "";
      const filename = await keuanganApi.exportFile({
        format,
        dari,
        sampai,
        tipe: filterTipe,
        kategori: filterKategori,
        search,
        area: filterArea,
        fallbackFilename: `Laporan Kas-${rtSuffix}${periodeLabel}.${format === "xlsx" ? "xlsx" : "csv"}`,
      });
      showMessage("Berhasil", `File ${filename} berhasil diunduh.`, "success");
    } catch (err) {
      showMessage("Gagal Mengekspor", err.message, "error");
    } finally {
      setExporting(null);
    }
  };

  const handleDelete = async (item) => {
    const confirmed = await showConfirm(
      "Hapus Transaksi?",
      `${item.tipe === "PEMASUKAN" ? "Pemasukan" : "Pengeluaran"} ${item.kategori} sebesar ${formatRupiah(item.nominal)} akan dihapus.`,
      "warning",
      "Ya, Hapus"
    );
    if (!confirmed) return;
    try {
      const res = await keuanganApi.remove(item.id);
      showMessage("Dihapus!", res.message, "success");
      loadData();
    } catch (err) {
      showMessage("Gagal Menghapus", err.message, "error");
    }
  };

  return (
    <div className="page-stack">
      {/* ── Header ── */}
      <div className="ipl-page-header">
        <div>
          <h2 className="ipl-page-title">Keuangan Cluster</h2>
          <p className="ipl-page-subtitle">
            {rangeError
              ? "Laporan pemasukan dan pengeluaran kas cluster"
              : `Laporan kas periode ${periodeLabel}`}
          </p>
        </div>

        <div className="export-split" ref={exportRef}>
          <button
            type="button"
            className="btn-ipl-teal"
            onClick={() => handleExport("xlsx")}
            disabled={!!exporting || !!rangeError || isLoading}
            title={rangeError || "Unduh Riwayat Kas sebagai Excel (.xlsx)"}
          >
            <Download size={15} /> {exporting ? "Menyiapkan..." : "Export"}
          </button>
          <button
            type="button"
            className="btn-ipl-teal btn-ipl-teal-icon"
            onClick={() => setExportOpen((o) => !o)}
            disabled={!!exporting || !!rangeError || isLoading}
            aria-label="Pilihan format export"
            aria-expanded={exportOpen}
            title="Pilihan format export"
          >
            <ChevronDown size={15} />
          </button>
          {exportOpen && (
            <div className="export-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="export-menu-item"
                onClick={() => handleExport("xlsx")}
                disabled={!!exporting}
              >
                <strong>Export Excel (.xlsx)</strong>
                <span>Kolom angka bisa di-SUM di Excel</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="export-menu-item"
                onClick={() => handleExport("csv")}
                disabled={!!exporting}
              >
                <strong>Export CSV (.csv)</strong>
                <span>Format teks, delimiter koma</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Summary Cards — Keuangan Cluster (scoped redesign) ── */}
      {ringkasan && (
        <div className="ipl-summary-grid keu-summary-grid">
          <div className="ipl-summary-card keu-card keu-teal">
            <div className="keu-icon-circle"><Wallet size={22} strokeWidth={2} /></div>
            <div className="keu-card-text">
              <span className="ipl-summary-label">Saldo Kas Saat Ini</span>
              <span className="ipl-summary-value">{formatRupiah(ringkasan.saldoKas)}</span>
            </div>
          </div>
          <div className="ipl-summary-card keu-card keu-green">
            <div className="keu-icon-circle"><TrendingUp size={22} strokeWidth={2} /></div>
            <div className="keu-card-text">
              <span className="ipl-summary-label">Pemasukan Periode</span>
              <span className="ipl-summary-value">{formatRupiah(ringkasan.totalPemasukan)}</span>
            </div>
          </div>
          <div className="ipl-summary-card keu-card keu-red">
            <div className="keu-icon-circle"><TrendingDown size={22} strokeWidth={2} /></div>
            <div className="keu-card-text">
              <span className="ipl-summary-label">Pengeluaran Periode</span>
              <span className="ipl-summary-value">{formatRupiah(ringkasan.totalPengeluaran)}</span>
            </div>
          </div>
          <div className="ipl-summary-card keu-card keu-purple">
            <div className="keu-icon-circle"><Scale size={22} strokeWidth={2} /></div>
            <div className="keu-card-text">
              <span className="ipl-summary-label">Selisih Periode</span>
              <span className="ipl-summary-value">{formatRupiah(ringkasan.saldoPeriode)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Tambah + Search + Filter ── */}
      <div className="page-toolbar-row toolbar-row-reverse-mobile">
        <div className="list-toolbar-row">
          <div className="list-search-wrap">
            <Search size={15} className="list-search-icon" />
            <input
              type="text"
              placeholder="Kategori / keterangan..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="list-search-input"
            />
          </div>

          <FilterPopover
            active={!isDefaultPeriode || filterTipe !== "SEMUA" || filterKategori !== "SEMUA" || filterArea !== "SEMUA"}
            activeCount={
              (!isDefaultPeriode ? 1 : 0) +
              (filterTipe !== "SEMUA" ? 1 : 0) +
              (filterKategori !== "SEMUA" ? 1 : 0) +
              (filterArea !== "SEMUA" ? 1 : 0)
            }
            onOpen={handleFilterOpen}
            onApply={handleFilterApply}
            onReset={handleFilterReset}
            applyDisabled={!!draftRangeError}
          >
            <FilterField label="Periode Dari">
              <input
                type="month"
                value={draftPeriodeDari}
                max={draftPeriodeSampai || getCurrentYm()}
                onChange={(e) => e.target.value && setDraftPeriodeDari(e.target.value)}
                className="ipl-input"
              />
            </FilterField>
            <FilterField label="Periode Sampai">
              <input
                type="month"
                value={draftPeriodeSampai}
                min={draftPeriodeDari || undefined}
                max={getCurrentYm()}
                onChange={(e) => e.target.value && setDraftPeriodeSampai(e.target.value)}
                className="ipl-input"
              />
            </FilterField>
            {draftRangeError && (
              <p style={{ color: "#dc2626", fontSize: 12, margin: 0 }}>{draftRangeError}</p>
            )}
            <FilterField label="Tipe">
              <Select
                className="ipl-select ipl-select-sm"
                value={draftFilterTipe}
                onChange={(v) => { setDraftFilterTipe(v); setDraftFilterKategori("SEMUA"); }}
                options={TIPE_FILTER_OPTIONS.map(({ val, label }) => ({ value: val, label }))}
              />
            </FilterField>
            <FilterField label="Kategori">
              <Select
                className="ipl-select ipl-select-sm"
                value={draftFilterKategori}
                onChange={(v) => setDraftFilterKategori(v)}
                options={[
                  { value: "SEMUA", label: "Semua Kategori" },
                  ...kategoriOptions.map((k) => ({ value: k, label: k })),
                ]}
              />
            </FilterField>
            {semuaArea && isAdmin && (
              <FilterField label="Wilayah">
                <Select
                  className="ipl-select ipl-select-sm"
                  value={draftFilterArea}
                  onChange={(v) => setDraftFilterArea(v)}
                  options={[
                    { value: "SEMUA", label: "Semua Wilayah" },
                    ...["RW", "RT_01", "RT_02", "RT_03", "RT_04"].map((a) => ({ value: a, label: areaLabel(a) })),
                  ]}
                />
              </FilterField>
            )}
          </FilterPopover>
        </div>
        {bolehTambah && (
          <button
            id="btn-catat-transaksi"
            className="btn-ipl-primary"
            onClick={() => { setEditItem(null); setShowForm(true); }}
          >
            <Plus size={16} /> Catat Transaksi
          </button>
        )}
      </div>

      {/* ── Rincian pemasukan otomatis & per wilayah ── */}
      {ringkasan && !hideRincianRT && (
        <div className="content-card keu-rincian">
          <div className="db-section-header">
            <PiggyBank size={17} />
            <h3>Sumber Pemasukan &amp; Wilayah</h3>
            <span className="db-section-sub">{periodeLabel}</span>
          </div>
          <div className="keu-rincian-grid">
            <div>
              <p className="keu-rincian-title">Pemasukan otomatis</p>
              <ul className="keu-rincian-list">
                {ringkasan.pemasukanOtomatis.kasRt > 0 || ringkasan.areas.some((a) => a !== "RW") ? (
                  <li>
                    <span>Kas RT (dari tagihan warga yang lunas)
                      {ringkasan.pemasukanOtomatis.kasRtDariRumahKosong > 0 && (
                        <> termasuk {formatRupiah(ringkasan.pemasukanOtomatis.kasRtDariRumahKosong)} dari rumah kosong</>
                      )}
                    </span>
                    <strong>{formatRupiah(ringkasan.pemasukanOtomatis.kasRt)}</strong>
                  </li>
                ) : null}
                {ringkasan.areas.includes("RW") && (
                  <li><span>Setoran IPL dari RT (sudah dikonfirmasi)</span><strong>{formatRupiah(ringkasan.pemasukanOtomatis.setoranIpl)}</strong></li>
                )}
                <li><span>Kas manual (pemasukan lain)</span><strong>{formatRupiah(ringkasan.pemasukanManual)}</strong></li>
              </ul>
              {ringkasan.titipanIpl > 0 && (
                <p className="keu-rincian-note">
                  Porsi IPL {formatRupiah(ringkasan.titipanIpl)} masih dipegang RT (belum disetor / belum dikonfirmasi RW)
                  dan belum dihitung sebagai saldo kas.
                </p>
              )}
            </div>
            {ringkasan.perArea?.length > 1 && (
              <div>
                <p className="keu-rincian-title">Per wilayah</p>
                <table className="ipl-table keu-area-table">
                  <thead>
                    <tr><th>No</th><th>Wilayah</th><th>Masuk</th><th>Keluar</th><th>Selisih</th></tr>
                  </thead>
                  <tbody>
                    {ringkasan.perArea.map((a, index) => (
                      <tr key={a.area}>
                        <td>{index + 1}</td>
                        <td><span className="rt-badge">{areaLabel(a.area)}</span></td>
                        <td>{formatRupiah(a.pemasukan)}</td>
                        <td>{formatRupiah(a.pengeluaran)}</td>
                        <td style={{ color: a.saldo >= 0 ? "#15803d" : "#dc2626" }}>{formatRupiah(a.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Grafik Arus Kas ── */}
      {ringkasan && (
        <div className="content-card">
          <div className="db-section-header">
            <TrendingUp size={17} />
            <h3>Arus Kas per Bulan</h3>
            <span className="db-section-sub">{periodeLabel}</span>
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#64748b", padding: "0 4px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: "#16a34a" }} />
              Pemasukan {formatRupiah(ringkasan.totalPemasukan)}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: "#dc2626" }} />
              Pengeluaran {formatRupiah(ringkasan.totalPengeluaran)}
            </span>
          </div>
          {!ringkasan.tren || ringkasan.tren.every((d) => !d.pemasukan && !d.pengeluaran) ? (
            <p className="portal-empty-text">Belum ada arus kas pada periode ini.</p>
          ) : (
            <ArusKasChart data={ringkasan.tren} />
          )}
        </div>
      )}

      {/* ── Tabel Riwayat ── */}
      <div className="content-card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="ipl-table-header">
          <span className="ipl-table-title">
            Riwayat Kas ({isMobile ? periodeLabel : periodeLabelFull})
          </span>
          <span className="ipl-table-count">{riwayat.length} data</span>
        </div>

        {isLoading ? (
          <div className="ipl-loading">
            <div className="ipl-spinner" />
            <span>Memuat data keuangan...</span>
          </div>
        ) : riwayat.length === 0 ? (
          <div className="ipl-empty">
            <Wallet size={40} strokeWidth={1.2} />
            <p>Belum ada transaksi untuk periode ini.</p>
          </div>
        ) : (
          <>
          <div className="ipl-table-wrapper pengaduan-table-wrapper">
            <table className="ipl-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Tanggal</th>
                  {semuaArea && <th>Wilayah</th>}
                  <th>Kategori</th>
                  <th>Keterangan</th>
                  <th>Tipe</th>
                  <th>Nominal</th>
                  <th>Bukti</th>
                  {(bolehUbah || bolehHapus) && <th>Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {riwayatPage.map((t, index) => {
                  const buktiPath = getBuktiPath(t);
                  const isManual = t.sumber === "MANUAL" || !t.sumber;
                  const isIplKas = t.sumber === "IPL_KAS";
                  const canEdit = (isManual || isIplKas) && bolehUbah;
                  const canDelete = (isManual || isIplKas) && bolehHapus;
                  return (
                  <tr key={t.id}>
                    <td>{(page - 1) * 10 + index + 1}</td>
                    <td>{formatTanggal(t.tanggal)}</td>
                    {semuaArea && <td><span className="rt-badge">{areaLabel(t.area)}</span></td>}
                    <td>{t.kategori}</td>
                    <td>{t.keterangan || <em className="text-muted">-</em>}</td>
                    <td><KasTipeBadge tipe={t.tipe} /></td>
                    <td
                      className="ipl-nominal"
                      style={{ color: t.tipe === "PEMASUKAN" ? "#15803d" : "#dc2626" }}
                    >
                      {t.tipe === "PEMASUKAN" ? "+" : "−"}{formatRupiah(t.nominal)}
                    </td>
                    <td>
                      {buktiPath ? (
                        <button
                          type="button"
                          className="btn-ipl-view"
                          onClick={() => openProtectedFile(buktiPath)}
                        >
                          <Eye size={14} /> Lihat
                        </button>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    {(bolehUbah || bolehHapus) && (
                      <td>
                        <div className="table-actions">
                          {canEdit && (
                            <button
                              type="button"
                              className="btn-icon"
                              onClick={() => { setEditItem(t); setShowForm(true); }}
                              aria-label="Ubah transaksi"
                              title="Ubah transaksi"
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              className="btn-icon danger"
                              onClick={() => handleDelete(t)}
                              aria-label="Hapus transaksi"
                              title="Hapus transaksi"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                          {!canEdit && !canDelete && <span className="text-muted">-</span>}
                        </div>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pengaduan-cards">
            {riwayatPage.map((t) => {
              const buktiPath = getBuktiPath(t);
              const isManual = t.sumber === "MANUAL" || !t.sumber;
              const isIplKas = t.sumber === "IPL_KAS";
              const canEdit = (isManual || isIplKas) && bolehUbah;
              const canDelete = (isManual || isIplKas) && bolehHapus;
              return (
                <div key={t.id} className="pengaduan-card" style={{ cursor: "default" }}>
                  <div className="pengaduan-card-top">
                    <h3 className="pengaduan-card-title" style={{ fontSize: "0.85rem" }}>{t.kategori}</h3>
                    <div className="kas-card-top-right">
                      <KasTipeBadge tipe={t.tipe} />
                      <span className="pengaduan-meta-item">{formatTanggal(t.tanggal)}</span>
                    </div>
                  </div>
                  {semuaArea && (
                    <div className="pengaduan-card-meta">
                      <span className="pengaduan-meta-item">{areaLabel(t.area)}</span>
                    </div>
                  )}
                  {t.keterangan && <span className="warga-grid-penghuni">{t.keterangan}</span>}
                  <div className="pengaduan-card-actions" style={{ justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 700, color: t.tipe === "PEMASUKAN" ? "#15803d" : "#dc2626" }}>
                      {t.tipe === "PEMASUKAN" ? "+" : "−"}{formatRupiah(t.nominal)}
                    </span>
                    <div className="table-actions">
                      {buktiPath && (
                        <button type="button" className="btn-icon" onClick={() => openProtectedFile(buktiPath)} aria-label="Lihat bukti" title="Lihat bukti">
                          <Eye size={15} />
                        </button>
                      )}
                      {canEdit && (
                        <button type="button" className="btn-icon" onClick={() => { setEditItem(t); setShowForm(true); }} aria-label="Ubah transaksi" title="Ubah transaksi">
                          <Pencil size={15} />
                        </button>
                      )}
                      {canDelete && (
                        <button type="button" className="btn-icon danger" onClick={() => handleDelete(t)} aria-label="Hapus transaksi" title="Hapus transaksi">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Pagination page={page} totalPages={totalPages} total={riwayat.length} onPrev={prev} onNext={next} />
          </>
        )}
      </div>

      {/* ── Modal ── */}
      {showForm && (
        <KasFormModal
          initial={editItem}
          pilihArea={pilihAreaTulis}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function KeuanganPage() {
  const { user, ready } = useUser();

  if (!ready || !user) return null;
  // Warga tidak diizinkan: DashboardShell otomatis mengarahkan ke /dashboard.
  if (isWargaView(user)) return null;

  return <AdminKeuanganView user={user} />;
}
