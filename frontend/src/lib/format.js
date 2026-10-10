// Helper format (rupiah, tanggal, bulan, periode, kontak) yang dipakai di banyak halaman.
// Sebelumnya tiap file nge-define ulang versi sendiri-sendiri (kadang namanya sama tapi
// isinya beda, kadang isinya sama tapi namanya beda) — semuanya disatukan di sini supaya
// ada satu sumber kebenaran dan gampang diubah/di-maintain.

// ── Rupiah ──────────────────────────────────────────────────────────────────
export function formatRupiah(n) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n || 0);
}

/** Versi singkat buat ruang sempit (mis. kartu metrik): "Rp 1.5jt", "Rp 500rb". */
export function formatRupiahSingkat(n) {
  if (!n && n !== 0) return "-";
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}rb`;
  return `Rp ${n}`;
}

/**
 * Versi singkat dengan desimal koma ala Indonesia: "Rp 750rb", "Rp 1,2jt", "Rp 0".
 * Beda dari formatRupiahSingkat di atas: pakai koma bukan titik, dan bulatin ribuan.
 */
export function formatRupiahShort(n) {
  if (n !== 0 && !n) return "-";
  const neg = n < 0;
  const a = Math.abs(n);
  let s;
  if (a >= 1_000_000) {
    const v = a / 1_000_000;
    s = `${Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "").replace(".", ",")}jt`;
  } else if (a >= 1_000) {
    s = `${Math.round(a / 1_000)}rb`;
  } else {
    s = `${a}`;
  }
  return `${neg ? "-" : ""}Rp ${s}`;
}

// Jangan ambil urutan bulan dari Object.values() objek ber-key "01".."12" — JS mengurutkan
// key numerik sehingga mulai dari Oktober. MONTHS adalah sumber urutan.
/** Urutan Januari..Desember (index 0 = Januari). Dipakai semua label bulan. */
export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

/** Peta "01".."12" -> nama pendek. Dibangun dari MONTHS agar urutannya terjamin. */
export const BULAN_PENDEK = Object.fromEntries(
  MONTHS.map((label, i) => [String(i + 1).padStart(2, "0"), label]),
);

export const BULAN_PANJANG = {
  "01": "Januari", "02": "Februari", "03": "Maret", "04": "April",
  "05": "Mei", "06": "Juni", "07": "Juli", "08": "Agustus",
  "09": "September", "10": "Oktober", "11": "November", "12": "Desember",
};

/** Opsi dropdown filter, urut Januari..Desember. */
export const BULAN_OPTIONS = MONTHS.map((label, i) => {
  const val = String(i + 1).padStart(2, "0");
  return { val, label: BULAN_PANJANG[val] };
});

/** Label "Okt 2026" dari bulanPeriode ("10") + tahunPeriode ("2026") ala tagihan IPL. */
export function getMonthLabel(bulan, tahun) {
  const m = parseInt(bulan, 10);
  return `${MONTHS[m - 1] || bulan} ${tahun}`;
}

// ── Periode "YYYY-MM" (dipakai filter periode Dari/Sampai) ───────────────────
export function getCurrentYm() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

function isValidYm(ym) {
  return !!ym && /^\d{4}-\d{2}$/.test(ym);
}

/** "2026-10" -> "Okt 2026" */
export function formatYmPendek(ym) {
  if (!isValidYm(ym)) return ym || "-";
  const [y, m] = ym.split("-");
  return `${BULAN_PENDEK[m] || m} ${y}`;
}

/** "2026-10" -> "Oktober 2026" */
export function formatYmPanjang(ym) {
  if (!isValidYm(ym)) return ym || "-";
  const [y, m] = ym.split("-");
  return `${BULAN_PANJANG[m] || m} ${y}`;
}

// ── Tanggal ─────────────────────────────────────────────────────────────────
function toValidDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "05 Sep 2026" */
export function formatTanggalPendek(value) {
  const d = toValidDate(value);
  if (!d) return "-";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

/** "05 September 2026" */
export function formatTanggalPanjang(value) {
  const d = toValidDate(value);
  if (!d) return "-";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
}

/** "Senin, 5 September 2026" */
export function formatTanggalLengkap(value) {
  const d = toValidDate(value);
  if (!d) return "-";
  return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// ── Kontak ──────────────────────────────────────────────────────────────────
/** Link wa.me dari nomor HP (buang semua karakter non-digit). */
export function waLink(noTelp) {
  if (!noTelp) return null;
  const clean = noTelp.replace(/\D/g, "");
  return `https://wa.me/${clean.replace(/^0/, "62")}`;
}
