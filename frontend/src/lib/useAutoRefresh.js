"use client";

import { useEffect, useRef } from "react";

/**
 * Refetch berkala tanpa reload manual — dipakai di halaman list yang datanya bisa
 * berubah dari aktivitas user lain (pengaduan, pengumuman, kegiatan, dll), pola yang
 * sama kayak polling lonceng notifikasi di Header.
 *
 * Otomatis jeda saat tab/app di-minimize (Page Visibility API) biar gak boros
 * baterai/kuota pas gak kepake, dan langsung refetch sekali pas balik aktif lagi
 * (biar gak nunggu interval berikutnya buat nampilin data yang ketinggalan).
 */
export function useAutoRefresh(callback, intervalMs = 30_000) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (typeof document === "undefined") return;

    let interval = null;
    const mulai = () => {
      if (interval) return;
      interval = setInterval(() => callbackRef.current(), intervalMs);
    };
    const berhenti = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };

    const handleVisibility = () => {
      if (document.hidden) {
        berhenti();
      } else {
        callbackRef.current(); // langsung refetch pas balik aktif, gak nunggu interval
        mulai();
      }
    };

    if (!document.hidden) mulai();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      berhenti();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [intervalMs]);
}
