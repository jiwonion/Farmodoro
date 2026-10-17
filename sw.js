const CACHE_VERSION = "farmodoro-v395";
const APP_CACHE = `${CACHE_VERSION}-app`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const APP_SHELL = [
  "./farm-v3.css?v=20",
  "./farm-v3-catalog.js?v=8",
  "./farm-v3-crop-art.js?v=1",
  "./farm-v3-character-art.js?v=5",
  "./farm-v3-characters-view.js?v=4",
  "./farm-v3-plaza-view.js?v=3",
  "./farm-v3-art.js?v=9",
  "./farm-v3-views.js?v=14",
  "./farm-v3.js?v=13",
  "./assets/farm-v3/worlds-v1.png",
  "./assets/farm-v3/mascots-v1.png",
  "./assets/farm-v3/mascots-fishing-v1.png",
  "./assets/farm-v3/mascots-expansion-v1.png",
  "./assets/farm-v3/mascots-fishing-expansion-v1.png",
  "./assets/farm-v3/fish-expansion-v1.png",
  "./assets/farm-v3/collectibles-v1.png",
  "./assets/garden-v2/crop-atlas.png",
  "./assets/garden-v3/plants-atlas.png",
  "./assets/garden-v3/soil-atlas.png",
  "./assets/garden-v3/stages-atlas.png",
  "./assets/farm-b-v1/objects/rustic/noticeboard.png",
  "./assets/farm-b-v1/objects/rustic/well.png",
  "./assets/farm-b-v1/objects/rustic/produce-crate.png",
  "./assets/farm-b-v1/objects/rustic/fence-horizontal.png",
  "./assets/farm-b-v1/objects/rustic/seed-chest.png",
  "./index.html",
  "./styles.css?v=277",
  "./pixel-theme.css?v=195",
  "./pixel-layout.css?v=275",
  "./farm-scenery.css?v=302",
  "./workspace.css?v=9",
  "./workspace-controls.css?v=5",
  "./workspace-responsive.css?v=7",
  "./workspace-forms.css?v=4",
  "./habit-tiers.css?v=10",
  "./farm-workspace.css?v=3",
  "./garden-shell.css?v=9",
  "./garden-modals.css?v=5",
  "./mobile-orientation.js?v=1",
  "./scenery-theme-presets.js?v=4",
  "./app.js?v=343",
  "./garden-art.js?v=10",
  "./scenery-creation-art.js?v=4",
  "./scenery-creations.js?v=10",
  "./scenery-creations.css?v=5",
  "./scenery-workspace.css?v=9",
  "./assets/scenery-creations/nature-v1.png",
  "./assets/scenery-creations/winter-v1.png",
  "./assets/scenery-creations/fantasy-v1.png",
  "./assets/scenery-creations/ocean-scene-v1.png",
  "./assets/scenery-creations/space-scene-v1.png",
  "./assets/scenery-creations/cat-park-scene-v1.png",
  "./assets/scenery-creations/space-tree-v1.png",
  "./assets/scenery-creations/tuxedo-cat-v1.png",
  "./assets/scenery-creations/theme-nature-v1.png",
  "./assets/scenery-creations/theme-events-v1.png",
  "./assets/scenery-creations/theme-weather-v1.png",
  "./assets/scenery-creations/theme-fantasy-v1.png",
  "./pwa-register.js?v=177",
  "./assets/fonts/Mulmaru.woff2",
  "./assets/fonts/PretendardVariable.woff2",
  "./supabase-config.js",
  "./manifest.webmanifest",
  "./assets/pixel/crops-atlas.png",
  "./assets/pixel/themes-atlas.png",
  "./assets/garden-v3/terrain-atlas.png",
  "./assets/garden-v4/cozy-atlas.png",
  "./assets/garden-v4/festivals-atlas.png",
  "./assets/garden-v4/fantasy-atlas.png",
  "./assets/garden-v4/seasons-atlas.png",
  "./assets/focus-farm-background.png",
  "./assets/focus/default-focus-room.png?v=2",
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
