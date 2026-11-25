// Bounded account-scoped diagnostics. Only allowlisted metadata is recorded;
// never task content, email, tokens, URLs, or raw error messages.
(() => {
  const fields = new Set(["code", "scope", "durationMs", "count", "attempt", "online", "version"]);
  let userId = null, entries = [], uploading = false, unavailable = false, uploadTimer = null;
  let deviceId = null;
  const storageKey = () => `farmodoro-diagnostics:${userId}`;
  function persist() {
    try { localStorage.setItem(storageKey(), JSON.stringify(entries)); } catch {}
  }
  function record(event, metadata = {}) {
    if (!userId) return;
    const detail = Object.fromEntries(Object.entries(metadata).filter(([key, value]) =>
      fields.has(key) && ["string", "number", "boolean"].includes(typeof value)
    ).map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 80) : value]));
    entries.push({ id: crypto.randomUUID(), at: new Date().toISOString(), deviceId, event, ...detail });
    entries = entries.slice(-200);
    persist();
    if (!uploadTimer && /failed|recovered|app_ready|realtime_unavailable/.test(event)) {
      uploadTimer = setTimeout(() => { uploadTimer = null; void flush(); }, 3000);
    }
  }
  function selectUser(id) {
    if (id === userId) return;
    userId = id; entries = []; unavailable = false;
    if (uploadTimer) clearTimeout(uploadTimer);
    uploadTimer = null;
    if (!id) return;
    if (!deviceId) {
      try {
        deviceId = localStorage.getItem('farmodoro-diagnostics-device') || crypto.randomUUID();
        localStorage.setItem('farmodoro-diagnostics-device', deviceId);
      } catch { deviceId = crypto.randomUUID(); }
    }
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey()) || "[]");
      if (Array.isArray(saved)) entries = saved.slice(-200);
    } catch {}
  }
  async function flush() {
    if (!userId || uploading || unavailable || navigator.onLine === false || typeof supabaseClient === 'undefined' || !supabaseClient) return;
    const owner = userId, batch = entries.filter(entry => !entry.sent).slice(-20);
    if (!batch.length) return;
    uploading = true;
    try {
      const { error } = await supabaseClient.rpc('log_my_sync_events', { p_events: batch });
      if (owner !== userId) return;
      if (error) { if (error.code === 'PGRST202' || error.code === '42883') unavailable = true; return; }
      const ids = new Set(batch.map(entry => entry.id));
      entries.forEach(entry => { if (ids.has(entry.id)) entry.sent = true; });
      persist();
    } catch { /* Diagnostics must never block the user's save. */ }
    finally { uploading = false; }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, events: entries }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = `farmodoro-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  window.addEventListener('online', () => { void flush(); });
  window.addEventListener('error', event => record('client_error', { code: event.error?.name || 'Error' }));
  window.addEventListener('unhandledrejection', event => record('unhandled_rejection', { code: event.reason?.name || 'Error' }));
  window.SyncDiagnostics = { selectUser, record, download, flush, events: () => entries.map(entry => ({ ...entry })) };
})();
