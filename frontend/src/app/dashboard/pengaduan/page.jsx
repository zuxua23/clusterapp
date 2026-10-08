"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus, Eye, MessageSquareWarning, Calendar, Search, Forward, User, MapPin, Tag,
} from "lucide-react";
import { pengaduanApi } from "@/lib/api";
import { showMessage } from "@/lib/message";
import FilterPopover, { FilterField } from "@/components/ui/FilterPopover";
import Pagination from "@/components/ui/Pagination";
import Select from "@/components/ui/Select";
import { usePagination } from "@/lib/usePagination";
import { useAutoRefresh } from "@/lib/useAutoRefresh";
import PengaduanFormModal from "@/components/pengaduan/PengaduanFormModal";
import PengaduanDetailModal from "@/components/pengaduan/PengaduanDetailModal";
import { can, scopeOf, areaLabel } from "@/lib/session";
import { BULAN_OPTIONS, formatTanggalPendek as formatDate } from "@/lib/format";
import { useUser } from "@/lib/useUser";
import PengaduanRespondModal from "@/components/pengaduan/PengaduanRespondModal";

const KATEGORI_LABELS = {
  KEBERSIHAN: "Kebersihan",
  KEAMANAN: "Keamanan",
  INFRASTRUKTUR: "Infrastruktur",
  LAINNYA: "Lainnya",
};

const STATUS_LABELS = {
  MENUNGGU: { label: "Menunggu", cls: "status-menunggu" },
  DIPROSES: { label: "Diproses", cls: "status-diproses" },
  SELESAI: { label: "Selesai", cls: "status-selesai" },
  DITOLAK: { label: "Ditolak", cls: "status-ditolak" },
};

// Urutan prioritas: yang masih perlu ditindaklanjuti (Menunggu/Diproses) duluan,
// baru Selesai, lalu Ditolak. Di dalam grup yang sama, diurutkan tanggal terbaru dulu.
const STATUS_PRIORITY = {
  MENUNGGU: 0,
  DIPROSES: 0,
  SELESAI: 1,
  DITOLAK: 2,
};

// Urutan tanggal di filter. "prioritas" (khusus pengurus) = status yang perlu ditindaklanjuti dulu.
const URUTAN_LABELS = {
  terbaru: "Terbaru dulu",
  terlama: "Terlama dulu",
};

/** Urutkan berdasarkan tanggal lapor; `terlama` = naik (asc), selain itu turun (desc). */
function urutkanTanggal(list, urutan) {
  const arah = urutan === "terlama" ? 1 : -1;
  return [...list].sort((a, b) => arah * (new Date(a.createdAt) - new Date(b.createdAt)));
}

function StatusBadge({ status }) {
  const s = STATUS_LABELS[status] || STATUS_LABELS.MENUNGGU;
  return <span className={`ipl-status-badge ${s.cls}`}>{s.label}</span>;
}

// Hanya yang punya permission pengaduan.respon yang boleh menanggapi; lainnya hanya melihat.
function canRespond(item, boleh = true) {
  return boleh && (item.status === "MENUNGGU" || item.status === "DIPROSES");
}

/** `hideViewFallback`: dipakai di kartu mobile — kartunya sendiri udah bisa diklik buat
 * buka detail, jadi tombol "Lihat" yang cuma ngedobelin aksi itu gak perlu ditampilkan. */
function PengaduanActionButton({ item, onAction, bolehRespon, hideViewFallback = false }) {
  if (canRespond(item, bolehRespon)) {
    return (
      <button
        type="button"
        className="btn-ipl-review"
        onClick={() => onAction(item)}
        title="Tanggapi pengaduan"
      >
        <MessageSquareWarning size={14} /> Tanggapi
      </button>
    );
  }
  if (hideViewFallback) return null;
  return (
    <button
      type="button"
      className="btn-icon"
      onClick={() => onAction(item)}
      aria-label="Lihat detail"
      title="Lihat detail"
    >
      <Eye size={14} />
    </button>
  );
}

/** Kartu pengaduan untuk layar HP (desktop memakai tabel). Dipakai bersama oleh tampilan pengurus dan warga. */
function PengaduanCard({ item, onOpen, pelapor, aksi }) {
  const metaItems = [
    pelapor && { icon: User, label: pelapor },
    { icon: MapPin, label: areaLabel(item.tujuan) },
    { icon: Tag, label: KATEGORI_LABELS[item.kategori] || item.kategori },
  ].filter(Boolean);

  return (
    <div
      className="pengaduan-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(item); }}
    >
      <div className="pengaduan-card-top">
        <h3 className="pengaduan-card-title">{item.judul}</h3>
        <StatusBadge status={item.status} />
      </div>
      <div className="pengaduan-card-meta">
        {metaItems.map((m, i) => (
          <span key={i} className="pengaduan-meta-item">
            <m.icon size={12} /> {m.label}
          </span>
        ))}
      </div>
      <span className="pengaduan-meta-item pengaduan-meta-date">
        <Calendar size={12} /> {formatDate(item.createdAt)}
      </span>
      {item.diteruskanAt && (
        <span className="pengaduan-chip pengaduan-chip-info"><Forward size={12} /> Diteruskan ke RW</span>
      )}
      {aksi && (
        <div className="pengaduan-card-actions" onClick={(e) => e.stopPropagation()}>{aksi}</div>
      )}
    </div>
  );
}

// ── Admin/Pengurus: lihat & tanggapi semua pengaduan ──────────────────────────
function AdminPengaduanView({ user }) {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [respondItem, setRespondItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [filterKategori, setFilterKategori] = useState("SEMUA");
  const [filterStatus, setFilterStatus] = useState("SEMUA");
  const [filterBulan, setFilterBulan] = useState("SEMUA");
  const [filterTahun, setFilterTahun] = useState("SEMUA");
  const [urutan, setUrutan] = useState("prioritas");
  const [draftFilterKategori, setDraftFilterKategori] = useState("SEMUA");
  const [draftFilterStatus, setDraftFilterStatus] = useState("SEMUA");
  const [draftFilterBulan, setDraftFilterBulan] = useState("SEMUA");
  const [draftFilterTahun, setDraftFilterTahun] = useState("SEMUA");
  const [draftUrutan, setDraftUrutan] = useState("prioritas");
  const [search, setSearch] = useState("");

  const handleFilterOpen = () => {
    setDraftFilterKategori(filterKategori);
    setDraftFilterStatus(filterStatus);
    setDraftFilterBulan(filterBulan);
    setDraftFilterTahun(filterTahun);
    setDraftUrutan(urutan);
  };
  const handleFilterApply = () => {
    setFilterKategori(draftFilterKategori);
    setFilterStatus(draftFilterStatus);
    setFilterBulan(draftFilterBulan);
    setFilterTahun(draftFilterTahun);
    setUrutan(draftUrutan);
  };
  const handleFilterReset = () => {
    setFilterKategori("SEMUA");
    setFilterStatus("SEMUA");
    setFilterBulan("SEMUA");
    setFilterTahun("SEMUA");
    setUrutan("prioritas");
    setDraftFilterKategori("SEMUA");
    setDraftFilterStatus("SEMUA");
    setDraftFilterBulan("SEMUA");
    setDraftFilterTahun("SEMUA");
    setDraftUrutan("prioritas");
  };

  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await pengaduanApi.getAll();
      setItems(data || []);
    } catch (err) {
      if (!silent) showMessage("Gagal Memuat Data", err.message, "error");
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Refetch berkala biar pengaduan baru dari warga langsung kelihatan tanpa reload manual.
  useAutoRefresh(() => loadData(true));

  const currentUserName = user?.nama || user?.name || "Admin";
  const bolehRespon = can(user, "pengaduan.respon");

  const handlePengaduanAction = (item) => {
    if (canRespond(item, bolehRespon)) {
      setRespondItem(item);
    } else {
      setDetailItem(item);
    }
  };

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const matchKategori = filterKategori === "SEMUA" || item.kategori === filterKategori;
      const matchStatus = filterStatus === "SEMUA" || item.status === filterStatus;
      const tanggal = item.createdAt ? new Date(item.createdAt) : null;
      const matchBulan =
        filterBulan === "SEMUA" ||
        (tanggal && String(tanggal.getMonth() + 1).padStart(2, "0") === filterBulan);
      const matchTahun =
        filterTahun === "SEMUA" || (tanggal && String(tanggal.getFullYear()) === filterTahun);
      const matchSearch =
        !query ||
        item.judul?.toLowerCase().includes(query) ||
        item.pelapor?.namaUser?.toLowerCase().includes(query) ||
        item.deskripsi?.toLowerCase().includes(query);
      return matchKategori && matchStatus && matchBulan && matchTahun && matchSearch;
    });

    if (urutan !== "prioritas") return urutkanTanggal(filtered, urutan);

    return [...filtered].sort((a, b) => {
      const prioA = STATUS_PRIORITY[a.status] ?? 99;
      const prioB = STATUS_PRIORITY[b.status] ?? 99;
      if (prioA !== prioB) return prioA - prioB;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [items, filterKategori, filterStatus, filterBulan, filterTahun, urutan, search]);

  // Opsi Bulan & Tahun di filter cuma nampilin yang beneran ada datanya
  const availableTahun = useMemo(() => {
    const years = new Set(
      items.filter((i) => i.createdAt).map((i) => String(new Date(i.createdAt).getFullYear()))
    );
    return Array.from(years).sort((a, b) => b - a);
  }, [items]);

  const availableBulan = useMemo(() => {
    const months = new Set(
      items
        .filter((i) => i.createdAt)
        .map((i) => String(new Date(i.createdAt).getMonth() + 1).padStart(2, "0"))
    );
    return BULAN_OPTIONS.filter(({ val }) => months.has(val));
  }, [items]);

  const { page, totalPages, paginatedItems, prev, next } = usePagination(
    filteredItems,
    [search, filterKategori, filterStatus, filterBulan, filterTahun, urutan],
  );

  return (
    <div className="page-stack">
      <div className="list-toolbar-row">
        <div className="list-search-wrap">
          <Search size={15} className="list-search-icon" />
          <input
            type="text"
            placeholder="Cari judul, pelapor, atau deskripsi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="list-search-input"
          />
        </div>

        <FilterPopover
          active={
            filterBulan !== "SEMUA" ||
            filterTahun !== "SEMUA" ||
            filterKategori !== "SEMUA" ||
            filterStatus !== "SEMUA" ||
            urutan !== "prioritas"
          }
          activeCount={
            (filterBulan !== "SEMUA" ? 1 : 0) +
            (filterTahun !== "SEMUA" ? 1 : 0) +
            (filterKategori !== "SEMUA" ? 1 : 0) +
            (filterStatus !== "SEMUA" ? 1 : 0) +
            (urutan !== "prioritas" ? 1 : 0)
          }
          onOpen={handleFilterOpen}
          onApply={handleFilterApply}
          onReset={handleFilterReset}
        >
          <FilterField label="Bulan">
            <Select
              className="ipl-select ipl-select-sm"
              value={draftFilterBulan}
              onChange={(v) => setDraftFilterBulan(v)}
              options={[
                { value: "SEMUA", label: "Semua Bulan" },
                ...availableBulan.map(({ val, label }) => ({ value: val, label })),
              ]}
            />
          </FilterField>
          <FilterField label="Tahun">
            <Select
              className="ipl-select ipl-select-sm"
              value={draftFilterTahun}
              onChange={(v) => setDraftFilterTahun(v)}
              options={[
                { value: "SEMUA", label: "Semua Tahun" },
                ...availableTahun.map((y) => ({ value: y, label: y })),
              ]}
            />
          </FilterField>
          <FilterField label="Kategori">
            <Select
              className="ipl-select ipl-select-sm"
              value={draftFilterKategori}
              onChange={(v) => setDraftFilterKategori(v)}
              options={[
                { value: "SEMUA", label: "Semua Kategori" },
                ...Object.entries(KATEGORI_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
          </FilterField>
          <FilterField label="Status">
            <Select
              className="ipl-select ipl-select-sm"
              value={draftFilterStatus}
              onChange={(v) => setDraftFilterStatus(v)}
              options={[
                { value: "SEMUA", label: "Semua Status" },
                ...Object.entries(STATUS_LABELS).map(([value, { label }]) => ({ value, label })),
              ]}
            />
          </FilterField>
          <FilterField label="Urutan Tanggal">
            <Select
              className="ipl-select ipl-select-sm"
              value={draftUrutan}
              onChange={(v) => setDraftUrutan(v)}
              options={[
                { value: "prioritas", label: "Status dulu (default)" },
                ...Object.entries(URUTAN_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
          </FilterField>
        </FilterPopover>
      </div>

      <div className="content-card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="ipl-table-header">
          <span className="ipl-table-title">Daftar Pengaduan</span>
          <span className="ipl-table-count">{filteredItems.length} data</span>
        </div>

        {isLoading ? (
          <div className="ipl-loading">
            <div className="ipl-spinner" />
            <span>Memuat data pengaduan...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="ipl-empty">
            <MessageSquareWarning size={40} strokeWidth={1.2} />
            <p>{items.length === 0 ? "Belum ada pengaduan masuk." : "Tidak ada pengaduan yang cocok dengan filter."}</p>
          </div>
        ) : (
          <>
          <div className="ipl-table-wrapper pengaduan-table-wrapper">
            <table className="ipl-table pengaduan-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Judul</th>
                  <th>Pelapor</th>
                  <th>Kategori</th>
                  <th>Tanggal</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((item, index) => (
                  <tr key={item.id}>
                    <td data-label="No">{(page - 1) * 10 + index + 1}</td>
                    <td data-label="Judul" className="pengaduan-col-judul">{item.judul}</td>
                    <td data-label="Pelapor">{item.pelapor?.namaUser || "-"}</td>
                    <td data-label="Kategori">{KATEGORI_LABELS[item.kategori] || item.kategori}</td>
                    <td data-label="Tanggal">{formatDate(item.createdAt)}</td>
                    <td data-label="Status"><StatusBadge status={item.status} /></td>
                    <td data-label="Aksi">
                      <PengaduanActionButton item={item} onAction={handlePengaduanAction} bolehRespon={bolehRespon} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pengaduan-cards">
            {paginatedItems.map((item) => (
              <PengaduanCard
                key={item.id}
                item={item}
                pelapor={item.pelapor?.namaUser}
                onOpen={handlePengaduanAction}
                aksi={<PengaduanActionButton item={item} onAction={handlePengaduanAction} bolehRespon={bolehRespon} hideViewFallback />}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} total={filteredItems.length} onPrev={prev} onNext={next} />
          </>
        )}
      </div>

      {respondItem && (
        <PengaduanRespondModal
          pengaduan={respondItem}
          currentUserName={currentUserName}
          onClose={() => setRespondItem(null)}
          onSuccess={loadData}
        />
      )}
      {detailItem && (
        <PengaduanDetailModal pengaduan={detailItem} onClose={() => setDetailItem(null)} />
      )}
    </div>
  );
}

// ── Warga: ajukan & pantau pengaduan sendiri ──────────────────────────────────
function WargaPengaduanView({ user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("SEMUA");
  const [filterKategori, setFilterKategori] = useState("SEMUA");
  const [urutan, setUrutan] = useState("terbaru");
  const [draftStatus, setDraftStatus] = useState("SEMUA");
  const [draftKategori, setDraftKategori] = useState("SEMUA");
  const [draftUrutan, setDraftUrutan] = useState("terbaru");

  const handleFilterOpen = () => {
    setDraftStatus(filterStatus);
    setDraftKategori(filterKategori);
    setDraftUrutan(urutan);
  };
  const handleFilterApply = () => {
    setFilterStatus(draftStatus);
    setFilterKategori(draftKategori);
    setUrutan(draftUrutan);
  };
  const handleFilterReset = () => {
    setFilterStatus("SEMUA");
    setFilterKategori("SEMUA");
    setUrutan("terbaru");
    setDraftStatus("SEMUA");
    setDraftKategori("SEMUA");
    setDraftUrutan("terbaru");
  };

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await pengaduanApi.getByUser(user.id);
      setItems(data || []);
    } catch (err) {
      if (!silent) showMessage("Gagal Memuat Data", err.message, "error");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Refetch berkala biar status/tanggapan terbaru langsung kelihatan tanpa reload manual.
  useAutoRefresh(() => loadData(true));

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const matchStatus = filterStatus === "SEMUA" || item.status === filterStatus;
      const matchKategori = filterKategori === "SEMUA" || item.kategori === filterKategori;
      const matchSearch =
        !query ||
        item.judul?.toLowerCase().includes(query) ||
        item.deskripsi?.toLowerCase().includes(query);
      return matchStatus && matchKategori && matchSearch;
    });
    return urutkanTanggal(filtered, urutan);
  }, [items, search, filterStatus, filterKategori, urutan]);

  const { page, totalPages, paginatedItems, prev, next } = usePagination(
    filteredItems,
    [search, filterStatus, filterKategori, urutan],
  );

  return (
    <div className="page-stack">
      <div className="page-toolbar-row warga-toolbar-row">
        <div className="list-toolbar-row">
          <div className="list-search-wrap">
            <Search size={15} className="list-search-icon" />
            <input
              type="text"
              placeholder="Cari judul atau deskripsi pengaduan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="list-search-input"
            />
          </div>

          <FilterPopover
            active={filterStatus !== "SEMUA" || filterKategori !== "SEMUA" || urutan !== "terbaru"}
            activeCount={
              (filterStatus !== "SEMUA" ? 1 : 0) +
              (filterKategori !== "SEMUA" ? 1 : 0) +
              (urutan !== "terbaru" ? 1 : 0)
            }
            onOpen={handleFilterOpen}
            onApply={handleFilterApply}
            onReset={handleFilterReset}
          >
            <FilterField label="Status">
              <Select
                className="ipl-select ipl-select-sm"
                value={draftStatus}
                onChange={(v) => setDraftStatus(v)}
                options={[
                  { value: "SEMUA", label: "Semua Status" },
                  ...Object.entries(STATUS_LABELS).map(([value, { label }]) => ({ value, label })),
                ]}
              />
            </FilterField>
            <FilterField label="Kategori">
              <Select
                className="ipl-select ipl-select-sm"
                value={draftKategori}
                onChange={(v) => setDraftKategori(v)}
                options={[
                  { value: "SEMUA", label: "Semua Kategori" },
                  ...Object.entries(KATEGORI_LABELS).map(([value, label]) => ({ value, label })),
                ]}
              />
            </FilterField>
            <FilterField label="Urutan Tanggal">
              <Select
                className="ipl-select ipl-select-sm"
                value={draftUrutan}
                onChange={(v) => setDraftUrutan(v)}
                options={Object.entries(URUTAN_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </FilterField>
          </FilterPopover>
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Ajukan Pengaduan
        </button>
      </div>

      <div className="content-card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="ipl-table-header">
          <span className="ipl-table-title">Pengaduan Saya</span>
          <span className="ipl-table-count">{filteredItems.length} data</span>
        </div>

        {loading ? (
          <div className="ipl-loading">
            <div className="ipl-spinner" />
            <span>Memuat data pengaduan...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="ipl-empty">
            <MessageSquareWarning size={40} strokeWidth={1.2} />
            <p>
              {items.length === 0
                ? 'Belum ada pengaduan. Klik "Ajukan Pengaduan" kalau ada kendala di lingkungan cluster.'
                : "Tidak ada pengaduan yang cocok dengan filter."}
            </p>
          </div>
        ) : (
          <>
          <div className="ipl-table-wrapper pengaduan-table-wrapper">
            <table className="ipl-table pengaduan-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Judul</th>
                  <th>Kategori</th>
                  <th>Tanggal</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((item, index) => (
                  <tr key={item.id}>
                    <td>{(page - 1) * 10 + index + 1}</td>
                    <td className="pengaduan-col-judul">
                      <span className="pengaduan-judul">{item.judul}</span>
                      {item.deskripsi && <span className="pengaduan-judul-sub">{item.deskripsi}</span>}
                    </td>
                    <td>{KATEGORI_LABELS[item.kategori] || item.kategori}</td>
                    <td className="pengaduan-col-tanggal">{formatDate(item.createdAt)}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td>
                      <button type="button" className="btn-icon" onClick={() => setDetailItem(item)} aria-label="Lihat detail" title="Lihat detail">
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pengaduan-cards">
            {paginatedItems.map((item) => (
              <PengaduanCard key={item.id} item={item} onOpen={setDetailItem} />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} total={filteredItems.length} onPrev={prev} onNext={next} />
          </>
        )}
      </div>

      {showForm && (
        <PengaduanFormModal onClose={() => setShowForm(false)} onSuccess={loadData} />
      )}
      {detailItem && (
        <PengaduanDetailModal pengaduan={detailItem} onClose={() => setDetailItem(null)} />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PengaduanPage() {
  const { user, ready } = useUser();
  const [activeView, setActiveView] = useState("masuk");

  if (!ready || !user) return null;

  // Berbasis permission (bukan roleLevel): pengurus yang juga bisa mengadu (create_rw/create_rt)
  // dapat tab "Pengaduan Saya" di samping "Pengaduan Masuk"; warga biasa (scope OWN di
  // pengaduan.read) hanya dapat tampilan ajukan pengaduan sendiri tanpa bar tab.
  const bisaLihatMasuk = scopeOf(user, "pengaduan.read") !== "OWN" && can(user, "pengaduan.read");
  const bisaMengadu =
    can(user, "pengaduan.create_rw") ||
    can(user, "pengaduan.create_rt") ||
    scopeOf(user, "pengaduan.read") === "OWN";

  const showTabs = bisaLihatMasuk && bisaMengadu;

  return (
    <div className="page-stack">
      <div className="ipl-page-header">
        <div>
          <h2 className="ipl-page-title">Pengaduan Lingkungan</h2>
          <p className="ipl-page-subtitle">
            {showTabs
              ? "Tinjau dan tanggapi laporan warga, atau pantau pengaduan yang Anda ajukan sendiri"
              : bisaLihatMasuk
              ? "Tinjau dan tanggapi laporan kendala dari warga cluster"
              : "Laporkan kendala di lingkungan cluster dan pantau tindak lanjutnya"}
          </p>
        </div>
      </div>

      {showTabs && (
        <div className="db-section-toggle" role="tablist" aria-label="Tampilan Pengaduan">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "masuk"}
            className={`db-toggle-btn ${activeView === "masuk" ? "is-active" : ""}`}
            onClick={() => setActiveView("masuk")}
          >
            Pengaduan Masuk
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "saya"}
            className={`db-toggle-btn ${activeView === "saya" ? "is-active" : ""}`}
            onClick={() => setActiveView("saya")}
          >
            Pengaduan Saya
          </button>
        </div>
      )}

      {showTabs ? (
        activeView === "masuk" ? <AdminPengaduanView user={user} /> : <WargaPengaduanView user={user} />
      ) : bisaLihatMasuk ? (
        <AdminPengaduanView user={user} />
      ) : (
        <WargaPengaduanView user={user} />
      )}
    </div>
  );
}
