"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { getToken } from "@/lib/session";

/** Gambar dari endpoint ber-auth, diambil sebagai blob karena <img src> tidak bisa kirim header Authorization. */
export default function ProtectedImage({ path, alt, className, emptyText = "Tidak ada file bukti.", trigger, fullscreen = false }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!path) {
      setObjectUrl(null);
      return;
    }
    let url;
    let cancelled = false;
    setError(false);
    (async () => {
      try {
        const token = getToken();
        const response = await fetch(`${API_BASE_URL}${path}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error("gagal");
        const blob = await response.blob();
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);

  useEffect(() => {
    if (!zoom) return;
    const handleKey = (e) => {
      if (e.key === "Escape") setZoom(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [zoom]);

  if (!path || error) {
    return <div className="review-bukti-empty">{emptyText}</div>;
  }
  if (!objectUrl) {
    return <div className="review-bukti-empty">Memuat…</div>;
  }
  const open = () => setZoom(true);
  return (
    <>
      {trigger ? (
        trigger({ open, src: objectUrl })
      ) : (
        <button type="button" className="protected-thumb-btn" onClick={open} aria-label={`Perbesar ${alt}`}>
          <img src={objectUrl} alt={alt} className={className} />
        </button>
      )}
      {zoom && (
        <div
          className={`protected-lightbox-overlay${fullscreen ? " is-fullscreen" : ""}`}
          onClick={() => setZoom(false)}
        >
          <div className="protected-lightbox-box" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="protected-lightbox-close" onClick={() => setZoom(false)} aria-label="Tutup perbesaran" autoFocus>
              ✕
            </button>
            <img src={objectUrl} alt={alt} className="protected-lightbox-img" />
          </div>
        </div>
      )}
    </>
  );
}
