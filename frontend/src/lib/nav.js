import {
  LayoutDashboard,
  Users,
  Wallet,
  ReceiptText,
  CalendarDays,
  Megaphone,
  MessageSquareWarning,
  NotebookText,
  History,
  ShieldCheck,
  UserCog,
  Home,
} from "lucide-react";
import { can, canAny, isWargaView, scopeOf } from "./session";

// Menu disusun dari permission user (dikirim backend lewat /auth/me), bukan dari
// nama role, jadi role baru yang dibuat admin otomatis mendapat menu yang sesuai.
// Halaman kelola (bukan portal warga) disembunyikan untuk tampilan warga.
export const NAV_ITEMS = [
  {
    label: "Beranda",
    href: "/dashboard",
    icon: LayoutDashboard,
    allow: () => true,
  },
  {
    label: "Data Warga",
    href: "/dashboard/warga",
    icon: Users,
    allow: (u) => can(u, "warga.read") && !isWargaView(u),
  },
  {
    // Pengurus (bisa lihat tagihan RT/RW, bukan cuma OWN) melihat "Pengelolaan IPL";
    // warga biasa tetap "Tagihan IPL" seperti sebelumnya.
    label: (u) => (can(u, "ipl.read") && scopeOf(u, "ipl.read") !== "OWN" ? "Pengelolaan IPL" : "Tagihan IPL"),
    href: "/dashboard/kelola-ipl",
    icon: Wallet,
    allow: (u) => can(u, "ipl.read") || canAny(u, ["setoran.read", "setoran.create"]),
  },
  {
    label: "Keuangan",
    href: "/dashboard/keuangan",
    icon: ReceiptText,
    allow: (u) => can(u, "keuangan.read") && !isWargaView(u),
  },
  {
    label: "Pengaduan",
    href: "/dashboard/pengaduan",
    icon: MessageSquareWarning,
    title: "Pengaduan Lingkungan",
    allow: (u) => canAny(u, ["pengaduan.read", "pengaduan.create_rw", "pengaduan.create_rt"]),
  },
  {
    label: "Kegiatan",
    href: "/dashboard/kegiatan",
    icon: CalendarDays,
    allow: (u) => can(u, "kegiatan.read") && !isWargaView(u),
  },
  {
    label: "Pengumuman",
    href: "/dashboard/pengumuman",
    icon: Megaphone,
    allow: (u) => can(u, "pengumuman.read") && !isWargaView(u),
  },
  {
    label: "Catatan Rapat",
    href: "/dashboard/catatan-rapat",
    icon: NotebookText,
    allow: (u) => can(u, "catatan_rapat.read"),
  },
  {
    label: "Riwayat Aktivitas",
    href: "/dashboard/aktivitas",
    icon: History,
    allow: (u) => can(u, "audit.read"),
  },
  {
    label: "Peran & Hak Akses",
    href: "/dashboard/admin/role",
    icon: ShieldCheck,
    allow: (u) => can(u, "role.manage"),
  },
  {
    label: "Pengurus",
    href: "/dashboard/admin/pengurus",
    icon: UserCog,
    allow: (u) => can(u, "pengurus.manage"),
  },
  {
    label: "Kelola Rumah",
    href: "/dashboard/admin/rumah",
    icon: Home,
    allow: (u) => can(u, "rumah.create"),
  },
];

/** Item menu yang paling spesifik untuk sebuah path (mis. /dashboard/admin/role/x -> Role & Permission). */
export function navItemFor(pathname) {
  return (
    [...NAV_ITEMS]
      .filter((i) => i.href !== "/dashboard")
      .sort((a, b) => b.href.length - a.href.length)
      .find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)) ?? null
  );
}

/** Apakah user boleh membuka path ini? Path di luar daftar menu (mis. /dashboard) selalu boleh. */
export function isPathAllowed(user, pathname) {
  const item = navItemFor(pathname);
  return item ? item.allow(user) : true;
}

/** `label`/`title` bisa string atau fungsi `(user) => string` (lihat item Kelola IPL). */
export function resolveLabel(value, user) {
  return typeof value === "function" ? value(user) : value;
}

export function pageTitle(pathname, user) {
  if (pathname === "/dashboard") return "Beranda";
  const item = navItemFor(pathname);
  if (!item) return "Beranda";
  return resolveLabel(item.title, user) || resolveLabel(item.label, user);
}
