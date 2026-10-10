"use client";

import { useEffect, useRef, useState } from "react";
import { X, Send, Loader2 } from "lucide-react";
import { portalApi } from "@/lib/api";
import { showMessage } from "@/lib/message";
import FileDropzone from "@/components/ui/FileDropzone";

export default function BuktiUploadModal({ ipl, user, rumah, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  // A11y: fokus masuk modal, Esc menutup, scroll body dikunci,
  // fokus dikembalikan ke pemicu saat modal ditutup.
  useEffect(() => {
    triggerRef.current = document.activeElement;
    panelRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handleKey);
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
  }, [onClose]);

  const resetFile = () => {
    setFile(null);
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      await showMessage("Pilih file bukti pembayaran terlebih dahulu!", "warning");
      return;
    }
    setIsSubmitting(true);
    try {
      await portalApi.uploadBuktiPembayaran({
        idUser: user.id,
        idIpl: ipl.id,
        nominal: ipl.nominal,
        file,
      });
      await showMessage(
        "Bukti terkirim",
        "Pengurus akan mengonfirmasi dalam 1x24 jam.",
        "success"
      );
      onSuccess?.();
      onClose();
    } catch (err) {
      await showMessage("Gagal mengirim", err.message || "Coba lagi.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  const bulanLabel = `${MONTHS[(parseInt(ipl.bulanPeriode, 10) - 1)] || ipl.bulanPeriode} ${ipl.tahunPeriode}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        {/* Header */}
        <div className="modal-header">
          <h3 id="bukti-upload-title">Unggah Bukti Pembayaran</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Info Tagihan */}
            <div className="bukti-info-card">
              <div className="bukti-info-row">
                <span className="bukti-info-label">Periode</span>
                <span className="bukti-info-value">{bulanLabel}</span>
              </div>
              <div className="bukti-info-row">
                <span className="bukti-info-label">Rumah</span>
                <span className="bukti-info-value">{rumah?.blokRumah} ({rumah?.rt?.replace("_", " ")})</span>
              </div>
              <div className="bukti-info-row">
                <span className="bukti-info-label">Nominal</span>
                <span className="bukti-info-value bukti-nominal">
                  Rp {ipl.nominal.toLocaleString("id-ID")}
                </span>
              </div>
            </div>

            <FileDropzone
              file={file}
              onFileSelect={(f) => { setError(null); setFile(f); }}
              onRemove={resetFile}
              accept="image/jpg,image/jpeg,image/png"
              maxSizeMB={5}
              placeholder="Klik atau seret foto bukti transfer ke sini"
              hint="JPG / PNG · Maks. 5 MB"
              error={error}
              onError={setError}
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Batal
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting || !file}>
              {isSubmitting ? (
                <><Loader2 size={16} className="spin" /> Mengirim...</>
              ) : (
                <><Send size={16} /> Kirim Bukti</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
