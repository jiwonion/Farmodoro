// Signals to the inline bootstrap script in index.html that app.js actually
// started running, so a genuine load failure (blocked CDN script, a thrown
// error before this point) shows a retry message instead of silently
// revealing the static HTML placeholder values as if they were real data.
window.__farmodoroAppJsLoaded = true;

// Read straight off this script's own <script src="app.js?v=NN"> tag rather
// than hard-coding a number here, so it can never drift out of sync with the
// cache-busting version that index.html/sw.js were actually bumped to.
const APP_VERSION = new URL(document.currentScript?.src ?? "", location.href)
  .searchParams.get("v") ?? "?";

const APP_PAGES = ["today", "tasks", "habits", "focus", "farm"];
const GROUP_COLOR_COUNT = 8;

function applyWorkspaceTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "white";
  const toggle = document.querySelector("#themeToggle");
  toggle.setAttribute("aria-pressed", String(dark));
  toggle.setAttribute("aria-label", dark ? "화이트 테마로 전환" : "다크 테마로 전환");
  document.querySelector("#themeToggleLabel").textContent = dark ? "화이트 테마" : "다크 테마";
  document.querySelector('meta[name="theme-color"]').content = dark ? "#151a24" : "#ffffff";
}

applyWorkspaceTheme(document.documentElement.dataset.theme);
document.querySelector("#themeToggle").addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "dark" ? "white" : "dark";
  applyWorkspaceTheme(theme);
  try { localStorage.setItem("farmodoro-ui-theme", theme); } catch {}
});
window.addEventListener("storage", (event) => {
  if (event.key === "farmodoro-ui-theme") applyWorkspaceTheme(event.newValue);
});

function initializeTodaySplitter() {
  const layout = document.querySelector("#todayPage");
  const splitter = document.querySelector("#todaySplitter");
  const mobile = window.matchMedia("(max-width: 700px)");
  const storageKey = "farmodoro-today-right-percent";
  let preferredPercent = 30;
  let appliedPercent = 30;
  let pointerId = null;
  let dragOffset = 0;
  let dragStartPercent = 30;
  let lastWidth = 0;
  try {
    const saved = localStorage.getItem(storageKey);
    const percent = Number(saved);
    if (saved !== null && Number.isFinite(percent) && percent >= 20 && percent <= 60) preferredPercent = percent;
  } catch {}

  function getBounds() {
    if (mobile.matches || !layout.clientWidth) return null;
    const width = layout.clientWidth - splitter.offsetWidth;
    return { width, min: Math.max(20, 260 / width * 100), max: Math.min(60, (width - 260) / width * 100) };
  }

  function applyWidth() {
    const bounds = getBounds();
    if (!bounds) return;
    appliedPercent = Math.max(bounds.min, Math.min(bounds.max, preferredPercent));
    layout.style.setProperty("--today-right-width", `${bounds.width * appliedPercent / 100}px`);
    splitter.setAttribute("aria-valuemin", bounds.min.toFixed(1));
    splitter.setAttribute("aria-valuemax", bounds.max.toFixed(1));
    splitter.setAttribute("aria-valuenow", appliedPercent.toFixed(1));
    splitter.setAttribute("aria-valuetext", `할 일 ${Math.round(100 - appliedPercent)}%, 오른쪽 ${Math.round(appliedPercent)}%`);
  }

  function saveWidth() {
    try { localStorage.setItem(storageKey, String(preferredPercent)); } catch {}
  }

  function finishDrag(cancelled = false) {
    if (pointerId === null) return;
    const id = pointerId;
    pointerId = null;
    document.body.classList.remove("resizing-today");
    if (splitter.hasPointerCapture(id)) splitter.releasePointerCapture(id);
    if (cancelled) {
      preferredPercent = dragStartPercent;
      applyWidth();
    } else saveWidth();
  }

  splitter.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.isPrimary || pointerId !== null || !getBounds()) return;
    event.preventDefault();
    pointerId = event.pointerId;
    dragStartPercent = preferredPercent;
    const rect = splitter.getBoundingClientRect();
    dragOffset = event.clientX - rect.left - rect.width / 2;
    splitter.focus({ preventScroll: true });
    splitter.setPointerCapture(pointerId);
    document.body.classList.add("resizing-today");
  });
  splitter.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    const bounds = getBounds();
    if (!bounds) return finishDrag(true);
    const left = event.clientX - layout.getBoundingClientRect().left - dragOffset - splitter.offsetWidth / 2;
    preferredPercent = Math.max(bounds.min, Math.min(bounds.max, (bounds.width - left) / bounds.width * 100));
    applyWidth();
  });
  splitter.addEventListener("pointerup", (event) => { if (event.pointerId === pointerId) finishDrag(); });
  splitter.addEventListener("pointercancel", (event) => { if (event.pointerId === pointerId) finishDrag(true); });
  splitter.addEventListener("lostpointercapture", () => finishDrag());
  splitter.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && pointerId !== null) return finishDrag(true);
    const bounds = getBounds();
    if (!bounds) return;
    const step = event.shiftKey ? 5 : 2;
    const next = { ArrowLeft: appliedPercent + step, ArrowRight: appliedPercent - step, Home: bounds.min, End: bounds.max }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    preferredPercent = Math.max(bounds.min, Math.min(bounds.max, next));
    applyWidth();
    saveWidth();
  });
  splitter.addEventListener("dblclick", () => {
    preferredPercent = 30;
    applyWidth();
    saveWidth();
  });
  mobile.addEventListener("change", () => {
    finishDrag(true);
    applyWidth();
  });
  new ResizeObserver(() => {
    const width = layout.clientWidth;
    if (width === lastWidth) return;
    lastWidth = width;
    applyWidth();
  }).observe(layout);
  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey) return;
    const percent = event.newValue === null ? 30 : Number(event.newValue);
    if (!Number.isFinite(percent) || percent < 20 || percent > 60) return;
    preferredPercent = percent;
    applyWidth();
  });
  applyWidth();
}

// Public VAPID key for Web Push subscriptions (062_push_subscriptions.sql +
// supabase/functions/send-push). Not a secret -- pairs with the private key
// held only in the Edge Function's VAPID_PRIVATE_KEY secret.
const VAPID_PUBLIC_KEY = "BB4mJFVL6Soa41QJahYE9TB9kJf-h3C4-wwI1uIDk5g2p172kMKcpPd9GlwSt0qSrd7zMSuzKqw47cgRLDe6dY8";

const authGate = document.querySelector("#authGate");
const authStatus = document.querySelector("#authStatus");
const googleSignInButton = document.querySelector("#googleSignInButton");
const signOutButton = document.querySelector("#signOutButton");
const deleteAccountButton = document.querySelector("#deleteAccountButton");
const openUserSettingsButton = document.querySelector("#openUserSettings");
const openMobileUserSettingsButton = document.querySelector("#openMobileUserSettings");
const userSettingsModal = document.querySelector("#userSettingsModal");
const userSettingsForm = document.querySelector("#userSettingsForm");
const profileSettingsAvatar = document.querySelector("#profileSettingsAvatar");
const profileAvatarInput = document.querySelector("#profileAvatarInput");
const chooseProfileAvatarButton = document.querySelector("#chooseProfileAvatar");
const resetProfileAvatarButton = document.querySelector("#resetProfileAvatar");
const profileDisplayNameInput = document.querySelector("#profileDisplayName");
const profileNameLength = document.querySelector("#profileNameLength");
const settingsAccountEmail = document.querySelector("#settingsAccountEmail");
const settingsFarmCode = document.querySelector("#settingsFarmCode");
const settingsAppVersion = document.querySelector("#settingsAppVersion");
if (settingsAppVersion) settingsAppVersion.textContent = `v${APP_VERSION}`;
const copyFarmCodeButton = document.querySelector("#copyFarmCode");
const saveUserSettingsButton = document.querySelector("#saveUserSettings");
const profileAvatar = document.querySelector("#profileAvatar");
const profileName = document.querySelector("#profileName");
const profileAccountLabel = document.querySelector("#profileAccountLabel");
const supabaseConfig = window.FARMODORO_CONFIG;
let googleSignInNonce = null;
let googleIdentityScriptPromise = null;
let googleSignInButtonWidth = 0;
let googleSignInResizeFrame = null;
let activeAuthUser = null;
let currentProfile = null;
let pendingAvatarFile = null;
let pendingAvatarReset = false;
let profilePreviewObjectUrl = null;
let taskDataHydrated = false;
let taskDataUserId = null;
let taskDataLoadPromise = null;
let taskSyncTimer = null;
let taskSyncChain = Promise.resolve();
const taskStatusSyncChains = new Map();
let lastTaskSyncSignature = "";
// Tracks the last-uploaded content per (habit_id, record_date) so a sync only
// upserts habit-day rows that actually changed, instead of re-uploading a
// user's entire multi-year habit history on every unrelated task/habit edit.
let habitRecordSyncSignatures = new Map();
const pendingTaskDatabaseDeletes = new Set();
const pendingHabitDatabaseDeletes = new Set();
const pendingGroupDatabaseDeletes = new Set();
let appStateHydrated = false;
let appStateUserId = null;
let appStateRealtimeChannel = null;
let appStateRealtimeRefreshTimer = null;
let appStateRealtimeMutedUntil = 0;
let farmWalletHydrated = false;
let farmWalletUserId = null;
let farmWalletMutationChain = Promise.resolve();
let farmWalletMutationVersion = 0;
let farmWalletRealtimeRefreshTimer = null;
let farmDataHydrated = false;
let farmSessionGeneration = 0;
let farmDataUserId = null;
let lastFarmRenderSignature = "";
let farmDataLoadRequest = 0;
let farmDataLoadPending = null;
let productivityRealtimeChannel = null;
let productivityRealtimeRefreshTimer = null;
let productivityRealtimeMutedUntil = 0;
let farmContentRealtimeMutedUntil = 0;
// Set true only while flushing data on tab-hide/unload, so the last edit's
// requests survive page teardown (mobile browsers can otherwise cancel
// in-flight fetches the instant pagehide/visibilitychange returns).
// Scoped to that narrow window only: `keepalive` fetches share a small
// (~64KB) combined body-size budget, so it must not be left on during
// normal operation where sync payloads can be much larger.
let exitFlushKeepAlive = false;

const supabaseClient = window.supabase?.createClient(
  supabaseConfig?.supabaseUrl,
  supabaseConfig?.supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, exitFlushKeepAlive ? { ...init, keepalive: true } : init),
    },
  },
);

function subscribeToUserTables(channel, tables, userId, callback) {
  return tables.reduce(
    (currentChannel, table) => currentChannel.on(
      "postgres_changes",
      { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` },
      callback,
    ),
    channel,
  );
}

function setAuthStatus(message, isNotice = false) {
  authStatus.textContent = message;
  authStatus.classList.toggle("notice", isNotice);
}

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleIdentityScriptPromise) return googleIdentityScriptPromise;

  googleIdentityScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Google 로그인 모듈을 불러오지 못했어"));
    document.head.appendChild(script);
  });

  return googleIdentityScriptPromise;
}

async function createGoogleNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = btoa(String.fromCharCode(...bytes));
  const encodedNonce = new TextEncoder().encode(nonce);
  const hash = await crypto.subtle.digest("SHA-256", encodedNonce);
  const hashedNonce = Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return { nonce, hashedNonce };
}

async function handleGoogleCredential(response) {
  if (!response.credential || !supabaseClient) {
    setAuthStatus("Google 계정 정보를 받지 못했어. 다시 시도해줘", true);
    return;
  }

  googleSignInButton.classList.add("authenticating");
  googleSignInButton.setAttribute("aria-busy", "true");
  setAuthStatus("Google 계정을 확인하고 있어");

  const { error } = await supabaseClient.auth.signInWithIdToken({
    provider: "google",
    token: response.credential,
    nonce: googleSignInNonce,
  });

  if (error) {
    setAuthStatus(`로그인하지 못했어: ${error.message}`, true);
    await prepareGoogleSignIn();
  }
}

function renderGoogleSignInButton() {
  if (!window.google?.accounts?.id || googleSignInButton.classList.contains("authenticating")) {
    return;
  }

  const width = Math.min(400, Math.floor(googleSignInButton.clientWidth));
  if (width < 1 || (googleSignInButtonWidth && Math.abs(width - googleSignInButtonWidth) < 24)) {
    return;
  }

  googleSignInButtonWidth = width;
  googleSignInButton.replaceChildren();
  window.google.accounts.id.renderButton(googleSignInButton, {
    type: "standard",
    theme: "outline",
    size: "medium",
    text: "continue_with",
    shape: "rectangular",
    logo_alignment: "left",
    locale: "ko",
    width,
  });
  googleSignInButton.classList.remove("loading");
}

async function prepareGoogleSignIn() {
  if (!supabaseConfig?.googleClientId) {
    throw new Error("Google Client ID가 설정되지 않았어");
  }

  await loadGoogleIdentityScript();
  const { nonce, hashedNonce } = await createGoogleNonce();
  googleSignInNonce = nonce;
  googleSignInButton.classList.remove("authenticating");
  googleSignInButton.setAttribute("aria-busy", "false");
  googleSignInButtonWidth = 0;

  window.google.accounts.id.initialize({
    client_id: supabaseConfig.googleClientId,
    callback: handleGoogleCredential,
    nonce: hashedNonce,
    auto_select: false,
    cancel_on_tap_outside: true,
  });

  renderGoogleSignInButton();
}

if ("ResizeObserver" in window) {
  new ResizeObserver(() => {
    cancelAnimationFrame(googleSignInResizeFrame);
    googleSignInResizeFrame = requestAnimationFrame(renderGoogleSignInButton);
  }).observe(googleSignInButton);
} else {
  window.addEventListener("resize", renderGoogleSignInButton);
}

function getGoogleAvatarUrl(user) {
  const metadata = user?.user_metadata ?? {};
  return metadata.picture || metadata.avatar_url || "";
}

function renderAvatar(target, avatarUrl, displayName) {
  target.replaceChildren();

  if (avatarUrl) {
    const image = document.createElement("img");
    image.src = avatarUrl;
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.addEventListener(
      "error",
      () => {
        target.textContent = displayName.trim().charAt(0) || "F";
      },
      { once: true },
    );
    target.appendChild(image);
    return;
  }

  target.textContent = displayName.trim().charAt(0) || "F";
}

function getProfileFallback(user) {
  const metadata = user.user_metadata ?? {};
  return {
    display_name:
      metadata.display_name || metadata.full_name || metadata.name || user.email?.split("@")[0] || "Farmodoro",
    avatar_url: metadata.avatar_url || metadata.picture || "",
    farm_code: "",
    focus_background_path: null,
  };
}

function updateProfileFromUser(user, profile = currentProfile) {
  const fallback = getProfileFallback(user);
  const displayName = profile?.display_name || fallback.display_name;
  const avatarUrl = profile?.avatar_url || fallback.avatar_url;

  profileName.textContent = displayName;
  profileAccountLabel.textContent = user.email || "Google 계정";
  renderAvatar(profileAvatar, avatarUrl, displayName);
}

async function loadUserProfile(user) {
  if (!supabaseClient || !user) return null;
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("display_name, avatar_url, farm_code, focus_background_path")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("Farmodoro profile could not be loaded", error);
    currentProfile = getProfileFallback(user);
  } else {
    currentProfile = data ?? getProfileFallback(user);
  }

  if (activeAuthUser?.id === user.id) updateProfileFromUser(user, currentProfile);
  if (activeAuthUser?.id === user.id) {
    await loadFocusBackgroundFromDatabase(user, currentProfile.focus_background_path);
  }
  return currentProfile;
}

function resetFarmWalletDatabaseState() {
  farmWalletHydrated = false;
  farmWalletUserId = null;
  farmWalletMutationChain = Promise.resolve();
  farmWalletMutationVersion = 0;
  if (farmWalletRealtimeRefreshTimer) clearTimeout(farmWalletRealtimeRefreshTimer);
  farmWalletRealtimeRefreshTimer = null;
}

async function loadFarmWallet(
  user,
  { background = false, expectedMutationVersion = null } = {},
) {
  if (!supabaseClient || !user) return;
  const sessionGeneration = farmSessionGeneration;
  const walletMutationVersion = farmWalletMutationVersion;
  const previousCoins = Number(state.coins ?? 0);
  const previousFarmMoney = Number(state.farmMoney ?? 0);
  if (background) {
    if (!farmWalletHydrated || farmWalletUserId !== user.id) return;
  } else {
    farmWalletHydrated = false;
    farmWalletUserId = user.id;
  }

  const { data, error } = await supabaseClient.rpc("get_my_farm_wallet");

  if (farmSessionGeneration !== sessionGeneration || farmWalletMutationVersion !== walletMutationVersion || activeAuthUser?.id !== user.id || farmWalletUserId !== user.id) return;
  if (
    background &&
    expectedMutationVersion !== null &&
    expectedMutationVersion !== farmWalletMutationVersion
  ) return;
  if (error) {
    console.error("Farmodoro wallet could not be loaded", error);
    if (!background) {
      showToast("지갑 데이터를 불러오지 못했어. 잠시 후 다시 시도해줘");
    }
    return;
  }

  const wallet = Array.isArray(data) ? data[0] : data;
  const databaseCoins = Number(wallet?.coin_balance ?? 0);
  const databaseFarmMoney = Number(wallet?.farm_money_balance ?? 0);
  state.coins = databaseCoins;
  state.farmMoney = databaseFarmMoney;
  farmWalletHydrated = true;
  if (databaseCoins !== previousCoins || databaseFarmMoney !== previousFarmMoney) {
    renderSummary();
    renderFarm();
  }
}

async function applyAuthSession(session) {
  const isSignedIn = Boolean(session?.user);
  const previousUserId = activeAuthUser?.id ?? null;
  activeAuthUser = session?.user ?? null;
  if (previousUserId !== (session?.user?.id ?? null)) {
    farmSessionGeneration += 1;

    window.SceneryCreations?.reset();
  }
  authGate.hidden = isSignedIn;
  document.body.classList.toggle("auth-gated", !isSignedIn);

  if (isSignedIn) {
    currentProfile = getProfileFallback(session.user);
    updateProfileFromUser(session.user, currentProfile);
    if (
      previousUserId === session.user.id &&
      appStateHydrated &&
      taskDataHydrated &&
      farmWalletHydrated &&
      farmDataHydrated &&
      appStateUserId === session.user.id &&
      taskDataUserId === session.user.id &&
      farmWalletUserId === session.user.id &&
      farmDataUserId === session.user.id
    ) {
      return;
    }
    const needsAppStateLoad = !appStateHydrated || appStateUserId !== session.user.id;
    await Promise.all([
      loadUserProfile(session.user),
      needsAppStateLoad ? loadUserPreferences(session.user) : Promise.resolve(),
    ]);

    await Promise.all([
      !taskDataHydrated || taskDataUserId !== session.user.id
        ? loadTaskDataFromDatabase(session.user)
        : Promise.resolve(),
      !farmWalletHydrated || farmWalletUserId !== session.user.id
        ? loadFarmWallet(session.user)
        : Promise.resolve(),
      !farmDataHydrated || farmDataUserId !== session.user.id
        ? loadFarmDataFromDatabase(session.user)
        : Promise.resolve(),
    ]);
    startProductivityRealtime(session.user);
    startAppStateRealtime(session.user);

    startFarmRealtime(session.user);
    await loadFocusProgress(session.user);
    await loadFocusTimerFromDatabase(session.user);
    startFocusRealtime(session.user);
  } else {
    resetTaskDatabaseState();
    resetAppStateDatabaseState();
    resetFocusTimerDatabaseState();
    resetFarmWalletDatabaseState();
    resetFarmDataDatabaseState();
    state = loadState();
    applyLoadedAppStateRuntime();
    currentProfile = null;

    userSettingsModal.classList.add("hidden");
    setAuthStatus("파머도로를 사용하려면 Google 로그인이 필요해");
  }
}

function finishAuthResolution() {
  document.documentElement.classList.remove("auth-resolving");
}

async function initializeAuth() {
  if (!supabaseClient) {
    setAuthStatus("로그인 모듈을 불러오지 못했어. 인터넷 연결을 확인해줘", true);
    finishAuthResolution();
    return;
  }

  setAuthStatus("로그인 상태를 확인하고 있어");

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    setAuthStatus("로그인 상태를 확인하지 못했어. 잠시 후 다시 시도해줘", true);
  } else {
    await applyAuthSession(data.session);
  }

  // Reveal exactly one resolved screen: the app for a saved session, otherwise login.
  finishAuthResolution();

  if (!data?.session) {
    try {
      await prepareGoogleSignIn();
    } catch (googleError) {
      setAuthStatus(googleError.message, true);
    }
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    const needsAccountLoad =
      event === "SIGNED_IN" &&
      session?.user &&
      (!appStateHydrated ||
        !taskDataHydrated ||
        !farmWalletHydrated ||
        !farmDataHydrated ||
        appStateUserId !== session.user.id ||
        taskDataUserId !== session.user.id ||
        farmWalletUserId !== session.user.id ||
        farmDataUserId !== session.user.id);
    if (needsAccountLoad) document.documentElement.classList.add("auth-resolving");
    void applyAuthSession(session).finally(() => {
      if (needsAccountLoad) finishAuthResolution();
    });
  });
}

function clearProfilePreviewObjectUrl() {
  if (!profilePreviewObjectUrl) return;
  URL.revokeObjectURL(profilePreviewObjectUrl);
  profilePreviewObjectUrl = null;
}

function setSettingsAvatarPreview(avatarUrl) {
  const displayName = profileDisplayNameInput.value.trim() || currentProfile?.display_name || "Farmodoro";
  renderAvatar(profileSettingsAvatar, avatarUrl, displayName);
}

function getProfileSettingsErrorMessage(error) {
  const message = String(error?.message ?? "");
  if (message.includes("Bucket not found") || message.includes("avatars")) {
    console.warn("Farmodoro: 002 migration not applied (avatars bucket missing)");
    return "프로필 사진을 저장하지 못했어. 잠시 후 다시 시도해줘";
  }
  if (message.startsWith("프로필 사진을")) return message;
  return "사용자 설정을 저장하지 못했어. 잠시 후 다시 시도해줘";
}

function refreshSettingsProfileFields() {
  if (!activeAuthUser) return;
  const profile = currentProfile ?? getProfileFallback(activeAuthUser);
  profileDisplayNameInput.value = profile.display_name;
  profileNameLength.textContent = profile.display_name.length;
  settingsAccountEmail.textContent = activeAuthUser.email || "Google 계정";
  settingsFarmCode.textContent = profile.farm_code || "준비 중";
  copyFarmCodeButton.disabled = !profile.farm_code;
  setSettingsAvatarPreview(profile.avatar_url);
}

async function openUserSettings() {
  if (!activeAuthUser) return;
  pendingAvatarFile = null;
  pendingAvatarReset = false;
  clearProfilePreviewObjectUrl();

  if (!currentProfile?.farm_code) await loadUserProfile(activeAuthUser);
  refreshSettingsProfileFields();

  userSettingsModal.classList.remove("hidden");
  userSettingsModal.querySelector("[data-close-user-settings]")?.focus({ preventScroll: true });
  void refreshPushNotificationSettingsUI();
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function isFarmPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window;
}

async function getFarmPushSubscription() {
  if (!isFarmPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function refreshPushNotificationSettingsUI() {
  const button = document.querySelector("#togglePushNotifications");
  const status = document.querySelector("#pushSettingsStatus");
  if (!button || !status) return;

  if (!isFarmPushSupported()) {
    button.disabled = true;
    button.textContent = "이 기기에서는 지원 안 함";
    status.textContent = "이 브라우저는 휴대폰 알림을 지원하지 않아";
    return;
  }
  if (typeof Notification !== "undefined" && Notification.permission === "denied") {
    button.disabled = true;
    button.textContent = "브라우저에서 차단됨";
    status.textContent = "브라우저/기기 설정에서 알림 권한을 허용해줘";
    return;
  }

  button.disabled = false;
  const subscription = await getFarmPushSubscription();
  button.textContent = subscription ? "알림 끄기" : "알림 받기";
  status.textContent = subscription
    ? "타이머 종료와 새 우편을 알려주고 있어"
    : "타이머 종료와 새 우편을 알려줘";
}

async function enableFarmPushNotifications() {
  if (!supabaseClient || !activeAuthUser) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      showToast("알림 권한을 허용해야 켤 수 있어");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const json = subscription.toJSON();
    const { error } = await supabaseClient.rpc("save_my_push_subscription", {
      p_endpoint: json.endpoint,
      p_p256dh: json.keys?.p256dh,
      p_auth: json.keys?.auth,
    });
    if (error) throw error;
    showToast("휴대폰 알림을 켰어");
  } catch (error) {
    console.error("Farmodoro push subscribe failed", error);
    showToast("알림을 켜지 못했어. 잠시 후 다시 시도해줘");
  }
  await refreshPushNotificationSettingsUI();
}

async function disableFarmPushNotifications() {
  try {
    const subscription = await getFarmPushSubscription();
    if (subscription) {
      if (supabaseClient) {
        await supabaseClient.rpc("delete_my_push_subscription", { p_endpoint: subscription.endpoint });
      }
      await subscription.unsubscribe();
    }
    showToast("휴대폰 알림을 껐어");
  } catch (error) {
    console.error("Farmodoro push unsubscribe failed", error);
    showToast("알림을 끄지 못했어");
  }
  await refreshPushNotificationSettingsUI();
}

// Schedules/cancels a future push (timer end, watering ready) via
// scheduled_push_notifications (063) + the pg_cron-driven dispatch-scheduled-push
// function. Best-effort: a failure here should never block the timer/watering
// action itself, so callers fire these without awaiting.
async function scheduleFarmPushNotification(kind, subjectKey, fireAtMs, title, body) {
  if (!supabaseClient || !activeAuthUser) return;
  try {
    const { error } = await supabaseClient.rpc("schedule_my_push_notification", {
      p_kind: kind,
      p_subject_key: subjectKey,
      p_fire_at: new Date(fireAtMs).toISOString(),
      p_title: title,
      p_body: body,
    });
    if (error) throw error;
  } catch (error) {
    console.warn(`Farmodoro schedule_my_push_notification (${kind}) failed`, error);
  }
}

async function cancelFarmPushNotification(kind, subjectKey) {
  if (!supabaseClient || !activeAuthUser) return;
  try {
    const { error } = await supabaseClient.rpc("cancel_my_push_notification", {
      p_kind: kind,
      p_subject_key: subjectKey,
    });
    if (error) throw error;
  } catch (error) {
    console.warn(`Farmodoro cancel_my_push_notification (${kind}) failed`, error);
  }
}

function closeUserSettings() {
  if (userSettingsModal.classList.contains("hidden")) return;
  userSettingsModal.classList.add("hidden");
  clearProfilePreviewObjectUrl();
  pendingAvatarFile = null;
  pendingAvatarReset = false;
  profileAvatarInput.value = "";
}

async function uploadProfileAvatar(user, file) {
  const avatarPath = `${user.id}/profile`;
  const { error } = await supabaseClient.storage.from("avatars").upload(avatarPath, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error(`프로필 사진을 올리지 못했어: ${error.message}`);

  const { data } = supabaseClient.storage.from("avatars").getPublicUrl(avatarPath);
  return `${data.publicUrl}?v=${Date.now()}`;
}

openUserSettingsButton.addEventListener("click", () => void openUserSettings());
openMobileUserSettingsButton.addEventListener("click", () => void openUserSettings());

userSettingsModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-user-settings]")) closeUserSettings();
});

chooseProfileAvatarButton.addEventListener("click", () => profileAvatarInput.click());

profileAvatarInput.addEventListener("change", () => {
  const [file] = profileAvatarInput.files;
  if (!file) return;
  if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
    profileAvatarInput.value = "";
    showToast("JPG, PNG, WEBP 사진만 선택할 수 있어");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    profileAvatarInput.value = "";
    showToast("프로필 사진은 5MB 이하로 골라줘");
    return;
  }

  pendingAvatarFile = file;
  pendingAvatarReset = false;
  clearProfilePreviewObjectUrl();
  profilePreviewObjectUrl = URL.createObjectURL(file);
  setSettingsAvatarPreview(profilePreviewObjectUrl);
});

resetProfileAvatarButton.addEventListener("click", () => {
  pendingAvatarFile = null;
  pendingAvatarReset = true;
  profileAvatarInput.value = "";
  clearProfilePreviewObjectUrl();
  setSettingsAvatarPreview(getGoogleAvatarUrl(activeAuthUser));
});

profileDisplayNameInput.addEventListener("input", () => {
  profileNameLength.textContent = profileDisplayNameInput.value.length;
  const previewImage = profileSettingsAvatar.querySelector("img");
  if (!previewImage) setSettingsAvatarPreview("");
});

document.querySelector("#togglePushNotifications").addEventListener("click", async () => {
  const button = document.querySelector("#togglePushNotifications");
  button.disabled = true;
  try {
    const subscription = await getFarmPushSubscription();
    if (subscription) await disableFarmPushNotifications();
    else await enableFarmPushNotifications();
  } finally {
    await refreshPushNotificationSettingsUI();
  }
});

copyFarmCodeButton.addEventListener("click", async () => {
  const farmCode = currentProfile?.farm_code;
  if (!farmCode) {
    showToast("농장 코드가 아직 준비되지 않았어");
    return;
  }

  try {
    await navigator.clipboard.writeText(farmCode);
    showToast("농장 코드를 복사했어");
  } catch {
    showToast(`농장 코드: ${farmCode}`);
  }
});

userSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeAuthUser || !supabaseClient) return;

  const displayName = profileDisplayNameInput.value.trim();
  if (!displayName) {
    showToast("닉네임을 입력해줘");
    profileDisplayNameInput.focus();
    return;
  }

  saveUserSettingsButton.disabled = true;
  saveUserSettingsButton.textContent = "저장 중";

  try {
    let avatarUrl = currentProfile?.avatar_url || getProfileFallback(activeAuthUser).avatar_url;
    if (pendingAvatarReset) avatarUrl = getGoogleAvatarUrl(activeAuthUser);
    if (pendingAvatarFile) avatarUrl = await uploadProfileAvatar(activeAuthUser, pendingAvatarFile);

    const { data, error } = await supabaseClient
      .from("profiles")
      .update({ display_name: displayName, avatar_url: avatarUrl || null })
      .eq("id", activeAuthUser.id)
      .select("display_name, avatar_url, farm_code, focus_background_path")
      .single();
    if (error) throw error;

    currentProfile = data;
    const { error: authUpdateError } = await supabaseClient.auth.updateUser({
      data: { display_name: displayName, avatar_url: avatarUrl || null },
    });
    if (authUpdateError) console.warn("Auth profile metadata could not be updated", authUpdateError);

    updateProfileFromUser(activeAuthUser, currentProfile);
    closeUserSettings();
    showToast("사용자 설정을 저장했어");
  } catch (error) {
    console.error("Farmodoro user settings could not be saved", error);
    showToast(getProfileSettingsErrorMessage(error));
  } finally {
    saveUserSettingsButton.disabled = false;
    saveUserSettingsButton.textContent = "변경사항 저장";
  }
});

signOutButton.addEventListener("click", async () => {
  if (!supabaseClient) return;
  signOutButton.disabled = true;
  const { error } = await supabaseClient.auth.signOut();
  signOutButton.disabled = false;

  if (error) {
    showToast("로그아웃하지 못했어. 다시 시도해줘");
  } else {
    closeUserSettings();
    applyAuthSession(null);
    try {
      await prepareGoogleSignIn();
    } catch (googleError) {
      setAuthStatus(googleError.message, true);
    }
  }
});

initializeAuth();

const FARM_THEMES = [
  { id: "volcano", name: "용암", price: 2000 },
  { id: "iceKingdom", name: "얼음 왕국", price: 2000 },
  { id: "goldenHarvest", name: "황금 들판", price: 2000 },
  { id: "cherryBlossom", name: "벚꽃", price: 2000 },
  { id: "valentine", name: "발렌타인", price: 2000 },
  { id: "halloween", name: "할로윈", price: 2000 },
  { id: "christmas", name: "크리스마스", price: 2000 },
  { id: "whiteDay", name: "화이트데이", price: 2000 },
  { id: "springMeadow", name: "봄날 들판", price: 2000 },
  { id: "galaxyNight", name: "은하수 밤", price: 2000 },
  { id: "ocean", name: "바다", price: 2000 },
  { id: "bubbleField", name: "거품 밭", price: 2000 },
  { id: "peperoDay", name: "빼빼로데이", price: 2000 },
  { id: "auroraNight", name: "오로라", price: 2000 },
  { id: "lavenderField", name: "라벤더 정원", price: 2000 },
  { id: "rainyGarden", name: "비 오는 정원", price: 2000 },
  { id: "desertOasis", name: "사막 오아시스", price: 2000 },
  { id: "moonGarden", name: "달빛 정원", price: 2000 },
  { id: "space", name: "우주", price: 2000 },
  { id: "tuxedoCat", name: "고양이 동산", price: 2000 },
];

const COSMETIC_CATALOGS = { farm_theme: FARM_THEMES };

const defaultState = {
  schemaVersion: 47,
  coins: 0,
  farmMoney: 0,
  farmRankingWeekStart: "",
  weeklyFarmMoneyEarned: 0,
  farmName: "내 풍경",
  ownedCosmetics: [],
  equippedFarmTheme: null,
  legacySettlement: null,
  focusRewardSeconds: 0,
  settings: {
    linked: { focusMinutes: 25, breakEnabled: true, breakMinutes: 5 },
    quick: { focusMinutes: 25, breakEnabled: true, breakMinutes: 5 },
  },
  groups: [
    { id: "work", name: "업무", colorIndex: 0 },
    { id: "study", name: "공부", colorIndex: 3 },
    { id: "life", name: "생활", colorIndex: 1 },
  ],
  tasks: [],
  habits: [],
};

const FARM_STATE_KEYS = [
  "farmRankingWeekStart", "weeklyFarmMoneyEarned", "farmName",
  "ownedCosmetics", "equippedFarmTheme", "legacySettlement",
];

let state = loadState();
ensureWeeklyFarmRanking();
state.habits = state.habits.map((habit) => {
  const completionDates =
    habit.completionDates ??
    (habit.completedDate
      ? [habit.completedDate]
      : habit.complete
        ? [toProductivityDateString()]
        : []);
  return {
    ...habit,
    targetByWeekday: habit.targetByWeekday ?? {},
    completedDate: habit.completedDate ?? (habit.complete ? toProductivityDateString() : ""),
    completionDates,
    progressByDate:
      habit.progressByDate ??
      (habit.measureType === "count"
        ? Object.fromEntries(completionDates.map((date) => [date, getHabitTargetForDate(habit, date)]))
        : {}),
    focusSecondsByDate: habit.focusSecondsByDate ?? {},
  };
});
let toastTimer;
let focusInterval;
let focusLastTickAt = 0;
let focusSeconds = 0;
let focusRunning = false;
let focusSessionStarted = false;
let focusMode = "linked";
let focusModeUserSelected = false;
let runningFocusMode = null;
let timerPhase = "focus";
const focusRuntimeByMode = {
  linked: { seconds: 0, phase: "focus", started: false },
  quick: { seconds: state.settings.quick.focusMinutes * 60, phase: "focus", started: false, sessionMinutes: state.settings.quick.focusMinutes },
};
const FOCUS_TIMER_CLIENT_ID = (() => {
  try {
    const storedId = sessionStorage.getItem("farmodoro-focus-timer-client");
    if (storedId) return storedId;
    const clientId = crypto.randomUUID();
    sessionStorage.setItem("farmodoro-focus-timer-client", clientId);
    return clientId;
  } catch {
    return crypto.randomUUID();
  }
})();
let focusTimerOwnerId = "";
let focusTimerDatabaseHydrated = false;
let focusTimerDatabaseUnavailable = false;
let focusTimerSyncTimer = null;
let focusTimerPollInterval = null;
let focusTimerLastUpdatedAt = "";
let focusTimerLastHeartbeatAt = 0;
let focusTimerWriteChain = Promise.resolve();
let focusTimerWritesPending = 0;
let focusTimerStateGeneration = 0;
let focusProgressServerSeconds = 0;
let focusProgressApiUnavailable = false;
let focusProgressSyncPromise = null;
let focusRealtimeChannel = null;
let focusRealtimeRefreshTimer = null;
const pendingFocusSeconds = { linked: 0, quick: 0 };
const focusProgressEventQueue = [];
const pendingFarmFocusBatches = [];
let focusOutboxUserId = null;
let focusRecoveryTimerCheckpoint = null;
let activeFocus = null;
let currentPage = "today";
let taskGroupFilter = "all";
let taskArchiveView = false;
let habitCalendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let lastHabitHeatmapDate = "";
let selectedHabitDate = null;
let farmRealtimeChannel = null;
let farmContentRealtimeRefreshTimer = null;
let farmLeaderboard = [];
let farmLeaderboardStatus = "idle";

const taskForm = document.querySelector("#taskForm");
const taskInput = document.querySelector("#taskInput");
const taskGroup = document.querySelector("#taskGroup");
const customTaskGroupSelect = document.querySelector("#customTaskGroupSelect");
const taskGroupTrigger = document.querySelector("#taskGroupTrigger");
const taskGroupLabel = document.querySelector("#taskGroupLabel");
const taskGroupMenu = document.querySelector("#taskGroupMenu");
const taskModalTitle = document.querySelector("#taskCreateTitle");
const taskModalFocusRow = document.querySelector("#taskModalFocusRow");
const taskFocusMinutesInput = document.querySelector("#taskFocusMinutesInput");
const taskFormSubmit = document.querySelector("#taskFormSubmit");
const groupManager = document.querySelector("#groupManager");
const groupInput = document.querySelector("#groupInput");
const habitForm = document.querySelector("#habitForm");
const habitFocusMinutes = document.querySelector("#habitFocusMinutes");
const habitFocusEnabled = document.querySelector("#habitFocusEnabled");
const habitModal = document.querySelector("#habitModal");
const habitModalKicker = habitModal.querySelector(".section-kicker");
const habitModalTitle = document.querySelector("#habitModalTitle");
const habitModalDescription = habitModal.querySelector("header p");
const habitSubmitButton = habitForm.querySelector(".habit-submit");
const openHabitFormButton = document.querySelector("#openHabitForm");
const habitDeleteModal = document.querySelector("#habitDeleteModal");
const habitDeleteName = document.querySelector("#habitDeleteName");
const confirmHabitDelete = document.querySelector("#confirmHabitDelete");
const openHabitResetButton = document.querySelector("#openHabitReset");
const habitResetModal = document.querySelector("#habitResetModal");
const confirmHabitReset = document.querySelector("#confirmHabitReset");
const taskDeleteModal = document.querySelector("#taskDeleteModal");
const taskDeleteName = document.querySelector("#taskDeleteName");
const taskDeleteCoinAmount = document.querySelector("#taskDeleteCoinAmount");
const confirmTaskDelete = document.querySelector("#confirmTaskDelete");
const habitModalFormSlot = document.querySelector("#habitModalFormSlot");
const habitInput = document.querySelector("#habitInput");
const habitEndDate = document.querySelector("#habitEndDate");
const habitStartDate = document.querySelector("#habitStartDate");
const habitRecordEditsInFlight = new Set();
const toast = document.querySelector("#toast");
const miniFocusMusic = document.querySelector("#miniFocusMusic");
const miniFocusMusicTitle = document.querySelector("#miniFocusMusicTitle");
const miniFocusTimer = document.querySelector("#miniFocusTimer");
const miniFocusStatus = document.querySelector("#miniFocusStatus");
const miniFocusTitle = document.querySelector("#miniFocusTitle");
const miniFocusTime = document.querySelector("#miniFocusTime");
const miniFocusPause = document.querySelector("#miniFocusPause");
const focusFloatingStatus = miniFocusTimer.closest(".focus-floating-status");
let miniFocusMode = null;
let miniFocusDrag = null;
let suppressMiniFocusOpen = false;
let pendingHabitDeleteId = null;
let pendingTaskDeleteId = null;
let editingTaskId = null;
let editingTaskGroupId = null;
let editingTaskTitle = "";
let editingTaskFocusMinutes = "";
let editingHabitId = null;

function resetFarmDataDatabaseState() {
  farmSessionGeneration += 1;
  window.SceneryCreations?.reset();
  stopFarmRealtime();
  farmDataHydrated = false;
  farmDataUserId = null;
  farmContentRealtimeMutedUntil = 0;
  lastFarmRenderSignature = "";
  farmDataLoadRequest += 1;
  farmDataLoadPending = null;
  farmActionChain = Promise.resolve();
  state.legacySettlement = null;
  farmLeaderboard = [];
  farmLeaderboardStatus = "idle";
}

function captureFarmState() {
  return Object.fromEntries(
    FARM_STATE_KEYS.map((key) => [key, structuredClone(state[key])]),
  );
}

function restoreFarmState(snapshot) {
  FARM_STATE_KEYS.forEach((key) => {
    state[key] = structuredClone(snapshot[key]);
  });
}

function stopFarmRealtime() {
  if (farmContentRealtimeRefreshTimer) clearTimeout(farmContentRealtimeRefreshTimer);
  if (farmWalletRealtimeRefreshTimer) clearTimeout(farmWalletRealtimeRefreshTimer);
  farmContentRealtimeRefreshTimer = null;
  farmWalletRealtimeRefreshTimer = null;
  if (farmRealtimeChannel && supabaseClient) void supabaseClient.removeChannel(farmRealtimeChannel);
  farmRealtimeChannel = null;
}

function scheduleFarmContentRealtimeRefresh(userId) {
  if (activeAuthUser?.id !== userId) return;
  if (farmContentRealtimeRefreshTimer) clearTimeout(farmContentRealtimeRefreshTimer);
  farmContentRealtimeRefreshTimer = window.setTimeout(async () => {
    farmContentRealtimeRefreshTimer = null;
    if (activeAuthUser?.id !== userId) return;
    // Deliberately does NOT push local state first. Our own writes bump
    // farms.version, which comes straight back as a realtime event -- pushing
    // in response to that fed an endless save -> event -> save loop, and any
    // push racing a concurrent load reported FARM_STATE_STALE and spammed a
    // toast + reload. A remote change is a signal to READ, never to write.
    const farmUiVisible =
      ["farm", "today"].includes(currentPage) ||
      (currentPage === "focus" && document.querySelector("#toggleFocusFarmBackground")?.getAttribute("aria-pressed") === "true");
    if (farmUiVisible) await loadFarmDataFromDatabase(activeAuthUser);
  }, 500);
}

function scheduleFarmWalletRealtimeRefresh(user) {
  if (activeAuthUser?.id !== user.id) return;
  if (farmWalletRealtimeRefreshTimer) clearTimeout(farmWalletRealtimeRefreshTimer);
  farmWalletRealtimeRefreshTimer = window.setTimeout(async () => {
    farmWalletRealtimeRefreshTimer = null;
    if (activeAuthUser?.id !== user.id) return;
    const pendingChain = farmWalletMutationChain;
    await pendingChain;
    if (activeAuthUser?.id !== user.id) return;
    if (pendingChain !== farmWalletMutationChain) {
      scheduleFarmWalletRealtimeRefresh(user);
      return;
    }
    await loadFarmWallet(user, {
      background: true,
      expectedMutationVersion: farmWalletMutationVersion,
    });
  }, 180);
}

function startFarmRealtime(user) {
  stopFarmRealtime();
  if (!supabaseClient || !user) return;
  farmRealtimeChannel = subscribeToUserTables(
    supabaseClient.channel(`scenery:${user.id}`).on("postgres_changes", {
      event: "*", schema: "public", table: "farm_wallets", filter: `user_id=eq.${user.id}`,
    }, () => scheduleFarmWalletRealtimeRefresh(user)),
    ["farms", "farm_cosmetics", "farm_weekly_earnings", "farm_scenery_creations", "farm_scenery_unlocked_types"],
    user.id, () => {
      if (Date.now() >= farmContentRealtimeMutedUntil) scheduleFarmContentRealtimeRefresh(user.id);
    },
  );
  farmRealtimeChannel.subscribe(status => {
    if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) console.warn(`Farmodoro scenery realtime: ${status}`);
  });
}

function farmRenderSignatureState(snapshot = state) {
  return { farmName: snapshot.farmName, equippedFarmTheme: snapshot.equippedFarmTheme,
    ownedCosmetics: snapshot.ownedCosmetics, weeklyFarmMoneyEarned: snapshot.weeklyFarmMoneyEarned,
    legacySettlement: snapshot.legacySettlement };
}

function farmRenderSignature(snapshot = state) {
  return JSON.stringify(farmRenderSignatureState(snapshot));
}

// Shared by loadFarmDataFromDatabase (the full periodic/realtime reload)
// and applyFarmActionResult (the per-click intent-RPC result) so a full
// load and a single action's result can never disagree about how to turn
// server JSON into `state` shape.

async function loadFarmDataFromDatabase(user) {
  if (!supabaseClient || !user) return;
  if (farmDataLoadPending?.userId === user.id) return farmDataLoadPending.promise;
  const pending = { userId: user.id, promise: null };
  pending.promise = fetchFarmDataFromDatabase(user).finally(() => {
    if (farmDataLoadPending === pending) farmDataLoadPending = null;
  });
  farmDataLoadPending = pending;
  return pending.promise;
}

async function fetchFarmDataFromDatabase(user) {
  if (!supabaseClient || !user) return;
  const requestedUserId = user.id;
  const requestId = ++farmDataLoadRequest;
  const session = farmSessionGeneration;
  const previousSignature = farmDataUserId === requestedUserId && farmDataHydrated ? farmRenderSignature() : "";
  farmDataHydrated = farmDataUserId === requestedUserId && farmDataHydrated;
  farmDataUserId = requestedUserId;
  const actionChain = farmActionChain;
  await actionChain;
  const { data, error } = await supabaseClient.rpc("get_my_farm_state");
  const current = () => activeAuthUser?.id === requestedUserId && farmDataUserId === requestedUserId
    && requestId === farmDataLoadRequest && session === farmSessionGeneration && actionChain === farmActionChain;
  if (!current()) return;
  if (error) {
    console.error("Farmodoro scenery data could not be loaded", error);
    showToast("내 풍경을 불러오지 못했어. 잠시 후 다시 시도해줘.");
    return;
  }
  const farm = data?.farm ?? {};
  state.farmName = farm.farmName || defaultState.farmName;
  state.ownedCosmetics = (data?.ownedCosmetics ?? []).filter(entry => entry?.type === "farm_theme"
    && FARM_THEMES.some(theme => theme.id === entry.id));
  state.equippedFarmTheme = state.ownedCosmetics.some(entry => entry.id === farm.equippedFarmTheme) ? farm.equippedFarmTheme : null;
  state.farmRankingWeekStart = getFarmWeekStart();
  state.weeklyFarmMoneyEarned = Math.max(0, Number(data?.weeklyFarmMoneyEarned) || 0);
  state.legacySettlement = data?.legacySettlement?.version === 1 ? {
    version: 1, coinRefund: Math.max(0, Number(data.legacySettlement.coinRefund) || 0),
    farmMoneyRefund: Math.max(0, Number(data.legacySettlement.farmMoneyRefund) || 0),
    settledAt: String(data.legacySettlement.settledAt || ""),
    items: Array.isArray(data.legacySettlement.items) ? data.legacySettlement.items.map(item => ({
      category: String(item.category || ""), itemId: String(item.itemId || ""),
      quantity: Math.max(0, Number(item.quantity) || 0), currency: item.currency === "coin" ? "coin" : "farm_money",
      amount: Math.max(0, Number(item.amount) || 0),
    })) : [],
  } : null;
  farmDataHydrated = true;
  if (window.SceneryCreations) {
    await window.SceneryCreations.load(user);
    if (!current()) return;
  }
  const nextSignature = farmRenderSignature();
  lastFarmRenderSignature = nextSignature;
  if (previousSignature !== nextSignature) render();
  else renderFarm();
}

// Serialize scenery and theme mutations across the shared wallet.
let farmActionChain = Promise.resolve();

// Apply confirmed scenery and wallet changes from the server.
function applyFarmActionResult(result) {
  if (!result) return;
  if (result.scenery) window.SceneryCreations?.applyState(result.scenery);
  if (Number.isFinite(result.weeklyFarmMoneyEarned)) state.weeklyFarmMoneyEarned = result.weeklyFarmMoneyEarned;
  if (result.wallet) {
    farmWalletMutationVersion += 1;
    if (activeAuthUser && (result.wallet.coinBalance != null || result.wallet.farmMoneyBalance != null)) {
      farmWalletHydrated = true;
      farmWalletUserId = activeAuthUser.id;
    }
    if (result.wallet.coinBalance !== undefined && result.wallet.coinBalance !== null) {
      state.coins = Number(result.wallet.coinBalance);
    }
    if (result.wallet.farmMoneyBalance !== undefined && result.wallet.farmMoneyBalance !== null) {
      state.farmMoney = Number(result.wallet.farmMoneyBalance);
    }
  }
}

function loadState(savedState = null) {
  // Retired placement requests must not remain queued in this browser.
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("farmodoro-garden-pending:")) localStorage.removeItem(key);
    }
  } catch (_) { /* Restricted storage does not prevent loading the farm. */ }
  try {
    const saved = savedState && typeof savedState === "object" ? savedState : null;
    if (!saved) return structuredClone(defaultState);
    const allowedSaved = Object.fromEntries(Object.keys(defaultState)
      .filter(key => Object.hasOwn(saved, key)).map(key => [key, saved[key]]));
    const migratedCoins = Number(saved.coins ?? 0);
    const migratedFarmMoney = Number(saved.farmMoney ?? 0);
    const savedOwnedCosmetics = Array.isArray(saved.ownedCosmetics) ? saved.ownedCosmetics.filter(entry => entry?.type === "farm_theme" && FARM_THEMES.some(theme => theme.id === entry.id)) : [];
    const savedOwnedKeys = new Set(
      savedOwnedCosmetics.map((entry) => `${entry?.type}:${entry?.id}`),
    );
    const savedEquipped = (type, id) => (id && savedOwnedKeys.has(`${type}:${id}`) ? id : null);

    return {
      ...structuredClone(defaultState),
      ...allowedSaved,
      schemaVersion: 47,
      coins: migratedCoins,
      farmMoney: migratedFarmMoney,
      farmRankingWeekStart: saved.farmRankingWeekStart ?? "",
      weeklyFarmMoneyEarned: Number(saved.weeklyFarmMoneyEarned ?? 0),
      farmName: saved.farmName ?? defaultState.farmName,
      ownedCosmetics: savedOwnedCosmetics,
      equippedFarmTheme: savedEquipped("farm_theme", saved.equippedFarmTheme),
      legacySettlement: null,
      settings: normalizeFocusSettings(saved.settings),
      groups: (saved.groups ?? structuredClone(defaultState.groups)).map((group) => ({
        ...group,
        colorIndex: Number.isInteger(group.colorIndex)
          ? group.colorIndex % GROUP_COLOR_COUNT
          : getStableGroupColorIndex(group.id ?? group.name),
      })),
      tasks: (saved.tasks ?? []).map((task) => ({
        ...task,
        groupId: task.groupId ?? null,
        focusSeconds: task.focusSeconds ?? 0,
        archived: task.archived ?? false,
        archivedAt: task.archivedAt ?? "",
        completionCycleId: task.completionCycleId ?? "",
        completedDate:
          task.completedDate ??
          (task.status === "done" && !task.archived ? toProductivityDateString() : ""),
      })),
      habits: (saved.habits ?? []).map((habit) => ({
        ...habit,
        focusSecondsByDate: habit.focusSecondsByDate ?? {},
        measureType: habit.measureType ?? "count",
        targetValue: habit.targetValue ?? 1,
        targetByWeekday: habit.targetByWeekday ?? {},
        unit: habit.unit ?? "회",
        weekdays: habit.weekdays ?? [1, 2, 3, 4, 5, 6, 7],
        startDate: habit.startDate ?? "",
        endDate: habit.endDate ?? "",
      })),
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  scheduleTaskDatabaseSync();
}

function resetAppStateDatabaseState() {
  stopAppStateRealtime();
  appStateHydrated = false;
  appStateUserId = null;
  appStateRealtimeMutedUntil = 0;
}

function applyLoadedAppStateRuntime(isInitialLoad = true) {
  ensureWeeklyFarmRanking();

  if (typeof focusRuntimeByMode === "undefined") return;
  // A realtime/resume refresh mid-session must not stomp on a focus timer
  // that's actively counting down -- that state is owned separately by
  // user_focus_timer and kept in sync on its own channel. Only reset the
  // runtime to a fresh, idle timer on the one true cold-start load.
  //
  // isInitialLoad alone isn't a reliable enough guard: onAuthStateChange
  // re-runs applyAuthSession() for every auth event (not just sign-in), and
  // a long background/suspend can make a reconnect-driven re-fire look like
  // a fresh sign-in to that caller, defaulting isInitialLoad back to true
  // even though a timer is already running this session. runningFocusMode
  // is still null on a genuine cold start (loadFocusTimerFromDatabase runs
  // after this), so checking it too costs nothing on the real cold path.
  if (isInitialLoad && !runningFocusMode) {
    focusRuntimeByMode.linked = {
      seconds: 0,
      phase: "focus",
      started: false,
    };
    focusRuntimeByMode.quick = {
      seconds: state.settings.quick.focusMinutes * 60,
      phase: "focus",
      started: false,
      sessionMinutes: state.settings.quick.focusMinutes,
    };
    focusSeconds = 0;
    focusRunning = false;
    focusSessionStarted = false;
    runningFocusMode = null;
    timerPhase = "focus";
    resetToFocus();
  }
  syncFocusSettingsForm();
}

// Settings live in their own row (migration 050), so this only ever reads --
// every mutation goes out immediately through its own dedicated RPC at the
// moment the user does it. There is nothing left to debounce or flush.
async function loadUserPreferences(user, { isInitialLoad = true } = {}) {
  if (!supabaseClient || !user) return;
  const requestedUserId = user.id;
  appStateHydrated = false;
  appStateUserId = requestedUserId;

  const { data, error } = await supabaseClient.rpc("get_my_preferences");

  if (activeAuthUser?.id !== requestedUserId || appStateUserId !== requestedUserId) return;
  const productivityState = {
    groups: state.groups,
    tasks: state.tasks,
    habits: state.habits,
  };
  const farmState = captureFarmState();
  // Coin/Farm Money live in farm_wallets, not this blob -- loadState()
  // below would otherwise reset them to the fresh-state default of 0,
  // clobbering whatever loadFarmWallet/realtime already applied. Carry the
  // in-memory value across the state replacement instead of zeroing it.
  const previousCoins = state.coins;
  const previousFarmMoney = state.farmMoney;
  if (error) {
    console.error("Farmodoro preferences could not be loaded", error);
    if (isInitialLoad) showToast("설정을 불러오지 못했어. 잠시 후 다시 시도해줘");
    return;
  }

  state = loadState({ settings: data?.settings });
  state.coins = previousCoins;
  state.farmMoney = previousFarmMoney;
  restoreFarmState(farmState);
  state.groups = productivityState.groups;
  state.tasks = productivityState.tasks;
  state.habits = productivityState.habits;

  applyLoadedAppStateRuntime(isInitialLoad);
  appStateHydrated = true;
  if (isInitialLoad) render();
}

function stopAppStateRealtime() {
  if (appStateRealtimeRefreshTimer) clearTimeout(appStateRealtimeRefreshTimer);
  appStateRealtimeRefreshTimer = null;
  if (appStateRealtimeChannel && supabaseClient) {
    void supabaseClient.removeChannel(appStateRealtimeChannel);
  }
  appStateRealtimeChannel = null;
}

function scheduleAppStateRealtimeRefresh(userId) {
  if (activeAuthUser?.id !== userId) return;
  if (appStateRealtimeRefreshTimer) clearTimeout(appStateRealtimeRefreshTimer);
  appStateRealtimeRefreshTimer = window.setTimeout(async () => {
    appStateRealtimeRefreshTimer = null;
    if (activeAuthUser?.id !== userId) return;
    try {
      await loadUserPreferences(activeAuthUser, { isInitialLoad: false });
    } catch (error) {
      console.warn("Farmodoro realtime preferences refresh failed", error);
    }
  }, 500);
}

function startAppStateRealtime(user) {
  stopAppStateRealtime();
  if (!supabaseClient || !user) return;
  appStateRealtimeChannel = subscribeToUserTables(
    supabaseClient.channel(`app-state:${user.id}`),
    ["user_preferences"],
    user.id,
    () => {
      if (Date.now() < appStateRealtimeMutedUntil) return;
      scheduleAppStateRealtimeRefresh(user.id);
    },
  ).subscribe((status) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      console.warn(`Farmodoro app state realtime subscription: ${status}`);
    }
  });
}

// Shared by every preferences-writing action below: mutes our own echo of
// the write we're about to make (mirrors productivityRealtimeMutedUntil /
// farmContentRealtimeMutedUntil), then calls the RPC.
async function callPreferencesRpc(rpcName, params) {
  appStateRealtimeMutedUntil = Math.max(appStateRealtimeMutedUntil, Date.now() + 3000);
  return supabaseClient.rpc(rpcName, params);
}

async function saveMyFocusSettings(mode, focusMinutes, breakEnabled, breakMinutes) {
  const { data, error } = await callPreferencesRpc("save_my_focus_settings", {
    p_mode: mode,
    p_focus_minutes: focusMinutes,
    p_break_enabled: breakEnabled,
    p_break_minutes: breakMinutes,
  });
  if (error) throw error;
  return data;
}

function isFocusTimerOwner() {
  return focusTimerOwnerId === FOCUS_TIMER_CLIENT_ID;
}

function resetFocusTimerDatabaseState() {
  focusTimerStateGeneration += 1;
  stopFocusRealtime();
  focusModeUserSelected = false;
  focusTimerDatabaseHydrated = false;
  focusTimerDatabaseUnavailable = false;
  focusTimerLastUpdatedAt = "";
  focusTimerOwnerId = "";
  focusTimerLastHeartbeatAt = 0;
  if (focusTimerSyncTimer) clearTimeout(focusTimerSyncTimer);
  if (focusTimerPollInterval) clearInterval(focusTimerPollInterval);
  focusTimerSyncTimer = null;
  focusTimerPollInterval = null;
  resetFocusProgressState();
}

function stopFocusRealtime() {
  if (focusRealtimeRefreshTimer) clearTimeout(focusRealtimeRefreshTimer);
  focusRealtimeRefreshTimer = null;
  if (focusRealtimeChannel && supabaseClient) {
    void supabaseClient.removeChannel(focusRealtimeChannel);
  }
  focusRealtimeChannel = null;
}

function startFocusRealtime(user) {
  stopFocusRealtime();
  if (!supabaseClient || !user) return;
  const refreshTimer = () => {
    if (focusRealtimeRefreshTimer) clearTimeout(focusRealtimeRefreshTimer);
    focusRealtimeRefreshTimer = window.setTimeout(() => {
      focusRealtimeRefreshTimer = null;
      if (activeAuthUser?.id === user.id) void pollFocusTimerFromDatabase();
    }, 150);
  };
  const refreshFocusProgress = () => {
    if (activeAuthUser?.id !== user.id) return;
    void Promise.resolve(focusProgressSyncPromise)
      .then(() => loadFocusProgress(user));
  };
  focusRealtimeChannel = subscribeToUserTables(
    supabaseClient.channel(`focus:${user.id}`),
    ["user_focus_timer"],
    user.id,
    refreshTimer,
  );
  focusRealtimeChannel = subscribeToUserTables(
    focusRealtimeChannel,
    ["user_focus_progress"],
    user.id,
    refreshFocusProgress,
  );
  focusRealtimeChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") refreshTimer();
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn(`Farmodoro focus realtime subscription: ${status}`);
      }
    });
}

function getFocusTimerDatabasePayload() {
  const item = activeFocus ? getFocusItem() : null;
  return {
    version: 1,
    ownerId: runningFocusMode ? focusTimerOwnerId : "",
    runningMode: runningFocusMode,
    focusMode,
    activeFocus: activeFocus ? { ...activeFocus } : null,
    focusItemProgress: item && activeFocus?.type === "task"
      ? { type: "task", id: item.id, seconds: Math.max(0, Number(item.focusSeconds) || 0) }
      : item && activeFocus?.type === "habit"
      ? { type: "habit", id: item.id, secondsByDate: { ...item.focusSecondsByDate } }
      : null,
    rewardSeconds: Math.max(0, Math.floor(Number(state.focusRewardSeconds) || 0)),
    runtimes: {
      linked: { ...focusRuntimeByMode.linked },
      quick: { ...focusRuntimeByMode.quick },
    },
    syncedAt: new Date(runningFocusMode && focusLastTickAt ? focusLastTickAt : Date.now()).toISOString(),
  };
}

function normalizeFocusTimerRuntime(value, fallback) {
  const seconds = Math.max(0, Math.floor(Number(value?.seconds ?? fallback.seconds)));
  return {
    seconds,
    date: typeof value?.date === "string" ? value.date : "",
    carryOver: Boolean(value?.carryOver),
    phase: value?.phase === "break" ? "break" : "focus",
    started: Boolean(value?.started),
    countdown: Boolean(value?.countdown),
    overtime: Boolean(value?.overtime),
    overtimeSeconds: Math.max(0, Math.floor(Number(value?.overtimeSeconds) || 0)),
    sessionMinutes: Math.max(
      1,
      Math.floor(
        Number(value?.sessionMinutes) ||
          (value?.seconds != null ? Math.ceil(seconds / 60) : Number(fallback.sessionMinutes)) ||
          1,
      ),
    ),
  };
}

function applyFocusTimerDatabaseState(payload, updatedAt = "") {
  if (!payload || Number(payload.version) !== 1) return;
  payload = resolveFocusTimerRecoveryPayload(payload);
  focusTimerStateGeneration += 1;
  clearInterval(focusInterval);
  focusInterval = null;

  focusRuntimeByMode.linked = normalizeFocusTimerRuntime(
    payload.runtimes?.linked,
    { seconds: 0, phase: "focus", started: false },
  );
  focusRuntimeByMode.quick = normalizeFocusTimerRuntime(
    payload.runtimes?.quick,
    { seconds: state.settings.quick.focusMinutes * 60, phase: "focus", started: false, sessionMinutes: state.settings.quick.focusMinutes },
  );
  const savedQuickMinutes = focusRuntimeByMode.quick.sessionMinutes;
  const configuredQuickMinutes = getFocusSettings("quick").focusMinutes;
  const staleQuickRuntime = !focusRuntimeByMode.quick.started && savedQuickMinutes !== configuredQuickMinutes;
  if (staleQuickRuntime) {
    focusRuntimeByMode.quick = {
      seconds: configuredQuickMinutes * 60,
      phase: "focus",
      started: false,
      sessionMinutes: configuredQuickMinutes,
    };
  }
  activeFocus = payload.activeFocus?.type && payload.activeFocus?.id
    ? { type: payload.activeFocus.type, id: payload.activeFocus.id }
    : null;
  if (!focusModeUserSelected) {
    focusMode = ["linked", "quick"].includes(payload.focusMode) ? payload.focusMode : "linked";
  }
  runningFocusMode = ["linked", "quick"].includes(payload.runningMode)
    ? payload.runningMode
    : null;
  if (staleQuickRuntime && runningFocusMode === "quick") runningFocusMode = null;
  focusTimerOwnerId = runningFocusMode ? String(payload.ownerId || "") : "";
  if (isFocusTimerOwner() && payload.focusItemProgress?.id === activeFocus?.id) {
    const item = getFocusItem();
    const progress = payload.focusItemProgress;
    if (item && activeFocus.type === "task" && progress.type === "task") {
      item.focusSeconds = Math.max(Number(item.focusSeconds) || 0, Number(progress.seconds) || 0);
    } else if (item && activeFocus.type === "habit" && progress.type === "habit") {
      item.focusSecondsByDate ??= {};
      for (const [date, seconds] of Object.entries(progress.secondsByDate ?? {})) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          item.focusSecondsByDate[date] = Math.max(Number(item.focusSecondsByDate[date]) || 0, Number(seconds) || 0);
        }
      }
    }
  }
  if (runningFocusMode) {
    const runtime = focusRuntimeByMode[runningFocusMode];
    const ownsTimer = isFocusTimerOwner();
    const syncedAt = Date.parse(payload.syncedAt || updatedAt || "");
    const elapsedSeconds = Number.isFinite(syncedAt)
      ? Math.max(0, Math.floor((Date.now() - syncedAt) / 1000))
      : 0;
    const item = runningFocusMode === "linked" ? getFocusItem() : null;
    const isLinkedStopwatch = runningFocusMode === "linked" && Boolean(activeFocus) && !runtime.countdown;
    const quickFocus = runningFocusMode === "quick" && runtime.phase === "focus";
    const habitCountdown = item && activeFocus?.type === "habit" && runtime.countdown;
    runtime.date ||= toProductivityDateString(new Date(Number.isFinite(syncedAt) ? syncedAt : Date.now()));
    const appliedSeconds = habitCountdown
      ? advanceHabitTimer(runtime, item, Number.isFinite(syncedAt) ? syncedAt : Date.now(), elapsedSeconds, ownsTimer)
      : isLinkedStopwatch || quickFocus
      ? elapsedSeconds
      : Math.min(elapsedSeconds, runtime.seconds);
    if (quickFocus && (runtime.overtime || appliedSeconds >= runtime.seconds)) {
      runtime.overtimeSeconds += runtime.overtime ? appliedSeconds : appliedSeconds - runtime.seconds;
      runtime.overtime = true;
      runtime.seconds = 0;
    } else if (!habitCountdown) {
      runtime.seconds = isLinkedStopwatch
        ? runtime.seconds + appliedSeconds
        : Math.max(0, runtime.seconds - appliedSeconds);
    }

    let recoveredFocusSeconds = 0;
    if (ownsTimer && runtime.phase === "focus" && appliedSeconds > 0) {
      if (item && activeFocus?.type === "task") {
        const savedTaskSeconds = Math.max(0, Math.floor(Number(item.focusSeconds) || 0));
        item.focusSeconds = Math.max(savedTaskSeconds, runtime.seconds);
        recoveredFocusSeconds = appliedSeconds;
      } else if (item && activeFocus?.type === "habit") {
        if (habitCountdown) {
          recoveredFocusSeconds = appliedSeconds;
        } else {
          const today = toProductivityDateString();
          const previousFocusSeconds = getHabitDailyFocusSeconds(item, today);
          item.focusSecondsByDate ??= {};
          item.focusSecondsByDate[today] = previousFocusSeconds + appliedSeconds;
          recoveredFocusSeconds = item.focusSecondsByDate[today] - previousFocusSeconds;
        }
      } else {
        recoveredFocusSeconds = appliedSeconds;
      }

      if (recoveredFocusSeconds > 0) {
        focusLastTickAt = Number.isFinite(syncedAt) ? syncedAt + elapsedSeconds * 1000 : Date.now();
        addFocusSecond(recoveredFocusSeconds, runningFocusMode);
        scheduleTaskDatabaseSync(0);
        void flushFocusTime();
      }
    }
    focusLastTickAt = Number.isFinite(syncedAt) ? syncedAt + elapsedSeconds * 1000 : Date.now();
    if (habitCountdown && ownsTimer && runtime.seconds > 0 &&
        runtime.date !== toProductivityDateString(new Date(Number.isFinite(syncedAt) ? syncedAt : Date.now()))) {
      scheduleFarmPushNotification("timer_end", "", Date.now() + runtime.seconds * 1000,
        "집중이 끝났어", "쉬고 싶으면 앱을 열어줘");
    }
    startFocusTickInterval(runningFocusMode);
  } else {
    focusLastTickAt = 0;
    const item = getFocusItem();
    if (item && activeFocus?.type === "habit") {
      refreshHabitTimerDate(focusRuntimeByMode.linked, item);
    }
  }

  if (isFocusTimerOwner() && activeFocus?.type === "task") {
    const task = getFocusItem();
    const recoveredSeconds = focusRuntimeByMode.linked.seconds;
    const savedTaskSeconds = Math.max(0, Math.floor(Number(task?.focusSeconds) || 0));
    if (task && recoveredSeconds > savedTaskSeconds) {
      task.focusSeconds = recoveredSeconds;
      scheduleTaskDatabaseSync(0);
    }
  }

  const visibleRuntime = focusRuntimeByMode[focusMode];
  timerPhase = visibleRuntime.phase;
  focusSeconds = visibleRuntime.seconds;
  focusSessionStarted = visibleRuntime.started;
  focusRunning = runningFocusMode === focusMode;
  focusTimerLastUpdatedAt = updatedAt || focusTimerLastUpdatedAt;
  document.querySelectorAll("[data-focus-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.focusMode === focusMode);
  });
  focusSettingsButton.hidden = focusMode === "linked";
  if (focusMode === "linked") {
    closeFocusSettings();
  }
  renderFocusPicker();
  updateFocusActionButton();
  updateFocusDisplay();
  updateFocusTarget();
  updateMiniFocusTimer();
  renderSummary();
}

function handleFocusTimerDatabaseError(error) {
  if (["42P01", "PGRST205"].includes(error?.code)) {
    if (!focusTimerDatabaseUnavailable) {
      console.warn("Farmodoro: 021 migration not applied (user_focus_timer missing)", error);
      showToast("기기 간 타이머 동기화를 쓸 수 없어. 이 기기에서는 계속 사용할 수 있어");
    }
    focusTimerDatabaseUnavailable = true;
    return;
  }
  console.error("Farmodoro focus timer could not be synchronized", error);
}

async function loadFocusTimerFromDatabase(user) {
  if (!supabaseClient || !user) return;
  const requestedUserId = user.id;
  const { data, error } = await supabaseClient
    .from("user_focus_timer")
    .select("state, updated_at")
    .eq("user_id", requestedUserId)
    .maybeSingle();
  if (activeAuthUser?.id !== requestedUserId) return;
  if (error) {
    handleFocusTimerDatabaseError(error);
    focusTimerDatabaseHydrated = true;
    return;
  }
  focusTimerDatabaseHydrated = true;
  focusTimerDatabaseUnavailable = false;
  if (data?.state) applyFocusTimerDatabaseState(data.state, data.updated_at);
  if (focusTimerPollInterval) clearInterval(focusTimerPollInterval);
  focusTimerPollInterval = window.setInterval(() => {
    void pollFocusTimerFromDatabase();
  }, 30000);
}

async function pollFocusTimerFromDatabase() {
  if (
    !supabaseClient ||
    !activeAuthUser ||
    !focusTimerDatabaseHydrated ||
    focusTimerDatabaseUnavailable || focusTimerWritesPending || focusTimerSyncTimer
  ) return;
  const userId = activeAuthUser.id;
  const { data, error } = await supabaseClient
    .from("user_focus_timer")
    .select("state, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (activeAuthUser?.id !== userId) return;
  if (error) {
    handleFocusTimerDatabaseError(error);
    return;
  }
  if (focusTimerWritesPending || focusTimerSyncTimer) return;
  if (!data?.state || !data.updated_at || data.updated_at <= focusTimerLastUpdatedAt) return;
  applyFocusTimerDatabaseState(data.state, data.updated_at);
}

async function syncFocusTimerDatabaseImmediately() {
  if (focusTimerSyncTimer) clearTimeout(focusTimerSyncTimer);
  focusTimerSyncTimer = null;
  const userId = activeAuthUser?.id;
  const payload = getFocusTimerDatabasePayload();
  const generation = focusTimerStateGeneration;
  focusTimerWritesPending += 1;
  const operation = focusTimerWriteChain.then(() => {
    if (generation !== focusTimerStateGeneration) return;
    return writeFocusTimerDatabase(userId, payload);
  });
  focusTimerWriteChain = operation.catch(() => {});
  try {
    await operation;
  } finally {
    focusTimerWritesPending -= 1;
  }
}

async function writeFocusTimerDatabase(userId, payload) {
  if (
    !supabaseClient ||
    !activeAuthUser || activeAuthUser.id !== userId ||
    !focusTimerDatabaseHydrated ||
    focusTimerDatabaseUnavailable
  ) return;
  const table = supabaseClient.from("user_focus_timer");
  const query = focusTimerLastUpdatedAt
    ? table.update({ state: payload }).eq("user_id", userId).eq("updated_at", focusTimerLastUpdatedAt)
    : table.insert({ user_id: userId, state: payload });
  const { data, error } = await query.select("updated_at").maybeSingle();
  if (activeAuthUser?.id !== userId) return;
  if ((!error && !data) || error?.code === "23505") {
    await loadFocusTimerFromDatabase(activeAuthUser);
    return;
  }
  if (error) {
    handleFocusTimerDatabaseError(error);
    return;
  }
  focusTimerLastUpdatedAt = data?.updated_at || focusTimerLastUpdatedAt;
}

function scheduleFocusTimerDatabaseSync(delay = 300) {
  persistFocusTimerCheckpoint();
  if (
    !focusTimerDatabaseHydrated ||
    focusTimerDatabaseUnavailable ||
    !activeAuthUser
  ) return;
  if (focusTimerSyncTimer) {
    if (delay > 0) return;
    clearTimeout(focusTimerSyncTimer);
  }
  focusTimerSyncTimer = window.setTimeout(() => {
    focusTimerSyncTimer = null;
    void syncFocusTimerDatabaseImmediately().catch((error) => {
      console.error("Farmodoro focus timer could not be synchronized", error);
    });
  }, delay);
}

function createUuid() {
  return crypto.randomUUID();
}

function resetTaskDatabaseState() {
  stopProductivityRealtime();
  productivityRealtimeMutedUntil = 0;
  taskDataHydrated = false;
  taskDataUserId = null;
  taskDataLoadPromise = null;
  lastTaskSyncSignature = "";
  habitRecordSyncSignatures = new Map();
  if (taskSyncTimer) clearTimeout(taskSyncTimer);
  taskSyncTimer = null;
  taskStatusSyncChains.clear();
  pendingTaskDatabaseDeletes.clear();
  pendingHabitDatabaseDeletes.clear();
  pendingGroupDatabaseDeletes.clear();
}

function serializeTaskDatabaseState() {
  const habitRecords = state.habits.flatMap((habit) => {
    const recordDates = new Set([
      ...(habit.completionDates ?? []),
      ...Object.keys(habit.progressByDate ?? {}),
      ...Object.keys(habit.focusSecondsByDate ?? {}),
      ...Object.keys(habit.recordMetaByDate ?? {}),
    ]);
    return [...recordDates].map((recordDate) => {
      const targetValue = getHabitTargetForDate(habit, recordDate);
      const progressValue = habit.completionDates.includes(recordDate) ? targetValue : 0;
      const completed = habit.completionDates.includes(recordDate);
      const recordMeta = habit.recordMetaByDate?.[recordDate] ?? {};
      const isToday = recordDate === toProductivityDateString();
      return {
        habit_id: habit.id,
        record_date: recordDate,
        progress_value: progressValue,
        focus_seconds: Math.max(
          0,
          Math.floor(Number(habit.focusSecondsByDate?.[recordDate] ?? 0)),
        ),
        completed_at: completed
          ? recordMeta.completedAt || `${recordDate}T12:00:00+09:00`
          : null,
        completion_reward: completed
          ? Math.max(
              0,
              Math.floor(isToday ? habit.completionReward ?? 0 : recordMeta.completionReward ?? 0),
            )
          : 0,
        completed_with_free_pass: completed
          ? Boolean(
              isToday
                ? habit.completedWithFreePass
                : recordMeta.completedWithFreePass,
            )
          : false,
        completion_cycle_id: completed ? recordMeta.completionCycleId || null : null,
      };
    });
  });

  return JSON.stringify({
    groups: state.groups.map((group, sortOrder) => ({
      id: group.id,
      name: group.name,
      color_index: group.colorIndex,
      sort_order: sortOrder,
    })),
    tasks: state.tasks.map((task, sortOrder) => ({
      id: task.id,
      group_id: task.groupId || null,
      title: task.title,
      status: task.status,
      sort_order: sortOrder,
      focus_seconds: Math.max(0, Math.floor(task.focusSeconds ?? 0)),
      completion_reward: Math.max(0, Math.floor(task.completionReward ?? 0)),
      completed_with_free_pass: Boolean(task.completedWithFreePass),
      completed_on: task.completedDate || null,
      completion_cycle_id: task.completionCycleId || null,
      archived_at: task.archivedAt || null,
    })),
    habits: state.habits.map((habit, sortOrder) => ({
      id: habit.id,
      title: habit.title,
      measure_type: habit.measureType ?? "amount",
      target_value: habit.targetValue ?? 1,
      target_by_weekday: habit.targetByWeekday ?? {},
      unit: habit.unit ?? "완료",
      weekdays: habit.weekdays,
      start_date: habit.startDate || null,
      end_date: habit.endDate || null,
      sort_order: sortOrder,
    })),
    habitRecords,
  });
}

function serializeTaskRenderSignature() {
  const snapshot = JSON.parse(serializeTaskDatabaseState());
  snapshot.tasks.forEach((task) => delete task.focus_seconds);
  snapshot.habitRecords = snapshot.habitRecords
    .map((record) => {
      delete record.focus_seconds;
      return record;
    })
    .filter(
      (record) =>
        Number(record.progress_value) > 0 ||
        Boolean(record.completed_at) ||
        Number(record.completion_reward) > 0 ||
        Boolean(record.completed_with_free_pass),
    );
  return JSON.stringify(snapshot);
}

function mapDatabaseTaskGroup(group) {
  return {
    id: group.id,
    name: group.name,
    colorIndex: group.color_index,
  };
}

function mapDatabaseTask(task) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    focusSeconds: task.focus_seconds,
    groupId: task.group_id,
    completionReward: task.completion_reward,
    completedWithFreePass: task.completed_with_free_pass,
    completedDate: task.completed_on || "",
    completionCycleId: task.completion_cycle_id || "",
    archived: Boolean(task.archived_at),
    archivedAt: task.archived_at || "",
  };
}

function mapDatabaseHabit(habit, records) {
  const completionDates = records
    .filter((record) => record.completed_at)
    .map((record) => record.record_date);
  const progressByDate = Object.fromEntries(
    records.map((record) => [record.record_date, Number(record.progress_value)]),
  );
  const focusSecondsByDate = Object.fromEntries(
    records.map((record) => [record.record_date, Number(record.focus_seconds ?? 0)]),
  );
  const recordMetaByDate = Object.fromEntries(
    records.map((record) => [
      record.record_date,
      {
        completedAt: record.completed_at,
        completionReward: record.completion_reward,
        completedWithFreePass: record.completed_with_free_pass,
        completionCycleId: record.completion_cycle_id || null,
      },
    ]),
  );
  const today = toProductivityDateString();
  const todayRecord = records.find((record) => record.record_date === today);

  return {
    id: habit.id,
    title: habit.title,
    complete: completionDates.includes(today),
    completedDate: completionDates.includes(today) ? today : "",
    completionDates,
    progressByDate,
    focusSecondsByDate,
    recordMetaByDate,
    measureType: habit.measure_type,
    targetValue: Number(habit.target_value),
    targetByWeekday:
      habit.target_by_weekday && typeof habit.target_by_weekday === "object"
        ? Object.fromEntries(
            Object.entries(habit.target_by_weekday)
              .map(([day, value]) => [day, Number(value)])
              .filter(([day, value]) => /^[1-7]$/.test(day) && Number.isInteger(value) && value > 0),
          )
        : {},
    unit: habit.unit,
    weekdays: habit.weekdays.map(Number),
    startDate:
      habit.start_date ||
      (habit.created_at
        ? new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Seoul",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(habit.created_at))
        : ""),
    endDate: habit.end_date || "",
    completionReward: todayRecord?.completion_reward ?? 0,
    completedWithFreePass: Boolean(todayRecord?.completed_with_free_pass),
  };
}

async function loadTaskDataFromDatabase(user, { force = false } = {}) {
  if (!supabaseClient || !user) return;
  if (taskDataUserId === user.id && taskDataHydrated && !force) return;
  if (taskDataUserId === user.id && taskDataLoadPromise) return taskDataLoadPromise;

  const hadCurrentData = taskDataUserId === user.id && taskDataHydrated;
  if (hadCurrentData) await taskSyncChain;
  if (hadCurrentData && serializeTaskDatabaseState() !== lastTaskSyncSignature) {
    try {
      await syncTaskDatabaseImmediately();
    } catch (error) {
      console.error("Farmodoro pending changes could not be saved", error);
      showToast("변경 내용을 아직 저장하지 못했어. 연결되면 다시 시도할게");
      scheduleTaskDatabaseSync(5000);
      return;
    }
    if (activeAuthUser?.id !== user.id) return;
    if (serializeTaskDatabaseState() !== lastTaskSyncSignature) return;
  }
  if (taskDataUserId === user.id && taskDataLoadPromise) return taskDataLoadPromise;
  const requestSignature = serializeTaskDatabaseState();
  const requestSyncChain = taskSyncChain;
  const previousRenderSignature = hadCurrentData ? serializeTaskRenderSignature() : "";
  const liveFocusItem = runningFocusMode === "linked" && isFocusTimerOwner()
    ? getFocusItem()
    : null;
  const liveFocusSnapshot = liveFocusItem && activeFocus
    ? {
        type: activeFocus.type,
        id: liveFocusItem.id,
        taskSeconds: Number(liveFocusItem.focusSeconds ?? 0),
        habitDate: focusRuntimeByMode.linked.date || toProductivityDateString(),
        habitSeconds: getHabitDailyFocusSeconds(liveFocusItem, focusRuntimeByMode.linked.date || undefined),
      }
    : null;
  taskDataUserId = user.id;
  taskDataHydrated = hadCurrentData;
  const requestedUserId = user.id;

  taskDataLoadPromise = (async () => {
    const { data, error } = await supabaseClient.rpc("get_my_productivity_state");
    if (error) throw error;
    const groupRows = Array.isArray(data?.groups) ? data.groups : [];
    const taskRows = Array.isArray(data?.tasks) ? data.tasks : [];
    const habitRows = Array.isArray(data?.habits) ? data.habits : [];
    const habitRecordRows = Array.isArray(data?.habitRecords) ? data.habitRecords : [];
    if (activeAuthUser?.id !== requestedUserId || taskDataUserId !== requestedUserId) return;
    if (hadCurrentData && (requestSignature !== serializeTaskDatabaseState() || requestSyncChain !== taskSyncChain)) {
      scheduleProductivityRealtimeRefresh(requestedUserId);
      return;
    }

    state.groups = groupRows.map(mapDatabaseTaskGroup);
    state.tasks = taskRows.map(mapDatabaseTask);
    state.habits = habitRows.map((habit) =>
      mapDatabaseHabit(
        habit,
        habitRecordRows.filter((record) => record.habit_id === habit.id),
      ),
    );
    if (liveFocusSnapshot?.type === "task") {
      const task = state.tasks.find((item) => item.id === liveFocusSnapshot.id);
      if (task) task.focusSeconds = Math.max(task.focusSeconds, liveFocusSnapshot.taskSeconds);
    } else if (liveFocusSnapshot?.type === "habit") {
      const habit = state.habits.find((item) => item.id === liveFocusSnapshot.id);
      if (habit) {
        const today = liveFocusSnapshot.habitDate;
        habit.focusSecondsByDate[today] = Math.max(
          getHabitDailyFocusSeconds(habit, today),
          liveFocusSnapshot.habitSeconds,
        );
      }
    }
    if (!hadCurrentData) {
      taskGroupFilter = "all";
    }
    if (
      activeFocus?.type === "task" &&
      !state.tasks.some((task) => String(task.id) === String(activeFocus.id))
    ) {
      activeFocus = null;
    }
    taskDataHydrated = true;
    const nextSignature = serializeTaskDatabaseState();
    const nextRenderSignature = serializeTaskRenderSignature();
    lastTaskSyncSignature = nextSignature;
    habitRecordSyncSignatures = new Map(
      JSON.parse(nextSignature).habitRecords.map((record) => [
        `${record.habit_id}:${record.record_date}`,
        JSON.stringify(record),
      ]),
    );
    if (nextRenderSignature !== previousRenderSignature) render();
    else updateProductivityFocusLabels();
  })()
    .catch((error) => {
      console.error("Farmodoro task data could not be loaded", error);
      if (activeAuthUser?.id === requestedUserId) {
        showToast("할 일과 습관 데이터를 불러오지 못했어. 잠시 후 다시 시도해줘");
      }
    })
    .finally(() => {
      if (taskDataUserId === requestedUserId) taskDataLoadPromise = null;
    });

  return taskDataLoadPromise;
}

function scheduleTaskDatabaseSync(delay = 300) {
  if (!taskDataHydrated || !activeAuthUser || activeAuthUser.id !== taskDataUserId) return;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const hasInvalidId =
    state.groups.some((group) => !uuidPattern.test(String(group.id))) ||
    state.tasks.some(
      (task) =>
        !uuidPattern.test(String(task.id)) ||
        (task.groupId && !uuidPattern.test(String(task.groupId))),
    ) ||
    state.habits.some((habit) => !uuidPattern.test(String(habit.id)));
  if (hasInvalidId) {
    taskDataHydrated = false;
    lastTaskSyncSignature = "";
    void loadTaskDataFromDatabase(activeAuthUser);
    return;
  }
  const signature = serializeTaskDatabaseState();
  if (signature === lastTaskSyncSignature) return;

  if (taskSyncTimer) {
    if (delay > 0) return;
    clearTimeout(taskSyncTimer);
  }
  taskSyncTimer = window.setTimeout(() => {
    taskSyncTimer = null;
    const userId = activeAuthUser?.id;
    const snapshot = JSON.parse(serializeTaskDatabaseState());
    const snapshotSignature = JSON.stringify(snapshot);
    if (!userId || userId !== taskDataUserId) return;

    taskSyncChain = taskSyncChain
      .then(() => syncTaskDatabaseSnapshot(userId, snapshot))
      .then(() => {
        if (activeAuthUser?.id === userId) lastTaskSyncSignature = snapshotSignature;
      })
      .catch((error) => {
        console.error("Farmodoro task data could not be saved", error);
        if (activeAuthUser?.id === userId) {
          const scope = error.syncScope ? ` · ${error.syncScope}` : "";
          const reason = error.message ? `: ${error.message}` : "";
          showToast(`DB 저장 실패${scope}${reason}`);
        }
      });
  }, delay);
}

function throwTaskSyncError(scope, error) {
  if (!error) return;
  error.syncScope = scope;
  throw error;
}

async function syncTaskDatabaseImmediately() {
  if (!taskDataHydrated || !activeAuthUser || activeAuthUser.id !== taskDataUserId) return;
  if (taskSyncTimer) clearTimeout(taskSyncTimer);
  taskSyncTimer = null;

  const userId = activeAuthUser.id;
  const snapshot = JSON.parse(serializeTaskDatabaseState());
  const snapshotSignature = JSON.stringify(snapshot);
  const hasPendingDeletes =
    pendingTaskDatabaseDeletes.size > 0 ||
    pendingHabitDatabaseDeletes.size > 0 ||
    pendingGroupDatabaseDeletes.size > 0;
  if (snapshotSignature === lastTaskSyncSignature && !hasPendingDeletes) {
    await taskSyncChain;
    return;
  }
  const operation = taskSyncChain.then(async () => {
    await syncTaskDatabaseSnapshot(userId, snapshot);
    if (activeAuthUser?.id === userId) lastTaskSyncSignature = snapshotSignature;
  });
  taskSyncChain = operation.catch(() => {});
  await operation;
}

async function syncChangedProductivityRows(table, rows, previousRows, scope) {
  const previousById = new Map(previousRows.map((row) => [row.id, row]));
  const inserts = [];
  for (const row of rows) {
    const previous = previousById.get(row.id);
    if (!previous) {
      inserts.push(row);
      continue;
    }
    const changes = Object.fromEntries(Object.entries(row).filter(([key, value]) =>
      key !== "id" && key !== "user_id" && JSON.stringify(value) !== JSON.stringify(previous[key]),
    ));
    if (!Object.keys(changes).length) continue;
    const { error } = await supabaseClient.from(table).update(changes)
      .eq("user_id", row.user_id).eq("id", row.id);
    throwTaskSyncError(scope, error);
  }
  if (inserts.length) {
    const { error } = await supabaseClient.from(table).upsert(inserts, { onConflict: "id" });
    throwTaskSyncError(scope, error);
  }
}

async function syncTaskDatabaseSnapshot(userId, snapshot) {
  if (activeAuthUser?.id !== userId || taskDataUserId !== userId) return;

  productivityRealtimeMutedUntil = Math.max(productivityRealtimeMutedUntil, Date.now() + 5000);
  const previous = lastTaskSyncSignature ? JSON.parse(lastTaskSyncSignature) : {};

  const groupRows = snapshot.groups.map((group) => ({ ...group, user_id: userId }));
  // status/completed_on/completion_reward/completed_with_free_pass/
  // completion_cycle_id are owned exclusively by complete_my_task /
  // uncomplete_my_task or moveTaskTo's dedicated status update path below,
  // never by this
  // bulk snapshot upsert. If this device's local view of some OTHER task is
  // stale -- e.g. it hasn't picked up a completion made from another
  // device/tab yet -- saving an unrelated edit here (title, sort order, ...)
  // would otherwise re-upload that stale status and silently undo the other
  // device's completion.
  //
  // archived_at is excluded for the same reason, from the opposite direction:
  // tasks_archive_only_when_done requires archived_at is null whenever
  // status <> 'done', and status is (as of the above) never part of this
  // payload's column set -- so this bulk upsert can't be trusted to keep
  // that pairing valid for every row in one shot. It's set instead through
  // set_my_task_archived (see maintainTaskArchive / the archive & restore
  // button handlers), which checks the current server-side status itself
  // before writing.
  //
  // Omitting a column from the upsert payload leaves it untouched on
  // conflict; new rows still get the correct defaults from the table schema.
  const taskRows = snapshot.tasks.map((task) => {
    const {
      status,
      completed_on,
      completion_reward,
      completed_with_free_pass,
      completion_cycle_id,
      archived_at,
      ...syncedFields
    } = task;
    return { ...syncedFields, user_id: userId };
  });
  const habitRows = snapshot.habits.map((habit) => ({ ...habit, user_id: userId }));
  // Only upload habit-day rows whose content actually changed since the last
  // successful sync — habit history otherwise grows every day forever, and
  // re-uploading every row on every unrelated edit gets more wasteful the
  // longer the account has been used.
  const habitRecordRows = snapshot.habitRecords.filter((record) => {
    const key = `${record.habit_id}:${record.record_date}`;
    if (habitRecordEditsInFlight.has(key)) return false;
    return habitRecordSyncSignatures.get(key) !== JSON.stringify(record);
  });

  await syncChangedProductivityRows("task_groups", groupRows, previous.groups ?? [], "그룹");
  await syncChangedProductivityRows("tasks", taskRows, previous.tasks ?? [], "할 일");
  await syncChangedProductivityRows("habits", habitRows, previous.habits ?? [], "습관");

  if (habitRecordRows.length) {
    // Completion and its reward belong to complete_my_habit/uncomplete_my_habit.
    // An optimistic (or stale) snapshot must never mark a day complete before
    // the RPC awards its coin, or restore completion after an undo.
    const habitProgressRows = habitRecordRows.map((record) => {
      const {
        completed_at,
        completion_reward,
        completed_with_free_pass,
        completion_cycle_id,
        ...progressFields
      } = record;
      return progressFields;
    });
    const { error } = await supabaseClient
      .from("habit_daily_records")
      .upsert(habitProgressRows, { onConflict: "habit_id,record_date" });
    throwTaskSyncError("습관 기록", error);
    habitRecordRows.forEach((record) => {
      habitRecordSyncSignatures.set(
        `${record.habit_id}:${record.record_date}`,
        JSON.stringify(record),
      );
    });
  }

  const deletedTaskIds = [...pendingTaskDatabaseDeletes];
  if (deletedTaskIds.length) {
    const { error } = await supabaseClient
      .from("tasks")
      .delete()
      .eq("user_id", userId)
      .in("id", deletedTaskIds);
    throwTaskSyncError("할 일 삭제", error);
    deletedTaskIds.forEach((taskId) => pendingTaskDatabaseDeletes.delete(taskId));
  }

  const deletedHabitIds = [...pendingHabitDatabaseDeletes];
  if (deletedHabitIds.length) {
    const { error } = await supabaseClient
      .from("habits")
      .delete()
      .eq("user_id", userId)
      .in("id", deletedHabitIds);
    throwTaskSyncError("습관 삭제", error);
    deletedHabitIds.forEach((habitId) => pendingHabitDatabaseDeletes.delete(habitId));
  }

  const deletedGroupIds = [...pendingGroupDatabaseDeletes];
  if (deletedGroupIds.length) {
    const { error } = await supabaseClient
      .from("task_groups")
      .delete()
      .eq("user_id", userId)
      .in("id", deletedGroupIds);
    throwTaskSyncError("그룹 삭제", error);
    deletedGroupIds.forEach((groupId) => pendingGroupDatabaseDeletes.delete(groupId));
  }

  productivityRealtimeMutedUntil = Math.max(productivityRealtimeMutedUntil, Date.now() + 1500);
}

function escapeHtml(value) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character],
  );
}

function formatFocusTime(seconds = 0) {
  if (seconds < 60) return seconds > 0 ? "1분 미만" : "0분";
  return `${Math.floor(seconds / 60)}분`;
}

function autoGrowTextarea(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function submitOnEnterUnlessShift(event, form) {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  form.requestSubmit();
}

function formatArchivedCompletionDate(value) {
  const date = parseDateInputValue(value);
  if (!date) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return sameYear
    ? `${date.getMonth() + 1}월 ${date.getDate()}일 완료`
    : `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 완료`;
}

function getFocusItem() {
  if (!activeFocus) return null;
  const collection = activeFocus.type === "task" ? state.tasks : state.habits;
  return collection.find((item) => item.id === activeFocus.id) ?? null;
}

function getGroup(groupId) {
  return state.groups.find((group) => group.id === groupId) ?? null;
}

function normalizeFocusSettings(savedSettings = {}) {
  const legacySettings = {
    focusMinutes: savedSettings.focusMinutes ?? 25,
    breakEnabled: savedSettings.breakEnabled ?? true,
    breakMinutes: savedSettings.breakMinutes ?? 5,
  };
  return {
    linked: { ...legacySettings, ...(savedSettings.linked ?? {}) },
    quick: { ...legacySettings, ...(savedSettings.quick ?? {}) },
  };
}

function getFocusSettings(mode = focusMode) {
  return state.settings[mode] ?? state.settings.linked;
}

function getHabitDailyFocusSeconds(habit, dateString = toProductivityDateString()) {
  if (!habit) return 0;
  return Math.max(0, Math.floor(Number(habit.focusSecondsByDate?.[dateString] ?? 0)));
}

function getLinkedFocusSeconds(item = getFocusItem()) {
  if (!item) return 0;
  if (activeFocus?.type === "task") return Math.max(0, Math.floor(item.focusSeconds ?? 0));
  return getHabitDailyFocusSeconds(item);
}

function getHabitFocusMinutes(habit, dateString = toProductivityDateString()) {
  if (habit?.measureType !== "time") return 0;
  const weekday = dateString ? new Date(`${dateString}T12:00:00`).getDay() || 7 : null;
  const defaultMinutes = habit?.measureType === "time" ? habit.targetValue : habit?.focusMinutes;
  const weekdayMinutes = habit?.measureType === "time" && weekday ? habit.targetByWeekday?.[weekday] : null;
  return Math.min(9999, Math.max(1, Math.floor(Number(weekdayMinutes ?? defaultMinutes) || 25)));
}

function prepareLinkedFocusRuntime(item = getFocusItem()) {
  const countdown = Boolean(item && activeFocus?.type === "habit");
  const sessionMinutes = countdown ? getHabitFocusMinutes(item) : undefined;
  const hasProgress = item
    ? activeFocus?.type === "task"
      ? Number(item.focusSeconds) > 0
      : getHabitDailyFocusSeconds(item) > 0
    : false;
  focusRuntimeByMode.linked = {
    date: countdown ? toProductivityDateString() : "",
    seconds: countdown ? Math.max(0, sessionMinutes * 60 - getHabitDailyFocusSeconds(item)) : getLinkedFocusSeconds(item),
    countdown,
    sessionMinutes,
    phase: "focus",
    started: hasProgress,
  };
  if (focusMode === "linked") {
    focusSeconds = focusRuntimeByMode.linked.seconds;
    timerPhase = "focus";
    focusSessionStarted = hasProgress;
    focusRunning = runningFocusMode === "linked";
  }
}

// A habit's countdown belongs to a local calendar day, including after a
// suspended tab or another device restores the timer. A session that was
// running when midnight passed stays on the day it started until it ends.
function refreshHabitTimerDate(runtime, item, date = toProductivityDateString()) {
  if (!runtime.countdown || runtime.date === date) return false;
  if (runtime.carryOver && runtime.started) return false;
  runtime.carryOver = false;
  runtime.date = date;
  runtime.sessionMinutes = getHabitFocusMinutes(item, date);
  runtime.seconds = Math.max(0, runtime.sessionMinutes * 60 - getHabitDailyFocusSeconds(item, date));
  runtime.started = runtime.started && runningFocusMode === "linked";
  return true;
}

// A running countdown never restarts at midnight: every second, including
// those after midnight, counts toward the day the session started.
function advanceHabitTimer(runtime, item, startAt, elapsedSeconds, record) {
  if (runtime.seconds === 0) return 0;
  runtime.date ||= toProductivityDateString(new Date(startAt));
  const seconds = Math.min(elapsedSeconds, runtime.seconds);
  runtime.seconds -= seconds;
  if (record && seconds > 0) {
    item.focusSecondsByDate ??= {};
    item.focusSecondsByDate[runtime.date] = getHabitDailyFocusSeconds(item, runtime.date) + seconds;
  }
  if (toProductivityDateString(new Date(startAt + elapsedSeconds * 1000)) !== runtime.date) runtime.carryOver = true;
  return seconds;
}

function getStableGroupColorIndex(value) {
  const presetColors = { work: 0, "업무": 0, life: 1, "생활": 1, study: 3, "공부": 3 };
  if (Object.hasOwn(presetColors, value)) return presetColors[value];

  return [...String(value)].reduce(
    (total, character) => (total * 31 + character.charCodeAt(0)) % GROUP_COLOR_COUNT,
    0,
  );
}

function getKoreanObjectParticle(value) {
  const lastCharacter = String(value).trim().at(-1);
  if (!lastCharacter) return "을(를)";
  const characterCode = lastCharacter.charCodeAt(0);
  if (characterCode < 0xac00 || characterCode > 0xd7a3) return "을(를)";
  return (characterCode - 0xac00) % 28 === 0 ? "를" : "을";
}

function getGroupColorClass(group) {
  return `group-color-${group.colorIndex ?? getStableGroupColorIndex(group.id ?? group.name)}`;
}

function renderGroups() {
  const currentValue = taskGroup.value;
  taskGroup.innerHTML = [
    '<option value="">그룹 없음</option>',
    ...state.groups.map(
      (group) => `<option value="${group.id}">${escapeHtml(group.name)}</option>`,
    ),
  ].join("");

  if ([...taskGroup.options].some((option) => option.value === currentValue)) {
    taskGroup.value = currentValue;
  }

  const selectedGroup = getGroup(taskGroup.value);
  taskGroupLabel.textContent = selectedGroup?.name ?? "그룹 없음";
  taskGroupMenu.innerHTML = [
    `<button class="custom-group-option ${taskGroup.value ? "" : "selected"}" type="button" role="option" aria-selected="${!taskGroup.value}" data-task-group-value=""><i></i><span>그룹 없음</span><b>✓</b></button>`,
    ...state.groups.map(
      (group) => `<button class="custom-group-option ${getGroupColorClass(group)} ${taskGroup.value === group.id ? "selected" : ""}" type="button" role="option" aria-selected="${taskGroup.value === group.id}" data-task-group-value="${group.id}"><i></i><span>${escapeHtml(group.name)}</span><b>✓</b></button>`,
    ),
  ].join("");

  document.querySelector("#groupList").innerHTML = state.groups
    .map(
      (group) => `
        <span class="group-chip ${getGroupColorClass(group)}">
          ${escapeHtml(group.name)}
          <button type="button" data-delete-group="${group.id}" aria-label="${escapeHtml(group.name)} 그룹 삭제">×</button>
        </span>
      `,
    )
    .join("");
}

function renderTaskFilters() {
  const filters = document.querySelectorAll("#taskGroupFilters, #todayTaskGroupFilters");
  const archiveButton = document.querySelector("#toggleArchiveView");
  const archivePolicy = document.querySelector("#taskArchivePolicy");
  if (!archiveButton || !archivePolicy) return;

  const options = [
    { id: "all", name: "전체" },
    { id: "none", name: "그룹 없음" },
    ...state.groups,
  ];

  const archiveActive = currentPage === "tasks" && taskArchiveView;

  const filterMarkup = options
    .map(
      (option) => `
        <button
          class="${taskGroupFilter === option.id ? "active" : ""}"
          type="button"
          data-task-group-filter="${option.id}"
          aria-pressed="${taskGroupFilter === option.id}"
        >${escapeHtml(option.name)}</button>
      `,
    )
    .join("");

  filters.forEach((container) => { container.innerHTML = filterMarkup; });
  archiveButton.classList.toggle("active", archiveActive);
  archiveButton.setAttribute("aria-pressed", String(archiveActive));
  archiveButton.textContent = archiveActive ? "← 할 일로 돌아가기" : "보관함";
  if (currentPage === "tasks") taskSection.querySelector(".section-header h2").textContent = archiveActive ? "보관함" : "전체 할 일";
  archivePolicy.textContent = archiveActive
    ? "보관된 할 일은 보관 후 30일이 지나면 자동으로 삭제"
    : "완료한 할 일은 다음 날 자동으로 보관함으로 이동";
  document.querySelector("#taskBoard").classList.toggle("archive-view", archiveActive);
  document.querySelector('[data-status="done"] h3').textContent =
    archiveActive ? "보관된 할 일" : "완료";
}

function getVisibleTasks(status) {
  return state.tasks.filter((task) => {
    if (status === "waiting" ? task.status === "done" : task.status !== "done") return false;

    const archiveActive = currentPage === "tasks" && taskArchiveView;
    if (archiveActive !== Boolean(task.archived)) return false;
    if (taskGroupFilter === "all") return true;
    if (taskGroupFilter === "none") return !task.groupId;
    return task.groupId === taskGroupFilter;
  });
}

function renderTasks() {
  renderTaskFilters();

  ["waiting", "done"].forEach((status) => {
    const list = document.querySelector(`[data-list="${status}"]`);
    const tasks = getVisibleTasks(status);

    list.innerHTML = tasks
      .map((task) => {
        const group = getGroup(task.groupId);
        const isEditing = false;
        const editingGroup = isEditing ? getGroup(editingTaskGroupId) : null;
        const inlineGroupOptions = isEditing
          ? [
              `<button class="custom-group-option ${editingTaskGroupId ? "" : "selected"}" type="button" role="option" aria-selected="${!editingTaskGroupId}" data-inline-task-group=""><i></i><span>그룹 없음</span><b>✓</b></button>`,
              ...state.groups.map(
                (item) => `<button class="custom-group-option ${getGroupColorClass(item)} ${editingTaskGroupId === item.id ? "selected" : ""}" type="button" role="option" aria-selected="${editingTaskGroupId === item.id}" data-inline-task-group="${item.id}"><i></i><span>${escapeHtml(item.name)}</span><b>✓</b></button>`,
              ),
            ].join("")
          : "";
        return `
          <article
            class="task-card ${status === "done" ? "done" : ""} ${task.archived ? "archived" : ""} ${isEditing ? "editing" : ""}"
            draggable="false"
            data-task-id="${task.id}"
          >
            ${
              isEditing
                ? `
                  <form class="task-inline-edit" data-inline-task-form="${task.id}">
                    <div class="task-input-wrap">
                      <textarea
                        class="task-inline-title"
                        rows="1"
                        maxlength="60"
                        aria-label="할 일 내용"
                        required
                      >${escapeHtml(editingTaskTitle)}</textarea>
                    </div>
                    <label class="task-inline-focus-row">
                      <span>집중 시간(분)</span>
                      <input
                        type="number"
                        class="task-inline-focus-minutes"
                        min="0"
                        max="9999"
                        step="1"
                        inputmode="numeric"
                        value="${escapeHtml(editingTaskFocusMinutes)}"
                        aria-label="${escapeHtml(task.title)} 집중 시간(분)"
                      />
                    </label>
                    <div class="task-inline-edit-footer">
                      <div class="custom-group-select task-inline-group-select">
                        <button class="custom-group-trigger" type="button" data-inline-group-trigger aria-haspopup="listbox" aria-expanded="false">
                          <span>${escapeHtml(editingGroup?.name ?? "그룹 없음")}</span>
                          <span aria-hidden="true">⌄</span>
                        </button>
                        <div class="custom-group-menu hidden" role="listbox">${inlineGroupOptions}</div>
                      </div>
                      <div class="task-inline-edit-actions">
                        <button type="button" data-cancel-task-edit>취소</button>
                        <button type="submit">저장</button>
                      </div>
                    </div>
                  </form>
                `
                : `
                  <button class="today-task-check" type="button" data-task-status="${task.status === "done" ? "waiting" : "done"}" aria-label="${escapeHtml(task.title)} ${task.status === "done" ? "완료 취소" : "완료"}" aria-pressed="${task.status === "done"}" ${task.archived ? "disabled" : ""}>${task.status === "done" ? "✓" : ""}</button>
                  <div class="task-top">
                    <h4>${escapeHtml(task.title)}</h4>
                  </div>
                  <div class="task-meta">
                    ${group ? `<span class="task-category ${getGroupColorClass(group)}">${escapeHtml(group.name)}</span>` : ""}
                    ${
                      task.archived
                        ? `
                          <span class="task-archived-label">보관됨</span>
                          ${
                            task.completedDate
                              ? `<span class="task-completed-date">${formatArchivedCompletionDate(task.completedDate)}</span>`
                              : ""
                          }
                        `
                        : task.status === "done"
                          ? `<span class="task-focus-pill completed-focus-time" data-task-focus-time>◷ 집중 ${formatFocusTime(task.focusSeconds)}</span>`
                          : `
                          <button
                            class="task-focus-pill"
                            type="button"
                            data-focus-task="${task.id}"
                            data-task-focus-time
                            aria-label="${escapeHtml(task.title)} 집중 시작"
                          >
                            ◷ 집중 ${formatFocusTime(task.focusSeconds)}
                          </button>
                        `
                    }
                  </div>
                `
            }
            ${
              !isEditing && currentPage === "tasks" && task.archived
                ? `<button class="task-archive-button" type="button" data-restore-task="${task.id}">↩ 보관 해제</button>`
                : ""
            }
            ${
              isEditing
                ? ""
                : `<div class="task-actions">
                    <button class="task-edit-button" type="button" data-edit-task="${task.id}" aria-label="${escapeHtml(task.title)} 수정">✎</button>
                    <button class="delete-button" type="button" data-delete-task="${task.id}" aria-label="삭제">×</button>
                  </div>`
            }
          </article>
        `;
      })
      .join("");

    document.querySelector(`[data-count="${status}"]`).textContent = tasks.length;
  });
}

function toLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Habits and tasks roll over at 04:00 local time instead of midnight, so
// late-night work still belongs to the day it began. The farm keeps midnight.
const PRODUCTIVITY_DAY_START_HOUR = 4;

function getProductivityDate(instant = new Date()) {
  return new Date(instant.getTime() - PRODUCTIVITY_DAY_START_HOUR * 60 * 60 * 1000);
}

function toProductivityDateString(instant = new Date()) {
  return toLocalDateString(getProductivityDate(instant));
}

function getFarmWeekStart(date = new Date()) {
  const monday = new Date(date);
  monday.setHours(12, 0, 0, 0);
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);
  return toLocalDateString(monday);
}

function getFarmRankings(userScore = state.weeklyFarmMoneyEarned) {
  if (farmLeaderboard.length) return farmLeaderboard.map((farmer) => farmer.isMe
    ? { ...farmer, farmName: state.farmName || "내 농장" }
    : farmer);
  return [
    {
      farmName: state.farmName || "내 농장",
      displayName: currentProfile?.display_name || "농부",
      score: userScore,
      isMe: true,
    },
  ].sort((first, second) => second.score - first.score || Number(second.isMe) - Number(first.isMe));
}

function ensureWeeklyFarmRanking() {
  const currentWeekStart = getFarmWeekStart();
  if (state.farmRankingWeekStart === currentWeekStart) return false;
  state.farmRankingWeekStart = currentWeekStart;
  state.weeklyFarmMoneyEarned = 0;
  return true;
}

function formatFarmRankingWeek() {
  const start = new Date(`${state.farmRankingWeekStart}T12:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.getMonth() + 1}월 ${start.getDate()}일 ― ${end.getMonth() + 1}월 ${end.getDate()}일`;
}

function persistPendingFocusEvents() {
  if (!activeAuthUser) return;
  try {
    if (isFocusTimerOwner()) {
      focusRecoveryTimerCheckpoint = { clientId: FOCUS_TIMER_CLIENT_ID, timer: getFocusTimerDatabasePayload() };
    }
    const key = `farmodoro-focus-outbox:${activeAuthUser.id}:${FOCUS_TIMER_CLIENT_ID}`;
    if (!focusProgressEventQueue.length && !pendingFarmFocusBatches.length && !focusRecoveryTimerCheckpoint) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify({
      events: focusProgressEventQueue, batches: pendingFarmFocusBatches,
      timerCheckpoint: focusRecoveryTimerCheckpoint,
    }));
  } catch (error) {
    console.warn("Farmodoro focus recovery could not be saved", error);
  }
}

function persistFocusTimerCheckpoint() {
  if (activeAuthUser && isFocusTimerOwner()) persistPendingFocusEvents();
}

function resolveFocusTimerRecoveryPayload(payload) {
  const checkpoint = focusRecoveryTimerCheckpoint;
  if (checkpoint?.clientId !== FOCUS_TIMER_CLIENT_ID ||
      (payload.ownerId && payload.ownerId !== FOCUS_TIMER_CLIENT_ID)) return payload;
  const local = checkpoint.timer;
  const localAt = Date.parse(local?.syncedAt || "");
  const remoteAt = Date.parse(payload.syncedAt || "");
  return Number(local?.version) === 1 && Number.isFinite(localAt) &&
    Number.isFinite(remoteAt) && localAt > remoteAt ? local : payload;
}

function restorePendingFocusEvents(userId) {
  if (!userId || focusOutboxUserId === userId) return;
  focusOutboxUserId = userId;
  try {
    const saved = JSON.parse(localStorage.getItem(`farmodoro-focus-outbox:${userId}:${FOCUS_TIMER_CLIENT_ID}`) || "null");
    if (!saved) return;
    focusRecoveryTimerCheckpoint = saved.timerCheckpoint?.clientId === FOCUS_TIMER_CLIENT_ID
      ? saved.timerCheckpoint : null;
    const normalize = (event, queued) => {
      const seconds = Math.floor(Number(event?.seconds));
      if (!(seconds > 0) || !["linked", "quick"].includes(event.mode) || (queued && !event.id)) return null;
      return { ...(queued ? { id: event.id } : {}), mode: event.mode, seconds };
    };
    for (const event of saved.events ?? []) {
      const value = normalize(event, true);
      if (value && !focusProgressEventQueue.some((entry) => entry.id === value.id)) focusProgressEventQueue.push(value);
    }
    for (const batch of saved.batches ?? []) {
      const value = normalize(batch, false);
      if (!value) continue;
      pendingFarmFocusBatches.push(value);
      pendingFocusSeconds[value.mode] += value.seconds;
    }
  } catch (error) {
    console.warn("Farmodoro saved focus recovery could not be restored", error);
  }
}

function productionCoinReward(baseAmount = 1) {
  return baseAmount;
}

function isHabitScheduledOn(habit, date) {
  const dateString = toLocalDateString(date);
  const weekday = date.getDay() === 0 ? 7 : date.getDay();
  const afterStartDate = !habit.startDate || habit.startDate <= dateString;
  const beforeEndDate = !habit.endDate || habit.endDate >= dateString;
  return afterStartDate && beforeEndDate && habit.weekdays.includes(weekday);
}

function isHabitScheduledToday(habit) {
  return isHabitScheduledOn(habit, getProductivityDate());
}

function getHabitTargetForDate() {
  return 1;
}

function getHabitProgress(habit, dateString = toProductivityDateString()) {
  return habit.completionDates.includes(dateString) ? 1 : 0;
}

function getHabitProgressRatio(habit, dateString = toProductivityDateString()) {
  return Math.min(1, getHabitProgress(habit, dateString) / getHabitTargetForDate(habit, dateString));
}

function isHabitCompleteToday(habit) {
  return getHabitProgressRatio(habit) >= 1;
}

function getHabitStreak(habit, dateString = toProductivityDateString()) {
  const completedDates = new Set(habit.completionDates ?? []);
  const cursor = new Date(`${dateString}T12:00:00`);
  cursor.setHours(12, 0, 0, 0);
  if (isHabitScheduledOn(habit, cursor) && !completedDates.has(toLocalDateString(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  for (let checkedDays = 0; checkedDays < 3660; checkedDays += 1) {
    if (isHabitScheduledOn(habit, cursor)) {
      if (!completedDates.has(toLocalDateString(cursor))) break;
      streak += 1;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function formatHabitSchedule(habit, includeEndDate = true) {
  const labels = ["월", "화", "수", "목", "금", "토", "일"];
  const weekdayKey = [...habit.weekdays].sort((a, b) => a - b).join(",");
  const weekdays =
    weekdayKey === "1,2,3,4,5,6,7"
      ? "매일"
      : weekdayKey === "1,2,3,4,5"
        ? "평일"
        : weekdayKey === "6,7"
          ? "주말"
          : habit.weekdays.map((day) => labels[day - 1]).join("·");
  return includeEndDate && habit.endDate ? `${weekdays} · ${habit.endDate}까지` : weekdays;
}

function formatHabitTargets(habit) {
  const labels = ["월", "화", "수", "목", "금", "토", "일"];
  const groups = new Map();
  habit.weekdays.forEach((day) => {
    const target = getHabitTargetForDate(
      habit,
      new Date(2024, 0, day),
    );
    if (!groups.has(target)) groups.set(target, []);
    groups.get(target).push(labels[day - 1]);
  });
  return [...groups.entries()]
    .map(([target, days]) => `${days.join(" ")} ${target}${habit.unit}`)
    .join(" / ");
}

const focusDailyQuotes = [
  "작은 집중이 오늘의 흐름을 바꿔",
  "완벽한 시작보다 꾸준한 한 걸음이 더 멀리 가",
  "지금 이 순간에 마음을 모으면 길이 보여",
  "천천히 가도 멈추지 않으면 충분해",
  "오늘 쌓은 한 칸이 내일의 기반이 돼",
  "해야 할 일보다 지금 할 한 가지에 집중해",
  "짧은 몰입도 반복되면 큰 변화를 만들어",
  "시작한 순간 이미 가장 어려운 고비를 넘었어",
  "마음이 복잡할수록 다음 한 걸음만 바라봐",
  "집중은 시간을 늘리는 가장 조용한 방법이야",
  "조금씩 해낸 기록은 사라지지 않아",
  "오늘의 성실함이 미래의 여유를 만들어",
  "속도보다 방향, 방향보다 꾸준함이 중요해",
  "한 번의 깊은 집중이 긴 망설임을 이겨",
  "쉬어 가도 괜찮아, 다시 시작하면 돼",
  "할 수 있는 만큼 시작하면 할 수 있는 일이 늘어나",
  "지금의 노력은 눈에 보이지 않아도 자라고 있어",
  "작은 완료 하나가 다음 움직임을 가볍게 해",
  "집중할 때는 한 가지면 충분해",
  "오늘의 최선은 어제와 달라도 괜찮아",
  "꾸준함은 재능이 쉬는 날에도 자라",
  "미루고 싶은 마음보다 5분 먼저 움직여 봐",
  "차분히 쌓은 시간은 결국 결과로 답해",
  "오늘도 나만의 속도로 앞으로 가자",
  "생각을 줄이고 손을 움직이면 흐름이 시작돼",
  "한 칸씩 채우다 보면 어느새 멀리 와 있어",
  "집중한 시간은 스스로에게 주는 단단한 약속이야",
  "잘하려는 마음보다 끝내려는 마음을 먼저 꺼내 봐",
  "오늘 시작한 작은 일이 내일의 나를 도와줘",
  "흔들려도 다시 돌아오는 힘이 꾸준함이야",
  "할 일을 작게 나누면 시작할 용기가 커져",
];

function updateDailyFocusQuote() {
  const quote = document.querySelector(".welcome-quote");
  if (!quote) return;
  const today = new Date();
  const dayNumber = Math.floor(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000,
  );
  quote.textContent = focusDailyQuotes[dayNumber % focusDailyQuotes.length];
}

updateDailyFocusQuote();

customTaskGroupSelect.addEventListener("keydown", event => {
  if (taskGroupMenu.classList.contains("hidden")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeTaskGroupMenu();
    taskGroupTrigger.focus();
  }
  if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
  event.preventDefault();
  const controls = [...taskGroupMenu.querySelectorAll("button")];
  const index = controls.indexOf(document.activeElement);
  const next = index < 0 ? (event.key === "ArrowDown" ? 0 : controls.length - 1)
    : (index + (event.key === "ArrowDown" ? 1 : -1) + controls.length) % controls.length;
  controls[next]?.focus();
});

document.addEventListener("pointerdown", event => {
  if (!customTaskGroupSelect.contains(event.target)) closeTaskGroupMenu();
});

function closeGroupManager() {
  groupManager.classList.add("hidden");
  document.querySelector("#toggleGroupManager").setAttribute("aria-expanded", "false");
}

groupManager.querySelectorAll("[data-close-group-manager]").forEach((button) => {
  button.addEventListener("click", () => {
    closeGroupManager();
    document.querySelector("#toggleGroupManager").focus();
  });
});

groupManager.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeGroupManager();
    document.querySelector("#toggleGroupManager").focus();
  }
});

const groupDeleteDialog = document.createElement("div");
groupDeleteDialog.className = "task-group-dialog group-delete-dialog hidden";
groupDeleteDialog.setAttribute("role", "alertdialog");
groupDeleteDialog.setAttribute("aria-modal", "true");
groupDeleteDialog.setAttribute("aria-labelledby", "groupDeleteDialogTitle");
groupDeleteDialog.setAttribute("aria-describedby", "groupDeleteDialogMessage");
groupDeleteDialog.innerHTML = `
  <div class="task-create-backdrop" data-cancel-group-delete></div>
  <section class="task-create-panel">
    <header><h2 id="groupDeleteDialogTitle">그룹 삭제</h2></header>
    <p id="groupDeleteDialogMessage"></p>
    <div class="group-delete-actions">
      <button type="button" data-cancel-group-delete>취소</button>
      <button class="danger-button" id="confirmGroupDelete" type="button">삭제</button>
    </div>
  </section>
`;
document.body.append(groupDeleteDialog);
const groupDeleteDialogMessage = groupDeleteDialog.querySelector("#groupDeleteDialogMessage");
const confirmGroupDelete = groupDeleteDialog.querySelector("#confirmGroupDelete");
let pendingGroupDeleteId = null;

function closeGroupDeleteDialog() {
  groupDeleteDialog.classList.add("hidden");
  pendingGroupDeleteId = null;
}

function openGroupDeleteDialog(groupId) {
  const group = getGroup(groupId);
  if (!group) return;
  pendingGroupDeleteId = groupId;
  groupDeleteDialogMessage.textContent = `‘${group.name}’ 그룹을 정말 삭제할까? 이 그룹의 할 일은 그룹 없음으로 이동해.`;
  groupDeleteDialog.classList.remove("hidden");
  confirmGroupDelete.focus();
}

groupDeleteDialog.querySelectorAll("[data-cancel-group-delete]").forEach((button) => {
  button.addEventListener("click", () => {
    closeGroupDeleteDialog();
    groupInput.focus();
  });
});

groupDeleteDialog.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  closeGroupDeleteDialog();
  groupInput.focus();
});

function closeTaskGroupMenu() {
  taskGroupMenu.classList.add("hidden");
  taskGroupTrigger.setAttribute("aria-expanded", "false");
}

taskGroupTrigger.addEventListener("click", () => {
  const willOpen = taskGroupMenu.classList.contains("hidden");
  taskGroupMenu.classList.toggle("hidden", !willOpen);
  taskGroupTrigger.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) taskGroupMenu.querySelector('.selected, button')?.focus();
});

taskGroupMenu.addEventListener("click", (event) => {
  const option = event.target.closest("[data-task-group-value]");
  if (!option) return;
  taskGroup.value = option.dataset.taskGroupValue;
  renderGroups();
  closeTaskGroupMenu();
  taskGroupTrigger.focus();
});

function openTaskInlineEdit(task) {
  editingTaskId = task.id;
  editingTaskGroupId = task.groupId || null;
  editingTaskTitle = task.title;
  editingTaskFocusMinutes = String(Math.floor((task.focusSeconds ?? 0) / 60));
  taskModalTitle.textContent = "할 일 수정";
  taskFormSubmit.textContent = "수정 저장";
  taskModalFocusRow.hidden = false;
  taskInput.value = editingTaskTitle;
  taskFocusMinutesInput.value = editingTaskFocusMinutes;
  taskGroup.value = editingTaskGroupId || "";
  renderGroups();
  document.querySelector("#taskCreateModal").classList.remove("hidden");
  document.querySelector("#openTaskForm").setAttribute("aria-expanded", "true");
  taskForm.classList.remove("hidden");
  window.setTimeout(() => {
    autoGrowTextarea(taskInput);
    taskInput.focus();
    taskInput.select();
  }, 0);
}

function closeTaskInlineEdit() {
  editingTaskId = null;
  editingTaskGroupId = null;
  editingTaskTitle = "";
  editingTaskFocusMinutes = "";
  taskModalTitle.textContent = "할 일 추가";
  taskFormSubmit.textContent = "추가";
  taskModalFocusRow.hidden = true;
  taskFocusMinutesInput.value = "0";
  taskInput.value = "";
  taskGroup.value = "";
  renderGroups();
  taskForm.classList.add("hidden");
  document.querySelector("#taskCreateModal").classList.add("hidden");
  document.querySelector("#openTaskForm").setAttribute("aria-expanded", "false");
  closeTaskGroupMenu();
  closeGroupManager();
}

function getHabitViewDate() {
  return currentPage === "habits" && selectedHabitDate ? selectedHabitDate : toProductivityDateString();
}

function moveHabitDate(delta) {
  const date = new Date(`${getHabitViewDate()}T12:00:00`);
  date.setDate(date.getDate() + delta);
  const nextDate = toLocalDateString(date);
  if (nextDate > toProductivityDateString()) return;
  selectedHabitDate = nextDate === toProductivityDateString() ? null : nextDate;
  renderHabits();
}

document.querySelector("#previousHabitDate").addEventListener("click", () => moveHabitDate(-1));
document.querySelector("#nextHabitDate").addEventListener("click", () => moveHabitDate(1));
document.querySelector("#habitDateToday").addEventListener("click", () => {
  selectedHabitDate = null;
  renderHabits();
});

function renderHabits() {
  const habitList = document.querySelector("#habitList");
  const dateString = getHabitViewDate();
  const viewDate = new Date(`${dateString}T12:00:00`);
  const isPast = dateString < toProductivityDateString();
  document.querySelector("#habitDateNav").hidden = currentPage !== "habits";
  document.querySelector("#habitDateLabel").textContent = `${dateString.replaceAll("-", ".")} (${["일", "월", "화", "수", "목", "금", "토"][viewDate.getDay()]})${isPast ? "" : " · 오늘"}`;
  document.querySelector("#nextHabitDate").disabled = !isPast;
  document.querySelector("#habitDateToday").disabled = !isPast;
  const visibleHabits = currentPage === "today" || isPast
    ? state.habits.filter((habit) => isHabitScheduledOn(habit, viewDate))
    : state.habits.filter((habit) => !habit.endDate || habit.endDate >= dateString);

  habitList.innerHTML = visibleHabits
    .map((habit) => {
      const scheduledToday = isHabitScheduledOn(habit, viewDate);
      const completeToday = getHabitProgressRatio(habit, dateString) >= 1;
      const recordBusy = isPast && habitRecordSaving;
      const control = `
        <button
          class="habit-check"
          type="button"
          data-toggle-habit="${habit.id}"
          aria-label="${escapeHtml(habit.title)} ${completeToday ? "완료 취소" : "완료"}"
          aria-pressed="${completeToday}"
          ${scheduledToday && !recordBusy ? "" : "disabled"}
        >✓</button>
      `;
      const focusAction =
        !isPast && !completeToday && getHabitFocusMinutes(habit) > 0
          ? `<button
              class="habit-focus-button ${activeFocus?.type === "habit" && activeFocus.id === habit.id ? "active" : ""}"
              type="button"
              data-focus-habit="${habit.id}"
              aria-disabled="${!scheduledToday}"
            >${
              activeFocus?.type === "habit" && activeFocus.id === habit.id
                ? runningFocusMode === "linked"
                  ? "◷ 집중 중"
                  : "◷ 계속하기"
                : "◷ 집중 시작"
            }</button>`
          : "";
      return `
        <article class="habit-item ${["today", "habits"].includes(currentPage) ? "reorderable" : ""} ${completeToday ? "complete" : ""} ${scheduledToday ? "" : "off-day"}" draggable="${["today", "habits"].includes(currentPage)}" data-habit-id="${habit.id}">
          ${control}
          <span class="habit-copy">
            <strong>${escapeHtml(habit.title)}</strong>
            <small class="habit-summary">
              <span class="habit-summary-primary">${scheduledToday ? (completeToday ? "완료" : "미완료") : "쉬는 날"} · ${escapeHtml(formatHabitSchedule(habit, currentPage === "habits"))}${getHabitFocusMinutes(habit, dateString) > 0 ? ` · 목표 ${getHabitFocusMinutes(habit, dateString)}분` : ""} <span data-habit-focus-time data-focus-date="${dateString}" ${getHabitFocusMinutes(habit) > 0 || getHabitDailyFocusSeconds(habit, dateString) > 0 ? "" : "hidden"}>· 집중 ${formatFocusTime(getHabitDailyFocusSeconds(habit, dateString))}</span></span>
            </small>
          </span>
          <span class="habit-actions">
            ${focusAction}
            <span class="streak">${getHabitStreak(habit, dateString)}일</span>
            ${currentPage === "habits" ? `<button class="habit-edit" type="button" data-edit-habit="${habit.id}" aria-label="${escapeHtml(habit.title)} 수정">✎</button>` : ""}
            <button class="habit-delete" type="button" data-delete-habit="${habit.id}" aria-label="삭제">×</button>
          </span>
        </article>
      `;
    })
    .join("");
}

function renderHabitHeatmap() {
  const grid = document.querySelector("#habitHeatmapGrid");
  const monthLabel = document.querySelector("#habitHeatmapMonth");
  if (!grid || !monthLabel) return;

  const year = habitCalendarDate.getFullYear();
  const month = habitCalendarDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStart = toLocalDateString(new Date(year, month, 1));
  monthLabel.textContent = `${year}년 ${month + 1}월`;
  grid.style.gridTemplateColumns = `var(--heatmap-name-column, 150px) repeat(${daysInMonth}, var(--heatmap-cell-size, 18px))`;

  const dayHeaders = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return `<span class="heatmap-day-label">${day}</span>`;
  }).join("");

  const rows = state.habits
    .filter((habit) => !habit.endDate || habit.endDate >= monthStart)
    .map((habit) => {
      const cells = Array.from({ length: daysInMonth }, (_, index) => {
        const date = new Date(year, month, index + 1);
        const dateString = toLocalDateString(date);
        const progressRatio = getHabitProgressRatio(habit, dateString);
        const completed = progressRatio >= 1;
        const beforeRegistration = Boolean(habit.startDate && dateString < habit.startDate);
        const scheduled = isHabitScheduledOn(habit, date);
        const className = beforeRegistration
          ? "inactive"
          : completed
            ? "completed"
            : scheduled ? "scheduled" : "inactive";
        const status = beforeRegistration
          ? "등록 전"
          : completed
            ? "완료"
            : scheduled
              ? "예정"
              : "일정 없음";
        return `<span class="heatmap-cell ${className}" role="img" aria-label="${escapeHtml(habit.title)} · ${dateString} · ${escapeHtml(status)}" title="${dateString} · ${escapeHtml(status)}"></span>`;
      }).join("");

      return `
        <span class="heatmap-habit-name" title="${escapeHtml(habit.title)}">${escapeHtml(habit.title)}</span>
        ${cells}
      `;
    })
    .join("");

  grid.innerHTML = `<span></span>${dayHeaders}${rows}`;
  renderHabitMonthlySummary();
  lastHabitHeatmapDate = toProductivityDateString();
}

function refreshHabitHeatmapDay() {
  if (lastHabitHeatmapDate !== toProductivityDateString()) renderHabitHeatmap();
}

function getHabitMonthlySummary(habits = state.habits, monthDate = habitCalendarDate, today = getProductivityDate()) {
  const year = monthDate.getFullYear();
  const monthIndex = monthDate.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const monthStart = toLocalDateString(new Date(year, monthIndex, 1));
  const monthEnd = toLocalDateString(new Date(year, monthIndex, daysInMonth));
  const todayString = toLocalDateString(today);
  const period = todayString < monthStart ? "future" : todayString > monthEnd ? "past" : "current";
  const cutoffDate = period === "future" ? null : period === "past" ? monthEnd : todayString;
  const weeks = Array.from({ length: Math.ceil(daysInMonth / 7) }, (_, index) => ({
    index: index + 1,
    label: `${index + 1}주`,
    startDate: toLocalDateString(new Date(year, monthIndex, index * 7 + 1)),
    endDate: toLocalDateString(new Date(year, monthIndex, Math.min((index + 1) * 7, daysInMonth))),
    eligible: 0,
    completed: 0,
    percentage: null,
  }));
  const recordedDates = new Set();
  const rankings = habits.map((habit, originalIndex) => ({ habit, originalIndex }))
    .filter(({ habit }) => (!habit.startDate || habit.startDate <= monthEnd)
      && (!habit.endDate || habit.endDate >= monthStart))
    .map(({ habit, originalIndex }) => {
      let eligible = 0;
      let completed = 0;
      const lastDay = period === "future" ? 0 : period === "current" ? today.getDate() : daysInMonth;
      for (let day = 1; day <= lastDay; day += 1) {
        const date = new Date(year, monthIndex, day, 12);
        if (!isHabitScheduledOn(habit, date)) continue;
        const dateString = toLocalDateString(date);
        const week = weeks[Math.floor((day - 1) / 7)];
        eligible += 1;
        week.eligible += 1;
        if (getHabitProgressRatio(habit, dateString) >= 1) {
          completed += 1;
          week.completed += 1;
          recordedDates.add(dateString);
        }
      }
      return {
        id: habit.id,
        title: habit.title,
        eligible,
        completed,
        percentage: eligible ? Math.round(completed / eligible * 100) : null,
        originalIndex,
      };
    });
  const eligible = rankings.reduce((sum, habit) => sum + habit.eligible, 0);
  const completed = rankings.reduce((sum, habit) => sum + habit.completed, 0);
  weeks.forEach((week) => {
    week.percentage = week.eligible ? Math.round(week.completed / week.eligible * 100) : null;
  });
  rankings.sort((first, second) => {
    if (!first.eligible || !second.eligible) return Number(Boolean(second.eligible)) - Number(Boolean(first.eligible))
      || first.originalIndex - second.originalIndex;
    return second.completed / second.eligible - first.completed / first.eligible
      || second.completed - first.completed || first.originalIndex - second.originalIndex;
  });
  return {
    year,
    month: monthIndex + 1,
    monthStart,
    monthEnd,
    cutoffDate,
    period,
    habitCount: rankings.length,
    eligible,
    completed,
    recordedDays: recordedDates.size,
    percentage: eligible ? Math.round(completed / eligible * 100) : null,
    weeks,
    rankings,
  };
}

function renderHabitMonthlySummary() {
  const panel = document.querySelector("#habitMonthlySummary");
  if (!panel) return;
  const summary = getHabitMonthlySummary();
  const percentage = summary.percentage ?? 0;
  const periodLabel = summary.period === "future"
    ? "아직 시작하지 않은 달이에요"
    : summary.period === "current" ? "오늘까지의 달성률" : "월간 달성률";
  const emptyLabel = summary.period === "future"
    ? "기록이 쌓이면 여기에 보여요"
    : !summary.habitCount ? "이 달에 등록된 습관이 없어요"
      : !summary.eligible ? "집계할 예정이 아직 없어요" : "완료한 습관이 아직 없어요";
  const weekBars = summary.weeks.map((week) => {
    const dateRange = `${summary.month}월 ${Number(week.startDate.slice(-2))}일–${Number(week.endDate.slice(-2))}일`;
    const weekValue = week.percentage ?? 0;
    const description = week.eligible
      ? `${dateRange} · ${week.completed} / ${week.eligible}회 완료 · 달성률 ${weekValue}%`
      : `${dateRange} · 집계할 예정 없음`;
    return `
      <div class="habit-week${week.eligible ? "" : " is-empty"}" title="${escapeHtml(description)}">
        <div class="habit-week-track" role="progressbar" aria-label="${escapeHtml(dateRange)} 달성률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${weekValue}" aria-valuetext="${escapeHtml(description)}">
          <span style="height: ${weekValue}%"></span>
        </div>
        <span>${week.label}</span>
      </div>
    `;
  }).join("");
  const topHabits = summary.rankings.filter((habit) => habit.completed > 0).slice(0, 3);
  const ranking = topHabits.length
    ? `<ol class="habit-summary-top">${topHabits.map((habit, index) => `
        <li>
          <div class="habit-top-heading">
            <span class="habit-top-rank">${index + 1}</span>
            <span class="habit-top-name" title="${escapeHtml(habit.title)}">${escapeHtml(habit.title)}</span>
            <span class="habit-top-rate">${habit.percentage}%</span>
          </div>
          <div class="habit-top-progress" role="progressbar" aria-label="${escapeHtml(habit.title)} 달성률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${habit.percentage}" aria-valuetext="${habit.completed} / ${habit.eligible}회 완료">
            <span style="width: ${habit.percentage}%"></span>
          </div>
        </li>
      `).join("")}</ol>`
    : `<p class="habit-summary-empty">${emptyLabel}</p>`;
  panel.innerHTML = `
    <div class="habit-summary-overview">
      <span class="section-kicker">MONTHLY SUMMARY</span>
      <h3 id="habitMonthlySummaryTitle">월간 요약</h3>
      <div class="habit-summary-rate">${summary.percentage == null ? "—" : `${summary.percentage}%`}</div>
      <p class="habit-summary-period">${periodLabel}</p>
      <div class="habit-summary-progress" role="progressbar" aria-label="월간 습관 달성률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}" aria-valuetext="${summary.eligible ? `${summary.completed} / ${summary.eligible}회 완료` : "집계할 예정 없음"}">
        <span style="width: ${percentage}%"></span>
      </div>
      <p class="habit-summary-count"><strong>${summary.completed} / ${summary.eligible}회</strong> 완료</p>
      <div class="habit-summary-weekly">
        <h4>주차별 달성률</h4>
        <div class="habit-week-bars" role="group" aria-label="주차별 습관 달성률">${weekBars}</div>
      </div>
    </div>
    <div class="habit-summary-ranking">
      <h3>꾸준히 지킨 습관</h3>
      ${ranking}
      <p class="habit-summary-footnote">예정된 날짜 기준</p>
    </div>
  `;
}

function canEditHabitRecord(habit, dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString) || dateString >= toProductivityDateString()) return false;
  const date = new Date(`${dateString}T12:00:00`);
  return toLocalDateString(date) === dateString && isHabitScheduledOn(habit, date);
}

let habitRecordSaving = false;

async function savePastHabitRecord(habit, date, progress) {
  if (!activeAuthUser || !canEditHabitRecord(habit, date)) throw new Error("수정할 수 없는 날짜야");
  const target = getHabitTargetForDate(habit, date);
  if (!Number.isInteger(progress) || progress < 0 || progress > target) throw new Error("기록값을 확인해");
  const userId = activeAuthUser.id;
  await syncTaskDatabaseImmediately();
  const key = `${habit.id}:${date}`;
  habitRecordEditsInFlight.add(key);
  const walletChain = farmWalletMutationChain;
  const operation = taskSyncChain.then(async () => {
    await walletChain;
    if (activeAuthUser?.id !== userId) throw new Error("로그인 정보가 바뀌었어");
    farmWalletMutationVersion += 1;
    const complete = progress >= target;
    const { data, error } = await supabaseClient.rpc(complete ? "complete_my_habit" : "uncomplete_my_habit", {
      p_habit_id: habit.id,
      p_record_date: date,
      ...(complete ? { p_progress_value: progress, p_used_free_pass: false } : {}),
    });
    if (error) throw error;
    const { data: record, error: recordError } = await supabaseClient.from("habit_daily_records")
      .upsert({ habit_id: habit.id, record_date: date, progress_value: progress }, { onConflict: "habit_id,record_date" })
      .select("*").single();
    if (recordError) throw recordError;
    if (activeAuthUser?.id !== userId) return;
    const currentHabit = state.habits.find((item) => item.id === habit.id);
    if (!currentHabit) return;
    currentHabit.progressByDate ??= {};
    currentHabit.progressByDate[date] = record.progress_value;
    currentHabit.completionDates = currentHabit.completionDates.filter((day) => day !== date);
    if (record.completed_at) currentHabit.completionDates.push(date);
    currentHabit.recordMetaByDate ??= {};
    currentHabit.recordMetaByDate[date] = {
      completedAt: record.completed_at,
      completionReward: record.completion_reward,
      completedWithFreePass: record.completed_with_free_pass,
      completionCycleId: record.completion_cycle_id,
    };
    farmWalletMutationVersion += 1;
    if (data.coinBalance != null) state.coins = Number(data.coinBalance);
    if (data.farmMoneyBalance != null) state.farmMoney = Number(data.farmMoneyBalance);
    if (data.legacyPassRefundAmount > 0) showToast(`예전에 사용한 프리패스 ${Number(data.legacyPassRefundAmount).toLocaleString()} Farm Money를 돌려줬어.`);
    const serialized = JSON.parse(serializeTaskDatabaseState()).habitRecords
      .find((entry) => entry.habit_id === habit.id && entry.record_date === date);
    habitRecordSyncSignatures.set(key, JSON.stringify(serialized));
    renderHabitUpdates();
    renderSummary();
  });
  taskSyncChain = operation.catch(() => {});
  farmWalletMutationChain = operation.catch(() => {});
  try {
    await operation;
  } finally {
    await taskSyncChain;
    habitRecordEditsInFlight.delete(key);
  }
}

async function loadFarmLeaderboard() {
  if (!supabaseClient || !activeAuthUser) return;
  const requestedUserId = activeAuthUser.id;
  farmLeaderboardStatus = "loading";

  try {
    const { data, error } = await supabaseClient.rpc("get_farm_leaderboard", {});
    if (activeAuthUser?.id !== requestedUserId) return;
    if (error) throw error;
    farmLeaderboard = (data ?? []).map((farmer) => ({
      rank: Number(farmer.rank_position),
      farmCode: String(farmer.farm_code || "").toUpperCase(),
      farmName: farmer.farm_name || "이름 없는 농장",
      displayName: farmer.display_name || "농부",
      score: Number(farmer.earned_farm_money ?? 0),
      isMe: Boolean(farmer.is_me),
    }));
    farmLeaderboardStatus = "ready";
  } catch (error) {
    if (activeAuthUser?.id !== requestedUserId) return;
    console.warn("Farmodoro leaderboard could not be loaded", error);
    farmLeaderboardStatus = "error";
  } finally {
    if (activeAuthUser?.id === requestedUserId) renderFarmRanking();
  }
}

function renderFarmRanking() {
  const weekLabel = document.querySelector("#farmRankingWeekLabel");
  const weeklyEarned = document.querySelector("#weeklyFarmMoneyEarned");
  const myRankLabel = document.querySelector("#farmRankingMyRank");
  const rankingPodium = document.querySelector("#farmRankingPodium");
  const rankingList = document.querySelector("#farmRankingList");
  if (!weekLabel || !weeklyEarned || !myRankLabel || !rankingPodium || !rankingList) return;

  ensureWeeklyFarmRanking();
  const rankings = getFarmRankings();

  weekLabel.textContent = formatFarmRankingWeek();
  weeklyEarned.textContent = state.weeklyFarmMoneyEarned.toLocaleString("ko-KR");
  const myRank = rankings.findIndex((farmer) => farmer.isMe);
  myRankLabel.textContent = myRank >= 0 ? `현재 ${myRank + 1}위` : "순위 집계 중";

  rankingPodium.innerHTML = [2, 1, 3]
    .map((rank) => {
      const farmer = rankings[rank - 1];
      if (!farmer) {
        return `
          <article class="farm-podium-place is-empty" data-rank="${rank}">
            <span class="farm-podium-medal">${rank}</span>
            <div class="farm-podium-farmer"><strong>도전자 대기</strong><small>아직 자리가 비어 있어</small></div>
            <strong class="farm-podium-score">-</strong>
            <i aria-hidden="true">${rank}</i>
          </article>
        `;
      }
      return `
        <article class="farm-podium-place ${farmer.isMe ? "is-me" : ""}" data-rank="${rank}">
          <span class="farm-podium-medal">${rank === 1 ? "🏆" : rank === 2 ? "🥈" : "🥉"}</span>
          <div class="farm-podium-farmer">
            <strong class="farm-ranking-farm-title">${escapeHtml(farmer.farmName)}</strong>
            <small>${escapeHtml(farmer.displayName)}${farmer.isMe ? " · 나" : ""}</small>
          </div>
          <strong class="farm-podium-score">✦ ${farmer.score.toLocaleString("ko-KR")}</strong>
          <i aria-hidden="true">${rank}</i>
        </article>
      `;
    })
    .join("");

  const remainingRankings = rankings.slice(3);
  rankingList.innerHTML = remainingRankings.length
    ? remainingRankings
    .map((farmer, index) => {
      const rank = index + 4;
      return `
        <li class="farm-ranking-row ${farmer.isMe ? "is-me" : ""}">
          <span class="farm-ranking-rank">${rank}</span>
          <span class="farm-ranking-name">
            <strong class="farm-ranking-farm-title">${escapeHtml(farmer.farmName)}</strong>
            <small>${escapeHtml(farmer.displayName)}${farmer.isMe ? " · 나" : ""}</small>
          </span>
          <strong class="farm-ranking-score">✦ ${farmer.score.toLocaleString("ko-KR")}</strong>
        </li>
      `;
    })
    .join("")
    : '<li class="farm-ranking-row farm-ranking-empty">4위 이하의 농장이 아직 없어</li>';
}

const COSMETIC_TYPE_LABELS = {
  farm_theme: "풍경 테마",
};

function getCosmeticEntry(type, id) {
  return COSMETIC_CATALOGS[type]?.find((item) => item.id === id) ?? null;
}

function isCosmeticOwned(type, id) {
  return state.ownedCosmetics.some((entry) => entry.type === type && entry.id === id);
}

function isCosmeticEquipped(type, id) {
  if (type === "farm_theme") return state.equippedFarmTheme === id;
  return false;
}

function getFarmSceneryDescription(type, id) {
  return type === "farm_theme" ? window.SceneryThemePresets?.theme(id)?.description || "" : "";
}

function getFarmDashboardDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function renderFarmDashboard() {
  const coinBalance = document.querySelector("#farmWorkspaceCoinBalance");
  const moneyBalance = document.querySelector("#farmWorkspaceMoneyBalance");
  const themeLabel = document.querySelector("#farmActiveThemeLabel");
  if (coinBalance) coinBalance.textContent = state.coins.toLocaleString();
  if (moneyBalance) moneyBalance.textContent = state.farmMoney.toLocaleString();
  if (themeLabel) themeLabel.textContent = getCosmeticEntry("farm_theme", state.equippedFarmTheme)?.name || "초록 정원";

  const themeChoices = document.querySelector("#farmThemeChoices");
  if (themeChoices) {
    const themes = [{ id: "", name: "초록 정원", price: 0 }, ...FARM_THEMES];
    themeChoices.innerHTML = themes.map((theme) => {
      const owned = !theme.id || isCosmeticOwned("farm_theme", theme.id);
      const equipped = (state.equippedFarmTheme || "") === theme.id;
      const action = owned ? `data-equip-cosmetic="farm_theme:${theme.id}"` : `data-preview-farm-theme="${theme.id}"`;
      const caption = equipped ? "사용 중" : owned ? "보유 · 눌러서 적용" : `✦ ${theme.price.toLocaleString()} · 미리보기`;
      const art = window.FarmGardenArt?.theme(theme.id);
      const preset = window.SceneryThemePresets?.theme(theme.id);
      const object = preset ? `<span class="scenery-thumb-object">${window.SceneryCreationArt?.sprite(preset.defaultType, 20, 20) || ""}</span>` : "";
      const preview = art ? `<span class="garden-theme-thumb scenery-theme-thumb" data-preview-type="${escapeHtml(preset?.defaultType || "")}" aria-hidden="true" style="background-image:url('${art.url}');background-size:${art.size};background-position:${art.x}% ${art.thumbnailY}%">${object}</span>` : "";
      return `<button type="button" class="farm-theme-choice" ${action} aria-pressed="${equipped}" aria-label="${escapeHtml(theme.name)}${preset ? ` · ${escapeHtml(preset.subject)} 완성 예시` : ""} · ${owned ? "테마 적용" : "미리보기"}">
        ${preview}
        <span>${escapeHtml(theme.name)}</span><small>${caption}</small></button>`;
    }).join("");
  }

}

function renderFarm() {
  const balance = document.querySelector("#marketFarmMoneyBalance");
  if (balance) balance.textContent = state.farmMoney;
  renderTodayFarmPreview();
  renderFarmDashboard();
  renderFarmRanking();
  window.SceneryCreations?.render();
  renderFocusFarmBackground();
  refreshOpenSceneryPreview();
}

function renderFocusPicker() {
  const label = document.querySelector("#focusItemLabel");
  const menu = document.querySelector("#focusItemMenu");
  if (!label || !menu) return;

  const taskOptions = state.tasks
    .filter((task) => !task.archived && task.status !== "done")
    .map((task) => ({
      value: `task:${task.id}`,
      label: task.title,
    }));
  const habitOptions = state.habits
    .filter((habit) => isHabitScheduledToday(habit) && !isHabitCompleteToday(habit))
    .map((habit) => ({
      value: `habit:${habit.id}`,
      label: habit.title,
    }));

  const selectedValue = activeFocus ? `${activeFocus.type}:${activeFocus.id}` : "";
  const selectedOption = [...taskOptions, ...habitOptions].find(
    (option) => option.value === selectedValue,
  );
  label.textContent = selectedOption
    ? `${activeFocus.type === "task" ? "할 일" : "습관"} · ${selectedOption.label}`
    : "할 일 또는 습관 선택";

  const renderGroup = (title, options) =>
    options.length
      ? `
        <div class="focus-item-group-label">${title}</div>
        ${options
          .map(
            (option) => `
              <button
                class="focus-item-option custom-group-option focus-${option.value.split(":")[0]}${option.value === selectedValue ? " selected" : ""}"
                type="button"
                role="option"
                aria-selected="${option.value === selectedValue}"
                data-focus-value="${option.value}"
              >
                <i></i><span>${escapeHtml(option.label)}</span><b>✓</b>
              </button>
            `,
          )
          .join("")}
      `
      : "";

  menu.innerHTML = `
    <button
      class="focus-item-option custom-group-option clear-option${selectedValue ? "" : " selected"}"
      type="button"
      role="option"
      aria-selected="${!selectedValue}"
      data-focus-value=""
    >
      <i></i><span>선택 안 함</span><b>✓</b>
    </button>
    ${renderGroup("할 일", taskOptions)}
    ${renderGroup("습관", habitOptions)}
    ${
      !taskOptions.length && !habitOptions.length
        ? '<p class="focus-item-empty">선택할 항목이 없어</p>'
        : ""
    }
  `;
}

const SUMMARY_PROGRESS_SEGMENTS = 10;

function renderTodayFarmPreview() {
  const plots = document.querySelector("#todayFarmPlots");
  if (plots) {
    const scenery = window.SceneryCreations?.snapshot?.();
    const creation = scenery?.activeCreation;
    const type = scenery?.catalog?.find((entry) => entry.id === creation?.typeId);
    const art = window.FarmGardenArt?.theme(creation ? creation.themeId : state.equippedFarmTheme);
    const landscape = document.querySelector(".today-farm-landscape");
    if (art && landscape) {
      landscape.style.backgroundImage = `url('${art.url}')`;
      landscape.style.backgroundSize = art.size;
      landscape.style.backgroundPosition = `${art.x}% ${art.y}%`;
    }
    document.querySelector("#previewFarmMoney").textContent = state.farmMoney;
    const info = creation ? window.SceneryCreations?.progressInfo(creation) : null;
    const preset = window.SceneryThemePresets?.theme(state.equippedFarmTheme);
    const status = document.querySelector("#todayFarmStatus");
    status.innerHTML = creation
      ? `<strong>${escapeHtml(type?.name || "내 풍경")}</strong><span>${creation.progress} / ${creation.growthCost} Coin · ${info?.percent ?? Math.round(creation.progress / creation.growthCost * 100)}%</span><span>${creation.progress >= creation.growthCost ? "완성! 보상을 받아봐" : `완성까지 ${info?.remaining ?? creation.growthCost - creation.progress} Coin`}</span>`
      : `<strong>${escapeHtml(preset?.subject || "내 풍경")}</strong><span>시작 모습 예시 · 아직 시작하지 않았어</span>`;
    const progressBar = document.querySelector("#todaySceneryProgress");
    if (progressBar) {
      progressBar.hidden = !creation;
      if (creation) {
        progressBar.setAttribute("aria-valuemax", String(creation.growthCost));
        progressBar.setAttribute("aria-valuenow", String(creation.progress));
        progressBar.setAttribute("aria-valuetext", `${info?.percent ?? Math.round(creation.progress / creation.growthCost * 100)}% · ${creation.progress} / ${creation.growthCost} Coin 사용`);
        progressBar.querySelector("span").style.width = `${creation.progress / creation.growthCost * 100}%`;
      }
    }
    plots.innerHTML = creation ? (window.SceneryCreationArt?.sprite(creation.typeId, creation.progress, creation.growthCost) || "") : (window.SceneryCreationArt?.sprite(preset?.defaultType || "tree", 0, 20) || "");
    return;
  }
}

function renderSummaryProgress(selector, ratio) {
  const progress = document.querySelector(selector);
  if (progress.children.length !== SUMMARY_PROGRESS_SEGMENTS) {
    progress.innerHTML = Array.from(
      { length: SUMMARY_PROGRESS_SEGMENTS },
      () => "<i></i>",
    ).join("");
  }
  const completedSegments = Math.round(
    Math.min(1, Math.max(0, Number(ratio) || 0)) * SUMMARY_PROGRESS_SEGMENTS,
  );
  [...progress.children].forEach((segment, index) => {
    segment.classList.toggle("complete", index < completedSegments);
  });
  progress.dataset.completedSegments = String(completedSegments);
}

function renderSummary() {
  const activeTasks = state.tasks.filter((task) => !task.archived);
  const todoDone = activeTasks.filter((task) => task.status === "done").length;
  const scheduledHabits = state.habits.filter(isHabitScheduledToday);
  const habitDone = scheduledHabits.filter(isHabitCompleteToday).length;
  const total = activeTasks.length + scheduledHabits.length;
  const completed = todoDone + habitDone;
  const habitProgress = scheduledHabits.reduce(
    (sum, habit) => sum + getHabitProgressRatio(habit),
    0,
  );
  const progressScore = todoDone + habitProgress;
  const percent = total ? Math.round((progressScore / total) * 100) : 0;

  document.querySelector("#farmCoinBalance").textContent = state.coins;
  document.querySelector("#marketFarmMoneyBalance").textContent = state.farmMoney;
  document.querySelector(".nav-coin").classList.toggle("negative", state.coins < 0);
  document.querySelector("#completedCount").textContent = completed;
  document.querySelector("#progressPercent").textContent = `${percent}%`;
  document.querySelector("#progressBar").style.width = `${percent}%`;
  document.querySelector("#todoDone").textContent = todoDone;
  document.querySelector("#todoTotal").textContent = activeTasks.length;
  document.querySelector("#habitDone").textContent = habitDone;
  document.querySelector("#habitTotal").textContent = scheduledHabits.length;
  renderSummaryProgress("#stripTaskProgress", activeTasks.length ? todoDone / activeTasks.length : 0);
  renderSummaryProgress("#stripHabitProgress", scheduledHabits.length ? habitProgress / scheduledHabits.length : 0);
  const rewardProgressMinutes = Math.floor(state.focusRewardSeconds / 60);
  const rewardRemainingMinutes = Math.ceil((3600 - state.focusRewardSeconds) / 60);
  document.querySelector("#rewardFocusMinutes").textContent = rewardRemainingMinutes;
  document.querySelector("#summaryFocusMinutes").textContent = rewardProgressMinutes;
  document.querySelector("#focusRewardBar").style.width = `${(state.focusRewardSeconds / 3600) * 100}%`;
}

function render() {
  renderGroups();
  renderTasks();
  renderHabits();
  renderHabitHeatmap();
  renderFarm();
  renderFocusPicker();
  renderSummary();
  saveState();
}

function renderHabitUpdates() {
  renderHabits();
  renderHabitHeatmap();
  renderFocusPicker();
  updateDailyFocusQuote();
  renderSummary();
  renderFarm();
  saveState();
}

// archived_at lives outside the bulk task snapshot sync (see
// syncTaskDatabaseSnapshot) because tasks_archive_only_when_done needs it
// paired with status='done' exactly, which that generic upload can't
// guarantee for every row in one shot. This RPC re-checks status itself.
async function syncTaskArchivedFlag(taskId, archived) {
  if (!supabaseClient || !activeAuthUser) return;
  try {
    const { error } = await supabaseClient.rpc("set_my_task_archived", {
      p_task_id: taskId,
      p_archived: archived,
    });
    if (error) throw error;
  } catch (error) {
    console.warn("Farmodoro set_my_task_archived failed", error);
  }
}

function maintainTaskArchive() {
  const today = toProductivityDateString();
  const now = Date.now();
  const archiveRetentionMs = 30 * 24 * 60 * 60 * 1000;
  let changed = false;

  state.tasks.forEach((task) => {
    if (
      task.status === "done" &&
      !task.archived &&
      task.completedDate &&
      task.completedDate < today
    ) {
      task.archived = true;
      task.archivedAt = new Date().toISOString();
      changed = true;
      void syncTaskArchivedFlag(task.id, true);
    }
  });

  const retainedTasks = state.tasks.filter((task) => {
    if (!task.archived || !task.archivedAt) return true;
    const archivedTime = Date.parse(task.archivedAt);
    const retained = !Number.isFinite(archivedTime) || now - archivedTime < archiveRetentionMs;
    if (!retained) pendingTaskDatabaseDeletes.add(task.id);
    return retained;
  });

  if (retainedTasks.length !== state.tasks.length) {
    state.tasks = retainedTasks;
    changed = true;
  }

  return changed;
}

// Completion is granted optimistically here (for instant UI feedback) and
// then confirmed against complete_my_task/uncomplete_my_task, which decide
// "is this already done" with a single row lock in Postgres. That closes
// the cross-device race where two devices each saw the task as "not done
// yet" and both granted a reward before either learned about the other's
// change -- confirmTaskCompletionWithServer corrects the local optimistic
// coin count back down if the server reports this device lost that race.
function confirmTaskCompletionWithServer(task, optimisticCycleId, optimisticReward, usedFreePass = false) {
  const userId = activeAuthUser?.id;
  farmWalletMutationVersion += 1;
  farmWalletMutationChain = farmWalletMutationChain
    .then(async () => {
      if (activeAuthUser?.id !== userId || farmWalletUserId !== userId) return;
      const { data, error } = await supabaseClient.rpc("complete_my_task", {
        p_task_id: task.id,
        p_used_free_pass: usedFreePass,
      });
      if (error) throw error;
      if (activeAuthUser?.id !== userId || farmWalletUserId !== userId) return;
      farmWalletMutationVersion += 1;
      state.coins = Number(data.coinBalance);
      const currentTask = state.tasks.find((entry) => entry.id === task.id);
      if (currentTask && currentTask.completionCycleId === optimisticCycleId) {
        currentTask.completionReward = Number(data.completionReward) || currentTask.completionReward;
        currentTask.completionCycleId = data.completionCycleId || currentTask.completionCycleId;
        currentTask.completedDate = data.completedOn || currentTask.completedDate;
      }
      renderSummary();
      renderFarm();
    })
    .catch((error) => {
      console.error("Farmodoro task completion could not be confirmed", error);
      if (activeAuthUser?.id !== userId || farmWalletUserId !== userId) return;
      state.coins = Math.max(0, state.coins - optimisticReward);
      renderSummary();
      renderFarm();
      showToast(`할 일 완료를 저장하지 못했어 · ${error?.message || "알 수 없는 오류"}`);
    });
}

function confirmTaskUncompletionWithServer(task, nextStatus, optimisticRefund) {
  const userId = activeAuthUser?.id;
  farmWalletMutationVersion += 1;
  farmWalletMutationChain = farmWalletMutationChain
    .then(async () => {
      if (activeAuthUser?.id !== userId || farmWalletUserId !== userId) return;
      const { data, error } = await supabaseClient.rpc("uncomplete_my_task", {
        p_task_id: task.id,
        p_next_status: nextStatus,
      });
      if (error) throw error;
      if (activeAuthUser?.id !== userId || farmWalletUserId !== userId) return;
      farmWalletMutationVersion += 1;
      state.coins = Number(data.coinBalance);
      if (data.farmMoneyBalance != null) state.farmMoney = Number(data.farmMoneyBalance);
      if (data.legacyPassRefundAmount > 0) showToast(`예전에 사용한 프리패스 ${Number(data.legacyPassRefundAmount).toLocaleString()} Farm Money를 돌려줬어.`);
      renderSummary();
      renderFarm();
    })
    .catch((error) => {
      console.error("Farmodoro task undo could not be confirmed", error);
      if (activeAuthUser?.id !== userId || farmWalletUserId !== userId) return;
      state.coins += optimisticRefund;
      renderSummary();
      renderFarm();
      showToast(`완료 취소를 저장하지 못했어 · ${error?.message || "알 수 없는 오류"}`);
    });
}

function confirmTaskStatusWithServer(taskId, nextStatus, previousStatus) {
  const userId = activeAuthUser?.id;
  const previousSync = taskStatusSyncChains.get(taskId) ?? Promise.resolve();
  const sync = previousSync
    .catch(() => {})
    .then(async () => {
      if (!userId || activeAuthUser?.id !== userId) return;
      await syncTaskDatabaseImmediately();
      productivityRealtimeMutedUntil = Math.max(productivityRealtimeMutedUntil, Date.now() + 5000);
      const { data, error } = await supabaseClient
        .from("tasks")
        .update({ status: nextStatus })
        .eq("id", taskId)
        .eq("user_id", userId)
        .in("status", ["waiting", "doing"])
        .select("status")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("할 일 상태가 이미 다른 곳에서 변경됐어");
      productivityRealtimeMutedUntil = Math.max(productivityRealtimeMutedUntil, Date.now() + 1500);
    });

  taskStatusSyncChains.set(taskId, sync);
  void sync
    .catch((error) => {
      console.error("Farmodoro task status could not be saved", error);
      if (activeAuthUser?.id !== userId) return;
      const currentTask = state.tasks.find((task) => task.id === taskId);
      if (currentTask?.status === nextStatus) {
        currentTask.status = previousStatus;
        render();
      }
      showToast(`상태를 저장하지 못했어 · ${error?.message || "알 수 없는 오류"}`);
    })
    .finally(() => {
      if (taskStatusSyncChains.get(taskId) === sync) taskStatusSyncChains.delete(taskId);
    });
}

function moveTaskTo(id, nextStatus) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || task.status === nextStatus) return;

  const previousStatus = task.status;
  const changesCompletion = previousStatus === "done" || nextStatus === "done";
  if (changesCompletion && !farmWalletHydrated) {
    showToast("지갑 데이터를 불러오는 중이야");
    return;
  }
  task.status = nextStatus;
  let stoppedLinkedFocus = false;

  if (previousStatus !== "done" && nextStatus === "done") {
    const reward = productionCoinReward();
    const optimisticCycleId = createUuid();
    task.completionCycleId = optimisticCycleId;
    task.completionReward = reward;
    task.completedWithFreePass = false;
    task.completedDate = toProductivityDateString();
    state.coins += reward;
    confirmTaskCompletionWithServer(task, optimisticCycleId, reward);
    if (activeFocus?.type === "task" && activeFocus.id === task.id) {
      activeFocus = null;
      stopFocusTimer();
      if (focusMode === "linked") {
        resetToFocus();
      } else {
        focusRuntimeByMode.linked = {
          seconds: 0,
          phase: "focus",
          started: false,
        };
        updateMiniFocusTimer();
      }
      stoppedLinkedFocus = true;
      scheduleFocusTimerDatabaseSync(0);
    }
    showToast(
      stoppedLinkedFocus
        ? `완료 ${reward} Coin 획득 · 집중 측정 종료`
        : `완료 ${reward} Coin 획득`,
    );
  } else if (previousStatus === "done" && nextStatus !== "done") {
    const returnedReward = task.completionReward ?? 1;
    task.completionReward = 0;
    task.completedDate = "";
    // A task can only be archived while done (tasks_archive_only_when_done
    // check constraint) -- undoing completion on an already-archived task
    // without also clearing these left status="waiting"/"doing" sitting next
    // to a non-null archived_at, which the next bulk sync of ANY task would
    // then reject outright (repeating "DB 저장 실패" toast forever since the
    // failed sync's signature never gets marked as synced).
    task.archived = false;
    task.archivedAt = "";
    task.completedWithFreePass = false;
    state.coins = Math.max(0, state.coins - returnedReward);
    confirmTaskUncompletionWithServer(task, nextStatus, returnedReward);
    showToast(`완료를 취소했어 현재 ${state.coins} Coin`);
  } else {
    confirmTaskStatusWithServer(task.id, nextStatus, previousStatus);
    showToast(nextStatus === "doing" ? "진행 중으로 옮겼어" : "대기로 옮겼어");
  }

  render();
}

// Same cross-device race as tasks (see confirmTaskCompletionWithServer):
// the local reward is granted optimistically for instant feedback, then
// complete_my_habit/uncomplete_my_habit confirm it against a single row
// lock in Postgres so a near-simultaneous completion from another device
// can't grant the reward twice.
function confirmHabitCompletionWithServer(habit, recordDate, progressValue, optimisticCycleId, optimisticReward, usedFreePass = false) {
  const userId = activeAuthUser?.id;
  farmWalletMutationVersion += 1;
  farmWalletMutationChain = farmWalletMutationChain
    .then(async () => {
      if (activeAuthUser?.id !== userId || farmWalletUserId !== userId) return;
      const { data, error } = await supabaseClient.rpc("complete_my_habit", {
        p_habit_id: habit.id,
        p_record_date: recordDate,
        p_progress_value: progressValue,
        p_used_free_pass: usedFreePass,
      });
      if (error) throw error;
      if (activeAuthUser?.id !== userId || farmWalletUserId !== userId) return;
      farmWalletMutationVersion += 1;
      state.coins = Number(data.coinBalance);
      const currentHabit = state.habits.find((entry) => entry.id === habit.id);
      const meta = currentHabit?.recordMetaByDate?.[recordDate];
      if (meta && meta.completionCycleId === optimisticCycleId) {
        meta.completionReward = Number(data.completionReward) || meta.completionReward;
        meta.completionCycleId = data.completionCycleId || meta.completionCycleId;
        if (recordDate === toProductivityDateString()) {
          currentHabit.completionReward = meta.completionReward;
        }
      }
      renderSummary();
      renderFarm();
    })
    .catch((error) => {
      console.error("Farmodoro habit completion could not be confirmed", error);
      if (activeAuthUser?.id !== userId || farmWalletUserId !== userId) return;
      state.coins = Math.max(0, state.coins - optimisticReward);
      renderSummary();
      renderFarm();
      showToast(`습관 완료를 저장하지 못했어 · ${error?.message || "알 수 없는 오류"}`);
    });
}

function confirmHabitUncompletionWithServer(habit, recordDate, optimisticRefund) {
  const userId = activeAuthUser?.id;
  farmWalletMutationVersion += 1;
  farmWalletMutationChain = farmWalletMutationChain
    .then(async () => {
      if (activeAuthUser?.id !== userId || farmWalletUserId !== userId) return;
      const { data, error } = await supabaseClient.rpc("uncomplete_my_habit", {
        p_habit_id: habit.id,
        p_record_date: recordDate,
      });
      if (error) throw error;
      if (activeAuthUser?.id !== userId || farmWalletUserId !== userId) return;
      farmWalletMutationVersion += 1;
      state.coins = Number(data.coinBalance);
      if (data.farmMoneyBalance != null) state.farmMoney = Number(data.farmMoneyBalance);
      if (data.legacyPassRefundAmount > 0) showToast(`예전에 사용한 프리패스 ${Number(data.legacyPassRefundAmount).toLocaleString()} Farm Money를 돌려줬어.`);
      renderSummary();
      renderFarm();
    })
    .catch((error) => {
      console.error("Farmodoro habit undo could not be confirmed", error);
      if (activeAuthUser?.id !== userId || farmWalletUserId !== userId) return;
      state.coins += optimisticRefund;
      renderSummary();
      renderFarm();
      showToast(`완료 취소를 저장하지 못했어 · ${error?.message || "알 수 없는 오류"}`);
    });
}

function applyHabitCompletionChange(habit, wasComplete, complete, today = toProductivityDateString()) {
  if (wasComplete === complete) return null;
  const isToday = today === toProductivityDateString();
  if (!farmWalletHydrated) {
    showToast("지갑 데이터를 불러오는 중이야");
    return null;
  }
  if (isToday) {
    habit.complete = complete;
    habit.completedDate = complete ? today : "";
  }
  habit.completionDates = complete
    ? [...new Set([...habit.completionDates, today])]
    : habit.completionDates.filter((date) => date !== today);
  habit.recordMetaByDate ??= {};

  const progressValue = habit.measureType === "count"
    ? Math.max(0, Number(habit.progressByDate?.[today] ?? 0))
    : (complete ? getHabitTargetForDate(habit, today) : 0);

  if (complete) {
    const reward = productionCoinReward();
    const completedAt = new Date().toISOString();
    const optimisticCycleId = createUuid();
    if (isToday) {
      habit.completionReward = reward;
      habit.completedWithFreePass = false;
    }
    habit.recordMetaByDate[today] = {
      completedAt,
      completionReward: reward,
      completedWithFreePass: false,
      completionCycleId: optimisticCycleId,
    };
    state.coins += reward;
    confirmHabitCompletionWithServer(habit, today, progressValue, optimisticCycleId, reward);
    return { complete: true, reward };
  }

  const reward = habit.completionReward ?? 1;
  habit.completionReward = 0;
  habit.completedWithFreePass = false;
  habit.recordMetaByDate[today] = {
    completedAt: null,
    completionReward: 0,
    completedWithFreePass: false,
    completionCycleId: null,
  };
  state.coins = Math.max(0, state.coins - reward);
  confirmHabitUncompletionWithServer(habit, today, reward);
  return { complete: false, reward };
}

function toggleHabit(id) {
  const habit = state.habits.find((item) => item.id === id);
  if (!habit) return;
  if (!isHabitScheduledToday(habit)) {
    showToast("오늘 일정에 없는 습관이야");
    return;
  }

  const wasComplete = isHabitCompleteToday(habit);
  const result = applyHabitCompletionChange(habit, wasComplete, !wasComplete);
  if (!result) return;
  showToast(
    result.complete
      ? `습관 완료 ${result.reward} Coin 획득`
      : `완료를 취소했어 현재 ${state.coins} Coin`,
  );
  renderHabitUpdates();
  scheduleTaskDatabaseSync(0);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2100);
}

function updateFocusDisplay() {
  const runtime = focusRuntimeByMode[focusMode];
  if (focusMode === "linked" && runningFocusMode !== "linked" && activeFocus?.type === "habit") {
    const item = getFocusItem();
    if (item && refreshHabitTimerDate(runtime, item)) {
      focusSeconds = runtime.seconds;
      focusSessionStarted = runtime.started;
      updateFocusActionButton();
      renderHabits();
    }
  }
  // Matches the action button's own overtime test -- the ring must never say
  // OVERTIME while the button offers a fresh set.
  const inOvertime =
    focusMode === "quick" && timerPhase === "focus" && Boolean(runtime.overtime) && runtime.started;
  const displaySeconds = inOvertime ? (runtime.overtimeSeconds ?? 0) : focusSeconds;
  const minutes = String(Math.floor(displaySeconds / 60)).padStart(2, "0");
  const seconds = String(displaySeconds % 60).padStart(2, "0");
  const settings = getFocusSettings();
  const item = focusMode === "linked" ? getFocusItem() : null;
  const isLinkedStopwatch = focusMode === "linked" && Boolean(activeFocus) && !runtime.countdown;
  const totalSeconds = Math.max(
    1,
    focusMode === "linked" && activeFocus?.type === "habit" && item
      ? (runtime.sessionMinutes ?? getHabitFocusMinutes(item)) * 60
      : (timerPhase === "focus" ? settings.focusMinutes : settings.breakMinutes) * 60,
  );
  const remainingRatio = isLinkedStopwatch || inOvertime
    ? 1
    : Math.max(0, Math.min(1, focusSeconds / totalSeconds));
  const timerCircumference = 2 * Math.PI * 46;
  const timerRing = document.querySelector(".timer-ring");
  document.querySelector("#focusTime").textContent = `${inOvertime ? "+" : ""}${minutes}:${seconds}`;
  timerRing.style.setProperty(
    "--timer-offset",
    `${timerCircumference * (1 - remainingRatio)}`,
  );
  timerRing.style.setProperty(
    "--timer-ring-color",
    inOvertime ? "#e8895f" : timerPhase === "focus" ? "#ffd65c" : "#9bd9bd",
  );
  timerRing.querySelector("span").textContent = isLinkedStopwatch
    ? "STOPWATCH"
    : inOvertime
      ? "OVERTIME"
      : timerPhase === "focus"
        ? "FOCUS"
        : "BREAK";
  updateMiniFocusTimer();
}

function updateMiniFocusTimer() {
  const fullTimerVisible = currentPage === "focus";
  const linkedRuntime = focusRuntimeByMode.linked;
  const linkedRunning = runningFocusMode === "linked";
  document.querySelectorAll("[data-focus-habit]").forEach((button) => {
    const isActive = activeFocus?.type === "habit" && button.dataset.focusHabit === activeFocus.id;
    button.classList.toggle("active", isActive);
    button.textContent = isActive
      ? linkedRunning
        ? "◷ 집중 중"
        : "◷ 계속하기"
      : "◷ 집중 시작";
  });
  const visibleMode =
    runningFocusMode ||
    (focusRuntimeByMode[focusMode]?.started
      ? focusMode
      : ["linked", "quick"].find((mode) => focusRuntimeByMode[mode].started)) ||
    null;
  const runtime = visibleMode ? focusRuntimeByMode[visibleMode] : null;
  const timerRunning = Boolean(visibleMode && runningFocusMode === visibleMode);
  miniFocusMode = visibleMode;
  miniFocusTimer.hidden = !runtime?.started || fullTimerVisible;
  if (miniFocusTimer.hidden) return;
  requestAnimationFrame(clampMiniFocusPosition);

  const item = visibleMode === "linked" ? getFocusItem() : null;
  const inOvertime = visibleMode === "quick" && runtime.phase === "focus" && Boolean(runtime.overtime);
  const displaySeconds = inOvertime ? (runtime.overtimeSeconds ?? 0) : runtime.seconds;
  const minutes = String(Math.floor(displaySeconds / 60)).padStart(2, "0");
  const seconds = String(displaySeconds % 60).padStart(2, "0");
  miniFocusStatus.textContent = inOvertime
    ? "초과 집중 중"
    : runtime.phase === "break"
      ? "휴식 중"
      : timerRunning
        ? "집중 중"
        : "일시정지";
  miniFocusTitle.textContent =
    runtime.phase === "break"
      ? visibleMode === "quick"
        ? "빠른 집중 휴식"
        : "다음 집중을 위한 휴식"
      : visibleMode === "quick"
        ? "빠른 집중"
        : item?.title ?? "항목 집중";
  miniFocusTime.textContent = `${inOvertime ? "+" : ""}${minutes}:${seconds}`;
  miniFocusPause.textContent = timerRunning ? "일시정지" : "계속";

}

const MINI_FOCUS_POSITION_KEY = "farmodoro-mini-focus-position";

function clampMiniFocusPosition() {
  if (!focusFloatingStatus.style.left || miniFocusTimer.hidden) return;
  const rect = focusFloatingStatus.getBoundingClientRect();
  const left = Math.min(Math.max(8, rect.left), Math.max(8, innerWidth - rect.width - 8));
  const top = Math.min(Math.max(8, rect.top), Math.max(8, innerHeight - rect.height - 8));
  focusFloatingStatus.style.left = `${left}px`;
  focusFloatingStatus.style.top = `${top}px`;
  focusFloatingStatus.style.right = "auto";
  focusFloatingStatus.style.bottom = "auto";
}

function saveMiniFocusPosition() {
  if (!focusFloatingStatus.style.left) return;
  localStorage.setItem(MINI_FOCUS_POSITION_KEY, JSON.stringify({
    left: Number.parseFloat(focusFloatingStatus.style.left),
    top: Number.parseFloat(focusFloatingStatus.style.top),
  }));
}

try {
  const savedMiniFocusPosition = JSON.parse(localStorage.getItem(MINI_FOCUS_POSITION_KEY) || "null");
  if (Number.isFinite(savedMiniFocusPosition?.left) && Number.isFinite(savedMiniFocusPosition?.top)) {
    focusFloatingStatus.style.left = `${savedMiniFocusPosition.left}px`;
    focusFloatingStatus.style.top = `${savedMiniFocusPosition.top}px`;
    focusFloatingStatus.style.right = "auto";
    focusFloatingStatus.style.bottom = "auto";
  }
} catch {
  localStorage.removeItem(MINI_FOCUS_POSITION_KEY);
}

miniFocusTimer.querySelector(".mini-focus-main").addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const rect = focusFloatingStatus.getBoundingClientRect();
  focusFloatingStatus.style.left = `${rect.left}px`;
  focusFloatingStatus.style.top = `${rect.top}px`;
  focusFloatingStatus.style.right = "auto";
  focusFloatingStatus.style.bottom = "auto";
  miniFocusDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    left: rect.left,
    top: rect.top,
    moved: false,
  };
  miniFocusTimer.setPointerCapture(event.pointerId);
});

miniFocusTimer.addEventListener("pointermove", (event) => {
  if (!miniFocusDrag || event.pointerId !== miniFocusDrag.pointerId) return;
  const deltaX = event.clientX - miniFocusDrag.startX;
  const deltaY = event.clientY - miniFocusDrag.startY;
  if (!miniFocusDrag.moved && Math.hypot(deltaX, deltaY) < 4) return;
  miniFocusDrag.moved = true;
  event.preventDefault();
  const rect = focusFloatingStatus.getBoundingClientRect();
  const left = Math.min(Math.max(8, miniFocusDrag.left + deltaX), Math.max(8, innerWidth - rect.width - 8));
  const top = Math.min(Math.max(8, miniFocusDrag.top + deltaY), Math.max(8, innerHeight - rect.height - 8));
  focusFloatingStatus.style.left = `${left}px`;
  focusFloatingStatus.style.top = `${top}px`;
  miniFocusTimer.classList.add("dragging");
});

function finishMiniFocusDrag(event) {
  if (!miniFocusDrag || event.pointerId !== miniFocusDrag.pointerId) return;
  const moved = miniFocusDrag.moved;
  miniFocusDrag = null;
  miniFocusTimer.classList.remove("dragging");
  if (moved) {
    suppressMiniFocusOpen = true;
    saveMiniFocusPosition();
  }
}

miniFocusTimer.addEventListener("pointerup", finishMiniFocusDrag);
miniFocusTimer.addEventListener("pointercancel", finishMiniFocusDrag);
miniFocusTimer.addEventListener("click", (event) => {
  if (!suppressMiniFocusOpen) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  suppressMiniFocusOpen = false;
}, true);
window.addEventListener("resize", clampMiniFocusPosition);

// Fit the title's own box and, in fullscreen, leave room for the coin bar.
function fitFocusTargetText() {
  const target = document.querySelector("#focusTarget");
  if (!target) return;
  target.style.fontSize = "";
  const minFontSize = 14;
  let fontSize = parseFloat(getComputedStyle(target).fontSize);
  if (!fontSize) return;
  const stage = target.closest(".focus-page-stage");
  const reward = target.closest(".focus-copy")?.querySelector(".focus-reward");
  const fullscreen = stage && document.fullscreenElement === stage;
  const overflows = () => target.scrollHeight > target.clientHeight + 1
    || target.scrollWidth > target.clientWidth + 1
    || (fullscreen && reward
      && reward.getBoundingClientRect().bottom > stage.getBoundingClientRect().bottom - 16);
  let guard = 0;
  while (fontSize > minFontSize && overflows() && guard < 40) {
    fontSize = Math.max(minFontSize, fontSize - 1);
    target.style.fontSize = `${fontSize}px`;
    guard += 1;
  }
}

function updateFocusTarget() {
  const item = getFocusItem();
  const settings = getFocusSettings();
  const target = document.querySelector("#focusTarget");
  const description = document.querySelector("#focusDescription");
  const focusButton = document.querySelector("#focusButton");
  description.hidden = false;

  if (timerPhase === "break") {
    focusButton.disabled = false;
    target.textContent = "잠깐 쉬어";
    description.textContent = `${settings.breakMinutes}분 휴식 후 다시 집중해`;
    fitFocusTargetText();
    return;
  }

  if (focusMode === "quick") {
    focusButton.disabled = false;
    const sessionMinutes = focusRuntimeByMode.quick.sessionMinutes ?? settings.focusMinutes;
    if (focusRuntimeByMode.quick.overtime && focusRuntimeByMode.quick.started) {
      target.textContent = "목표 시간을 넘겨서 집중 중이야";
      description.textContent = "쉬고 싶으면 아래 버튼을 눌러줘";
      description.hidden = false;
      fitFocusTargetText();
      return;
    }
    target.textContent = `그냥 ${sessionMinutes}분 집중해`;
    description.textContent = "";
    description.hidden = true;
    fitFocusTargetText();
    return;
  }

  if (!item) {
    focusButton.disabled = true;
    target.textContent = "집중할 항목을 선택해";
    description.textContent = "";
    description.hidden = true;
    fitFocusTargetText();
    return;
  }

  focusButton.disabled = false;
  target.textContent = item.title;
  description.textContent = activeFocus?.type === "habit"
    ? `오늘 목표 ${focusRuntimeByMode.linked.sessionMinutes ?? getHabitFocusMinutes(item)}분 · 남은 시간만큼 집중해`
    : "";
  description.hidden = !description.textContent;
  fitFocusTargetText();
}

function stopFocusTimer() {
  clearInterval(focusInterval);
  focusLastTickAt = 0;
  runningFocusMode = null;
  focusRunning = false;
  void syncFocusWakeLock();
}

function saveCurrentFocusRuntime() {
  focusRuntimeByMode[focusMode] = {
    ...focusRuntimeByMode[focusMode],
    seconds: focusSeconds,
    phase: timerPhase,
    started: focusSessionStarted,
    ...(focusMode === "quick" ? { sessionMinutes: focusRuntimeByMode.quick.sessionMinutes ?? getFocusSettings("quick").focusMinutes } : {}),
  };
}

function stopProductivityRealtime() {
  if (productivityRealtimeRefreshTimer) clearTimeout(productivityRealtimeRefreshTimer);
  productivityRealtimeRefreshTimer = null;
  if (productivityRealtimeChannel && supabaseClient) {
    void supabaseClient.removeChannel(productivityRealtimeChannel);
  }
  productivityRealtimeChannel = null;
}

function scheduleProductivityRealtimeRefresh(userId) {
  if (activeAuthUser?.id !== userId) return;
  if (productivityRealtimeRefreshTimer) clearTimeout(productivityRealtimeRefreshTimer);
  productivityRealtimeRefreshTimer = window.setTimeout(async () => {
    productivityRealtimeRefreshTimer = null;
    if (activeAuthUser?.id !== userId) return;
    try {
      // The loader preserves pending local edits before accepting remote data.
      await loadTaskDataFromDatabase(activeAuthUser, { force: true });
    } catch (error) {
      console.warn("Farmodoro realtime productivity refresh failed", error);
    }
  }, Math.max(500, productivityRealtimeMutedUntil - Date.now()));
}

function startProductivityRealtime(user) {
  stopProductivityRealtime();
  if (!supabaseClient || !user) return;

  const handleChange = () => {
    scheduleProductivityRealtimeRefresh(user.id);
  };
  productivityRealtimeChannel = subscribeToUserTables(
    supabaseClient.channel(`productivity:${user.id}`),
    ["task_groups", "tasks", "habits"],
    user.id,
    handleChange,
  )
    .on("postgres_changes", { event: "*", schema: "public", table: "habit_daily_records" }, handleChange)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") scheduleProductivityRealtimeRefresh(user.id);
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn(`Farmodoro productivity realtime subscription: ${status}`);
      }
    });
}

function getPendingFocusSeconds() {
  return pendingFocusSeconds.linked +
    pendingFocusSeconds.quick +
    focusProgressEventQueue.reduce((sum, event) => sum + event.seconds, 0);
}

function refreshFocusProgress() {
  state.focusRewardSeconds = Math.max(0, (focusProgressServerSeconds + getPendingFocusSeconds()) % 3600);
  renderSummary();
}

function resetFocusProgressState() {
  focusProgressServerSeconds = 0;
  focusProgressApiUnavailable = false;
  focusProgressSyncPromise = null;
  pendingFocusSeconds.linked = 0;
  pendingFocusSeconds.quick = 0;
  focusProgressEventQueue.length = 0;
  pendingFarmFocusBatches.length = 0;
  focusOutboxUserId = null;
  focusRecoveryTimerCheckpoint = null;
}

async function loadFocusProgress(user) {
  if (!supabaseClient || !user) return;
  const requestedUserId = user.id;
  restorePendingFocusEvents(requestedUserId);
  const { data, error } = await supabaseClient.rpc("get_my_focus_progress");
  if (activeAuthUser?.id !== requestedUserId) return;
  if (error) {
    if (["42883", "PGRST202"].includes(error.code)) {
      focusProgressApiUnavailable = true;
      console.warn("Farmodoro focus progress API is unavailable; unconfirmed seconds remain in the local outbox", error);
      return;
    }
    console.error("Farmodoro focus progress could not be loaded", error);
    return;
  }
  focusProgressApiUnavailable = false;
  focusProgressServerSeconds = Math.max(0, Math.floor(Number(data?.progressSeconds) || 0)) % 3600;
  refreshFocusProgress();
  renderFarm();
  if (focusProgressEventQueue.length || pendingFarmFocusBatches.length) void flushFocusTime();
}

function stagePendingFocusEvents() {
  const batches = pendingFarmFocusBatches.splice(0);
  // Preserve accrued seconds from older callers and saved outboxes.
  for (const mode of ["linked", "quick"]) {
    const captured = batches.filter((batch) => batch.mode === mode).reduce((sum, batch) => sum + batch.seconds, 0);
    if (pendingFocusSeconds[mode] > captured) {
      batches.push({ mode, seconds: pendingFocusSeconds[mode] - captured });
    }
    pendingFocusSeconds[mode] = 0;
  }
  for (const batch of batches) {
    let remaining = batch.seconds;
    while (remaining > 0) {
      const seconds = Math.min(600, remaining);
      focusProgressEventQueue.push({ id: crypto.randomUUID(), mode: batch.mode, seconds });
      remaining -= seconds;
    }
  }
  persistPendingFocusEvents();
}

async function flushFocusTime() {
  if (focusProgressApiUnavailable || !activeAuthUser) return;
  stagePendingFocusEvents();
  if (!focusProgressEventQueue.length) return;
  if (focusProgressSyncPromise) return focusProgressSyncPromise;

  const userId = activeAuthUser.id;
  const sessionGeneration = farmSessionGeneration;
  const sync = (async () => {
    while (focusProgressEventQueue.length && activeAuthUser?.id === userId && farmSessionGeneration === sessionGeneration) {
      const event = focusProgressEventQueue[0];
      const baseParams = {
        p_event_id: event.id,
        p_focus_mode: event.mode,
        p_elapsed_seconds: event.seconds,
      };
      const write = farmWalletMutationChain.then(async () => {
        if (activeAuthUser?.id !== userId || farmSessionGeneration !== sessionGeneration) return;
        farmWalletMutationVersion += 1;
        const { data, error } = await supabaseClient.rpc("record_my_focus_time", baseParams);
        if (error) throw error;
        if (activeAuthUser?.id !== userId || farmSessionGeneration !== sessionGeneration) return;
        focusProgressEventQueue.shift();
        persistPendingFocusEvents();
        focusProgressServerSeconds = Math.max(0, Math.floor(Number(data?.progressSeconds) || 0)) % 3600;
        if (Number.isFinite(Number(data?.coinBalance))) {
          farmWalletMutationVersion += 1;
          state.coins = Number(data.coinBalance);
        }
        const awardedCoins = Math.max(0, Number(data?.awardedCoins) || 0);
        if (awardedCoins > 0) showToast(`집중 누적 60분 완료 ${awardedCoins} Coin을 받았어`);
        refreshFocusProgress();
        renderFarm();
      });
      farmWalletMutationChain = write.catch(() => {});
      await write;
    }
  })()
    .catch((error) => {
      console.error("Farmodoro focus time could not be saved", error);
      if (["42883", "PGRST202"].includes(error?.code)) {
        console.warn("Farmodoro: record_my_focus_time unavailable; unconfirmed seconds remain in the local outbox");
        focusProgressApiUnavailable = true;
        showToast("집중 시간 저장을 쓸 수 없어. 미저장 시간은 이 기기에 보관했어");
      }
    })
    .finally(() => {
      if (focusProgressSyncPromise === sync) focusProgressSyncPromise = null;
    });
  focusProgressSyncPromise = sync;
  return sync;
}

function addFocusSecond(elapsedSeconds = 1, mode = focusMode) {
  elapsedSeconds = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));
  if (!elapsedSeconds) return;
  const progressMode = mode === "quick" ? "quick" : "linked";
  pendingFocusSeconds[progressMode] += elapsedSeconds;
  const previous = pendingFarmFocusBatches.at(-1);
  if (previous?.mode === progressMode) {
    previous.seconds += elapsedSeconds;
  } else {
    pendingFarmFocusBatches.push({ mode: progressMode, seconds: elapsedSeconds });
  }
  persistPendingFocusEvents();
  state.focusRewardSeconds = Math.max(0, (focusProgressServerSeconds + getPendingFocusSeconds()) % 3600);
}

function updateProductivityFocusLabels() {
  document.querySelectorAll("[data-task-id]").forEach((card) => {
    const task = state.tasks.find((item) => item.id === card.dataset.taskId);
    const label = card.querySelector("[data-task-focus-time]");
    if (task && label) label.textContent = `◷ 집중 ${formatFocusTime(task.focusSeconds)}`;
  });
  document.querySelectorAll("[data-habit-id]").forEach((card) => {
    const habit = state.habits.find((item) => item.id === card.dataset.habitId);
    const label = card.querySelector("[data-habit-focus-time]");
    if (habit && label) {
      label.textContent = `· 집중 ${formatFocusTime(getHabitDailyFocusSeconds(habit, label.dataset.focusDate))}`;
    }
  });
}

function updateActiveFocusCard() {
  if (runningFocusMode !== "linked" || !activeFocus) return;
  const item = getFocusItem();
  if (!item) return;

  if (activeFocus.type === "task") {
    document.querySelectorAll(`[data-task-id="${item.id}"] [data-task-focus-time]`).forEach((button) => {
      button.textContent = `◷ 집중 ${formatFocusTime(item.focusSeconds)}`;
    });
    return;
  }

  document
    .querySelectorAll(`[data-habit-id="${item.id}"] [data-habit-focus-time]`)
    .forEach((label) => {
      label.textContent = `· 집중 ${formatFocusTime(getHabitDailyFocusSeconds(item, label.dataset.focusDate))}`;
    });
}

function updateFocusActionButton() {
  void syncFocusWakeLock();
  const button = document.querySelector("#focusButton");
  const runtime = focusRuntimeByMode[focusMode];
  const skipBreakButton = document.querySelector("#focusSkipBreakButton");
  if (skipBreakButton) {
    skipBreakButton.hidden = !(focusMode === "quick" && timerPhase === "break");
  }
  if (runningFocusMode === focusMode && focusMode === "quick" && runtime.phase === "focus" && runtime.overtime) {
    const quickSettings = getFocusSettings("quick");
    button.innerHTML = quickSettings.breakEnabled
      ? `<span>■</span> ${quickSettings.breakMinutes}분 휴식 시작`
      : "<span>■</span> 세트 종료";
    return;
  }
  if (runningFocusMode === focusMode) {
    button.innerHTML = timerPhase === "focus"
      ? "<span>Ⅱ</span> 집중 멈춤"
      : "<span>Ⅱ</span> 휴식 멈춤";
    return;
  }
  if (focusSessionStarted) {
    button.innerHTML = timerPhase === "break"
      ? `<span>▶</span> ${getFocusSettings("quick").breakMinutes}분 휴식`
      : "<span>▶</span> 계속하기";
    return;
  }
  if (focusMode === "quick") {
    const sessionMinutes = focusRuntimeByMode.quick.sessionMinutes ?? getFocusSettings("quick").focusMinutes;
    button.innerHTML = `<span>▶</span> ${sessionMinutes}분 시작`;
    return;
  }
  button.innerHTML = activeFocus?.type === "task"
    ? "<span>▶</span> 스톱워치 시작"
    : "<span>▶</span> 집중 시작";
}

let focusAlarmAudioCtx = null;
let focusAlarmIntervalId = null;

// Synthesized instead of a bundled asset -- two short sine beeps via
// WebAudio, repeated on an interval until the user mutes or dismisses.
function playFocusAlarmTone() {
  try {
    focusAlarmAudioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    const ctx = focusAlarmAudioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    [0, 0.18].forEach((offset, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = index === 0 ? 880 : 1175;
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(0.2, now + offset + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + offset + 0.16);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.2);
    });
  } catch (error) {
    console.warn("Farmodoro focus alarm tone failed", error);
  }
}

function startFocusAlarmSound() {
  stopFocusAlarmSound();
  playFocusAlarmTone();
  focusAlarmIntervalId = setInterval(playFocusAlarmTone, 1800);
  const muteButton = document.querySelector("#focusAlertMuteButton");
  if (muteButton) muteButton.hidden = false;
}

function stopFocusAlarmSound() {
  if (focusAlarmIntervalId) {
    clearInterval(focusAlarmIntervalId);
    focusAlarmIntervalId = null;
  }
  const muteButton = document.querySelector("#focusAlertMuteButton");
  if (muteButton) muteButton.hidden = true;
}

function showFocusAlertBanner(title, subtitle) {
  const banner = document.querySelector("#focusAlertBanner");
  if (!banner) return;
  document.querySelector("#focusAlertTitle").textContent = title;
  document.querySelector("#focusAlertSubtitle").textContent = subtitle;
  banner.classList.remove("hidden");
  startFocusAlarmSound();
}

function hideFocusAlertBanner() {
  const banner = document.querySelector("#focusAlertBanner");
  if (banner) banner.classList.add("hidden");
  stopFocusAlarmSound();
}

async function showFocusSystemNotification(title, body) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || !isFarmPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    if (!await registration.pushManager.getSubscription()) return;
    await registration.showNotification(title, {
      body,
      icon: "./assets/icons/pixel-clock-192.png?v=268",
      tag: "farmodoro-timer-end",
      data: { url: "./#focus" },
    });
  } catch (error) {
    console.warn("Farmodoro focus notification failed", error);
  }
}

function notifyFocusPhaseComplete(kind) {
  // A live timer shows the banner and device notification immediately;
  // the scheduled push remains the fallback while the app is suspended.
  cancelFarmPushNotification("timer_end", "");
  let title;
  let subtitle;
  if (kind === "habit") {
    title = "습관 목표 시간을 채웠어";
    subtitle = "오늘 정한 시간만큼 집중했어. 잠깐 쉬어도 좋아.";
  } else if (kind === "focus") {
    title = "집중 시간이 끝났어";
    subtitle = "계속 집중 중이면 그대로 둬도 돼. 쉬고 싶으면 집중 버튼을 눌러줘.";
  } else {
    title = "휴식이 끝났어";
    subtitle = "버튼을 눌러 다시 집중을 시작해줘.";
  }
  showFocusAlertBanner(title, subtitle);
  void showFocusSystemNotification(title, subtitle);
}

function advanceRunningFocusTimer(mode) {
  const ownsTimer = isFocusTimerOwner();
  const runtime = focusRuntimeByMode[mode];
  const now = Date.now();
  if (!focusLastTickAt) {
    focusLastTickAt = now;
    return { advanced: false, finished: false };
  }

  const elapsedSeconds = Math.floor((now - focusLastTickAt) / 1000);
  if (elapsedSeconds < 1) return { advanced: false, finished: false };
  const startAt = focusLastTickAt;
  focusLastTickAt += elapsedSeconds * 1000;

  const item = mode === "linked" ? getFocusItem() : null;
  const isLinkedStopwatch = mode === "linked" && Boolean(activeFocus) && !runtime.countdown;
  // Quick-mode focus keeps counting overtime; habit countdowns finish at zero.
  const isQuickOvertime = mode === "quick" && runtime.phase === "focus" && Boolean(runtime.overtime);
  const countsUp = isLinkedStopwatch || isQuickOvertime;
  const remainingSeconds = runtime.seconds;
  const previousDate = runtime.date;
  const habitCountdown = item && activeFocus?.type === "habit" && runtime.countdown;
  const appliedSeconds = habitCountdown
    ? advanceHabitTimer(runtime, item, startAt, elapsedSeconds, ownsTimer)
    : countsUp || (mode === "quick" && runtime.phase === "focus")
    ? elapsedSeconds
    : Math.min(elapsedSeconds, runtime.seconds);
  if (isQuickOvertime) {
    runtime.overtimeSeconds = (runtime.overtimeSeconds ?? 0) + appliedSeconds;
  } else if (!habitCountdown) {
    runtime.seconds = isLinkedStopwatch
      ? runtime.seconds + appliedSeconds
      : Math.max(0, runtime.seconds - appliedSeconds);
  }
  if (ownsTimer && runtime.phase === "focus") {
    if (habitCountdown && previousDate && previousDate !== runtime.date && runtime.seconds > 0) {
      scheduleFarmPushNotification("timer_end", "", now + runtime.seconds * 1000,
        "집중이 끝났어", "쉬고 싶으면 앱을 열어줘");
      renderHabits();
      scheduleFocusTimerDatabaseSync(0);
    }
    if (item) {
      if (activeFocus?.type === "task") {
        item.focusSeconds = (item.focusSeconds ?? 0) + appliedSeconds;
      } else if (activeFocus?.type === "habit" && !habitCountdown) {
        const today = toProductivityDateString();
        item.focusSecondsByDate ??= {};
        item.focusSecondsByDate[today] = getHabitDailyFocusSeconds(item, today) + appliedSeconds;
      }
    }
    addFocusSecond(appliedSeconds, mode);
    updateActiveFocusCard();
  }

  if (focusMode === mode) {
    focusSeconds = runtime.seconds;
    timerPhase = runtime.phase;
    updateFocusDisplay();
  } else {
    updateMiniFocusTimer();
  }

  if (!isLinkedStopwatch && !isQuickOvertime && mode === "quick" && runtime.phase === "focus" && runtime.seconds <= 0) {
    runtime.overtime = true;
    runtime.overtimeSeconds = Math.max(0, elapsedSeconds - remainingSeconds);
    if (ownsTimer) notifyFocusPhaseComplete("focus");
    if (focusMode === mode) {
      updateFocusActionButton();
      // The heading/description switch to the "over your target" copy that
      // explains what the button now does, so they have to move together.
      updateFocusTarget();
    }
    return { advanced: true, finished: false };
  }

  if (ownsTimer && !isLinkedStopwatch && !isQuickOvertime && runtime.seconds <= 0) {
    if (runtime.phase === "focus") {
      finishFocusRuntime(mode);
      if (mode === "linked") notifyFocusPhaseComplete("habit");
    }
    else finishBreakRuntime(mode);
    return { advanced: true, finished: true };
  }
  return { advanced: true, finished: false };
}

function resetToFocus() {
  timerPhase = "focus";
  if (focusMode === "linked") {
    prepareLinkedFocusRuntime();
  } else {
    focusSessionStarted = false;
    const quickSettings = getFocusSettings("quick");
    focusSeconds = quickSettings.focusMinutes * 60;
    focusRuntimeByMode.quick.sessionMinutes = quickSettings.focusMinutes;
    // A reset drops the finished set entirely. saveCurrentFocusRuntime()
    // spreads the old runtime, so leaving the overtime flag behind would keep
    // the ring painting "+MM:SS" OVERTIME next to a "N분 시작" button -- and the
    // next set would then count up instead of counting down.
    focusRuntimeByMode.quick.overtime = false;
    focusRuntimeByMode.quick.overtimeSeconds = 0;
    saveCurrentFocusRuntime();
  }
  updateFocusActionButton();
  updateFocusDisplay();
  updateFocusTarget();
}

function finishFocusRuntime(mode) {
  const runtime = focusRuntimeByMode[mode];
  const item = mode === "linked" ? getFocusItem() : null;

  clearInterval(focusInterval);
  focusLastTickAt = 0;
  runningFocusMode = null;
  runtime.overtime = false;
  runtime.overtimeSeconds = 0;
  hideFocusAlertBanner();
  cancelFarmPushNotification("timer_end", "");

  if (mode === "linked") {
    let completionResult = null;
    const recordDate = runtime.date || toProductivityDateString();
    if (item && activeFocus?.type === "habit" && !item.completionDates.includes(recordDate)) {
      completionResult = applyHabitCompletionChange(item, false, true, recordDate);
    }
    activeFocus = null;
    runtime.phase = "focus";
    runtime.seconds = 0;
    runtime.started = false;
    if (focusMode === mode) {
      focusRunning = false;
      timerPhase = "focus";
      focusSeconds = 0;
      focusSessionStarted = false;
      updateFocusActionButton();
      updateFocusDisplay();
      updateFocusTarget();
    }
    render();
    scheduleTaskDatabaseSync(0);
    showToast(
      completionResult
        ? `습관 목표를 채웠어 ${completionResult.reward} Coin 획득`
        : "집중 측정을 완료했어",
    );
    scheduleFocusTimerDatabaseSync(0);
    void flushFocusTime();
    return;
  }

  const settings = getFocusSettings("quick");
  if (settings.breakEnabled) {
    runtime.phase = "break";
    runtime.seconds = settings.breakMinutes * 60;
    runtime.started = true;

    if (focusMode === mode) {
      timerPhase = runtime.phase;
      focusSeconds = runtime.seconds;
      focusSessionStarted = runtime.started;
    }
    // Ending overtime already means "start the break now" -- go straight into
    // the running timer instead of leaving it paused and making the user
    // press the button a second time.
    runningFocusMode = mode;
    focusTimerOwnerId = FOCUS_TIMER_CLIENT_ID;
    focusTimerLastHeartbeatAt = Date.now();
    focusLastTickAt = Date.now();
    if (focusMode === mode) {
      focusRunning = true;
      updateFocusActionButton();
      updateFocusDisplay();
      updateFocusTarget();
    }
    startFocusTickInterval(mode);
    scheduleFarmPushNotification(
      "timer_end",
      "",
      Date.now() + runtime.seconds * 1000,
      "휴식이 끝났어",
      "다시 집중을 시작해봐",
    );
  } else {
    runtime.phase = "focus";
    runtime.seconds = settings.focusMinutes * 60;
    runtime.started = false;

    if (focusMode === mode) {
      focusRunning = false;
      timerPhase = runtime.phase;
      focusSeconds = runtime.seconds;
      focusSessionStarted = runtime.started;
      updateFocusActionButton();
      updateFocusDisplay();
      updateFocusTarget();
    }
  }
  updateMiniFocusTimer();
  render();
  showToast("집중 세트를 완료했어");
  scheduleFocusTimerDatabaseSync(0);
  void flushFocusTime();
}

function finishBreakRuntime(mode, { skipped = false } = {}) {
  const runtime = focusRuntimeByMode[mode];
  const settings = getFocusSettings(mode);
  clearInterval(focusInterval);
  focusLastTickAt = 0;
  runningFocusMode = null;
  cancelFarmPushNotification("timer_end", "");
  runtime.phase = "focus";
  runtime.seconds = settings.focusMinutes * 60;
  runtime.started = false;
  runtime.overtime = false;
  runtime.overtimeSeconds = 0;
  if (focusMode === mode) {
    focusRunning = false;
    timerPhase = "focus";
    focusSeconds = runtime.seconds;
    focusSessionStarted = false;
    updateFocusActionButton();
    updateFocusDisplay();
    updateFocusTarget();
  }
  updateMiniFocusTimer();
  showToast(skipped ? "휴식을 건너뛰었어" : "휴식 끝 다음 세트를 시작하면 돼");
  // A deliberate skip doesn't need the alarm-style banner+sound that a
  // passive "break ended while you weren't looking" completion does.
  if (!skipped) notifyFocusPhaseComplete("break");
  scheduleFocusTimerDatabaseSync(0);
}

function skipFocusBreak() {
  if (focusMode !== "quick" || timerPhase !== "break") return;
  if (runningFocusMode === "quick") {
    const tickResult = advanceRunningFocusTimer("quick");
    if (tickResult.finished) return;
  }
  finishBreakRuntime("quick", { skipped: true });
}

function startFocusTickInterval(mode) {
  clearInterval(focusInterval);
  focusInterval = setInterval(() => {
    const tickResult = advanceRunningFocusTimer(mode);
    if (!tickResult.advanced || tickResult.finished || !isFocusTimerOwner()) return;
    if (Date.now() - focusTimerLastHeartbeatAt >= 15000) {
      focusTimerLastHeartbeatAt = Date.now();
      saveState();
      renderSummary();
      scheduleTaskDatabaseSync(0);
      scheduleFocusTimerDatabaseSync(0);
      void flushFocusTime();
    }
  }, 250);
}

// Minimizing the window or switching to another app/tab lets browsers
// throttle (or fully suspend) a background setInterval for as long as it's
// hidden, so the running timer can sit "stuck" until something forces it to
// catch up. Called on visibilitychange->visible and window focus: applies
// the real elapsed time immediately (advanceRunningFocusTimer works off
// Date.now(), so it's correct regardless of how long the tick was starved)
// and starts a fresh interval rather than trusting the old one to recover.
function resumeFocusTimerAfterBackground() {
  if (!runningFocusMode) {
    updateFocusDisplay();
    return;
  }
  const tickResult = advanceRunningFocusTimer(runningFocusMode);
  if (!tickResult.finished) startFocusTickInterval(runningFocusMode);
}

function toggleFocus() {
  const button = document.querySelector("#focusButton");
  const runtime = focusRuntimeByMode[focusMode];
  if (focusMode === "linked" && runningFocusMode !== "linked" && activeFocus?.type === "habit") {
    const item = getFocusItem();
    if (item && refreshHabitTimerDate(runtime, item)) focusSeconds = runtime.seconds;
  }

  if (runningFocusMode === focusMode) {
    focusTimerOwnerId = FOCUS_TIMER_CLIENT_ID;
    const tickResult = advanceRunningFocusTimer(focusMode);
    if (tickResult.finished) return;
    // Clicking the button while a quick-mode set is in overtime ends the
    // set (starts the break, or resets for the next set) instead of just
    // pausing -- this is the "휴식"/"세트 종료" action the overtime banner
    // is waiting on.
    if (focusMode === "quick" && runtime.phase === "focus" && runtime.overtime) {
      finishFocusRuntime(focusMode);
      return;
    }
    clearInterval(focusInterval);
    focusLastTickAt = 0;
    runningFocusMode = null;
    focusRunning = false;
    cancelFarmPushNotification("timer_end", "");
    updateFocusActionButton();
    updateMiniFocusTimer();
    renderTasks();
    renderHabits();
    renderFocusPicker();
    renderSummary();
    saveState();
    scheduleTaskDatabaseSync(0);
    scheduleFocusTimerDatabaseSync(0);
    void flushFocusTime();
    return;
  }

  if (runningFocusMode && runningFocusMode !== focusMode) {
    advanceRunningFocusTimer(runningFocusMode);
    clearInterval(focusInterval);
  }

  hideFocusAlertBanner();
  // Starting a set from an idle timer must drop any leftover overtime state --
  // a stale flag (from a runtime saved before it was cleared) would make
  // advanceRunningFocusTimer count up from the start instead of counting down.
  if (focusMode === "quick" && !runtime.started) {
    runtime.overtime = false;
    runtime.overtimeSeconds = 0;
  }
  runningFocusMode = focusMode;
  focusTimerOwnerId = FOCUS_TIMER_CLIENT_ID;
  focusTimerLastHeartbeatAt = Date.now();
  focusRunning = true;
  focusSessionStarted = true;
  runtime.started = true;
  runtime.phase = timerPhase;
  runtime.seconds = focusSeconds;
  focusLastTickAt = Date.now();

  updateFocusActionButton();

  // Habit countdowns and quick sessions have a notification end time.
  const isLinkedStopwatch = focusMode === "linked" && Boolean(activeFocus) && !runtime.countdown;
  if (!isLinkedStopwatch) {
    scheduleFarmPushNotification(
      "timer_end",
      "",
      Date.now() + runtime.seconds * 1000,
      runtime.phase === "focus" ? "집중이 끝났어" : "휴식이 끝났어",
      runtime.phase === "focus" ? "쉬고 싶으면 앱을 열어줘" : "다시 집중을 시작해봐",
    );
  }

  const startedMode = focusMode;
  startFocusTickInterval(startedMode);
  updateMiniFocusTimer();
  scheduleFocusTimerDatabaseSync(0);
}

function endFocusSession(mode = focusMode) {
  focusTimerOwnerId = FOCUS_TIMER_CLIENT_ID;
  hideFocusAlertBanner();
  cancelFarmPushNotification("timer_end", "");
  if (focusMode !== mode) setFocusMode(mode);
  stopFocusTimer();
  if (mode === "linked") activeFocus = null;
  resetToFocus();
  renderTasks();
  renderHabits();
  renderFocusPicker();
  renderSummary();
  saveState();
  scheduleTaskDatabaseSync(0);
  scheduleFocusTimerDatabaseSync(0);
  void flushFocusTime();
  showToast(mode === "quick" ? "빠른 집중을 종료했어" : "집중 측정을 종료했어");
}

function setFocusMode(mode) {
  saveCurrentFocusRuntime();
  focusMode = mode;
  focusModeUserSelected = true;
  const runtime = focusRuntimeByMode[mode];
  timerPhase = runtime.phase;
  focusSeconds = runtime.seconds;
  focusSessionStarted = runtime.started;
  focusRunning = runningFocusMode === mode;

  document.querySelectorAll("[data-focus-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.focusMode === mode);
  });

  focusSettingsButton.hidden = mode === "linked";
  if (mode === "linked") {
    closeFocusSettings();
  }
  updateFocusActionButton();
  updateFocusDisplay();
  updateFocusTarget();
  syncFocusSettingsForm();
}

function startItemFocus(type, id) {
  const collection = type === "task" ? state.tasks : state.habits;
  const item = collection.find((entry) => entry.id === id);
  if (!item) return;
  if (type === "habit" && !getHabitFocusMinutes(item)) return;
  if (type === "task" && item.status === "done") {
    showToast("이미 완료한 할 일이야");
    return;
  }
  if (type === "habit" && isHabitCompleteToday(item)) {
    showToast("이미 완료한 습관이야");
    return;
  }
  if (type === "habit" && !isHabitScheduledToday(item)) {
    showToast("오늘 일정에 없는 습관이야");
    return;
  }

  saveCurrentFocusRuntime();
  stopFocusTimer();
  focusMode = "linked";
  focusModeUserSelected = true;
  timerPhase = "focus";
  activeFocus = { type, id };
  focusSettingsButton.hidden = true;
  closeFocusSettings();

  prepareLinkedFocusRuntime(item);
  document.querySelectorAll("[data-focus-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.focusMode === "linked");
  });
  updateFocusDisplay();
  updateFocusTarget();
  render();
  toggleFocus();
  scheduleTaskDatabaseSync(0);
  showToast(`‘${item.title}’ 집중 측정을 시작했어`);
}

document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "long",
}).format(new Date());

const THEMED_DATE_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
let themedDateCalendar = null;
let activeThemedDateInput = null;
let themedDateView = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12);

function parseDateInputValue(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return date.getFullYear() === Number(match[1]) &&
    date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[3])
    ? date
    : null;
}

function toDateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatThemedDateValue(value) {
  const date = parseDateInputValue(value);
  return date ? `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일` : "연도-월-일";
}

function refreshThemedDateTrigger(input) {
  const trigger = input?._themedDateTrigger;
  if (!trigger) return;
  const valueLabel = trigger.querySelector(".themed-date-value");
  if (valueLabel) valueLabel.textContent = formatThemedDateValue(input.value);
  trigger.classList.toggle("empty", !input.value);
}

function isThemedDateAllowed(input, value) {
  if (!value) return true;
  if (input.min && value < input.min) return false;
  if (input.max && value > input.max) return false;
  return true;
}

function ensureThemedDateCalendar() {
  if (themedDateCalendar) return themedDateCalendar;
  themedDateCalendar = document.createElement("section");
  themedDateCalendar.className = "themed-date-calendar hidden";
  themedDateCalendar.setAttribute("role", "dialog");
  themedDateCalendar.setAttribute("aria-label", "날짜 선택");
  document.body.append(themedDateCalendar);
  themedDateCalendar.addEventListener("click", (event) => {
    const navigation = event.target.closest("[data-date-calendar-nav]");
    if (navigation) {
      themedDateView = new Date(
        themedDateView.getFullYear(),
        themedDateView.getMonth() + Number(navigation.dataset.dateCalendarNav),
        1,
        12,
      );
      renderThemedDateCalendar();
      positionThemedDateCalendar();
      return;
    }

    const dateButton = event.target.closest("[data-calendar-date]");
    if (dateButton && !dateButton.disabled) {
      setThemedDateValue(dateButton.dataset.calendarDate);
      return;
    }

    if (event.target.closest("[data-date-calendar-clear]")) {
      setThemedDateValue("");
      return;
    }

    if (event.target.closest("[data-date-calendar-today]")) {
      const today = toProductivityDateString();
      if (activeThemedDateInput && isThemedDateAllowed(activeThemedDateInput, today)) {
        setThemedDateValue(today);
      }
    }
  });
  return themedDateCalendar;
}

function renderThemedDateCalendar() {
  if (!activeThemedDateInput) return;
  const calendar = ensureThemedDateCalendar();
  const selectedValue = activeThemedDateInput.value;
  const todayValue = toProductivityDateString();
  const firstDay = new Date(themedDateView.getFullYear(), themedDateView.getMonth(), 1, 12);
  const sundayOffset = firstDay.getDay();
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - sundayOffset);
  const dayButtons = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const value = toDateInputValue(date);
    const outsideMonth = date.getMonth() !== themedDateView.getMonth();
    const disabled = !isThemedDateAllowed(activeThemedDateInput, value);
    return `
      <button
        class="themed-date-day${outsideMonth ? " outside" : ""}${value === selectedValue ? " selected" : ""}${value === todayValue ? " today" : ""}"
        type="button"
        data-calendar-date="${value}"
        aria-label="${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일"
        ${value === todayValue ? 'aria-current="date"' : ""}
        ${disabled ? "disabled" : ""}
      >${date.getDate()}</button>
    `;
  }).join("");
  calendar.innerHTML = `
    <header class="themed-date-header">
      <button type="button" data-date-calendar-nav="-1" aria-label="이전 달">‹</button>
      <strong>${themedDateView.getFullYear()}년 ${themedDateView.getMonth() + 1}월</strong>
      <button type="button" data-date-calendar-nav="1" aria-label="다음 달">›</button>
    </header>
    <div class="themed-date-weekdays">${THEMED_DATE_WEEKDAYS.map((day) => `<span>${day}</span>`).join("")}</div>
    <div class="themed-date-days">${dayButtons}</div>
    <footer class="themed-date-actions">
      <button type="button" data-date-calendar-clear>삭제</button>
      <button type="button" data-date-calendar-today ${isThemedDateAllowed(activeThemedDateInput, todayValue) ? "" : "disabled"}>오늘</button>
    </footer>
  `;
}

function positionThemedDateCalendar() {
  if (!activeThemedDateInput || !themedDateCalendar || themedDateCalendar.classList.contains("hidden")) return;
  const trigger = activeThemedDateInput._themedDateTrigger;
  const triggerRect = trigger.getBoundingClientRect();
  const calendarWidth = Math.min(310, window.innerWidth - 20);
  themedDateCalendar.style.width = `${calendarWidth}px`;
  const calendarHeight = themedDateCalendar.offsetHeight;
  const left = Math.min(
    Math.max(10, triggerRect.left),
    Math.max(10, window.innerWidth - calendarWidth - 10),
  );
  const belowTop = triggerRect.bottom + 8;
  const top = belowTop + calendarHeight <= window.innerHeight - 10
    ? belowTop
    : Math.max(10, triggerRect.top - calendarHeight - 8);
  themedDateCalendar.style.left = `${Math.round(left)}px`;
  themedDateCalendar.style.top = `${Math.round(top)}px`;
}

function openThemedDateCalendar(input) {
  activeThemedDateInput = input;
  const selectedDate = parseDateInputValue(input.value) ?? new Date();
  themedDateView = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 12);
  const calendar = ensureThemedDateCalendar();
  renderThemedDateCalendar();
  calendar.classList.remove("hidden");
  input._themedDateTrigger.setAttribute("aria-expanded", "true");
  requestAnimationFrame(positionThemedDateCalendar);
}

function closeThemedDateCalendar() {
  if (!activeThemedDateInput) return false;
  activeThemedDateInput._themedDateTrigger?.setAttribute("aria-expanded", "false");
  themedDateCalendar?.classList.add("hidden");
  activeThemedDateInput = null;
  return true;
}

function setThemedDateValue(value) {
  if (!activeThemedDateInput) return;
  const input = activeThemedDateInput;
  const trigger = input._themedDateTrigger;
  input.value = value;
  refreshThemedDateTrigger(input);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  closeThemedDateCalendar();
  trigger.focus();
}

function initializeThemedDatePickers(root = document) {
  root.querySelectorAll('input[type="date"]:not([data-themed-date-ready])').forEach((input) => {
    input.dataset.themedDateReady = "true";
    const wrapper = document.createElement("div");
    wrapper.className = "themed-date-picker";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.append(input);
    input.classList.add("themed-date-native");
    input.tabIndex = -1;

    const trigger = document.createElement("button");
    const fieldLabel =
      input.getAttribute("aria-label") ||
      input.closest("label")?.querySelector("span")?.textContent?.trim() ||
      "날짜";
    trigger.className = "themed-date-trigger empty";
    trigger.type = "button";
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", `${fieldLabel} 선택`);
    trigger.innerHTML = `
      <span class="themed-date-value"></span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" /></svg>
    `;
    wrapper.append(trigger);
    input._themedDateTrigger = trigger;
    refreshThemedDateTrigger(input);

    trigger.addEventListener("click", () => {
      if (activeThemedDateInput === input) closeThemedDateCalendar();
      else openThemedDateCalendar(input);
    });
    input.addEventListener("change", () => refreshThemedDateTrigger(input));
  });
}

initializeThemedDatePickers();

document.addEventListener("pointerdown", (event) => {
  if (!activeThemedDateInput) return;
  const trigger = activeThemedDateInput._themedDateTrigger;
  if (!themedDateCalendar?.contains(event.target) && !trigger?.contains(event.target)) {
    closeThemedDateCalendar();
  }
});

window.addEventListener("resize", positionThemedDateCalendar);
window.addEventListener("scroll", positionThemedDateCalendar, true);

const taskCreateModal = document.querySelector("#taskCreateModal");
function closeTaskCreate() {
  closeTaskInlineEdit();
}
document.querySelectorAll("[data-close-task-create]").forEach(button => {
  button.addEventListener("click", () => {
    closeTaskCreate();
    document.querySelector("#openTaskForm").focus();
  });
});
taskCreateModal.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeTaskCreate();
    document.querySelector("#openTaskForm").focus();
  }
});
document.querySelector("#openTaskForm").addEventListener("click", () => {
  const wasOpen = !taskForm.classList.contains("hidden");
  closeTaskInlineEdit();
  if (wasOpen) return;
  taskCreateModal.classList.remove("hidden");
  document.querySelector("#openTaskForm").setAttribute("aria-expanded", "true");
  taskForm.classList.remove("hidden");
  taskInput.focus();
});

function closeHabitModal() {
  editingHabitId = null;
  closeThemedDateCalendar();
  habitModal.classList.add("hidden");
  habitForm.classList.add("hidden");
  openHabitFormButton.setAttribute("aria-expanded", "false");
}

function resetHabitForm() {
  habitInput.value = "";
  document
    .querySelectorAll('[name="habitWeekday"]')
    .forEach((input) => (input.checked = true));
  habitEndDate.value = "";
  habitStartDate.value = toProductivityDateString();
  habitStartDate.max = toProductivityDateString();
  refreshThemedDateTrigger(habitStartDate);
  refreshThemedDateTrigger(habitEndDate);
}

function openHabitModal(habit = null) {
  habitStartDate.max = toProductivityDateString();
  editingHabitId = habit?.id ?? null;
  habitFocusEnabled.checked = habit?.measureType === "time";
  habitFocusMinutes.value = String(getHabitFocusMinutes(habit, null) || 25);
  if (habit) {
    habitModalKicker.textContent = "EDIT ROUTINE";
    habitModalTitle.textContent = "습관 수정";
    habitModalDescription.textContent = "반복 일정을 다시 설정해";
    habitSubmitButton.textContent = "변경사항 저장";
    habitInput.value = habit.title;
    document.querySelectorAll('[name="habitWeekday"]').forEach((input) => {
      input.checked = habit.weekdays.includes(Number(input.value));
    });
    habitEndDate.value = habit.endDate || "";
    habitStartDate.value = habit.startDate || toProductivityDateString();
    refreshThemedDateTrigger(habitStartDate);
    refreshThemedDateTrigger(habitEndDate);
  } else {
    habitModalKicker.textContent = "NEW ROUTINE";
    habitModalTitle.textContent = "새 습관 등록";
    habitModalDescription.textContent = "반복 일정을 설정해";
    habitSubmitButton.textContent = "습관 추가";
    resetHabitForm();
  }

  document.querySelector("#habitFocusWeekdays").innerHTML = ["월", "화", "수", "목", "금", "토", "일"].map((day, index) => {
    const weekday = index + 1;
    const value = habit?.measureType === "time" ? habit.targetByWeekday?.[weekday] : null;
    return `<label><span>${day}요일 (분)</span><input type="number" data-habit-focus-weekday="${weekday}" min="1" max="9999" step="1" value="${value == null ? "" : Math.min(9999, Math.max(1, Math.floor(Number(value) || 25)))}" /></label>`;
  }).join("");
  updateHabitFocusWeekdayInputs();
  habitModalFormSlot.appendChild(habitForm);
  habitModal.classList.remove("hidden");
  habitForm.classList.remove("hidden");
  openHabitFormButton.setAttribute("aria-expanded", "true");
  window.setTimeout(() => habitInput.focus(), 0);
}

function updateHabitFocusWeekdayInputs() {
  document.querySelector("#habitFocusSettings").hidden = !habitFocusEnabled.checked;
  habitFocusMinutes.disabled = !habitFocusEnabled.checked;
  document.querySelectorAll("[data-habit-focus-weekday]").forEach((input) => {
    input.disabled = !habitFocusEnabled.checked || !habitForm.querySelector(`[name="habitWeekday"][value="${input.dataset.habitFocusWeekday}"]`).checked;
    input.placeholder = `기본 ${habitFocusMinutes.value || 25}`;
  });
}

habitForm.addEventListener("change", (event) => {
  if (event.target.matches('[name="habitWeekday"], #habitFocusEnabled')) updateHabitFocusWeekdayInputs();
});
habitFocusMinutes.addEventListener("input", updateHabitFocusWeekdayInputs);

function openHabitDeleteModal(habit) {
  pendingHabitDeleteId = habit.id;
  habitDeleteName.textContent = `‘${habit.title}’`;
  habitDeleteModal.classList.remove("hidden");
  window.setTimeout(() => confirmHabitDelete.focus(), 0);
}

function closeHabitDeleteModal() {
  pendingHabitDeleteId = null;
  habitDeleteModal.classList.add("hidden");
}

function closeHabitResetModal() {
  habitResetModal.classList.add("hidden");
}

function resetDeletedFocusTarget(type, id) {
  if (activeFocus?.type !== type || activeFocus.id !== id) return false;

  if (runningFocusMode === "linked") {
    if (isFocusTimerOwner()) advanceRunningFocusTimer("linked");
    clearInterval(focusInterval);
    focusLastTickAt = 0;
    runningFocusMode = null;
  }
  activeFocus = null;
  focusRuntimeByMode.linked = { seconds: 0, phase: "focus", started: false };

  if (focusMode === "linked") {
    focusRunning = false;
    timerPhase = "focus";
    focusSeconds = 0;
    focusSessionStarted = false;
    updateFocusActionButton();
    updateFocusDisplay();
    updateFocusTarget();
  }

  updateMiniFocusTimer();
  saveState();
  scheduleFocusTimerDatabaseSync(0);
  void flushFocusTime();
  return true;
}

function deleteTask(task) {
  resetDeletedFocusTarget("task", task.id);
  pendingTaskDatabaseDeletes.add(task.id);
  state.tasks = state.tasks.filter((item) => item.id !== task.id);
  render();
  scheduleTaskDatabaseSync(0);
}

function openTaskDeleteModal(task) {
  pendingTaskDeleteId = task.id;
  const reward = task.completionReward ?? 1;
  taskDeleteName.textContent = `‘${task.title}’`;
  taskDeleteCoinAmount.textContent = `${reward} Coin`;
  taskDeleteModal.classList.remove("hidden");
  window.setTimeout(() => confirmTaskDelete.focus(), 0);
}

function closeTaskDeleteModal() {
  pendingTaskDeleteId = null;
  taskDeleteModal.classList.add("hidden");
}

openHabitFormButton.addEventListener("click", () => {
  if (!habitModal.classList.contains("hidden")) return closeHabitModal();
  openHabitModal();
});

habitModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-habit-modal]")) closeHabitModal();
});

habitDeleteModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-cancel-habit-delete]")) closeHabitDeleteModal();
});

openHabitResetButton.addEventListener("click", () => {
  habitResetModal.classList.remove("hidden");
  window.setTimeout(() => confirmHabitReset.focus(), 0);
});

habitResetModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-cancel-habit-reset]")) closeHabitResetModal();
});

confirmHabitReset.addEventListener("click", async () => {
  if (!taskDataHydrated || !activeAuthUser) {
    showToast("습관 데이터를 불러오는 중이야");
    return;
  }

  confirmHabitReset.disabled = true;
  try {
    await syncTaskDatabaseImmediately();
    if (activeFocus?.type === "habit") {
      resetDeletedFocusTarget("habit", activeFocus.id);
      await syncTaskDatabaseImmediately();
      await flushFocusTime();
    }
    const { error } = await supabaseClient.rpc("reset_my_habits");
    if (error) throw error;

    const today = toProductivityDateString();
    state.habits.forEach((habit) => {
      habit.startDate = today;
      if (habit.endDate && habit.endDate < today) habit.endDate = "";
      habit.complete = false;
      habit.completedDate = "";
      habit.completionDates = [];
      habit.progressByDate = {};
      habit.focusSecondsByDate = {};
      habit.recordMetaByDate = {};
      habit.completionReward = 0;
      habit.completedWithFreePass = false;
    });
    habitRecordSyncSignatures = new Map();
    closeHabitResetModal();
    render();
    await loadTaskDataFromDatabase(activeAuthUser, { force: true });
    showToast("습관을 오늘부터 다시 시작했어");
  } catch (error) {
    console.error("Farmodoro habits could not be reset", error);
    showToast(`습관 초기화에 실패했어${error.message ? `: ${error.message}` : ""}`);
  } finally {
    confirmHabitReset.disabled = false;
  }
});

confirmHabitDelete.addEventListener("click", () => {
  if (pendingHabitDeleteId === null) return;
  resetDeletedFocusTarget("habit", pendingHabitDeleteId);
  pendingHabitDatabaseDeletes.add(pendingHabitDeleteId);
  state.habits = state.habits.filter((habit) => habit.id !== pendingHabitDeleteId);
  closeHabitDeleteModal();
  showToast("습관을 삭제했어");
  render();
  scheduleTaskDatabaseSync(0);
});

document.querySelector("#toggleGroupManager").addEventListener("click", () => {
  if (!groupManager.classList.contains("hidden")) return closeGroupManager();
  groupManager.classList.remove("hidden");
  document.querySelector("#toggleGroupManager").setAttribute("aria-expanded", "true");
  groupInput.focus();
});

document.querySelector("#addGroupButton").addEventListener("click", () => {
  if (!taskDataHydrated) {
    showToast("할 일 데이터를 불러오는 중이야");
    return;
  }
  const name = groupInput.value.trim();
  if (!name) return;
  if (state.groups.some((group) => group.name === name)) {
    showToast("이미 있는 그룹이야");
    return;
  }

  const group = {
    id: createUuid(),
    name,
    colorIndex: Math.floor(Math.random() * GROUP_COLOR_COUNT),
  };
  state.groups.push(group);
  groupInput.value = "";
  render();
  scheduleTaskDatabaseSync(0);
  taskGroup.value = group.id;
  renderGroups();
  showToast(`‘${name}’ 그룹을 추가했어`);
});

groupInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    document.querySelector("#addGroupButton").click();
  }
});

document.querySelector("#groupList").addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-group]");
  if (!deleteButton) return;
  openGroupDeleteDialog(deleteButton.dataset.deleteGroup);
});

confirmGroupDelete.addEventListener("click", async () => {
  const groupId = pendingGroupDeleteId;
  const group = getGroup(groupId);
  if (!group) {
    closeGroupDeleteDialog();
    return;
  }
  confirmGroupDelete.disabled = true;
  pendingGroupDatabaseDeletes.add(groupId);
  state.groups = state.groups.filter((item) => item.id !== groupId);
  if (taskGroupFilter === groupId) taskGroupFilter = "all";
  state.tasks.forEach((task) => {
    if (task.groupId === groupId) task.groupId = null;
  });
  render();
  try {
    await syncTaskDatabaseImmediately();
    closeGroupDeleteDialog();
    showToast(`‘${group?.name ?? "그룹"}’을 삭제하고 할 일은 그룹 없음으로 옮겼어`);
  } catch (error) {
    console.error("Farmodoro task group could not be deleted", error);
    const reason = error.message ? `: ${error.message}` : "";
    showToast(`그룹 삭제를 DB에 반영하지 못했어${reason}`);
    taskDataHydrated = false;
    await loadTaskDataFromDatabase(activeAuthUser);
  } finally {
    confirmGroupDelete.disabled = false;
  }
});

taskDeleteModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-cancel-task-delete]")) closeTaskDeleteModal();
});

confirmTaskDelete.addEventListener("click", async () => {
  const task = state.tasks.find((item) => item.id === pendingTaskDeleteId);
  if (!task) {
    closeTaskDeleteModal();
    return;
  }
  const reward = task.completionReward ?? 1;
  if (!farmWalletHydrated) {
    showToast("지갑 데이터를 불러오는 중이야");
    return;
  }
  confirmTaskDelete.disabled = true;
  try {
    await farmWalletMutationChain;
    await syncTaskDatabaseImmediately();
    const { data, error } = await supabaseClient.rpc("delete_my_completed_task", {
      p_task_id: task.id,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    state.coins = Number(result?.coin_balance ?? state.coins - reward);
    closeTaskDeleteModal();
    deleteTask(task);
    showToast(`할 일을 삭제하고 ${reward} Coin을 차감했어`);
  } catch (error) {
    console.error("Farmodoro completed task could not be deleted", error);
    showToast("완료한 할 일을 삭제하지 못했어. 잠시 후 다시 시도해줘");
  } finally {
    confirmTaskDelete.disabled = false;
  }
});

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!taskDataHydrated) {
    showToast("할 일 데이터를 불러오는 중이야");
    return;
  }
  const title = taskInput.value.trim();
  if (!title) return;

  const editingTask = state.tasks.find((task) => task.id === editingTaskId);
  if (editingTask) {
    editingTask.title = title;
    editingTask.groupId = taskGroup.value || null;
    editingTask.focusSeconds = Math.min(
      9999,
      Math.max(0, Math.floor(Number(taskFocusMinutesInput.value) || 0)),
    ) * 60;
    closeTaskCreate();
    render();
    scheduleTaskDatabaseSync(0);
    showToast("할 일을 수정했어");
    return;
  }

  state.tasks.unshift({
    id: createUuid(),
    title,
    status: "waiting",
    focusSeconds: 0,
    groupId: taskGroup.value || null,
    archived: false,
    archivedAt: "",
    completedDate: "",
  });
  closeTaskCreate();
  showToast("대기 목록에 추가했어");
  render();
  scheduleTaskDatabaseSync(0);
});

taskInput.addEventListener("input", () => autoGrowTextarea(taskInput));
taskInput.addEventListener("keydown", (event) => submitOnEnterUnlessShift(event, taskForm));

habitForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!taskDataHydrated) {
    showToast("습관 데이터를 불러오는 중이야");
    return;
  }
  const title = habitInput.value.trim();
  if (!title) return;
  const weekdays = [...document.querySelectorAll('[name="habitWeekday"]:checked')].map(
    (input) => Number(input.value),
  );

  if (!weekdays.length) {
    showToast("반복할 요일을 하나 이상 선택해");
    return;
  }
  const editingHabit = state.habits.find((habit) => habit.id === editingHabitId);
  const focusMinutes = Number(habitFocusMinutes.value);
  if (habitFocusEnabled.checked && (habitFocusMinutes.value === "" || !Number.isInteger(focusMinutes) || focusMinutes < 1 || focusMinutes > 9999)) {
    showToast("목표 집중 시간은 1~9999분 사이의 정수로 입력해");
    return;
  }
  const targetByWeekday = {};
  for (const input of habitForm.querySelectorAll("[data-habit-focus-weekday]")) {
    if (!habitFocusEnabled.checked) break;
    if (input.value === "") continue;
    const minutes = Number(input.value);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 9999) {
      showToast("요일별 목표 집중 시간은 1~9999분 사이의 정수로 입력해");
      return;
    }
    targetByWeekday[input.dataset.habitFocusWeekday] = minutes;
  }
  const startDate = habitStartDate.value;
  if (!startDate || startDate > toProductivityDateString() || (habitEndDate.value && habitEndDate.value < startDate)) {
    showToast("시작일은 오늘 이전으로, 종료일은 시작일 이후로 설정해");
    return;
  }
  if (editingHabit) {
    Object.assign(editingHabit, {
      title,
      measureType: habitFocusEnabled.checked ? "time" : "amount",
      targetValue: habitFocusEnabled.checked ? focusMinutes : 1,
      targetByWeekday,
      unit: habitFocusEnabled.checked ? "분" : "완료",
      weekdays,
      endDate: habitEndDate.value,
      startDate,
    });
  } else {
    state.habits.push({
      id: createUuid(),
      title,
      complete: false,
      completedDate: "",
      completionDates: [],
      progressByDate: {},
      focusSecondsByDate: {},
      recordMetaByDate: {},
      measureType: habitFocusEnabled.checked ? "time" : "amount",
      targetValue: habitFocusEnabled.checked ? focusMinutes : 1,
      targetByWeekday,
      unit: habitFocusEnabled.checked ? "분" : "완료",
      weekdays,
      startDate,
      endDate: habitEndDate.value,
    });
  }
  const wasEditing = Boolean(editingHabit);
  if (editingHabit && !habitFocusEnabled.checked && activeFocus?.type === "habit" && activeFocus.id === editingHabit.id) {
    endFocusSession("linked");
  }
  closeHabitModal();
  render();
  scheduleTaskDatabaseSync(0);
  showToast(wasEditing ? "습관을 수정했어" : "새 습관을 추가했어");
});

document.querySelector("#taskBoard").addEventListener("click", (event) => {
  const inlineGroupTrigger = event.target.closest("[data-inline-group-trigger]");
  const inlineGroupOption = event.target.closest("[data-inline-task-group]");
  const cancelEditButton = event.target.closest("[data-cancel-task-edit]");
  const focusButton = event.target.closest("[data-focus-task]");
  const editButton = event.target.closest("[data-edit-task]");
  const deleteButton = event.target.closest("[data-delete-task]");
  const archiveButton = event.target.closest("[data-archive-task]");
  const restoreButton = event.target.closest("[data-restore-task]");
  const statusButton = event.target.closest("[data-task-status]");

  if (inlineGroupTrigger) {
    const selector = inlineGroupTrigger.closest(".task-inline-group-select");
    const menu = selector.querySelector(".custom-group-menu");
    const willOpen = menu.classList.contains("hidden");
    menu.classList.toggle("hidden", !willOpen);
    inlineGroupTrigger.setAttribute("aria-expanded", String(willOpen));
    return;
  }
  if (inlineGroupOption) {
    editingTaskGroupId = inlineGroupOption.dataset.inlineTaskGroup || null;
    renderTasks();
    document.querySelector(`[data-task-id="${editingTaskId}"] [data-inline-group-trigger]`)?.focus();
    return;
  }
  if (cancelEditButton) {
    closeTaskInlineEdit();
    return;
  }
  if (statusButton) {
    const taskCard = statusButton.closest("[data-task-id]");
    const task = state.tasks.find((item) => item.id === taskCard?.dataset.taskId);
    if (!task) return;
    moveTaskTo(task.id, statusButton.dataset.taskStatus);
    if (task.status === statusButton.dataset.taskStatus) scheduleTaskDatabaseSync(0);
    return;
  }
  if (focusButton) startItemFocus("task", focusButton.dataset.focusTask);
  if (editButton) {
    const task = state.tasks.find((item) => item.id === editButton.dataset.editTask);
    if (task) openTaskInlineEdit(task);
    return;
  }
  if (archiveButton) {
    const task = state.tasks.find((item) => item.id === archiveButton.dataset.archiveTask);
    if (task) {
      task.archived = true;
      task.archivedAt = new Date().toISOString();
      showToast("완료한 할 일을 보관함에 넣었어");
      render();
      scheduleTaskDatabaseSync(0);
      void syncTaskArchivedFlag(task.id, true);
    }
    return;
  }
  if (restoreButton) {
    const task = state.tasks.find((item) => item.id === restoreButton.dataset.restoreTask);
    if (task) {
      task.archived = false;
      task.archivedAt = "";
      task.completedDate = toProductivityDateString();
      showToast("보관함에서 다시 꺼냈어");
      render();
      scheduleTaskDatabaseSync(0);
      void syncTaskArchivedFlag(task.id, false);
    }
    return;
  }
  if (deleteButton) {
    const task = state.tasks.find((item) => item.id === deleteButton.dataset.deleteTask);
    if (!task) return;
    if (task.status === "done") {
      openTaskDeleteModal(task);
      return;
    }
    deleteTask(task);
    showToast("할 일을 삭제했어");
  }
});

document.querySelector("#taskBoard").addEventListener("input", (event) => {
  if (event.target.matches(".task-inline-title")) {
    editingTaskTitle = event.target.value;
    autoGrowTextarea(event.target);
    return;
  }
  if (event.target.matches(".task-inline-focus-minutes")) {
    editingTaskFocusMinutes = event.target.value;
  }
});

document.querySelector("#taskBoard").addEventListener("keydown", (event) => {
  if (!event.target.matches(".task-inline-title")) return;
  submitOnEnterUnlessShift(event, event.target.closest("[data-inline-task-form]"));
});

document.querySelector("#taskBoard").addEventListener("submit", (event) => {
  const form = event.target.closest("[data-inline-task-form]");
  if (!form) return;
  event.preventDefault();
  const task = state.tasks.find((item) => item.id === form.dataset.inlineTaskForm);
  const title = editingTaskTitle.trim();
  if (!task || !title) return;
  const focusMinutes = Math.min(9999, Math.max(0, Math.floor(Number(editingTaskFocusMinutes) || 0)));
  task.title = title;
  task.groupId = editingTaskGroupId;
  task.focusSeconds = focusMinutes * 60;
  editingTaskId = null;
  editingTaskGroupId = null;
  editingTaskTitle = "";
  editingTaskFocusMinutes = "";
  render();
  scheduleTaskDatabaseSync(0);
  showToast("할 일을 수정했어");
});

document.addEventListener("click", (event) => {
  document.querySelectorAll(".task-inline-group-select .custom-group-menu:not(.hidden)").forEach((menu) => {
    if (!menu.parentElement.contains(event.target)) {
      menu.classList.add("hidden");
      menu.parentElement.querySelector("[data-inline-group-trigger]")?.setAttribute("aria-expanded", "false");
    }
  });
});

document.querySelectorAll("#taskGroupFilters, #todayTaskGroupFilters").forEach((container) => container.addEventListener("click", (event) => {
  const button = event.target.closest("[data-task-group-filter]");
  if (!button) return;
  const nextFilter = button.dataset.taskGroupFilter;
  if (nextFilter === taskGroupFilter) return;
  taskGroupFilter = nextFilter;
  renderTasks();
}));

document.querySelector("#toggleArchiveView").addEventListener("click", () => {
  taskArchiveView = !taskArchiveView;
  renderTasks();
});

document.querySelector("#taskBoard").addEventListener("dragstart", (event) => {
  if (event.target.closest("button, input, select")) {
    event.preventDefault();
    return;
  }
  const card = event.target.closest("[data-task-id]");
  if (!card) return;

  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", card.dataset.taskId);
  requestAnimationFrame(() => card.classList.add("dragging"));
});

document.querySelector("#taskBoard").addEventListener("dragover", (event) => {
  const column = event.target.closest("[data-status]");
  if (!column) return;

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".board-column").forEach((item) => {
    item.classList.toggle("drag-over", item === column);
  });
  document.querySelectorAll(".task-card").forEach((card) => {
    card.classList.remove("drop-before", "drop-after");
  });
  const targetCard = event.target.closest(".task-card:not(.dragging)");
  if (targetCard) {
    const position = event.clientY < targetCard.getBoundingClientRect().top + targetCard.offsetHeight / 2;
    targetCard.classList.add(position ? "drop-before" : "drop-after");
  }
});

function reorderTask(taskId, status, targetId = null, placeAfter = false) {
  const taskIndex = state.tasks.findIndex((task) => task.id === taskId);
  if (taskIndex < 0) return;
  const [task] = state.tasks.splice(taskIndex, 1);
  task.status = status;

  if (targetId !== null && targetId !== taskId) {
    const targetIndex = state.tasks.findIndex((entry) => entry.id === targetId);
    if (targetIndex >= 0) {
      state.tasks.splice(targetIndex + (placeAfter ? 1 : 0), 0, task);
      return;
    }
  }

  const statusIndexes = state.tasks
    .map((entry, index) => (entry.status === status ? index : -1))
    .filter((index) => index >= 0);
  const insertIndex = statusIndexes.length ? statusIndexes.at(-1) + 1 : state.tasks.length;
  state.tasks.splice(insertIndex, 0, task);
}

function commitTaskReorder(taskId, status, targetId = null, placeAfter = false) {
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) return false;
  if (task.status !== status) {
    moveTaskTo(taskId, status);
    if (task.status !== status) return false;
  }
  reorderTask(taskId, status, targetId, placeAfter);
  renderTasks();
  saveState();
  return true;
}

document.querySelector("#taskBoard").addEventListener("drop", async (event) => {
  const column = event.target.closest("[data-status]");
  if (!column) return;

  event.preventDefault();
  const taskId = event.dataTransfer.getData("text/plain");
  const targetCard = event.target.closest(".task-card:not(.dragging)");
  const targetId = targetCard ? targetCard.dataset.taskId : null;
  const placeAfter = targetCard
    ? event.clientY >= targetCard.getBoundingClientRect().top + targetCard.offsetHeight / 2
    : false;
  document.querySelectorAll(".board-column").forEach((item) => item.classList.remove("drag-over"));
  if (!commitTaskReorder(taskId, column.dataset.status, targetId, placeAfter)) return;
  try {
    await syncTaskDatabaseImmediately();
  } catch (error) {
    console.error("Farmodoro task status could not be saved", error);
    const scope = error.syncScope ? ` · ${error.syncScope}` : "";
    const reason = error.message ? `: ${error.message}` : "";
    showToast(`상태 변경을 DB에 저장하지 못했어${scope}${reason}`);
    taskDataHydrated = false;
    await loadTaskDataFromDatabase(activeAuthUser);
  }
});

document.querySelector("#taskBoard").addEventListener("dragend", () => {
  document.querySelectorAll(".board-column").forEach((item) => item.classList.remove("drag-over"));
  document.querySelectorAll(".task-card").forEach((item) => item.classList.remove("dragging", "drop-before", "drop-after"));
});

document.querySelector("#habitList").addEventListener("dragstart", (event) => {
  if (!["today", "habits"].includes(currentPage)) return;
  const card = event.target.closest("[data-habit-id]");
  if (!card) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", card.dataset.habitId);
  requestAnimationFrame(() => card.classList.add("dragging"));
});

document.querySelector("#habitList").addEventListener("dragover", (event) => {
  if (!["today", "habits"].includes(currentPage)) return;
  const target = event.target.closest(".habit-item:not(.dragging)");
  if (!target) return;
  event.preventDefault();
  document.querySelectorAll(".habit-item").forEach((card) => card.classList.remove("drop-before", "drop-after"));
  const placeBefore = event.clientY < target.getBoundingClientRect().top + target.offsetHeight / 2;
  target.classList.add(placeBefore ? "drop-before" : "drop-after");
});

document.querySelector("#habitList").addEventListener("drop", (event) => {
  if (!["today", "habits"].includes(currentPage)) return;
  event.preventDefault();
  const habitId = event.dataTransfer.getData("text/plain");
  const target = event.target.closest(".habit-item:not(.dragging)");
  if (!habitId || !target) return;
  const targetId = target.dataset.habitId;
  const placeAfter = event.clientY >= target.getBoundingClientRect().top + target.offsetHeight / 2;
  if (!reorderHabit(habitId, targetId, placeAfter)) return;
  renderHabits();
  saveState();
  void syncTaskDatabaseImmediately().catch((error) => {
    console.error("Farmodoro habit reorder could not be saved", error);
    showToast("순서 변경을 저장하지 못했어");
  });
});

function reorderHabit(habitId, targetId, placeAfter = false) {
  const sourceIndex = state.habits.findIndex((habit) => habit.id === habitId);
  if (sourceIndex < 0 || habitId === targetId) return false;
  const [habit] = state.habits.splice(sourceIndex, 1);
  const targetIndex = state.habits.findIndex((entry) => entry.id === targetId);
  if (targetIndex < 0) {
    state.habits.splice(sourceIndex, 0, habit);
    return false;
  }
  state.habits.splice(targetIndex + (placeAfter ? 1 : 0), 0, habit);
  return true;
}

document.querySelector("#habitList").addEventListener("dragend", () => {
  document.querySelectorAll(".habit-item").forEach((card) => card.classList.remove("dragging", "drop-before", "drop-after"));
});

function clearPointerDropState() {
  document.querySelectorAll(".board-column").forEach((item) => item.classList.remove("drag-over"));
  document.querySelectorAll(".task-card, .habit-item").forEach((item) => {
    item.classList.remove("dragging", "drop-before", "drop-after");
  });
}

function getTouchDropPlacement(container, cardSelector, clientX, clientY) {
  const candidates = [...container.querySelectorAll(`${cardSelector}:not(.dragging)`)];
  if (!candidates.length) return null;

  const target = candidates
    .map((card) => {
      const rect = card.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      return {
        card,
        rect,
        centerX,
        centerY,
        distance: Math.hypot(clientX - centerX, clientY - centerY),
      };
    })
    .reduce((closest, candidate) =>
      candidate.distance < closest.distance ? candidate : closest,
    );
  const columnCount = getComputedStyle(container).gridTemplateColumns
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const placeAfter = columnCount > 1 && clientY >= target.rect.top && clientY <= target.rect.bottom
    ? clientX >= target.centerX
    : clientY >= target.centerY;

  return { target: target.card, placeAfter };
}

function installTouchReorder(container, type) {
  let dragState = null;
  let holdTimer = null;
  let suppressClickUntil = 0;

  const cardSelector = type === "task" ? "[data-task-id]" : "[data-habit-id]";

  const clearDrag = () => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    dragState = null;
    document.body.classList.remove("touch-reordering");
    clearPointerDropState();
  };

  container.addEventListener("contextmenu", (event) => {
    const card = event.target.closest(type === "task" ? ".task-card" : ".habit-item.reorderable");
    if (card && !event.target.closest("input, select, textarea")) event.preventDefault();
  });

  container.addEventListener("click", (event) => {
    if (Date.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  container.addEventListener("touchstart", (event) => {
    if (
      event.touches.length !== 1 ||
      event.target.closest("input, select, textarea, a") ||
      (type === "task" && event.target.closest("button"))
    ) return;
    const card = event.target.closest(cardSelector);
    if (
      !card ||
      card.classList.contains("editing") ||
      card.classList.contains("archived") ||
      (type === "habit" && !["today", "habits"].includes(currentPage))
    ) return;
    const touch = event.touches[0];
    dragState = {
      card,
      id: type === "task" ? card.dataset.taskId : card.dataset.habitId,
      targetId: null,
      status: type === "task" ? card.closest("[data-status]")?.dataset.status : null,
      placeAfter: false,
      startX: touch.clientX,
      startY: touch.clientY,
      active: false,
      moved: false,
    };
    holdTimer = window.setTimeout(() => {
      if (!dragState) return;
      dragState.active = true;
      dragState.card.classList.add("dragging");
      document.body.classList.add("touch-reordering");
    }, 180);
  }, { passive: true });

  container.addEventListener("touchmove", (event) => {
    if (!dragState || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const distance = Math.hypot(
      touch.clientX - dragState.startX,
      touch.clientY - dragState.startY,
    );
    if (!dragState.active) {
      if (distance >= 8) clearDrag();
      return;
    }
    event.preventDefault();
    dragState.moved ||= distance >= 6;
    if (!dragState.moved) return;
    const hit = document.elementFromPoint(touch.clientX, touch.clientY);
    document.querySelectorAll(".task-card, .habit-item").forEach((item) => {
      item.classList.remove("drop-before", "drop-after");
    });

    const column = type === "task" ? hit?.closest("[data-status]") : null;
    if (type === "task") {
      document.querySelectorAll(".board-column").forEach((item) => {
        item.classList.toggle("drag-over", item === column);
      });
      if (!column) {
        dragState.status = null;
        dragState.targetId = null;
        return;
      }
      dragState.status = column.dataset.status;
    }

    const dropContainer = type === "task"
      ? column.querySelector(".task-list")
      : container;
    const dropCardSelector = type === "task" ? ".task-card" : ".habit-item";
    const placement = getTouchDropPlacement(
      dropContainer,
      dropCardSelector,
      touch.clientX,
      touch.clientY,
    );
    dragState.targetId = type === "task"
      ? placement?.target.dataset.taskId ?? null
      : placement?.target.dataset.habitId ?? null;
    dragState.placeAfter = placement?.placeAfter ?? false;
    placement?.target.classList.add(dragState.placeAfter ? "drop-after" : "drop-before");
  }, { passive: false });

  const finish = (event) => {
    if (!dragState) return;
    const completedDrag = dragState;
    clearDrag();
    if (completedDrag.active) {
      if (event.cancelable) event.preventDefault();
      suppressClickUntil = Date.now() + 500;
    }
    if (!completedDrag.active || !completedDrag.moved) return;

    if (type === "task" && completedDrag.status) {
      if (!commitTaskReorder(
        completedDrag.id,
        completedDrag.status,
        completedDrag.targetId,
        completedDrag.placeAfter,
      )) return;
      void syncTaskDatabaseImmediately().catch((error) => {
        console.error("Farmodoro touch task reorder could not be saved", error);
        showToast("순서 변경을 저장하지 못했어");
      });
    } else if (
      type === "habit" &&
      completedDrag.targetId &&
      reorderHabit(completedDrag.id, completedDrag.targetId, completedDrag.placeAfter)
    ) {
      renderHabits();
      saveState();
      void syncTaskDatabaseImmediately().catch((error) => {
        console.error("Farmodoro touch habit reorder could not be saved", error);
        showToast("순서 변경을 저장하지 못했어");
      });
    }
  };

  container.addEventListener("touchend", finish, { passive: false });
  container.addEventListener("touchcancel", clearDrag);
}

installTouchReorder(document.querySelector("#taskBoard"), "task");
installTouchReorder(document.querySelector("#habitList"), "habit");

document.querySelector("#habitList").addEventListener("click", async (event) => {
  const focusButton = event.target.closest("[data-focus-habit]");
  const toggleButton = event.target.closest("[data-toggle-habit]");
  const editButton = event.target.closest("[data-edit-habit]");
  const deleteButton = event.target.closest("[data-delete-habit]");

  const date = getHabitViewDate();
  if (toggleButton && date < toProductivityDateString()) {
    const button = toggleButton;
    if (button.disabled || !taskDataHydrated || habitRecordSaving) return;
    const habit = state.habits.find((item) => item.id === button.dataset.toggleHabit);
    if (!habit || !canEditHabitRecord(habit, date)) return;
    const target = getHabitTargetForDate(habit, date);
    const progress = getHabitProgressRatio(habit, date) >= 1 ? 0 : target;
    habitRecordSaving = true;
    renderHabits();
    try {
      await savePastHabitRecord(habit, date, progress);
    } catch (error) {
      showToast(`기록 저장 실패 · ${error.message}`);
    } finally {
      habitRecordSaving = false;
      renderHabits();
    }
    return;
  }

  if (focusButton) startItemFocus("habit", focusButton.dataset.focusHabit);
  if (toggleButton) toggleHabit(toggleButton.dataset.toggleHabit);
  if (editButton) {
    const habit = state.habits.find((item) => item.id === editButton.dataset.editHabit);
    if (habit) openHabitModal(habit);
  }
  if (deleteButton) {
    const habitId = deleteButton.dataset.deleteHabit;
    const habit = state.habits.find((item) => item.id === habitId);
    if (habit) openHabitDeleteModal(habit);
  }
});

document.querySelector("#farmPage").addEventListener("click", async event => {
  const themeChoice = event.target.closest("#farmThemeChoices .farm-theme-choice");
  if (!themeChoice) return;
  if (themeChoice.hasAttribute("data-preview-farm-theme")) openCosmeticPreview("farm_theme", themeChoice.dataset.previewFarmTheme);
  else if (themeChoice.dataset.equipCosmetic !== `farm_theme:${state.equippedFarmTheme || ""}`) await equipFarmCosmetic(themeChoice);
});

const cosmeticPreviewModal = document.querySelector("#cosmeticPreviewModal");
const cosmeticTryonStage = document.querySelector("#cosmeticTryonStage");
let sceneryThemePreviewContext = null;

function renderSceneryThemePreview() {
  const context = sceneryThemePreviewContext;
  if (!context || !cosmeticTryonStage || !window.SceneryThemePresets || !window.SceneryCreations) return;
  const preset = window.SceneryThemePresets.theme(context.themeId);
  const snapshot = window.SceneryCreations.snapshot();
  const creation = snapshot?.activeCreation;
  const actual = creation && (creation.themeId || null) === (context.themeId || null) ? creation : null;
  const typeId = actual?.typeId || preset.defaultType;
  const item = snapshot?.catalog.find(item => item.id === typeId);
  const name = item?.name || preset.subject;
  const cost = actual?.growthCost || item?.growthCost || 20;
  const actualInfo = window.SceneryCreations.progressInfo(actual || { progress: 0, growthCost: cost });
  const selected = context.stage ?? (actual ? "current" : 3);
  const showingCurrent = !!actual && selected === "current";
  const progress = showingCurrent ? actual.progress : actualInfo.stageProgress[Number.isInteger(selected) ? selected : 3];
  const sampleInfo = window.SceneryCreations.progressInfo({ progress, growthCost: cost });
  const labels = typeId === preset.defaultType ? preset.stageLabels : ["시작", "성장 중", "거의 완성", "완성"];
  const focusKey = cosmeticTryonStage.contains(document.activeElement) ? document.activeElement?.dataset?.sceneryPreviewStage : null;
  const background = window.FarmGardenArt?.theme(context.themeId);
  const preview = document.createElement("section");
  preview.className = "scenery-creation-scene scenery-theme-preview";
  preview.dataset.previewType = typeId;
  preview.dataset.previewProgress = String(progress);
  preview.dataset.previewMode = showingCurrent ? "current" : "sample";
  preview.setAttribute("role", "img");
  preview.setAttribute("aria-label", `${preset.name} · ${name} · ${showingCurrent ? "내 현재 모습" : "성장 모습 예시"} · ${progress}/${cost}`);
  const terrain = document.createElement("div");
  terrain.className = "garden-terrain";
  if (background) {
    terrain.style.backgroundImage = `url('${background.url}')`;
    terrain.style.backgroundSize = background.size;
    terrain.style.backgroundPosition = `${background.x}% ${background.y}%`;
  }
  const object = document.createElement("div");
  object.className = "scenery-centerpiece";
  object.innerHTML = window.SceneryCreationArt?.sprite(typeId, progress, cost) || "";
  const caption = document.createElement("span");
  caption.className = "scenery-theme-preview-caption";
  caption.textContent = showingCurrent ? `내 현재 모습 · ${actualInfo.percent}%` : `${sampleInfo.stage === 3 ? "완성" : "성장"} 예시 · ${labels[sampleInfo.stage]}`;
  preview.append(terrain, object, caption);
  const details = document.createElement("div");
  details.className = "scenery-preview-details";
  const stageNames = ["시작", "성장 중", "거의 완성", "완성"];
  details.innerHTML = `<div class="scenery-preview-personal" id="cosmeticPreviewProgress">${actual
    ? `<strong>내 진행 · ${escapeHtml(name)} · ${actualInfo.progress} / ${cost} Coin · ${actualInfo.percent}%</strong><span>${actualInfo.stage + 1} / 4단계 · ${actualInfo.remaining ? `완성까지 ${actualInfo.remaining} Coin` : "완성! 보상을 받아봐"}</span>`
    : `<strong>${escapeHtml(preset.subject)} · 완성 모습 예시</strong><span>이 테마에서 새로 만들 모습이야. 아래에서 성장 단계를 볼 수 있어.</span>`}</div><div class="scenery-preview-stage-buttons" aria-label="성장 모습 예시 선택">${actualInfo.stageProgress.map((value, index) => `<button type="button" class="scenery-preview-stage-button" data-scenery-preview-stage="${index}" aria-pressed="${selected === index}" title="${escapeHtml(labels[index])}">${stageNames[index]}<span>${value} / ${cost} Coin</span></button>`).join("")}</div>${actual ? `<button type="button" class="scenery-preview-stage-button scenery-preview-current-button" data-scenery-preview-stage="current" aria-pressed="${showingCurrent}">내 현재 모습 · ${actualInfo.progress} / ${cost} Coin</button>` : ""}<p class="scenery-preview-stage-note">단계 선택은 모습만 미리 보여줘. 내 성장 수치와 Coin은 바뀌지 않아.</p>`;
  cosmeticTryonStage.replaceChildren(preview, details);
  if (focusKey != null) {
    Array.from(details.querySelectorAll("[data-scenery-preview-stage]")).find(button => button.dataset.sceneryPreviewStage === focusKey)?.focus({ preventScroll: true });
  }
}

function refreshOpenSceneryPreview() {
  if (!sceneryThemePreviewContext || cosmeticPreviewModal?.classList.contains("hidden")) return;
  if (sceneryThemePreviewContext.userId !== (activeAuthUser?.id || null) || sceneryThemePreviewContext.session !== farmSessionGeneration) {
    closeCosmeticPreview();
    return;
  }
  renderSceneryThemePreview();
}

function closeCosmeticPreview() {
  sceneryThemePreviewContext = null;
  cosmeticPreviewModal?.classList.add("hidden");
}

function openCosmeticPreview(type, id) {
  if (type !== "farm_theme") return;
  id = id || "";
  const entry = !id ? { id: "", name: "초록 정원", price: 0 } : getCosmeticEntry(type, id);
  if (!entry || !cosmeticPreviewModal || !cosmeticTryonStage) return;
  sceneryThemePreviewContext = { themeId: id || null, stage: null, userId: activeAuthUser?.id || null, session: farmSessionGeneration };
  cosmeticTryonStage.className = "cosmetic-tryon-stage";
  renderSceneryThemePreview();
  document.querySelector("#cosmeticPreviewTitle").textContent = entry.name;
  document.querySelector("#cosmeticPreviewKind").textContent = COSMETIC_TYPE_LABELS[type];
  document.querySelector("#cosmeticPreviewDescription").textContent = getFarmSceneryDescription(type, id);
  let themeActions = cosmeticPreviewModal.querySelector(".farm-theme-preview-actions");
  if (!themeActions) {
    themeActions = document.createElement("div");
    themeActions.className = "farm-theme-preview-actions";
    cosmeticPreviewModal.querySelector(".cosmetic-preview-modal-panel").append(themeActions);
  }
  const owned = !id || isCosmeticOwned(type, id);
  const equipped = !id ? !state.equippedFarmTheme : isCosmeticEquipped(type, id);
  const status = equipped ? "사용 중" : owned ? "보유 중" : `✦ ${entry.price.toLocaleString()}`;
  themeActions.innerHTML = `<div class="cosmetic-preview-price"><span>${owned ? "상태" : "가격"}</span><strong>${status}</strong></div>` + (owned
    ? `<p>한 번 구매한 테마는 언제든 바꿀 수 있어요.</p><button type="button" class="farm-goal-action" data-equip-cosmetic="farm_theme:${id}" ${equipped ? "disabled" : ""}>${equipped ? "사용 중인 테마" : "이 테마 적용하기"}</button>`
    : `<p>보유 ✦ ${state.farmMoney.toLocaleString()} Farm Money</p><button type="button" class="farm-goal-action" data-purchase-cosmetic="farm_theme:${id}" ${state.farmMoney < entry.price ? "disabled" : ""}>✦ ${entry.price.toLocaleString()} · 테마 구매하고 적용</button>`);
  cosmeticPreviewModal.classList.remove("hidden");
  cosmeticPreviewModal.querySelector("button[data-close-cosmetic-preview]")?.focus({ preventScroll: true });
}

cosmeticPreviewModal.addEventListener("click", async (event) => {
  if (event.target.closest("[data-close-cosmetic-preview]")) { closeCosmeticPreview(); return; }
  const stage = event.target.closest("[data-scenery-preview-stage]");
  if (stage && sceneryThemePreviewContext) {
    const value = stage.dataset.sceneryPreviewStage;
    if (value !== "current" && ![0, 1, 2, 3].includes(Number(value))) return;
    sceneryThemePreviewContext.stage = value === "current" ? "current" : Number(value);
    renderSceneryThemePreview();
    return;
  }
  const purchase = event.target.closest("[data-purchase-cosmetic]");
  if (purchase) {
    if (await purchaseFarmCosmetic(purchase)) closeCosmeticPreview();
    return;
  }
  const equip = event.target.closest("[data-equip-cosmetic]");
  if (equip && !equip.disabled) {
    await equipFarmCosmetic(equip);
    const [type, id] = equip.dataset.equipCosmetic.split(":");
    if (type === "farm_theme" && !id ? !state.equippedFarmTheme : isCosmeticEquipped(type, id)) closeCosmeticPreview();
  }
});
cosmeticPreviewModal.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  closeCosmeticPreview();
});

async function runCosmeticRpc(rpc, params, userId, sessionGeneration) {
  const previousAction = farmActionChain;
  const previousWallet = farmWalletMutationChain;
  const call = Promise.all([previousAction, previousWallet]).then(async () => {
    if (activeAuthUser?.id !== userId || farmSessionGeneration !== sessionGeneration) {
      throw new Error("FARM_ACCOUNT_CHANGED");
    }
    const { data, error } = await supabaseClient.rpc(rpc, params);
    if (error) throw error;
    return data;
  });
  farmActionChain = call.catch(() => {});
  farmWalletMutationChain = farmActionChain;
  return call;
}

async function purchaseFarmCosmetic(button) {
  if (!button || button.disabled) return false;
  if (!supabaseClient || !activeAuthUser) {
    showToast("로그인 후 구매할 수 있어");
    return false;
  }
  const [type, id] = button.dataset.purchaseCosmetic.split(":");
  const entry = getCosmeticEntry(type, id);
  if (type !== "farm_theme" || !entry) return false;
  const userId = activeAuthUser.id;
  const sessionGeneration = farmSessionGeneration;
  button.disabled = true;
  let data;
  try {
    data = await runCosmeticRpc("purchase_farm_cosmetic", {
      p_cosmetic_type: type,
      p_cosmetic_id: id,
      p_price: entry.price,
    }, userId, sessionGeneration);
  } catch (error) {
    if (activeAuthUser?.id !== userId || farmSessionGeneration !== sessionGeneration) return false;
    console.error("Farmodoro cosmetic purchase failed", error);
    showToast(
      error.message?.includes("Insufficient")
        ? "Farm Money가 부족해"
        : "구매하지 못했어. 잠시 후 다시 시도해줘.",
    );
    button.disabled = false;
    return false;
  }
  if (activeAuthUser?.id !== userId || farmSessionGeneration !== sessionGeneration) return false;
  const balance = Number(data?.farmMoneyBalance);
  if (Number.isFinite(balance) && balance >= 0) applyFarmActionResult({ wallet: { farmMoneyBalance: balance } });
  else await loadFarmWallet(activeAuthUser);
  if (activeAuthUser?.id !== userId || farmSessionGeneration !== sessionGeneration) return false;
  if (!isCosmeticOwned(type, id)) state.ownedCosmetics.push({ type, id });
  if (type === "farm_theme") state.equippedFarmTheme = id;
  showToast(`${entry.name}을 구매해서 바로 장착했어`);
  render();
  return true;
}

async function equipFarmCosmetic(button) {
  if (!button || button.disabled) return;
  if (!supabaseClient || !activeAuthUser) {
    showToast("로그인 후 장착할 수 있어");
    return;
  }
  const [type, rawId] = button.dataset.equipCosmetic.split(":");
  // An empty id is the unequip action; it clears the slot back to default.
  if (type !== "farm_theme") return;
  const targetId = rawId || null;
  const entry = targetId ? getCosmeticEntry(type, targetId) : null;
  if (targetId && !entry) return;
  const userId = activeAuthUser.id;
  const sessionGeneration = farmSessionGeneration;
  button.disabled = true;
  try {
    await runCosmeticRpc("equip_farm_cosmetic", {
      p_cosmetic_type: type,
      p_cosmetic_id: targetId,
    }, userId, sessionGeneration);
  } catch (error) {
    if (activeAuthUser?.id !== userId || farmSessionGeneration !== sessionGeneration) return;
    console.error("Farmodoro cosmetic equip failed", error);
    showToast(targetId ? "장착하지 못했어. 잠시 후 다시 시도해줘." : "해제하지 못했어. 잠시 후 다시 시도해줘.");
    button.disabled = false;
    return;
  }
  if (activeAuthUser?.id !== userId || farmSessionGeneration !== sessionGeneration) return;
  if (type === "farm_theme") state.equippedFarmTheme = targetId;
  showToast(targetId ? `${entry.name}을 장착했어` : `${COSMETIC_TYPE_LABELS[type]}를 해제했어`);
  render();
}

const farmRankingModal = document.querySelector("#farmRankingModal");
document.querySelector("#openFarmRanking").addEventListener("click", async () => {
  await loadFarmLeaderboard();
  renderFarmRanking();
  farmRankingModal.classList.remove("hidden");
});
farmRankingModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-farm-ranking]")) {
    farmRankingModal.classList.add("hidden");
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (closeThemedDateCalendar()) return;
    closeUserSettings();
    farmRankingModal.classList.add("hidden");
    if (editingTaskId) closeTaskInlineEdit();
    closeHabitModal();
    closeHabitDeleteModal();
    closeHabitResetModal();
    closeTaskDeleteModal();
    closeFocusItemMenu();
    closeTaskGroupMenu();
  }
});

const MODAL_DIALOG_SELECTOR =
  '[role="dialog"][aria-modal="true"]:not(.hidden), [role="alertdialog"][aria-modal="true"]:not(.hidden)';
const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

// Keep keyboard focus inside the currently open dialog.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const openDialog = document.querySelector(MODAL_DIALOG_SELECTOR);
  if (!openDialog) return;
  const focusable = [...openDialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
    (element) => element.offsetParent !== null,
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  const focusIsInside = openDialog.contains(document.activeElement);
  if (event.shiftKey && (!focusIsInside || document.activeElement === first)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (!focusIsInside || document.activeElement === last)) {
    event.preventDefault();
    first.focus();
  }
});

document.querySelector("#focusButton").addEventListener("click", toggleFocus);
document.querySelector("#focusSkipBreakButton").addEventListener("click", skipFocusBreak);
document.querySelectorAll("[data-focus-mode]").forEach((button) => {
  button.addEventListener("click", () => setFocusMode(button.dataset.focusMode));
});
document.querySelector("#focusAlertDismissButton").addEventListener("click", hideFocusAlertBanner);
document.querySelector("#focusAlertMuteButton").addEventListener("click", stopFocusAlarmSound);

const focusItemPicker = document.querySelector(".focus-item-picker");
const focusItemTrigger = document.querySelector("#focusItemTrigger");
const focusItemMenu = document.querySelector("#focusItemMenu");

function closeFocusItemMenu() {
  focusItemMenu.classList.add("hidden");
  focusItemTrigger.setAttribute("aria-expanded", "false");
}

focusItemTrigger.addEventListener("click", () => {
  const willOpen = focusItemMenu.classList.contains("hidden");
  focusItemMenu.classList.toggle("hidden", !willOpen);
  focusItemTrigger.setAttribute("aria-expanded", String(willOpen));
});

focusItemMenu.addEventListener("click", (event) => {
  const option = event.target.closest("[data-focus-value]");
  if (!option) return;
  focusTimerOwnerId = FOCUS_TIMER_CLIENT_ID;
  if (runningFocusMode === "linked") {
    advanceRunningFocusTimer("linked");
    stopFocusTimer();
  }
  const [type, id] = option.dataset.focusValue.split(":");
  activeFocus = type && id ? { type, id } : null;
  prepareLinkedFocusRuntime();
  setFocusMode("linked");
  renderFocusPicker();
  closeFocusItemMenu();
  if (activeFocus) {
    const item = getFocusItem();
    showToast(`‘${item.title}’을 집중 항목으로 골랐어`);
  }
  scheduleFocusTimerDatabaseSync(0);
});

document.addEventListener("click", (event) => {
  if (!focusItemPicker.contains(event.target)) closeFocusItemMenu();
});

const focusPageStage = document.querySelector("#focusPageStage");
const focusFullscreenButton = document.querySelector("#toggleFocusFullscreen");
let focusWakeLock = null;
let focusWakeLockRequest = null;
const focusAudioButton = document.querySelector("#toggleFocusAudio");
const focusBackgroundInput = document.querySelector("#focusBackgroundInput");
const resetFocusBackgroundButton = document.querySelector("#resetFocusBackground");
const FOCUS_PLAYLIST = [
  { title: "Sunlit Field Walk 1", src: "./assets/audio/sunlit-field-walk-1.mp3" },
  { title: "Sunlit Field Walk 2", src: "./assets/audio/sunlit-field-walk-2.mp3" },
  { title: "Riverbend Afterglow 1", src: "./assets/audio/riverbend-afterglow-1.mp3" },
  { title: "Riverbend Afterglow 2", src: "./assets/audio/riverbend-afterglow-2.mp3" },
  { title: "Velvet Pocket Duel 1", src: "./assets/audio/velvet-pocket-duel-1.mp3" },
  { title: "Velvet Pocket Duel 2", src: "./assets/audio/velvet-pocket-duel-2.mp3" },
  { title: "Hayfield Afterglow 1", src: "./assets/audio/hayfield-afterglow-1.mp3" },
  { title: "Hayfield Afterglow 2", src: "./assets/audio/hayfield-afterglow-2.mp3" },
  { title: "Late Afternoon Harvest 1", src: "./assets/audio/late-afternoon-harvest-1.mp3" },
  { title: "Late Afternoon Harvest 2", src: "./assets/audio/late-afternoon-harvest-2.mp3" },
  { title: "Dust on the Porch 1", src: "./assets/audio/dust-on-the-porch-1.mp3" },
  { title: "Dust on the Porch 2", src: "./assets/audio/dust-on-the-porch-2.mp3" },
];
let focusAudioPlayer = null;
let focusPlaylistQueue = [];
let currentFocusTrack = null;
let focusBackgroundObjectUrl = null;

function shouldHoldFocusWakeLock() {
  return (
    "wakeLock" in navigator &&
    document.visibilityState === "visible" &&
    document.fullscreenElement === focusPageStage &&
    Boolean(runningFocusMode)
  );
}

async function releaseFocusWakeLock() {
  const activeLock = focusWakeLock;
  focusWakeLock = null;
  if (activeLock && !activeLock.released) await activeLock.release();
}

async function requestFocusWakeLock() {
  if (!shouldHoldFocusWakeLock() || (focusWakeLock && !focusWakeLock.released)) return;
  if (focusWakeLockRequest) return focusWakeLockRequest;

  focusWakeLockRequest = navigator.wakeLock.request("screen")
    .then(async (wakeLock) => {
      focusWakeLock = wakeLock;
      wakeLock.addEventListener("release", () => {
        if (focusWakeLock === wakeLock) focusWakeLock = null;
      });
      if (!shouldHoldFocusWakeLock()) await releaseFocusWakeLock();
    })
    .catch((error) => {
      console.warn("Farmodoro screen wake lock could not be acquired", error);
    })
    .finally(() => {
      focusWakeLockRequest = null;
    });
  return focusWakeLockRequest;
}

async function syncFocusWakeLock() {
  if (shouldHoldFocusWakeLock()) {
    await requestFocusWakeLock();
    return;
  }
  await releaseFocusWakeLock();
}

function updateFocusMusicIndicator() {
  const defaultMusicPlaying = Boolean(
    focusAudioPlayer && !focusAudioPlayer.paused && !focusAudioPlayer.ended,
  );
  const showIndicator = currentPage !== "focus" && defaultMusicPlaying;
  miniFocusMusic.hidden = !showIndicator;
  if (!showIndicator) return;
  miniFocusMusicTitle.textContent = currentFocusTrack?.title || "기본 집중 음악";
}

function renderFocusFarmBackground() {
  const stage = document.querySelector("#focusPageStage");
  stage.querySelector(".focus-farm-background")?.remove();
  if (document.querySelector("#toggleFocusFarmBackground").getAttribute("aria-pressed") !== "true") return;
  const source = document.querySelector("#sceneryCreationScene");
  if (!source) return;
  const scene = source.cloneNode(true);
  scene.className = "scenery-creation-scene scenery-focus-scene";
  [scene, ...scene.querySelectorAll("*")].forEach(element => {
    element.removeAttribute("id");
    for (const attribute of [...element.attributes]) if (attribute.name.startsWith("data-")) element.removeAttribute(attribute.name);
  });
  const background = document.createElement("div");
  background.className = "focus-farm-background cosmetic-farm-preview";
  background.setAttribute("aria-hidden", "true");
  background.inert = true;
  background.append(scene);
  stage.prepend(background);
}

document.querySelector("#toggleFocusFarmBackground").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const enabled = button.getAttribute("aria-pressed") !== "true";
  button.setAttribute("aria-pressed", String(enabled));
  button.classList.toggle("active", enabled);
  renderFocusFarmBackground();
});

function applyFocusBackground(file) {
  const farmButton = document.querySelector("#toggleFocusFarmBackground");
  farmButton.setAttribute("aria-pressed", "false");
  farmButton.classList.remove("active");
  document.querySelector(".focus-farm-background")?.remove();
  if (focusBackgroundObjectUrl) URL.revokeObjectURL(focusBackgroundObjectUrl);
  focusBackgroundObjectUrl = file ? URL.createObjectURL(file) : null;
  if (focusBackgroundObjectUrl) {
    focusPageStage.style.setProperty(
      "--focus-background-image",
      `url("${focusBackgroundObjectUrl}")`,
    );
  } else {
    focusPageStage.style.removeProperty("--focus-background-image");
  }
}

async function loadFocusBackgroundFromDatabase(user, path) {
  if (!supabaseClient || !user || activeAuthUser?.id !== user.id) return;
  if (!path) {
    applyFocusBackground(null);
    return;
  }
  const { data, error } = await supabaseClient.storage
    .from("focus-backgrounds")
    .download(path);
  if (activeAuthUser?.id !== user.id) return;
  if (error) {
    console.warn("Farmodoro focus background could not be loaded", error);
    applyFocusBackground(null);
    return;
  }
  applyFocusBackground(data);
}

function getFocusBackgroundExtension(file) {
  return {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }[file.type] ?? "";
}

async function uploadFocusBackground(user, file) {
  const extension = getFocusBackgroundExtension(file);
  if (!extension) throw new Error("Unsupported focus background type");
  const previousPath = currentProfile?.focus_background_path || "";
  const path = `${user.id}/focus-background.${extension}`;
  const { error: uploadError } = await supabaseClient.storage
    .from("focus-backgrounds")
    .upload(path, file, { cacheControl: "3600", upsert: true });
  if (uploadError) throw uploadError;

  const { error: profileError } = await supabaseClient
    .from("profiles")
    .update({ focus_background_path: path })
    .eq("id", user.id);
  if (profileError) throw profileError;

  if (previousPath && previousPath !== path) {
    const { error: removeError } = await supabaseClient.storage
      .from("focus-backgrounds")
      .remove([previousPath]);
    if (removeError) console.warn("Previous focus background could not be removed", removeError);
  }
  currentProfile = { ...currentProfile, focus_background_path: path };
  return path;
}

focusBackgroundInput.addEventListener("change", async () => {
  const [file] = focusBackgroundInput.files;
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("이미지 파일만 배경으로 사용할 수 있어");
    return;
  }
  if (!getFocusBackgroundExtension(file)) {
    showToast("배경은 JPG, PNG, WEBP 이미지만 사용할 수 있어");
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    showToast("배경 이미지는 15MB 이하로 골라");
    return;
  }

  try {
    if (!activeAuthUser || !supabaseClient) throw new Error("Authentication required");
    await uploadFocusBackground(activeAuthUser, file);
    applyFocusBackground(file);
    showToast("집중 배경을 바꿨어");
  } catch {
    showToast("배경 이미지를 저장하지 못했어");
  } finally {
    focusBackgroundInput.value = "";
  }
});

resetFocusBackgroundButton.addEventListener("click", async () => {
  try {
    if (!activeAuthUser || !supabaseClient) throw new Error("Authentication required");
    const path = currentProfile?.focus_background_path;
    if (path) {
      const { error: removeError } = await supabaseClient.storage
        .from("focus-backgrounds")
        .remove([path]);
      if (removeError) throw removeError;
    }
    const { error: profileError } = await supabaseClient
      .from("profiles")
      .update({ focus_background_path: null })
      .eq("id", activeAuthUser.id);
    if (profileError) throw profileError;
    currentProfile = { ...currentProfile, focus_background_path: null };
    applyFocusBackground(null);
    showToast("기본 집중 배경으로 돌렸어");
  } catch {
    showToast("기본 배경으로 변경하지 못했어");
  }
});

focusFullscreenButton.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement === focusPageStage) {
      await document.exitFullscreen();
    } else {
      await focusPageStage.requestFullscreen();
    }
    await syncFocusWakeLock();
  } catch {
    showToast("이 브라우저에서는 전체 화면을 사용할 수 없어");
  }
});

document.addEventListener("fullscreenchange", () => {
  const active = document.fullscreenElement === focusPageStage;
  const alertContainer = document.fullscreenElement || document.body;
  alertContainer.append(document.querySelector("#focusAlertBanner"));
  focusFullscreenButton.innerHTML = active
    ? '<span aria-hidden="true">×</span> 전체 화면 종료'
    : '<span aria-hidden="true">⛶</span> 전체 화면';
  scheduleFocusStageCenterUpdate();
  void syncFocusWakeLock();
});

document.addEventListener("visibilitychange", () => {
  void syncFocusWakeLock();
});

function stopFocusAudio() {
  focusAudioPlayer?.pause();
  focusAudioButton.classList.remove("active");
  focusAudioButton.setAttribute("aria-pressed", "false");
  focusAudioButton.innerHTML = focusAudioPlayer && !focusAudioPlayer.ended
    ? '<span aria-hidden="true">♪</span> 음악 계속 듣기'
    : '<span aria-hidden="true">♪</span> 기본 음악';
  updateFocusMusicIndicator();
}

function shuffleFocusPlaylist() {
  const tracks = [...FOCUS_PLAYLIST];
  for (let index = tracks.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [tracks[index], tracks[target]] = [tracks[target], tracks[index]];
  }

  if (tracks[0] === currentFocusTrack && tracks.length > 1) {
    [tracks[0], tracks[1]] = [tracks[1], tracks[0]];
  }
  focusPlaylistQueue = tracks;
}

function takeNextFocusTrack() {
  if (!focusPlaylistQueue.length) shuffleFocusPlaylist();
  return focusPlaylistQueue.shift();
}

function createFocusAudio(track) {
  const audio = new Audio(new URL(track.src, document.baseURI).href);
  audio.preload = "metadata";
  audio.volume = 0.5;
  audio.dataset.title = track.title;
  audio.addEventListener("ended", playNextFocusTrack, { once: true });
  return audio;
}

async function playNextFocusTrack() {
  currentFocusTrack = takeNextFocusTrack();
  focusAudioPlayer = createFocusAudio(currentFocusTrack);
  focusAudioButton.disabled = true;
  focusAudioButton.innerHTML = '<span aria-hidden="true">♪</span> 음악 불러오는 중';
  try {
    await focusAudioPlayer.play();
  } catch (error) {
    console.warn("Farmodoro focus music could not be played", error);
    stopFocusAudio();
    showToast("음악을 재생하지 못했어");
    return;
  } finally {
    focusAudioButton.disabled = false;
  }
  focusAudioButton.classList.add("active");
  focusAudioButton.setAttribute("aria-pressed", "true");
  focusAudioButton.innerHTML = '<span aria-hidden="true">Ⅱ</span> 음악 끄기';
  updateFocusMusicIndicator();
}

async function startFocusAudio() {
  if (focusAudioPlayer && focusAudioPlayer.paused && !focusAudioPlayer.ended) {
    try {
      await focusAudioPlayer.play();
      focusAudioButton.classList.add("active");
      focusAudioButton.setAttribute("aria-pressed", "true");
      focusAudioButton.innerHTML = '<span aria-hidden="true">Ⅱ</span> 음악 끄기';
      updateFocusMusicIndicator();
    } catch (error) {
      console.warn("Farmodoro focus music could not be resumed", error);
      stopFocusAudio();
      showToast("음악을 재생하지 못했어");
    }
    return;
  }
  await playNextFocusTrack();
}

focusAudioButton.addEventListener("click", async () => {
  if (focusAudioPlayer && !focusAudioPlayer.paused) stopFocusAudio();
  else await startFocusAudio();
});

const focusSettings = document.querySelector("#focusSettings");
const focusSettingsBackdrop = document.querySelector("#focusSettingsBackdrop");
const focusSettingsButton = document.querySelector("#toggleFocusSettings");
const focusMinutesInput = document.querySelector("#focusMinutesInput");
const breakEnabledInput = document.querySelector("#breakEnabledInput");
const breakMinutesInput = document.querySelector("#breakMinutesInput");

// Keep the settings dialog at the document root so its fixed backdrop and
// centered panel are relative to the viewport, not the compact focus card.
document.body.append(focusSettingsBackdrop, focusSettings);

function syncFocusSettingsForm() {
  const settings = getFocusSettings("quick");
  focusMinutesInput.value = settings.focusMinutes;
  breakEnabledInput.checked = settings.breakEnabled;
  breakMinutesInput.value = settings.breakMinutes;
  breakMinutesInput.disabled = !settings.breakEnabled;
}

function closeFocusSettings({ restoreFocus = false } = {}) {
  const wasOpen = !focusSettings.classList.contains("hidden");
  focusSettings.classList.add("hidden");
  focusSettingsBackdrop.classList.add("hidden");
  focusSettingsButton.setAttribute("aria-expanded", "false");
  if (restoreFocus && wasOpen && !focusSettingsButton.hidden) focusSettingsButton.focus();
}

function openFocusSettings() {
  syncFocusSettingsForm();
  focusSettingsBackdrop.classList.remove("hidden");
  focusSettings.classList.remove("hidden");
  focusSettingsButton.setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => focusMinutesInput.focus());
}

focusSettingsButton.addEventListener("click", () => {
  const willOpen = focusSettings.classList.contains("hidden");
  if (willOpen) openFocusSettings();
  else closeFocusSettings({ restoreFocus: true });
});

document.querySelectorAll("[data-close-focus-settings]").forEach((element) => {
  element.addEventListener("click", () => closeFocusSettings({ restoreFocus: true }));
});

focusSettings.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeFocusSettings({ restoreFocus: true });
    return;
  }
  if (event.key !== "Tab") return;
  const controls = [...focusSettings.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
});

breakEnabledInput.addEventListener("change", () => {
  breakMinutesInput.disabled = !breakEnabledInput.checked;
});

document.querySelector("#saveFocusSettings").addEventListener("click", async (event) => {
  const saveButton = event.currentTarget;
  const focusMinutes = Math.min(120, Math.max(5, Number(focusMinutesInput.value) || 25));
  const breakMinutes = Math.min(60, Math.max(1, Number(breakMinutesInput.value) || 5));

  state.settings.quick = {
    focusMinutes,
    breakEnabled: breakEnabledInput.checked,
    breakMinutes,
  };
  if (runningFocusMode === "quick") stopFocusTimer();
  resetToFocus();
  saveState();
  saveButton.disabled = true;
  try {
    await Promise.all([
      saveMyFocusSettings("quick", focusMinutes, breakEnabledInput.checked, breakMinutes),
      syncFocusTimerDatabaseImmediately(),
      flushFocusTime(),
    ]);
    closeFocusSettings({ restoreFocus: true });
    showToast("집중 설정을 저장했어");
  } catch (error) {
    console.error("Farmodoro focus settings could not be saved", error);
    const reason = error.message ? `: ${error.message}` : "";
    showToast(`집중 설정을 저장하지 못했어${reason}`);
  } finally {
    saveButton.disabled = false;
  }
});

const todayWorkspace = document.querySelector("#todayWorkspace");
const taskSection = document.querySelector("#taskSection");
const habitSection = document.querySelector("#habitSection");
const summaryGrid = document.querySelector("#summaryGrid");
const focusCard = document.querySelector("#focusCard");
const focusPageSlot = document.querySelector("#focusPageSlot");
let focusStageCenterFrame = null;

function updateFocusStageCenter() {
  focusStageCenterFrame = null;
  if (currentPage !== "focus" || !focusCard.classList.contains("standalone")) return;
  const cardRect = focusCard.getBoundingClientRect();
  const stageRect = focusPageStage.getBoundingClientRect();
  const visual = focusCard.querySelector(".focus-visual");
  if (!cardRect.height || !visual) return;

  const visualRadius = visual.offsetHeight / 2;
  const backgroundCenter = stageRect.top + stageRect.height * 0.44;
  const centerY = Math.max(
    visualRadius,
    Math.min(cardRect.height - visualRadius, backgroundCenter - cardRect.top),
  );
  focusCard.style.setProperty("--focus-stage-center-y", `${Math.round(centerY)}px`);
  fitFocusTargetText();
}

function scheduleFocusStageCenterUpdate() {
  if (focusStageCenterFrame) cancelAnimationFrame(focusStageCenterFrame);
  focusStageCenterFrame = requestAnimationFrame(updateFocusStageCenter);
}

window.addEventListener("resize", scheduleFocusStageCenterUpdate);
window.visualViewport?.addEventListener("resize", scheduleFocusStageCenterUpdate);
if ("ResizeObserver" in window) {
  const focusStageResizeObserver = new ResizeObserver(() => {
    scheduleFocusStageCenterUpdate();
  });
  focusStageResizeObserver.observe(focusPageStage);
  focusStageResizeObserver.observe(focusPageStage.querySelector(".focus-stage-toolbar"));
}
document.fonts?.ready.then(scheduleFocusStageCenterUpdate);

function closePageModals() {
  closeUserSettings();
  closeHabitModal();
  closeHabitDeleteModal();
  closeTaskDeleteModal();
  closeFocusItemMenu();
  closeTaskGroupMenu();
  document
    .querySelectorAll(".market-modal, .habit-modal")
    .forEach((modal) => modal.classList.add("hidden"));
}

let pageDataRefreshPromise = null;
let pageDataRefreshingPage = null;
let queuedPageDataRefresh = null;
const pageDataRefreshTimes = new Map();

async function refreshPageData(page = currentPage) {
  if (!activeAuthUser || !supabaseClient) return;
  const requestedPage = APP_PAGES.includes(page) ? page : "today";

  if (pageDataRefreshPromise) {
    if (requestedPage !== pageDataRefreshingPage) queuedPageDataRefresh = requestedPage;
    return pageDataRefreshPromise;
  }

  const user = activeAuthUser;
  const refreshKey = `${user.id}:${requestedPage}`;
  if (Date.now() - (pageDataRefreshTimes.get(refreshKey) || 0) < 3000) return;
  pageDataRefreshTimes.set(refreshKey, Date.now());
  pageDataRefreshingPage = requestedPage;
  void pollFocusTimerFromDatabase();
  pageDataRefreshPromise = (async () => {
    if (["today", "tasks", "habits"].includes(requestedPage)) {
      await loadTaskDataFromDatabase(user, { force: true });
    }

    if (requestedPage === "farm") {
      await farmActionChain;
      await farmWalletMutationChain;
      await Promise.all([
        loadFarmDataFromDatabase(user),
        loadFarmWallet(user),
      ]);
    }

    if (["today", "focus"].includes(requestedPage)) {
      await flushFocusTime();
      await loadFocusProgress(user);
    }
  })()
    .catch((error) => {
      console.warn("Farmodoro page data could not be refreshed", error);
    })
    .finally(() => {
      pageDataRefreshPromise = null;
      pageDataRefreshingPage = null;
      if (queuedPageDataRefresh) {
        const nextPage = queuedPageDataRefresh;
        queuedPageDataRefresh = null;
        if (activeAuthUser) void refreshPageData(nextPage);
      }
    });

  return pageDataRefreshPromise;
}

function showPage(page) {
  const validPage = APP_PAGES.includes(page) ? page : "today";
  const pageChanged = currentPage !== validPage;

  if (pageChanged) {
    closePageModals();
    closeTaskCreate();
    closeGroupManager();
  }

  currentPage = validPage;
  document.body.classList.toggle("farm-page-active", validPage === "farm");

  if (validPage === "today") {
    summaryGrid.prepend(focusCard);
    focusCard.classList.remove("standalone");
    todayWorkspace.appendChild(taskSection);
    todayWorkspace.appendChild(habitSection);
    taskSection.querySelector(".section-header h2").textContent = "오늘의 할 일";
    habitSection.querySelector(".section-header h2").textContent = "오늘의 습관";
    openHabitFormButton.hidden = false;
  }

  if (validPage === "tasks") {
    document.querySelector("#tasksPageSlot").appendChild(taskSection);
    taskSection.querySelector(".section-header h2").textContent = "전체 할 일";
  }

  if (validPage === "habits") {
    document.querySelector("#habitsPageSlot").appendChild(habitSection);
    habitSection.querySelector(".section-header h2").textContent = "습관 관리";
    openHabitFormButton.hidden = false;
  }

  if (validPage === "focus") {
    focusPageSlot.appendChild(focusCard);
    focusCard.classList.add("standalone");
    scheduleFocusStageCenterUpdate();
  } else {
    focusCard.style.removeProperty("--focus-stage-center-y");
  }

  document.querySelectorAll(".page-view").forEach((view) => {
    view.classList.toggle("active", view.dataset.view === validPage);
  });

  document.querySelectorAll("[data-page]").forEach((link) => {
    link.classList.toggle("active", link.dataset.page === validPage);
  });

  const titles = { today: "오늘", tasks: "할 일", habits: "습관", focus: "집중", farm: "내 풍경" };
  document.title = `${titles[validPage]} · Farmodoro`;
  renderTasks();
  renderHabits();
  renderHabitHeatmap();
  updateFocusTarget();
  updateMiniFocusTimer();
  updateFocusMusicIndicator();
  document.documentElement.classList.remove("app-initializing");
  if (pageChanged) void refreshPageData(validPage);
}

window.addEventListener("hashchange", () => {
  showPage(location.hash.slice(1));
});

window.addEventListener("focus", () => {
  void refreshPageData(currentPage);
  resumeFocusTimerAfterBackground();
});

async function flushFarmodoroDataOnExit() {
  if (!activeAuthUser) return;
  if (runningFocusMode) advanceRunningFocusTimer(runningFocusMode);
  exitFlushKeepAlive = true;
  try {
    saveState();
    const operations = [
      flushFocusTime().catch((error) => {
        console.error("Farmodoro focus time could not be flushed", error);
      }),
      syncTaskDatabaseImmediately().catch((error) => {
        console.error("Farmodoro productivity state could not be flushed", error);
      }),
      // Each farm action already commits itself; this only drains an
      // in-flight one so we don't navigate away mid-write.
      farmActionChain.catch((error) => {
        console.error("Farmodoro farm action could not be drained", error);
      }),
    ];
    if (isFocusTimerOwner()) {
      operations.push(
        syncFocusTimerDatabaseImmediately().catch((error) => {
          console.error("Farmodoro focus timer could not be flushed", error);
        }),
      );
    }
    await Promise.allSettled(operations);
  } finally {
    exitFlushKeepAlive = false;
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshHabitHeatmapDay();
  if (!activeAuthUser) return;
  if (document.visibilityState === "hidden") {
    void flushFarmodoroDataOnExit();
    return;
  }
  // A backgrounded PWA/tab is often suspended rather than fully torn down,
  // so coming back to "visible" doesn't re-run app.js and doesn't refetch
  // anything on its own -- whatever was last in memory (possibly hours
  // stale, from before another device made changes) just keeps rendering
  // until something happens to save over it. Pull fresh data the moment the
  // user actually looks at the tab again.
  if (document.visibilityState === "visible") {
    void refreshPageData();
    if (appStateHydrated) void loadUserPreferences(activeAuthUser, { isInitialLoad: false });
    resumeFocusTimerAfterBackground();
  }
});

window.flushFarmodoroDataBeforeReload = async () => {
  if (!activeAuthUser) return true;
  exitFlushKeepAlive = true;
  try {
    saveState();
    const operations = [flushFocusTime()];
    if (taskDataHydrated) operations.push(syncTaskDatabaseImmediately());
    if (farmDataHydrated) operations.push(farmActionChain);
    if (isFocusTimerOwner()) operations.push(syncFocusTimerDatabaseImmediately());
    const results = await Promise.allSettled(operations);
    const failed = results.some((result) => result.status === "rejected");
    if (failed) showToast("저장에 실패해서 자동 업데이트를 멈췄어. 연결을 확인해.");
    return !failed;
  } finally {
    exitFlushKeepAlive = false;
  }
};

window.addEventListener("pagehide", () => {
  void flushFarmodoroDataOnExit();
});

document.querySelector("#openMiniFocus").addEventListener("click", () => {
  location.hash = "focus";
});

document.querySelector("#openMiniFocusMusic").addEventListener("click", () => {
  location.hash = "focus";
});

document.querySelector("#stopMiniFocusMusic").addEventListener("click", () => {
  stopFocusAudio();
});

miniFocusPause.addEventListener("click", () => {
  if (!miniFocusMode || !focusRuntimeByMode[miniFocusMode].started) return;
  if (focusMode !== miniFocusMode) setFocusMode(miniFocusMode);
  toggleFocus();
});

document.querySelector("#miniFocusStop").addEventListener("click", () => {
  if (!miniFocusMode) return;
  endFocusSession(miniFocusMode);
});

document.querySelector("#previousHabitMonth").addEventListener("click", () => {
  habitCalendarDate = new Date(
    habitCalendarDate.getFullYear(),
    habitCalendarDate.getMonth() - 1,
    1,
  );
  renderHabitHeatmap();
});

document.querySelector("#nextHabitMonth").addEventListener("click", () => {
  habitCalendarDate = new Date(
    habitCalendarDate.getFullYear(),
    habitCalendarDate.getMonth() + 1,
    1,
  );
  renderHabitHeatmap();
});

function initializeModalScrollAreas() {
  document
    .querySelectorAll(".market-modal-panel, .habit-modal-panel:not(.delete-confirm-panel)")
    .forEach((panel) => {
      if (panel.querySelector(":scope > .modal-scroll-area")) return;
      const scrollArea = document.createElement("div");
      scrollArea.className = "modal-scroll-area";
      while (panel.firstChild) scrollArea.appendChild(panel.firstChild);
      panel.appendChild(scrollArea);
    });
}

initializeModalScrollAreas();
maintainTaskArchive();

setInterval(() => {
  refreshHabitHeatmapDay();
  updateDailyFocusQuote();
  const archiveChanged = maintainTaskArchive();
  const farmRankingChanged = ensureWeeklyFarmRanking();
  if (archiveChanged || farmRankingChanged) render();
}, 60000);

// Keep an idle habit timer in sync with the current day.
setInterval(() => {
  if (!runningFocusMode && activeFocus?.type === "habit") updateFocusDisplay();
}, 1000);

render();
syncFocusSettingsForm();
resetToFocus();
const hashPage = location.hash.slice(1);
const initialPage = APP_PAGES.includes(hashPage) ? hashPage : "today";
showPage(initialPage);
initializeTodaySplitter();
