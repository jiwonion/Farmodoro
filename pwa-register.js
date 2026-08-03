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

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  });
})();
