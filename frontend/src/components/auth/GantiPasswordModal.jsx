"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound, X } from "lucide-react";
import { authApi } from "@/lib/api";
import { getUser, isRemembered, saveUser, setToken } from "@/lib/session";
import { showMessage } from "@/lib/message";
import { PASSWORD_MIN, isValidPassword } from "@/lib/validators";

/**
 * Ganti password. Mode `wajib`: muncul otomatis saat login pertama dengan password
 * sementara dari pengurus RT dan tidak bisa ditutup sebelum berhasil.
 */
export default function GantiPasswordModal({ wajib = false, onClose, onSuccess }) {
  const [form, setForm] = useState({ passwordLama: "", passwordBaru: "", konfirmasi: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!isValidPassword(form.passwordBaru)) return setError(`Kata sandi baru minimal ${PASSWORD_MIN} karakter.`);
    if (form.passwordBaru !== form.konfirmasi) return setError("Konfirmasi kata sandi tidak sama.");

    setIsSaving(true);
    try {
      const remember = isRemembered();
      const res = await authApi.gantiPassword({
        passwordLama: form.passwordLama,
        passwordBaru: form.passwordBaru,
        remember,
      });
      // Token lama otomatis batal setelah ganti kata sandi; pakai token baru.
      if (res?.token) setToken(res.token, remember);
      const user = getUser();
      if (user) saveUser({ ...user, wajibGantiPassword: false });
      await showMessage("Berhasil", "Kata sandi berhasil diganti.", "success");
      onSuccess?.();
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Dirender lewat portal ke <body>: dipanggil dari dalam header yang memakai backdrop-filter,
  // dan itu membuat position:fixed relatif ke header (bukan layar) sehingga modal terpotong.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="modal-overlay" onClick={wajib ? undefined : onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
        <div className="modal-header">
          <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <KeyRound size={18} /> {wajib ? "Buat Kata Sandi Baru" : "Ganti Kata Sandi"}
          </h3>
          {!wajib && (
            <button type="button" className="modal-close" onClick={onClose} aria-label="Tutup">
              <X size={18} />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {wajib && (
              <p className="field-hint" style={{ marginBottom: 12 }}>
                Anda masuk dengan kata sandi sementara dari pengurus RT. Demi keamanan, buat kata sandi
                baru sebelum melanjutkan.
              </p>
            )}
            {error && <div className="form-alert-error">{error}</div>}

            <div className="form-group">
              <label htmlFor="passwordLama">
                {wajib ? "Kata sandi sementara" : "Kata sandi lama"} <span className="required-star">*</span>
              </label>
              <input
                id="passwordLama"
                name="passwordLama"
                type="password"
                className="form-control"
                value={form.passwordLama}
                onChange={handleChange}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="passwordBaru">
                Kata sandi baru <span className="required-star">*</span>
              </label>
              <input
                id="passwordBaru"
                name="passwordBaru"
                type="password"
                className="form-control"
                value={form.passwordBaru}
                onChange={handleChange}
                autoComplete="new-password"
                minLength={PASSWORD_MIN}
                required
              />
              <span className="field-hint">Minimal {PASSWORD_MIN} karakter.</span>
            </div>
            <div className="form-group">
              <label htmlFor="konfirmasi">
                Ulangi kata sandi baru <span className="required-star">*</span>
              </label>
              <input
                id="konfirmasi"
                name="konfirmasi"
                type="password"
                className="form-control"
                value={form.konfirmasi}
                onChange={handleChange}
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          <div className="modal-footer">
            {!wajib && (
              <button type="button" className="btn-outline-neutral" onClick={onClose} disabled={isSaving}>
                Batal
              </button>
            )}
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving ? "Menyimpan..." : "Simpan Kata Sandi"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
