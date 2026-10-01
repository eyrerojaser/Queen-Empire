/* Mi Calendario · service worker
   Guarda la app en el dispositivo para que abra al instante y funcione sin Internet.
   Si cambias algún archivo de la app, sube el número de VERSION para que se actualice. */
const VERSION = 'mi-calendario-v11';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/badge-96.png',
  './fonts/great-vibes-latin-400-normal.woff2',
  './fonts/dancing-script-latin-500-normal.woff2', './fonts/dancing-script-latin-700-normal.woff2',
  './fonts/nunito-latin-400-normal.woff2', './fonts/nunito-latin-600-normal.woff2',
  './fonts/nunito-latin-700-normal.woff2', './fonts/nunito-latin-800-normal.woff2',
  './fonts/playfair-display-latin-500-normal.woff2', './fonts/playfair-display-latin-700-normal.woff2',
  './fonts/playfair-display-latin-500-italic.woff2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;   // la sincronización siempre va a la red
  if (url.pathname.startsWith('/admin')) return;  // el panel de administración es aparte, no es la app

  // Abrir la app: se muestra lo guardado al instante y se actualiza en segundo plano.
  const key = req.mode === 'navigate' ? './index.html' : req;
  e.respondWith(
    caches.match(key).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(key, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

/* ---------- Avisos (notificaciones push) ----------
   El servidor manda el aviso a la hora exacta; aquí se muestra aunque la app esté cerrada. */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const opts = {
    body: d.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/badge-96.png',
    data: { url: d.url || './' }
  };
  if (d.tag) opts.tag = d.tag;      // mismo "tag" = no se duplica si la app también lo avisó
  e.waitUntil(self.registration.showNotification(d.title || 'Mi Calendario', opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (wins) => {
      const w = wins.find((c) => c.url.indexOf(self.registration.scope) === 0);
      if (w) {
        await w.focus();
        if ('navigate' in w) { try { await w.navigate(target); } catch (_) {} }
        return;
      }
      return self.clients.openWindow(target);
    })
  );
});
