"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Plus,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Eye,
  Wallet,
  FileX,
  Home,
  Upload,
  Pencil,
  Trash2,
} from "lucide-react";
import { iplApi, portalApi, openProtectedFile } from "@/lib/api";
import { areaLabel, can, scopeOf } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import { showMessage, showConfirm } from "@/lib/message";
import FilterPopover, { FilterField } from "@/components/ui/FilterPopover";
import { BillSummaryCard } from "@/components/ipl/BillSummaryCard";
import Pagination from "@/components/ui/Pagination";
import Select from "@/components/ui/Select";
import { usePagination } from "@/lib/usePagination";
import BuktiUploadModal from "@/components/portal/BuktiUploadModal";
import ProtectedImage from "@/components/ui/ProtectedImage";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { useMediaQuery } from "@/lib/useMediaQuery";
import {
  formatRupiah,
  formatTanggalPendek as formatTanggal,
  BULAN_PANJANG as BULAN_NAMES,
  BULAN_OPTIONS,
  getCurrentYm,
  getMonthLabel,
  formatYmPendek,
  formatYmPanjang,
} from "@/lib/format";

// ── Helpers ───────────────────────────────────────────────────────────────────
const currentYear = new Date().getFullYear();
const TAHUN_OPTIONS = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

const STATUS_FILTER_OPTIONS = [
  { val: "SEMUA", label: "Semua Status" },
  { val: "BELUM_LUNAS", label: "Belum Lunas" },
  { val: "MENUNGGU_KONFIRMASI", label: "Menunggu Konfirmasi" },
  { val: "LUNAS", label: "Lunas" },
];

function AdminStatusBadge({ status }) {
  const map = {
    LUNAS: { label: "Lunas", cls: "badge-lunas" },
    BELUM_LUNAS: { label: "Belum Lunas", cls: "badge-belum" },
    MENUNGGU_KONFIRMASI: { label: "Menunggu Konfirmasi", cls: "badge-menunggu" },
  };
  const { label, cls } = map[status] || { label: status, cls: "" };
  return <span className={`ipl-badge ${cls}`}>{label}</span>;
}

// ── Modal: Generate Tagihan (2 input: IPL + kas RT) ───────────────────────────
function GenerateModal({ onClose, onSuccess, pilihRt = false }) {
  const now = new Date();
  const [form, setForm] = useState({
    bulanPeriode: String(now.getMonth() + 1).padStart(2, "0"),
    tahunPeriode: String(now.getFullYear()),
    nominalIpl: "",
    nominalKas: "",
    rt: "RT_01",
  });
  const [loading, setLoading] = useState(false);

  const total = (Number(form.nominalIpl) || 0) + (Number(form.nominalKas) || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nominalIpl || Number(form.nominalIpl) <= 0) {
      showMessage("Validasi", "Nominal IPL harus lebih dari 0.", "warning");
      return;
    }
    if (Number(form.nominalKas) < 0) {
      showMessage("Validasi", "Nominal kas tidak boleh negatif.", "warning");
      return;
    }
    const confirmed = await showConfirm(
      "Buat Tagihan?",
      `Tagihan periode ${BULAN_NAMES[form.bulanPeriode]} ${form.tahunPeriode}: IPL ${formatRupiah(form.nominalIpl)} + kas ${formatRupiah(form.nominalKas || 0)} = ${formatRupiah(total)} per rumah ber-pemilik (termasuk rumah kosong — porsi IPL-nya masuk kas RT). Generate ulang periode yang sama hanya menagih rumah baru yang belum punya tagihan.`,
      "question",
      "Ya, Buat!"
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await iplApi.generate({
        bulanPeriode: form.bulanPeriode,
        tahunPeriode: form.tahunPeriode,
        nominalIpl: Number(form.nominalIpl),
        nominalKas: Number(form.nominalKas || 0),
        ...(pilihRt ? { rt: form.rt } : {}),
      });
      showMessage("Berhasil!", res.message, "success");
      onSuccess();
      onClose();
    } catch (err) {
      showMessage("Gagal Membuat Tagihan", err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ipl-modal-overlay" onClick={onClose}>
      <div className="ipl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ipl-modal-header">
          <h3>Buat Tagihan IPL Periode Baru</h3>
          <button className="ipl-modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="ipl-modal-body">
          {pilihRt && (
            <div className="ipl-form-group">
              <label>RT</label>
              <Select
                value={form.rt}
                onChange={(v) => setForm({ ...form, rt: v })}
                className="ipl-select"
                options={["RT_01", "RT_02", "RT_03", "RT_04"].map((rt) => ({ value: rt, label: areaLabel(rt) }))}
              />
            </div>
          )}
          <div className="ipl-form-row">
            <div className="ipl-form-group">
              <label>Bulan</label>
              <Select
                value={form.bulanPeriode}
                onChange={(v) => setForm({ ...form, bulanPeriode: v })}
                className="ipl-select"
                options={BULAN_OPTIONS.map(({ val, label }) => ({ value: val, label }))}
              />
            </div>
            <div className="ipl-form-group">
              <label>Tahun</label>
              <Select
                value={form.tahunPeriode}
                onChange={(v) => setForm({ ...form, tahunPeriode: v })}
                className="ipl-select"
                options={TAHUN_OPTIONS.map((y) => ({ value: y, label: y }))}
              />
            </div>
          </div>
          <div className="ipl-form-row">
            <div className="ipl-form-group">
              <label>IPL (Rp) <span className="label-optional">disetor ke RW</span></label>
              <CurrencyInput
                placeholder="Contoh: 130.000"
                value={form.nominalIpl}
                onChange={(v) => setForm({ ...form, nominalIpl: v })}
                required
              />
            </div>
            <div className="ipl-form-group">
              <label>Kas RT (Rp) <span className="label-optional">masuk kas RT</span></label>
              <CurrencyInput
                placeholder="Contoh: 20.000"
                value={form.nominalKas}
                onChange={(v) => setForm({ ...form, nominalKas: v })}
              />
            </div>
          </div>
          <div className="ipl-total-box">
            <span>Total yang dibayar warga</span>
            <strong>{formatRupiah(total)}</strong>
          </div>
          <div className="ipl-modal-footer">
            <button type="button" className="btn-ipl-secondary" onClick={onClose} disabled={loading}>
              Batal
            </button>
            <button type="submit" className="btn-ipl-primary" disabled={loading}>
              {loading ? "Memproses..." : "Buat Tagihan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal: Koreksi nominal satu tagihan ───────────────────────────────────────
function EditTagihanModal({ tagihan, onClose, onSuccess }) {
  const [form, setForm] = useState({
    nominalIpl: String(tagihan.nominalIpl),
    nominalKas: String(tagihan.nominalKas),
    alasan: "",
  });
  const [loading, setLoading] = useState(false);

  const nominalBerubah =
    Number(form.nominalIpl) !== tagihan.nominalIpl ||
    Number(form.nominalKas || 0) !== tagihan.nominalKas;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (nominalBerubah && !form.alasan.trim()) {
      showMessage("Validasi", "Alasan koreksi wajib diisi bila nominal berubah.", "warning");
      return;
    }
    setLoading(true);
    try {
      await iplApi.update(tagihan.id, {
        nominalIpl: Number(form.nominalIpl),
        nominalKas: Number(form.nominalKas || 0),
        ...(nominalBerubah ? { alasan: form.alasan.trim() } : {}),
      });
      showMessage("Berhasil", "Tagihan berhasil diperbarui.", "success");
      onSuccess();
      onClose();
    } catch (err) {
      showMessage("Gagal Memperbarui", err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ipl-modal-overlay" onClick={onClose}>
      <div className="ipl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ipl-modal-header">
          <h3>Koreksi Tagihan {tagihan.rumah?.blokRumah}</h3>
          <button className="ipl-modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="ipl-modal-body">
          <p className="field-hint">
            {BULAN_NAMES[tagihan.bulanPeriode]} {tagihan.tahunPeriode} · {tagihan.rumah?.penghuni?.namaUser || "-"}
          </p>
          <div className="ipl-form-row">
            <div className="ipl-form-group">
              <label>IPL (Rp)</label>
              <CurrencyInput required value={form.nominalIpl}
                onChange={(v) => setForm({ ...form, nominalIpl: v })} />
            </div>
            <div className="ipl-form-group">
              <label>Kas RT (Rp)</label>
              <CurrencyInput value={form.nominalKas}
                onChange={(v) => setForm({ ...form, nominalKas: v })} />
            </div>
          </div>
          <div className="ipl-form-group">
            <label>Alasan koreksi {nominalBerubah && <span className="required-star">*</span>}</label>
            <textarea
              rows={2}
              className="ipl-textarea"
              placeholder="Wajib diisi bila nominal berubah. Contoh: tarif kas RT naik per kesepakatan warga…"
              value={form.alasan}
              onChange={(e) => setForm({ ...form, alasan: e.target.value })}
            />
            <span className="field-hint">Koreksi tercatat di riwayat aktivitas dan diteruskan ke RW.</span>
          </div>
          <div className="ipl-modal-footer">
            <button type="button" className="btn-ipl-secondary" onClick={onClose} disabled={loading}>Batal</button>
            <button type="submit" className="btn-ipl-primary" disabled={loading}>{loading ? "Menyimpan..." : "Simpan"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Rekap per RT (tampilan RW): tracking per RT, ikut filter aktif (periode/status/RT, tanpa search) ──
function RekapRtPanel({ dari, sampai, status, rt, refreshKey }) {
  const [rekap, setRekap] = useState(null);

  useEffect(() => {
    let cancelled = false;
    iplApi
      .getRekapRt({ dari, sampai, status, rt })
      .then((r) => { if (!cancelled) setRekap(r); })
      .catch(() => { if (!cancelled) setRekap(null); });
    return () => { cancelled = true; };
  }, [dari, sampai, status, rt, refreshKey]);

  if (!rekap) return null;

  const formatPeriode = formatYmPanjang;
  const periodeLabel = dari === sampai ? formatPeriode(dari) : `${formatPeriode(dari)} - ${formatPeriode(sampai)}`;

  return (
    <div className="content-card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="ipl-table-header">
        <span className="ipl-table-title">Rekap per RT ({periodeLabel})</span>
        <span className="ipl-table-count">IPL disetor RT ke RW; kas tetap di RT</span>
      </div>
      <div className="ipl-table-wrapper">
        <table className="ipl-table">
          <thead>
            <tr>
              <th>No</th>
              <th>RT</th>
              <th>Lunas / Tagihan</th>
              <th>Menunggu</th>
              <th>IPL Terkumpul</th>
              <th>Kas RT</th>
              <th>Rumah Kosong</th>
              <th>Sudah Disetor</th>
              <th>Belum Disetor</th>
            </tr>
          </thead>
          <tbody>
            {rekap.perRt.map((r, index) => (
              <tr key={r.rt}>
                <td>{index + 1}</td>
                <td><span className="rt-badge">{areaLabel(r.rt)}</span></td>
                <td>{r.lunas} / {r.totalTagihan}</td>
                <td>
                  {r.menungguKonfirmasi > 0
                    ? <span className="ipl-badge badge-menunggu">{r.menungguKonfirmasi}</span>
                    : <span className="text-muted">0</span>}
                </td>
                <td className="ipl-nominal">{formatRupiah(r.terkumpulIpl)}</td>
                <td>{formatRupiah(r.terkumpulKas)}</td>
                <td>
                  {r.terkumpulRumahKosong?.jumlahTagihan > 0
                    ? `${r.terkumpulRumahKosong.jumlahTagihan} tagihan`
                    : <span className="text-muted">—</span>}
                </td>
                <td>{formatRupiah(r.sudahDisetor)}</td>
                <td>
                  <span className={r.belumDisetor > 0 ? "ipl-badge badge-menunggu" : ""}>
                    {formatRupiah(r.belumDisetor)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Modal: Review Bukti Pembayaran ────────────────────────────────────────────
function ReviewModal({ tagihan, onClose, onSuccess }) {
  const [catatan, setCatatan] = useState("");
  const [loading, setLoading] = useState(false);
  const pembayaran = tagihan?.pembayaran?.[0];

  const handleAction = async (action) => {
    if (!pembayaran) return;
    if (action === "TOLAK") {
      const confirmed = await showConfirm(
        "Tolak Pembayaran?",
        "Status tagihan akan dikembalikan ke Belum Lunas.",
        "warning",
        "Ya, Tolak"
      );
      if (!confirmed) return;
    }

    setLoading(true);
    try {
      const res = await iplApi.konfirmasi(pembayaran.idPembayaran, {
        action,
        catatan: action === "TOLAK" ? catatan : undefined,
      });
      showMessage(action === "TERIMA" ? "Dikonfirmasi!" : "Ditolak", res.message, action === "TERIMA" ? "success" : "info");
      onSuccess();
      onClose();
    } catch (err) {
      showMessage("Gagal", err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const buktiPath = pembayaran?.buktiTransaksi
    ? portalApi.buktiPath(pembayaran.idPembayaran)
    : null;

  return (
    <div className="ipl-modal-overlay" onClick={onClose}>
      <div className="ipl-modal ipl-modal-review" onClick={(e) => e.stopPropagation()}>
        <div className="ipl-modal-header">
          <h3>Review Bukti Pembayaran</h3>
          <button className="ipl-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="ipl-modal-body">
          {/* Info tagihan */}
          <div className="review-info-grid">
            <div className="review-info-item">
              <span className="review-info-label">Penghuni</span>
              <span className="review-info-value">{tagihan?.rumah?.penghuni?.namaUser || "-"}</span>
            </div>
            <div className="review-info-item">
              <span className="review-info-label">Blok / RT</span>
              <span className="review-info-value">{tagihan?.rumah?.blokRumah} / {tagihan?.rumah?.rt?.replace("_", " ")}</span>
            </div>
            <div className="review-info-item">
              <span className="review-info-label">Periode</span>
              <span className="review-info-value">{BULAN_NAMES[tagihan?.bulanPeriode]} {tagihan?.tahunPeriode}</span>
            </div>
            <div className="review-info-item">
              <span className="review-info-label">Nominal Tagihan</span>
              <span className="review-info-value review-nominal">{formatRupiah(tagihan?.nominal)}</span>
            </div>
            <div className="review-info-item">
              <span className="review-info-label">Nominal Dibayar</span>
              <span className="review-info-value">{pembayaran ? formatRupiah(pembayaran.nominal) : "-"}</span>
            </div>
            <div className="review-info-item">
              <span className="review-info-label">Tanggal Upload</span>
              <span className="review-info-value">{formatTanggal(pembayaran?.tanggalBayar)}</span>
            </div>
          </div>

          {/* Bukti transfer */}
          <div className="review-bukti-section">
            <p className="review-bukti-label">Bukti Transfer</p>
            <ProtectedImage path={buktiPath} alt="Bukti Transfer" className="review-bukti-img" />
          </div>

          {/* Textarea catatan penolakan */}
          <div className="ipl-form-group">
            <label>Catatan Penolakan <span className="label-optional">(opsional, khusus jika ditolak)</span></label>
            <textarea
              rows={3}
              placeholder="Contoh: Foto tidak jelas, jumlah transfer tidak sesuai..."
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              className="ipl-textarea"
            />
          </div>

          <div className="review-action-row">
            <button
              className="btn-ipl-danger"
              onClick={() => handleAction("TOLAK")}
              disabled={loading}
            >
              <XCircle size={16} /> Tolak
            </button>
            <button
              className="btn-ipl-success"
              onClick={() => handleAction("TERIMA")}
              disabled={loading}
            >
              <CheckCircle size={16} /> Konfirmasi Lunas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Admin/Pengurus: kelola tagihan semua warga ────────────────────────────────
function AdminIuranView({ user }) {
  const bolehGenerate = can(user, "ipl.generate");
  const bolehKonfirmasi = can(user, "ipl.konfirmasi");
  // Ketua RT (dan role lain tanpa ipl.konfirmasi) cuma boleh konfirmasi pembayaran
  // pengurus (role.level < 3), bukan warga biasa — dicek juga di backend.
  const bolehKonfirmasiPengurus = can(user, "ipl.konfirmasi_pengurus");
  const bolehUbah = can(user, "ipl.update");
  const bolehHapus = can(user, "ipl.delete");
  // Scope ALL (ketua/bendahara/sekre RW, admin) melihat semua RT; scope AREA hanya RT sendiri.
  const semuaRt = scopeOf(user, "ipl.read") === "ALL";
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [tagihan, setTagihan] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filter state — range periode, default bulan berjalan
  const monthDiffInclusive = (dari, sampai) => {
    const [y1, m1] = dari.split("-").map(Number);
    const [y2, m2] = sampai.split("-").map(Number);
    return (y2 - y1) * 12 + (m2 - m1) + 1;
  };

  const [periodeDari, setPeriodeDari] = useState(getCurrentYm);
  const [periodeSampai, setPeriodeSampai] = useState(getCurrentYm);
  const [filterStatus, setFilterStatus] = useState("SEMUA");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [draftPeriodeDari, setDraftPeriodeDari] = useState(getCurrentYm);
  const [draftPeriodeSampai, setDraftPeriodeSampai] = useState(getCurrentYm);
  const [draftFilterStatus, setDraftFilterStatus] = useState("SEMUA");
  const [filterRt, setFilterRt] = useState("SEMUA");
  const [draftFilterRt, setDraftFilterRt] = useState("SEMUA");
  const [refreshKey, setRefreshKey] = useState(0);

  // Normalisasi + validasi turunan
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
  const periodeLabelSingkat = periodeDari === periodeSampai
    ? formatYmPendek(periodeDari)
    : `${formatYmPendek(periodeDari)} - ${formatYmPendek(periodeSampai)}`;

  const handleFilterOpen = () => {
    setDraftPeriodeDari(periodeDari);
    setDraftPeriodeSampai(periodeSampai);
    setDraftFilterStatus(filterStatus);
    setDraftFilterRt(filterRt);
  };
  const handleFilterApply = () => {
    if (draftRangeError) return;
    setPeriodeDari(draftPeriodeDari);
    setPeriodeSampai(draftPeriodeSampai);
    setFilterStatus(draftFilterStatus);
    setFilterRt(draftFilterRt);
  };
  const handleFilterReset = () => {
    const cur = getCurrentYm();
    setPeriodeDari(cur);
    setPeriodeSampai(cur);
    setFilterStatus("SEMUA");
    setDraftPeriodeDari(cur);
    setDraftPeriodeSampai(cur);
    setDraftFilterStatus("SEMUA");
    setFilterRt("SEMUA");
    setDraftFilterRt("SEMUA");
  };

  // Modal state
  const [showGenerate, setShowGenerate] = useState(false);
  const [reviewItem, setReviewItem] = useState(null);
  const [editItem, setEditItem] = useState(null);

  const loadData = useCallback(async () => {
    if (rangeError) return;
    setIsLoading(true);
    try {
      const res = await iplApi.getAll({
        dari,
        sampai,
        status: filterStatus,
        search,
        rt: filterRt,
      });
      setTagihan(res.tagihan || []);
      setSummary(res.summary || null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      showMessage("Gagal Memuat Data", err.message, "error");
    } finally {
      setIsLoading(false);
    }
  }, [dari, sampai, rangeError, filterStatus, search, filterRt]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const { page, totalPages, paginatedItems: tagihanPage, prev, next } = usePagination(tagihan, [tagihan]);

  // Search debounce
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleHapus = async (t) => {
    const ok = await showConfirm(
      "Hapus tagihan?",
      `Tagihan ${t.rumah?.blokRumah} periode ${BULAN_NAMES[t.bulanPeriode]} ${t.tahunPeriode} akan dihapus.`,
      "warning",
      "Ya, hapus"
    );
    if (!ok) return;
    try {
      await iplApi.remove(t.id);
      showMessage("Berhasil", "Tagihan berhasil dihapus.", "success");
      loadData();
    } catch (err) {
      showMessage("Gagal Menghapus", err.message, "error");
    }
  };

  return (
    <div className="page-stack">
      {/* ── Summary Cards — Tagihan IPL (tint redesign, palet selaras Keuangan) ── */}
      {summary && (
        <div className="ipl-summary-grid keu-summary-grid">
          <div className="ipl-summary-card keu-card keu-teal">
            <div className="keu-icon-circle"><Wallet size={22} strokeWidth={2} /></div>
            <div className="keu-card-text">
              <span className="ipl-summary-label">Total Tagihan</span>
              <span className="ipl-summary-value">{formatRupiah(summary.totalNominal)}</span>
            </div>
          </div>
          <div className="ipl-summary-card keu-card keu-green">
            <div className="keu-icon-circle"><CheckCircle size={22} strokeWidth={2} /></div>
            <div className="keu-card-text">
              <span className="ipl-summary-label">Terkumpul</span>
              <span className="ipl-summary-value">{formatRupiah(summary.totalTerkumpul)}</span>
            </div>
          </div>
          <div className={`ipl-summary-card keu-card ${summary.menungguKonfirmasi > 0 ? "keu-amber" : "keu-muted"}`}>
            <div className="keu-icon-circle">{summary.menungguKonfirmasi > 0 ? <AlertTriangle size={22} strokeWidth={2} /> : <Clock size={22} strokeWidth={2} />}</div>
            <div className="keu-card-text">
              <span className="ipl-summary-label">Menunggu Konfirmasi</span>
              <span className="ipl-summary-value">{summary.menungguKonfirmasi}</span>
            </div>
          </div>
          <div className="ipl-summary-card keu-card keu-red">
            <div className="keu-icon-circle"><FileX size={22} strokeWidth={2} /></div>
            <div className="keu-card-text">
              <span className="ipl-summary-label">Belum Lunas</span>
              <span className="ipl-summary-value">{summary.belumLunas}</span>
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
              placeholder="Nama warga / blok rumah..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="list-search-input"
            />
          </div>

          <FilterPopover
            active={!isDefaultPeriode || filterStatus !== "SEMUA" || filterRt !== "SEMUA"}
            activeCount={
              (!isDefaultPeriode ? 1 : 0) +
              (filterStatus !== "SEMUA" ? 1 : 0) +
              (filterRt !== "SEMUA" ? 1 : 0)
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
            <FilterField label="Status">
              <Select
                className="ipl-select ipl-select-sm"
                value={draftFilterStatus}
                onChange={(v) => setDraftFilterStatus(v)}
                options={STATUS_FILTER_OPTIONS.map(({ val, label }) => ({ value: val, label }))}
              />
            </FilterField>
            {semuaRt && (
              <FilterField label="RT">
                <Select
                  className="ipl-select ipl-select-sm"
                  value={draftFilterRt}
                  onChange={(v) => setDraftFilterRt(v)}
                  options={[
                    { value: "SEMUA", label: "Semua RT" },
                    ...["RT_01", "RT_02", "RT_03", "RT_04"].map((rt) => ({ value: rt, label: areaLabel(rt) })),
                  ]}
                />
              </FilterField>
            )}
          </FilterPopover>
        </div>
        {bolehGenerate && (
          <button
            id="btn-generate-tagihan"
            className="btn-ipl-primary"
            onClick={() => setShowGenerate(true)}
          >
            <Plus size={16} /> Buat Tagihan Periode
          </button>
        )}
      </div>

      {/* Tampilan RW: rekap terkumpul & disetor per RT — ikut filter aktif (tanpa search) */}
      {semuaRt && !rangeError && <RekapRtPanel dari={dari} sampai={sampai} status={filterStatus} rt={filterRt} refreshKey={refreshKey} />}

      {/* ── Table ── */}
      <div className="content-card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="ipl-table-header">
          <span className="ipl-table-title">
            Data Tagihan ({isMobile ? periodeLabelSingkat : periodeLabel})
          </span>
          <span className="ipl-table-count">{tagihan.length} data</span>
        </div>

        {isLoading ? (
          <div className="ipl-loading">
            <div className="ipl-spinner" />
            <span>Memuat data tagihan...</span>
          </div>
        ) : tagihan.length === 0 ? (
          <div className="ipl-empty">
            <Wallet size={40} strokeWidth={1.2} />
            <p>Belum ada tagihan untuk periode ini.</p>
          </div>
        ) : (
          <>
          <div className="ipl-table-wrapper pengaduan-table-wrapper">
            <table className="ipl-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Blok / RT</th>
                  <th>Penghuni</th>
                  <th>Periode</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Tanggal Bayar</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {tagihanPage.map((t, index) => {
                  const pembayaran = t.pembayaran?.[0];
                  const penghuniPengurus = (t.rumah?.penghuni?.role?.level ?? 3) < 3;
                  const bisaKonfirmasiBaris = bolehKonfirmasi || (bolehKonfirmasiPengurus && penghuniPengurus);
                  return (
                    <tr key={t.id}>
                      <td>{(page - 1) * 10 + index + 1}</td>
                      <td>
                        <span className="ipl-blok">{t.rumah?.blokRumah}</span>
                        <span className="ipl-rt">{t.rumah?.rt?.replace("_", " ")}</span>
                      </td>
                      <td>{t.rumah?.penghuni?.namaUser || <em className="text-muted">Kosong</em>}</td>
                      <td>{BULAN_NAMES[t.bulanPeriode]} {t.tahunPeriode}</td>
                      <td className="ipl-nominal">
                        {formatRupiah(t.nominal)}
                        <span className="ipl-nominal-split">IPL {formatRupiah(t.nominalIpl)} + kas {formatRupiah(t.nominalKas)}</span>
                        {t.statusPembayaran === "LUNAS" && (
                          <span className="ipl-nominal-split">
                            {t.setoran ? (t.setoran.status === "DIKONFIRMASI" ? "IPL sudah disetor" : "IPL dalam setoran") : "IPL belum disetor"}
                          </span>
                        )}
                      </td>
                      <td><AdminStatusBadge status={t.statusPembayaran} /></td>
                      <td>{formatTanggal(pembayaran?.tanggalBayar)}</td>
                      <td>
                        <div className="table-actions">
                          {t.statusPembayaran === "MENUNGGU_KONFIRMASI" && bisaKonfirmasiBaris ? (
                            <button
                              className="btn-ipl-review"
                              onClick={() => setReviewItem(t)}
                              title="Review bukti pembayaran"
                            >
                              <Eye size={14} /> Review
                            </button>
                          ) : pembayaran?.buktiTransaksi && t.statusPembayaran !== "BELUM_LUNAS" ? (
                            <button
                              type="button"
                              className="btn-ipl-view"
                              onClick={() => openProtectedFile(portalApi.buktiPath(pembayaran.idPembayaran))}
                            >
                              <Eye size={14} /> Lihat Bukti
                            </button>
                          ) : null}
                          {t.statusPembayaran === "BELUM_LUNAS" && bolehUbah && (
                            <button type="button" className="btn-icon" title="Koreksi nominal" aria-label="Koreksi nominal" onClick={() => setEditItem(t)}>
                              <Pencil size={15} />
                            </button>
                          )}
                          {t.statusPembayaran === "BELUM_LUNAS" && bolehHapus && !pembayaran && (
                            <button type="button" className="btn-icon danger" title="Hapus tagihan" aria-label="Hapus tagihan" onClick={() => handleHapus(t)}>
                              <Trash2 size={15} />
                            </button>
                          )}
                          {t.statusPembayaran === "BELUM_LUNAS" && !bolehUbah && !bolehHapus && (
                            <span className="text-muted">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pengaduan-cards">
            {tagihanPage.map((t) => {
              const pembayaran = t.pembayaran?.[0];
              const penghuniPengurus = (t.rumah?.penghuni?.role?.level ?? 3) < 3;
              const bisaKonfirmasiBaris = bolehKonfirmasi || (bolehKonfirmasiPengurus && penghuniPengurus);
              return (
                <div key={t.id} className="pengaduan-card" style={{ cursor: "default" }}>
                  <div className="pengaduan-card-top">
                    <h3 className="pengaduan-card-title" style={{ fontSize: "0.85rem" }}>
                      {t.rumah?.blokRumah} <span className="rt-badge">{t.rumah?.rt?.replace("_", " ")}</span>
                    </h3>
                    <AdminStatusBadge status={t.statusPembayaran} />
                  </div>
                  <div className="pengaduan-card-meta">
                    <span className="pengaduan-meta-item">{t.rumah?.penghuni?.namaUser || "Kosong"}</span>
                    <span className="pengaduan-meta-item">{BULAN_NAMES[t.bulanPeriode]} {t.tahunPeriode}</span>
                    {pembayaran?.tanggalBayar && <span className="pengaduan-meta-item">{formatTanggal(pembayaran.tanggalBayar)}</span>}
                  </div>
                  <span className="warga-grid-penghuni">
                    {formatRupiah(t.nominal)} <span className="text-muted" style={{ fontWeight: 400 }}>(IPL {formatRupiah(t.nominalIpl)} + kas {formatRupiah(t.nominalKas)})</span>
                  </span>
                  <div className="pengaduan-card-actions">
                    <div className="table-actions">
                      {t.statusPembayaran === "MENUNGGU_KONFIRMASI" && bisaKonfirmasiBaris ? (
                        <button className="btn-ipl-review" onClick={() => setReviewItem(t)} title="Review bukti pembayaran">
                          <Eye size={14} /> Review
                        </button>
                      ) : pembayaran?.buktiTransaksi && t.statusPembayaran !== "BELUM_LUNAS" ? (
                        <button
                          type="button"
                          className="btn-ipl-view"
                          onClick={() => openProtectedFile(portalApi.buktiPath(pembayaran.idPembayaran))}
                        >
                          <Eye size={14} /> Lihat Bukti
                        </button>
                      ) : null}
                      {t.statusPembayaran === "BELUM_LUNAS" && bolehUbah && (
                        <button type="button" className="btn-icon" title="Koreksi nominal" aria-label="Koreksi nominal" onClick={() => setEditItem(t)}>
                          <Pencil size={15} />
                        </button>
                      )}
                      {t.statusPembayaran === "BELUM_LUNAS" && bolehHapus && !pembayaran && (
                        <button type="button" className="btn-icon danger" title="Hapus tagihan" aria-label="Hapus tagihan" onClick={() => handleHapus(t)}>
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Pagination page={page} totalPages={totalPages} total={tagihan.length} onPrev={prev} onNext={next} />
          </>
        )}
      </div>

      {/* ── Modals ── */}
      {showGenerate && (
        <GenerateModal
          pilihRt={semuaRt}
          onClose={() => setShowGenerate(false)}
          onSuccess={loadData}
        />
      )}
      {editItem && (
        <EditTagihanModal tagihan={editItem} onClose={() => setEditItem(null)} onSuccess={loadData} />
      )}
      {reviewItem && (
        <ReviewModal
          tagihan={reviewItem}
          onClose={() => setReviewItem(null)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}

// ── Warga: lihat & bayar tagihan milik sendiri ────────────────────────────────
function formatRt(rt) {
  return String(rt || "").replace("_", " ");
}

function WargaStatusBadge({ status }) {
  const map = {
    LUNAS: { label: "Lunas", cls: "status-lunas", icon: CheckCircle },
    BELUM_LUNAS: { label: "Belum Lunas", cls: "status-belum", icon: AlertTriangle },
    MENUNGGU_KONFIRMASI: { label: "Menunggu Konfirmasi", cls: "status-menunggu", icon: Clock },
  };
  const { label, cls, icon: Icon } = map[status] || map.BELUM_LUNAS;
  return (
    <span className={`ipl-status-badge ${cls}`}>
      <Icon size={12} /> {label}
    </span>
  );
}

const rupiah = formatRupiah;

// ── Modal: Riwayat Transaksi (read-only, untuk tagihan Lunas role Warga) ────
function RiwayatTransaksiModal({ ipl, onClose }) {
  const pembayaran = ipl?.pembayaran?.[0];
  const buktiPath = pembayaran?.buktiTransaksi
    ? portalApi.buktiPath(pembayaran.idPembayaran)
    : null;

  return (
    <div className="ipl-modal-overlay" onClick={onClose}>
      <div className="ipl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ipl-modal-header">
          <h3>Riwayat Transaksi</h3>
          <button className="ipl-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="ipl-modal-body">
          {/* Info tagihan */}
          <div className="review-info-grid">
            <div className="review-info-item">
              <span className="review-info-label">Unit</span>
              <span className="review-info-value">
                {ipl?.rumah ? `${ipl.rumah.blokRumah} · ${formatRt(ipl.rumah.rt)}` : `Rumah #${ipl?.idRumah}`}
              </span>
            </div>
            <div className="review-info-item">
              <span className="review-info-label">Periode</span>
              <span className="review-info-value">{getMonthLabel(ipl?.bulanPeriode, ipl?.tahunPeriode)}</span>
            </div>
            <div className="review-info-item">
              <span className="review-info-label">Nominal Tagihan</span>
              <span className="review-info-value review-nominal">{rupiah(ipl?.nominal)}</span>
            </div>
            <div className="review-info-item">
              <span className="review-info-label">Nominal Dibayar</span>
              <span className="review-info-value">{pembayaran ? rupiah(pembayaran.nominal) : "-"}</span>
            </div>
            <div className="review-info-item">
              <span className="review-info-label">Tanggal Bayar</span>
              <span className="review-info-value">{formatTanggal(pembayaran?.tanggalBayar)}</span>
            </div>
            <div className="review-info-item">
              <span className="review-info-label">Status</span>
              <span className="review-info-value"><WargaStatusBadge status={ipl?.statusPembayaran} /></span>
            </div>
          </div>

          {/* Bukti transfer */}
          <div className="review-bukti-section">
            <p className="review-bukti-label">Bukti Transfer</p>
            <ProtectedImage path={buktiPath} alt="Bukti Transfer" className="review-bukti-img" />
          </div>

          <div className="ipl-modal-footer">
            <button type="button" className="btn-ipl-secondary" onClick={onClose}>
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Diekspor agar dipakai ulang oleh route /kelola-ipl/tagihan-saya tanpa duplikasi kode.
export function WargaIuranView({ user }) {
  const currentYm = getCurrentYm();
  const monthDiffInclusive = (dari, sampai) => {
    const [y1, m1] = dari.split("-").map(Number);
    const [y2, m2] = sampai.split("-").map(Number);
    return (y2 - y1) * 12 + (m2 - m1) + 1;
  };

  const [rumahList, setRumahList] = useState([]);
  const [tagihanGabungan, setTagihanGabungan] = useState([]);
  const [loadingRumah, setLoadingRumah] = useState(true);
  const [loadingTagihan, setLoadingTagihan] = useState(false);
  const [modalIpl, setModalIpl] = useState(null); // IPL yang akan dibayar
  const [riwayatIpl, setRiwayatIpl] = useState(null); // IPL Lunas yang dilihat riwayatnya

  // Filter hijau model popover — sama seperti Tagihan IPL admin,
  // dengan pola draft + Terapkan + Reset ala filter Keuangan:
  // data baru terfilter setelah tombol Terapkan diklik.
  // Default WARGA: kosong = Semua Periode (langsung tampil semua data)
  const [periodeDari, setPeriodeDari] = useState("");
  const [periodeSampai, setPeriodeSampai] = useState("");
  const [filterStatus, setFilterStatus] = useState("SEMUA");
  const [selectedRumahId, setSelectedRumahId] = useState("semua");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  // Draft popover (baru diterapkan saat Terapkan diklik)
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftDari, setDraftDari] = useState("");
  const [draftSampai, setDraftSampai] = useState("");
  const [draftStatus, setDraftStatus] = useState("SEMUA");
  const [draftUnit, setDraftUnit] = useState("semua");

  // Normalisasi + validasi turunan — kosong = Semua Periode (tanpa filter)
  const [dari, sampai] = periodeDari && periodeSampai
    ? periodeDari > periodeSampai
      ? [periodeSampai, periodeDari]
      : [periodeDari, periodeSampai]
    : [periodeDari || "", periodeSampai || ""];
  const rangeError = dari && sampai && monthDiffInclusive(dari, sampai) > 12
    ? "Rentang periode maksimal 12 bulan."
    : "";

  // Validasi draft di dalam popover (sebelum diterapkan)
  const [draftDariN, draftSampaiN] = draftDari && draftSampai
    ? draftDari > draftSampai
      ? [draftSampai, draftDari]
      : [draftDari, draftSampai]
    : [draftDari || "", draftSampai || ""];
  const draftError = draftDari && draftSampai && monthDiffInclusive(draftDariN, draftSampaiN) > 12
    ? "Rentang periode maksimal 12 bulan."
    : "";

  const hasActiveFilter = !!periodeDari || !!periodeSampai || filterStatus !== "SEMUA" || selectedRumahId !== "semua";
  // displayDari/displaySampai terurut kronologis agar label tidak terbalik jika user isi Dari > Sampai
  const displayDari = periodeDari && periodeSampai && periodeDari > periodeSampai ? periodeSampai : periodeDari;
  const displaySampai = periodeDari && periodeSampai && periodeDari > periodeSampai ? periodeDari : periodeSampai;
  const periodeLabel = !displayDari && !displaySampai
    ? "Semua Periode"
    : !displayDari || !displaySampai
      ? formatYmPanjang(displayDari || displaySampai)
      : displayDari === displaySampai
        ? formatYmPanjang(displayDari)
        : `${formatYmPanjang(displayDari)} - ${formatYmPanjang(displaySampai)}`;

  // Sinkronkan draft dari filter yang sedang diterapkan setiap popover dibuka
  const handleFilterOpenChange = (next) => {
    if (next) {
      setDraftDari(periodeDari);
      setDraftSampai(periodeSampai);
      setDraftStatus(filterStatus);
      setDraftUnit(selectedRumahId);
    }
    setFilterOpen(next);
  };

  const applyFilter = () => {
    if (draftError) return;
    setPeriodeDari(draftDari || "");
    setPeriodeSampai(draftSampai || "");
    setFilterStatus(draftStatus);
    setSelectedRumahId(draftUnit);
    setFilterOpen(false);
  };

  const handleResetFilter = () => {
    setPeriodeDari("");
    setPeriodeSampai("");
    setFilterStatus("SEMUA");
    setSelectedRumahId("semua");
    setDraftDari("");
    setDraftSampai("");
    setDraftStatus("SEMUA");
    setDraftUnit("semua");
    setFilterOpen(false);
  };

  const loadGabungan = async (uid) => {
    if (rangeError) return;
    setLoadingTagihan(true);
    try {
      const res = await portalApi.getTagihanByUser(uid, {
        dari: dari || undefined,
        sampai: sampai || undefined,
        status: filterStatus,
        search,
      });
      setRumahList(res.rumah || []);
      setTagihanGabungan(res.tagihan || []);
    } catch (err) {
      console.warn("getTagihanByUser gagal, fallback per-rumah:", err);
      // Fallback: ambil rumah lalu tagihan per rumah satu-satu,
      // lalu filter range + status + search di sisi klien
      const rumah = await portalApi.getRumahByUser(uid);
      setRumahList(rumah || []);
      const all = [];
      for (const r of rumah || []) {
        try {
          const { tagihan } = await portalApi.getTagihanByRumah(r.id);
          all.push(...(tagihan || []).map((t) => ({ ...t, rumah: { id: r.id, blokRumah: r.blokRumah, rt: r.rt } })));
        } catch (rumahErr) {
          console.warn(`Gagal memuat tagihan rumah ${r.id}:`, rumahErr);
        }
      }
      const q = search.trim().toLowerCase();
      const filtered = all.filter((t) => {
        const ym = `${t.tahunPeriode}-${t.bulanPeriode}`;
        if (dari && ym < dari) return false;
        if (sampai && ym > sampai) return false;
        if (filterStatus !== "SEMUA" && t.statusPembayaran !== filterStatus) return false;
        if (q) {
          const hay = `${t.bulanPeriode} ${t.tahunPeriode} ${t.rumah?.blokRumah || ""} ${t.nominal || ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      setTagihanGabungan(filtered);
    } finally {
      setLoadingTagihan(false);
      setLoadingRumah(false);
    }
  };

  // Load data gabungan on mount & saat filter berubah
  useEffect(() => {
    loadGabungan(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dari, sampai, filterStatus, search]);

  // Search debounce (sama seperti filter keuangan admin)
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleUploadSuccess = () => {
    loadGabungan(user.id);
  };

  // Data tabel: filter по rumah terpilih
  const displayData = useMemo(() => {
    if (selectedRumahId === "semua") return tagihanGabungan;
    const id = Number(selectedRumahId);
    return tagihanGabungan.filter((t) => (t.rumah?.id ?? t.idRumah) === id);
  }, [tagihanGabungan, selectedRumahId]);

  // Ringkasan tampilan (periode terpilih, sesuai filter rumah).
  // Nominal hanya menjumlah tagihan yang belum lunas (BELUM_LUNAS + MENUNGGU_KONFIRMASI);
  // yang sudah LUNAS dikecualikan.
  const ringkasan = useMemo(() => {
    const tagihanAktif = displayData.filter((t) => t.statusPembayaran !== "LUNAS");
    const total = tagihanAktif.reduce((s, t) => s + (Number(t.nominal) || 0), 0);
    return {
      totalNominal: total,
      totalTagihan: tagihanAktif.length,
      lunas: displayData.filter((t) => t.statusPembayaran === "LUNAS").length,
      belumLunas: displayData.filter((t) => t.statusPembayaran === "BELUM_LUNAS").length,
      menunggu: displayData.filter((t) => t.statusPembayaran === "MENUNGGU_KONFIRMASI").length,
    };
  }, [displayData]);

  // Label periode untuk hero & tabel (mengikuti filter range yang dipilih)
  const heroLabel = periodeLabel;

  const { page: pageRiwayat, totalPages: totalPagesRiwayat, paginatedItems: riwayatPage, prev: prevRiwayat, next: nextRiwayat } = usePagination(
    displayData,
    [selectedRumahId, search, tagihanGabungan],
  );

  const modalRumah = useMemo(() => {
    if (!modalIpl) return null;
    const rid = modalIpl.rumah?.id ?? modalIpl.idRumah;
    return rumahList.find((r) => r.id === rid) || modalIpl.rumah || null;
  }, [modalIpl, rumahList]);

  if (loadingRumah) {
    return (
      <div className="portal-loading">
        <div className="portal-spinner" />
        <p>Memuat data rumah...</p>
      </div>
    );
  }

  if (rumahList.length === 0 && !loadingTagihan) {
    return (
      <div className="page-stack">
        <div className="portal-empty-notice">
          <Home size={40} />
          <p><strong>Rumah belum terdaftar</strong></p>
          <p>Akun Anda belum dihubungkan ke unit rumah. Hubungi pengurus cluster.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      {/* Ringkasan Total Gabungan */}
      <BillSummaryCard
        unitLabel={
          selectedRumahId === "semua"
            ? `Semua Unit (${rumahList.length} Rumah)`
            : (() => {
              const r = rumahList.find((x) => x.id === Number(selectedRumahId));
              return r ? `${r.blokRumah} · ${formatRt(r.rt)}` : "";
            })()
        }
        periodLabel={heroLabel}
        outstanding={ringkasan.totalNominal}
        paidCount={ringkasan.lunas}
        unpaidCount={ringkasan.belumLunas + ringkasan.menunggu}
        loading={loadingTagihan}
      />

      {/* ── Search + Filter (sama seperti Tagihan IPL admin) ── */}
      <div className="list-toolbar-row">
        <div className="list-search-wrap">
          <Search size={15} className="list-search-icon" />
          <input
            type="text"
            placeholder="Unit / periode / nominal..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="list-search-input"
          />
        </div>

        <FilterPopover
          active={hasActiveFilter}
          activeCount={
            (periodeDari ? 1 : 0) +
            (periodeSampai ? 1 : 0) +
            (filterStatus !== "SEMUA" ? 1 : 0) +
            (selectedRumahId !== "semua" ? 1 : 0)
          }
          open={filterOpen}
          onOpenChange={handleFilterOpenChange}
          onApply={applyFilter}
          onReset={handleResetFilter}
          applyDisabled={!!draftError}
          hint="Maksimal 12 bulan"
        >
          <FilterField label="Periode Dari">
            <div
              className={`ipl-month-input-wrap ${!draftDari ? "has-empty" : ""}`}
              data-placeholder={draftDari ? undefined : "Semua Periode"}
              style={{ position: "relative" }}
            >
              <input
                type="month"
                value={draftDari}
                max={draftSampai || currentYm}
                onChange={(e) => setDraftDari(e.target.value)}
                className="ipl-input"
                style={{ width: "100%" }}
              />
            </div>
          </FilterField>
          <FilterField label="Periode Sampai">
            <div
              className={`ipl-month-input-wrap ${!draftSampai ? "has-empty" : ""}`}
              data-placeholder={draftSampai ? undefined : "Semua Periode"}
              style={{ position: "relative" }}
            >
              <input
                type="month"
                value={draftSampai}
                min={draftDari || undefined}
                max={currentYm}
                onChange={(e) => setDraftSampai(e.target.value)}
                className="ipl-input"
                style={{ width: "100%" }}
              />
            </div>
          </FilterField>
          {draftError && (
            <p style={{ color: "#dc2626", fontSize: 12, margin: 0 }}>{draftError}</p>
          )}
          <FilterField label="Status">
            <Select
              className="ipl-select ipl-select-sm"
              value={draftStatus}
              onChange={(v) => setDraftStatus(v)}
              options={STATUS_FILTER_OPTIONS.map(({ val, label }) => ({ value: val, label }))}
            />
          </FilterField>
          {rumahList.length > 1 && (
            <FilterField label="Unit">
              <Select
                className="ipl-select ipl-select-sm"
                value={draftUnit}
                onChange={(v) => setDraftUnit(v)}
                options={[
                  { value: "semua", label: `Semua Unit (${rumahList.length})` },
                  ...rumahList.map((r) => ({ value: String(r.id), label: `${r.blokRumah} - ${formatRt(r.rt)}` })),
                ]}
              />
            </FilterField>
          )}
        </FilterPopover>
      </div>

      {/* Tabel Riwayat Tagihan */}
      <section className="content-card">
        <div className="card-header-row">
          <h3>Riwayat Tagihan {heroLabel}</h3>
          {selectedRumahId !== "semua" && (
            <button type="button" className="link-lihat-semua" onClick={() => setSelectedRumahId("semua")}>
              ← Tampilkan semua unit
            </button>
          )}
        </div>

        {loadingTagihan ? (
          <div className="portal-loading-inline">
            <div className="portal-spinner-sm" />
            <span>Memuat tagihan...</span>
          </div>
        ) : displayData.length === 0 ? (
          <p className="portal-empty-text">
            Belum ada riwayat tagihan untuk periode {heroLabel}
            {selectedRumahId !== "semua" ? " pada unit ini" : " pada semua unit Anda"}.
          </p>
        ) : (
          <>
            <div className="table-wrapper iuran-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>No</th>
                    {rumahList.length > 1 && selectedRumahId === "semua" && <th>Unit</th>}
                    <th>Periode</th>
                    <th>Nominal</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {riwayatPage.map((ipl, index) => (
                    <tr key={ipl.id}>
                      <td>{(pageRiwayat - 1) * 10 + index + 1}</td>
                      {rumahList.length > 1 && selectedRumahId === "semua" && (
                        <td>{ipl.rumah ? `${ipl.rumah.blokRumah} · ${formatRt(ipl.rumah.rt)}` : `Rumah #${ipl.idRumah}`}</td>
                      )}
                      <td>{getMonthLabel(ipl.bulanPeriode, ipl.tahunPeriode)}</td>
                      <td>{rupiah(ipl.nominal)}</td>
                      <td><WargaStatusBadge status={ipl.statusPembayaran} /></td>
                      <td>
                        {ipl.statusPembayaran === "BELUM_LUNAS" ? (
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            onClick={() => setModalIpl(ipl)}
                          >
                            <Upload size={13} /> Bayar
                          </button>
                        ) : ipl.statusPembayaran === "MENUNGGU_KONFIRMASI" ? (
                          <span className="text-muted text-sm">Menunggu konfirmasi...</span>
                        ) : ipl.statusPembayaran === "LUNAS" && ipl.pembayaran?.[0] ? (
                          <button
                            type="button"
                            className="btn-ipl-neutral"
                            onClick={() => setRiwayatIpl(ipl)}
                            title="Lihat riwayat transaksi"
                          >
                            <Eye size={14} /> Riwayat
                          </button>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="iuran-grid">
              {riwayatPage.map((ipl) => (
                <div key={ipl.id} className="iuran-grid-card">
                  <h3 className="iuran-grid-title">
                    {getMonthLabel(ipl.bulanPeriode, ipl.tahunPeriode)}
                  </h3>
                  <span className="meta-item iuran-grid-nominal">{rupiah(ipl.nominal)}</span>
                  {rumahList.length > 1 && selectedRumahId === "semua" && (
                    <span className="meta-item iuran-grid-unit">
                      {ipl.rumah ? `${ipl.rumah.blokRumah} · ${formatRt(ipl.rumah.rt)}` : `Rumah #${ipl.idRumah}`}
                    </span>
                  )}
                  <div className="iuran-grid-footer">
                    {ipl.statusPembayaran === "BELUM_LUNAS" ? (
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        onClick={() => setModalIpl(ipl)}
                      >
                        <Upload size={12} /> Bayar
                      </button>
                    ) : ipl.statusPembayaran === "LUNAS" && ipl.pembayaran?.[0] ? (
                      <button
                        type="button"
                        className="btn-ipl-neutral"
                        onClick={() => setRiwayatIpl(ipl)}
                        title="Lihat riwayat transaksi"
                      >
                        <Eye size={12} /> Riwayat
                      </button>
                    ) : (
                      <span />
                    )}
                    <WargaStatusBadge status={ipl.statusPembayaran} />
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={pageRiwayat} totalPages={totalPagesRiwayat} total={displayData.length} onPrev={prevRiwayat} onNext={nextRiwayat} />
          </>
        )}
      </section>

      {/* Modal Upload Bukti */}
      {modalIpl && (
        <BuktiUploadModal
          ipl={modalIpl}
          user={user}
          rumah={modalRumah}
          onClose={() => setModalIpl(null)}
          onSuccess={handleUploadSuccess}
        />
      )}

      {/* Modal Riwayat Transaksi */}
      {riwayatIpl && (
        <RiwayatTransaksiModal
          ipl={riwayatIpl}
          onClose={() => setRiwayatIpl(null)}
        />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
// Halaman ini murni tampilan kerja bendahara (Tagihan Warga). Tagihan pribadi
// pengurus tinggal di route /kelola-ipl/tagihan-saya; warga biasa tetap
// melihat tagihan sendiri di sini sebagai fallback (redirect /dashboard/iuran).
export default function IuranPage() {
  const { user, ready } = useUser();

  if (!ready || !user) return null;

  const bisaLihatWarga = can(user, "ipl.read") && scopeOf(user, "ipl.read") !== "OWN";

  if (bisaLihatWarga) return <AdminIuranView user={user} />;
  return <WargaIuranView user={user} />;
}
