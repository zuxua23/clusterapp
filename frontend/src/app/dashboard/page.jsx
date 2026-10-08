"use client";

import { useEffect, useState } from "react";
import {
  Users, Wallet, AlertTriangle, CheckCircle,
  TrendingUp, Clock, ArrowRight, Home, Megaphone, CalendarDays,
  Calendar, FileText, ChevronDown, Check,
} from "lucide-react";
import { iplApi, portalApi, kegiatanApi, pengumumanApi } from "@/lib/api";
import { can, isWargaView, scopeOf } from "@/lib/session";
import PanelSistem from "@/components/dashboard/PanelSistem";
import DashboardRW from "./_rw/DashboardRW";
import FilterPopover, { FilterField } from "@/components/ui/FilterPopover";
import { useUser } from "@/lib/useUser";
import Link from "next/link";
import KegiatanDetailModal from "@/components/kegiatan/KegiatanDetailModal";
import PengumumanDetailModal from "@/components/pengumuman/PengumumanDetailModal";
import {
  formatRupiah,
  formatRupiahSingkat,
  BULAN_PENDEK as BULAN_NAMES,
  getMonthLabel,
  getCurrentYm,
  formatYmPendek,
  formatTanggalLengkap as formatKegiatanDate,
  formatTanggalPanjang as formatPengumumanDate,
} from "@/lib/format";

// ── Mini Bar Chart (SVG) ──────────────────────────────────────────────────────
function TrenChart({ data }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.kasMasuk), 1);

  return (
    <div className="db-chart-wrap">
      <div className="db-chart-bars">
        {data.map((d, i) => {
          const pct = max > 0 ? (d.kasMasuk / max) * 100 : 0;
          const isLast = i === data.length - 1;
          return (
            <div key={i} className="db-chart-col" title={`${d.label}: ${formatRupiah(d.kasMasuk)}`}>
              <div className="db-bar-wrapper">
                <div
                  className={`db-bar ${isLast ? "db-bar-active" : ""}`}
                  style={{ height: `${Math.max(pct, 4)}%` }}
                />
              </div>
              <span className="db-chart-label">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Status badge kecil ────────────────────────────────────────────────────────
function StatusDot({ status }) {
  const map = {
    LUNAS: { cls: "dot-lunas", label: "Lunas" },
    BELUM_LUNAS: { cls: "dot-belum", label: "Belum Lunas" },
    MENUNGGU_KONFIRMASI: { cls: "dot-menunggu", label: "Menunggu" },
  };
  const { cls, label } = map[status] || { cls: "", label: status };
  return <span className={`db-status-dot ${cls}`}>{label}</span>;
}

function StatusBadge({ status }) {
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

// ── Admin/Pengurus: ringkasan seluruh cluster ─────────────────────────────────
function AdminDashboardView({ user }) {
  const formatYm = formatYmPendek;
  const monthDiffInclusive = (dari, sampai) => {
    const [y1, m1] = dari.split("-").map(Number);
    const [y2, m2] = sampai.split("-").map(Number);
    return (y2 - y1) * 12 + (m2 - m1) + 1;
  };

  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [periodeDari, setPeriodeDari] = useState(getCurrentYm);
  const [periodeSampai, setPeriodeSampai] = useState(getCurrentYm);
  const [draftDari, setDraftDari] = useState(getCurrentYm);
  const [draftSampai, setDraftSampai] = useState(getCurrentYm);
  const [filterOpen, setFilterOpen] = useState(false);
  const [kegiatan, setKegiatan] = useState([]);
  const [pengumuman, setPengumuman] = useState([]);
  const [selectedKegiatan, setSelectedKegiatan] = useState(null);
  const [selectedPengumuman, setSelectedPengumuman] = useState(null);

  // Normalisasi + validasi turunan (tanpa setState di dalam effect)
  const [dari, sampai] = periodeDari > periodeSampai
    ? [periodeSampai, periodeDari]
    : [periodeDari, periodeSampai];
  const rangeError = monthDiffInclusive(dari, sampai) > 12
    ? "Rentang periode maksimal 12 bulan."
    : "";

  // Validasi draft di dalam popover (sebelum diterapkan)
  const [draftDariN, draftSampaiN] = draftDari > draftSampai
    ? [draftSampai, draftDari]
    : [draftDari, draftSampai];
  const draftError = draftDari && draftSampai && monthDiffInclusive(draftDariN, draftSampaiN) > 12
    ? "Rentang periode maksimal 12 bulan."
    : "";

  useEffect(() => {
    if (rangeError) return;
    setLoadingStats(true);
    iplApi.getDashboardStats({ dari, sampai })
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoadingStats(false));
  }, [dari, sampai, rangeError]);

  // Sama kayak dashboard warga: kegiatan yang belum lewat tanggalnya + pengumuman aktif,
  // biar pengurus juga bisa lihat sekilas apa yang tampil ke warga tanpa pindah menu.
  useEffect(() => {
    let cancelled = false;
    async function loadKegiatan() {
      let data = await kegiatanApi.getFeed().catch(() => null);
      if (!Array.isArray(data)) data = await kegiatanApi.getActive().catch(() => []);
      if (cancelled) return;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const akanDatang = (data || []).filter((k) => {
        const t = new Date(k.tanggalAcara);
        return Number.isNaN(t.getTime()) || t >= today;
      });
      akanDatang.sort((a, b) => new Date(a.tanggalAcara).getTime() - new Date(b.tanggalAcara).getTime());
      setKegiatan(akanDatang);
    }
    loadKegiatan();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPengumuman() {
      let data = await pengumumanApi.getFeed().catch(() => null);
      if (!Array.isArray(data)) data = await pengumumanApi.getActive().catch(() => []);
      if (cancelled) return;
      const terbaru = [...(data || [])].sort((a, b) => new Date(b.createDate || 0) - new Date(a.createDate || 0));
      setPengumuman(terbaru);
    }
    loadPengumuman();
    return () => { cancelled = true; };
  }, []);

  const openFilter = () => {
    setDraftDari(periodeDari);
    setDraftSampai(periodeSampai);
    setFilterOpen(true);
  };

  const applyFilter = () => {
    if (!draftDari || !draftSampai || draftError) return;
    setPeriodeDari(draftDari);
    setPeriodeSampai(draftSampai);
    setFilterOpen(false);
  };

  const handleResetPeriode = () => {
    const cur = getCurrentYm();
    setPeriodeDari(cur);
    setPeriodeSampai(cur);
    setDraftDari(cur);
    setDraftSampai(cur);
    setFilterOpen(false);
  };

  const isDefaultPeriode = periodeDari === getCurrentYm() && periodeSampai === getCurrentYm();
  const periodeLabel = periodeDari === periodeSampai
    ? formatYm(periodeDari)
    : `${formatYm(periodeDari)} - ${formatYm(periodeSampai)}`;

  const userName = user?.nama || user?.name || "Admin";

  return (
    <div className="page-stack">

      {/* ── Welcome + Filter Periode (satu field) ── */}
      <section className="welcome-banner">
        <h2 className="welcome-banner-title">Selamat datang kembali, {userName}</h2>
        <p className="welcome-banner-sub">Ini ringkasan aktivitas cluster Topaz periode {periodeLabel}.</p>
        <FilterPopover
          active={!isDefaultPeriode}
          activeCount={!isDefaultPeriode ? 1 : 0}
          label={isDefaultPeriode ? "Filter periode" : periodeLabel}
          hint="Maksimal 12 bulan · Total Warga tidak ikut filter"
          open={filterOpen}
          onOpenChange={setFilterOpen}
          onOpen={openFilter}
          onApply={applyFilter}
          onReset={handleResetPeriode}
          applyDisabled={!!draftError}
        >
          <FilterField label="Dari">
            <input
              type="month"
              className="form-control"
              value={draftDari}
              max={draftSampai || getCurrentYm()}
              onChange={(e) => e.target.value && setDraftDari(e.target.value)}
            />
          </FilterField>
          <FilterField label="Sampai">
            <input
              type="month"
              className="form-control"
              value={draftSampai}
              min={draftDari || undefined}
              max={getCurrentYm()}
              onChange={(e) => e.target.value && setDraftSampai(e.target.value)}
            />
          </FilterField>
          {draftError && (
            <p style={{ color: "#dc2626", fontSize: 12, margin: 0 }}>{draftError}</p>
          )}
        </FilterPopover>
      </section>

      {/* ── Alert: menunggu konfirmasi ── */}
      {stats?.menungguKonfirmasi > 0 && (
        <Link href="/dashboard/iuran" className="ipl-dashboard-alert">
          <AlertTriangle size={18} />
          <span>
            Ada <strong>{stats.menungguKonfirmasi} pembayaran</strong> menunggu konfirmasi
          </span>
          <ArrowRight size={16} style={{ marginLeft: "auto" }} />
        </Link>
      )}

      {/* ── Metric Cards — Beranda (tint redesign, selaras Keuangan/Iuran) ── */}
      <section className="ipl-summary-grid keu-summary-grid">

        {/* Kas Masuk */}
        <Link href="/dashboard/iuran" className="ipl-summary-card keu-card keu-teal">
          <div className="keu-icon-circle"><Wallet size={22} strokeWidth={2} /></div>
          <div className="keu-card-text">
            <span className="ipl-summary-label">Total Pembayaran IPL</span>
            <span className="ipl-summary-value">
              {loadingStats ? "-" : formatRupiahSingkat(stats?.totalKasMasukBulanIni ?? 0)}
            </span>
          </div>
        </Link>

        {/* Lunas */}
        <Link href="/dashboard/iuran" className="ipl-summary-card keu-card keu-green">
          <div className="keu-icon-circle"><CheckCircle size={22} strokeWidth={2} /></div>
          <div className="keu-card-text">
            <span className="ipl-summary-label">Rumah Lunas</span>
            <span className="ipl-summary-value">
              {loadingStats ? "-" : `${stats?.lunasBulanIni ?? 0} / ${stats?.totalTagihanBulanIni ?? 0}`}
            </span>
          </div>
        </Link>

        {/* Menunggu Konfirmasi */}
        <Link href="/dashboard/iuran" className="ipl-summary-card keu-card keu-amber">
          <div className="keu-icon-circle"><Clock size={22} strokeWidth={2} /></div>
          <div className="keu-card-text">
            <span className="ipl-summary-label">Menunggu Konfirmasi</span>
            <span className="ipl-summary-value">
              {loadingStats ? "-" : (stats?.menungguKonfirmasi ?? 0)}
            </span>
          </div>
        </Link>

        {/* Total Warga */}
        <Link href="/dashboard/warga" className="ipl-summary-card keu-card keu-purple">
          <div className="keu-icon-circle"><Users size={22} strokeWidth={2} /></div>
          <div className="keu-card-text">
            <span className="ipl-summary-label">Total Warga</span>
            <span className="ipl-summary-value">
              {loadingStats ? "-" : (stats?.totalWarga ?? "-")}
            </span>
          </div>
        </Link>

      </section>

      {/* ── Chart + Tabel row ── */}
      <div className="db-bottom-row">

        {/* Mini Chart: Tren 6 bulan */}
        <div className="content-card db-chart-card">
          <div className="db-section-header">
            <TrendingUp size={17} />
            <h3>Tren Kas Masuk IPL</h3>
            <span className="db-section-sub">{periodeLabel}</span>
          </div>
          {loadingStats || !stats?.trenPemasukan ? (
            <div className="db-chart-loading">Memuat grafik...</div>
          ) : (
            <>
              <TrenChart data={stats.trenPemasukan} />
              {/* Legend angka bulan terakhir */}
              <div className="db-chart-legend">
                {stats.trenPemasukan.map((d, i) => (
                  <div key={i} className="db-legend-item">
                    <span className="db-legend-label">{d.label}</span>
                    <span className="db-legend-value">{formatRupiah(d.kasMasuk)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Tabel: 5 pembayaran terbaru */}
        <div className="content-card db-recent-card">
          <div className="db-section-header">
            <Clock size={17} />
            <h3>Pembayaran Terbaru</h3>
            <div className="db-section-header-right">
              <span className="db-section-sub">{periodeLabel}</span>
              <Link href="/dashboard/iuran" className="db-section-link">
                Lihat semua <ArrowRight size={13} />
              </Link>
            </div>
          </div>

          {loadingStats ? (
            <div className="db-chart-loading">Memuat data...</div>
          ) : !stats?.pembayaranTerbaru?.length ? (
            <div className="db-empty-recent">Belum ada pembayaran pada periode {periodeLabel}.</div>
          ) : (
            <div className="db-recent-list">
              {stats.pembayaranTerbaru.map((p) => (
                <div key={p.idPembayaran} className="db-recent-item">
                  <div className="db-recent-avatar">
                    {p.user?.namaUser?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="db-recent-info">
                    <span className="db-recent-name">{p.user?.namaUser ?? "-"}</span>
                    <span className="db-recent-sub">
                      {p.ipl?.rumah?.blokRumah} · {BULAN_NAMES[p.ipl?.bulanPeriode]} {p.ipl?.tahunPeriode}
                    </span>
                  </div>
                  <div className="db-recent-right">
                    <span className="db-recent-nominal">{formatRupiah(p.nominal)}</span>
                    <StatusDot status={p.ipl?.statusPembayaran} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Kegiatan Cluster */}
      <section className="content-card">
        <div className="db-section-header">
          <CalendarDays size={17} />
          <h3>Kegiatan Cluster</h3>
          <div className="db-section-header-right">
            <Link href="/dashboard/kegiatan" className="db-section-link">
              Lihat semua <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {kegiatan.length === 0 ? (
          <div className="portal-empty-notice">
            <CalendarDays size={32} />
            <p>Belum ada kegiatan akan datang.</p>
          </div>
        ) : (
          <div className="portal-kegiatan-grid">
            {kegiatan.map((k) => (
              <div
                key={k.id}
                className="portal-kegiatan-card"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedKegiatan(k)}
                onKeyDown={(e) => { if (e.key === "Enter") setSelectedKegiatan(k); }}
              >
                {k.gambarUrl && (
                  <div className="portal-kegiatan-img-wrap">
                    <img
                      src={kegiatanApi.imageUrl(k.gambarUrl)}
                      alt={k.judul}
                      className="portal-kegiatan-img"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  </div>
                )}
                <div className="portal-kegiatan-body">
                  <h3 className="portal-kegiatan-title">{k.judul}</h3>
                  {k.deskripsi && (
                    <p className="portal-kegiatan-desc">{k.deskripsi}</p>
                  )}
                  <div className="portal-kegiatan-meta">
                    <span className="meta-item"><Calendar size={13} /> {formatKegiatanDate(k.tanggalAcara)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pengumuman */}
      <section className="content-card">
        <div className="db-section-header">
          <Megaphone size={17} />
          <h3>Pengumuman</h3>
          <div className="db-section-header-right">
            <Link href="/dashboard/pengumuman" className="db-section-link">
              Lihat semua <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {pengumuman.length === 0 ? (
          <p className="portal-empty-text">Belum ada pengumuman aktif saat ini.</p>
        ) : (
          <div className="portal-card-list">
            {pengumuman.map((p) => (
              <div
                key={p.id}
                className="portal-info-card"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedPengumuman(p)}
                onKeyDown={(e) => { if (e.key === "Enter") setSelectedPengumuman(p); }}
              >
                <div className="portal-info-card-icon">
                  <Megaphone size={18} />
                </div>
                <div className="portal-info-card-body">
                  <h3 className="portal-info-card-title">{p.judul}</h3>
                  {p.keteranganPengumuman && (
                    <p className="portal-info-card-desc">{p.keteranganPengumuman}</p>
                  )}
                  <div className="portal-info-card-meta">
                    <span className="meta-item"><Calendar size={12} /> {formatPengumumanDate(p.createDate)}</span>
                    {p.filePengumuman && (
                      <span className="portal-download-link">
                        <FileText size={12} /> Ada lampiran
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedKegiatan && (
        <KegiatanDetailModal kegiatan={selectedKegiatan} onClose={() => setSelectedKegiatan(null)} />
      )}
      {selectedPengumuman && (
        <PengumumanDetailModal pengumuman={selectedPengumuman} onClose={() => setSelectedPengumuman(null)} />
      )}
    </div>
  );
}

// ── Warga: dashboard pribadi (tagihan + kegiatan + pengumuman) ────────────────
function WargaDashboardView({ user }) {
  const [rumahList, setRumahList] = useState([]);
  const [tagihanAllList, setTagihanAllList] = useState([]);
  const [kegiatan, setKegiatan] = useState([]);
  const [pengumuman, setPengumuman] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKegiatan, setSelectedKegiatan] = useState(null);
  const [selectedPengumuman, setSelectedPengumuman] = useState(null);
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());
  const [expandInitDone, setExpandInitDone] = useState(false);

  const now = new Date();
  const bulanIni = String(now.getMonth() + 1).padStart(2, "0");
  const tahunIni = String(now.getFullYear());

  // Fetch semua tagihan lintas periode (tanpa filter bulan) — Task 1
  useEffect(() => {
    async function fetchData() {
      try {
        try {
          const res = await portalApi.getTagihanByUser(user.id);
          setRumahList(res.rumah || []);
          setTagihanAllList(res.tagihan || []);
        } catch (e) {
          console.warn("getTagihanByUser gagal, fallback ke per-rumah:", e);
          const rumah = await portalApi.getRumahByUser(user.id);
          setRumahList(rumah);
          const allTagihan = [];
          for (const r of rumah) {
            try {
              const { tagihan } = await portalApi.getTagihanByRumah(r.id);
              allTagihan.push(...(tagihan || []).map((t) => ({ ...t, rumah: { id: r.id, blokRumah: r.blokRumah, rt: r.rt } })));
            } catch (rumahErr) {
              console.warn(`Gagal memuat tagihan rumah ${r.id}:`, rumahErr);
            }
          }
          setTagihanAllList(allTagihan);
        }
      } catch (err) {
        console.error("Gagal memuat data dashboard warga:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user.id]);

  // Warga hanya melihat yang aktif: kegiatan yang belum lewat tanggalnya dan pengumuman
  // berstatus aktif. Yang sudah lewat/dinonaktifkan tidak ditampilkan (tanpa tab arsip).
  useEffect(() => {
    let cancelled = false;
    async function loadKegiatan() {
      let data = await kegiatanApi.getFeed().catch(() => null);
      if (!Array.isArray(data)) data = await kegiatanApi.getActive().catch(() => []);
      if (cancelled) return;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const akanDatang = (data || []).filter((k) => {
        const t = new Date(k.tanggalAcara);
        return Number.isNaN(t.getTime()) || t >= today;
      });
      akanDatang.sort((a, b) => new Date(a.tanggalAcara).getTime() - new Date(b.tanggalAcara).getTime());
      setKegiatan(akanDatang);
    }
    loadKegiatan();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPengumuman() {
      let data = await pengumumanApi.getFeed().catch(() => null);
      if (!Array.isArray(data)) data = await pengumumanApi.getActive().catch(() => []);
      if (!cancelled) setPengumuman(data || []);
    }
    loadPengumuman();
    return () => { cancelled = true; };
  }, []);

  // ── Derived untuk hero & breakdown — sebelum early return agar hooks tidak berubah urutan
  const isBulanIni = (t) => t.bulanPeriode === bulanIni && t.tahunPeriode === tahunIni;
  const tunggakanList = tagihanAllList.filter(
    (t) => t.statusPembayaran === "BELUM_LUNAS" || t.statusPembayaran === "MENUNGGU_KONFIRMASI"
  );
  const tagihanLunasList = tagihanAllList.filter((t) => t.statusPembayaran === "LUNAS");
  const adaTunggakan = tunggakanList.length > 0;
  const isLunasSemua = !adaTunggakan && tagihanAllList.length > 0;
  const totalTunggakanNominal = tunggakanList.reduce((s, t) => s + (t.nominal || 0), 0);

  // Breakdown per periode — grouped by BULAN, tiap grup simpan list tagihan (untuk nested unit rows)
  const breakdownMap = {};
  for (const t of tunggakanList) {
    const key = `${t.bulanPeriode}-${t.tahunPeriode}`;
    if (!breakdownMap[key]) {
      breakdownMap[key] = {
        bulanPeriode: t.bulanPeriode,
        tahunPeriode: t.tahunPeriode,
        label: getMonthLabel(t.bulanPeriode, t.tahunPeriode),
        nominal: 0,
        count: 0,
        isBulanIni: isBulanIni(t),
        tagihans: [],
      };
    }
    breakdownMap[key].nominal += t.nominal || 0;
    breakdownMap[key].count += 1;
    // simpan tagihan lengkap dengan rumah untuk nested row
    const rid = t.rumah?.id ?? t.idRumah;
    const rumah = rumahList.find((r) => r.id === rid) || t.rumah || { id: rid, blokRumah: `Rumah #${rid}`, rt: "" };
    breakdownMap[key].tagihans.push({ ...t, _rumah: rumah });
  }
  const breakdownList = Object.values(breakdownMap).sort((a, b) => {
    const va = parseInt(a.tahunPeriode, 10) * 12 + parseInt(a.bulanPeriode, 10);
    const vb = parseInt(b.tahunPeriode, 10) * 12 + parseInt(b.bulanPeriode, 10);
    return va - vb; // tertua dulu
  });

  // Expand/collapse per grup bulan — default expanded jika ≤3 periode (effect harus sebelum early return)
  useEffect(() => {
    if (expandInitDone || breakdownList.length === 0) return;
    if (breakdownList.length <= 3) {
      setExpandedKeys(new Set(breakdownList.map((b) => `${b.bulanPeriode}-${b.tahunPeriode}`)));
    }
    setExpandInitDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdownList.length, expandInitDone]);
  // reset init flag saat tunggakan berubah total (user ganti akun)
  useEffect(() => {
    setExpandInitDone(false);
    setExpandedKeys(new Set());
  }, [tunggakanList.length]);
  const toggleGroup = (key) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const firstName = (user?.nama || user?.name || "Warga").split(" ")[0];
  const periodeBulanIni = getMonthLabel(bulanIni, tahunIni);
  const countLunas = tagihanLunasList.length;
  const countBelum = tagihanAllList.filter((t) => t.statusPembayaran === "BELUM_LUNAS").length;
  const countMenunggu = tagihanAllList.filter((t) => t.statusPembayaran === "MENUNGGU_KONFIRMASI").length;
  // Forward-looking info untuk state lunas
  const pembayaranTerakhir = [...tagihanLunasList]
    .filter((t) => t.pembayaran?.[0]?.tanggalBayar)
    .sort((a, b) => new Date(b.pembayaran[0].tanggalBayar) - new Date(a.pembayaran[0].tanggalBayar))[0] || null;
  // fallback jika tidak ada pembayaran record tapi ada tagihan lunas
  const lastPaidFallback = !pembayaranTerakhir && tagihanLunasList.length > 0
    ? [...tagihanLunasList].sort((a, b) => {
        const va = parseInt(a.tahunPeriode, 10) * 12 + parseInt(a.bulanPeriode, 10);
        const vb = parseInt(b.tahunPeriode, 10) * 12 + parseInt(b.bulanPeriode, 10);
        return vb - va;
      })[0]
    : null;
  const nextInvoiceDate = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 10);
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  })();

  if (loading) {
    return (
      <div className="portal-loading">
        <div className="portal-spinner" />
        <p>Memuat data...</p>
      </div>
    );
  }

  return (
    <div className="page-stack warga-dashboard">
      {/* Hero — Task 1 & 2 */}
      <section className={`portal-hero ${isLunasSemua ? "is-success" : ""}`}>
        <div className="portal-hero-accent" aria-hidden />
        <div className="portal-hero-main">
          <div className="portal-hero-left">
            <p className="portal-hero-eyebrow">Beranda Warga · RW 21 · Cluster Topaz</p>
            <h2>Halo, {firstName}</h2>
            <p className="portal-hero-sub">
              {rumahList.length > 1
                ? `Kelola ${rumahList.length} unit rumah Anda dalam satu tempat.`
                : "Selamat datang di Beranda Warga Cluster Topaz."}
            </p>
            <div className="portal-hero-meta">
              <span className="portal-hero-periode">
                <Wallet size={13} /> IPL {periodeBulanIni}
                {rumahList.length > 1 ? ` · ${rumahList.length} unit` : ""}
              </span>
              {tagihanAllList.length > 0 && (
                <span className="portal-hero-summary">
                  {countLunas} lunas · {countBelum} belum
                  {countMenunggu > 0 ? ` · ${countMenunggu} menunggu` : ""}
                </span>
              )}
            </div>
          </div>
          <div className="portal-hero-right">
            {isLunasSemua ? (
              <>
                <span className="portal-hero-label">Status Pembayaran IPL</span>
                <span className="portal-hero-value success">✓ Lunas Semua</span>
                <StatusBadge status="LUNAS" />
                <div className="portal-hero-forward">
                  {pembayaranTerakhir ? (
                    <span className="portal-hero-summary">
                      Pembayaran terakhir: {getMonthLabel(pembayaranTerakhir.bulanPeriode, pembayaranTerakhir.tahunPeriode)} · Rp{(pembayaranTerakhir.nominal || pembayaranTerakhir.pembayaran?.[0]?.nominal || 0).toLocaleString("id-ID")}
                    </span>
                  ) : lastPaidFallback ? (
                    <span className="portal-hero-summary">
                      Pembayaran terakhir: {getMonthLabel(lastPaidFallback.bulanPeriode, lastPaidFallback.tahunPeriode)} · Rp{(lastPaidFallback.nominal || 0).toLocaleString("id-ID")}
                    </span>
                  ) : null}
                  <span className="portal-hero-summary">Tagihan berikutnya diterbitkan {nextInvoiceDate}</span>
                </div>
              </>
            ) : adaTunggakan ? (
              <>
                <span className="portal-hero-label">Total Tagihan Belum Lunas</span>
                <span className="portal-hero-value">Rp {totalTunggakanNominal.toLocaleString("id-ID")}</span>
                {tunggakanList.some((t) => t.statusPembayaran === "MENUNGGU_KONFIRMASI") ? (
                  <StatusBadge status="MENUNGGU_KONFIRMASI" />
                ) : (
                  <StatusBadge status="BELUM_LUNAS" />
                )}
              </>
            ) : (
              <>
                <span className="portal-hero-label">Total Tagihan Belum Lunas</span>
                <span className="portal-hero-value muted">Belum ada tagihan</span>
                <span className="portal-hero-summary">Tagihan IPL belum diterbitkan.</span>
              </>
            )}
          </div>
        </div>
        <div className="portal-hero-orb orb-a" aria-hidden />
        <div className="portal-hero-orb orb-b" aria-hidden />
      </section>

      {/* Rincian Tunggakan — grouped by BULAN, nested unit rows, single CTA */}
      {adaTunggakan ? (
        <section className="content-card warga-detail-card">
          <div className="warga-tunggakan-header">
            <div className="warga-tunggakan-header-left">
              <h3>Rincian Tunggakan</h3>
              <span className="warga-detail-sub">{breakdownList.length} periode · {tunggakanList.length} tagihan · {rumahList.length} unit rumah</span>
            </div>
            <span className="warga-tunggakan-total">Rp {totalTunggakanNominal.toLocaleString("id-ID")}</span>
          </div>
          <ul className="warga-tunggakan-groups">
            {breakdownList.map((b) => {
              const key = `${b.bulanPeriode}-${b.tahunPeriode}`;
              const isExpanded = expandedKeys.has(key);
              return (
                <li key={key} className="warga-tunggakan-group">
                  <button
                    type="button"
                    className="warga-tunggakan-group-header"
                    onClick={() => toggleGroup(key)}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? "Tutup" : "Buka"} rincian ${b.label}`}
                  >
                    <span className="warga-tunggakan-group-left">
                      <span className="warga-tunggakan-group-title">{b.label}</span>
                      <span className="warga-tunggakan-group-sub">{b.count} unit belum lunas</span>
                    </span>
                    <span className="warga-tunggakan-group-right">
                      <strong>Rp {b.nominal.toLocaleString("id-ID")}</strong>
                      <span className={`portal-badge-mini ${b.isBulanIni ? "badge-bulan-ini" : "badge-tertunggak"}`}>{b.isBulanIni ? "Bulan ini" : "Tertunggak"}</span>
                      <ChevronDown size={16} className={`warga-tunggakan-chevron ${isExpanded ? "is-open" : ""}`} aria-hidden />
                    </span>
                  </button>
                  {isExpanded && (
                    <ul className="warga-tunggakan-unit-list">
                      {b.tagihans.map((t) => (
                        <li key={t.id} className="warga-tunggakan-unit-row">
                          <span className="warga-tunggakan-unit-left">
                            {t._rumah.blokRumah} <small>· {String(t._rumah.rt || "").replace("_", " ")}</small>
                          </span>
                          <span className="warga-tunggakan-unit-right">Rp {(t.nominal || 0).toLocaleString("id-ID")}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="warga-detail-cta-wrap">
            <Link href="/dashboard/iuran" className="warga-detail-cta">
              Bayar Sekarang <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      ) : isLunasSemua ? (
        <section className="content-card warga-detail-card">
          <div className="warga-lunas-headline">
            <span className="warga-lunas-icon" aria-hidden><Check size={14} strokeWidth={3} /></span>
            <div className="warga-lunas-text">
              <span className="warga-lunas-title">Semua Tagihan Lunas</span>
              <span className="warga-detail-sub">{rumahList.length} unit rumah · tidak ada tunggakan</span>
            </div>
          </div>
          <div className="warga-lunas-divider" />
          {(() => {
            const riwayat = [...tagihanLunasList]
              .sort((a, b) => {
                const da = a.pembayaran?.[0]?.tanggalBayar ? new Date(a.pembayaran[0].tanggalBayar).getTime() : 0;
                const db = b.pembayaran?.[0]?.tanggalBayar ? new Date(b.pembayaran[0].tanggalBayar).getTime() : 0;
                if (da && db) return db - da;
                const va = parseInt(a.tahunPeriode, 10) * 12 + parseInt(a.bulanPeriode, 10);
                const vb = parseInt(b.tahunPeriode, 10) * 12 + parseInt(b.bulanPeriode, 10);
                return vb - va;
              })
              .slice(0, 2);
            if (riwayat.length === 0) {
              return (
                <>
                  <p className="warga-detail-sub" style={{ textAlign: "left", marginTop: 12 }}>Tidak ada tunggakan. Terima kasih!</p>
                  <div className="warga-lunas-footer">Tagihan berikutnya diterbitkan {nextInvoiceDate}</div>
                </>
              );
            }
            return (
              <>
                <ul className="warga-detail-list">
                  {riwayat.map((t) => (
                    <li key={t.id} className="warga-detail-row">
                      <span className="warga-detail-left">{getMonthLabel(t.bulanPeriode, t.tahunPeriode)}</span>
                      <span className="warga-detail-right">
                        <strong>Rp {(t.nominal || 0).toLocaleString("id-ID")}</strong>
                        <span className="warga-detail-date">
                          {t.pembayaran?.[0]?.tanggalBayar
                            ? new Date(t.pembayaran[0].tanggalBayar).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
                            : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="warga-lunas-footer">Tagihan berikutnya diterbitkan {nextInvoiceDate}</div>
              </>
            );
          })()}
        </section>
      ) : rumahList.length === 0 ? (
        <section className="content-card warga-detail-card">
          <div className="warga-tunggakan-header">
            <div className="warga-tunggakan-header-left">
              <h3>Rincian Tunggakan</h3>
              <span className="warga-detail-sub">Belum ada data rumah</span>
            </div>
            <span className="warga-tunggakan-total muted">-</span>
          </div>
          <div className="portal-empty-notice">
            <Home size={32} />
            <p><strong>Rumah belum terdaftar</strong></p>
            <p>Silakan hubungi pengurus cluster untuk menghubungkan akun Anda dengan data rumah.</p>
          </div>
        </section>
      ) : (
        <section className="content-card warga-detail-card">
          <div className="warga-tunggakan-header">
            <div className="warga-tunggakan-header-left">
              <h3>Rincian Tunggakan</h3>
              <span className="warga-detail-sub">{rumahList.length} unit rumah · belum ada tagihan</span>
            </div>
            <span className="warga-tunggakan-total muted" style={{ fontSize: "1rem", color: "#64748b" }}>-</span>
          </div>
          <div className="warga-tunggakan-success">
            <p>Tagihan IPL belum diterbitkan.</p>
            <p className="warga-detail-sub">Tagihan berikutnya diterbitkan {nextInvoiceDate}</p>
          </div>
        </section>
      )}

      {/* Kegiatan Cluster */}
      <section className="content-card">
        <div className="db-section-header">
          <CalendarDays size={17} />
          <h3>Kegiatan Cluster</h3>
        </div>

        {kegiatan.length === 0 ? (
          <div className="portal-empty-notice">
            <CalendarDays size={32} />
            <p>Belum ada kegiatan akan datang.</p>
          </div>
        ) : (
          <div className="portal-kegiatan-grid">
            {kegiatan.map((k) => (
              <div
                key={k.id}
                className="portal-kegiatan-card"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedKegiatan(k)}
                onKeyDown={(e) => { if (e.key === "Enter") setSelectedKegiatan(k); }}
              >
                {k.gambarUrl && (
                  <div className="portal-kegiatan-img-wrap">
                    <img
                      src={kegiatanApi.imageUrl(k.gambarUrl)}
                      alt={k.judul}
                      className="portal-kegiatan-img"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  </div>
                )}
                <div className="portal-kegiatan-body">
                  <h3 className="portal-kegiatan-title">{k.judul}</h3>
                  {k.deskripsi && (
                    <p className="portal-kegiatan-desc">{k.deskripsi}</p>
                  )}
                  <div className="portal-kegiatan-meta">
                    <span className="meta-item"><Calendar size={13} /> {formatKegiatanDate(k.tanggalAcara)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pengumuman */}
      <section className="content-card">
        <div className="db-section-header">
          <Megaphone size={17} />
          <h3>Pengumuman</h3>
        </div>

        {pengumuman.length === 0 ? (
          <p className="portal-empty-text">Belum ada pengumuman aktif saat ini.</p>
        ) : (
          <div className="portal-card-list">
            {pengumuman.map((p) => (
              <div
                key={p.id}
                className="portal-info-card"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedPengumuman(p)}
                onKeyDown={(e) => { if (e.key === "Enter") setSelectedPengumuman(p); }}
              >
                <div className="portal-info-card-icon">
                  <Megaphone size={18} />
                </div>
                <div className="portal-info-card-body">
                  <h3 className="portal-info-card-title">{p.judul}</h3>
                  {p.keteranganPengumuman && (
                    <p className="portal-info-card-desc">{p.keteranganPengumuman}</p>
                  )}
                  <div className="portal-info-card-meta">
                    <span className="meta-item"><Calendar size={12} /> {formatPengumumanDate(p.createDate)}</span>
                    {p.filePengumuman && (
                      <span className="portal-download-link">
                        <FileText size={12} /> Ada lampiran
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedKegiatan && (
        <KegiatanDetailModal kegiatan={selectedKegiatan} onClose={() => setSelectedKegiatan(null)} />
      )}
      {selectedPengumuman && (
        <PengumumanDetailModal pengumuman={selectedPengumuman} onClose={() => setSelectedPengumuman(null)} />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, ready } = useUser();

  if (!ready || !user) return null;

  // Tampilan warga (tagihan sendiri), pengurus (ringkasan tagihan wilayah), atau pengelola sistem
  // (Admin: tanpa akses tagihan, hanya role/pengurus/data warga), mengikuti hak akses.
  if (isWargaView(user)) return <WargaDashboardView user={user} />;
  if (!can(user, "ipl.read")) return <PanelSistem user={user} />;
  // Bendahara RW: ringkasan setoran IPL RT ke kas RW (bukan data level warga).
  if (can(user, "setoran.konfirmasi") && scopeOf(user, "setoran.konfirmasi") === "ALL") {
    return <DashboardRW user={user} />;
  }
  return <AdminDashboardView user={user} />;
}
