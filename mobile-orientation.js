/* Installed mobile apps and supported fullscreen browsers stay upright. */
(() => {
  "use strict";
  async function lockPortrait() {
    const mobile = navigator.userAgentData?.mobile === true || window.matchMedia("(pointer: coarse)").matches;
    if (!mobile || typeof screen.orientation?.lock !== "function") return;
    try {
      await screen.orientation.lock("portrait-primary");
    } catch {
      // Some browsers allow locking only in fullscreen or installed app mode.
      // A rejected lock must not interrupt navigation or fullscreen controls.
    }
  }
  window.addEventListener("pageshow", lockPortrait);
  document.addEventListener("fullscreenchange", lockPortrait);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void lockPortrait();
  });
  screen.orientation?.addEventListener?.("change", lockPortrait);
  void lockPortrait();
})();
