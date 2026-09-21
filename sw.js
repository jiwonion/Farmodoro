const CACHE_VERSION = "farmodoro-v272";
const APP_CACHE = `${CACHE_VERSION}-app`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const APP_SHELL = [
  "./index.html",
  "./styles.css?v=272",
  "./pixel-theme.css?v=191",
  "./farm-pixel.css?v=272",
  "./pixel-layout.css?v=272",
  "./farm-theme.css?v=272",
  "./app.js?v=272",
  "./pwa-register.js?v=176",
  "./assets/fonts/Mulmaru.woff2",
  "./supabase-config.js",
  "./manifest.webmanifest",
  "./assets/pixel/crops-atlas.png",
  "./assets/pixel/themes-atlas.png",
  "./assets/pixel/plots-atlas.png",
  "./assets/pixel/farm-supplies-atlas.png",
  "./assets/pixel/food-atlas.png",
  "./assets/farm-themes/bubbleField.svg",
  "./assets/farm-themes/cherryBlossom.svg",
  "./assets/farm-themes/christmas.svg",
  "./assets/farm-themes/galaxyNight.svg",
  "./assets/farm-themes/halloween.svg",
  "./assets/farm-themes/ocean.svg",
  "./assets/farm-themes/springMeadow.svg",
  "./assets/farm-themes/valentine.svg",
  "./assets/farm-themes/whiteDay.svg",
  "./assets/farm-themes/volcano.svg",
  "./assets/farm-themes/iceKingdom.svg",
  "./assets/farm-themes/goldenHarvest.svg",
  "./assets/focus-farm-background.png",
  "./assets/focus/default-focus-room.png",
  "./assets/npc-morrison.png",
  "./assets/npc-noah.png",
  "./assets/npc-rachel.png",
  "./assets/fonts/Maplestory-Light.ttf",
  "./assets/fonts/Maplestory-Bold.ttf",
  "./assets/icons/pixel-clock-192.png?v=268",
  "./assets/icons/pixel-clock-512.png?v=268",
  "./assets/icons/pixel-clock-maskable-512.png?v=268",
  "./assets/icons/pixel-clock-apple-touch.png?v=268"
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

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "Farmodoro";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "./assets/icons/pixel-clock-192.png?v=268",
      // No `badge` here on purpose -- Android ignores the icon's colors for
      // this slot and renders only its alpha channel, so a normal full-color
      // square icon (icon-192.png has no transparent margin) turns into a
      // solid white square in the status bar. Fix properly later with a
      // dedicated transparent-background white-silhouette PNG.
      data: { url: data.url || "./" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "./", self.location.href).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const existing = windowClients.find((client) => client.url === targetUrl);
      if (existing) return existing.focus();
      const anyWindow = windowClients[0];
      if (anyWindow) return anyWindow.focus();
      return clients.openWindow(targetUrl);
    })
  );
});
