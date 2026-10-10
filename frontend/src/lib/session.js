const TOKEN_KEY = "accessToken";
const USER_KEY = "user";

// Di PWA terinstall, sessionStorage hilang tiap Android mematikan app, jadi sesi wajib localStorage.
function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    window.navigator.standalone === true // properti lama khusus Safari/iOS
  );
}

// Sesi lama di sessionStorage dipindah ke localStorage tiap dibaca dalam mode standalone.
function migrasiKeLocalStorageJikaStandalone() {
  if (!isStandalonePwa()) return;
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  }
  const user = sessionStorage.getItem(USER_KEY);
  if (user) {
    localStorage.setItem(USER_KEY, user);
    sessionStorage.removeItem(USER_KEY);
  }
}

export function getToken() {
  if (typeof window === "undefined") return null;
  migrasiKeLocalStorageJikaStandalone();
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token, remember) {
  if (typeof window === "undefined") return;
  if (remember || isStandalonePwa()) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  }
}

/** Sesi tersimpan permanen ("Ingat saya" / PWA)? */
export function isRemembered() {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(TOKEN_KEY);
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

// ── User + hak akses ─────────────────────────────────────────────────────
// Backend adalah sumber kebenaran hak akses (tabel tb_Role_permission). Yang
// disimpan di sini hanya salinan untuk menyusun menu dan tombol; setiap aksi
// tetap divalidasi ulang oleh backend.

// Data user mengikuti token: "Ingat saya" -> localStorage (bertahan), tidak -> sessionStorage
// (hilang saat tab ditutup), supaya profil orang sebelumnya tidak tertinggal di komputer bersama.
export function getUser() {
  if (typeof window === "undefined") return null;
  migrasiKeLocalStorageJikaStandalone();
  try {
    const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * `remember` diisi saat login. Saat menyegarkan data (tanpa argumen) user tetap disimpan
 * di storage tempat ia berada sekarang.
 */
export function saveUser(user, remember) {
  if (typeof window === "undefined") return;
  // Di mode standalone, paksa localStorage walau sebelumnya (pra-fix) sempat kesimpen di
  // sessionStorage — jadi otomatis "sembuh" sendiri begitu sesi di-refresh (lihat DashboardShell).
  const pakaiSession = isStandalonePwa()
    ? false
    : remember === undefined
      ? !!sessionStorage.getItem(USER_KEY)
      : !remember;
  const [tujuan, lain] = pakaiSession ? [sessionStorage, localStorage] : [localStorage, sessionStorage];
  lain.removeItem(USER_KEY);
  tujuan.setItem(USER_KEY, JSON.stringify(user));
  // Kabari komponen lain (sidebar, header) di tab ini bahwa user berubah.
  window.dispatchEvent(new Event("user-updated"));
}

/** Scope permission ("ALL" | "AREA" | "OWN") atau null bila tidak punya. */
export function scopeOf(user, kode) {
  return user?.permissions?.[kode] ?? null;
}

/** Apakah user punya permission `kode` (mis. "ipl.generate")? */
export function can(user, kode) {
  return scopeOf(user, kode) !== null;
}

/** Punya salah satu dari beberapa permission? */
export function canAny(user, kodeList) {
  return kodeList.some((k) => can(user, k));
}

/** Level warga (level 3): melihat tampilan portal warga, bukan tampilan pengurus. */
export function isWargaView(user) {
  return user?.roleLevel === 3;
}

export const AREA_LABEL = {
  RW: "RW",
  RT_01: "RT 01",
  RT_02: "RT 02",
  RT_03: "RT 03",
  RT_04: "RT 04",
};

export const areaLabel = (area) => AREA_LABEL[area] || area || "-";
