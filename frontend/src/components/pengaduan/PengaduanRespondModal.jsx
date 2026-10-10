"use client";

import { useState } from "react";
import { Forward } from "lucide-react";
import { pengaduanApi } from "@/lib/api";
import { showMessage } from "@/lib/message";
import { areaLabel } from "@/lib/session";
import Select from "@/components/ui/Select";
import ProtectedImage from "@/components/ui/ProtectedImage";
import { formatTanggalPendek as formatDate } from "@/lib/format";

const KATEGORI_LABELS = {
  KEBERSIHAN: "Kebersihan",
  KEAMANAN: "Keamanan",
  INFRASTRUKTUR: "Infrastruktur",
  LAINNYA: "Lainnya",
};

const STATUS_OPTIONS = [
  { value: "DIPROSES", label: "Diproses" },
  { value: "SELESAI", label: "Selesai" },
  { value: "DITOLAK", label: "Ditolak" },
];

export default function PengaduanRespondModal({ pengaduan, currentUserName, onClose, onSuccess }) {
  const [status, setStatus] = useState(
    pengaduan.status === "MENUNGGU" ? "DIPROSES" : pengaduan.status
  );
  const [tanggapan, setTanggapan] = useState(pengaduan.tanggapan || "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!tanggapan.trim()) {
      showMessage("Validasi", "Tanggapan tidak boleh kosong.", "warning");
      return;
    }
    setLoading(true);
    try {
      const res = await pengaduanApi.respond(pengaduan.id, {
        status,
        tanggapan,
        tanggapanBy: currentUserName,
      });
      showMessage("Berhasil", res.message, "success");
      onSuccess();
      onClose();
    } catch (err) {
      showMessage("Gagal", err.message, "error");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="ipl-modal-overlay" onClick={onClose}>
      <div className="ipl-modal ipl-modal-review pengaduan-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ipl-modal-header">
          <h3>Tanggapi Pengaduan</h3>
          <button className="ipl-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="ipl-modal-body">
          <div className="review-info-grid">
            <div className="review-info-item">
              <span className="review-info-label">Pelapor</span>
              <span className="review-info-value">{pengaduan.pelapor?.namaUser || "-"}</span>
            </div>
            <div className="review-info-item">
              <span className="review-info-label">Kategori</span>
              <span className="review-info-value">{KATEGORI_LABELS[pengaduan.kategori] || pengaduan.kategori}</span>
            </div>
            <div className="review-info-item">
              <span className="review-info-label">Judul</span>
              <span className="review-info-value">{pengaduan.judul}</span>
            </div>
            <div className="review-info-item">
              <span className="review-info-label">Tujuan</span>
              <span className="review-info-value">{areaLabel(pengaduan.tujuan)}</span>
            </div>
            <div className="review-info-item">
              <span className="review-info-label">Tanggal Lapor</span>
              <span className="review-info-value">{formatDate(pengaduan.createdAt)}</span>
            </div>
          </div>

          {pengaduan.diteruskanAt && (
            <div className="ipl-summary-card tone-warning" style={{ alignItems: "flex-start" }}>
              <div className="ipl-summary-icon"><Forward size={20} /></div>
              <div className="ipl-summary-body">
                <span className="ipl-summary-label">Diteruskan ke RW</span>
                <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--db-slate-700)" }}>
                  Belum ditanggapi pengurus RT sejak {formatDate(pengaduan.createdAt)}.
                </span>
              </div>
            </div>
          )}

          <div className="review-desc-card">
            <span className="review-info-label">Deskripsi</span>
            <p className="review-desc-text">{pengaduan.deskripsi}</p>
          </div>

          {pengaduan.fotoUrl && (
            <div className="review-bukti-section">
              <p className="review-bukti-label">Foto Kendala</p>
              <ProtectedImage path={pengaduanApi.fotoPath(pengaduan.id)} alt="Foto kendala" className="review-bukti-img" />
            </div>
          )}

          <div className="ipl-form-group">
            <label>Status Penanganan</label>
            <Select
              className="ipl-select"
              value={status}
              onChange={(v) => setStatus(v)}
              options={STATUS_OPTIONS.map(({ value, label }) => ({ value, label }))}
            />
          </div>

          <div className="ipl-form-group">
            <label>
              Tanggapan <span className="label-optional">(wajib diisi)</span>
            </label>
            <textarea
              rows={4}
              placeholder="Contoh: Laporan sudah diteruskan ke tim keamanan, akan ditindaklanjuti dalam 1x24 jam."
              value={tanggapan}
              onChange={(e) => setTanggapan(e.target.value)}
              className="ipl-textarea"
            />
          </div>

          <div className="review-action-row">
            <button className="btn-ipl-secondary" onClick={onClose} disabled={loading}>
              Batal
            </button>
            <button className="btn-ipl-success" onClick={handleSubmit} disabled={loading}>
              Simpan Tanggapan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
