// Service worker minimal: installability + Web Push. Tanpa cache — data selalu berubah.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const OFFLINE_HTML =
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Offline</title><body style="font-family:sans-serif;text-align:center;padding:48px 24px;color:#334155">' +
  "<h2>Tidak ada koneksi</h2><p>Periksa internet kamu lalu coba lagi.</p>" +
  '<button onclick="location.reload()" style="padding:10px 20px;border:0;border-radius:8px;background:#0d9488;color:#fff">Coba lagi</button></body>';

// Hanya navigasi halaman yang ditangani (fallback offline); API & aset dibiarkan langsung ke jaringan.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "Cluster Topaz", body: "", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // payload bukan JSON — pakai default di atas
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.pathname === url && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
