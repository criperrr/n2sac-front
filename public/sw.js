/* n²sac Offline App Shell Service Worker (Option A: keeps instant OTA via Nginx) */
const SHELL_CACHE = 'n2sac-shell-v1';
const NAV_TIMEOUT_MS = 3500;
const STATIC_ICON_RE = /^\/(logo\.svg|logo-oauth\.png|manifest\.webmanifest|favicon\.ico)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(['/', '/index.html', '/manifest.webmanifest', '/logo.svg']).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('n2sac-shell-') && k !== SHELL_CACHE)
            .map((k) => caches.delete(k))
        )
      )
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'PRECACHE_SHELL') {
    event.waitUntil(precacheCurrentShell());
  }
});

async function precacheAssetsFromHtml(html) {
  try {
    const cache = await caches.open(SHELL_CACHE);
    const urls = new Set();
    for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) {
      if (m[1]) urls.add(m[1]);
    }
    await Promise.all(
      [...urls].map(async (url) => {
        const hit = await cache.match(url);
        if (hit) return;
        const res = await fetch(url).catch(() => null);
        if (res && res.ok) {
          await cache.put(url, res.clone());
        }
      })
    );
  } catch {
    // Best effort only.
  }
}

async function precacheCurrentShell() {
  try {
    const res = await fetch('/index.html', { cache: 'no-store' });
    if (!res.ok) return;
    const clone = res.clone();
    const html = await res.text();
    const cache = await caches.open(SHELL_CACHE);
    await cache.put('/index.html', clone.clone());
    await cache.put('/', clone);
    await precacheAssetsFromHtml(html);
  } catch {
    // Offline: keep existing cached shell.
  }
}

function fetchWithTimeout(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error('SW_NAV_TIMEOUT'));
    }, timeoutMs);
    fetch(request, { signal: controller.signal })
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API calls, OTA version checks, or APK downloads.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/version.json' ||
    url.pathname === '/sw.js' ||
    url.pathname.startsWith('/downloads/')
  ) {
    return;
  }

  // 1. HTML Navigation: Network-First (3.5s timeout) so OTA updates apply deterministically,
  //    falling back to cached App Shell on offline/timeout.
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        try {
          const networkRes = await fetchWithTimeout(request, NAV_TIMEOUT_MS);
          if (networkRes && networkRes.ok) {
            const copy = networkRes.clone();
            cache.put('/index.html', copy.clone()).catch(() => {});
            cache.put('/', copy).catch(() => {});
            networkRes
              .clone()
              .text()
              .then((html) => precacheAssetsFromHtml(html))
              .catch(() => {});
            return networkRes;
          }
        } catch {
          // Offline or timeout: serve cached shell below.
        }
        const cached = (await cache.match('/index.html')) || (await cache.match('/'));
        if (cached) return cached;

        return new Response(
          '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>n²sac Offline</title><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#111214;color:#f5f5f5;font-family:system-ui,sans-serif;text-align:center;padding:24px"><div><h2 style="margin:0 0 8px">Sem conexão</h2><p style="opacity:.75;margin:0">Conecte-se à internet uma vez para salvar o app offline.</p></div></body></html>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      })()
    );
    return;
  }

  // 2. Hashed Vite chunks (/assets/*) and static icons: Cache-First with network backfill.
  if (url.pathname.startsWith('/assets/') || STATIC_ICON_RE.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        const networkRes = await fetch(request);
        if (networkRes && networkRes.ok) {
          cache.put(request, networkRes.clone()).catch(() => {});
        }
        return networkRes;
      })()
    );
  }
});
