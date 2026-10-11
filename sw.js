// Service worker of Wako205 (scope: the folder of index.html, /Wako/ on GitHub Pages).
// It lets the page open without a connection: index.html is served from the network when
// possible (so updates arrive) and from the cache otherwise; the pinned CDN scripts never
// change, so they are served from the cache first. The scripts are cached under their
// integrity hashes. Audio saved for offline listening is kept by the page in IndexedDB,
// per user, and is not handled here.
const SHELL = 'wako-shell-v2';
// Same URLs and hashes as in index.html (tests/offline.spec.js checks that they match).
const CDN = [
  ['https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG'],
  ['https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js', 'sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi'],
  ['https://cdn.jsdelivr.net/npm/dompurify@3.4.16/dist/purify.min.js', 'sha384-a7SzOxErzJ3ZpQz0zJ32d67dSitNzPcbfybc/ykU9KJhMgZkwqfSxlhhdJRS+XGL'],
  ['https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js', 'sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI'],
  ['https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e'],
  ['https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js', 'sha384-SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2'],
];
const PAGE = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.add(new Request(PAGE, { cache: 'reload' }));
    // A script that cannot be fetched now is cached the first time the page loads it.
    await Promise.all(CDN.map(([url, integrity]) => fetch(new Request(url, { integrity, mode: 'cors' }))
      .then((r) => (r.ok ? cache.put(url, r) : null)).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // the backend (POST) is never touched
  const url = req.url.split('#')[0];
  const cdn = CDN.find(([u]) => u === url);
  if (cdn) {
    e.respondWith(caches.match(url).then((hit) => hit || fetch(new Request(url, { integrity: cdn[1], mode: 'cors' })).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(url, copy)); }
      return r;
    })));
    return;
  }
  const scope = self.registration.scope;
  if (req.mode === 'navigate' && (url.split('?')[0] === scope || url.split('?')[0] === PAGE)) {
    e.respondWith(fetch(req).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(PAGE, copy)); }
      return r;
    }).catch(() => caches.match(PAGE).then((hit) => hit || Response.error())));
  }
});
