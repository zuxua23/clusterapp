"use client";

import { useEffect, useState } from "react";
import { PhoneCall, Check, X as XIcon } from "lucide-react";
import Swal from "sweetalert2";
import { wargaApi } from "@/lib/api";
import { areaLabel, can } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import { showMessage } from "@/lib/message";
import Pagination from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";
import { waLink } from "@/lib/format";

export default function PendaftaranPage() {
  const { user } = useUser();
  const bolehApprove = can(user, "warga.approve_registrasi");

  const [pendaftaran, setPendaftaran] = useState([]);
  const [loadingPendaftaran, setLoadingPendaftaran] = useState(true);

  const loadPendaftaran = async () => {
    setLoadingPendaftaran(true);
    try {
      const data = await wargaApi.getPendaftaran();
      setPendaftaran(Array.isArray(data) ? data : []);
    } catch (error) {
      showMessage("Gagal Memuat Data", error.message, "error");
    } finally {
      setLoadingPendaftaran(false);
    }
  };

  useEffect(() => {
    if (bolehApprove) loadPendaftaran();
  }, [bolehApprove]);

  const handleSetujuiPendaftaran = async (item) => {
    const { value: statusHunian } = await Swal.fire({
      title: `Setujui pendaftaran ${item.namaUser}?`,
      html: `Akun warga akan dibuat untuk blok ${item.rumah?.blokRumah}.`,
      input: "radio",
      inputLabel: "Status hunian rumah",
      inputOptions: {
        KOSONG: "Kosong - tidak dihuni (tetap bayar IPL, masuk kas RT)",
        DIHUNI_TETAP: "Dihuni tetap",
        DIHUNI_KONTRAK: "Dihuni kontrak",
      },
      inputValue: "KOSONG",
      showCancelButton: true,
      confirmButtonText: "Ya, setujui",
      cancelButtonText: "Batal",
    });
    if (!statusHunian) return;
    try {
      const res = await wargaApi.setujuiPendaftaran(item.id, statusHunian);
      showMessage("Berhasil", res.message, "success");
      loadPendaftaran();
    } catch (error) {
      showMessage("Gagal", error.message, "error");
    }
  };

  const handleTolakPendaftaran = async (item) => {
    const { value: alasan } = await Swal.fire({
      title: `Tolak pendaftaran ${item.namaUser}?`,
      input: "textarea",
      inputLabel: "Alasan penolakan",
      inputPlaceholder: "Contoh: data tidak sesuai, atau rumah sudah dihuni warga lain",
      showCancelButton: true,
      confirmButtonText: "Tolak Pendaftaran",
      cancelButtonText: "Batal",
      inputValidator: (v) => (!v?.trim() ? "Alasan wajib diisi" : undefined),
    });
    if (!alasan) return;
    try {
      const res = await wargaApi.tolakPendaftaran(item.id, alasan.trim());
      showMessage("Berhasil", res.message, "success");
      loadPendaftaran();
    } catch (error) {
      showMessage("Gagal", error.message, "error");
    }
  };

  const {
    page: pagePendaftaran,
    totalPages: totalPagesPendaftaran,
    paginatedItems: pendaftaranPage,
    prev: prevPendaftaran,
    next: nextPendaftaran,
  } = usePagination(pendaftaran, []);

  if (!bolehApprove) {
    return <div className="table-empty">Anda tidak memiliki akses untuk meninjau pendaftaran warga.</div>;
  }

  return (
    <div className="table-card">
      <div className="ipl-table-header">
        <span className="ipl-table-title">Pendaftaran Menunggu Persetujuan</span>
        <span className="ipl-table-count">{pendaftaran.length} data</span>
      </div>
      <div className="table-wrapper warga-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Nama</th>
              <th>No. HP</th>
              <th>Rumah</th>
              <th>Tanggal Daftar</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {!loadingPendaftaran &&
              pendaftaranPage.map((p, index) => (
                <tr key={p.id}>
                  <td>{(pagePendaftaran - 1) * 10 + index + 1}</td>
                  <td>
                    <div className="penghuni-cell">
                      <span className="penghuni-avatar">{p.namaUser.charAt(0).toUpperCase()}</span>
                      <div>
                        <span className="penghuni-name">{p.namaUser}</span>
                        <span className="penghuni-email">{p.email || "-"}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    {p.noTelp ? (
                      <a href={waLink(p.noTelp)} target="_blank" rel="noopener noreferrer" className="wa-link">
                        <PhoneCall size={13} /> {p.noTelp}
                      </a>
                    ) : "-"}
                  </td>
                  <td>{p.rumah?.blokRumah} · {areaLabel(p.rumah?.rt)}</td>
                  <td>{new Date(p.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}</td>
                  <td>
                    <div className="table-actions">
                      <button type="button" className="btn-icon" title="Setujui" aria-label="Setujui pendaftaran" onClick={() => handleSetujuiPendaftaran(p)}>
                        <Check size={15} />
                      </button>
                      <button type="button" className="btn-icon danger" title="Tolak" aria-label="Tolak pendaftaran" onClick={() => handleTolakPendaftaran(p)}>
                        <XIcon size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="warga-grid">
        {!loadingPendaftaran &&
          pendaftaranPage.map((p) => (
            <div key={p.id} className="warga-grid-card">
              <h3 className="warga-grid-title">{p.namaUser}</h3>
              <span className="warga-grid-penghuni">{p.rumah?.blokRumah} · {areaLabel(p.rumah?.rt)}</span>
              {p.noTelp && (
                <a href={waLink(p.noTelp)} target="_blank" rel="noopener noreferrer" className="wa-link" style={{ fontSize: "0.78rem" }}>
                  <PhoneCall size={12} /> {p.noTelp}
                </a>
              )}
              <div className="warga-grid-footer">
                <div className="table-actions">
                  <button type="button" className="btn-icon" title="Setujui" aria-label="Setujui pendaftaran" onClick={() => handleSetujuiPendaftaran(p)}>
                    <Check size={14} />
                  </button>
                  <button type="button" className="btn-icon danger" title="Tolak" aria-label="Tolak pendaftaran" onClick={() => handleTolakPendaftaran(p)}>
                    <XIcon size={14} />
                  </button>
                </div>
                <span className="text-muted" style={{ fontSize: "0.68rem" }}>
                  {new Date(p.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              </div>
            </div>
          ))}
      </div>

      {loadingPendaftaran && <div className="table-loading">Memuat data pendaftaran…</div>}
      {!loadingPendaftaran && pendaftaran.length === 0 && (
        <div className="table-empty">Tidak ada pendaftaran yang menunggu persetujuan.</div>
      )}
      {!loadingPendaftaran && (
        <Pagination page={pagePendaftaran} totalPages={totalPagesPendaftaran} total={pendaftaran.length} onPrev={prevPendaftaran} onNext={nextPendaftaran} />
      )}
    </div>
  );
}
