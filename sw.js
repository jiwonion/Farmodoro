const CACHE_VERSION = "farmodoro-v414";
const APP_CACHE = `${CACHE_VERSION}-app`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const APP_SHELL = [
  "./index.html",
  "./about.html",
  "./privacy.html",
  "./public-pages.css?v=1",
  "./manifest.webmanifest",
  "./styles.css?v=278",
  "./pixel-theme.css?v=195",
  "./pixel-layout.css?v=275",
  "./farm-scenery.css?v=302",
  "./workspace.css?v=10",
  "./workspace-controls.css?v=7",
  "./workspace-responsive.css?v=7",
  "./workspace-forms.css?v=5",
  "./habit-tiers.css?v=12",
  "./farm-workspace.css?v=3",
  "./garden-shell.css?v=9",
  "./garden-modals.css?v=5",
  "./scenery-creations.css?v=5",
  "./scenery-workspace.css?v=9",
  "./farm-v3.css?v=22",
  "./focus-pomodoro.css?v=2",
  "./task-planner.css?v=5",
  "./supabase-config.js",
  "./mobile-orientation.js?v=1",
  "./scenery-theme-presets.js?v=4",
  "./productivity-recovery.js?v=1",
  "./sync-diagnostics.js?v=1",
  "./task-planner.js?v=8",
  "./app.js?v=357",
  "./garden-art.js?v=10",
  "./scenery-creation-art.js?v=4",
  "./scenery-creations.js?v=10",
  "./farm-v3-catalog.js?v=8",
  "./farm-v3-crop-art.js?v=1",
  "./farm-v3-character-art.js?v=5",
  "./farm-v3-characters-view.js?v=5",
  "./farm-v3-plaza-view.js?v=3",
  "./farm-v3-art.js?v=9",
  "./farm-v3-views.js?v=15",
  "./farm-v3.js?v=14",
  "./pwa-register.js?v=177"
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

const navigationCacheKey = (request) => {
  const base = new URL("./", self.location.href);
  const requested = new URL(request.url || "./", base);
  if (requested.origin !== base.origin) return null;
  if (requested.pathname === base.pathname || requested.pathname === `${base.pathname}index.html`) return "./index.html";
  for (const page of ["./about.html", "./privacy.html"]) {
    if (requested.pathname === new URL(page, base).pathname) return page;
  }
  return null;
};

const networkFirst = async (request, event) => {
  // Public information pages must never receive or overwrite the signed-in app shell.
  const cacheKey = navigationCacheKey(request);
  if (!cacheKey) return fetch(request);
  const cached = await caches.match(cacheKey);
  const network = fetch(request).then(response => {
    if (!response.ok) {
      if (cached) return cached;
      return response;
    }
    return cacheResponse(APP_CACHE, cacheKey, response);
  }).catch(() => cached || Response.error());
  event.waitUntil(network.then(() => {}));
  if (!cached) return network;
  let timeout;
  const fallback = new Promise(resolve => { timeout = setTimeout(() => resolve(cached), 1800); });
  return Promise.race([network, fallback]).finally(() => clearTimeout(timeout));
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
    event.respondWith(networkFirst(request, event));
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
