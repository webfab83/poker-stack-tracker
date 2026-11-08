/* STACK V24.5 : cache isolé. Les tournois restent dans localStorage, jamais dans le cache. */
const CACHE_NAME = 'stack-poker-pwa-v24-5-final-result-20261108';
const INDEX_URL = './index.html';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => cache.add(INDEX_URL))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith('stack-poker-pwa-') && k !== CACHE_NAME)
      .map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    // Ne JAMAIS enregistrer live.html comme copie hors ligne de index.html :
    // sinon le visiteur écraserait le cache local de l'application STACK.
    const base = new URL(self.registration.scope);
    const isAppHome = url.pathname === base.pathname || url.pathname === base.pathname + 'index.html';
    if (!isAppHome) return; // Spectateurs : réseau uniquement.
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(c => c.put(INDEX_URL, copy)));
      }
      return response;
    }).catch(() => caches.match(INDEX_URL)));
    return;
  }
  // Les autres fichiers sont chargés normalement, sans toucher au manifeste/icônes.
});
