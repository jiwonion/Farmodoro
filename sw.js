const CACHE_VERSION = "farmodoro-v140";
const APP_CACHE = `${CACHE_VERSION}-app`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const APP_SHELL = [
  "./index.html",
  "./styles.css?v=140",
  "./app.js?v=140",
  "./pwa-register.js?v=140",
  "./supabase-config.js",
  "./manifest.webmanifest",
  "./assets/crops-sprite.js",
  "./assets/crops.svg",
  "./assets/farmodoro-logo-v2.png",
  "./assets/focus-farm-background.png",
  "./assets/npc-morrison.png",
  "./assets/npc-noah.png",
  "./assets/npc-rachel.png",
  "./assets/fonts/Maplestory-Light.ttf",
  "./assets/fonts/Maplestory-Bold.ttf",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon.png"
];
const APP_SHELL_URLS = new Set(
  APP_SHELL.map((path) => new URL(path, self.location.href).href),
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("farmodoro-") && ![APP_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

const cacheResponse = async (cacheName, request, response) => {
  if (response && (response.status === 200 || response.type === "opaque")) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
};

const networkFirst = async (request) => {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match(request)) || (await caches.match("./index.html"));
  }
};

const cacheFirstAppShell = async (request) => {
  const cached = await caches.match(request);
  if (cached) return cached;
  return cacheResponse(APP_CACHE, request, await fetch(request));
};

const staleWhileRevalidate = async (request) => {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((response) => cacheResponse(RUNTIME_CACHE, request, response))
    .catch(() => null);
  return cached || network;
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.destination === "audio" || request.headers.has("range")) return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin && request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (APP_SHELL_URLS.has(url.href)) {
    event.respondWith(cacheFirstAppShell(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (url.hostname === "cdn.jsdelivr.net") {
    event.respondWith(staleWhileRevalidate(request));
  }
});
