// Signals to the inline bootstrap script in index.html that app.js actually
// started running, so a genuine load failure (blocked CDN script, a thrown
// error before this point) shows a retry message instead of silently
// revealing the static HTML placeholder values as if they were real data.
window.__farmodoroAppJsLoaded = true;

const APP_PAGES = ["today", "tasks", "habits", "focus", "farm"];
const GROUP_COLOR_COUNT = 8;
const APP_THEMES = new Set(["white", "classic", "sunset", "sky", "dark"]);

const authGate = document.querySelector("#authGate");
const authStatus = document.querySelector("#authStatus");
const googleSignInButton = document.querySelector("#googleSignInButton");
const signOutButton = document.querySelector("#signOutButton");
const deleteAccountButton = document.querySelector("#deleteAccountButton");
const openUserSettingsButton = document.querySelector("#openUserSettings");
const openMobileUserSettingsButton = document.querySelector("#openMobileUserSettings");
const userSettingsModal = document.querySelector("#userSettingsModal");
const userSettingsForm = document.querySelector("#userSettingsForm");
const farmAdminMailSection = document.querySelector("#farmAdminMailSection");
const farmAdminMailTitleInput = document.querySelector("#farmAdminMailTitleInput");
const farmAdminMailMessageInput = document.querySelector("#farmAdminMailMessageInput");
const farmAdminMailStatus = document.querySelector("#farmAdminMailStatus");
const sendFarmAdminMailButton = document.querySelector("#sendFarmAdminMail");
const profileSettingsAvatar = document.querySelector("#profileSettingsAvatar");
const profileAvatarInput = document.querySelector("#profileAvatarInput");
const chooseProfileAvatarButton = document.querySelector("#chooseProfileAvatar");
const resetProfileAvatarButton = document.querySelector("#resetProfileAvatar");
const profileDisplayNameInput = document.querySelector("#profileDisplayName");
const profileNameLength = document.querySelector("#profileNameLength");
const settingsAccountEmail = document.querySelector("#settingsAccountEmail");
const settingsFarmCode = document.querySelector("#settingsFarmCode");
const copyFarmCodeButton = document.querySelector("#copyFarmCode");
const saveUserSettingsButton = document.querySelector("#saveUserSettings");
const tutorialModal = document.querySelector("#tutorialModal");
const tutorialPanel = tutorialModal.querySelector(".tutorial-panel");
const tutorialSpotlight = document.querySelector("#tutorialSpotlight");
const tutorialKicker = document.querySelector("#tutorialKicker");
const tutorialStepLabel = document.querySelector("#tutorialStepLabel");
const tutorialIcon = document.querySelector("#tutorialIcon");
const tutorialTitle = document.querySelector("#tutorialTitle");
const tutorialDescription = document.querySelector("#tutorialDescription");
const tutorialTips = document.querySelector("#tutorialTips");
const tutorialProgress = document.querySelector("#tutorialProgress");
const previousTutorialButton = document.querySelector("#previousTutorial");
const nextTutorialButton = document.querySelector("#nextTutorial");
const skipTutorialButton = document.querySelector("#skipTutorial");
const reopenTutorialButton = document.querySelector("#reopenTutorial");
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
let themeBeforeSettings = "classic";
let farmAdminPermissionUserId = null;
let taskDataHydrated = false;
let taskDataUserId = null;
let taskDataLoadPromise = null;
let taskSyncTimer = null;
let taskSyncChain = Promise.resolve();
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
let appStateSyncTimer = null;
let appStateSyncChain = Promise.resolve();
let lastAppStateSyncSignature = "";
let farmWalletHydrated = false;
let farmWalletUserId = null;
let farmWalletMutationChain = Promise.resolve();
let farmWalletMutationVersion = 0;
let farmWalletRealtimeRefreshTimer = null;
let farmDataHydrated = false;
let farmDataUserId = null;
let farmDataSyncTimer = null;
let farmDataSyncChain = Promise.resolve();
let lastFarmDataSyncSignature = "";
let lastFarmDataSyncError = "";
let farmDataLoadRequest = 0;
let productivityRealtimeChannel = null;
let productivityRealtimeRefreshTimer = null;
let productivityRealtimeMutedUntil = 0;
let tutorialStep = 0;
let tutorialShownForUserId = null;
let tutorialPreviousFocus = null;
let tutorialTarget = null;
let tutorialPositionFrame = null;
let tutorialResizeObserver = null;
let tutorialReturnPage = "today";
let tutorialReturnScrollY = 0;
const TUTORIAL_STEPS = [
  {
    page: "today",
    target: "#openTaskForm",
    kicker: "STEP 01 · ADD TASK",
    icon: "+",
    title: "여기서 할 일을 추가해",
    description: "버튼을 누르면 바로 아래에 할 일 입력칸이 열려.",
    tips: ["처음에는 작은 할 일 하나만 등록해봐"],
  },
  {
    page: "today",
    target: "#taskForm",
    reveal: "task-form",
    kicker: "STEP 02 · TASK DETAILS",
    icon: "✎",
    title: "이름과 그룹을 정해",
    description: "할 일 이름을 적고 필요한 경우 그룹을 고른 뒤 추가를 누르면 돼.",
    tips: ["그룹 관리는 공부, 업무처럼 자주 쓰는 분류를 만들 때 써", "추가한 할 일은 대기 칸으로 들어가"],
  },
  {
    page: "today",
    target: '.board-column[data-status="waiting"] > header',
    kicker: "STEP 03 · STATUS",
    icon: "✓",
    title: "상태별로 할 일을 정리해",
    description: "카드 아래 버튼으로 대기, 진행 중, 완료 상태를 바로 바꿀 수 있어.",
    tips: ["완료하면 Coin 보상이 들어와"],
  },
  {
    page: "habits",
    target: "#openHabitForm",
    kicker: "STEP 04 · HABITS",
    icon: "↻",
    title: "반복할 일은 습관으로 등록해",
    description: "추가 버튼을 누르면 습관의 목표와 일정을 정하는 창이 열려.",
    tips: ["매일 반복하는 일은 할 일보다 습관으로 만드는 게 편해"],
  },
  {
    page: "habits",
    target: "#habitInput",
    reveal: "habit-form",
    kicker: "STEP 05 · HABIT NAME",
    icon: "✎",
    title: "먼저 습관 이름을 적어",
    description: "무엇을 반복할지 한눈에 알아볼 수 있게 짧게 적으면 돼.",
    tips: ["운동, 독서, 물 마시기처럼 행동 중심으로 적어"],
  },
  {
    page: "habits",
    target: ".habit-measure-row",
    reveal: "habit-form",
    kicker: "STEP 06 · HABIT GOAL",
    icon: "◎",
    title: "목표량을 정해",
    description: "횟수, 시간, 양 중 측정 방식을 고른 다음 목표값과 단위를 입력해.",
    tips: ["운동 3회, 독서 30분, 물 2L처럼 기록할 수 있어"],
  },
  {
    page: "habits",
    target: ".weekday-field",
    reveal: "habit-form",
    kicker: "STEP 07 · HABIT SCHEDULE",
    icon: "▦",
    title: "반복 요일을 골라",
    description: "실천할 요일과 종료일을 정하고 습관 추가를 누르면 등록돼.",
    tips: ["선택한 요일에만 오늘의 습관 목록에 나타나"],
  },
  {
    page: "today",
    target: "#focusButton",
    kicker: "STEP 08 · FOCUS",
    icon: "◷",
    title: "이 버튼으로 집중을 시작해",
    description: "항목 집중을 선택하면 해당 할 일이나 습관에 시간이 기록돼.",
    tips: ["집중 누적 60분마다 Coin을 받아"],
  },
  {
    page: "today",
    target: '[data-page="farm"]',
    kicker: "STEP 09 · FARM",
    icon: "🌾",
    title: "마지막은 내 농장이야",
    description: "모은 보상으로 씨앗을 심고 물을 주면서 농장을 키워.",
    tips: ["설정에서 이 안내를 언제든 다시 볼 수 있어"],
  },
];
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

function normalizeTheme(theme) {
  return APP_THEMES.has(theme) ? theme : "classic";
}

function getActiveTheme() {
  return normalizeTheme(document.documentElement.dataset.theme);
}

function applyTheme(theme) {
  const normalizedTheme = normalizeTheme(theme);
  document.documentElement.dataset.theme = normalizedTheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    normalizedTheme === "sunset"
      ? "#79503d"
      : normalizedTheme === "sky"
        ? "#315f6d"
        : normalizedTheme === "dark"
          ? "#121a16"
          : normalizedTheme === "white"
            ? "#ffffff"
            : "#2f5d45",
  );
}

applyTheme("classic");

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
    theme: getActiveTheme(),
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
    .select("display_name, avatar_url, farm_code, theme, focus_background_path")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("Farmodoro profile could not be loaded", error);
    currentProfile = getProfileFallback(user);
  } else {
    currentProfile = data ?? getProfileFallback(user);
    applyTheme(currentProfile.theme);
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
  const previousCoins = Number(state.coins ?? 0);
  const previousFarmMoney = Number(state.farmMoney ?? 0);
  if (background) {
    if (!farmWalletHydrated || farmWalletUserId !== user.id) return;
  } else {
    farmWalletHydrated = false;
    farmWalletUserId = user.id;
  }

  const { data, error } = await supabaseClient.rpc("get_my_farm_wallet");

  if (activeAuthUser?.id !== user.id || farmWalletUserId !== user.id) return;
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

function applyFarmWalletChange(
  currency,
  amount,
  reason,
  referenceKey = null,
  allowNegative = false,
) {
  const stateKey = currency === "coin" ? "coins" : "farmMoney";
  const numericAmount = Math.trunc(Number(amount));
  if (!numericAmount) return true;
  if (
    !farmWalletHydrated ||
    !activeAuthUser ||
    activeAuthUser.id !== farmWalletUserId
  ) {
    showToast("지갑 데이터를 불러오는 중이야");
    return false;
  }

  const userId = activeAuthUser.id;
  if (!allowNegative && state[stateKey] + numericAmount < 0) {
    showToast(currency === "coin" ? "Coin이 부족해" : "Farm Money가 부족해");
    return false;
  }
  const mutationVersion = ++farmWalletMutationVersion;
  state[stateKey] += numericAmount;
  renderSummary();
  renderFarm();
  farmWalletMutationChain = farmWalletMutationChain
    .then(async () => {
      const { data, error } = await supabaseClient.rpc("change_my_farm_wallet", {
        p_currency: currency,
        p_amount: numericAmount,
        p_reason: reason,
        p_reference_key: referenceKey,
      });
      if (error) throw error;
      if (
        activeAuthUser?.id === userId &&
        farmWalletUserId === userId &&
        farmWalletMutationVersion === mutationVersion
      ) {
        state[stateKey] = Number(data);
        renderSummary();
        renderFarm();
      }
    })
    .catch((error) => {
      console.error("Farmodoro wallet change could not be saved", error);
      if (activeAuthUser?.id !== userId || farmWalletUserId !== userId) return;
      state[stateKey] -= numericAmount;
      renderSummary();
      renderFarm();
      showToast(`지갑 DB 저장 실패 · ${error?.message || "알 수 없는 오류"}`);
    });
  return true;
}

async function applyAuthSession(session) {
  const isSignedIn = Boolean(session?.user);
  const previousUserId = activeAuthUser?.id ?? null;
  activeAuthUser = session?.user ?? null;
  authGate.hidden = isSignedIn;
  document.body.classList.toggle("auth-gated", !isSignedIn);

  if (isSignedIn) {
    if (previousUserId && previousUserId !== session.user.id) stopFocusYoutube();
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
      maybeOpenTutorial(session.user);
      return;
    }
    const needsAppStateLoad = !appStateHydrated || appStateUserId !== session.user.id;
    await Promise.all([
      loadUserProfile(session.user),
      needsAppStateLoad ? loadAppStateFromDatabase(session.user) : Promise.resolve(),
    ]);
    await loadFarmAdminPermission(session.user);
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
    startFarmMailUnreadPolling(session.user);
    startFarmMailRealtime(session.user);
    await loadFocusProgress(session.user);
    await loadFocusTimerFromDatabase(session.user);
    startFocusRealtime(session.user);
    maybeOpenTutorial(session.user);
  } else {
    stopFocusYoutube();
    resetTaskDatabaseState();
    resetAppStateDatabaseState();
    resetFocusTimerDatabaseState();
    resetFarmWalletDatabaseState();
    resetFarmDataDatabaseState();
    state = loadState();
    applyLoadedAppStateRuntime();
    applyTheme("classic");
    currentProfile = null;
    farmAdminPermissionUserId = null;
    farmAdminMailSection.hidden = true;
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
  if (message.includes("profiles_theme_value")) {
    console.warn("Farmodoro: 004 migration not applied (profiles_theme_value)");
    return "테마 설정을 저장하지 못했어. 잠시 후 다시 시도해줘";
  }
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

async function loadFarmAdminPermission(user) {
  if (!supabaseClient || !user) return false;
  const { data, error } = await supabaseClient.rpc("is_farm_admin");
  if (activeAuthUser?.id !== user.id) return false;
  const isAdmin = !error && data === true;
  farmAdminPermissionUserId = isAdmin ? user.id : null;
  farmAdminMailSection.hidden = !isAdmin;
  if (error && !["42883", "PGRST202"].includes(error.code)) {
    console.error("Farmodoro admin permission could not be checked", error);
  }
  return isAdmin;
}

async function openUserSettings() {
  if (!activeAuthUser) return;
  pendingAvatarFile = null;
  pendingAvatarReset = false;
  clearProfilePreviewObjectUrl();
  themeBeforeSettings = getActiveTheme();

  if (!currentProfile?.farm_code) await loadUserProfile(activeAuthUser);
  if (farmAdminPermissionUserId !== activeAuthUser.id) {
    await loadFarmAdminPermission(activeAuthUser);
  }
  refreshSettingsProfileFields();

  const themeRadio = userSettingsForm.querySelector(
    `input[name="appTheme"][value="${normalizeTheme(currentProfile?.theme)}"]`,
  );
  if (themeRadio) themeRadio.checked = true;
  userSettingsModal.classList.remove("hidden");
  userSettingsModal.querySelector("[data-close-user-settings]")?.focus({ preventScroll: true });
}

function closeUserSettings({ keepTheme = false } = {}) {
  if (userSettingsModal.classList.contains("hidden")) return;
  userSettingsModal.classList.add("hidden");
  clearProfilePreviewObjectUrl();
  pendingAvatarFile = null;
  pendingAvatarReset = false;
  profileAvatarInput.value = "";
  if (!keepTheme) applyTheme(themeBeforeSettings);
}

function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialStep];
  tutorialKicker.textContent = step.kicker;
  tutorialStepLabel.textContent = `${tutorialStep + 1} / ${TUTORIAL_STEPS.length}`;
  tutorialIcon.textContent = step.icon;
  tutorialTitle.textContent = step.title;
  tutorialDescription.textContent = step.description;
  tutorialTips.replaceChildren(
    ...step.tips.map((tip) => {
      const item = document.createElement("li");
      item.textContent = tip;
      return item;
    }),
  );
  tutorialProgress.replaceChildren(
    ...TUTORIAL_STEPS.map((_, index) => {
      const dot = document.createElement("i");
      dot.classList.toggle("active", index === tutorialStep);
      return dot;
    }),
  );
  previousTutorialButton.disabled = tutorialStep === 0;
  nextTutorialButton.textContent =
    tutorialStep === TUTORIAL_STEPS.length - 1 ? "시작하기" : "다음";
  prepareTutorialTarget();
}

function openTutorial() {
  tutorialStep = 0;
  tutorialReturnPage = currentPage;
  tutorialReturnScrollY = window.scrollY;
  tutorialPreviousFocus = document.activeElement;
  tutorialModal.classList.remove("hidden");
  document.body.classList.add("tutorial-open");
  renderTutorialStep();
  requestAnimationFrame(() => tutorialPanel.focus());
}

function closeTutorial() {
  tutorialModal.classList.add("hidden");
  document.body.classList.remove("tutorial-open");
  tutorialResizeObserver?.disconnect();
  tutorialTarget = null;
  cancelAnimationFrame(tutorialPositionFrame);
  taskForm.classList.add("hidden");
  if (!habitModal.classList.contains("hidden")) closeHabitModal();
  showPage(tutorialReturnPage);
  window.scrollTo({ top: tutorialReturnScrollY, behavior: "auto" });
  if (!state.tutorialCompleted) {
    state.tutorialCompleted = true;
    scheduleAppStateDatabaseSync(null, 0);
  }
  if (
    tutorialPreviousFocus instanceof HTMLElement &&
    tutorialPreviousFocus.isConnected &&
    tutorialPreviousFocus.offsetParent !== null
  ) {
    tutorialPreviousFocus.focus();
  }
  tutorialPreviousFocus = null;
}

function scheduleTutorialPosition() {
  if (tutorialModal.classList.contains("hidden")) return;
  cancelAnimationFrame(tutorialPositionFrame);
  tutorialPositionFrame = requestAnimationFrame(positionTutorial);
}

function prepareTutorialTarget() {
  const step = TUTORIAL_STEPS[tutorialStep];
  tutorialModal.classList.add("positioning");
  if (step.reveal !== "habit-form" && !habitModal.classList.contains("hidden")) {
    closeHabitModal();
  }
  if (currentPage !== step.page) showPage(step.page);
  taskForm.classList.toggle("hidden", step.reveal !== "task-form");
  if (step.reveal === "habit-form" && habitModal.classList.contains("hidden")) {
    openHabitModal();
  }

  requestAnimationFrame(() => {
    tutorialTarget = document.querySelector(step.target);
    if (!tutorialTarget || tutorialTarget.getClientRects().length === 0) {
      tutorialTarget = document.querySelector(".main-content");
    }
    tutorialTarget.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
    tutorialResizeObserver ??= new ResizeObserver(scheduleTutorialPosition);
    tutorialResizeObserver.disconnect();
    tutorialResizeObserver.observe(tutorialTarget);
    tutorialResizeObserver.observe(tutorialPanel);
    requestAnimationFrame(positionTutorial);
  });
}

function positionTutorial() {
  if (!tutorialTarget || tutorialModal.classList.contains("hidden")) return;
  const targetRect = tutorialTarget.getBoundingClientRect();
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const spotlightPadding = 7;
  const edge = 12;
  const gap = 17;
  const spotlightTop = Math.max(edge, targetRect.top - spotlightPadding);
  const spotlightLeft = Math.max(edge, targetRect.left - spotlightPadding);
  const spotlightRight = Math.min(viewportWidth - edge, targetRect.right + spotlightPadding);
  const spotlightBottom = Math.min(viewportHeight - edge, targetRect.bottom + spotlightPadding);

  Object.assign(tutorialSpotlight.style, {
    top: `${spotlightTop}px`,
    left: `${spotlightLeft}px`,
    width: `${Math.max(1, spotlightRight - spotlightLeft)}px`,
    height: `${Math.max(1, spotlightBottom - spotlightTop)}px`,
  });

  const panelWidth = tutorialPanel.offsetWidth;
  const panelHeight = tutorialPanel.offsetHeight;
  const roomBelow = viewportHeight - spotlightBottom;
  const roomAbove = spotlightTop;
  const placeBelow = roomBelow >= panelHeight + gap || roomBelow >= roomAbove;
  const desiredTop = placeBelow
    ? spotlightBottom + gap
    : spotlightTop - panelHeight - gap;
  const panelTop = Math.max(edge, Math.min(desiredTop, viewportHeight - panelHeight - edge));
  const targetCenter = Math.min(
    viewportWidth - edge,
    Math.max(edge, targetRect.left + targetRect.width / 2),
  );
  const panelLeft = Math.max(
    edge,
    Math.min(targetCenter - panelWidth / 2, viewportWidth - panelWidth - edge),
  );

  tutorialPanel.dataset.placement = placeBelow ? "below" : "above";
  tutorialPanel.style.top = `${panelTop}px`;
  tutorialPanel.style.left = `${panelLeft}px`;
  tutorialPanel.style.setProperty(
    "--tutorial-arrow-x",
    `${Math.max(24, Math.min(targetCenter - panelLeft, panelWidth - 24))}px`,
  );
  tutorialModal.classList.remove("positioning");
}

window.addEventListener("resize", scheduleTutorialPosition);
window.addEventListener("scroll", scheduleTutorialPosition, true);
window.visualViewport?.addEventListener("resize", scheduleTutorialPosition);
window.visualViewport?.addEventListener("scroll", scheduleTutorialPosition);

function maybeOpenTutorial(user) {
  if (!user || state.tutorialCompleted || tutorialShownForUserId === user.id) return;
  tutorialShownForUserId = user.id;
  openTutorial();
}

previousTutorialButton.addEventListener("click", () => {
  if (tutorialStep === 0) return;
  tutorialStep -= 1;
  renderTutorialStep();
});

nextTutorialButton.addEventListener("click", () => {
  if (tutorialStep === TUTORIAL_STEPS.length - 1) {
    closeTutorial();
    return;
  }
  tutorialStep += 1;
  renderTutorialStep();
});

skipTutorialButton.addEventListener("click", closeTutorial);
reopenTutorialButton.addEventListener("click", () => {
  closeUserSettings();
  openTutorial();
});

document.addEventListener("keydown", (event) => {
  if (tutorialModal.classList.contains("hidden")) return;
  if (event.key === "Escape") {
    closeTutorial();
    return;
  }
  if (event.key === "ArrowLeft" && tutorialStep > 0) {
    tutorialStep -= 1;
    renderTutorialStep();
    return;
  }
  if (event.key === "ArrowRight" && tutorialStep < TUTORIAL_STEPS.length - 1) {
    tutorialStep += 1;
    renderTutorialStep();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...tutorialPanel.querySelectorAll("button:not(:disabled)")].filter(
    (element) => element.offsetParent !== null,
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === tutorialPanel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

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

sendFarmAdminMailButton.addEventListener("click", async () => {
  if (!activeAuthUser || farmAdminPermissionUserId !== activeAuthUser.id) return;
  const title = farmAdminMailTitleInput.value.trim();
  const message = farmAdminMailMessageInput.value.trim();
  if (!title || !message) {
    farmAdminMailStatus.textContent = "제목과 내용을 모두 적어.";
    return;
  }
  if (!window.confirm("모든 사용자에게 이 우편과 랜덤 박스를 보낼 거야.")) return;

  sendFarmAdminMailButton.disabled = true;
  farmAdminMailStatus.textContent = "발송 중…";
  const { data, error } = await supabaseClient.rpc("broadcast_farm_update_mail", {
    p_title: title,
    p_message: message,
  });
  sendFarmAdminMailButton.disabled = false;
  if (error) {
    console.error("Farmodoro admin broadcast could not be sent", error);
    farmAdminMailStatus.textContent = error.code === "42501"
      ? "관리자 권한이 없어."
      : "발송하지 못했어. 잠시 후 다시 시도해줘.";
    return;
  }

  const recipientCount = Math.max(0, Number(data?.recipientCount ?? 0));
  farmAdminMailStatus.textContent = `${recipientCount}명에게 발송했어.`;
  farmAdminMailTitleInput.value = "";
  farmAdminMailMessageInput.value = "";
  await loadFarmDataFromDatabase(activeAuthUser);
  render();
});

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

userSettingsForm.addEventListener("change", (event) => {
  if (event.target.matches('input[name="appTheme"]')) applyTheme(event.target.value);
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

    const selectedTheme = normalizeTheme(
      userSettingsForm.querySelector('input[name="appTheme"]:checked')?.value,
    );
    const { data, error } = await supabaseClient
      .from("profiles")
      .update({ display_name: displayName, avatar_url: avatarUrl || null, theme: selectedTheme })
      .eq("id", activeAuthUser.id)
      .select("display_name, avatar_url, farm_code, theme, focus_background_path")
      .single();
    if (error) throw error;

    currentProfile = data;
    const { error: authUpdateError } = await supabaseClient.auth.updateUser({
      data: { display_name: displayName, avatar_url: avatarUrl || null },
    });
    if (authUpdateError) console.warn("Auth profile metadata could not be updated", authUpdateError);

    applyTheme(selectedTheme);
    updateProfileFromUser(activeAuthUser, currentProfile);
    closeUserSettings({ keepTheme: true });
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
    closeUserSettings({ keepTheme: true });
    applyAuthSession(null);
    try {
      await prepareGoogleSignIn();
    } catch (googleError) {
      setAuthStatus(googleError.message, true);
    }
  }
});

initializeAuth();

const CROPS = {
  carrot: {
    name: "당근",
    seedPrice: 1,
    sellPrice: 5,
    stages: ["•", "🌱", "🌿", "🥕"],
  },
  tomato: {
    name: "토마토",
    seedPrice: 2,
    sellPrice: 9,
    stages: ["•", "🌱", "🌿", "🌼", "🍅"],
  },
  corn: {
    name: "옥수수",
    seedPrice: 3,
    sellPrice: 12,
    stages: ["•", "🌱", "🌿", "🌾", "🌽"],
  },
  potato: {
    name: "감자",
    seedPrice: 2,
    sellPrice: 8,
    stages: ["•", "🌱", "🌿", "🌼", "🥔"],
  },
  sweetPotato: {
    name: "고구마",
    seedPrice: 3,
    sellPrice: 11,
    stages: ["•", "🌱", "🌿", "🌸", "🍠"],
  },
  strawberry: {
    name: "딸기",
    seedPrice: 3,
    sellPrice: 13,
    stages: ["•", "🌱", "🌿", "🌼", "🍓"],
  },
  eggplant: {
    name: "가지",
    seedPrice: 3,
    sellPrice: 12,
    stages: ["•", "🌱", "🌿", "🌸", "🍆"],
  },
  pepper: {
    name: "피망",
    seedPrice: 3,
    sellPrice: 12,
    stages: ["•", "🌱", "🌿", "🌼", "🫑"],
  },
  cucumber: {
    name: "오이",
    seedPrice: 2,
    sellPrice: 10,
    stages: ["•", "🌱", "🌿", "🌼", "🥒"],
  },
  pumpkin: {
    name: "호박",
    seedPrice: 4,
    sellPrice: 16,
    stages: ["•", "🌱", "🌿", "🌼", "🎃"],
  },
  onion: {
    name: "양파",
    seedPrice: 2,
    sellPrice: 9,
    stages: ["•", "🌱", "🌿", "🌼", "🧅"],
  },
  garlic: {
    name: "마늘",
    seedPrice: 2,
    sellPrice: 9,
    stages: ["•", "🌱", "🌿", "🌼", "🧄"],
  },
  cabbage: {
    name: "배추",
    seedPrice: 3,
    sellPrice: 11,
    stages: ["•", "🌱", "🌿", "🥬"],
  },
  broccoli: {
    name: "브로콜리",
    seedPrice: 3,
    sellPrice: 13,
    stages: ["•", "🌱", "🌿", "🥦"],
  },
  watermelon: {
    name: "수박",
    seedPrice: 5,
    sellPrice: 20,
    stages: ["•", "🌱", "🌿", "🌼", "🍉"],
  },
  melon: {
    name: "멜론",
    seedPrice: 5,
    sellPrice: 20,
    stages: ["•", "🌱", "🌿", "🌼", "🍈"],
  },
  rice: {
    name: "벼",
    seedPrice: 3,
    sellPrice: 14,
    stages: ["•", "🌱", "🌿", "🌾"],
  },
  mushroom: {
    name: "버섯",
    seedPrice: 4,
    sellPrice: 15,
    stages: ["•", "◦", "♧", "🍄"],
  },
  sunflower: {
    name: "해바라기",
    seedPrice: 4,
    sellPrice: 15,
    stages: ["•", "🌱", "🌿", "🌼", "🌻"],
  },
  beet: {
    name: "비트",
    seedPrice: 3,
    sellPrice: 12,
    stages: ["seed", "sprout", "leaf", "비트"],
  },
  radish: {
    name: "무",
    seedPrice: 2,
    sellPrice: 9,
    stages: ["seed", "sprout", "leaf", "무"],
  },
  turnip: {
    name: "순무",
    seedPrice: 3,
    sellPrice: 11,
    stages: ["seed", "sprout", "leaf", "순무"],
  },
  chili: {
    name: "고추",
    seedPrice: 3,
    sellPrice: 13,
    stages: ["seed", "sprout", "leaf", "flower", "고추"],
  },
  lettuce: {
    name: "상추",
    seedPrice: 2,
    sellPrice: 8,
    stages: ["seed", "sprout", "leaf", "상추"],
  },
  spinach: {
    name: "시금치",
    seedPrice: 2,
    sellPrice: 9,
    stages: ["seed", "sprout", "leaf", "시금치"],
  },
  kale: {
    name: "케일",
    seedPrice: 3,
    sellPrice: 11,
    stages: ["seed", "sprout", "leaf", "케일"],
  },
  celery: {
    name: "셀러리",
    seedPrice: 3,
    sellPrice: 12,
    stages: ["seed", "sprout", "leaf", "셀러리"],
  },
  pea: {
    name: "완두콩",
    seedPrice: 3,
    sellPrice: 12,
    stages: ["seed", "sprout", "leaf", "flower", "완두콩"],
  },
  bean: {
    name: "강낭콩",
    seedPrice: 3,
    sellPrice: 12,
    stages: ["seed", "sprout", "leaf", "flower", "강낭콩"],
  },
  peanut: {
    name: "땅콩",
    seedPrice: 3,
    sellPrice: 13,
    stages: ["seed", "sprout", "leaf", "flower", "땅콩"],
  },
  wheat: {
    name: "밀",
    seedPrice: 3,
    sellPrice: 13,
    stages: ["seed", "sprout", "leaf", "밀"],
  },
  barley: {
    name: "보리",
    seedPrice: 3,
    sellPrice: 13,
    stages: ["seed", "sprout", "leaf", "보리"],
  },
  oat: {
    name: "귀리",
    seedPrice: 3,
    sellPrice: 14,
    stages: ["seed", "sprout", "leaf", "귀리"],
  },
  grape: {
    name: "포도",
    seedPrice: 5,
    sellPrice: 21,
    stages: ["seed", "sprout", "leaf", "flower", "포도"],
  },
  blueberry: {
    name: "블루베리",
    seedPrice: 5,
    sellPrice: 21,
    stages: ["seed", "sprout", "leaf", "flower", "블루베리"],
  },
  raspberry: {
    name: "라즈베리",
    seedPrice: 5,
    sellPrice: 22,
    stages: ["seed", "sprout", "leaf", "flower", "라즈베리"],
  },
  apple: {
    name: "사과",
    seedPrice: 6,
    sellPrice: 25,
    stages: ["seed", "sprout", "leaf", "flower", "사과"],
  },
  pear: {
    name: "배",
    seedPrice: 6,
    sellPrice: 25,
    stages: ["seed", "sprout", "leaf", "flower", "배"],
  },
  peach: {
    name: "복숭아",
    seedPrice: 6,
    sellPrice: 26,
    stages: ["seed", "sprout", "leaf", "flower", "복숭아"],
  },
  cherry: {
    name: "체리",
    seedPrice: 6,
    sellPrice: 26,
    stages: ["seed", "sprout", "leaf", "flower", "체리"],
  },
  lemon: {
    name: "레몬",
    seedPrice: 6,
    sellPrice: 25,
    stages: ["seed", "sprout", "leaf", "flower", "레몬"],
  },
  orange: {
    name: "오렌지",
    seedPrice: 6,
    sellPrice: 25,
    stages: ["seed", "sprout", "leaf", "flower", "오렌지"],
  },
  pineapple: {
    name: "파인애플",
    seedPrice: 7,
    sellPrice: 29,
    stages: ["seed", "sprout", "leaf", "flower", "파인애플"],
  },
  kiwi: {
    name: "키위",
    seedPrice: 6,
    sellPrice: 27,
    stages: ["seed", "sprout", "leaf", "flower", "키위"],
  },
};

const CROP_GROWTH_TYPES = Object.fromEntries(
  [
    ["root", "carrot potato sweetPotato onion garlic beet radish turnip peanut"],
    ["leafy", "cabbage broccoli lettuce spinach kale celery"],
    ["grain", "corn rice wheat barley oat"],
    ["vine", "tomato strawberry eggplant pepper cucumber pumpkin watermelon melon chili pea bean grape"],
    ["berry", "blueberry raspberry"],
    ["tree", "apple pear peach cherry lemon orange kiwi"],
    ["tropical", "pineapple"],
    ["fungus", "mushroom"],
    ["flower", "sunflower"],
  ].flatMap(([type, cropIds]) => cropIds.split(" ").map((cropId) => [cropId, type])),
);

const CROP_GROWTH_COSTS = Object.fromEntries(
  [
    [2, "radish lettuce spinach mushroom pea"],
    [3, "carrot potato onion garlic cabbage kale celery beet turnip broccoli rice wheat barley oat"],
    [4, "tomato corn sweetPotato eggplant pepper cucumber strawberry chili bean peanut sunflower"],
    [5, "pumpkin watermelon melon grape blueberry raspberry pineapple"],
    [6, "apple pear peach cherry lemon orange kiwi"],
  ].flatMap(([cost, cropIds]) => cropIds.split(" ").map((cropId) => [cropId, cost])),
);

const FARM_WATER_COOLDOWN_MS = 5 * 60 * 60 * 1000;
const FARM_WILT_AFTER_MS = 24 * 60 * 60 * 1000;

const FARM_ITEMS = {
  luckyFertilizer: {
    name: "행운 비료",
    icon: "✦",
    price: 90,
    description: "다음 수확량이 2개가 되고, 5% 확률로 5개를 수확해",
    type: "plot",
  },
  moistureFertilizer: {
    name: "보습 비료",
    icon: "💧",
    price: 70,
    description: "다음 수확까지 물 1회당 2단계 성장해",
    type: "plot",
  },
  premiumFertilizer: {
    name: "프리미엄 비료",
    icon: "♛",
    price: 140,
    description: "행운 비료와 보습 비료 효과를 함께 적용해",
    type: "plot",
  },
  goldenFestivalPass: {
    name: "황금 수확제 초대장",
    icon: "🎟",
    price: 240,
    description: "사용 후 24시간 동안 생산으로 얻는 Coin이 2배가 돼",
    type: "instant",
  },
  farmFestivalPass: {
    name: "푸른 들판 축제권",
    icon: "🎐",
    price: 160,
    description: "사용 후 24시간 동안 모든 작물이 시들지 않아",
    type: "instant",
  },
  freePass: {
    name: "농부의 프리패스",
    icon: "✓",
    price: 150,
    description: "완료하지 않은 할 일 또는 오늘의 습관 하나를 완료 처리해",
    type: "target",
  },
  revivalTonic: {
    name: "새벽이슬 회복제",
    icon: "☘",
    price: 60,
    description: "시든 작물 하나를 되살려",
    type: "plot",
  },
  growthTonic: {
    name: "햇살 성장제",
    icon: "☀",
    price: 280,
    description: "성장 중인 작물 하나를 즉시 완전히 성장시켜",
    type: "plot",
  },
  seedMarketRefresh: {
    name: "씨앗 진열 교환권",
    icon: "↻",
    price: 50,
    description: "오늘의 씨앗 판매대 7종을 즉시 새로 뽑아",
    type: "market",
  },
  foodMarketRefresh: {
    name: "매입 목록 교환권",
    icon: "▤",
    price: 70,
    description: "오늘의 음식 매입 목록 4종을 즉시 새로 뽑아",
    type: "market",
  },
};

const SYSTEM_FARM_SENDER = {
  id: "system",
  name: "시스템",
  farmName: "Farmodoro 운영국",
  avatar: "🤖",
};

const RECIPES = {
  countryStew: { name: "시골 채소 스튜", icon: "🍲", ingredients: ["carrot", "potato"], sellPrice: 42 },
  sunsetSoup: { name: "노을 토마토 수프", icon: "🥣", ingredients: ["tomato", "corn"], sellPrice: 48 },
  berryParfait: { name: "딸기 멜론 파르페", icon: "🍨", ingredients: ["strawberry", "melon"], sellPrice: 76 },
  berryTart: { name: "들판 딸기 타르트", icon: "🥧", ingredients: ["wheat", "strawberry"], sellPrice: 58 },
  mushroomRice: { name: "버섯 영양밥", icon: "🍚", ingredients: ["rice", "mushroom"], sellPrice: 55 },
  pumpkinSoup: { name: "황금 호박 수프", icon: "🥣", ingredients: ["pumpkin", "onion"], sellPrice: 62 },
  appleJam: { name: "사과 레몬 잼", icon: "🍯", ingredients: ["apple", "lemon"], sellPrice: 92 },
  gardenSalad: { name: "정원 샐러드", icon: "🥗", ingredients: ["cabbage", "carrot", "cucumber"], sellPrice: 68 },
  ratatouille: { name: "모리슨 라따뚜이", icon: "🍛", ingredients: ["eggplant", "tomato", "pepper"], sellPrice: 78 },
  farmPizza: { name: "농장 피자", icon: "🍕", ingredients: ["wheat", "tomato", "corn"], sellPrice: 82 },
  friedRice: { name: "피망 완두 볶음밥", icon: "🍳", ingredients: ["rice", "pepper", "pea"], sellPrice: 74 },
  tropicalPunch: { name: "열대 과일 펀치", icon: "🍹", ingredients: ["pineapple", "orange", "kiwi"], sellPrice: 118 },
  cornChowder: { name: "옥수수 감자 차우더", icon: "🥣", ingredients: ["corn", "potato", "onion"], sellPrice: 72 },
  gazpacho: { name: "토마토 오이 가스파초", icon: "🍅", ingredients: ["tomato", "cucumber", "pepper"], sellPrice: 70 },
  beetAppleJuice: { name: "비트 사과 주스", icon: "🧃", ingredients: ["beet", "apple"], sellPrice: 78 },
  broccoliMushroom: { name: "브로콜리 버섯볶음", icon: "🥘", ingredients: ["broccoli", "mushroom"], sellPrice: 58 },
  cabbageRiceRoll: { name: "배추 쌈밥", icon: "🍙", ingredients: ["cabbage", "rice"], sellPrice: 54 },
  applePie: { name: "햇살 사과 파이", icon: "🥧", ingredients: ["wheat", "apple"], sellPrice: 88 },
  blueberryCake: { name: "블루베리 레몬 케이크", icon: "🍰", ingredients: ["wheat", "blueberry", "lemon"], sellPrice: 112 },
  grapePeachPunch: { name: "포도 복숭아 펀치", icon: "🍹", ingredients: ["grape", "peach"], sellPrice: 96 },
  pumpkinPorridge: { name: "호박 쌀죽", icon: "🥣", ingredients: ["pumpkin", "rice"], sellPrice: 66 },
  spicyPeanut: { name: "매콤 땅콩 볶음", icon: "🥜", ingredients: ["peanut", "chili"], sellPrice: 64 },
  carrotOrangeJuice: { name: "당근 오렌지 주스", icon: "🧃", ingredients: ["carrot", "orange"], sellPrice: 76 },
  pearKiwiSmoothie: { name: "배 키위 스무디", icon: "🥤", ingredients: ["pear", "kiwi"], sellPrice: 102 },
  watermelonBerryPunch: { name: "수박 딸기 화채", icon: "🍧", ingredients: ["watermelon", "strawberry"], sellPrice: 90 },
  barleyMushroomPilaf: { name: "보리 버섯 필라프", icon: "🍛", ingredients: ["barley", "mushroom", "onion"], sellPrice: 75 },
  oatBlueberryPorridge: { name: "귀리 블루베리죽", icon: "🥣", ingredients: ["oat", "blueberry"], sellPrice: 82 },
};

const defaultState = {
  schemaVersion: 46,
  tutorialCompleted: false,
  coins: 0,
  farmMoney: 0,
  farmRankingWeekStart: "",
  weeklyFarmMoneyEarned: 0,
  farmMailDate: "",
  farmMailSentCount: 0,
  farmMailHistory: [],
  farmInboxDate: "",
  farmInbox: [],
  farmName: "햇살 밭",
  productionBoostUntil: 0,
  wiltProtectionUntil: 0,
  marketRotationDate: "",
  dailySeedOffers: [],
  dailyFoodOffers: [],
  foodInventory: Object.fromEntries(Object.keys(RECIPES).map((recipeId) => [recipeId, 0])),
  discoveredRecipes: [],
  wasteCount: 0,
  farmItemInventory: Object.fromEntries(
    Object.keys(FARM_ITEMS).map((itemId) => [itemId, 0]),
  ),
  focusRewardSeconds: 0,
  focusYoutubeUrl: "",
  focusYoutubePlaylists: [],
  settings: {
    linked: { focusMinutes: 25, breakEnabled: true, breakMinutes: 5 },
    quick: { focusMinutes: 25, breakEnabled: true, breakMinutes: 5 },
  },
  seedInventory: Object.fromEntries(Object.keys(CROPS).map((cropId) => [cropId, 0])),
  harvestInventory: Object.fromEntries(Object.keys(CROPS).map((cropId) => [cropId, 0])),
  farmPlots: Array.from({ length: 16 }, (_, index) => ({
      id: index,
      crop: null,
      growth: 0,
      plantedDate: "",
      lastWateredDate: "",
      lastFreeWaterAt: 0,
      lastCaredAt: 0,
      wilted: false,
      fertilizer: null,
  })),
  groups: [
    { id: "work", name: "업무", colorIndex: 0 },
    { id: "study", name: "공부", colorIndex: 3 },
    { id: "life", name: "생활", colorIndex: 1 },
  ],
  tasks: [],
  habits: [],
};

const FARM_STATE_KEYS = [
  "farmRankingWeekStart",
  "weeklyFarmMoneyEarned",
  "farmMailDate",
  "farmMailSentCount",
  "farmMailHistory",
  "farmInboxDate",
  "farmInbox",
  "farmName",
  "productionBoostUntil",
  "wiltProtectionUntil",
  "marketRotationDate",
  "dailySeedOffers",
  "dailyFoodOffers",
  "foodInventory",
  "discoveredRecipes",
  "wasteCount",
  "farmItemInventory",
  "seedInventory",
  "harvestInventory",
  "farmPlots",
];

let state = loadState();
ensureWeeklyFarmRanking();
state.habits = state.habits.map((habit) => {
  const completionDates =
    habit.completionDates ??
    (habit.completedDate
      ? [habit.completedDate]
      : habit.complete
        ? [toLocalDateString()]
        : []);
  return {
    ...habit,
    targetByWeekday: habit.targetByWeekday ?? {},
    completedDate: habit.completedDate ?? (habit.complete ? toLocalDateString() : ""),
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
let focusProgressServerSeconds = 0;
let focusProgressApiUnavailable = false;
let focusProgressSyncPromise = null;
let focusRealtimeChannel = null;
let focusRealtimeRefreshTimer = null;
const pendingFocusSeconds = { linked: 0, quick: 0 };
const focusProgressEventQueue = [];
let activeFocus = null;
let currentPage = "today";
let taskGroupFilter = "all";
let taskArchiveView = false;
let habitCalendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedSeed = null;
let selectedFarmItem = null;
let selectedMailFriendCode = "";
let selectedMailCategory = "harvest";
let selectedMailItemId = null;
let farmMailView = "send";
let farmMailContacts = [];
let farmMailServerUnreadCount = null;
let farmMailUnreadPollInterval = null;
let farmMailRealtimeChannel = null;
let farmMailRealtimeRefreshTimer = null;
let farmContentRealtimeRefreshTimer = null;
let activeRankingRewardMailId = null;
let selectedFreePassTarget = null;
const selectedRecipeIngredients = ["", "", ""];
let farmLeaderboard = [];
ensureDailyFarmMail();
ensureDailyFarmInbox();

const taskForm = document.querySelector("#taskForm");
const taskInput = document.querySelector("#taskInput");
const taskGroup = document.querySelector("#taskGroup");
const customTaskGroupSelect = document.querySelector("#customTaskGroupSelect");
const taskGroupTrigger = document.querySelector("#taskGroupTrigger");
const taskGroupLabel = document.querySelector("#taskGroupLabel");
const taskGroupMenu = document.querySelector("#taskGroupMenu");
const groupManager = document.querySelector("#groupManager");
const groupInput = document.querySelector("#groupInput");
const habitForm = document.querySelector("#habitForm");
const habitModal = document.querySelector("#habitModal");
const habitModalKicker = habitModal.querySelector(".section-kicker");
const habitModalTitle = document.querySelector("#habitModalTitle");
const habitModalDescription = habitModal.querySelector("header p");
const habitSubmitButton = habitForm.querySelector(".habit-submit");
const openHabitFormButton = document.querySelector("#openHabitForm");
const habitDeleteModal = document.querySelector("#habitDeleteModal");
const habitDeleteName = document.querySelector("#habitDeleteName");
const confirmHabitDelete = document.querySelector("#confirmHabitDelete");
const taskDeleteModal = document.querySelector("#taskDeleteModal");
const taskDeleteName = document.querySelector("#taskDeleteName");
const taskDeleteCoinAmount = document.querySelector("#taskDeleteCoinAmount");
const confirmTaskDelete = document.querySelector("#confirmTaskDelete");
const habitModalFormSlot = document.querySelector("#habitModalFormSlot");
const habitInput = document.querySelector("#habitInput");
const habitMeasureType = document.querySelector("#habitMeasureType");
const habitMeasureSelect = document.querySelector(".habit-measure-select");
const habitMeasureTrigger = document.querySelector("#habitMeasureTrigger");
const habitMeasureLabel = document.querySelector("#habitMeasureLabel");
const habitMeasureMenu = document.querySelector("#habitMeasureMenu");
const habitTargetValue = document.querySelector("#habitTargetValue");
const habitWeekdayTargetsEnabled = document.querySelector("#habitWeekdayTargetsEnabled");
const habitWeekdayTargets = document.querySelector("#habitWeekdayTargets");
const habitUnit = document.querySelector("#habitUnit");
const habitEndDate = document.querySelector("#habitEndDate");
const freePassTargetModal = document.querySelector("#freePassTargetModal");
const freePassTargetList = document.querySelector("#freePassTargetList");
const confirmFreePassTarget = document.querySelector("#confirmFreePassTarget");
const toast = document.querySelector("#toast");
const miniFocusMusic = document.querySelector("#miniFocusMusic");
const miniFocusMusicTitle = document.querySelector("#miniFocusMusicTitle");
const miniFocusTimer = document.querySelector("#miniFocusTimer");
const miniFocusStatus = document.querySelector("#miniFocusStatus");
const miniFocusTitle = document.querySelector("#miniFocusTitle");
const miniFocusTime = document.querySelector("#miniFocusTime");
const miniFocusPause = document.querySelector("#miniFocusPause");
let miniFocusMode = null;
let pendingHabitDeleteId = null;
let pendingTaskDeleteId = null;
let editingTaskId = null;
let editingTaskGroupId = null;
let editingTaskTitle = "";
let editingHabitId = null;

function resetFarmDataDatabaseState() {
  stopFarmMailRealtime();
  farmDataHydrated = false;
  farmDataUserId = null;
  lastFarmDataSyncSignature = "";
  lastFarmDataSyncError = "";
  farmDataSyncChain = Promise.resolve();
  farmDataLoadRequest += 1;
  if (farmDataSyncTimer) clearTimeout(farmDataSyncTimer);
  farmDataSyncTimer = null;
  farmMailContacts = [];
  farmMailServerUnreadCount = null;
  if (farmMailUnreadPollInterval) clearInterval(farmMailUnreadPollInterval);
  farmMailUnreadPollInterval = null;
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

function stopFarmMailRealtime() {
  if (farmMailRealtimeRefreshTimer) clearTimeout(farmMailRealtimeRefreshTimer);
  if (farmContentRealtimeRefreshTimer) clearTimeout(farmContentRealtimeRefreshTimer);
  if (farmWalletRealtimeRefreshTimer) clearTimeout(farmWalletRealtimeRefreshTimer);
  farmMailRealtimeRefreshTimer = null;
  farmContentRealtimeRefreshTimer = null;
  farmWalletRealtimeRefreshTimer = null;
  if (farmMailRealtimeChannel && supabaseClient) {
    void supabaseClient.removeChannel(farmMailRealtimeChannel);
  }
  farmMailRealtimeChannel = null;
}

function scheduleFarmContentRealtimeRefresh(userId) {
  if (activeAuthUser?.id !== userId) return;
  if (farmContentRealtimeRefreshTimer) clearTimeout(farmContentRealtimeRefreshTimer);
  farmContentRealtimeRefreshTimer = window.setTimeout(async () => {
    farmContentRealtimeRefreshTimer = null;
    if (activeAuthUser?.id !== userId) return;
    await syncFarmDataDatabaseImmediately();
    const farmUiVisible =
      currentPage === "farm" ||
      !document.querySelector("#farmMailModal")?.classList.contains("hidden") ||
      !document.querySelector("#farmKitchenModal")?.classList.contains("hidden");
    if (farmUiVisible) await loadFarmDataFromDatabase(activeAuthUser);
  }, 500);
}

function scheduleFarmMailRealtimeRefresh(userId) {
  if (activeAuthUser?.id !== userId) return;
  if (farmMailRealtimeRefreshTimer) clearTimeout(farmMailRealtimeRefreshTimer);
  farmMailRealtimeRefreshTimer = window.setTimeout(async () => {
    farmMailRealtimeRefreshTimer = null;
    if (activeAuthUser?.id !== userId) return;
    await pollFarmMailUnreadCount(activeAuthUser);
    const mailModalOpen = !document.querySelector("#farmMailModal")?.classList.contains("hidden");
    if (currentPage === "farm" || mailModalOpen) {
      await syncFarmDataDatabaseImmediately();
      await loadFarmDataFromDatabase(activeAuthUser);
    }
  }, 350);
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

function startFarmMailRealtime(user) {
  stopFarmMailRealtime();
  if (!supabaseClient || !user) return;
  const handleChange = () => scheduleFarmMailRealtimeRefresh(user.id);
  const handleFarmContentChange = () => scheduleFarmContentRealtimeRefresh(user.id);
  const handleWalletChange = () => scheduleFarmWalletRealtimeRefresh(user);
  farmMailRealtimeChannel = supabaseClient
    .channel(`farm-mail:${user.id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "farm_mail",
        filter: `recipient_user_id=eq.${user.id}`,
      },
      handleChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "farm_mail",
        filter: `sender_user_id=eq.${user.id}`,
      },
      handleChange,
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "farm_mail_items" }, handleChange)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "farm_wallets",
        filter: `user_id=eq.${user.id}`,
      },
      handleWalletChange,
    )
  farmMailRealtimeChannel = subscribeToUserTables(
    farmMailRealtimeChannel,
    [
      "farms",
      "farm_plots",
      "farm_inventory",
      "farm_recipe_discoveries",
      "farm_market_rotations",
      "farm_weekly_earnings",
    ],
    user.id,
    handleFarmContentChange,
  );
  farmMailRealtimeChannel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn(`Farmodoro farm mail realtime subscription: ${status}`);
      }
    });
}

async function pollFarmMailUnreadCount(user = activeAuthUser) {
  if (!supabaseClient || !user) return;
  const requestedUserId = user.id;
  const { data, error } = await supabaseClient.rpc("get_my_unclaimed_farm_mail_count");
  if (activeAuthUser?.id !== requestedUserId) return;
  if (error) {
    if (!["42883", "PGRST202"].includes(error.code)) {
      console.warn("Farmodoro unread mail count could not be loaded", error);
    }
    return;
  }
  farmMailServerUnreadCount = Math.max(0, Number(data) || 0);
  renderFarmMail();
}

function startFarmMailUnreadPolling(user) {
  if (farmMailUnreadPollInterval) clearInterval(farmMailUnreadPollInterval);
  void pollFarmMailUnreadCount(user);
  farmMailUnreadPollInterval = window.setInterval(() => {
    void pollFarmMailUnreadCount(user);
  }, 300000);
}

function toDatabaseTimestamp(milliseconds) {
  const value = Number(milliseconds ?? 0);
  return value > 0 ? new Date(value).toISOString() : "";
}

function buildFarmDatabaseState(snapshot = state) {
  const inventory = [
    ...Object.entries(snapshot.seedInventory).map(([itemId, quantity]) => ({ category: "seed", itemId, quantity })),
    ...Object.entries(snapshot.harvestInventory).map(([itemId, quantity]) => ({ category: "harvest", itemId, quantity })),
    ...Object.entries(snapshot.farmItemInventory).map(([itemId, quantity]) => ({ category: "supply", itemId, quantity })),
    ...Object.entries(snapshot.foodInventory).map(([itemId, quantity]) => ({ category: "food", itemId, quantity })),
  ];
  return {
    farm: {
      farmName: snapshot.farmName,
      productionBoostUntil: toDatabaseTimestamp(snapshot.productionBoostUntil),
      wiltProtectionUntil: toDatabaseTimestamp(snapshot.wiltProtectionUntil),
      wasteCount: snapshot.wasteCount,
    },
    plots: snapshot.farmPlots.map((plot) => ({
      id: plot.id,
      crop: plot.crop ?? "",
      growth: plot.growth ?? 0,
      plantedDate: plot.plantedDate ?? "",
      lastWateredDate: plot.lastWateredDate ?? "",
      lastFreeWaterAt: toDatabaseTimestamp(plot.lastFreeWaterAt),
      lastCaredAt: toDatabaseTimestamp(plot.lastCaredAt),
      wilted: Boolean(plot.wilted),
      fertilizer: plot.fertilizer ?? "",
    })),
    inventory,
    discoveredRecipes: [...snapshot.discoveredRecipes],
    marketRotation: {
      date: snapshot.marketRotationDate,
      seedOffers: [...snapshot.dailySeedOffers],
      foodOffers: [...snapshot.dailyFoodOffers],
    },
  };
}

function serializeFarmData(snapshot = state) {
  return JSON.stringify(buildFarmDatabaseState(snapshot));
}

function getFarmMailItemName(category, itemId) {
  if (category === "supply") return FARM_ITEMS[itemId]?.name ?? itemId;
  if (category === "food") return RECIPES[itemId]?.name ?? itemId;
  const cropName = CROPS[itemId]?.name ?? itemId;
  return category === "seed" ? `${cropName} 씨앗` : cropName;
}

function mapFarmInboxFromDatabase(inbox = []) {
  return inbox.flatMap((mail) => {
    const items = Array.isArray(mail.items) ? mail.items : [];
    const isWeeklyReward = mail.mailType === "weekly_ranking";
    const isUpdateReward = mail.mailType === "system";
    const sender = {
      id: mail.senderUserId || SYSTEM_FARM_SENDER.id,
      name: mail.senderName || "시스템",
      farmName: isWeeklyReward || isUpdateReward ? "Farmodoro 운영국" : "농장 우편",
      avatar: isUpdateReward ? "📣" : isWeeklyReward ? "🤖" : "📬",
    };
    const receivedDate = toLocalDateString(new Date(mail.sentAt));
    if (isWeeklyReward || isUpdateReward) {
      const ranking = Number(String(mail.subject ?? "").match(/(\d+)위/)?.[1] ?? 0);
      return [{
        id: mail.id,
        friendId: SYSTEM_FARM_SENDER.id,
        sender,
        category: isUpdateReward ? "updateBox" : "rankingBox",
        itemId: items[0]?.itemId ?? "carrot",
        ranking,
        updateNote: isUpdateReward ? String(mail.subject || "Farmodoro 업데이트") : "",
        boxCropIds: items.map((item) => item.itemId),
        dbItemIds: items.map((item) => item.id),
        openedBoxIndexes: items
          .map((item, index) => item.claimedAt ? index : -1)
          .filter((index) => index >= 0),
        claimed: items.length > 0 && items.every((item) => Boolean(item.claimedAt)),
        receivedDate,
      }];
    }
    return items.map((item) => ({
      id: item.id,
      mailId: mail.id,
      dbItemId: item.id,
      friendId: mail.senderUserId || SYSTEM_FARM_SENDER.id,
      sender,
      category: item.category,
      itemId: item.itemId,
      claimed: Boolean(item.claimedAt),
      receivedDate,
    }));
  });
}

function mapFarmSentHistoryFromDatabase(sentToday = []) {
  return sentToday.flatMap((mail) =>
    (mail.items ?? []).map((item) => ({
      id: `${mail.id}:${item.category}:${item.itemId}`,
      friendName: mail.recipientName || "농부",
      category: item.category,
      itemId: item.itemId,
      itemName: getFarmMailItemName(item.category, item.itemId),
      sentTime: new Date(mail.sentAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
    })),
  );
}

async function loadFarmMailContacts(user) {
  if (!supabaseClient || !user) return;
  const requestedUserId = user.id;
  const { data, error } = await supabaseClient.rpc("get_my_farm_mail_contacts");
  if (activeAuthUser?.id !== requestedUserId) return;
  if (error) {
    if (!["42883", "PGRST202"].includes(error.code)) {
      console.warn("Farmodoro mail contacts could not be loaded", error);
    }
    return;
  }
  farmMailContacts = (data ?? [])
    .map((contact) => ({
      code: String(contact.farm_code || "").toUpperCase(),
      name: String(contact.display_name || "농부"),
    }))
    .filter((contact) => /^FARM-[A-F0-9]{4}-[A-F0-9]{4}$/.test(contact.code));
}

async function loadFarmDataFromDatabase(user) {
  if (!supabaseClient || !user) return;
  const requestedUserId = user.id;
  const requestId = ++farmDataLoadRequest;
  const previousRenderSignature = farmDataUserId === requestedUserId && farmDataHydrated
    ? JSON.stringify({
        farm: serializeFarmData(),
        inbox: state.farmInbox,
        history: state.farmMailHistory,
        sentCount: state.farmMailSentCount,
        weeklyEarned: state.weeklyFarmMoneyEarned,
      })
    : "";
  farmDataHydrated = false;
  farmDataUserId = requestedUserId;
  let { data, error } = await supabaseClient.rpc("get_my_farm_state_v2");
  if (error?.code === "PGRST202" || error?.code === "42883") {
    ({ data, error } = await supabaseClient.rpc("get_my_farm_state"));
  }
  if (
    requestId !== farmDataLoadRequest ||
    activeAuthUser?.id !== requestedUserId ||
    farmDataUserId !== requestedUserId
  ) return;
  if (error) {
    console.error("Farmodoro farm data could not be loaded", error);
    showToast(`농장 DB 불러오기 실패 · ${error.message || "알 수 없는 오류"}`);
    return;
  }

  const farm = data?.farm ?? {};
  state.farmName = farm.farmName || defaultState.farmName;
  state.productionBoostUntil = Date.parse(farm.productionBoostUntil || "") || 0;
  state.wiltProtectionUntil = Date.parse(farm.wiltProtectionUntil || "") || 0;
  state.wasteCount = Math.max(0, Number(farm.wasteCount ?? 0));

  const plotRows = new Map((data?.plots ?? []).map((plot) => [Number(plot.id), plot]));
  state.farmPlots = defaultState.farmPlots.map((fallback, index) => {
    const plot = plotRows.get(index);
    if (!plot) return structuredClone(fallback);
    return {
      id: index,
      crop: CROPS[plot.crop] ? plot.crop : null,
      growth: Math.max(0, Number(plot.growth ?? 0)),
      plantedDate: plot.plantedDate ?? "",
      lastWateredDate: plot.lastWateredDate ?? "",
      lastFreeWaterAt: Date.parse(plot.lastFreeWaterAt || "") || 0,
      lastCaredAt:
        Date.parse(plot.lastCaredAt || "") ||
        (plot.crop ? Date.now() : 0),
      wilted: Boolean(plot.wilted),
      fertilizer: FARM_ITEMS[plot.fertilizer] ? plot.fertilizer : null,
    };
  });

  state.seedInventory = structuredClone(defaultState.seedInventory);
  state.harvestInventory = structuredClone(defaultState.harvestInventory);
  state.farmItemInventory = structuredClone(defaultState.farmItemInventory);
  state.foodInventory = structuredClone(defaultState.foodInventory);
  const inventoryTargets = {
    seed: state.seedInventory,
    harvest: state.harvestInventory,
    supply: state.farmItemInventory,
    food: state.foodInventory,
  };
  (data?.inventory ?? []).forEach((entry) => {
    const target = inventoryTargets[entry.category];
    if (target && Object.hasOwn(target, entry.itemId)) {
      target[entry.itemId] = Math.max(0, Number(entry.quantity ?? 0));
    }
  });

  state.discoveredRecipes = (data?.discoveredRecipes ?? []).filter((recipeId) => RECIPES[recipeId]);
  const rotation = data?.marketRotation ?? {};
  state.marketRotationDate = rotation.date ?? "";
  state.dailySeedOffers = (rotation.seedOffers ?? []).filter((cropId) => CROPS[cropId]);
  state.dailyFoodOffers = (rotation.foodOffers ?? []).filter((recipeId) => RECIPES[recipeId]);
  state.farmRankingWeekStart = getFarmWeekStart();
  state.weeklyFarmMoneyEarned = Math.max(0, Number(data?.weeklyFarmMoneyEarned ?? 0));
  state.farmInbox = mapFarmInboxFromDatabase(data?.inbox ?? []);
  farmMailServerUnreadCount = state.farmInbox.filter((mail) => !mail.claimed).length;
  state.farmInboxDate = toLocalDateString();
  state.farmMailHistory = mapFarmSentHistoryFromDatabase(data?.sentToday ?? []);
  state.farmMailDate = toLocalDateString();
  state.farmMailSentCount = (data?.sentToday ?? []).length;

  await loadFarmMailContacts(user);
  if (
    requestId !== farmDataLoadRequest ||
    activeAuthUser?.id !== requestedUserId ||
    farmDataUserId !== requestedUserId
  ) return;

  farmDataHydrated = true;
  const nextSignature = serializeFarmData();
  const nextRenderSignature = JSON.stringify({
    farm: nextSignature,
    inbox: state.farmInbox,
    history: state.farmMailHistory,
    sentCount: state.farmMailSentCount,
    weeklyEarned: state.weeklyFarmMoneyEarned,
  });
  lastFarmDataSyncSignature = nextSignature;
  ensureDailyMarket();
  if (nextRenderSignature !== previousRenderSignature) render();
}

function scheduleFarmDataDatabaseSync(delay = 250) {
  if (!farmDataHydrated || !activeAuthUser || activeAuthUser.id !== farmDataUserId) return;
  const signature = serializeFarmData();
  if (signature === lastFarmDataSyncSignature) return;
  if (farmDataSyncTimer) {
    if (delay > 0) return;
    clearTimeout(farmDataSyncTimer);
  }
  farmDataSyncTimer = window.setTimeout(() => {
    farmDataSyncTimer = null;
    const userId = activeAuthUser?.id;
    if (!userId || userId !== farmDataUserId) return;
    const latestSignature = serializeFarmData();
    const payload = JSON.parse(latestSignature);
    farmDataSyncChain = farmDataSyncChain
      .then(async () => {
        let { error } = await supabaseClient.rpc("save_my_farm_state_v2", { p_state: payload });
        if (error?.code === "PGRST202" || error?.code === "42883") {
          ({ error } = await supabaseClient.rpc("save_my_farm_state", { p_state: payload }));
        }
        if (error) throw error;
      })
      .then(() => {
        if (activeAuthUser?.id === userId) {
          lastFarmDataSyncSignature = latestSignature;
          lastFarmDataSyncError = "";
        }
      })
      .catch((syncError) => {
        console.error("Farmodoro farm data could not be saved", syncError);
        if (activeAuthUser?.id === userId) {
          const message = syncError?.message || "알 수 없는 오류";
          if (message !== lastFarmDataSyncError) {
            lastFarmDataSyncError = message;
            showToast(`농장 DB 저장 실패 · ${message}`);
          }
        }
      });
  }, delay);
}

async function syncFarmDataDatabaseImmediately() {
  if (!farmDataHydrated || !activeAuthUser || activeAuthUser.id !== farmDataUserId) return;
  if (farmDataSyncTimer) clearTimeout(farmDataSyncTimer);
  farmDataSyncTimer = null;

  const userId = activeAuthUser.id;
  const signature = serializeFarmData();
  if (signature === lastFarmDataSyncSignature) {
    await farmDataSyncChain;
    return;
  }
  const payload = JSON.parse(signature);
  const operation = farmDataSyncChain.then(async () => {
    let { error } = await supabaseClient.rpc("save_my_farm_state_v2", { p_state: payload });
    if (error?.code === "PGRST202" || error?.code === "42883") {
      ({ error } = await supabaseClient.rpc("save_my_farm_state", { p_state: payload }));
    }
    if (error) throw error;
  });
  farmDataSyncChain = operation.catch(() => {});
  await operation;
  if (activeAuthUser?.id === userId) {
    lastFarmDataSyncSignature = signature;
    lastFarmDataSyncError = "";
  }
}

async function persistFarmPlotAction(revert, failureMessage) {
  try {
    await syncFarmDataDatabaseImmediately();
  } catch (error) {
    console.error("Farmodoro farm plot action could not be saved", error);
    revert();
    render();
    showToast(failureMessage);
  }
}

function loadState(savedState = null) {
  try {
    const saved = savedState && typeof savedState === "object" ? savedState : null;
    if (!saved) return structuredClone(defaultState);
    delete saved.decorationInventory;
    delete saved.farmDecorations;
    delete saved.farmRankingDemoRewardSent;
    delete saved.farmRankingBoxExperienceReady;
    delete saved.farmRankingSecondPlaceDemoSent;
    const migratedCoins = Number(saved.coins ?? 0);
    const migratedFarmMoney = Number(saved.farmMoney ?? 0);
    const migratedFarmPlots =
      Array.isArray(saved.farmPlots) && saved.farmPlots.length === 16
        ? saved.farmPlots.map((plot, index) => ({
            id: plot.id ?? index,
            crop: plot.crop ?? null,
            growth: plot.growth ?? 0,
            plantedDate:
              plot.plantedDate ??
              (plot.crop ? plot.lastWateredDate ?? toLocalDateString() : ""),
            lastWateredDate:
              plot.lastWateredDate ?? (plot.crop ? toLocalDateString() : ""),
            lastFreeWaterAt: Number(plot.lastFreeWaterAt ?? 0),
            lastCaredAt: Number(plot.lastCaredAt ?? (plot.crop ? Date.now() : 0)),
            wilted: plot.wilted ?? false,
            fertilizer: plot.fertilizer ?? null,
          }))
        : structuredClone(defaultState.farmPlots);

    return {
      ...structuredClone(defaultState),
      ...saved,
      schemaVersion: 46,
      coins: migratedCoins,
      farmMoney: migratedFarmMoney,
      farmRankingWeekStart: saved.farmRankingWeekStart ?? "",
      weeklyFarmMoneyEarned: Number(saved.weeklyFarmMoneyEarned ?? 0),
      farmMailDate: saved.farmMailDate ?? "",
      farmMailSentCount: Number(saved.farmMailSentCount ?? 0),
      farmMailHistory: Array.isArray(saved.farmMailHistory) ? saved.farmMailHistory : [],
      farmInboxDate: saved.farmInboxDate ?? "",
      farmInbox: Array.isArray(saved.farmInbox) ? saved.farmInbox : [],
      farmName: saved.farmName ?? defaultState.farmName,
      productionBoostUntil: saved.productionBoostUntil ?? 0,
      wiltProtectionUntil: saved.wiltProtectionUntil ?? 0,
      marketRotationDate: saved.marketRotationDate ?? "",
      dailySeedOffers: saved.dailySeedOffers ?? [],
      dailyFoodOffers: saved.dailyFoodOffers ?? [],
      foodInventory: {
        ...structuredClone(defaultState.foodInventory),
        ...(saved.foodInventory ?? {}),
      },
      discoveredRecipes: saved.discoveredRecipes ?? [],
      wasteCount: saved.wasteCount ?? 0,
      farmItemInventory: {
        ...structuredClone(defaultState.farmItemInventory),
        ...(saved.farmItemInventory ?? {}),
      },
      focusYoutubeUrl:
        typeof saved.focusYoutubeUrl === "string" ? saved.focusYoutubeUrl : "",
      focusYoutubePlaylists: (
        Array.isArray(saved.focusYoutubePlaylists)
          ? saved.focusYoutubePlaylists
          : saved.focusYoutubeUrl
            ? [{ id: createUuid(), title: "내 집중 음악", url: saved.focusYoutubeUrl }]
            : []
      )
        .filter((item) => item && typeof item.url === "string")
        .slice(0, 5)
        .map((item, index) => ({
          id: typeof item.id === "string" && item.id ? item.id : createUuid(),
          title:
            typeof item.title === "string" && item.title.trim()
              ? item.title.trim().slice(0, 30)
              : `플레이리스트 ${index + 1}`,
          url: item.url.trim(),
        })),
      settings: normalizeFocusSettings(saved.settings),
      seedInventory: {
        ...structuredClone(defaultState.seedInventory),
        ...(saved.seedInventory ?? {}),
      },
      harvestInventory: {
        ...structuredClone(defaultState.harvestInventory),
        ...(saved.harvestInventory ?? {}),
      },
      farmPlots: migratedFarmPlots,
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
          (task.status === "done" && !task.archived ? toLocalDateString() : ""),
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
  scheduleAppStateDatabaseSync(JSON.parse(serializeAppState()));
  scheduleTaskDatabaseSync();
  scheduleFarmDataDatabaseSync();
}

function serializeAppState(snapshot = state) {
  const appState = { ...snapshot };
  ["groups", "tasks", "habits", "coins", "farmMoney", ...FARM_STATE_KEYS]
    .forEach((key) => delete appState[key]);
  return JSON.stringify(appState);
}

function resetAppStateDatabaseState() {
  appStateHydrated = false;
  appStateUserId = null;
  lastAppStateSyncSignature = "";
  if (appStateSyncTimer) clearTimeout(appStateSyncTimer);
  appStateSyncTimer = null;
}

function applyLoadedAppStateRuntime() {
  ensureWeeklyFarmRanking();
  ensureDailyFarmMail();
  ensureDailyFarmInbox();
  if (typeof focusRuntimeByMode !== "undefined") {
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
    syncFocusSettingsForm();
  }
}

async function loadAppStateFromDatabase(user) {
  if (!supabaseClient || !user) return;
  const requestedUserId = user.id;
  appStateHydrated = false;
  appStateUserId = requestedUserId;

  const { data, error } = await supabaseClient
    .from("user_app_state")
    .select("state")
    .eq("user_id", requestedUserId)
    .maybeSingle();

  if (activeAuthUser?.id !== requestedUserId || appStateUserId !== requestedUserId) return;
  const productivityState = {
    groups: state.groups,
    tasks: state.tasks,
    habits: state.habits,
  };
  const farmState = captureFarmState();
  if (error) {
    console.error("Farmodoro app state could not be loaded", error);
    showToast("앱 데이터를 불러오지 못했어. 잠시 후 다시 시도해줘");
    return;
  }
  state = loadState(data?.state ?? null);
  // Coin and Farm Money are owned exclusively by farm_wallets.
  // Never display an older balance that may still exist in user_app_state.
  state.coins = 0;
  state.farmMoney = 0;
  restoreFarmState(farmState);
  state.groups = productivityState.groups;
  state.tasks = productivityState.tasks;
  state.habits = productivityState.habits;

  applyLoadedAppStateRuntime();
  appStateHydrated = true;
  lastAppStateSyncSignature = serializeAppState();
  render();
}

function scheduleAppStateDatabaseSync(snapshot = null, delay = 300) {
  if (!appStateHydrated || !activeAuthUser || activeAuthUser.id !== appStateUserId) return;
  const signature = snapshot ? JSON.stringify(snapshot) : serializeAppState();
  if (signature === lastAppStateSyncSignature) return;
  if (appStateSyncTimer) {
    if (delay > 0) return;
    clearTimeout(appStateSyncTimer);
  }

  appStateSyncTimer = window.setTimeout(() => {
    appStateSyncTimer = null;
    const userId = activeAuthUser?.id;
    if (!userId || userId !== appStateUserId) return;
    const latestSignature = serializeAppState();
    const savedState = JSON.parse(latestSignature);
    appStateSyncChain = appStateSyncChain
      .then(async () => {
        const { error } = await supabaseClient
          .from("user_app_state")
          .upsert({ user_id: userId, state: savedState }, { onConflict: "user_id" });
        if (error) throw error;
      })
      .then(() => {
        if (activeAuthUser?.id === userId) lastAppStateSyncSignature = latestSignature;
      })
      .catch((error) => {
        console.error("Farmodoro app state could not be saved", error);
        if (activeAuthUser?.id === userId) {
          showToast("앱 데이터를 저장하지 못했어. 연결을 확인해줘");
        }
      });
  }, delay);
}

async function syncAppStateDatabaseImmediately() {
  if (!appStateHydrated || !activeAuthUser || activeAuthUser.id !== appStateUserId) {
    throw new Error("로그인한 계정의 앱 데이터를 아직 불러오지 못했어");
  }
  if (appStateSyncTimer) clearTimeout(appStateSyncTimer);
  appStateSyncTimer = null;

  const userId = activeAuthUser.id;
  const signature = serializeAppState();
  const savedState = JSON.parse(signature);
  const operation = appStateSyncChain.then(async () => {
    const { error } = await supabaseClient
      .from("user_app_state")
      .upsert({ user_id: userId, state: savedState }, { onConflict: "user_id" });
    if (error) throw error;
  });
  appStateSyncChain = operation.catch(() => {});
  await operation;
  if (activeAuthUser?.id === userId) lastAppStateSyncSignature = signature;
}

function isFocusTimerOwner() {
  return focusTimerOwnerId === FOCUS_TIMER_CLIENT_ID;
}

function resetFocusTimerDatabaseState() {
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
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn(`Farmodoro focus realtime subscription: ${status}`);
      }
    });
}

function getFocusTimerDatabasePayload() {
  return {
    version: 1,
    ownerId: runningFocusMode ? focusTimerOwnerId : "",
    runningMode: runningFocusMode,
    focusMode,
    activeFocus: activeFocus ? { ...activeFocus } : null,
    rewardSeconds: Math.max(0, Math.floor(Number(state.focusRewardSeconds) || 0)),
    runtimes: {
      linked: { ...focusRuntimeByMode.linked },
      quick: { ...focusRuntimeByMode.quick },
    },
    syncedAt: new Date().toISOString(),
  };
}

function normalizeFocusTimerRuntime(value, fallback) {
  const seconds = Math.max(0, Math.floor(Number(value?.seconds ?? fallback.seconds)));
  return {
    seconds,
    phase: value?.phase === "break" ? "break" : "focus",
    started: Boolean(value?.started),
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
  const staleQuickRuntime = savedQuickMinutes !== configuredQuickMinutes;
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
  if (focusProgressApiUnavailable && Number.isFinite(Number(payload.rewardSeconds))) {
    state.focusRewardSeconds = Math.max(0, Math.floor(Number(payload.rewardSeconds))) % 3600;
  }

  if (runningFocusMode) {
    const runtime = focusRuntimeByMode[runningFocusMode];
    const ownsTimer = isFocusTimerOwner();
    const syncedAt = Date.parse(payload.syncedAt || updatedAt || "");
    const elapsedSeconds = ownsTimer && Number.isFinite(syncedAt)
      ? Math.max(0, Math.floor((Date.now() - syncedAt) / 1000))
      : 0;
    const item = runningFocusMode === "linked" ? getFocusItem() : null;
    const isTaskStopwatch = Boolean(item && activeFocus?.type === "task");
    const appliedSeconds = isTaskStopwatch
      ? elapsedSeconds
      : Math.min(elapsedSeconds, runtime.seconds);
    runtime.seconds = isTaskStopwatch
      ? runtime.seconds + appliedSeconds
      : Math.max(0, runtime.seconds - appliedSeconds);

    let recoveredFocusSeconds = 0;
    if (ownsTimer && runtime.phase === "focus" && appliedSeconds > 0) {
      if (item && activeFocus?.type === "task") {
        const savedTaskSeconds = Math.max(0, Math.floor(Number(item.focusSeconds) || 0));
        item.focusSeconds = Math.max(savedTaskSeconds, runtime.seconds);
        recoveredFocusSeconds = item.focusSeconds - savedTaskSeconds;
      } else if (item && activeFocus?.type === "habit") {
        const today = toLocalDateString();
        const previousFocusSeconds = getHabitDailyFocusSeconds(item, today);
        const targetSeconds = Math.max(0, getHabitTargetForDate(item) * 60);
        item.focusSecondsByDate ??= {};
        item.focusSecondsByDate[today] = Math.min(
          targetSeconds,
          previousFocusSeconds + appliedSeconds,
        );
        recoveredFocusSeconds = item.focusSecondsByDate[today] - previousFocusSeconds;
      } else {
        recoveredFocusSeconds = appliedSeconds;
      }

      if (recoveredFocusSeconds > 0) {
        addFocusSecond(recoveredFocusSeconds, runningFocusMode);
        scheduleTaskDatabaseSync(0);
        void flushFocusTime();
      }
    }
    focusLastTickAt = ownsTimer ? Date.now() : 0;
    if (ownsTimer) startFocusTickInterval(runningFocusMode);
  } else {
    focusLastTickAt = 0;
  }

  if (activeFocus?.type === "task") {
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
  if (focusMode === "linked") focusSettings.classList.add("hidden");
  renderFocusPicker();
  updateFocusActionButton();
  updateFocusDisplay();
  updateFocusTarget();
  updateMiniFocusTimer();
  renderSummary();
  if (staleQuickRuntime) scheduleFocusTimerDatabaseSync(0);
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
    focusTimerDatabaseUnavailable
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
  if (!data?.state || !data.updated_at || data.updated_at <= focusTimerLastUpdatedAt) return;
  applyFocusTimerDatabaseState(data.state, data.updated_at);
}

async function syncFocusTimerDatabaseImmediately() {
  if (
    !supabaseClient ||
    !activeAuthUser ||
    !focusTimerDatabaseHydrated ||
    focusTimerDatabaseUnavailable
  ) return;
  if (focusTimerSyncTimer) clearTimeout(focusTimerSyncTimer);
  focusTimerSyncTimer = null;
  const userId = activeAuthUser.id;
  if (runningFocusMode && isFocusTimerOwner() && focusTimerLastUpdatedAt) {
    const { data: latest, error: latestError } = await supabaseClient
      .from("user_focus_timer")
      .select("state, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (activeAuthUser?.id !== userId) return;
    if (latestError) {
      handleFocusTimerDatabaseError(latestError);
      return;
    }
    if (latest?.updated_at && latest.updated_at > focusTimerLastUpdatedAt) {
      applyFocusTimerDatabaseState(latest.state, latest.updated_at);
      return;
    }
  }
  const payload = getFocusTimerDatabasePayload();
  const { data, error } = await supabaseClient
    .from("user_focus_timer")
    .upsert({ user_id: userId, state: payload }, { onConflict: "user_id" })
    .select("updated_at")
    .single();
  if (activeAuthUser?.id !== userId) return;
  if (error) {
    handleFocusTimerDatabaseError(error);
    return;
  }
  focusTimerLastUpdatedAt = data?.updated_at || focusTimerLastUpdatedAt;
}

function scheduleFocusTimerDatabaseSync(delay = 300) {
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
      const progressValue = habit.measureType === "count"
        ? Math.max(0, Number(habit.progressByDate?.[recordDate] ?? 0))
        : habit.completionDates.includes(recordDate)
          ? targetValue
          : 0;
      const completed =
        habit.completionDates.includes(recordDate) ||
        (habit.measureType === "count" && progressValue >= targetValue);
      const recordMeta = habit.recordMetaByDate?.[recordDate] ?? {};
      const isToday = recordDate === toLocalDateString();
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
      measure_type: habit.measureType,
      target_value: Number(habit.targetValue),
      target_by_weekday: habit.targetByWeekday ?? {},
      unit: habit.unit,
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
  const today = toLocalDateString();
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
  const previousRenderSignature = hadCurrentData ? serializeTaskRenderSignature() : "";
  const liveFocusItem = runningFocusMode === "linked" && isFocusTimerOwner()
    ? getFocusItem()
    : null;
  const liveFocusSnapshot = liveFocusItem && activeFocus
    ? {
        type: activeFocus.type,
        id: liveFocusItem.id,
        taskSeconds: Number(liveFocusItem.focusSeconds ?? 0),
        habitSeconds: getHabitDailyFocusSeconds(liveFocusItem),
      }
    : null;
  taskDataUserId = user.id;
  taskDataHydrated = false;
  const requestedUserId = user.id;

  taskDataLoadPromise = (async () => {
    const { data, error } = await supabaseClient.rpc("get_my_productivity_state");
    if (error) throw error;
    const groupRows = Array.isArray(data?.groups) ? data.groups : [];
    const taskRows = Array.isArray(data?.tasks) ? data.tasks : [];
    const habitRows = Array.isArray(data?.habits) ? data.habits : [];
    const habitRecordRows = Array.isArray(data?.habitRecords) ? data.habitRecords : [];
    if (activeAuthUser?.id !== requestedUserId || taskDataUserId !== requestedUserId) return;

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
        const today = toLocalDateString();
        habit.focusSecondsByDate[today] = Math.max(
          getHabitDailyFocusSeconds(habit),
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
  const operation = taskSyncChain.then(() => syncTaskDatabaseSnapshot(userId, snapshot));
  taskSyncChain = operation.catch(() => {});
  await operation;
  if (activeAuthUser?.id === userId) lastTaskSyncSignature = snapshotSignature;
}

async function syncTaskDatabaseSnapshot(userId, snapshot) {
  if (activeAuthUser?.id !== userId || taskDataUserId !== userId) return;

  productivityRealtimeMutedUntil = Math.max(productivityRealtimeMutedUntil, Date.now() + 5000);

  const groupRows = snapshot.groups.map((group) => ({ ...group, user_id: userId }));
  const taskRows = snapshot.tasks.map((task) => ({ ...task, user_id: userId }));
  const habitRows = snapshot.habits.map((habit) => ({ ...habit, user_id: userId }));
  // Only upload habit-day rows whose content actually changed since the last
  // successful sync — habit history otherwise grows every day forever, and
  // re-uploading every row on every unrelated edit gets more wasteful the
  // longer the account has been used.
  const habitRecordRows = snapshot.habitRecords.filter((record) => {
    const key = `${record.habit_id}:${record.record_date}`;
    return habitRecordSyncSignatures.get(key) !== JSON.stringify(record);
  });

  if (groupRows.length) {
    const { error } = await supabaseClient
      .from("task_groups")
      .upsert(groupRows, { onConflict: "id" });
    throwTaskSyncError("그룹", error);
  }

  if (taskRows.length) {
    const { error } = await supabaseClient.from("tasks").upsert(taskRows, { onConflict: "id" });
    throwTaskSyncError("할 일", error);
  }

  if (habitRows.length) {
    const { error } = await supabaseClient
      .from("habits")
      .upsert(habitRows, { onConflict: "id" });
    throwTaskSyncError("습관", error);
  }

  if (habitRecordRows.length) {
    const { error } = await supabaseClient
      .from("habit_daily_records")
      .upsert(habitRecordRows, { onConflict: "habit_id,record_date" });
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

function getHabitDailyFocusSeconds(habit, dateString = toLocalDateString()) {
  if (!habit || habit.measureType !== "time") return 0;
  return Math.max(0, Math.floor(Number(habit.focusSecondsByDate?.[dateString] ?? 0)));
}

function getLinkedFocusSeconds(item = getFocusItem()) {
  if (!item) return 0;
  if (activeFocus?.type === "task") return Math.max(0, Math.floor(item.focusSeconds ?? 0));
  const targetSeconds = Math.max(0, getHabitTargetForDate(item) * 60);
  return Math.max(0, targetSeconds - getHabitDailyFocusSeconds(item));
}

function prepareLinkedFocusRuntime(item = getFocusItem()) {
  const hasProgress = item
    ? activeFocus?.type === "task"
      ? Number(item.focusSeconds) > 0
      : getHabitDailyFocusSeconds(item) > 0
    : false;
  focusRuntimeByMode.linked = {
    seconds: getLinkedFocusSeconds(item),
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
  const filters = document.querySelector("#taskGroupFilters");
  const archiveButton = document.querySelector("#toggleArchiveView");
  const archivePolicy = document.querySelector("#taskArchivePolicy");
  if (!filters || !archiveButton || !archivePolicy) return;

  const options = [
    { id: "all", name: "전체" },
    { id: "none", name: "그룹 없음" },
    ...state.groups,
  ];

  const archiveActive = currentPage === "tasks" && taskArchiveView;

  filters.innerHTML = options
    .map(
      (option) => `
        <button
          class="${taskGroupFilter === option.id ? "active" : ""}"
          type="button"
          data-task-group-filter="${option.id}"
        >${escapeHtml(option.name)}</button>
      `,
    )
    .join("");

  archiveButton.classList.toggle("active", archiveActive);
  archiveButton.textContent = archiveActive ? "← 할 일로 돌아가기" : "보관함";
  archivePolicy.textContent = archiveActive
    ? "보관된 할 일은 보관 후 30일이 지나면 자동으로 삭제돼"
    : "완료한 할 일은 다음 날 자동으로 보관함으로 이동해";
  document.querySelector("#taskBoard").classList.toggle("archive-view", archiveActive);
  document.querySelector('[data-status="done"] h3').textContent =
    archiveActive ? "보관된 할 일" : "완료";
}

function getVisibleTasks(status) {
  return state.tasks.filter((task) => {
    if (task.status !== status) return false;

    if (currentPage === "tasks") {
      if (taskArchiveView !== Boolean(task.archived)) return false;
      if (taskGroupFilter === "all") return true;
      if (taskGroupFilter === "none") return !task.groupId;
      return task.groupId === taskGroupFilter;
    }

    return !task.archived;
  });
}

function renderTasks() {
  renderTaskFilters();

  ["waiting", "doing", "done"].forEach((status) => {
    const list = document.querySelector(`[data-list="${status}"]`);
    const tasks = getVisibleTasks(status);

    list.innerHTML = tasks
      .map((task) => {
        const group = getGroup(task.groupId);
        const isEditing = editingTaskId === task.id;
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
            draggable="${task.archived || isEditing ? "false" : "true"}"
            data-task-id="${task.id}"
          >
            ${
              isEditing
                ? `
                  <form class="task-inline-edit" data-inline-task-form="${task.id}">
                    <input
                      class="task-inline-title"
                      type="text"
                      maxlength="60"
                      value="${escapeHtml(editingTaskTitle)}"
                      aria-label="할 일 내용"
                      required
                    />
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
                  <div class="task-top">
                    <h4>${escapeHtml(task.title)}</h4>
                  </div>
                  <div class="task-meta">
                    ${group ? `<span class="task-category ${getGroupColorClass(group)}">${escapeHtml(group.name)}</span>` : ""}
                    ${
                      task.archived
                        ? '<span class="task-archived-label">보관됨</span>'
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
                  ${
                    task.archived
                      ? ""
                      : `<div class="task-status-actions" aria-label="${escapeHtml(task.title)} 상태 변경">
                          ${[
                            ["waiting", "대기"],
                            ["doing", "진행 중"],
                            ["done", "완료"],
                          ]
                            .filter(([nextStatus]) => nextStatus !== task.status)
                            .map(
                              ([nextStatus, label]) => `
                                <button
                                  class="task-status-button ${nextStatus}"
                                  type="button"
                                  data-task-status="${nextStatus}"
                                  aria-label="${escapeHtml(task.title)} 상태를 ${label}(으)로 변경"
                                >${label}</button>
                              `,
                            )
                            .join("")}
                        </div>`
                  }
                `
            }
            ${
              !isEditing && currentPage === "tasks" && status === "done"
                ? `
                  <button
                    class="task-archive-button"
                    type="button"
                    ${task.archived ? `data-restore-task="${task.id}"` : `data-archive-task="${task.id}"`}
                  >${task.archived ? "↩ 보관 해제" : "▣ 보관하기"}</button>
                `
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

function getFarmWeekStart(date = new Date()) {
  const monday = new Date(date);
  monday.setHours(12, 0, 0, 0);
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);
  return toLocalDateString(monday);
}

function getFarmRankings(userScore = state.weeklyFarmMoneyEarned) {
  if (farmLeaderboard.length) return farmLeaderboard;
  return [
    {
      name: state.farmName || "내 농장",
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

function ensureDailyFarmMail() {
  const today = toLocalDateString();
  if (state.farmMailDate === today) return false;
  state.farmMailDate = today;
  state.farmMailSentCount = 0;
  state.farmMailHistory = [];
  selectedMailFriendCode = "";
  selectedMailItemId = null;
  return true;
}

function ensureDailyFarmInbox() {
  const today = toLocalDateString();
  const previousLength = state.farmInbox.length;
  state.farmInbox = state.farmInbox
    .map((mail) => ({
      ...mail,
      receivedDate: mail.receivedDate || state.farmInboxDate || today,
    }))
    .filter((mail) => daysBetweenDates(mail.receivedDate, today) < 7);
  const expiredMailRemoved = state.farmInbox.length !== previousLength;
  state.farmInboxDate = today;
  return expiredMailRemoved;
}

function earnFarmMoney(amount, reason = "음식 판매", referenceKey = null) {
  ensureWeeklyFarmRanking();
  if (!applyFarmWalletChange("farm_money", amount, reason, referenceKey)) return false;
  state.weeklyFarmMoneyEarned += amount;
  return true;
}

function formatFarmRankingWeek() {
  const start = new Date(`${state.farmRankingWeekStart}T12:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.getMonth() + 1}월 ${start.getDate()}일 ― ${end.getMonth() + 1}월 ${end.getDate()}일`;
}

function getPlotWaterRemaining(plot, now = Date.now()) {
  return Math.max(0, Number(plot.lastFreeWaterAt ?? 0) + FARM_WATER_COOLDOWN_MS - now);
}

function formatPlotWaterCooldown(milliseconds) {
  if (milliseconds <= 0) return "물 주기";
  const totalMinutes = Math.ceil(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}` : `${minutes}분`;
}

function getPlotWiltRemaining(plot, now = Date.now()) {
  if (!plot?.crop || !plot.lastCaredAt || plot.wilted) return 0;
  const wiltAt = Number(plot.lastCaredAt) + FARM_WILT_AFTER_MS;
  const protectedUntil = Number(state.wiltProtectionUntil ?? 0);
  return Math.max(0, Math.max(wiltAt, protectedUntil) - now);
}

function formatPlotWiltRemaining(milliseconds) {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}시간 ${minutes}분`;
}

function updateFarmWiltCountdowns() {
  document.querySelectorAll("[data-wilt-countdown]").forEach((label) => {
    const plot = state.farmPlots.find(
      (entry) => entry.id === Number(label.dataset.wiltCountdown),
    );
    if (!plot?.crop || plot.wilted) return;
    label.textContent = `시들기까지 ${formatPlotWiltRemaining(getPlotWiltRemaining(plot))}`;
  });
}

function updateFarmWaterCooldowns() {
  document.querySelectorAll("[data-water-plot]").forEach((button) => {
    const plot = state.farmPlots.find((entry) => entry.id === Number(button.dataset.waterPlot));
    if (!plot) return;
    const remaining = getPlotWaterRemaining(plot);
    button.disabled = remaining > 0;
    const label = button.querySelector("span");
    if (label) label.textContent = formatPlotWaterCooldown(remaining);
    button.setAttribute(
      "aria-label",
      remaining > 0 ? `다음 무료 물주기까지 ${formatPlotWaterCooldown(remaining)}` : "무료로 물 주기",
    );
  });
}

function daysBetweenDates(fromDate, toDate = toLocalDateString()) {
  if (!fromDate) return 0;
  const toUtcDay = (dateString) => {
    const [year, month, day] = dateString.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.max(0, Math.floor((toUtcDay(toDate) - toUtcDay(fromDate)) / 86400000));
}

function getCropGrowthCost(cropId) {
  return CROP_GROWTH_COSTS[cropId] ?? 4;
}

function isProductionBoostActive() {
  return state.productionBoostUntil > Date.now();
}

function productionCoinReward(baseAmount = 1) {
  return baseAmount * (isProductionBoostActive() ? 2 : 1);
}

function isWiltProtectionActive() {
  return state.wiltProtectionUntil > Date.now();
}

function updateFarmItemEffects() {
  document
    .querySelector("#todayCoinDisplay")
    ?.classList.toggle("golden-festival-active", isProductionBoostActive());
  document
    .querySelector("#farmPage")
    ?.classList.toggle("farm-festival-active", isWiltProtectionActive());
}

function getRandomSelection(values, count) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, count);
}

function ensureDailyMarket() {
  const today = toLocalDateString();
  if (
    state.marketRotationDate === today &&
    state.dailySeedOffers.length === 7 &&
    state.dailyFoodOffers.length === 4
  ) {
    return;
  }
  state.marketRotationDate = today;
  state.dailySeedOffers = getRandomSelection(Object.keys(CROPS), 7);
  state.dailyFoodOffers = getRandomSelection(Object.keys(RECIPES), 4);
}

function getRefreshedMarketSelection(values, count, currentSelection) {
  const currentKey = [...currentSelection].sort().join("|");
  let nextSelection = getRandomSelection(values, count);
  for (
    let attempt = 0;
    attempt < 4 && [...nextSelection].sort().join("|") === currentKey;
    attempt += 1
  ) {
    nextSelection = getRandomSelection(values, count);
  }
  if ([...nextSelection].sort().join("|") === currentKey) {
    const replacement = values.find((value) => !currentSelection.includes(value));
    if (replacement) nextSelection[nextSelection.length - 1] = replacement;
  }
  return nextSelection;
}

function getRecipeByIngredients(ingredientIds) {
  const key = ingredientIds.filter(Boolean).sort().join("|");
  return Object.entries(RECIPES).find(
    ([, recipe]) => [...recipe.ingredients].sort().join("|") === key,
  );
}

function launchHarvestCelebration() {
  const celebration = document.createElement("div");
  celebration.className = "harvest-celebration";
  celebration.innerHTML = Array.from(
    { length: 28 },
    (_, index) =>
      `<i style="--tx:${((index % 9) - 4) * 75}px;--delay:${(index % 7) * 0.04}s"></i>`,
  ).join("");
  document.body.append(celebration);
  setTimeout(() => celebration.remove(), 1800);
}

function updateWiltedCrops() {
  if (isWiltProtectionActive()) return false;
  let changed = false;
  state.farmPlots.forEach((plot) => {
    if (!plot.crop || plot.wilted) return;
    if (plot.lastCaredAt && Date.now() - Number(plot.lastCaredAt) >= FARM_WILT_AFTER_MS) {
      plot.wilted = true;
      changed = true;
    }
  });
  return changed;
}

function clearFarmPlot(plot) {
  plot.crop = null;
  plot.growth = 0;
  plot.plantedDate = "";
  plot.lastWateredDate = "";
  plot.lastFreeWaterAt = 0;
  plot.lastCaredAt = 0;
  plot.wilted = false;
  plot.fertilizer = null;
}

function advanceFarmPlotGrowth(plot) {
  const maxGrowth = getCropGrowthCost(plot.crop);
  const growthAmount =
    plot.fertilizer === "moistureFertilizer" ||
    plot.fertilizer === "premiumFertilizer"
      ? 2
      : 1;
  plot.growth = Math.min(maxGrowth, plot.growth + growthAmount);
  plot.lastWateredDate = toLocalDateString();
  plot.lastCaredAt = Date.now();
  return maxGrowth;
}

function isHabitScheduledOn(habit, date) {
  const dateString = toLocalDateString(date);
  const weekday = date.getDay() === 0 ? 7 : date.getDay();
  const afterStartDate = !habit.startDate || habit.startDate <= dateString;
  const beforeEndDate = !habit.endDate || habit.endDate >= dateString;
  return afterStartDate && beforeEndDate && habit.weekdays.includes(weekday);
}

function isHabitScheduledToday(habit) {
  return isHabitScheduledOn(habit, new Date());
}

function getHabitTargetForDate(habit, date = new Date()) {
  const targetDate = typeof date === "string" ? new Date(`${date}T12:00:00`) : date;
  const weekday = targetDate.getDay() === 0 ? 7 : targetDate.getDay();
  const weekdayTarget = Number(habit.targetByWeekday?.[weekday]);
  return Number.isInteger(weekdayTarget) && weekdayTarget > 0
    ? weekdayTarget
    : Math.max(1, Number(habit.targetValue) || 1);
}

function getHabitProgress(habit, dateString = toLocalDateString()) {
  const targetValue = getHabitTargetForDate(habit, dateString);
  if (habit.measureType !== "count") {
    return habit.completionDates.includes(dateString) ? targetValue : 0;
  }
  return Math.max(0, Number(habit.progressByDate?.[dateString] ?? 0));
}

function getHabitProgressRatio(habit, dateString = toLocalDateString()) {
  return Math.min(1, getHabitProgress(habit, dateString) / getHabitTargetForDate(habit, dateString));
}

function isHabitCompleteToday(habit) {
  return getHabitProgressRatio(habit) >= 1;
}

function getHabitStreak(habit) {
  const completedDates = new Set(habit.completionDates ?? []);
  const cursor = new Date();
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
  const quote = document.querySelector("#focusDailyQuote");
  if (!quote) return;
  const today = new Date();
  const dayNumber = Math.floor(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000,
  );
  quote.textContent = focusDailyQuotes[dayNumber % focusDailyQuotes.length];
}

function closeTaskGroupMenu() {
  taskGroupMenu.classList.add("hidden");
  taskGroupTrigger.setAttribute("aria-expanded", "false");
}

taskGroupTrigger.addEventListener("click", () => {
  const willOpen = taskGroupMenu.classList.contains("hidden");
  taskGroupMenu.classList.toggle("hidden", !willOpen);
  taskGroupTrigger.setAttribute("aria-expanded", String(willOpen));
});

taskGroupMenu.addEventListener("click", (event) => {
  const option = event.target.closest("[data-task-group-value]");
  if (!option) return;
  taskGroup.value = option.dataset.taskGroupValue;
  renderGroups();
  closeTaskGroupMenu();
  taskGroupTrigger.focus();
});

document.addEventListener("click", (event) => {
  if (!customTaskGroupSelect.contains(event.target)) closeTaskGroupMenu();
});

function openTaskInlineEdit(task) {
  editingTaskId = task.id;
  editingTaskGroupId = task.groupId || null;
  editingTaskTitle = task.title;
  renderTasks();
  window.setTimeout(() => {
    const input = document.querySelector(`[data-task-id="${task.id}"] .task-inline-title`);
    input?.focus();
    input?.select();
  }, 0);
}

function closeTaskInlineEdit() {
  editingTaskId = null;
  editingTaskGroupId = null;
  editingTaskTitle = "";
  renderTasks();
}

function renderHabits() {
  const habitList = document.querySelector("#habitList");
  const visibleHabits = currentPage === "today"
    ? state.habits.filter(isHabitScheduledToday)
    : state.habits;

  habitList.innerHTML = visibleHabits
    .map((habit) => {
      const scheduledToday = isHabitScheduledToday(habit);
      const completeToday = isHabitCompleteToday(habit);
      const countProgress = getHabitProgress(habit);
      const todayTarget = getHabitTargetForDate(habit);
      const isCountHabit = habit.measureType === "count";
      const control = isCountHabit
        ? `
          <div class="habit-count-control" aria-label="${escapeHtml(habit.title)} 진행 횟수">
            <button
              type="button"
              data-adjust-habit="${habit.id}"
              data-delta="1"
              aria-label="횟수 늘리기"
              ${!scheduledToday || countProgress >= todayTarget ? "disabled" : ""}
            >＋</button>
            <strong>${countProgress}</strong>
            <button
              type="button"
              data-adjust-habit="${habit.id}"
              data-delta="-1"
              aria-label="횟수 줄이기"
              ${!scheduledToday || countProgress <= 0 ? "disabled" : ""}
            >−</button>
          </div>
        `
        : `
          <button
            class="habit-check"
            type="button"
            data-toggle-habit="${habit.id}"
            aria-label="${escapeHtml(habit.title)} ${completeToday ? "완료 취소" : "완료"}"
            ${scheduledToday ? "" : "disabled"}
          >✓</button>
        `;
      const focusAction =
        habit.measureType === "time" && !completeToday
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
        <article class="habit-item ${["today", "habits"].includes(currentPage) ? "reorderable" : ""} ${isCountHabit ? "count-habit" : ""} ${completeToday ? "complete" : ""} ${scheduledToday ? "" : "off-day"}" draggable="${["today", "habits"].includes(currentPage)}" data-habit-id="${habit.id}">
          ${control}
          <span class="habit-copy">
            <strong>${escapeHtml(habit.title)}</strong>
            <small class="habit-summary">
              <span class="habit-summary-primary">${scheduledToday ? `${todayTarget}${escapeHtml(habit.unit)}` : "오늘은 쉬는 날"} · ${escapeHtml(formatHabitSchedule(habit, currentPage === "habits"))}${habit.measureType === "time" ? ` <span data-habit-focus-time>· 집중 ${formatFocusTime(getHabitDailyFocusSeconds(habit))}</span>` : ""}</span>
              ${currentPage === "habits" && Object.keys(habit.targetByWeekday ?? {}).length ? `<span class="habit-summary-targets">${escapeHtml(formatHabitTargets(habit))}</span>` : ""}
            </small>
            ${focusAction}
          </span>
          <span>
            <span class="streak">${getHabitStreak(habit)}일</span>
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
  monthLabel.textContent = `${year}년 ${month + 1}월`;
  grid.style.gridTemplateColumns = `150px repeat(${daysInMonth}, 18px)`;

  const dayHeaders = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return `<span class="heatmap-day-label">${day}</span>`;
  }).join("");

  const rows = state.habits
    .map((habit) => {
      const cells = Array.from({ length: daysInMonth }, (_, index) => {
        const date = new Date(year, month, index + 1);
        const dateString = toLocalDateString(date);
        const progress = getHabitProgress(habit, dateString);
        const targetValue = getHabitTargetForDate(habit, dateString);
        const progressRatio = getHabitProgressRatio(habit, dateString);
        const completed = progressRatio >= 1;
        const beforeRegistration = Boolean(habit.startDate && dateString < habit.startDate);
        const scheduled = isHabitScheduledOn(habit, date);
        const progressClass =
          habit.measureType === "count" && progressRatio > 0
            ? progressRatio >= 0.75
              ? "progress-3"
              : progressRatio >= 0.5
                ? "progress-2"
                : "progress-1"
            : "";
        const className = beforeRegistration
          ? "inactive"
          : completed
            ? "completed"
            : progressClass || (scheduled ? "scheduled" : "inactive");
        const status = beforeRegistration
          ? "등록 전"
          : habit.measureType === "count" && scheduled
            ? `${progress} / ${targetValue}${habit.unit}`
            : completed
              ? "완료"
              : scheduled
                ? "예정"
                : "일정 없음";
        return `<span class="heatmap-cell ${className}" title="${dateString} · ${escapeHtml(status)}"></span>`;
      }).join("");

      return `
        <span class="heatmap-habit-name" title="${escapeHtml(habit.title)}">${escapeHtml(habit.title)}</span>
        ${cells}
      `;
    })
    .join("");

  grid.innerHTML = `<span></span>${dayHeaders}${rows}`;
}

function cropSvg(cropId, stage = "mature") {
  const growthType = CROP_GROWTH_TYPES[cropId] ?? "vine";
  const symbolId =
    stage === "mature"
      ? `crop-${cropId}`
      : stage === "seed"
        ? "stage-seed"
        : `stage-${growthType}-${stage}`;
  return `
    <svg class="crop-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <use href="#${symbolId}"></use>
    </svg>
  `;
}

function getCropStage(cropId, growth) {
  const maxGrowth = getCropGrowthCost(cropId);
  if (growth >= maxGrowth) return "mature";
  if (growth === 0) return "seed";
  if (growth === 1) return "sprout";
  if (growth === maxGrowth - 1 && maxGrowth >= 4) return "flower";
  return "growing";
}

function getFreePassTargets() {
  const tasks = state.tasks
    .filter((task) => !task.archived && task.status !== "done")
    .map((task) => ({
      value: `task:${task.id}`,
      type: "task",
      title: task.title,
      label: `할 일 · ${task.title}`,
    }));
  const habits = state.habits
    .filter((habit) => isHabitScheduledToday(habit) && !isHabitCompleteToday(habit))
    .map((habit) => ({
      value: `habit:${habit.id}`,
      type: "habit",
      title: habit.title,
      label: `습관 · ${habit.title}`,
    }));
  return [...tasks, ...habits];
}

function renderFreePassTargets() {
  const targets = getFreePassTargets();
  if (!targets.some((target) => target.value === selectedFreePassTarget)) {
    selectedFreePassTarget = null;
  }
  freePassTargetList.innerHTML = targets.length
    ? targets
        .map(
          (target) => `
            <button
              class="free-pass-target ${selectedFreePassTarget === target.value ? "selected" : ""}"
              type="button"
              data-free-pass-target="${target.value}"
              aria-pressed="${selectedFreePassTarget === target.value}"
            >
              <span aria-hidden="true">${target.type === "task" ? "✓" : "↻"}</span>
              <span><small>${target.type === "task" ? "할 일" : "오늘의 습관"}</small><strong>${escapeHtml(target.title)}</strong></span>
              <b aria-hidden="true">✓</b>
            </button>
          `,
        )
        .join("")
    : '<p class="free-pass-empty">지금 완료할 수 있는 할 일이나 오늘의 습관이 없어</p>';
  confirmFreePassTarget.disabled = !selectedFreePassTarget;
}

function openFreePassTargetModal() {
  if (!getFreePassTargets().length) {
    showToast("완료할 수 있는 항목이 없어");
    return;
  }
  selectedFreePassTarget = null;
  renderFreePassTargets();
  document.querySelector("#supplyStorageModal").classList.add("hidden");
  freePassTargetModal.classList.remove("hidden");
}

function closeFreePassTargetModal() {
  selectedFreePassTarget = null;
  freePassTargetModal.classList.add("hidden");
}

function useFreePassOnTarget(targetValue) {
  const target = getFreePassTargets().find((entry) => entry.value === targetValue);
  if (!target || !state.farmItemInventory.freePass) {
    showToast("완료할 항목을 다시 골라줘");
    renderFreePassTargets();
    return;
  }
  const [targetType, targetId] = target.value.split(":");
  const reward = productionCoinReward();
  const completionCycleId = createUuid();

  if (targetType === "task") {
    const task = state.tasks.find((entry) => entry.id === targetId && entry.status !== "done");
    if (!task) return;
    task.status = "done";
    task.completedDate = toLocalDateString();
    task.completionCycleId = completionCycleId;
    task.completionReward = reward;
    task.completedWithFreePass = true;
    state.coins += reward;
    confirmTaskCompletionWithServer(task, completionCycleId, reward, true);
  } else {
    const habit = state.habits.find((entry) => entry.id === targetId);
    if (!habit || isHabitCompleteToday(habit)) return;
    const today = toLocalDateString();
    if (habit.measureType === "count") {
      habit.progressByDate ??= {};
      habit.progressByDate[today] = getHabitTargetForDate(habit);
    }
    const progressValue = habit.measureType === "count"
      ? Math.max(0, Number(habit.progressByDate?.[today] ?? 0))
      : getHabitTargetForDate(habit);
    habit.complete = true;
    habit.completedDate = today;
    habit.completionDates.push(today);
    habit.completionReward = reward;
    habit.completedWithFreePass = true;
    habit.recordMetaByDate ??= {};
    habit.recordMetaByDate[today] = {
      completedAt: new Date().toISOString(),
      completionReward: reward,
      completedWithFreePass: true,
      completionCycleId,
    };
    state.coins += reward;
    confirmHabitCompletionWithServer(habit, today, progressValue, completionCycleId, reward, true);
  }
  state.farmItemInventory.freePass -= 1;
  closeFreePassTargetModal();
  showToast(`프리패스로 완료 처리했어 ${reward} Coin 획득`);
  render();
  scheduleTaskDatabaseSync(0);
}

function renderFarmRanking() {
  const weekLabel = document.querySelector("#farmRankingWeekLabel");
  const weeklyEarned = document.querySelector("#weeklyFarmMoneyEarned");
  const rankingList = document.querySelector("#farmRankingList");
  if (!weekLabel || !weeklyEarned || !rankingList) return;

  ensureWeeklyFarmRanking();
  const rankings = getFarmRankings();

  weekLabel.textContent = formatFarmRankingWeek();
  weeklyEarned.textContent = state.weeklyFarmMoneyEarned.toLocaleString("ko-KR");
  rankingList.innerHTML = rankings
    .map((farmer, index) => {
      const rank = index + 1;
      const rankLabel = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;
      return `
        <li class="farm-ranking-row ${farmer.isMe ? "is-me" : ""}">
          <span class="farm-ranking-rank">${rankLabel}</span>
          <span class="farm-ranking-name">
            <strong>${escapeHtml(farmer.name)}</strong>
            ${farmer.isMe ? "<small>나</small>" : ""}
          </span>
          <strong class="farm-ranking-score">✦ ${farmer.score.toLocaleString("ko-KR")}</strong>
        </li>
      `;
    })
    .join("");
}

function getFarmMailSender(friendId, mail = null) {
  if (mail?.sender) return mail.sender;
  if (friendId === SYSTEM_FARM_SENDER.id) return SYSTEM_FARM_SENDER;
  return null;
}

function getFarmGiftDetails(category, itemId, mail = null) {
  if (category === "rankingBox" || category === "updateBox") {
    const boxCount = mail?.boxCropIds?.length ?? mail?.boxCount ?? 1;
    return {
      name: `작물 랜덤 박스 ${boxCount}개`,
      icon: "🎁",
      inventory: state.harvestInventory,
      categoryName: category === "updateBox"
        ? mail?.updateNote || "Farmodoro 업데이트"
        : `주간 랭킹 ${mail?.ranking ?? ""}위 보상`,
    };
  }
  if (category === "supply") {
    const item = FARM_ITEMS[itemId];
    return item
      ? { name: item.name, icon: item.icon, inventory: state.farmItemInventory, categoryName: "농장 용품" }
      : null;
  }
  if (category === "food") {
    const recipe = RECIPES[itemId];
    return recipe
      ? { name: recipe.name, icon: recipe.icon, inventory: state.foodInventory, categoryName: "만든 음식" }
      : null;
  }
  const crop = CROPS[itemId];
  if (!crop) return null;
  return {
    name: category === "seed" ? `${crop.name} 씨앗` : crop.name,
    icon: cropSvg(itemId),
    inventory: category === "seed" ? state.seedInventory : state.harvestInventory,
    categoryName: category === "seed" ? "씨앗" : "수확물",
  };
}

function getOpenedFarmRankingBoxIndexes(mail) {
  const boxCount = mail.boxCropIds?.length ?? mail.boxCount ?? 0;
  const openedIndexes = Array.isArray(mail.openedBoxIndexes)
    ? mail.openedBoxIndexes
    : [];
  mail.openedBoxIndexes = [...new Set(openedIndexes)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < boxCount)
    .sort((first, second) => first - second);
  return mail.openedBoxIndexes;
}

function renderFarmRewardBoxes(mail, justOpenedIndex = -1) {
  const progress = document.querySelector("#farmRewardBoxProgress");
  const grid = document.querySelector("#farmRewardBoxGrid");
  const guide = document.querySelector("#farmRewardBoxGuide");
  const closeButton = document.querySelector("#closeFarmRewardBox");
  if (!progress || !grid || !guide || !closeButton) return;
  const openedIndexes = getOpenedFarmRankingBoxIndexes(mail);
  const openedSet = new Set(openedIndexes);
  const cropIds = mail.boxCropIds ?? [];
  const completed = openedIndexes.length === cropIds.length;
  progress.textContent = `${openedIndexes.length} / ${cropIds.length}`;
  grid.innerHTML = cropIds
    .map((cropId, index) => {
      const opened = openedSet.has(index);
      const crop = CROPS[cropId];
      return `
        <button
          class="farm-reward-box ${opened ? "opened" : "sealed"} ${justOpenedIndex === index ? "just-opened" : ""}"
          type="button"
          data-open-reward-box="${index}"
          ${opened ? "disabled" : ""}
          aria-label="${opened ? `${escapeHtml(crop.name)} 획득` : `${index + 1}번째 랜덤 박스 열기`}"
        >
          ${opened
            ? `<span>${cropSvg(cropId)}</span><strong>${escapeHtml(crop.name)}</strong><small>수확물 +1</small>`
            : `<span>🎁</span><strong>${index + 1}번째 상자</strong><small>눌러서 열기</small>`}
        </button>
      `;
    })
    .join("");
  guide.textContent = completed
    ? "모든 작물이 수확물 보관함에 들어갔어!"
    : `아직 ${cropIds.length - openedIndexes.length}개의 상자가 남아 있어`;
  closeButton.textContent = completed ? "개봉 완료" : "나중에 이어서 열기";
}

function openFarmRewardBoxModal(mail) {
  activeRankingRewardMailId = mail.id;
  const modal = document.querySelector("#farmRewardBoxModal");
  modal.querySelector(".section-kicker").textContent = mail.category === "updateBox"
    ? "UPDATE REWARD"
    : "WEEKLY REWARD";
  modal.querySelector("header p").textContent = mail.category === "updateBox"
    ? "업데이트 선물 상자를 열어 새 작물을 받아"
    : "상자를 하나씩 눌러 이번 주의 행운을 확인해";
  renderFarmRewardBoxes(mail);
  modal.classList.remove("hidden");
}

function closeFarmRewardBoxModal() {
  activeRankingRewardMailId = null;
  document.querySelector("#farmRewardBoxModal").classList.add("hidden");
}

async function revealFarmRankingBox(mail, index) {
  const cropId = mail.boxCropIds?.[index];
  const guide = document.querySelector("#farmRewardBoxGuide");
  if (!CROPS[cropId]) {
    const message = "상자 정보를 찾지 못했어. 우편함을 닫았다가 다시 열어줘.";
    if (guide) guide.textContent = message;
    showToast(message);
    return;
  }
  const openedIndexes = getOpenedFarmRankingBoxIndexes(mail);
  if (openedIndexes.includes(index)) return;
  const dbItemId = mail.dbItemIds?.[index];
  if (dbItemId) {
    const { error } = await supabaseClient.rpc("claim_farm_mail_item", {
      p_mail_item_id: dbItemId,
    });
    if (error) {
      console.error("Farmodoro ranking box could not be claimed", error);
      const reason = String(error.message ?? "");
      if (reason.includes("already claimed")) {
        await loadFarmDataFromDatabase(activeAuthUser);
        const refreshedMail = state.farmInbox.find((entry) => entry.id === mail.id);
        if (refreshedMail) renderFarmRewardBoxes(refreshedMail);
        const message = "이미 받은 상자야. 우편함 상태를 새로 불러왔어.";
        if (guide) guide.textContent = message;
        showToast(message);
        return;
      }
      const message = reason.includes("expired")
        ? "수령 기간이 지나 상자를 열 수 없어."
        : reason.includes("does not belong")
          ? "현재 로그인한 계정의 우편이 아니야."
          : reason.includes("not found")
            ? "상자 정보를 찾지 못했어. 우편함을 다시 열어줘."
            : `랜덤 박스를 열지 못했어${reason ? ` · ${reason}` : ". 잠시 후 다시 시도해줘."}`;
      if (guide) guide.textContent = message;
      showToast(message);
      return;
    }
  }
  if (dbItemId) {
    await loadFarmDataFromDatabase(activeAuthUser);
    const refreshedMail = state.farmInbox.find((entry) => entry.id === mail.id);
    if (refreshedMail) {
      renderFarmRewardBoxes(refreshedMail, index);
      showToast(`${CROPS[cropId].name} 1개를 수확물 보관함에 넣었어.`);
      if (refreshedMail.claimed) launchHarvestCelebration();
    }
    return;
  }
  state.harvestInventory[cropId] = (state.harvestInventory[cropId] ?? 0) + 1;
  mail.openedBoxIndexes.push(index);
  mail.openedBoxIndexes.sort((first, second) => first - second);
  mail.claimed = mail.openedBoxIndexes.length === mail.boxCropIds.length;
  render();
  renderFarmRewardBoxes(mail, index);
  if (mail.claimed) launchHarvestCelebration();
}

function getFarmMailItems(category = selectedMailCategory) {
  if (category === "supply") {
    return Object.entries(FARM_ITEMS)
      .filter(([itemId]) => (state.farmItemInventory[itemId] ?? 0) > 0)
      .map(([itemId, item]) => ({
        id: itemId,
        name: item.name,
        icon: item.icon,
        count: state.farmItemInventory[itemId],
        inventory: state.farmItemInventory,
      }));
  }
  if (category === "food") {
    return Object.entries(RECIPES)
      .filter(([recipeId]) => (state.foodInventory[recipeId] ?? 0) > 0)
      .map(([recipeId, recipe]) => ({
        id: recipeId,
        name: recipe.name,
        icon: recipe.icon,
        count: state.foodInventory[recipeId],
        inventory: state.foodInventory,
      }));
  }

  const inventory = category === "seed" ? state.seedInventory : state.harvestInventory;
  return Object.entries(CROPS)
    .filter(([cropId]) => (inventory[cropId] ?? 0) > 0)
    .map(([cropId, crop]) => ({
      id: cropId,
      name: category === "seed" ? `${crop.name} 씨앗` : crop.name,
      icon: cropSvg(cropId),
      count: inventory[cropId],
      inventory,
    }));
}

function renderFarmMail() {
  const remaining = document.querySelector("#farmMailRemaining");
  const friendCodeInput = document.querySelector("#farmMailFriendCode");
  const recentFriends = document.querySelector("#farmMailRecentFriends");
  const itemList = document.querySelector("#farmMailItemList");
  const history = document.querySelector("#farmMailHistory");
  const sendButton = document.querySelector("#sendFarmMail");
  const categories = document.querySelector("#farmMailCategories");
  const sendPanel = document.querySelector("#farmMailSendPanel");
  const inboxPanel = document.querySelector("#farmMailInboxPanel");
  const inboxList = document.querySelector("#farmMailInboxList");
  const unreadCount = document.querySelector("#farmMailUnreadCount");
  const headerUnreadCount = document.querySelector("#farmMailHeaderUnread");
  const openMailButton = document.querySelector("#openFarmMail");
  const todayMailAlert = document.querySelector("#todayMailAlert");
  const todayMailAlertCount = document.querySelector("#todayMailAlertCount");
  if (
    !remaining ||
    !friendCodeInput ||
    !recentFriends ||
    !itemList ||
    !history ||
    !sendButton ||
    !categories ||
    !sendPanel ||
    !inboxPanel ||
    !inboxList ||
    !unreadCount ||
    !headerUnreadCount ||
    !openMailButton
  ) return;

  ensureDailyFarmMail();
  ensureDailyFarmInbox();
  document.querySelectorAll("[data-mail-view]").forEach((button) => {
    const active = button.dataset.mailView === farmMailView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  sendPanel.classList.toggle("hidden", farmMailView !== "send");
  inboxPanel.classList.toggle("hidden", farmMailView !== "inbox");
  const localUnclaimedCount = state.farmInbox.filter((mail) => !mail.claimed).length;
  const unclaimedCount = farmMailServerUnreadCount ?? localUnclaimedCount;
  unreadCount.textContent = unclaimedCount;
  unreadCount.hidden = unclaimedCount === 0;
  headerUnreadCount.textContent = unclaimedCount > 99 ? "99+" : unclaimedCount;
  headerUnreadCount.hidden = unclaimedCount === 0;
  openMailButton.classList.toggle("has-unread", unclaimedCount > 0);
  openMailButton.setAttribute(
    "aria-label",
    unclaimedCount ? `농장 우편소 · 받지 않은 우편 ${unclaimedCount}통` : "농장 우편소",
  );
  if (todayMailAlert && todayMailAlertCount) {
    todayMailAlert.hidden = unclaimedCount === 0;
    todayMailAlertCount.textContent = unclaimedCount > 99 ? "99+" : unclaimedCount;
    todayMailAlert.setAttribute("aria-label", `새 농장 우편 ${unclaimedCount}통 열기`);
  }

  inboxList.innerHTML = state.farmInbox.length
    ? state.farmInbox
        .map((mail) => {
          const friend = getFarmMailSender(mail.friendId, mail);
          const gift = getFarmGiftDetails(mail.category, mail.itemId, mail);
          if (!friend || !gift) return "";
          const daysUntilDelete = Math.max(1, 7 - daysBetweenDates(mail.receivedDate));
          return `
            <article class="farm-mail-inbox-row ${mail.claimed ? "claimed" : ""}">
              <span class="farm-mail-inbox-avatar">${friend.avatar}</span>
              <div class="farm-mail-inbox-copy">
                <div class="farm-mail-sender">
                  <strong>${escapeHtml(friend.name)}</strong>
                  <small>${escapeHtml(gift.categoryName)} · ${daysUntilDelete}일 후 삭제</small>
                </div>
                <strong>${gift.icon}<span>${escapeHtml(gift.name)}</span></strong>
              </div>
              <button type="button" data-claim-farm-mail="${mail.id}" ${mail.claimed ? "disabled" : ""}>
                ${mail.claimed
                  ? ["rankingBox", "updateBox"].includes(mail.category) ? "개봉 완료" : "수령 완료"
                  : ["rankingBox", "updateBox"].includes(mail.category)
                    ? getOpenedFarmRankingBoxIndexes(mail).length ? "계속 열기" : "상자 열기"
                    : "받기"}
              </button>
            </article>
          `;
        })
        .join("")
    : '<p class="farm-mail-empty">받은 우편이 아직 없어</p>';

  const items = getFarmMailItems();
  if (!items.some((item) => item.id === selectedMailItemId)) selectedMailItemId = null;
  const remainingCount = Math.max(0, 3 - state.farmMailSentCount);
  remaining.textContent = remainingCount;
  if (friendCodeInput.value !== selectedMailFriendCode) {
    friendCodeInput.value = selectedMailFriendCode;
  }
  recentFriends.innerHTML = farmMailContacts.length
    ? farmMailContacts.map((contact) => `
        <button class="${selectedMailFriendCode === contact.code ? "selected" : ""}" type="button" data-mail-friend-code="${contact.code}">
          <strong>${escapeHtml(contact.name)}</strong><small>${contact.code}</small>
        </button>
      `).join("")
    : '<small class="farm-mail-no-friends">우편을 보내면 친구가 여기에 저장돼</small>';

  categories.querySelectorAll("[data-mail-category]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mailCategory === selectedMailCategory);
  });

  itemList.innerHTML = items.length
    ? items
        .map(
          (item) => `
            <button class="farm-mail-item ${selectedMailItemId === item.id ? "selected" : ""}" type="button" data-mail-item="${item.id}">
              <span>${item.icon}</span>
              <strong>${escapeHtml(item.name)}</strong>
              <small>${item.count}개 보유</small>
            </button>
          `,
        )
        .join("")
    : '<p class="farm-mail-empty">이 종류에는 보낼 수 있는 물건이 없어</p>';

  history.innerHTML = state.farmMailHistory.length
    ? state.farmMailHistory
        .map(
          (mail) => `
            <div class="farm-mail-history-row">
              <span>✓</span>
              <p><strong>${escapeHtml(mail.itemName)}</strong>${getKoreanObjectParticle(mail.itemName)} ${escapeHtml(mail.friendName)}에게 보냈어</p>
              <small>${escapeHtml(mail.sentTime)}</small>
            </div>
          `,
        )
        .join("")
    : '<p class="farm-mail-empty">오늘 보낸 우편이 아직 없어</p>';

  sendButton.disabled =
    remainingCount === 0 ||
    !/^FARM-[A-F0-9]{4}-[A-F0-9]{4}$/.test(selectedMailFriendCode) ||
    !selectedMailItemId;
  sendButton.textContent = remainingCount ? `선물 보내기 · 오늘 ${remainingCount}회 남음` : "오늘 발송을 모두 사용했어";
}

function renderRecipeIngredientPicker(select) {
  const picker = select.closest(".recipe-ingredient-select");
  const label = picker?.querySelector("[data-recipe-ingredient-label]");
  const menu = picker?.querySelector(".recipe-ingredient-menu");
  if (!picker || !label || !menu) return;

  const selectedCrop = CROPS[select.value];
  label.textContent = selectedCrop ? selectedCrop.name : "재료 선택";
  menu.innerHTML = [
    `
      <button class="recipe-ingredient-option custom-group-option ${select.value ? "" : "selected"}" type="button" role="option" aria-selected="${!select.value}" data-recipe-ingredient-value="">
        <i aria-hidden="true"></i><span>재료 선택</span><b>✓</b>
      </button>
    `,
    ...getSortedKitchenCropEntries().map(
      ([cropId, crop]) => `
        <button class="recipe-ingredient-option custom-group-option ${select.value === cropId ? "selected" : ""}" type="button" role="option" aria-selected="${select.value === cropId}" data-recipe-ingredient-value="${cropId}">
          <i aria-hidden="true">${cropSvg(cropId)}</i>
          <span><strong>${escapeHtml(crop.name)}</strong><small>${state.harvestInventory[cropId] ?? 0}개 보유</small></span>
          <b>✓</b>
        </button>
      `,
    ),
  ].join("");
}

function getSortedKitchenCropEntries() {
  return Object.entries(CROPS).sort(([firstId], [secondId]) => {
    const firstAvailable = (state.harvestInventory[firstId] ?? 0) > 0;
    const secondAvailable = (state.harvestInventory[secondId] ?? 0) > 0;
    return Number(secondAvailable) - Number(firstAvailable);
  });
}

function closeRecipeIngredientMenus(exceptPicker = null) {
  document.querySelectorAll(".recipe-ingredient-select").forEach((picker) => {
    if (picker === exceptPicker) return;
    picker.querySelector(".recipe-ingredient-menu")?.classList.add("hidden");
    picker.querySelector(".recipe-ingredient-trigger")?.setAttribute("aria-expanded", "false");
  });
}

function renderFarm() {
  const inventory = document.querySelector("#seedInventory");
  const shop = document.querySelector("#seedShop");
  const grid = document.querySelector("#farmGrid");
  const farmBalance = document.querySelector("#farmCoinBalance");
  const farmHeaderBalance = document.querySelector("#farmHeaderCoinBalance");
  const harvestInventory = document.querySelector("#harvestInventory");
  const morrisonBuyList = document.querySelector("#morrisonBuyList");
  const marketFarmMoney = document.querySelector("#marketFarmMoneyBalance");
  const modalFarmMoney = document.querySelector("#modalFarmMoneyBalance");
  const topFarmMoney = document.querySelector("#farmMoneyBalance");
  const farmItemShop = document.querySelector("#farmItemShop");
  const farmItemInventory = document.querySelector("#farmItemInventory");
  const foodInventory = document.querySelector("#foodInventory");
  const recipeBook = document.querySelector("#recipeBook");
  const recipeBookProgress = document.querySelector("#recipeBookProgress");
  const harvestStorageCount = document.querySelector("#harvestStorageCount");
  const seedStorageCount = document.querySelector("#seedStorageCount");
  const supplyStorageCount = document.querySelector("#supplyStorageCount");
  const supplyModalCount = document.querySelector("#supplyModalCount");
  const farmNameLabel = document.querySelector("#farmNameLabel");
  if (
    !inventory ||
    !shop ||
    !grid ||
    !farmBalance ||
    !farmHeaderBalance ||
    !harvestInventory ||
    !morrisonBuyList ||
    !marketFarmMoney ||
    !modalFarmMoney ||
    !topFarmMoney ||
    !farmItemShop ||
    !farmItemInventory ||
    !foodInventory ||
    !recipeBook ||
    !recipeBookProgress ||
    !harvestStorageCount ||
    !seedStorageCount ||
    !supplyStorageCount ||
    !supplyModalCount ||
    !farmNameLabel
  ) {
    return;
  }

  ensureDailyMarket();
  ensureWeeklyFarmRanking();
  updateWiltedCrops();
  farmBalance.textContent = state.coins;
  farmHeaderBalance.textContent = state.coins;
  marketFarmMoney.textContent = state.farmMoney;
  modalFarmMoney.textContent = state.farmMoney;
  topFarmMoney.textContent = state.farmMoney;
  farmBalance.closest(".farm-wallet").classList.toggle("negative", state.coins < 0);
  farmHeaderBalance.closest(".farm-wallet").classList.toggle("negative", state.coins < 0);
  harvestStorageCount.textContent = Object.values(state.harvestInventory).reduce(
    (total, count) => total + count,
    0,
  );
  seedStorageCount.textContent = Object.values(state.seedInventory).reduce(
    (total, count) => total + count,
    0,
  );
  supplyStorageCount.textContent = Object.values(state.farmItemInventory).reduce(
    (total, count) => total + count,
    0,
  );
  supplyModalCount.textContent = supplyStorageCount.textContent;
  farmNameLabel.textContent = state.farmName;
  renderFarmRanking();
  renderFarmMail();

  farmItemShop.innerHTML = Object.entries(FARM_ITEMS)
    .map(
      ([itemId, item]) => `
        <article class="farm-item-card">
          <span>${item.icon}</span>
          <div>
            <strong>${item.name}</strong>
            <small>${item.description}</small>
          </div>
          <button type="button" data-buy-farm-item="${itemId}">✦ ${item.price}</button>
        </article>
      `,
    )
    .join("");

  farmItemInventory.innerHTML = Object.entries(FARM_ITEMS)
    .map(([itemId, item]) => {
      const count = state.farmItemInventory[itemId] ?? 0;
      const boostStatus =
        itemId === "goldenFestivalPass" && isProductionBoostActive()
          ? `<small class="boost-status">2배 효과 진행 중</small>`
          : itemId === "farmFestivalPass" && isWiltProtectionActive()
            ? `<small class="boost-status">시듦 방지 진행 중</small>`
          : "";
      return `
        <article
          class="farm-item-card farm-supply-item ${count ? "" : "empty"} ${selectedFarmItem === itemId ? "selected" : ""}"
        >
          <span class="supply-card-icon">${item.icon}</span>
          <div class="supply-card-copy">
            <strong>${item.name}</strong>
            <small>${item.description}</small>
            ${boostStatus}
          </div>
          <div class="supply-card-actions">
            <em>${count}개</em>
            <button
              type="button"
              data-use-farm-item="${itemId}"
              aria-label="${item.name} 사용, ${count}개 보유"
              ${count ? "" : "disabled"}
            >사용</button>
          </div>
        </article>
      `;
    })
    .join("");

  inventory.innerHTML = Object.entries(CROPS)
    .map(([cropId, crop]) => {
      const count = state.seedInventory[cropId] ?? 0;
      return `
        <button
          class="inventory-seed ${[...crop.name].length >= 3 ? "long-name" : ""} ${selectedSeed === cropId ? "selected" : ""} ${count === 0 ? "empty" : ""}"
          type="button"
          data-select-seed="${cropId}"
        >
          <span>${cropSvg(cropId)}</span>
          <strong>${crop.name}</strong>
          <small>${count}개</small>
        </button>
      `;
    })
    .join("");

  shop.innerHTML = state.dailySeedOffers
    .map((cropId) => [cropId, CROPS[cropId]])
    .map(([cropId, crop]) => {
      const growthCost = getCropGrowthCost(cropId);
      return `
        <article class="seed-shop-card">
          <span class="seed-shop-emoji">${cropSvg(cropId)}</span>
          <div>
            <strong>${crop.name} 씨앗</strong>
            <small>완전 성장 ${growthCost} Coin</small>
          </div>
          <button type="button" data-buy-seed="${cropId}">
            ● ${crop.seedPrice}
          </button>
        </article>
      `;
    })
    .join("");

  harvestInventory.innerHTML = Object.entries(CROPS)
    .map(
      ([cropId, crop]) => `
        <span class="harvest-item ${[...crop.name].length >= 3 ? "long-name" : ""} ${state.harvestInventory[cropId] ? "" : "empty"}">
          <i>${cropSvg(cropId)}</i>
          <strong>${crop.name}</strong>
          <small>${state.harvestInventory[cropId] ?? 0}개</small>
        </span>
      `,
    )
    .join("");

  morrisonBuyList.innerHTML = state.dailyFoodOffers
    .map(
      (recipeId) => {
        const recipe = RECIPES[recipeId];
        return `
        <article class="morrison-buy-card">
          <span>${recipe.icon}</span>
          <div>
            <strong>${recipe.name}</strong>
            <small>보유 ${state.foodInventory[recipeId] ?? 0}개</small>
          </div>
          <button type="button" data-sell-food="${recipeId}">
            ✦ ${recipe.sellPrice}
          </button>
        </article>
      `;
      },
    )
    .join("");

  const ingredientOptions = [
    '<option value="">재료 선택</option>',
    ...getSortedKitchenCropEntries().map(
      ([cropId, crop]) =>
        `<option value="${cropId}">${crop.name}</option>`,
    ),
  ].join("");
  ["recipeIngredient1", "recipeIngredient2", "recipeIngredient3"].forEach((id) => {
    const select = document.querySelector(`#${id}`);
    if (!select) return;
    const index = Number(id.at(-1)) - 1;
    select.innerHTML = ingredientOptions;
    select.value = CROPS[selectedRecipeIngredients[index]] ? selectedRecipeIngredients[index] : "";
    renderRecipeIngredientPicker(select);
  });

  const storedFoods = Object.entries(RECIPES)
    .filter(([recipeId]) => state.foodInventory[recipeId])
    .map(
      ([recipeId, recipe]) => `
        <span class="food-item">
          <i>${recipe.icon}</i><strong>${recipe.name}</strong><small>${state.foodInventory[recipeId]}개</small>
        </span>
      `,
    )
    .join("");
  foodInventory.innerHTML =
    storedFoods ||
    '<span class="empty-food-message">완성된 음식이 아직 없어</span>';
  if (state.wasteCount) {
    foodInventory.insertAdjacentHTML(
      "beforeend",
      `<button class="waste-item" type="button" data-discard-waste>🗑 폐기물 ${state.wasteCount}개 버리기</button>`,
    );
  }

  recipeBookProgress.textContent = `${state.discoveredRecipes.length} / ${Object.keys(RECIPES).length}`;
  recipeBook.innerHTML = Object.entries(RECIPES)
    .map(([recipeId, recipe]) => {
      const discovered = state.discoveredRecipes.includes(recipeId);
      return `
        <article class="recipe-entry ${discovered ? "" : "locked"}">
          <span>${discovered ? recipe.icon : "?"}</span>
          <strong>${discovered ? recipe.name : "알 수 없는 요리"}</strong>
          <small>${discovered
            ? recipe.ingredients.map((cropId) => CROPS[cropId].name).join(" + ")
            : "재료를 조합해 발견해"}</small>
        </article>
      `;
    })
    .join("");

  grid.innerHTML = state.farmPlots
    .map((plot) => {
      if (!plot.crop) {
        return `
          <button
            class="farm-plot empty-plot ${selectedSeed ? "ready" : ""}"
            type="button"
            data-plant-plot="${plot.id}"
            data-plot-id="${plot.id}"
            aria-label="${plot.id + 1}번 빈 밭"
          >
            <span>＋</span>
          </button>
        `;
      }

      const crop = CROPS[plot.crop];
      const maxGrowth = getCropGrowthCost(plot.crop);
      const mature = plot.growth >= maxGrowth;
      const stage = getCropStage(plot.crop, plot.growth);
      const fertilizerBadge = plot.fertilizer
        ? `<span class="fertilizer-badge">${FARM_ITEMS[plot.fertilizer]?.icon ?? "✦"}</span>`
        : "";

      if (plot.wilted) {
        return `
          <article class="farm-plot crop-plot wilted" data-plot-id="${plot.id}">
            ${fertilizerBadge}
            <div class="crop-visual stage-${plot.growth}">
              <span>${cropSvg(plot.crop, "wilted")}</span>
            </div>
            <div class="crop-info">
              <strong>${crop.name}</strong>
              <small>시들었음</small>
            </div>
            <button class="discard-button" type="button" data-discard-plot="${plot.id}">폐기하기</button>
          </article>
        `;
      }

      if (!mature) {
        const waterRemaining = getPlotWaterRemaining(plot);
        return `
          <article
            class="farm-plot crop-plot growable-plot"
            data-plot-id="${plot.id}"
          >
            ${fertilizerBadge}
            <div class="crop-visual stage-${plot.growth}">
              <span>${cropSvg(plot.crop, stage)}</span>
            </div>
            <div class="crop-info">
              <strong>${crop.name}</strong>
              <small>${plot.growth} / ${maxGrowth}</small>
            </div>
            <div class="crop-wilt-countdown" data-wilt-countdown="${plot.id}">시들기까지 ${formatPlotWiltRemaining(getPlotWiltRemaining(plot))}</div>
            <div class="plot-growth-actions">
              <button type="button" data-grow-plot="${plot.id}" aria-label="${crop.name}에 1 Coin 주기"><i class="plot-action-icon" aria-hidden="true">●</i><span>1</span></button>
              <button
                class="water-plot-button"
                type="button"
                data-water-plot="${plot.id}"
                aria-label="${waterRemaining ? `다음 무료 물주기까지 ${formatPlotWaterCooldown(waterRemaining)}` : `${crop.name}에 무료로 물 주기`}"
                ${waterRemaining ? "disabled" : ""}
              ><i class="plot-action-icon watering-can-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 9h9v9H7z"/><path d="m7 11-3.5-2.5L2 10.5 7 14"/><path d="M16 11c1.2-2 3.1-2.7 4.3-1.5 1.5 1.5.4 5.3-4.3 5.5"/><path d="M8.5 7h6"/></svg></i><span>${formatPlotWaterCooldown(waterRemaining)}</span></button>
            </div>
          </article>
        `;
      }

      return `
        <article class="farm-plot crop-plot mature" data-plot-id="${plot.id}">
          ${fertilizerBadge}
          <div class="crop-visual stage-${plot.growth}">
            <span>${cropSvg(plot.crop)}</span>
          </div>
          <div class="crop-info">
            <strong>${crop.name}</strong>
            <small>${plot.growth} / ${maxGrowth}</small>
          </div>
          <div class="crop-wilt-countdown" data-wilt-countdown="${plot.id}">시들기까지 ${formatPlotWiltRemaining(getPlotWiltRemaining(plot))}</div>
          <button class="harvest-button" type="button" data-harvest-plot="${plot.id}">수확하기</button>
        </article>
      `;
    })
    .join("");
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
    .filter(
      (habit) =>
        habit.measureType === "time" &&
        isHabitScheduledToday(habit) &&
        !isHabitCompleteToday(habit),
    )
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
    : "할 일 또는 시간형 습관 선택";

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
    ${renderGroup("시간형 습관", habitOptions)}
    ${
      !taskOptions.length && !habitOptions.length
        ? '<p class="focus-item-empty">선택할 항목이 없어</p>'
        : ""
    }
  `;
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

  document.querySelector("#coinBalance").textContent = state.coins;
  document.querySelector(".currency.coin").classList.toggle("negative", state.coins < 0);
  document.querySelector("#completedCount").textContent = completed;
  document.querySelector("#progressPercent").textContent = `${percent}%`;
  document.querySelector("#progressBar").style.width = `${percent}%`;
  document.querySelector("#todoDone").textContent = todoDone;
  document.querySelector("#todoTotal").textContent = activeTasks.length;
  document.querySelector("#habitDone").textContent = habitDone;
  document.querySelector("#habitTotal").textContent = scheduledHabits.length;
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
  updateFarmItemEffects();
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

function maintainTaskArchive() {
  const today = toLocalDateString();
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
  farmWalletMutationChain = farmWalletMutationChain
    .then(async () => {
      const { data, error } = await supabaseClient.rpc("complete_my_task", {
        p_task_id: task.id,
        p_used_free_pass: usedFreePass,
      });
      if (error) throw error;
      if (activeAuthUser?.id !== userId || farmWalletUserId !== userId) return;
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
  farmWalletMutationChain = farmWalletMutationChain
    .then(async () => {
      const { data, error } = await supabaseClient.rpc("uncomplete_my_task", {
        p_task_id: task.id,
        p_next_status: nextStatus,
      });
      if (error) throw error;
      if (activeAuthUser?.id !== userId || farmWalletUserId !== userId) return;
      state.coins = Number(data.coinBalance);
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
    task.completedDate = toLocalDateString();
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
    if (task.completedWithFreePass) {
      state.farmItemInventory.freePass += 1;
      task.completedWithFreePass = false;
    }
    state.coins = Math.max(0, state.coins - returnedReward);
    confirmTaskUncompletionWithServer(task, nextStatus, returnedReward);
    showToast(`완료를 취소했어 현재 ${state.coins} Coin`);
  } else {
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
  farmWalletMutationChain = farmWalletMutationChain
    .then(async () => {
      const { data, error } = await supabaseClient.rpc("complete_my_habit", {
        p_habit_id: habit.id,
        p_record_date: recordDate,
        p_progress_value: progressValue,
        p_used_free_pass: usedFreePass,
      });
      if (error) throw error;
      if (activeAuthUser?.id !== userId || farmWalletUserId !== userId) return;
      state.coins = Number(data.coinBalance);
      const currentHabit = state.habits.find((entry) => entry.id === habit.id);
      const meta = currentHabit?.recordMetaByDate?.[recordDate];
      if (meta && meta.completionCycleId === optimisticCycleId) {
        meta.completionReward = Number(data.completionReward) || meta.completionReward;
        meta.completionCycleId = data.completionCycleId || meta.completionCycleId;
        if (recordDate === toLocalDateString()) {
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
  farmWalletMutationChain = farmWalletMutationChain
    .then(async () => {
      const { data, error } = await supabaseClient.rpc("uncomplete_my_habit", {
        p_habit_id: habit.id,
        p_record_date: recordDate,
      });
      if (error) throw error;
      if (activeAuthUser?.id !== userId || farmWalletUserId !== userId) return;
      state.coins = Number(data.coinBalance);
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

function applyHabitCompletionChange(habit, wasComplete, complete) {
  if (wasComplete === complete) return null;
  const today = toLocalDateString();
  if (!farmWalletHydrated) {
    showToast("지갑 데이터를 불러오는 중이야");
    return null;
  }
  habit.complete = complete;
  habit.completedDate = complete ? today : "";
  habit.completionDates = complete
    ? [...new Set([...habit.completionDates, today])]
    : habit.completionDates.filter((date) => date !== today);
  habit.recordMetaByDate ??= {};

  const progressValue = habit.measureType === "count"
    ? Math.max(0, Number(habit.progressByDate?.[today] ?? 0))
    : (complete ? getHabitTargetForDate(habit) : 0);

  if (complete) {
    const reward = productionCoinReward();
    const completedAt = new Date().toISOString();
    const optimisticCycleId = createUuid();
    habit.completionReward = reward;
    habit.completedWithFreePass = false;
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
  if (habit.completedWithFreePass) {
    state.farmItemInventory.freePass += 1;
    habit.completedWithFreePass = false;
  }
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

function adjustHabitCount(id, delta) {
  const habit = state.habits.find((item) => item.id === id);
  if (!habit || habit.measureType !== "count") return;
  if (!isHabitScheduledToday(habit)) {
    showToast("오늘 일정에 없는 습관이야");
    return;
  }

  const today = toLocalDateString();
  const wasComplete = isHabitCompleteToday(habit);
  const nextProgress = Math.min(
    getHabitTargetForDate(habit),
    Math.max(0, getHabitProgress(habit) + delta),
  );
  habit.progressByDate ??= {};
  habit.progressByDate[today] = nextProgress;
  const complete = getHabitProgressRatio(habit) >= 1;
  const result = applyHabitCompletionChange(habit, wasComplete, complete);

  if (result?.complete) {
    showToast(`습관 완료 ${result.reward} Coin 획득`);
  } else if (result && !result.complete) {
    showToast(`완료를 취소했어 현재 ${state.coins} Coin`);
  } else {
    showToast(`${nextProgress} / ${getHabitTargetForDate(habit)}${habit.unit}`);
  }
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
  const minutes = String(Math.floor(focusSeconds / 60)).padStart(2, "0");
  const seconds = String(focusSeconds % 60).padStart(2, "0");
  const settings = getFocusSettings();
  const item = focusMode === "linked" ? getFocusItem() : null;
  const isTaskStopwatch = Boolean(item && activeFocus?.type === "task");
  const totalSeconds = Math.max(
    1,
    focusMode === "linked" && activeFocus?.type === "habit" && item
      ? getHabitTargetForDate(item) * 60
      : (timerPhase === "focus" ? settings.focusMinutes : settings.breakMinutes) * 60,
  );
  const remainingRatio = isTaskStopwatch
    ? 1
    : Math.max(0, Math.min(1, focusSeconds / totalSeconds));
  const timerCircumference = 2 * Math.PI * 46;
  const timerRing = document.querySelector(".timer-ring");
  document.querySelector("#focusTime").textContent = `${minutes}:${seconds}`;
  timerRing.style.setProperty(
    "--timer-offset",
    `${timerCircumference * (1 - remainingRatio)}`,
  );
  timerRing.style.setProperty(
    "--timer-ring-color",
    timerPhase === "focus" ? "#ffd65c" : "#9bd9bd",
  );
  timerRing.querySelector("span").textContent = isTaskStopwatch
    ? "STOPWATCH"
    : timerPhase === "focus"
      ? "FOCUS"
      : "BREAK";
  updateMiniFocusTimer();
}

function updateMiniFocusTimer() {
  const fullTimerVisible = currentPage === "today" || currentPage === "focus";
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

  const item = visibleMode === "linked" ? getFocusItem() : null;
  const minutes = String(Math.floor(runtime.seconds / 60)).padStart(2, "0");
  const seconds = String(runtime.seconds % 60).padStart(2, "0");
  miniFocusStatus.textContent = runtime.phase === "break" ? "휴식 중" : timerRunning ? "집중 중" : "일시정지";
  miniFocusTitle.textContent =
    runtime.phase === "break"
      ? visibleMode === "quick"
        ? "빠른 집중 휴식"
        : "다음 집중을 위한 휴식"
      : visibleMode === "quick"
        ? "빠른 집중"
        : item?.title ?? "항목 집중";
  miniFocusTime.textContent = `${minutes}:${seconds}`;
  miniFocusPause.textContent = timerRunning ? "일시정지" : "계속";

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
    return;
  }

  if (focusMode === "quick") {
    focusButton.disabled = false;
    const sessionMinutes = focusRuntimeByMode.quick.sessionMinutes ?? settings.focusMinutes;
    target.textContent = `그냥 ${sessionMinutes}분 집중해`;
    description.textContent = "";
    description.hidden = true;
    return;
  }

  if (!item) {
    focusButton.disabled = true;
    target.textContent = "집중할 항목을 선택해";
    description.textContent = "";
    description.hidden = true;
    return;
  }

  focusButton.disabled = false;
  target.textContent = item.title;
  description.textContent = "";
  description.hidden = true;
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
      await taskSyncChain;
      await loadTaskDataFromDatabase(activeAuthUser, { force: true });
    } catch (error) {
      console.warn("Farmodoro realtime productivity refresh failed", error);
    }
  }, 500);
}

function startProductivityRealtime(user) {
  stopProductivityRealtime();
  if (!supabaseClient || !user) return;

  const handleChange = () => {
    if (Date.now() < productivityRealtimeMutedUntil) return;
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
}

async function loadFocusProgress(user) {
  if (!supabaseClient || !user) return;
  const requestedUserId = user.id;
  const { data, error } = await supabaseClient.rpc("get_my_focus_progress");
  if (activeAuthUser?.id !== requestedUserId) return;
  if (error) {
    if (["42883", "PGRST202"].includes(error.code)) {
      focusProgressApiUnavailable = true;
      console.warn("Farmodoro focus progress API is unavailable; apply migration 036", error);
      return;
    }
    console.error("Farmodoro focus progress could not be loaded", error);
    return;
  }
  focusProgressApiUnavailable = false;
  focusProgressServerSeconds = Math.max(0, Math.floor(Number(data?.progressSeconds) || 0)) % 3600;
  state.focusRewardSeconds = focusProgressServerSeconds;
  renderSummary();
}

function stagePendingFocusEvents() {
  ["linked", "quick"].forEach((mode) => {
    let remaining = pendingFocusSeconds[mode];
    pendingFocusSeconds[mode] = 0;
    while (remaining > 0) {
      const seconds = Math.min(600, remaining);
      focusProgressEventQueue.push({ id: crypto.randomUUID(), mode, seconds });
      remaining -= seconds;
    }
  });
}

async function flushFocusTime() {
  if (focusProgressApiUnavailable || !activeAuthUser) return;
  stagePendingFocusEvents();
  if (!focusProgressEventQueue.length) return;
  if (focusProgressSyncPromise) return focusProgressSyncPromise;

  const userId = activeAuthUser.id;
  focusProgressSyncPromise = (async () => {
    while (focusProgressEventQueue.length && activeAuthUser?.id === userId) {
      const event = focusProgressEventQueue[0];
      const { data, error } = await supabaseClient.rpc("record_my_focus_time", {
        p_event_id: event.id,
        p_focus_mode: event.mode,
        p_elapsed_seconds: event.seconds,
      });
      if (error) throw error;
      focusProgressEventQueue.shift();
      focusProgressServerSeconds = Math.max(0, Math.floor(Number(data?.progressSeconds) || 0)) % 3600;
      if (Number.isFinite(Number(data?.coinBalance))) state.coins = Number(data.coinBalance);
      const awardedCoins = Math.max(0, Number(data?.awardedCoins) || 0);
      if (awardedCoins > 0) showToast(`집중 누적 60분 완료 ${awardedCoins} Coin을 받았어`);
      refreshFocusProgress();
      renderFarm();
    }
  })()
    .catch((error) => {
      console.error("Farmodoro focus time could not be saved", error);
      if (["42883", "PGRST202"].includes(error?.code)) {
        console.warn("Farmodoro: 036 migration not applied (record_my_focus_time missing)");
        focusProgressApiUnavailable = true;
        showToast("집중 시간 보상 저장을 쓸 수 없어. 이 기기에서는 계속 사용할 수 있어");
      }
    })
    .finally(() => {
      focusProgressSyncPromise = null;
    });
  return focusProgressSyncPromise;
}

function addLegacyFocusRewardSeconds(elapsedSeconds) {
  state.focusRewardSeconds += elapsedSeconds;
  while (state.focusRewardSeconds >= 3600) {
    const reward = productionCoinReward();
    if (!applyFarmWalletChange("coin", reward, "집중 60분 보상", `focus:${Date.now()}`)) return;
    state.focusRewardSeconds -= 3600;
    showToast(`집중 누적 60분 완료 ${reward} Coin을 받았어`);
  }
}

function addFocusSecond(elapsedSeconds = 1, mode = focusMode) {
  if (focusProgressApiUnavailable) {
    addLegacyFocusRewardSeconds(elapsedSeconds);
    return;
  }
  const progressMode = mode === "quick" ? "quick" : "linked";
  pendingFocusSeconds[progressMode] += elapsedSeconds;
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
      label.textContent = `· 집중 ${formatFocusTime(getHabitDailyFocusSeconds(habit))}`;
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
      label.textContent = `· 집중 ${formatFocusTime(getHabitDailyFocusSeconds(item))}`;
    });
}

function updateFocusActionButton() {
  void syncFocusWakeLock();
  const button = document.querySelector("#focusButton");
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

function advanceRunningFocusTimer(mode) {
  if (!isFocusTimerOwner()) {
    focusLastTickAt = 0;
    return { advanced: false, finished: false };
  }
  const runtime = focusRuntimeByMode[mode];
  const now = Date.now();
  if (!focusLastTickAt) {
    focusLastTickAt = now;
    return { advanced: false, finished: false };
  }

  const elapsedSeconds = Math.floor((now - focusLastTickAt) / 1000);
  if (elapsedSeconds < 1) return { advanced: false, finished: false };
  focusLastTickAt += elapsedSeconds * 1000;

  const item = mode === "linked" ? getFocusItem() : null;
  const isTaskStopwatch = Boolean(item && activeFocus?.type === "task");
  const appliedSeconds = isTaskStopwatch
    ? elapsedSeconds
    : Math.min(elapsedSeconds, runtime.seconds);
  runtime.seconds = isTaskStopwatch
    ? runtime.seconds + appliedSeconds
    : Math.max(0, runtime.seconds - appliedSeconds);
  if (runtime.phase === "focus") {
    if (item) {
      if (activeFocus?.type === "task") {
        item.focusSeconds = (item.focusSeconds ?? 0) + appliedSeconds;
      } else if (activeFocus?.type === "habit") {
        const today = toLocalDateString();
        const targetSeconds = Math.max(0, getHabitTargetForDate(item) * 60);
        const focusedSeconds = Math.min(
          targetSeconds,
          getHabitDailyFocusSeconds(item, today) + appliedSeconds,
        );
        item.focusSecondsByDate ??= {};
        item.focusSecondsByDate[today] = focusedSeconds;
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

  if (!isTaskStopwatch && runtime.seconds <= 0) {
    if (runtime.phase === "focus") finishFocusRuntime(mode);
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

  if (mode === "linked") {
    let completionResult = null;
    if (item && activeFocus?.type === "habit" && !isHabitCompleteToday(item)) {
      completionResult = applyHabitCompletionChange(item, false, true);
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
  } else {
    runtime.phase = "focus";
    runtime.seconds = settings.focusMinutes * 60;
    runtime.started = false;
  }

  if (focusMode === mode) {
    focusRunning = false;
    timerPhase = runtime.phase;
    focusSeconds = runtime.seconds;
    focusSessionStarted = runtime.started;
    updateFocusActionButton();
    updateFocusDisplay();
    updateFocusTarget();
  }
  render();
  showToast("집중 세트를 완료했어");
  scheduleFocusTimerDatabaseSync(0);
  void flushFocusTime();
}

function finishBreakRuntime(mode) {
  const runtime = focusRuntimeByMode[mode];
  const settings = getFocusSettings(mode);
  clearInterval(focusInterval);
  focusLastTickAt = 0;
  runningFocusMode = null;
  runtime.phase = "focus";
  runtime.seconds = settings.focusMinutes * 60;
  runtime.started = false;
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
  showToast("휴식 끝 다음 세트를 시작하면 돼");
  scheduleFocusTimerDatabaseSync(0);
}

function startFocusTickInterval(mode) {
  clearInterval(focusInterval);
  focusInterval = setInterval(() => {
    const tickResult = advanceRunningFocusTimer(mode);
    if (!tickResult.advanced || tickResult.finished || !isFocusTimerOwner()) return;
    if (Date.now() - focusTimerLastHeartbeatAt >= 2000) {
      focusTimerLastHeartbeatAt = Date.now();
      saveState();
      renderSummary();
      scheduleTaskDatabaseSync(0);
      scheduleFocusTimerDatabaseSync(0);
      void flushFocusTime();
    }
  }, 250);
}

function toggleFocus() {
  const button = document.querySelector("#focusButton");
  const runtime = focusRuntimeByMode[focusMode];

  if (runningFocusMode === focusMode) {
    focusTimerOwnerId = FOCUS_TIMER_CLIENT_ID;
    const tickResult = advanceRunningFocusTimer(focusMode);
    if (tickResult.finished) return;
    clearInterval(focusInterval);
    focusLastTickAt = 0;
    runningFocusMode = null;
    focusRunning = false;
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

  runningFocusMode = focusMode;
  focusTimerOwnerId = FOCUS_TIMER_CLIENT_ID;
  focusTimerLastHeartbeatAt = Date.now();
  focusRunning = true;
  focusSessionStarted = true;
  runtime.started = true;
  runtime.phase = timerPhase;
  runtime.seconds = focusSeconds;
  focusLastTickAt = Date.now();

  const linkedItem = focusMode === "linked" ? getFocusItem() : null;
  if (activeFocus?.type === "task" && linkedItem?.status === "waiting") {
    linkedItem.status = "doing";
    renderTasks();
    saveState();
    scheduleTaskDatabaseSync(0);
  }
  updateFocusActionButton();

  const startedMode = focusMode;
  startFocusTickInterval(startedMode);
  updateMiniFocusTimer();
  scheduleFocusTimerDatabaseSync(0);
}

function endFocusSession(mode = focusMode) {
  focusTimerOwnerId = FOCUS_TIMER_CLIENT_ID;
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
  if (mode === "linked") focusSettings.classList.add("hidden");
  updateFocusActionButton();
  updateFocusDisplay();
  updateFocusTarget();
  syncFocusSettingsForm();
}

function startItemFocus(type, id) {
  const collection = type === "task" ? state.tasks : state.habits;
  const item = collection.find((entry) => entry.id === id);
  if (!item) return;
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
  focusSettings.classList.add("hidden");

  if (type === "task" && item.status === "waiting") item.status = "doing";
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

const THEMED_DATE_WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
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
      const today = toLocalDateString();
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
  const todayValue = toLocalDateString();
  const firstDay = new Date(themedDateView.getFullYear(), themedDateView.getMonth(), 1, 12);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - mondayOffset);
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

document.querySelector("#openTaskForm").addEventListener("click", () => {
  taskForm.classList.toggle("hidden");
  if (!taskForm.classList.contains("hidden")) taskInput.focus();
});

function closeHabitModal() {
  editingHabitId = null;
  closeHabitMeasureMenu();
  closeThemedDateCalendar();
  habitModal.classList.add("hidden");
  habitForm.classList.add("hidden");
}

function syncHabitMeasurePicker() {
  const selectedOption = habitMeasureType.selectedOptions[0];
  habitMeasureLabel.textContent = selectedOption?.textContent ?? "횟수";
  habitMeasureMenu.querySelectorAll("[data-habit-measure-value]").forEach((option) => {
    const selected = option.dataset.habitMeasureValue === habitMeasureType.value;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-selected", String(selected));
  });
}

function closeHabitMeasureMenu() {
  habitMeasureMenu.classList.add("hidden");
  habitMeasureTrigger.setAttribute("aria-expanded", "false");
}

function resetHabitForm() {
  habitInput.value = "";
  habitMeasureType.value = "count";
  habitTargetValue.value = 1;
  habitWeekdayTargetsEnabled.checked = false;
  habitWeekdayTargets.classList.add("hidden");
  habitWeekdayTargets.querySelectorAll("[data-habit-weekday-target]").forEach((input) => {
    input.value = 1;
  });
  habitUnit.value = "회";
  document
    .querySelectorAll('[name="habitWeekday"]')
    .forEach((input) => (input.checked = true));
  habitEndDate.value = "";
  refreshThemedDateTrigger(habitEndDate);
  syncHabitMeasureFields();
}

function openHabitModal(habit = null) {
  editingHabitId = habit?.id ?? null;
  if (habit) {
    habitModalKicker.textContent = "EDIT ROUTINE";
    habitModalTitle.textContent = "습관 수정";
    habitModalDescription.textContent = "목표와 반복 일정을 다시 설정해";
    habitSubmitButton.textContent = "변경사항 저장";
    habitInput.value = habit.title;
    habitMeasureType.value = habit.measureType;
    habitTargetValue.value = habit.targetValue;
    const hasWeekdayTargets = Object.keys(habit.targetByWeekday ?? {}).length > 0;
    habitWeekdayTargetsEnabled.checked = hasWeekdayTargets;
    habitWeekdayTargets.classList.toggle("hidden", !hasWeekdayTargets);
    habitWeekdayTargets.querySelectorAll("[data-habit-weekday-target]").forEach((input) => {
      input.value = habit.targetByWeekday?.[input.dataset.habitWeekdayTarget] ?? habit.targetValue;
    });
    habitUnit.value = habit.unit;
    document.querySelectorAll('[name="habitWeekday"]').forEach((input) => {
      input.checked = habit.weekdays.includes(Number(input.value));
    });
    habitEndDate.value = habit.endDate || "";
    refreshThemedDateTrigger(habitEndDate);
    syncHabitMeasureFields();
  } else {
    habitModalKicker.textContent = "NEW ROUTINE";
    habitModalTitle.textContent = "새 습관 등록";
    habitModalDescription.textContent = "목표와 반복 일정을 설정해";
    habitSubmitButton.textContent = "습관 추가";
    resetHabitForm();
  }

  habitModalFormSlot.appendChild(habitForm);
  habitModal.classList.remove("hidden");
  habitForm.classList.remove("hidden");
  window.setTimeout(() => habitInput.focus(), 0);
}

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
  if (currentPage !== "habits") return;
  openHabitModal();
});

habitModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-habit-modal]")) closeHabitModal();
});

habitDeleteModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-cancel-habit-delete]")) closeHabitDeleteModal();
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

function syncHabitMeasureFields() {
  const units = { count: "회", time: "분" };
  const isAmount = habitMeasureType.value === "amount";
  habitUnit.readOnly = !isAmount;
  habitTargetValue.min = "1";
  habitTargetValue.step = "1";
  if (!Number.isInteger(Number(habitTargetValue.value))) {
    habitTargetValue.value = Math.max(1, Math.round(Number(habitTargetValue.value) || 1));
  }
  if (!isAmount) habitUnit.value = units[habitMeasureType.value];
  if (isAmount && ["회", "분"].includes(habitUnit.value)) habitUnit.value = "";
  habitUnit.placeholder = isAmount ? "단위" : "";
  syncHabitMeasurePicker();
}

function syncHabitWeekdayTargetVisibility() {
  habitWeekdayTargets.classList.toggle("hidden", !habitWeekdayTargetsEnabled.checked);
  if (!habitWeekdayTargetsEnabled.checked) return;
  habitWeekdayTargets.querySelectorAll("[data-habit-weekday-target]").forEach((input) => {
    if (!input.value) input.value = habitTargetValue.value || "1";
  });
}

habitWeekdayTargetsEnabled.addEventListener("change", syncHabitWeekdayTargetVisibility);

habitWeekdayTargets.addEventListener("keydown", (event) => {
  if ([".", ",", "e", "E", "-", "+"].includes(event.key)) event.preventDefault();
});

habitWeekdayTargets.addEventListener("input", (event) => {
  const input = event.target.closest("[data-habit-weekday-target]");
  if (!input || !input.value) return;
  input.value = String(Math.max(1, Math.trunc(Number(input.value) || 1)));
});

habitMeasureType.addEventListener("change", syncHabitMeasureFields);

habitMeasureTrigger.addEventListener("click", () => {
  const willOpen = habitMeasureMenu.classList.contains("hidden");
  habitMeasureMenu.classList.toggle("hidden", !willOpen);
  habitMeasureTrigger.setAttribute("aria-expanded", String(willOpen));
});

habitMeasureMenu.addEventListener("click", (event) => {
  const option = event.target.closest("[data-habit-measure-value]");
  if (!option) return;
  habitMeasureType.value = option.dataset.habitMeasureValue;
  habitMeasureType.dispatchEvent(new Event("change", { bubbles: true }));
  closeHabitMeasureMenu();
  habitMeasureTrigger.focus();
});

document.addEventListener("click", (event) => {
  if (!habitMeasureSelect.contains(event.target)) closeHabitMeasureMenu();
});

habitTargetValue.addEventListener("keydown", (event) => {
  if ([".", ",", "e", "E", "-", "+"].includes(event.key)) event.preventDefault();
});

habitTargetValue.addEventListener("input", () => {
  if (!habitTargetValue.value) return;
  habitTargetValue.value = String(
    Math.max(1, Math.trunc(Number(habitTargetValue.value) || 1)),
  );
});

document.querySelector("#toggleGroupManager").addEventListener("click", () => {
  groupManager.classList.toggle("hidden");
  if (!groupManager.classList.contains("hidden")) groupInput.focus();
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
  if (event.key === "Enter") {
    event.preventDefault();
    document.querySelector("#addGroupButton").click();
  }
});

document.querySelector("#groupList").addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete-group]");
  if (!deleteButton) return;

  const groupId = deleteButton.dataset.deleteGroup;
  const group = getGroup(groupId);
  pendingGroupDatabaseDeletes.add(groupId);
  state.groups = state.groups.filter((item) => item.id !== groupId);
  if (taskGroupFilter === groupId) taskGroupFilter = "all";
  state.tasks.forEach((task) => {
    if (task.groupId === groupId) task.groupId = null;
  });
  render();
  try {
    await syncTaskDatabaseImmediately();
    showToast(`‘${group?.name ?? "그룹"}’을 삭제하고 할 일은 그룹 없음으로 옮겼어`);
  } catch (error) {
    console.error("Farmodoro task group could not be deleted", error);
    const reason = error.message ? `: ${error.message}` : "";
    showToast(`그룹 삭제를 DB에 반영하지 못했어${reason}`);
    taskDataHydrated = false;
    await loadTaskDataFromDatabase(activeAuthUser);
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
  taskInput.value = "";
  taskForm.classList.add("hidden");
  showToast("대기 목록에 추가했어");
  render();
  scheduleTaskDatabaseSync(0);
});

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
  const targetValue = Number(habitTargetValue.value);
  const targetByWeekday = habitWeekdayTargetsEnabled.checked
    ? Object.fromEntries(
        [...habitWeekdayTargets.querySelectorAll("[data-habit-weekday-target]")]
          .filter((input) => weekdays.includes(Number(input.dataset.habitWeekdayTarget)))
          .map((input) => [input.dataset.habitWeekdayTarget, Number(input.value)]),
      )
    : {};
  const unit = habitUnit.value.trim();

  if (!weekdays.length) {
    showToast("반복할 요일을 하나 이상 선택해");
    return;
  }
  if (!targetValue || targetValue <= 0) {
    showToast("목표값을 확인해");
    return;
  }
  if (!Number.isInteger(targetValue)) {
    showToast("목표값은 정수로 입력해");
    return;
  }
  if (Object.values(targetByWeekday).some((value) => !Number.isInteger(value) || value <= 0)) {
    showToast("요일별 목표값을 확인해");
    return;
  }
  if (!unit) {
    showToast("목표 단위를 입력해");
    return;
  }
  const editingHabit = state.habits.find((habit) => habit.id === editingHabitId);
  if (editingHabit) {
    const previousMeasureType = editingHabit.measureType;
    Object.assign(editingHabit, {
      title,
      measureType: habitMeasureType.value,
      targetValue,
      targetByWeekday,
      unit,
      weekdays,
      endDate: habitEndDate.value,
    });
    if (previousMeasureType !== "count" && editingHabit.measureType === "count") {
      editingHabit.progressByDate ??= {};
      editingHabit.completionDates.forEach((date) => {
        editingHabit.progressByDate[date] = targetValue;
      });
    }
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
      measureType: habitMeasureType.value,
      targetValue,
      targetByWeekday,
      unit,
      weekdays,
      startDate: toLocalDateString(),
      endDate: habitEndDate.value,
    });
  }
  const wasEditing = Boolean(editingHabit);
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
    }
    return;
  }
  if (restoreButton) {
    const task = state.tasks.find((item) => item.id === restoreButton.dataset.restoreTask);
    if (task) {
      task.archived = false;
      task.archivedAt = "";
      task.completedDate = toLocalDateString();
      showToast("보관함에서 다시 꺼냈어");
      render();
      scheduleTaskDatabaseSync(0);
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
  if (event.target.matches(".task-inline-title")) editingTaskTitle = event.target.value;
});

document.querySelector("#taskBoard").addEventListener("submit", (event) => {
  const form = event.target.closest("[data-inline-task-form]");
  if (!form) return;
  event.preventDefault();
  const task = state.tasks.find((item) => item.id === form.dataset.inlineTaskForm);
  const title = editingTaskTitle.trim();
  if (!task || !title) return;
  task.title = title;
  task.groupId = editingTaskGroupId;
  editingTaskId = null;
  editingTaskGroupId = null;
  editingTaskTitle = "";
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

document.querySelector("#taskGroupFilters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-task-group-filter]");
  if (!button) return;
  const nextFilter = button.dataset.taskGroupFilter;
  if (nextFilter === taskGroupFilter) return;
  taskGroupFilter = nextFilter;
  renderTasks();
});

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

document.querySelector("#habitList").addEventListener("click", (event) => {
  const focusButton = event.target.closest("[data-focus-habit]");
  const toggleButton = event.target.closest("[data-toggle-habit]");
  const adjustButton = event.target.closest("[data-adjust-habit]");
  const editButton = event.target.closest("[data-edit-habit]");
  const deleteButton = event.target.closest("[data-delete-habit]");

  if (focusButton) startItemFocus("habit", focusButton.dataset.focusHabit);
  if (toggleButton) toggleHabit(toggleButton.dataset.toggleHabit);
  if (adjustButton) {
    adjustHabitCount(
      adjustButton.dataset.adjustHabit,
      Number(adjustButton.dataset.delta),
    );
  }
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

document.querySelector("#seedShop").addEventListener("click", (event) => {
  const button = event.target.closest("[data-buy-seed]");
  if (!button) return;

  const cropId = button.dataset.buySeed;
  const crop = CROPS[cropId];
  if (!crop) return;
  if (state.coins < crop.seedPrice) {
    showToast(`${crop.name} 씨앗을 사려면 ${crop.seedPrice} Coin이 필요해`);
    return;
  }

  if (
    !applyFarmWalletChange(
      "coin",
      -crop.seedPrice,
      "씨앗 구매",
      `seed:${cropId}:${Date.now()}`,
    )
  ) return;
  state.seedInventory[cropId] += 1;
  if (!selectedSeed) selectedSeed = cropId;
  showToast(`${crop.name} 씨앗을 1개 샀어`);
  render();
});

document.querySelector("#seedInventory").addEventListener("click", (event) => {
  const button = event.target.closest("[data-select-seed]");
  if (!button) return;

  const cropId = button.dataset.selectSeed;
  if (!state.seedInventory[cropId]) {
    showToast("보유한 씨앗이 없어");
    return;
  }

  selectedSeed = selectedSeed === cropId ? null : cropId;
  document.querySelector("#seedStorageModal").classList.add("hidden");
  renderFarm();
});

document.querySelector("#farmItemShop").addEventListener("click", (event) => {
  const button = event.target.closest("[data-buy-farm-item]");
  if (!button) return;
  const itemId = button.dataset.buyFarmItem;
  const item = FARM_ITEMS[itemId];
  if (!item) return;
  if (state.farmMoney < item.price) {
    showToast(`${item.name}을 사려면 ${item.price} Farm Money가 필요해`);
    return;
  }
  if (
    !applyFarmWalletChange(
      "farm_money",
      -item.price,
      "농장 용품 구매",
      `farm-item:${itemId}:${Date.now()}`,
    )
  ) return;
  state.farmItemInventory[itemId] += 1;
  showToast(`${item.name}을 구매했어`);
  render();
});

document.querySelector("#farmItemInventory").addEventListener("click", (event) => {
  const button = event.target.closest("[data-use-farm-item]");
  if (!button) return;
  const itemId = button.dataset.useFarmItem;
  const item = FARM_ITEMS[itemId];
  if (!item || !state.farmItemInventory[itemId]) return;

  if (item.type === "plot") {
    selectedFarmItem = selectedFarmItem === itemId ? null : itemId;
    showToast(selectedFarmItem ? `${item.name}을 적용할 밭을 골라` : "용품 선택을 취소했어");
    document.querySelector("#supplyStorageModal").classList.add("hidden");
    renderFarm();
    return;
  }

  if (itemId === "seedMarketRefresh" || itemId === "foodMarketRefresh") {
    state.farmItemInventory[itemId] -= 1;
    if (itemId === "seedMarketRefresh") {
      state.dailySeedOffers = getRefreshedMarketSelection(
        Object.keys(CROPS),
        7,
        state.dailySeedOffers,
      );
      showToast("모리슨의 씨앗 판매대가 새로 바뀌었어");
    } else {
      state.dailyFoodOffers = getRefreshedMarketSelection(
        Object.keys(RECIPES),
        4,
        state.dailyFoodOffers,
      );
      showToast("모리슨의 음식 매입 목록이 새로 바뀌었어");
    }
    render();
    return;
  }

  if (itemId === "goldenFestivalPass") {
    state.farmItemInventory[itemId] -= 1;
    state.productionBoostUntil =
      Math.max(Date.now(), state.productionBoostUntil) + 24 * 60 * 60 * 1000;
    showToast("황금 수확제가 시작됐어! 24시간 동안 생산 Coin이 2배야");
    render();
    return;
  }

  if (itemId === "farmFestivalPass") {
    state.farmItemInventory[itemId] -= 1;
    state.wiltProtectionUntil =
      Math.max(Date.now(), state.wiltProtectionUntil) + 24 * 60 * 60 * 1000;
    showToast("푸른 들판 축제가 시작됐어! 24시간 동안 작물이 시들지 않아");
    render();
    return;
  }

  if (itemId === "freePass") {
    openFreePassTargetModal();
    return;
  }
});

freePassTargetModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-free-pass]")) {
    closeFreePassTargetModal();
    return;
  }
  const targetButton = event.target.closest("[data-free-pass-target]");
  if (!targetButton) return;
  selectedFreePassTarget = targetButton.dataset.freePassTarget;
  renderFreePassTargets();
});

confirmFreePassTarget.addEventListener("click", () => {
  if (selectedFreePassTarget) useFreePassOnTarget(selectedFreePassTarget);
});

document.querySelector("#farmGrid").addEventListener("click", async (event) => {
  const plantButton = event.target.closest("[data-plant-plot]");
  const growButton = event.target.closest("[data-grow-plot]");
  const waterButton = event.target.closest("[data-water-plot]");
  const harvestButton = event.target.closest("[data-harvest-plot]");
  const discardButton = event.target.closest("[data-discard-plot]");

  const plotElement = event.target.closest("[data-plot-id]");
  if (
    !selectedSeed &&
    selectedFarmItem &&
    plotElement &&
    !plantButton &&
    !growButton &&
    !waterButton &&
    !harvestButton &&
    !discardButton
  ) {
    const plot = state.farmPlots.find(
      (item) => item.id === Number(plotElement.dataset.plotId),
    );
    const itemId = selectedFarmItem;
    const item = FARM_ITEMS[itemId];
    if (!plot?.crop || !item || !state.farmItemInventory[itemId]) {
      showToast("작물이 심어진 밭에만 사용할 수 있어");
      return;
    }

    const previousPlotState = { ...plot };
    const previousInventoryCount = state.farmItemInventory[itemId];
    const previousSelectedFarmItem = selectedFarmItem;

    if (itemId === "revivalTonic") {
      if (!plot.wilted) {
        showToast("시든 작물에만 회복제를 사용할 수 있어");
        return;
      }
      plot.wilted = false;
      plot.lastWateredDate = toLocalDateString();
      plot.lastCaredAt = Date.now();
    } else if (itemId === "growthTonic") {
      if (plot.wilted || plot.growth >= getCropGrowthCost(plot.crop)) {
        showToast("성장 중인 작물에만 사용할 수 있어");
        return;
      }
      plot.growth = getCropGrowthCost(plot.crop);
      plot.lastWateredDate = toLocalDateString();
      plot.lastCaredAt = Date.now();
    } else {
      if (plot.wilted || plot.fertilizer) {
        showToast(plot.fertilizer ? "이미 비료가 적용된 밭이야" : "시든 작물에는 비료를 쓸 수 없어");
        return;
      }
      plot.fertilizer = itemId;
    }

    state.farmItemInventory[itemId] -= 1;
    selectedFarmItem = null;
    showToast(`${item.name}을 적용했어`);
    render();
    await persistFarmPlotAction(() => {
      Object.assign(plot, previousPlotState);
      state.farmItemInventory[itemId] = previousInventoryCount;
      selectedFarmItem = previousSelectedFarmItem;
    }, "아이템 적용 저장에 실패해서 되돌렸어.");
    return;
  }

  if (plantButton) {
    if (!selectedSeed || !state.seedInventory[selectedSeed]) {
      showToast("씨앗 보관함에서 심을 씨앗을 먼저 골라");
      return;
    }

    const plot = state.farmPlots.find(
      (item) => item.id === Number(plantButton.dataset.plantPlot),
    );
    if (!plot || plot.crop) return;

    const previousPlotState = { ...plot };
    const plantedSeed = selectedSeed;
    const previousSeedCount = state.seedInventory[plantedSeed];
    plot.crop = selectedSeed;
    plot.growth = 0;
    plot.plantedDate = toLocalDateString();
    plot.lastWateredDate = "";
    plot.lastFreeWaterAt = 0;
    plot.lastCaredAt = Date.now();
    plot.wilted = false;
    state.seedInventory[selectedSeed] -= 1;
    const cropName = CROPS[selectedSeed].name;
    if (state.seedInventory[selectedSeed] === 0) selectedSeed = null;
    showToast(`${cropName} 씨앗을 심었어`);
    render();
    try {
      await syncFarmDataDatabaseImmediately();
    } catch (error) {
      console.error("Farmodoro planted crop could not be saved", error);
      Object.assign(plot, previousPlotState);
      state.seedInventory[plantedSeed] = previousSeedCount;
      selectedSeed = plantedSeed;
      render();
      showToast("작물 저장에 실패해서 심기 전 상태로 되돌렸어.");
    }
    return;
  }

  if (discardButton) {
    const plot = state.farmPlots.find(
      (item) => item.id === Number(discardButton.dataset.discardPlot),
    );
    if (!plot?.crop || !plot.wilted) return;

    const previousPlotState = { ...plot };
    const cropName = CROPS[plot.crop].name;
    clearFarmPlot(plot);
    showToast(`시든 ${cropName}을 폐기했어`);
    render();
    await persistFarmPlotAction(
      () => Object.assign(plot, previousPlotState),
      "폐기 저장에 실패해서 되돌렸어.",
    );
    return;
  }

  if (harvestButton) {
    const plot = state.farmPlots.find(
      (item) => item.id === Number(harvestButton.dataset.harvestPlot),
    );
    if (!plot?.crop) return;

    const crop = CROPS[plot.crop];
    const maxGrowth = getCropGrowthCost(plot.crop);
    if (plot.wilted || plot.growth < maxGrowth) return;

    const previousPlotState = { ...plot };
    const previousHarvestCount = state.harvestInventory[plot.crop];
    const fertilizer = plot.fertilizer;
    const hasLuckEffect =
      fertilizer === "luckyFertilizer" || fertilizer === "premiumFertilizer";
    const jackpot = hasLuckEffect && Math.random() < 0.05;
    const harvestAmount = hasLuckEffect ? (jackpot ? 5 : 2) : 1;
    state.harvestInventory[plot.crop] += harvestAmount;
    const cropName = crop.name;
    clearFarmPlot(plot);
    if (jackpot) launchHarvestCelebration();
    showToast(
      jackpot
        ? `대풍년! ${cropName}을 5개 수확했어!`
        : `${cropName}을 ${harvestAmount}개 수확해서 보관함에 넣었어`,
    );
    render();
    await persistFarmPlotAction(() => {
      Object.assign(plot, previousPlotState);
      state.harvestInventory[plot.crop] = previousHarvestCount;
    }, "수확 저장에 실패해서 되돌렸어. 다시 수확해줘.");
    return;
  }

  if (waterButton) {
    const plot = state.farmPlots.find(
      (item) => item.id === Number(waterButton.dataset.waterPlot),
    );
    if (!plot?.crop) return;

    const crop = CROPS[plot.crop];
    const maxGrowth = getCropGrowthCost(plot.crop);
    if (plot.wilted || plot.growth >= maxGrowth) return;
    const remaining = getPlotWaterRemaining(plot);
    if (remaining > 0) {
      showToast(`다음 물주기까지 ${formatPlotWaterCooldown(remaining)} 남았어`);
      return;
    }

    const previousPlotState = { ...plot };
    plot.lastFreeWaterAt = Date.now();
    advanceFarmPlotGrowth(plot);
    showToast(
      plot.growth >= maxGrowth
        ? `물을 주니 ${crop.name}이 다 자랐어`
        : `물을 주니 ${crop.name}이 한 단계 자랐어`,
    );
    render();
    await persistFarmPlotAction(
      () => Object.assign(plot, previousPlotState),
      "물주기 저장에 실패해서 되돌렸어.",
    );
    return;
  }

  if (growButton) {
    const plot = state.farmPlots.find(
      (item) => item.id === Number(growButton.dataset.growPlot),
    );
    if (!plot?.crop) return;

    const crop = CROPS[plot.crop];
    const maxGrowth = getCropGrowthCost(plot.crop);
    if (plot.wilted || plot.growth >= maxGrowth) return;
    if (state.coins < 1) {
      showToast("작물을 키우려면 1 Coin이 필요해");
      return;
    }

    if (
      !applyFarmWalletChange(
        "coin",
        -1,
        "작물 성장",
        `plot:${plot.id}:${Date.now()}`,
      )
    ) return;
    const previousPlotState = { ...plot };
    advanceFarmPlotGrowth(plot);
    showToast(
      plot.growth >= maxGrowth
        ? `${crop.name}이 다 자랐어`
        : `${crop.name}이 한 단계 자랐어`,
    );
    render();
    await persistFarmPlotAction(
      () => Object.assign(plot, previousPlotState),
      "성장 저장에 실패해서 되돌렸어.",
    );
  }
});

document.querySelector("#morrisonBuyList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-sell-food]");
  if (!button) return;

  const recipeId = button.dataset.sellFood;
  const recipe = RECIPES[recipeId];
  if (!recipe || !state.foodInventory[recipeId]) {
    showToast("오늘 모리슨에게 팔 수 있는 음식이 없어");
    return;
  }

  if (
    !earnFarmMoney(
      recipe.sellPrice,
      "모리슨 음식 판매",
      `food:${recipeId}:${Date.now()}`,
    )
  ) return;
  state.foodInventory[recipeId] -= 1;
  showToast(`${recipe.name}을 팔고 ${recipe.sellPrice} Farm Money를 받았어`);
  render();
});

document.querySelector("#cookRecipeButton").addEventListener("click", () => {
  const ingredientIds = selectedRecipeIngredients.filter(Boolean);
  if (ingredientIds.length < 2) {
    showToast("재료를 두 가지 이상 골라");
    return;
  }

  const requiredCounts = ingredientIds.reduce((counts, cropId) => {
    counts[cropId] = (counts[cropId] ?? 0) + 1;
    return counts;
  }, {});
  const missingIngredient = Object.entries(requiredCounts).find(
    ([cropId, count]) => (state.harvestInventory[cropId] ?? 0) < count,
  );
  if (missingIngredient) {
    showToast(`${CROPS[missingIngredient[0]].name}이 부족해`);
    return;
  }

  Object.entries(requiredCounts).forEach(([cropId, count]) => {
    state.harvestInventory[cropId] -= count;
  });

  const recipeEntry = getRecipeByIngredients(ingredientIds);
  if (!recipeEntry) {
    state.wasteCount += 1;
    selectedRecipeIngredients.fill("");
    showToast("도감에 없는 조합이야 폐기물이 생겼어");
    render();
    return;
  }

  const [recipeId, recipe] = recipeEntry;
  state.foodInventory[recipeId] += 1;
  const firstDiscovery = !state.discoveredRecipes.includes(recipeId);
  if (firstDiscovery) state.discoveredRecipes.push(recipeId);
  selectedRecipeIngredients.fill("");
  showToast(
    firstDiscovery
      ? `새 레시피 발견! ${recipe.name}`
      : `${recipe.name}을 만들었어`,
  );
  render();
});

document.querySelector("#toggleRecipeBook").addEventListener("click", (event) => {
  const recipeBookPanel = document.querySelector("#recipeBookPanel");
  const collapsed = recipeBookPanel.classList.toggle("collapsed");
  event.currentTarget.textContent = collapsed ? "펼치기" : "접기";
  event.currentTarget.setAttribute("aria-expanded", String(!collapsed));
});

document.querySelector("#foodInventory").addEventListener("click", (event) => {
  const button = event.target.closest("[data-discard-waste]");
  if (!button) return;
  state.wasteCount = 0;
  showToast("폐기물을 모두 버렸어");
  render();
});

const permanentMarketModal = document.querySelector("#permanentMarketModal");
document.querySelector("#openPermanentMarket").addEventListener("click", () => {
  permanentMarketModal.classList.remove("hidden");
});
permanentMarketModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-market]")) {
    permanentMarketModal.classList.add("hidden");
  }
});
const farmRankingModal = document.querySelector("#farmRankingModal");
document.querySelector("#openFarmRanking").addEventListener("click", async () => {
  if (supabaseClient && activeAuthUser) {
    const { data, error } = await supabaseClient.rpc("get_farm_leaderboard", {});
    if (error) {
      console.warn("Farmodoro leaderboard could not be loaded", error);
    } else {
      farmLeaderboard = (data ?? []).map((farmer) => ({
        name: farmer.display_name || farmer.farm_name || "농부",
        score: Number(farmer.earned_farm_money ?? 0),
        isMe: Boolean(farmer.is_me),
      }));
    }
  }
  renderFarmRanking();
  farmRankingModal.classList.remove("hidden");
});
farmRankingModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-farm-ranking]")) {
    farmRankingModal.classList.add("hidden");
  }
});
const farmMailModal = document.querySelector("#farmMailModal");
document.querySelector("#openFarmMail").addEventListener("click", async () => {
  renderFarmMail();
  farmMailModal.classList.remove("hidden");
  if (!activeAuthUser) return;
  try {
    await syncFarmDataDatabaseImmediately();
    await loadFarmDataFromDatabase(activeAuthUser);
  } catch (error) {
    console.error("Farmodoro farm data could not be flushed before opening mail", error);
    showToast("농장 저장에 실패해서 우편함 새로고침을 멈췄어. 잠시 후 다시 열어줘.");
  }
});
document.querySelector("#todayMailAlert").addEventListener("click", async () => {
  farmMailView = "inbox";
  if (currentPage !== "farm") {
    location.hash = "farm";
    showPage("farm");
  }

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const openMailButton = document.querySelector("#openFarmMail");
  if (window.matchMedia("(max-width: 600px)").matches) {
    openMailButton.scrollIntoView({ behavior: "smooth", block: "center" });
    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }
  openMailButton.click();
});

deleteAccountButton.addEventListener("click", async () => {
  if (!supabaseClient || !activeAuthUser) return;
  const confirmation = window.prompt(
    "탈퇴하면 모든 기록과 농장 데이터가 영구 삭제돼. 계속하려면 '탈퇴'라고 입력해줘.",
  );
  if (confirmation?.trim() !== "탈퇴") {
    if (confirmation !== null) showToast("'탈퇴'를 정확히 입력해야 삭제할 수 있어");
    return;
  }

  deleteAccountButton.disabled = true;
  deleteAccountButton.textContent = "계정 삭제 중…";
  try {
    const userId = activeAuthUser.id;
    const avatarPath = `${userId}/profile`;
    const focusBackgroundPath = currentProfile?.focus_background_path;
    await Promise.allSettled([
      supabaseClient.storage.from("avatars").remove([avatarPath]),
      focusBackgroundPath
        ? supabaseClient.storage.from("focus-backgrounds").remove([focusBackgroundPath])
        : Promise.resolve(),
    ]);
    const { error } = await supabaseClient.rpc("delete_my_account");
    if (error) throw error;
    closeUserSettings({ keepTheme: true });
    await supabaseClient.auth.signOut({ scope: "local" });
    await applyAuthSession(null);
    await prepareGoogleSignIn();
    showToast("Farmodoro 계정과 데이터를 삭제했어");
  } catch (error) {
    console.error("Farmodoro account could not be deleted", error);
    if (["42883", "PGRST202"].includes(error?.code)) {
      console.warn("Farmodoro: 028 migration not applied (delete_my_account missing)");
    }
    showToast("계정을 삭제하지 못했어. 잠시 후 다시 시도해줘");
  } finally {
    deleteAccountButton.disabled = false;
    deleteAccountButton.textContent = "Farmodoro 계정과 데이터 삭제";
  }
});
farmMailModal.addEventListener("click", async (event) => {
  if (event.target.closest("[data-close-farm-mail]")) {
    farmMailModal.classList.add("hidden");
    return;
  }

  const viewButton = event.target.closest("[data-mail-view]");
  if (viewButton) {
    farmMailView = viewButton.dataset.mailView;
    renderFarmMail();
    return;
  }

  const friendButton = event.target.closest("[data-mail-friend-code]");
  if (friendButton) {
    selectedMailFriendCode = friendButton.dataset.mailFriendCode;
    renderFarmMail();
    return;
  }

  const claimButton = event.target.closest("[data-claim-farm-mail]");
  if (claimButton) {
    if (claimButton.disabled) return;
    const mail = state.farmInbox.find((entry) => entry.id === claimButton.dataset.claimFarmMail);
    if (!mail || mail.claimed) return;
    const gift = getFarmGiftDetails(mail.category, mail.itemId, mail);
    if (!gift) return;
    if (["rankingBox", "updateBox"].includes(mail.category)) {
      openFarmRewardBoxModal(mail);
      return;
    }
    claimButton.disabled = true;
    try {
      if (mail.dbItemId) {
        const { error } = await supabaseClient.rpc("claim_farm_mail_item", {
          p_mail_item_id: mail.dbItemId,
        });
        if (error) {
          console.error("Farmodoro mail could not be claimed", error);
          showToast("우편 선물을 받지 못했어");
          return;
        }
        await loadFarmDataFromDatabase(activeAuthUser);
        showToast(`${gift.name} 1개를 보관함에 넣었어.`);
        return;
      }
      gift.inventory[mail.itemId] = (gift.inventory[mail.itemId] ?? 0) + 1;
      mail.claimed = true;
      showToast(`${gift.name} 1개를 보관함에 넣었어`);
      render();
    } finally {
      claimButton.disabled = false;
    }
    return;
  }

  const categoryButton = event.target.closest("[data-mail-category]");
  if (categoryButton) {
    selectedMailCategory = categoryButton.dataset.mailCategory;
    selectedMailItemId = null;
    renderFarmMail();
    return;
  }

  const itemButton = event.target.closest("[data-mail-item]");
  if (itemButton) {
    selectedMailItemId = itemButton.dataset.mailItem;
    renderFarmMail();
  }
});
document.querySelector("#farmMailFriendCode").addEventListener("input", (event) => {
  selectedMailFriendCode = event.target.value.toUpperCase().replace(/\s+/g, "").slice(0, 14);
  event.target.value = selectedMailFriendCode;
  renderFarmMail();
});
document.querySelector("#sendFarmMail").addEventListener("click", async () => {
  ensureDailyFarmMail();
  if (state.farmMailSentCount >= 3) {
    showToast("오늘 보낼 수 있는 우편을 모두 사용했어");
    return;
  }

  const friendCode = selectedMailFriendCode.trim().toUpperCase();
  const item = getFarmMailItems().find((entry) => entry.id === selectedMailItemId);
  if (!/^FARM-[A-F0-9]{4}-[A-F0-9]{4}$/.test(friendCode)) {
    showToast("FARM-0000-0000 형식의 친구 코드를 입력해줘");
    return;
  }
  if (!item || item.count < 1) {
    showToast("보낼 물건을 다시 골라줘");
    renderFarmMail();
    return;
  }

  const { error } = await supabaseClient.rpc("send_farm_mail", {
    p_recipient_farm_code: friendCode,
    p_category: selectedMailCategory,
    p_item_id: item.id,
  });
  if (error) {
    console.error("Farmodoro mail could not be sent", error);
    const errorMessage = String(error.message ?? "");
    showToast(
      errorMessage.includes("Recipient not found")
        ? "해당 친구 코드를 찾지 못했어"
        : errorMessage.includes("Cannot send mail to yourself")
          ? "내 농장에는 우편을 보낼 수 없어"
          : "농장 우편을 보내지 못했어",
    );
    return;
  }

  item.inventory[item.id] -= 1;
  state.farmMailSentCount += 1;
  state.farmMailHistory.unshift({
    id: Date.now(),
    friendId: friendCode,
    friendName: friendCode,
    category: selectedMailCategory,
    itemId: item.id,
    itemName: item.name,
    sentTime: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
  });
  if (!farmMailContacts.some((contact) => contact.code === friendCode)) {
    farmMailContacts.unshift({ code: friendCode, name: friendCode });
  }
  selectedMailItemId = null;
  showToast(`${friendCode}에 ${item.name} 1개를 보냈어`);
  render();
});
const farmRewardBoxModal = document.querySelector("#farmRewardBoxModal");
farmRewardBoxModal.addEventListener("click", async (event) => {
  if (event.target.closest("[data-close-reward-box]")) {
    closeFarmRewardBoxModal();
    return;
  }

  const boxButton = event.target.closest("[data-open-reward-box]");
  if (!boxButton || !activeRankingRewardMailId) return;
  const mail = state.farmInbox.find(
    (entry) => entry.id === activeRankingRewardMailId,
  );
  if (!mail || mail.claimed) return;
  boxButton.disabled = true;
  boxButton.setAttribute("aria-busy", "true");
  try {
    await revealFarmRankingBox(mail, Number(boxButton.dataset.openRewardBox));
  } finally {
    if (boxButton.isConnected && !boxButton.classList.contains("opened")) {
      boxButton.disabled = false;
      boxButton.removeAttribute("aria-busy");
    }
  }
});
const farmKitchenModal = document.querySelector("#farmKitchenModal");
document.querySelector("#openFarmKitchen").addEventListener("click", () => {
  closeRecipeIngredientMenus();
  farmKitchenModal.classList.remove("hidden");
});
farmKitchenModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-kitchen]")) {
    closeRecipeIngredientMenus();
    farmKitchenModal.classList.add("hidden");
    return;
  }

  const trigger = event.target.closest(".recipe-ingredient-trigger");
  if (trigger) {
    const picker = trigger.closest(".recipe-ingredient-select");
    const menu = picker.querySelector(".recipe-ingredient-menu");
    const willOpen = menu.classList.contains("hidden");
    closeRecipeIngredientMenus(picker);
    menu.classList.toggle("hidden", !willOpen);
    trigger.setAttribute("aria-expanded", String(willOpen));
    return;
  }

  const option = event.target.closest("[data-recipe-ingredient-value]");
  if (option) {
    const picker = option.closest(".recipe-ingredient-select");
    const select = picker.querySelector("select");
    const triggerButton = picker.querySelector(".recipe-ingredient-trigger");
    select.value = option.dataset.recipeIngredientValue;
    selectedRecipeIngredients[Number(select.id.at(-1)) - 1] = select.value;
    renderRecipeIngredientPicker(select);
    closeRecipeIngredientMenus();
    triggerButton.focus();
    return;
  }

  if (!event.target.closest(".recipe-ingredient-select")) closeRecipeIngredientMenus();
});
const storageModals = {
  harvest: document.querySelector("#harvestStorageModal"),
  seed: document.querySelector("#seedStorageModal"),
  supply: document.querySelector("#supplyStorageModal"),
};
document.querySelector(".farm-storage-toolbar").addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-storage]");
  if (!button) return;
  storageModals[button.dataset.openStorage]?.classList.remove("hidden");
});
Object.values(storageModals).forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-storage]")) modal.classList.add("hidden");
  });
});

const farmNameDisplay = document.querySelector("#farmNameDisplay");
const farmNameForm = document.querySelector("#farmNameForm");
const farmNameInput = document.querySelector("#farmNameInput");

document.querySelector("#editFarmName").addEventListener("click", () => {
  farmNameInput.value = state.farmName;
  farmNameDisplay.hidden = true;
  farmNameForm.hidden = false;
  farmNameInput.focus();
  farmNameInput.select();
});

farmNameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const nextName = farmNameInput.value.trim();
  if (!nextName) {
    showToast("밭 이름을 입력해");
    return;
  }

  state.farmName = nextName;
  farmNameForm.hidden = true;
  farmNameDisplay.hidden = false;
  showToast(`밭 이름을 '${nextName}'으로 바꿨어`);
  render();
});

document.querySelector("#cancelFarmName").addEventListener("click", () => {
  farmNameForm.hidden = true;
  farmNameDisplay.hidden = false;
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (closeThemedDateCalendar()) return;
    if (!habitMeasureMenu.classList.contains("hidden")) {
      closeHabitMeasureMenu();
      habitMeasureTrigger.focus();
      return;
    }
    closeUserSettings();
    closeFreePassTargetModal();
    permanentMarketModal.classList.add("hidden");
    farmRankingModal.classList.add("hidden");
    farmMailModal.classList.add("hidden");
    farmKitchenModal.classList.add("hidden");
    Object.values(storageModals).forEach((modal) => modal.classList.add("hidden"));
    if (editingTaskId) closeTaskInlineEdit();
    closeHabitModal();
    closeHabitDeleteModal();
    closeTaskDeleteModal();
    closeFocusItemMenu();
    closeTaskGroupMenu();
  }
});

const MODAL_DIALOG_SELECTOR =
  '[role="dialog"][aria-modal="true"]:not(.hidden), [role="alertdialog"][aria-modal="true"]:not(.hidden)';
const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

// The tutorial modal already implements its own Tab trap (with extra
// Left/Right step navigation), so this generic trap skips it and covers
// every other role="dialog"/"alertdialog" modal in the app.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  if (!tutorialModal.classList.contains("hidden")) return;
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
document.querySelectorAll("[data-focus-mode]").forEach((button) => {
  button.addEventListener("click", () => setFocusMode(button.dataset.focusMode));
});

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
const focusYoutubeButton = document.querySelector("#toggleFocusYoutube");
const focusYoutubePanel = document.querySelector("#focusYoutubePanel");
const focusYoutubePlayerWrap = document.querySelector("#focusYoutubePlayerWrap");
const focusYoutubeForm = document.querySelector("#focusYoutubeForm");
const focusYoutubeNameInput = document.querySelector("#focusYoutubeName");
const focusYoutubeUrlInput = document.querySelector("#focusYoutubeUrl");
const focusYoutubeLibrary = document.querySelector("#focusYoutubeLibrary");
const focusYoutubeStatus = document.querySelector("#focusYoutubeStatus");
const closeFocusYoutubeButton = document.querySelector("#closeFocusYoutube");
let editingFocusYoutubeId = null;
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
let currentFocusYoutubeTitle = null;
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

function isFocusYoutubePlaying() {
  return Boolean(
    currentFocusYoutubeTitle &&
      focusYoutubePlayer &&
      typeof focusYoutubePlayer.getPlayerState === "function" &&
      focusYoutubePlayer.getPlayerState() === 1,
  );
}

function updateFocusMusicIndicator() {
  const defaultMusicPlaying = Boolean(
    focusAudioPlayer && !focusAudioPlayer.paused && !focusAudioPlayer.ended,
  );
  const youtubePlaying = isFocusYoutubePlaying();
  const showIndicator = currentPage !== "focus" && (defaultMusicPlaying || youtubePlaying);
  miniFocusMusic.hidden = !showIndicator;
  if (!showIndicator) return;
  miniFocusMusicTitle.textContent = youtubePlaying
    ? currentFocusYoutubeTitle
    : currentFocusTrack?.title || "기본 집중 음악";
}

function applyFocusBackground(file) {
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
  focusFullscreenButton.innerHTML = active
    ? '<span aria-hidden="true">×</span> 전체 화면 종료'
    : '<span aria-hidden="true">⛶</span> 전체 화면';
  scheduleFocusStageCenterUpdate();
  requestAnimationFrame(updateFocusYoutubePanelPosition);
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
  stopFocusYoutube();
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

function parseFocusYoutubeUrl(value) {
  const rawValue = value.trim();
  if (!rawValue) return null;

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  if (!["youtube.com", "music.youtube.com", "youtu.be"].includes(hostname)) return null;

  const playlistId = url.searchParams.get("list");
  const validPlaylistId =
    playlistId && /^[A-Za-z0-9_-]{10,}$/.test(playlistId) ? playlistId : "";

  let videoId = url.searchParams.get("v") || "";
  if (hostname === "youtu.be") videoId = url.pathname.split("/").filter(Boolean)[0] || "";
  if (!videoId) {
    const [kind, pathId] = url.pathname.split("/").filter(Boolean);
    if (["embed", "shorts", "live"].includes(kind)) videoId = pathId || "";
  }
  if (/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return { type: "video", id: videoId, playlistId: validPlaylistId, url: url.href };
  }
  if (validPlaylistId) return { type: "playlist", id: validPlaylistId, url: url.href };
  return null;
}

function getFocusYoutubePlaylists() {
  if (!Array.isArray(state.focusYoutubePlaylists)) state.focusYoutubePlaylists = [];
  return state.focusYoutubePlaylists;
}

function renderFocusYoutubeLibrary() {
  const playlists = getFocusYoutubePlaylists();
  focusYoutubeLibrary.replaceChildren();
  if (!playlists.length) {
    const empty = document.createElement("p");
    empty.className = "focus-youtube-library-empty";
    empty.textContent = "저장한 음악이 없어. 최대 5개까지 저장돼.";
    focusYoutubeLibrary.appendChild(empty);
    return;
  }

  playlists.forEach((playlist) => {
    const row = document.createElement("div");
    row.className = "focus-youtube-library-item";

    const title = document.createElement("strong");
    title.textContent = playlist.title;
    title.title = playlist.url;
    row.appendChild(title);

    [
      ["play", "열기"],
      ["edit", "수정"],
      ["delete", "삭제"],
    ].forEach(([action, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.action = action;
      button.dataset.id = playlist.id;
      button.textContent = label;
      row.appendChild(button);
    });
    focusYoutubeLibrary.appendChild(row);
  });
}

// Most videos allow embedding, but a video's owner can disable playback on
// other sites entirely (common for official music videos) -- that specific
// video will never play in an embed no matter what site tries it. The
// YouTube player reports this as error 101/150 (embedding disallowed) or
// 100 (video missing/private). There's no way around that from here, so we
// fall back to opening the video directly on YouTube instead.
const FOCUS_YOUTUBE_UNEMBEDDABLE_ERROR_CODES = [100, 101, 150];

let youtubeIframeApiPromise = null;
function loadYoutubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeIframeApiPromise) return youtubeIframeApiPromise;
  youtubeIframeApiPromise = new Promise((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("YouTube 플레이어를 불러오지 못했어"));
    document.head.appendChild(script);
  });
  return youtubeIframeApiPromise;
}

let focusYoutubePlayer = null;
let focusYoutubePlayerReadyPromise = null;
let pendingFocusYoutubeFallback = null;

function ensureFocusYoutubePlayer() {
  if (focusYoutubePlayerReadyPromise) return focusYoutubePlayerReadyPromise;
  focusYoutubePlayerReadyPromise = loadYoutubeIframeApi().then(
    () =>
      new Promise((resolve) => {
        focusYoutubePlayer = new YT.Player("focusYoutubePlayer", {
          width: "100%",
          height: "100%",
          playerVars: { rel: 0, modestbranding: 1 },
          events: {
            onReady: () => resolve(focusYoutubePlayer),
            onError: (event) => handleFocusYoutubePlayerError(event.data),
            onStateChange: () => updateFocusMusicIndicator(),
          },
        });
      }),
  );
  return focusYoutubePlayerReadyPromise;
}

function handleFocusYoutubePlayerError(code) {
  const fallback = pendingFocusYoutubeFallback;
  pendingFocusYoutubeFallback = null;
  if (!FOCUS_YOUTUBE_UNEMBEDDABLE_ERROR_CODES.includes(code)) return;
  focusYoutubePlayerWrap.classList.add("hidden");
  currentFocusYoutubeTitle = null;
  updateFocusMusicIndicator();
  if (!fallback) return;
  window.open(fallback.source.url, "_blank", "noopener,noreferrer");
  focusYoutubeStatus.textContent =
    `${fallback.title}은(는) 소유자가 다른 사이트 재생을 막아둬서 여기서 재생할 수 없어. ` +
    "YouTube 새 탭으로 열었어.";
}

async function openFocusYoutubeLink(source, title) {
  stopFocusAudio();
  focusYoutubePanel.classList.remove("minimized");
  focusYoutubeButton.classList.add("active");
  focusYoutubeButton.setAttribute("aria-expanded", "true");
  renderFocusYoutubeLibrary();
  focusYoutubeStatus.textContent = `${title} 불러오는 중…`;

  pendingFocusYoutubeFallback = { source, title };
  try {
    const player = await ensureFocusYoutubePlayer();
    focusYoutubePlayerWrap.classList.remove("hidden");
    if (source.type === "playlist") {
      player.loadPlaylist({ list: source.id });
    } else {
      player.loadVideoById(source.id);
    }
    focusYoutubeStatus.textContent = `${title} 재생 중.`;
    currentFocusYoutubeTitle = title;
    updateFocusMusicIndicator();
  } catch (error) {
    console.error("Farmodoro YouTube player could not load", error);
    pendingFocusYoutubeFallback = null;
    focusYoutubePlayerWrap.classList.add("hidden");
    currentFocusYoutubeTitle = null;
    updateFocusMusicIndicator();
    window.open(source.url, "_blank", "noopener,noreferrer");
    focusYoutubeStatus.textContent = `${title} 링크를 새 탭으로 열었어.`;
  }
}

function stopFocusYoutube() {
  focusYoutubePlayer?.stopVideo?.();
  focusYoutubePlayerWrap.classList.add("hidden");
  focusYoutubePanel.classList.add("hidden");
  focusYoutubeButton.classList.remove("active");
  focusYoutubeButton.setAttribute("aria-expanded", "false");
  currentFocusYoutubeTitle = null;
  focusYoutubeStatus.textContent = "영상이나 플레이리스트 주소를 저장하고 YouTube에서 열어.";
  updateFocusMusicIndicator();
}

function updateFocusYoutubePanelPosition() {
  if (
    focusYoutubePanel.classList.contains("hidden")
  ) {
    return;
  }
  const stageRect = focusPageStage.getBoundingClientRect();
  const toolbarRect = focusPageStage
    .querySelector(".focus-stage-toolbar")
    .getBoundingClientRect();
  const panelTop = Math.max(2, Math.ceil(toolbarRect.bottom - stageRect.top + 2));
  focusYoutubePanel.style.setProperty("--focus-youtube-panel-top", `${panelTop}px`);
}

function openFocusYoutube() {
  focusYoutubePanel.classList.remove("hidden");
  focusYoutubeButton.classList.add("active");
  focusYoutubeButton.setAttribute("aria-expanded", "true");
  editingFocusYoutubeId = null;
  focusYoutubeNameInput.value = "";
  focusYoutubeUrlInput.value = "";
  focusYoutubeStatus.textContent = "제목과 YouTube 주소를 넣어. 최대 5개까지 저장돼.";
  renderFocusYoutubeLibrary();
  requestAnimationFrame(() => {
    updateFocusYoutubePanelPosition();
    focusYoutubeNameInput.focus();
  });
}

function minimizeFocusYoutube() {
  focusYoutubePanel.classList.add("hidden");
  focusYoutubeButton.classList.remove("active");
  focusYoutubeButton.setAttribute("aria-expanded", "false");
}

focusYoutubeButton.addEventListener("click", () => {
  if (focusYoutubePanel.classList.contains("hidden")) openFocusYoutube();
  else minimizeFocusYoutube();
});

closeFocusYoutubeButton.addEventListener("click", minimizeFocusYoutube);

focusYoutubeLibrary.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action][data-id]");
  if (!button) return;
  const playlists = getFocusYoutubePlaylists();
  const playlist = playlists.find((item) => item.id === button.dataset.id);
  if (!playlist) return;

  if (button.dataset.action === "play") {
    const source = parseFocusYoutubeUrl(playlist.url);
    if (!source) {
      focusYoutubeStatus.textContent = "저장된 주소가 올바르지 않아. 수정해.";
      return;
    }
    state.focusYoutubeUrl = playlist.url;
    openFocusYoutubeLink(source, playlist.title);
    scheduleAppStateDatabaseSync(null, 0);
    return;
  }

  if (button.dataset.action === "edit") {
    editingFocusYoutubeId = playlist.id;
    focusYoutubeNameInput.value = playlist.title;
    focusYoutubeUrlInput.value = playlist.url;
    focusYoutubeStatus.textContent = "수정한 뒤 저장하고 열기를 눌러.";
    focusYoutubeNameInput.focus();
    return;
  }

  const index = playlists.findIndex((item) => item.id === playlist.id);
  playlists.splice(index, 1);
  if (editingFocusYoutubeId === playlist.id) {
    editingFocusYoutubeId = null;
    focusYoutubeForm.reset();
  }
  renderFocusYoutubeLibrary();
  focusYoutubeStatus.textContent = "삭제했어.";
  scheduleAppStateDatabaseSync(null, 0);
});

focusYoutubeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const source = parseFocusYoutubeUrl(focusYoutubeUrlInput.value);
  if (!source) {
    focusYoutubeStatus.textContent = "올바른 YouTube 영상 또는 플레이리스트 URL을 넣어.";
    focusYoutubeUrlInput.focus();
    return;
  }

  const playlists = getFocusYoutubePlaylists();
  const title =
    focusYoutubeNameInput.value.trim().slice(0, 30) || `플레이리스트 ${playlists.length + 1}`;
  let playlist = editingFocusYoutubeId
    ? playlists.find((item) => item.id === editingFocusYoutubeId)
    : playlists.find((item) => item.url === source.url);
  if (!playlist && playlists.length >= 5) {
    focusYoutubeStatus.textContent = "5개까지 저장할 수 있어. 하나 지우고 추가해.";
    return;
  }
  if (playlist) {
    playlist.title = title;
    playlist.url = source.url;
  } else {
    playlist = { id: createUuid(), title, url: source.url };
    playlists.push(playlist);
  }

  editingFocusYoutubeId = null;
  state.focusYoutubeUrl = source.url;
  openFocusYoutubeLink(source, title);
  scheduleAppStateDatabaseSync(null, 0);
});

const focusSettings = document.querySelector("#focusSettings");
const focusSettingsButton = document.querySelector("#toggleFocusSettings");
const focusMinutesInput = document.querySelector("#focusMinutesInput");
const breakEnabledInput = document.querySelector("#breakEnabledInput");
const breakMinutesInput = document.querySelector("#breakMinutesInput");

function syncFocusSettingsForm() {
  const settings = getFocusSettings("quick");
  focusMinutesInput.value = settings.focusMinutes;
  breakEnabledInput.checked = settings.breakEnabled;
  breakMinutesInput.value = settings.breakMinutes;
  breakMinutesInput.disabled = !settings.breakEnabled;
}

focusSettingsButton.addEventListener("click", () => {
  focusSettings.classList.toggle("hidden");
  syncFocusSettingsForm();
});

document.addEventListener("click", (event) => {
  if (focusSettings.classList.contains("hidden")) return;
  if (focusSettings.contains(event.target) || focusSettingsButton.contains(event.target)) return;
  focusSettings.classList.add("hidden");
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
      syncAppStateDatabaseImmediately(),
      syncFocusTimerDatabaseImmediately(),
      flushFocusTime(),
    ]);
    focusSettings.classList.add("hidden");
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
}

function scheduleFocusStageCenterUpdate() {
  if (focusStageCenterFrame) cancelAnimationFrame(focusStageCenterFrame);
  focusStageCenterFrame = requestAnimationFrame(updateFocusStageCenter);
}

window.addEventListener("resize", scheduleFocusStageCenterUpdate);
window.addEventListener("resize", () => requestAnimationFrame(updateFocusYoutubePanelPosition));
window.visualViewport?.addEventListener("resize", scheduleFocusStageCenterUpdate);
if ("ResizeObserver" in window) {
  const focusStageResizeObserver = new ResizeObserver(() => {
    scheduleFocusStageCenterUpdate();
    requestAnimationFrame(updateFocusYoutubePanelPosition);
  });
  focusStageResizeObserver.observe(focusPageStage);
  focusStageResizeObserver.observe(focusPageStage.querySelector(".focus-stage-toolbar"));
}
document.fonts?.ready.then(scheduleFocusStageCenterUpdate);

function closePageModals() {
  closeUserSettings();
  closeFreePassTargetModal();
  closeHabitModal();
  closeHabitDeleteModal();
  closeTaskDeleteModal();
  closeFocusItemMenu();
  closeTaskGroupMenu();
  closeRecipeIngredientMenus();
  document
    .querySelectorAll(".market-modal, .habit-modal")
    .forEach((modal) => modal.classList.add("hidden"));
}

let pageDataRefreshPromise = null;
let queuedPageDataRefresh = null;

async function refreshPageData(page = currentPage) {
  if (!activeAuthUser || !supabaseClient) return;
  const requestedPage = APP_PAGES.includes(page) ? page : "today";

  if (pageDataRefreshPromise) {
    queuedPageDataRefresh = requestedPage;
    return pageDataRefreshPromise;
  }

  const user = activeAuthUser;
  pageDataRefreshPromise = (async () => {
    if (["today", "tasks", "habits"].includes(requestedPage)) {
      await syncTaskDatabaseImmediately();
      await loadTaskDataFromDatabase(user, { force: true });
    }

    if (requestedPage === "farm") {
      await syncFarmDataDatabaseImmediately();
      await farmWalletMutationChain;
      await Promise.all([
        loadFarmDataFromDatabase(user),
        loadFarmWallet(user),
        pollFarmMailUnreadCount(user),
      ]);
    }

    if (["today", "focus"].includes(requestedPage)) {
      await flushFocusTime();
      await Promise.all([
        loadFocusProgress(user),
        pollFocusTimerFromDatabase(),
      ]);
    }
  })()
    .catch((error) => {
      console.warn("Farmodoro page data could not be refreshed", error);
    })
    .finally(() => {
      pageDataRefreshPromise = null;
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
    taskForm.classList.add("hidden");
    groupManager.classList.add("hidden");
  }

  if (validPage !== "habits" && !habitModal.classList.contains("hidden")) {
    closeHabitModal();
  }

  currentPage = validPage;

  if (validPage === "today") {
    summaryGrid.prepend(focusCard);
    focusCard.classList.remove("standalone");
    todayWorkspace.appendChild(taskSection);
    todayWorkspace.appendChild(habitSection);
    taskSection.querySelector(".section-header h2").textContent = "오늘의 할 일";
    habitSection.querySelector(".section-header h2").textContent = "오늘의 습관";
    openHabitFormButton.hidden = true;
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

  const titles = { today: "오늘", tasks: "할 일", habits: "습관", focus: "집중", farm: "내 농장" };
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
});

async function flushFarmodoroDataOnExit() {
  if (!activeAuthUser) return;
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
      syncAppStateDatabaseImmediately().catch((error) => {
        console.error("Farmodoro app state could not be flushed", error);
      }),
      syncFarmDataDatabaseImmediately().catch((error) => {
        console.error("Farmodoro farm data could not be flushed", error);
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
  if (document.visibilityState !== "hidden" || !activeAuthUser) return;
  void flushFarmodoroDataOnExit();
});

window.flushFarmodoroDataBeforeReload = async () => {
  if (!activeAuthUser) return true;
  exitFlushKeepAlive = true;
  try {
    saveState();
    const operations = [flushFocusTime()];
    if (taskDataHydrated) operations.push(syncTaskDatabaseImmediately());
    if (appStateHydrated) operations.push(syncAppStateDatabaseImmediately());
    if (farmDataHydrated) operations.push(syncFarmDataDatabaseImmediately());
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
  if (isFocusYoutubePlaying()) {
    focusYoutubePlayer?.pauseVideo?.();
    updateFocusMusicIndicator();
  } else {
    stopFocusAudio();
  }
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
  updateDailyFocusQuote();
  updateFarmWaterCooldowns();
  updateFarmItemEffects();
  const archiveChanged = maintainTaskArchive();
  const farmRankingChanged = ensureWeeklyFarmRanking();
  const farmMailChanged = ensureDailyFarmMail();
  const farmInboxChanged = ensureDailyFarmInbox();
  if (archiveChanged || farmRankingChanged || farmMailChanged || farmInboxChanged) render();
}, 60000);

setInterval(() => {
  if (updateWiltedCrops()) render();
  else updateFarmWiltCountdowns();
}, 1000);

render();
syncFocusSettingsForm();
syncHabitMeasureFields();
resetToFocus();
const hashPage = location.hash.slice(1);
const initialPage = APP_PAGES.includes(hashPage) ? hashPage : "today";
showPage(initialPage);
