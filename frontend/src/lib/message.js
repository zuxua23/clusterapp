
import Swal from 'sweetalert2';

// Selalu `titleText`/`text` (bukan HTML) supaya data dari user tidak bisa menyisipkan script.

export const showMessage = (title, text, icon = 'info') => {
  return Swal.fire({
    titleText: title,
    text,
    icon,
    confirmButtonText: 'OK',
  });
};

export const showConfirm = (
  title,
  text,
  icon = 'question',
  confirmText = 'Ya',
  cancelText = 'Batal'
) => {
  return Swal.fire({
    titleText: title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
  }).then((result) => result.isConfirmed);
};

/** Tampilkan kredensial sementara (username + password) supaya pengurus bisa menyampaikannya ke warga. */
export const showCredentials = ({ title, nama, username, password, catatan }) => {
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  return Swal.fire({
    titleText: title,
    icon: "success",
    confirmButtonText: "Sudah saya catat",
    html:
      `<div style="text-align:left;font-size:0.92rem;line-height:1.7">` +
      (nama ? `<div><span style="color:#64748b">Nama</span><br/><b>${esc(nama)}</b></div>` : "") +
      (username ? `<div style="margin-top:6px"><span style="color:#64748b">Nama pengguna</span><br/><b>${esc(username)}</b></div>` : "") +
      `<div style="margin-top:6px"><span style="color:#64748b">Kata sandi sementara</span><br/>` +
      `<code style="font-size:1.15rem;background:#f1f5f9;padding:4px 10px;border-radius:6px;user-select:all">${esc(password)}</code></div>` +
      `<p style="margin-top:12px;color:#b45309;font-size:0.82rem">${esc(catatan || "Kata sandi ini hanya tampil sekarang. Sampaikan ke warga; mereka wajib menggantinya saat masuk pertama kali.")}</p>` +
      `</div>`,
  });
};
