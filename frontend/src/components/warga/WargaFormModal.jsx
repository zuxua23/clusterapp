"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { isValidBlokRumah, sanitizePhoneInput } from "@/lib/validators";
import Select from "@/components/ui/Select";

const ALL_RT = ["RT_01", "RT_02", "RT_03", "RT_04"];

const EMPTY_FORM = {
  nama: "",
  no_hp: "",
  rt: "RT_01",
  blokRumah: "",
  statusRumah: "DIHUNI_TETAP",
  username: "",
  email: "",
  password: "",
};

/** Tambah/ubah warga; saat tambah, akun dibuat dengan password sementara dari pengurus RT. */
export default function WargaFormModal({
  open,
  mode = "create",
  initialData,
  allowedRts = ALL_RT,
  rumahKosong = [],
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [blokOpen, setBlokOpen] = useState(false);
  const blokRef = useRef(null);
  const isEdit = mode === "edit";

  useEffect(() => {
    if (!blokOpen) return;
    const onPointerDown = (e) => {
      if (blokRef.current && !blokRef.current.contains(e.target)) setBlokOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setBlokOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [blokOpen]);

  useEffect(() => {
    if (!open) return;
    if (isEdit && initialData) {
      setForm({
        ...EMPTY_FORM,
        nama: initialData.namaUser ?? "",
        no_hp: initialData.noTelp ?? "",
        username: initialData.username ?? "",
        email: initialData.email ?? "",
      });
    } else {
      setForm({ ...EMPTY_FORM, rt: allowedRts[0] ?? "RT_01" });
    }
  }, [open, isEdit, initialData, allowedRts]);

  if (!open) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    let next = value;
    if (name === "blokRumah") next = value.toUpperCase();
    if (name === "no_hp") next = sanitizePhoneInput(value);
    setForm((p) => ({ ...p, [name]: next }));
  };

  const blokValid = isEdit || isValidBlokRumah(form.blokRumah);
  const showBlokError = !isEdit && form.blokRumah.trim() !== "" && !blokValid;
  const saranBlok = rumahKosong.filter((r) => r.rt === form.rt);
  const filteredSaranBlok = saranBlok.filter((r) =>
    r.blokRumah.toUpperCase().includes(form.blokRumah.trim().toUpperCase())
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!blokValid) return;
    setIsSaving(true);
    try {
      const payload = isEdit
        ? {
            nama: form.nama,
            no_hp: form.no_hp,
            username: form.username || undefined,
            email: form.email || undefined,
            ...(form.password ? { password: form.password } : {}),
          }
        : {
            nama: form.nama,
            no_hp: form.no_hp,
            rt: form.rt,
            blokRumah: form.blokRumah.trim(),
            statusRumah: form.statusRumah,
            username: form.username || undefined,
            email: form.email || undefined,
            password: form.password || undefined,
          };
      await onSubmit(payload);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? "Ubah Data Warga" : "Tambah Warga"}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="nama">
                Nama Lengkap <span className="required-star">*</span>
              </label>
              <input id="nama" name="nama" className="form-control" value={form.nama} onChange={handleChange} required />
            </div>

            <div className="form-group">
              <label htmlFor="no_hp">
                No. HP <span className="required-star">*</span>
              </label>
              <input
                id="no_hp"
                name="no_hp"
                className="form-control"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={13}
                placeholder="08xxxxxxxxxx"
                value={form.no_hp}
                onChange={handleChange}
                required
              />
              {!isEdit && <span className="field-hint">Dipakai sebagai nama pengguna untuk masuk bila kolom nama pengguna dikosongkan.</span>}
            </div>

            {!isEdit && (
              <>
                <div className="form-row-2">
                  <div className="form-group">
                    <label htmlFor="rt">
                      RT <span className="required-star">*</span>
                    </label>
                    <Select
                      id="rt"
                      value={form.rt}
                      onChange={(v) => setForm((p) => ({ ...p, rt: v }))}
                      disabled={allowedRts.length === 1}
                      options={allowedRts.map((rt) => ({ value: rt, label: rt.replace("_", " ") }))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="blokRumah">
                      Blok Rumah <span className="required-star">*</span>
                    </label>
                    <div className="combobox" ref={blokRef}>
                      <input
                        id="blokRumah"
                        name="blokRumah"
                        className={`form-control ${blokOpen && filteredSaranBlok.length > 0 ? "combobox-input-open" : ""}`}
                        placeholder="Contoh: E7/15"
                        autoComplete="off"
                        value={form.blokRumah}
                        onChange={(e) => {
                          handleChange(e);
                          setBlokOpen(true);
                        }}
                        onFocus={() => setBlokOpen(true)}
                        required
                      />
                      {blokOpen && filteredSaranBlok.length > 0 && (
                        <ul className="combobox-list" role="listbox">
                          {filteredSaranBlok.map((r) => (
                            <li key={r.id}>
                              <button
                                type="button"
                                className="combobox-option"
                                onClick={() => {
                                  setForm((p) => ({ ...p, blokRumah: r.blokRumah }));
                                  setBlokOpen(false);
                                }}
                              >
                                {r.blokRumah}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {showBlokError && <span className="field-error">Format blok rumah harus seperti E7/15</span>}
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="statusRumah">Status Rumah</label>
                  <Select
                    id="statusRumah"
                    value={form.statusRumah}
                    onChange={(v) => setForm((p) => ({ ...p, statusRumah: v }))}
                    options={[
                      { value: "DIHUNI_TETAP", label: "Dihuni (tetap)" },
                      { value: "DIHUNI_KONTRAK", label: "Dihuni (kontrak)" },
                      { value: "KOSONG", label: "Kosong (ada pemilik)" },
                    ]}
                  />
                </div>
              </>
            )}

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="username">Nama Pengguna</label>
                <input
                  id="username"
                  name="username"
                  className="form-control"
                  placeholder="Kosong = pakai no. HP"
                  value={form.username}
                  onChange={handleChange}
                  autoComplete="off"
                />
              </div>
              <div className="form-group">
                <label htmlFor="email">Email (opsional)</label>
                <input id="email" name="email" type="email" className="form-control" value={form.email} onChange={handleChange} />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">{isEdit ? "Kata sandi baru (opsional)" : "Kata sandi awal"}</label>
              <input
                id="password"
                name="password"
                className="form-control"
                placeholder={isEdit ? "Kosongkan bila tidak diubah" : "Kosongkan = dibuatkan otomatis"}
                value={form.password}
                onChange={handleChange}
                minLength={6}
                autoComplete="new-password"
              />
              <span className="field-hint">Warga wajib menggantinya saat masuk pertama kali.</span>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-outline-neutral" onClick={onClose} disabled={isSaving}>
              Batal
            </button>
            <button type="submit" className="btn-primary" disabled={isSaving || !blokValid}>
              {isSaving ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Tambah Warga"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
