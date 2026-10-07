/* One creation per account. The server owns progress, unlocks and both currencies. */
(() => {
  "use strict";
  const INTENT_PREFIX = "farmodoro-scenery-intent:";
  const FALLBACK_CATALOG = [
    ["tree", "작은 나무", "tree", 0, 0], ["blossomTree", "벚꽃나무", "tree", 1, 300], ["goldenTree", "황금 나무", "tree", 2, 300],
    ["coral", "기본 산호", "coral", 0, 0], ["pinkCoral", "분홍 산호", "coral", 1, 300], ["sandcastle", "모래성", "sandcastle", 0, 300],
    ["snowman", "눈사람", "snowman", 0, 0], ["snowRabbit", "눈토끼", "snowRabbit", 0, 300],
    ["star", "작은 별", "star", 0, 0], ["planet", "작은 행성", "planet", 0, 300],
    ["crystal", "수정", "crystal", 0, 0], ["roseCrystal", "장미 수정", "crystal", 1, 300],
    ["cactus", "선인장", "cactus", 0, 0], ["floweringCactus", "꽃 선인장", "cactus", 1, 300],
  ].map(([id, name, family, variant, unlockPrice]) => ({ id, name, family, variant, unlockPrice, growthCost: 20, reward: 50 })).concat(window.SceneryThemePresets?.newTypes || []);
  const THEME_GROUPS = {
    ocean: ["coral", "pinkCoral", "sandcastle"], bubbleField: ["coral", "pinkCoral", "sandcastle"],
    iceKingdom: ["snowman", "snowRabbit"], christmas: ["snowman", "snowRabbit"],
    galaxyNight: ["star", "planet"], moonGarden: ["star", "planet"],
    volcano: ["crystal", "roseCrystal"], auroraNight: ["crystal", "roseCrystal"],
    desertOasis: ["cactus", "floweringCactus"],
  };
  const THEME_NAMES = { ocean: "바다", bubbleField: "버블 들판", iceKingdom: "눈의 왕국", christmas: "크리스마스", galaxyNight: "은하수 밤", moonGarden: "달빛 정원", volcano: "화산", auroraNight: "오로라 밤", desertOasis: "사막 오아시스" };
  const ERRORS = {
    SCENERY_UNKNOWN_TYPE: "이 종류를 찾을 수 없어. 목록을 다시 불러올게.",
    SCENERY_THEME_NOT_OWNED: "보유한 테마에서 시작할 수 있어.",
    SCENERY_THEME_MISMATCH: "지금 테마에 어울리는 종류를 골라줘.",
    SCENERY_TYPE_LOCKED: "먼저 이 종류를 해금해줘.",
    SCENERY_ALREADY_ACTIVE: "이미 만들고 있는 풍경이 있어. 진행 상황을 다시 불러올게.",
    SCENERY_CREATION_NOT_FOUND: "진행 상황이 바뀌었어. 다시 불러올게.",
    SCENERY_ALREADY_COMPLETE: "이미 완성했어. 보상을 받아줘.",
    SCENERY_NOT_COMPLETE: "완성한 뒤 보상을 받을 수 있어.",
    SCENERY_ALREADY_CLAIMED: "이미 보상을 받았어. 기록을 다시 불러올게.",
    SCENERY_INVALID_AMOUNT: "사용할 Coin을 다시 확인해줘.",
    FARM_INSUFFICIENT_COIN: "Coin이 부족해. 할 일이나 집중을 완료해서 모아봐.",
    FARM_INSUFFICIENT_FARM_MONEY: "Farm Money가 부족해. 풍경을 완성해서 모아봐.",
  };
  const RPCS = { start: "start_my_scenery_creation", grow: "grow_my_scenery_creation", claim: "claim_my_scenery_creation", unlock: "unlock_my_scenery_type" };
  let scenery = null;
  let ownerId = null;
  let pending = null;
  let busy = false;
  let loading = false;
  let unavailable = false;
  let storageError = false;
  let loadRequest = 0;
  let message = "";
  let mountedRoot = null;
  let renderSignature = "";
  let nextFocus = null;

  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const number = value => Math.max(0, Math.floor(Number(value) || 0)).toLocaleString("ko-KR");
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  const validWallet = (value, coinKey, moneyKey) => value && value[coinKey] != null && value[moneyKey] != null && integer(Number(value[coinKey])) && integer(Number(value[moneyKey]));
  const accountId = () => typeof activeAuthUser !== "undefined" ? activeAuthUser?.id || null : null;
  const generation = () => typeof farmSessionGeneration !== "undefined" ? farmSessionGeneration : 0;
  const selectedTheme = () => typeof state !== "undefined" ? state.equippedFarmTheme || null : null;
  const wallet = () => ({ coins: Number(state.coins) || 0, farmMoney: Number(state.farmMoney) || 0 });
  const catalog = () => scenery?.catalog || FALLBACK_CATALOG;
  const typesForTheme = theme => window.SceneryThemePresets?.themeTypes?.(theme) || THEME_GROUPS[theme] || ["tree", "blossomTree", "goldenTree"];
  const current = (id, session) => accountId() === id && ownerId === id && generation() === session;
  const ready = () => !!scenery && ownerId === accountId() && !!accountId() && farmDataHydrated && !unavailable && !storageError;
  const actionable = () => ready() && !busy && !pending;
  const typeById = id => catalog().find(item => item.id === id);
  function themeName(id) {
    if (!id) return "초록 정원";
    const entry = typeof getCosmeticEntry === "function" ? getCosmeticEntry("farm_theme", id) : null;
    return entry?.name || window.SceneryThemePresets?.theme?.(id)?.name || THEME_NAMES[id] || "내 정원";
  }
  const STAGE_NAMES = ["시작", "성장 중", "거의 완성", "완성"];
  function progressInfo(creation) {
    const rawCost = Number(creation?.growthCost);
    const cost = Number.isFinite(rawCost) && rawCost > 0 ? Math.max(1, Math.floor(rawCost)) : 20;
    const rawProgress = Number(creation?.progress);
    const progress = Math.min(cost, Math.max(0, Number.isFinite(rawProgress) ? Math.floor(rawProgress) : 0));
    const ratio = progress / cost;
    const stage = window.SceneryCreationArt?.stage?.(progress, cost) ?? (ratio >= 1 ? 3 : ratio >= .6 ? 2 : ratio >= .25 ? 1 : 0);
    return { progress, cost, percent: Math.round(ratio * 100), remaining: cost - progress, stage, stageName: STAGE_NAMES[stage], stageProgress: [0, Math.ceil(cost * .25), Math.ceil(cost * .6), cost] };
  }
  function validState(value) {
    if (!value || !Array.isArray(value.catalog) || !value.catalog.length || !Array.isArray(value.unlockedTypes) || !Array.isArray(value.completedTypes) || !integer(value.totalCompleted)) return false;
    const ids = new Set();
    for (const item of value.catalog) {
      if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.name !== "string" || !integer(item.growthCost) || !item.growthCost || !integer(item.reward) || !integer(item.unlockPrice)) return false;
      ids.add(item.id);
    }
    if (value.unlockedTypes.some(id => !ids.has(id)) || value.completedTypes.some(item => !item || !ids.has(item.typeId) || !integer(item.count))) return false;
    const active = value.activeCreation;
    return active === null || !!active && typeof active.id === "string" && !!active.id && ids.has(active.typeId) && (active.themeId === null || typeof active.themeId === "string") && integer(active.progress) && integer(active.growthCost) && active.growthCost > 0 && active.progress <= active.growthCost && integer(active.reward);
  }
  function applyState(value) {
    if (!validState(value)) return false;
    scenery = JSON.parse(JSON.stringify(value));
    ownerId = accountId();
    unavailable = false;
    render();
    return true;
  }
  function isUnavailable(error) {
    return error?.code === "PGRST202" || error?.code === "42883" || /(?:function .*scenery.*(?:does not exist|schema cache)|Could not find the function .*scenery)/i.test(String(error?.message || ""));
  }
  function readPending(id) {
    try {
      const saved = localStorage.getItem(INTENT_PREFIX + id);
      if (!saved) return null;
      const intent = JSON.parse(saved);
      if (intent.userId !== id || !Object.values(RPCS).includes(intent.rpc) || typeof intent.requestId !== "string" || !intent.requestId || !intent.params || intent.params.p_request_id !== intent.requestId) throw new Error("Invalid saved scenery intent");
      return intent;
    } catch (_) {
      storageError = true;
      message = "브라우저의 풍경 저장 기록을 읽을 수 없어. 저장소를 사용할 수 있는지 확인해줘.";
      return null;
    }
  }
  function persist(intent) {
    try {
      localStorage.setItem(INTENT_PREFIX + intent.userId, JSON.stringify(intent));
      pending = intent;
      return true;
    } catch (_) {
      storageError = true;
      message = "브라우저에 작업을 저장할 수 없어. 저장소를 사용할 수 있는지 확인해줘.";
      showToast(message);
      render();
      return false;
    }
  }
  function clearPending(intent) {
    try {
      localStorage.removeItem(INTENT_PREFIX + intent.userId);
      if (pending?.requestId === intent.requestId) pending = null;
      return true;
    } catch (_) {
      message = "작업은 완료했어. 저장 확인을 다시 눌러 기록을 정리해줘.";
      return false;
    }
  }
  async function load(user) {
    const id = user?.id;
    if (!id || id !== accountId()) return false;
    if (ownerId !== id) {
      reset();
      ownerId = id;
      pending = readPending(id);
    } else if (storageError) {
      storageError = false;
      pending = readPending(id);
    }
    const request = ++loadRequest;
    const session = generation();
    const chain = farmActionChain;
    loading = true;
    render();
    try {
      await chain;
      if (!current(id, session) || request !== loadRequest) return false;
      const { data, error } = await supabaseClient.rpc("get_my_scenery_state");
      if (!current(id, session) || request !== loadRequest || chain !== farmActionChain) return false;
      if (error) throw error;
      if (!validState(data)) throw new Error("Invalid scenery state");
      scenery = JSON.parse(JSON.stringify(data));
      unavailable = false;
      message = storageError ? message : pending ? "이전에 보낸 작업의 결과를 확인해야 해. 같은 작업으로 안전하게 다시 확인할 수 있어." : "";
      return true;
    } catch (error) {
      if (!current(id, session) || request !== loadRequest) return false;
      unavailable = isUnavailable(error);
      message = unavailable ? "내 풍경을 준비 중이야. 서버 업데이트가 적용되면 만들기를 시작할 수 있어." : "내 풍경을 불러오지 못했어. 연결을 확인하고 다시 불러와줘.";
      return false;
    } finally {
      if (current(id, session) && request === loadRequest) {
        loading = false;
        render();
      }
    }
  }
  function successMessage(intent, result) {
    const name = typeById(intent.params.p_type_id)?.name || "새 풍경";
    if (intent.kind === "start") return `${name} 만들기를 시작했어.`;
    if (intent.kind === "grow") return result.scenery.activeCreation?.progress >= result.scenery.activeCreation?.growthCost ? "풍경을 완성했어! 보상을 받아줘." : `${number(result.event?.spentCoin ?? intent.params.p_amount)} Coin으로 키웠어.`;
    if (intent.kind === "claim") return `풍경을 완성해서 ${number(result.event?.reward ?? 50)} Farm Money를 받았어.`;
    return `${name}을 해금했어. 이제 계속 선택할 수 있어.`;
  }
  async function runIntent(intent, recovering = false) {
    if (!ready() || busy || intent.userId !== accountId()) return null;
    const id = intent.userId;
    const session = generation();
    const startedInScenery = !!mountedRoot?.contains(document.activeElement);
    busy = true;
    loading = false;
    loadRequest += 1;
    message = "저장하고 있어…";
    render();
    let reload = false;
    const previousFarmChain = farmActionChain;
    const previousWalletChain = typeof farmWalletMutationChain !== "undefined" ? farmWalletMutationChain : Promise.resolve();
    const call = Promise.all([previousFarmChain, previousWalletChain]).then(async () => {
      if (!current(id, session)) return null;
      try {
        let { data, error } = await supabaseClient.rpc(intent.rpc, intent.params);
        if (!current(id, session)) return null;
        if (error) throw error;
        if (!data || !validState(data.scenery) || !validWallet(data.wallet, "coinBalance", "farmMoneyBalance")) throw new Error("Invalid scenery action response");
        if (recovering) {
          // Other devices may have progressed further after this intent committed.
          // Never restore an old cached wallet or creation while confirming it.
          const [freshScenery, freshWallet] = await Promise.all([
            supabaseClient.rpc("get_my_scenery_state"),
            supabaseClient.rpc("get_my_farm_wallet"),
          ]);
          if (!current(id, session)) return null;
          if (freshScenery.error) throw freshScenery.error;
          if (freshWallet.error) throw freshWallet.error;
          const authoritativeWallet = Array.isArray(freshWallet.data) ? freshWallet.data[0] : freshWallet.data;
          if (!validState(freshScenery.data) || !validWallet(authoritativeWallet, "coin_balance", "farm_money_balance")) throw new Error("Invalid scenery recovery response");
          data = { ...data, scenery: freshScenery.data, wallet: { coinBalance: Number(authoritativeWallet.coin_balance), farmMoneyBalance: Number(authoritativeWallet.farm_money_balance) } };
        }
        applyFarmActionResult(data);
        scenery = JSON.parse(JSON.stringify(data.scenery));
        message = successMessage(intent, data);
        clearPending(intent);
        renderSummary();
        showToast(message);
        return data;
      } catch (error) {
        if (!current(id, session)) return null;
        const sentinel = Object.keys(ERRORS).find(key => String(error?.message || "").includes(key));
        if (sentinel) {
          clearPending(intent);
          message = ERRORS[sentinel];
          reload = true;
        } else {
          unavailable = isUnavailable(error);
          message = unavailable ? "내 풍경 서버 업데이트가 필요해. 업데이트 후 같은 작업을 다시 확인할 수 있어." : "저장 결과를 확인하지 못했어. 다시 확인을 누르면 같은 작업을 확인해. Coin과 보상을 중복 처리하지 않아.";
        }
        showToast(message);
        return null;
      } finally {
        if (current(id, session)) {
          busy = false;
          if (startedInScenery && mountedRoot?.contains(document.activeElement)) nextFocus = intent.kind === "claim" ? "picker-title" : intent.kind === "unlock" ? `start-${intent.params.p_type_id}` : "grow-1";
          render();
          if (typeof renderFarm === "function") renderFarm();
        }
      }
    });
    const guarded = call.catch(() => {});
    farmActionChain = guarded;
    if (typeof farmWalletMutationChain !== "undefined") farmWalletMutationChain = guarded;
    const result = await call;
    if (reload && current(id, session)) void load(activeAuthUser);
    return result;
  }
  function intentFor(kind, params) {
    const requestId = createUuid();
    return { userId: accountId(), requestId, rpc: RPCS[kind], kind, params: { ...params, p_request_id: requestId } };
  }
  async function act(kind, typeId, amount) {
    if (kind === "reload") return load(activeAuthUser);
    if (kind === "picker") {
      const heading = document.getElementById("sceneryPickerTitle");
      heading?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
      heading?.focus?.({ preventScroll: true });
      return null;
    }
    if (kind === "retry") return pending ? runIntent(pending, true) : null;
    if (!actionable()) return null;
    const active = scenery.activeCreation;
    let params;
    if (kind === "start") {
      if (active || !typesForTheme(selectedTheme()).includes(typeId) || !scenery.unlockedTypes.includes(typeId)) return null;
      params = { p_type_id: typeId, p_theme_id: selectedTheme() };
    } else if (kind === "grow") {
      const spend = Math.floor(Number(amount));
      if (!active || !Number.isFinite(spend) || spend < 1 || spend > Math.min(wallet().coins, active.growthCost - active.progress)) return null;
      params = { p_creation_id: active.id, p_amount: spend };
    } else if (kind === "claim") {
      if (!active || active.progress < active.growthCost) return null;
      params = { p_creation_id: active.id };
    } else if (kind === "unlock") {
      const item = typeById(typeId);
      if (!item || scenery.unlockedTypes.includes(typeId) || wallet().farmMoney < item.unlockPrice) return null;
      params = { p_type_id: typeId };
    } else return null;
    const intent = intentFor(kind, params);
    if (!persist(intent)) return null;
    return runIntent(intent);
  }
  function sprite(typeId, progress, cost) {
    return window.SceneryCreationArt?.sprite?.(typeId, progress, cost) || '<span class="scenery-art-placeholder" aria-hidden="true"></span>';
  }
  function terrain(themeId) {
    const art = window.FarmGardenArt?.theme?.(themeId);
    return art ? `<div class="garden-terrain" aria-hidden="true" style="background-image:url('${escape(art.url)}');background-size:${escape(art.size || "200% auto")};background-position:${Number(art.x) || 0}% ${Number(art.y) || 0}%"></div>` : "";
  }
  function button(kind, label, disabled, focus, extra = "", className = "") {
    return `<button type="button" class="scenery-button ${className}" data-scenery-action="${kind}" data-scenery-focus="${escape(focus)}" ${extra}${disabled ? " disabled" : ""}>${label}</button>`;
  }
  function renderFocus() {
    const root = document.getElementById("sceneryCreationRoot");
    if (!root || !scenery || ownerId !== accountId()) return;
    render();
  }
  function growthTimeline(item, theme, info, active) {
    const preset = window.SceneryThemePresets?.theme?.(theme);
    const labels = preset?.defaultType === item.id ? preset.stageLabels : null;
    return `<section class="scenery-growth-timeline" aria-label="${escape(item.name)} 성장 모습"><div class="scenery-timeline-heading"><strong>${active ? "내 성장 단계" : "성장 모습 미리보기"}</strong><span>${active ? `${info.stage + 1} / 4단계` : "사용한 Coin에 따라 모습이 달라져"}</span></div><ol>${info.stageProgress.map((value, index) => `<li class="scenery-growth-step${active && info.stage === index ? " is-current" : ""}${active && info.stage > index ? " is-reached" : ""}" data-scenery-stage="${index}"${active && info.stage === index ? ' aria-current="step"' : ""}><div class="scenery-step-art">${sprite(item.id, value, info.cost)}</div><strong>${STAGE_NAMES[index]}</strong>${labels?.[index] ? `<span class="scenery-step-description">${escape(labels[index])}</span>` : ""}<span class="scenery-step-coin">${number(value)} Coin</span>${active && info.stage === index ? '<b class="scenery-step-current">지금 여기</b>' : ""}</li>`).join("")}</ol></section>`;
  }
  function settlementPanel() {
    const settlement = typeof state !== "undefined" ? state.legacySettlement : null;
    if (!accountId() || typeof farmDataUserId === "undefined" || farmDataUserId !== accountId()
      || !farmDataHydrated || settlement?.version !== 1
      || !(settlement.coinRefund > 0 || settlement.farmMoneyRefund > 0)) return "";
    const labels = { seed: "남은 씨앗", planted: "심어 둔 작물", harvest: "보관한 수확물",
      food: "완성한 요리", supply: "미사용 용품", plot_skin: "구매한 밭 스킨" };
    const groups = new Map();
    for (const item of settlement.items || []) {
      if (!labels[item.category] || !(item.amount > 0)) continue;
      const key = `${item.category}:${item.currency}`;
      const group = groups.get(key) || { label: labels[item.category], quantity: 0, amount: 0, currency: item.currency };
      group.quantity += Math.max(0, Number(item.quantity) || 0);
      group.amount += Math.max(0, Number(item.amount) || 0);
      groups.set(key, group);
    }
    const rows = [...groups.values()].map(group => `<tr><th scope="row">${group.label}</th><td>${number(group.quantity)}개</td><td>+${number(group.amount)} ${group.currency === "coin" ? "Coin" : "Farm Money"}</td></tr>`).join("");
    return `<details class="scenery-settlement" data-scenery-settlement><summary data-scenery-focus="settlement-summary"><span>농장 개편 정산 완료</span><strong>${settlement.coinRefund > 0 ? `+${number(settlement.coinRefund)} Coin` : ""}${settlement.coinRefund > 0 && settlement.farmMoneyRefund > 0 ? " · " : ""}${settlement.farmMoneyRefund > 0 ? `+${number(settlement.farmMoneyRefund)} Farm Money` : ""}</strong></summary><p>기존 재산과 미수령 우편 속 물품을 한 번 정산해 지갑에 지급했어. 이 금액은 주간 랭킹 수익에 포함되지 않아.</p><table><caption>기존 농장 재산의 정산 내역</caption><thead><tr><th scope="col">항목</th><th scope="col">수량</th><th scope="col">지급액</th></tr></thead><tbody>${rows}</tbody></table><p class="scenery-settlement-note">씨앗·용품은 남은 수량의 기준가, 심은 작물은 씨앗값과 성장 단계로 계산했어. 수확물·요리는 판매 기준가, 구매한 밭 스킨은 실제 결제액을 돌려줬어.</p></details>`;
  }
  function render() {
    const root = document.getElementById("sceneryCreationRoot");
    if (!root) return;
    if (mountedRoot !== root) {
      mountedRoot = root;
      renderSignature = "";
      root.addEventListener("click", event => {
        const control = event.target.closest("[data-scenery-action]");
        if (!control || !root.contains(control) || control.disabled) return;
        void act(control.dataset.sceneryAction, control.dataset.sceneryType, control.dataset.sceneryAmount);
      });
    }
    const active = ownerId === accountId() ? scenery?.activeCreation : null;
    const theme = active ? active.themeId : selectedTheme();
    const candidates = typesForTheme(selectedTheme()).map(id => typeById(id) || FALLBACK_CATALOG.find(item => item.id === id)).filter(Boolean);
    const first = candidates[0] || FALLBACK_CATALOG[0];
    const item = active ? typeById(active.typeId) : first;
    const info = progressInfo(active || { progress: 0, growthCost: item.growthCost });
    const { progress, cost } = info;
    const reward = active?.reward ?? item.reward;
    const complete = !!active && progress >= cost;
    const spend5 = active ? Math.min(5, Math.max(0, Math.floor(wallet().coins)), cost - progress) : 0;
    const canAct = actionable();
    const preparing = !!scenery && !scenery.catalog.some(candidate => candidate.id === first.id);
    const stage = active ? `${info.stage + 1} / 4단계 · ${info.stageName}` : "완성 예시";
    const status = message || (!accountId() ? "로그인하면 내 풍경을 만들 수 있어." : loading || !scenery ? "내 풍경을 불러오는 중이야…" : active ? "할 일과 집중으로 모은 Coin으로 조금씩 키워봐." : preparing ? "새 테마 풍경을 준비 중이야. 서버 업데이트 후 시작할 수 있어." : "한 번에 하나씩, 오늘의 성취를 풍경으로 만들어봐.");
    const controls = !active ? button("picker", "종류 골라 시작하기", !canAct, "choose", "", "scenery-primary") : complete ? button("claim", `보상 받기 · +${number(reward)} Farm Money`, !canAct, "claim", "", "scenery-primary") : button("grow", "1 Coin으로 키우기", !canAct || wallet().coins < 1, "grow-1", 'data-scenery-amount="1" ', "scenery-primary") + button("grow", `${number(spend5 || Math.min(5, cost - progress))} Coin 한 번에 쓰기`, !canAct || spend5 < 2, "grow-5", `data-scenery-amount="${spend5}" `, "scenery-secondary");
    const cards = candidates.map(candidate => {
      const available = !!scenery?.catalog.some(item => item.id === candidate.id);
      const unlocked = available && !!scenery?.unlockedTypes.includes(candidate.id);
      const making = active?.typeId === candidate.id && active.themeId === selectedTheme();
      let cardButton;
      if (!available) cardButton = button("start", "준비 중", true, `start-${candidate.id}`, `data-scenery-type="${escape(candidate.id)}" `, "scenery-secondary");
      else if (!unlocked) cardButton = button("unlock", `해금 · ${number(candidate.unlockPrice)} Farm Money`, !canAct || wallet().farmMoney < candidate.unlockPrice, `unlock-${candidate.id}`, `data-scenery-type="${escape(candidate.id)}" `, "scenery-secondary");
      else cardButton = button("start", making ? "만드는 중" : active ? "다음에 만들 수 있어" : "무료로 시작하기", !canAct || !!active, `start-${candidate.id}`, `data-scenery-type="${escape(candidate.id)}" `, "scenery-secondary");
      return `<article class="scenery-type-card${making ? " is-current" : ""}" data-scenery-card="${escape(candidate.id)}"><div class="scenery-type-preview">${sprite(candidate.id, making ? progress : candidate.growthCost, making ? cost : candidate.growthCost)}</div><span class="scenery-type-preview-caption">${making ? `현재 성장 · ${number(info.percent)}%` : "완성 예시"}</span><div class="scenery-type-heading"><h4>${escape(candidate.name)}</h4><span class="scenery-type-label">${!available ? "서버 준비 중" : unlocked ? candidate.unlockPrice === 0 ? "기본 종류" : "해금됨" : "영구 해금"}</span></div><p>${making ? `${number(progress)} / ${number(cost)} Coin 사용 · ${number(info.remaining)} Coin 남음` : `${number(candidate.growthCost)} Coin으로 완성 · 보상 ${number(candidate.reward)}`}</p>${cardButton}</article>`;
    }).join("");
    const history = (scenery?.completedTypes || []).filter(entry => entry.count > 0).map(entry => `<li><span class="scenery-history-art">${sprite(entry.typeId, typeById(entry.typeId).growthCost, typeById(entry.typeId).growthCost)}</span><span>${escape(typeById(entry.typeId).name)}</span><strong>${number(entry.count)}개</strong></li>`).join("");
    const retry = pending && ownerId === accountId() ? `<div class="scenery-pending"><span>아직 결과를 확인하지 못한 작업이 있어.</span>${button("retry", busy ? "확인 중…" : "같은 작업 다시 확인", !ready() || busy, "retry", "", "scenery-secondary")}</div>` : "";
    const reload = unavailable || storageError || (!scenery && !loading && accountId()) ? button("reload", "다시 불러오기", loading || busy, "reload", "", "scenery-secondary") : "";
    const growth = active ? `<div class="scenery-growth-copy"><strong>${number(info.percent)}% 성장</strong><span>완성 보상 ${number(reward)} Farm Money</span></div><div class="scenery-growth-numbers"><span><b>${number(progress)} / ${number(cost)}</b> Coin 사용</span><span>${complete ? "완성! 보상을 받아봐" : `완성까지 <b>${number(info.remaining)} Coin</b>`}</span></div><div class="scenery-progress" role="progressbar" aria-label="${escape(item.name)} 성장" aria-valuemin="0" aria-valuemax="${cost}" aria-valuenow="${progress}" aria-valuetext="${info.percent}% · ${progress} / ${cost} Coin 사용 · ${info.remaining} Coin 남음"><span style="width:${progress / cost * 100}%"></span></div>` : '<div class="scenery-growth-copy"><strong>마음에 드는 모습으로 시작해</strong><span>기본 종류는 무료로 시작할 수 있어</span></div>';
    const html = `<div class="scenery-creation"><article class="scenery-main-card"><header class="scenery-scene-heading"><div><span class="scenery-eyebrow">${escape(themeName(theme))} · ${active ? "나의 풍경" : "새로운 시작"}</span><h2 tabindex="-1" data-scenery-focus="creation-title">${escape(item.name)}</h2></div><span class="scenery-stage-label${complete ? " is-complete" : ""}">${stage}</span></header><div id="sceneryCreationScene" class="scenery-creation-scene${complete ? " is-complete" : ""}" role="img" aria-label="${escape(themeName(theme))}에서 ${escape(item.name)} · ${active ? `${info.percent}% 성장 · ${progress}/${cost} Coin 사용` : "완성 모습 미리보기"}">${terrain(theme)}<div class="scenery-centerpiece${!active ? " is-preview" : ""}">${sprite(item.id, active ? progress : cost, cost)}</div>${complete ? '<span class="scenery-complete-sparkle" aria-hidden="true">✦</span>' : ""}</div><div class="scenery-growth-panel">${growth}${growthTimeline(item, theme, info, !!active)}<div class="scenery-actions">${controls}${active ? button("picker", "종류 고르기", false, "choose", "", "scenery-text-button") : ""}</div>${active && !complete && wallet().coins < 1 ? '<p class="scenery-coin-note">할 일·습관·집중을 완료하면 Coin을 모을 수 있어.</p>' : ""}</div></article><div class="scenery-status-row"><p id="sceneryActionStatus" class="scenery-action-status" role="status" aria-live="polite" aria-atomic="true">${escape(status)}</p>${reload}</div>${retry}<section class="scenery-picker" aria-labelledby="sceneryPickerTitle"><div class="scenery-section-heading"><h3 id="sceneryPickerTitle" tabindex="-1" data-scenery-focus="picker-title">${escape(themeName(selectedTheme()))}에서 만들기</h3><span>한 번 해금하면 계속 선택할 수 있어</span></div>${preparing ? '<p class="scenery-theme-note">새 대표 풍경은 서버 업데이트 후 시작할 수 있어. 만들던 풍경은 계속 키울 수 있어.</p>' : ""}${active && active.themeId !== selectedTheme() ? '<p class="scenery-theme-note">지금 만드는 풍경은 그대로 이어지고, 새 테마는 다음 풍경부터 적용돼.</p>' : ""}<div class="scenery-type-grid">${cards}</div></section><section class="scenery-history" aria-labelledby="sceneryHistoryTitle"><div class="scenery-section-heading"><h3 id="sceneryHistoryTitle">완성한 풍경</h3><span>총 ${number(scenery?.totalCompleted || 0)}개 완성</span></div>${history ? `<ul>${history}</ul>` : '<p class="scenery-history-empty">완성한 모습과 기록이 여기에 남아.</p>'}</section></div>`;
    const settlement = settlementPanel();
    const signature = settlement + html;
    if (signature === renderSignature) return;
    const focused = root.contains(document.activeElement) ? document.activeElement?.dataset?.sceneryFocus : null;
    const settlementOpen = !!root.querySelector('[data-scenery-settlement][open]');
    root.innerHTML = settlement + html;
    if (settlementOpen) root.querySelector('[data-scenery-settlement]')?.setAttribute('open', '');
    renderSignature = signature;
    root.setAttribute("aria-busy", String(busy || loading));
    const focusKey = nextFocus || focused;
    nextFocus = null;
    if (focusKey) {
      const targets = Array.from(root.querySelectorAll("[data-scenery-focus]"));
      const target = targets.find(element => element.dataset.sceneryFocus === focusKey && !element.disabled) || targets.find(element => element.dataset.sceneryFocus === "creation-title");
      target?.focus?.({ preventScroll: true });
    }
  }
  function reset() {
    loadRequest += 1;
    scenery = null;
    ownerId = null;
    pending = null;
    busy = false;
    loading = false;
    unavailable = false;
    storageError = false;
    message = "";
    nextFocus = null;
    renderSignature = "";
    render();
  }
  window.SceneryCreations = {
    render, load, applyState, reset, renderFocus, progressInfo,
    snapshot: () => ownerId === accountId() && scenery ? JSON.parse(JSON.stringify(scenery)) : null,
    themeTypes: theme => [...typesForTheme(theme)],
    defaultType: theme => typesForTheme(theme)[0],
  };
  render();
})();
