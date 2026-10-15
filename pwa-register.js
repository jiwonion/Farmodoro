(() => {
  if (!("serviceWorker" in navigator)) return;

  const isLocalDevelopment = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (isLocalDevelopment) {
    window.addEventListener("load", async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const hadServiceWorker = registrations.length > 0 || Boolean(navigator.serviceWorker.controller);
      await Promise.all(registrations.map((registration) => registration.unregister()));

      if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith("farmodoro-"))
            .map((cacheName) => caches.delete(cacheName)),
        );
      }

      if (hadServiceWorker && !sessionStorage.getItem("farmodoro-local-cache-cleared")) {
        sessionStorage.setItem("farmodoro-local-cache-cleared", "true");
        window.location.reload();
        return;
      }
      sessionStorage.removeItem("farmodoro-local-cache-cleared");
    });
    return;
  }

  let hasController = Boolean(navigator.serviceWorker.controller);
  let reloadPending = false;
  let reloading = false;
  const reloadWhenReady = async () => {
    if (!reloadPending || reloading || document.visibilityState === "hidden") return;
    reloading = true;
    try {
      if (typeof window.flushFarmodoroDataBeforeReload === "function") {
        const saved = await window.flushFarmodoroDataBeforeReload();
        if (!saved) {
          reloading = false;
          return;
        }
      }
      if (document.visibilityState === "hidden") {
        reloading = false;
        return;
      }
      reloadPending = false;
      window.location.reload();
    } catch (error) {
      reloading = false;
      console.warn("Saving before service worker reload failed:", error);
    }
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!navigator.serviceWorker.controller) return;
    // clients.claim() on a first installation does not replace a loaded version.
    if (!hasController) {
      hasController = true;
      return;
    }
    reloadPending = true;
    return reloadWhenReady();
  });

  let started = false;
  let registration;
  let updateCheck;
  let lastUpdateCheck = -Infinity;
  const checkForUpdates = (force = false) => {
    if (!started || navigator.onLine === false || document.visibilityState === "hidden") return;
    if (updateCheck) return updateCheck;
    const now = Date.now();
    if (!force && now - lastUpdateCheck < 60000) return;
    lastUpdateCheck = now;
    updateCheck = Promise.resolve().then(async () => {
      if (registration) await registration.update();
      else registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
    }).catch((error) => {
      console.warn("Service worker update check failed:", error);
    }).finally(() => { updateCheck = undefined; });
    return updateCheck;
  };
  const onForeground = (force = false) => {
    if (document.visibilityState === "hidden") return;
    return Promise.all([reloadWhenReady(), checkForUpdates(force)]);
  };
  window.addEventListener("load", () => {
    started = true;
    return checkForUpdates(true);
  });
  document.addEventListener("visibilitychange", () => onForeground());
  window.addEventListener("pageshow", () => onForeground());
  window.addEventListener("focus", () => onForeground());
  window.addEventListener("online", () => onForeground(true));
})();
