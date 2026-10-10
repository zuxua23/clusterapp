"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { pushApi } from "@/lib/api";

const DISMISS_KEY = "notif-prompt-dismissed-at";
const DISMISS_ULANG_HARI = 7; // muncul lagi 7 hari setelah ditutup, bukan hilang selamanya

function sudahDitutupBaruBaruIni() {
  const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
  if (!ts) return false;
  const hariBerlalu = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  return hariBerlalu < DISMISS_ULANG_HARI;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function subscribeToPush(registration) {
  const { publicKey } = await pushApi.getVapidKey();
  if (!publicKey) return;
  const existing = await registration.pushManager.getSubscription();
  const sub =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));
  await pushApi.subscribe(sub.toJSON());
}

/** Banner ajakan aktifkan push (muncul lagi 7 hari setelah ditutup); kalau sudah granted, cukup sync subscription. */
export default function NotifPrompt() {
  const [show, setShow] = useState(false);
  const [registration, setRegistration] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then(async (reg) => {
        if (cancelled) return;
        setRegistration(reg);
        if (Notification.permission === "granted") {
          subscribeToPush(reg).catch((err) => console.error("[push] Gagal subscribe otomatis:", err));
        } else if (Notification.permission === "default" && !sudahDitutupBaruBaruIni()) {
          setShow(true);
        }
      })
      .catch((err) => console.error("[push] Registrasi service worker gagal:", err));

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAktifkan = async () => {
    if (!registration) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        await subscribeToPush(registration);
      }
    } catch (err) {
      // Push bukan fitur kritikal — tidak perlu modal error ke user, tapi tetap di-log
      // biar ketauan kalau ada yang gagal pas didiagnosis lewat console.
      console.error("[push] Gagal aktifkan notifikasi:", err);
    } finally {
      setBusy(false);
      setShow(false);
    }
  };

  const handleTutup = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="notif-prompt" role="status">
      <div className="notif-prompt-icon">
        <Bell size={18} />
      </div>
      <div className="notif-prompt-body">
        <p className="notif-prompt-title">Aktifkan notifikasi?</p>
        <p className="notif-prompt-sub">Dapat kabar langsung soal pengaduan, tagihan, dan pengumuman terbaru.</p>
      </div>
      <div className="notif-prompt-actions">
        <button type="button" className="btn-ipl-primary" onClick={handleAktifkan} disabled={busy}>
          {busy ? "Memproses..." : "Aktifkan"}
        </button>
        <button type="button" className="notif-prompt-close" onClick={handleTutup} aria-label="Tutup">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
