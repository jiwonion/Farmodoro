/* The kitchen shares the existing farm inventory and server action queue. */
(() => {
  "use strict";

  const MAX_BATCH = 50;
  const modal = document.getElementById("farmKitchenModal");
  let selectedRecipeId = null;
  let quantity = 1;
  let showAllRecipes = false;
  let search = "";
  let pendingAction = null;
  let generation = 0;
  let unresolvedIntent = null;
  let intentUserId = null;
  let feedback = "";
  let returnFocus = null;

  const countOf = (value) => Math.max(0, Math.floor(Number(value) || 0));
  const money = (value) => Number(value || 0).toLocaleString("ko-KR");

  function recipeModel(recipeId, inventory = state.harvestInventory) {
    const recipe = RECIPES[recipeId];
    if (!recipe) return null;
    const required = recipe.ingredients.reduce((counts, cropId) => {
      counts[cropId] = (counts[cropId] || 0) + 1;
      return counts;
    }, {});
    const ingredients = Object.entries(required).map(([cropId, amount]) => ({
      cropId,
      amount,
      owned: countOf(inventory[cropId]),
    }));
    const available = Math.max(0, Math.min(...ingredients.map(({ owned, amount }) => Math.floor(owned / amount))));
    return { recipeId, recipe, ingredients, available, maxQuantity: Math.min(MAX_BATCH, available) };
  }

  function saleModel(inventory = state.foodInventory) {
    const foods = Object.entries(RECIPES).flatMap(([recipeId, recipe]) => {
      const count = countOf(inventory[recipeId]);
      return count ? [{ recipeId, recipe, count, amount: count * recipe.sellPrice }] : [];
    });
    return {
      foods,
      count: foods.reduce((total, food) => total + food.count, 0),
      amount: foods.reduce((total, food) => total + food.amount, 0),
    };
  }

  function clampQuantity(value, maximum) {
    return Math.min(Math.max(1, countOf(value)), Math.max(1, countOf(maximum)));
  }

  function foodArt(recipeId) {
    return window.FarmGardenArt?.food?.(recipeId) || foodPixel(recipeId);
  }

  function cropArt(cropId) {
    return window.FarmGardenArt?.crop?.(cropId) || cropPixel(cropId);
  }

  function canAct() {
    return Boolean(activeAuthUser && farmDataHydrated && !pendingAction);
  }

  function isKnownFailure(error) {
    const code = String(error?.code || "");
    return /^(22|23|28|42|P0)[A-Z0-9]{3}$/.test(code)
      || ["PGRST202", "PGRST301", "PGRST302", "PGRST303"].includes(code)
      || /FARM_[A-Z0-9_]+/.test(String(error?.message || ""));
  }

  function restoreIntent() {
    const userId = activeAuthUser?.id || null;
    if (intentUserId === userId) return;
    intentUserId = userId;
    unresolvedIntent = null;
    feedback = "";
    if (!userId) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`farmodoro-kitchen-intent:${userId}`) || "null");
      if (!saved || saved.userId !== userId || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(saved.requestId)) return;
      if (saved.kind === "cook" && (!RECIPES[saved.recipeId] || !Number.isInteger(saved.quantity) || saved.quantity < 1 || saved.quantity > MAX_BATCH)) return;
      if (!["cook", "sell"].includes(saved.kind)) return;
      unresolvedIntent = saved;
      if (saved.kind === "cook") { selectedRecipeId = saved.recipeId; quantity = saved.quantity; }
    } catch (error) {
      console.warn("Farmodoro kitchen recovery could not be read", error);
    }
  }

  function saveIntent(intent) {
    unresolvedIntent = intent;
    try {
      const key = `farmodoro-kitchen-intent:${intent?.userId || intentUserId}`;
      if (intent) localStorage.setItem(key, JSON.stringify(intent));
      else localStorage.removeItem(key);
    } catch (error) {
      console.warn("Farmodoro kitchen recovery could not be saved", error);
    }
  }

  async function refreshRecoveredState(user, actionGeneration) {
    const stillCurrent = () => activeAuthUser?.id === user.id && generation === actionGeneration;
    try {
      await loadFarmDataFromDatabase(user);
      if (!stillCurrent()) return false;
      // Farm snapshots contain crops and food; the wallet has its own endpoint.
      await loadFarmWallet(user);
      return stillCurrent();
    } catch (error) {
      console.warn("Farmodoro kitchen recovery could not refresh current data", error);
      return false;
    }
  }

  function renderSelected(model) {
    const details = document.getElementById("kitchenSelectedRecipe");
    if (!model) {
      details.innerHTML = '<div class="kitchen-v2-empty"><span aria-hidden="true">🍽️</span><h3>요리를 골라봐</h3><p>수확한 재료가 준비되면 바로 만들 수 있어.</p></div>';
      return;
    }
    const { recipeId, recipe, ingredients, available, maxQuantity } = model;
    const retryingCook = unresolvedIntent?.kind === "cook";
    quantity = retryingCook ? unresolvedIntent.quantity : clampQuantity(quantity, maxQuantity);
    details.innerHTML = `
      <div class="kitchen-v2-selected-art">${foodArt(recipeId)}</div>
      <span class="kitchen-v2-eyebrow">오늘의 요리</span>
      <h3>${escapeHtml(recipe.name)}</h3>
      <p class="kitchen-v2-price">1개 판매가 <strong>${money(recipe.sellPrice)} Farm Money</strong></p>
      <div class="kitchen-v2-ingredient-heading"><strong>필요한 재료</strong><span>${quantity}개 만들기 기준</span></div>
      <ul class="kitchen-v2-required-ingredients">${ingredients.map(({ cropId, amount, owned }) => `
        <li class="${owned < amount * quantity ? "is-missing" : ""}">
          ${cropArt(cropId)}<span>${escapeHtml(CROPS[cropId].name)}</span>
          <strong>${amount * quantity}개 <small>/ 보유 ${owned}개</small></strong>
        </li>`).join("")}</ul>
      <div class="kitchen-v2-quantity-row">
        <label for="kitchenCookQuantity">만들 수량</label>
        <div class="kitchen-v2-stepper">
          <button type="button" data-kitchen-quantity-step="-1" aria-label="요리 수량 줄이기" ${!canAct() || unresolvedIntent || quantity <= 1 ? "disabled" : ""}>−</button>
          <input id="kitchenCookQuantity" type="number" inputmode="numeric" min="1" max="${Math.max(1, maxQuantity, quantity)}" value="${quantity}" ${!canAct() || unresolvedIntent || !available ? "disabled" : ""} />
          <button type="button" data-kitchen-quantity-step="1" aria-label="요리 수량 늘리기" ${!canAct() || unresolvedIntent || quantity >= maxQuantity ? "disabled" : ""}>+</button>
        </div>
        <button class="kitchen-v2-max" type="button" data-kitchen-quantity-max ${!canAct() || unresolvedIntent || !available ? "disabled" : ""}>최대</button>
      </div>
      <p class="kitchen-v2-quantity-note">${retryingCook ? `이전에 요청한 ${quantity}개 요리의 결과를 확인해` : available ? `최대 ${maxQuantity}개${available > MAX_BATCH ? " · 한 번에 50개까지" : ""}` : "재료가 부족해. 필요한 작물을 수확해봐."}</p>
      <button class="kitchen-v2-cook" id="kitchenCookSelected" type="button" ${!canAct() || (unresolvedIntent && !retryingCook) || (!retryingCook && !available) ? "disabled" : ""} aria-busy="${pendingAction === "cook"}">${pendingAction === "cook" ? "요리 만드는 중…" : retryingCook ? "이전 요리 결과 확인" : `${quantity}개 만들기`}</button>
      <p class="kitchen-v2-cook-note">${retryingCook ? "이전 요리의 저장 결과를 확인해" : "재료는 자동으로 사용돼"}</p>`;
  }

  function render() {
    if (!modal) return;
    restoreIntent();
    const focused = document.activeElement;
    const focusId = modal.contains(focused) ? focused.id : "";
    const focusRecipeId = focused?.dataset?.kitchenRecipe;
    const focusStep = focused?.dataset?.kitchenQuantityStep;
    const models = Object.keys(RECIPES).map((recipeId) => recipeModel(recipeId));
    models.sort((a, b) => Number(b.available > 0) - Number(a.available > 0));
    if (!RECIPES[selectedRecipeId]) selectedRecipeId = models.find((model) => model.available > 0)?.recipeId || models[0]?.recipeId || null;
    const matching = models.filter(({ recipe, available }) => (showAllRecipes || available > 0) && recipe.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    document.getElementById("kitchenMoneyBalance").textContent = money(state.farmMoney);
    document.getElementById("kitchenRecipeCount").textContent = `${models.filter(({ available }) => available > 0).length}종 만들 수 있어`;
    const toggle = document.getElementById("kitchenShowAllRecipes");
    toggle.setAttribute("aria-pressed", String(showAllRecipes));
    toggle.textContent = showAllRecipes ? "만들 수 있는 요리" : "전체 레시피";
    document.getElementById("kitchenRecipeCards").innerHTML = matching.length ? matching.map(({ recipeId, recipe, available }) => `
      <button class="kitchen-v2-recipe-card ${recipeId === selectedRecipeId ? "is-selected" : ""} ${available ? "" : "is-unavailable"}" type="button" data-kitchen-recipe="${recipeId}" aria-pressed="${recipeId === selectedRecipeId}" ${pendingAction || unresolvedIntent ? "disabled" : ""}>
        <span class="kitchen-v2-food-art">${foodArt(recipeId)}</span>
        <strong>${escapeHtml(recipe.name)}</strong>
        <small>${available ? `최대 ${available}개` : "재료 부족"}</small>
        <span class="kitchen-v2-card-price">${money(recipe.sellPrice)} <span>Farm Money</span></span>
      </button>`).join("") : `<div class="kitchen-v2-list-empty"><p>${search ? "검색한 요리가 없어." : "아직 만들 수 있는 요리가 없어."}</p><span>${search ? "다른 이름으로 찾아봐." : "전체 레시피에서 필요한 작물을 확인해봐."}</span></div>`;
    renderSelected(recipeModel(selectedRecipeId));
    const sale = saleModel();
    document.getElementById("kitchenFinishedFoods").innerHTML = sale.foods.length ? sale.foods.map(({ recipeId, recipe, count }) => `
      <div class="kitchen-v2-finished-food">${foodArt(recipeId)}<span><strong>${escapeHtml(recipe.name)}</strong><small>${count}개</small></span></div>`).join("") : '<p class="kitchen-v2-shelf-empty">완성한 음식이 이곳에 모여. 첫 요리를 만들어봐!</p>';
    const sell = document.getElementById("kitchenSellAllFood");
    sell.disabled = !canAct() || (unresolvedIntent && unresolvedIntent.kind !== "sell") || (!sale.count && unresolvedIntent?.kind !== "sell");
    sell.setAttribute("aria-busy", String(pendingAction === "sell"));
    sell.textContent = pendingAction === "sell" ? "판매 중…" : unresolvedIntent?.kind === "sell" ? "이전 판매 결과 확인" : `모두 판매${sale.count ? ` · ${sale.count}개` : ""}`;
    document.getElementById("kitchenSellTotal").textContent = sale.count ? `기본 판매가 합계 ${money(sale.amount)} Farm Money` : "";
    const harvest = Object.entries(CROPS).filter(([cropId]) => countOf(state.harvestInventory[cropId]) > 0);
    document.getElementById("kitchenIngredientTotal").textContent = `${harvest.reduce((total, [cropId]) => total + countOf(state.harvestInventory[cropId]), 0)}개`;
    document.getElementById("kitchenHarvestIngredients").innerHTML = harvest.length ? harvest.map(([cropId, crop]) => `
      <div class="kitchen-v2-pantry-item">${cropArt(cropId)}<span>${escapeHtml(crop.name)}</span><strong>${countOf(state.harvestInventory[cropId])}개</strong></div>`).join("") : '<p class="kitchen-v2-shelf-empty">수확한 작물이 아직 없어. 농장에서 작물을 키워봐.</p>';
    document.getElementById("kitchenActionStatus").textContent = !activeAuthUser || !farmDataHydrated ? "농장 데이터를 불러오는 중이야." : unresolvedIntent && !pendingAction ? "저장 결과를 확인하지 못했어. 이전 결과를 확인한 뒤 계속 만들어줘." : feedback;
    // Inventory reconciliation redraws the details; keep keyboard users on their control.
    if (focusId && focused !== document.getElementById(focusId)) document.getElementById(focusId)?.focus({ preventScroll: true });
    else if (focusRecipeId) modal.querySelector(`[data-kitchen-recipe="${focusRecipeId}"]`)?.focus({ preventScroll: true });
    else if (focusStep) modal.querySelector(`[data-kitchen-quantity-step="${focusStep}"]`)?.focus({ preventScroll: true });
  }

  async function cook() {
    if (!canAct()) return;
    if (unresolvedIntent && unresolvedIntent.kind !== "cook") return;
    const retry = unresolvedIntent?.kind === "cook";
    const model = recipeModel(selectedRecipeId);
    if (!model || (!retry && !model.available)) return;
    const userId = activeAuthUser.id;
    const actionGeneration = generation;
    const amount = retry ? unresolvedIntent.quantity : clampQuantity(quantity, model.maxQuantity);
    const intent = unresolvedIntent || { userId, kind: "cook", requestId: createUuid(), recipeId: model.recipeId, quantity: amount };
    let knownFailure = false;
    saveIntent(intent);
    const previousHarvest = Object.fromEntries(model.ingredients.map(({ cropId }) => [cropId, state.harvestInventory[cropId] || 0]));
    const previousFood = state.foodInventory[model.recipeId] || 0;
    pendingAction = "cook";
    feedback = "";
    render();
    try {
      const result = await runFarmAction({
        rpc: "cook_my_farm_recipe",
        params: { p_recipe_id: intent.recipeId, p_quantity: intent.quantity },
        requestId: intent.requestId,
        skipReconciliation: retry,
        onError: (error) => { if (actionGeneration === generation) knownFailure = isKnownFailure(error); },
        apply: () => {
          if (retry || actionGeneration !== generation) return;
          model.ingredients.forEach(({ cropId, amount: needed }) => { state.harvestInventory[cropId] = previousHarvest[cropId] - needed * amount; });
          state.foodInventory[model.recipeId] = previousFood + amount;
        },
        revert: () => {
          if (retry || actionGeneration !== generation) return;
          Object.entries(previousHarvest).forEach(([cropId, count]) => { state.harvestInventory[cropId] = count; });
          state.foodInventory[model.recipeId] = previousFood;
        },
        failureMessage: "요리 저장에 실패해서 재료를 되돌렸어. 다시 시도해줘.",
      });
      if (activeAuthUser?.id !== userId || actionGeneration !== generation) return;
      if (result) {
        if (retry && !await refreshRecoveredState(activeAuthUser, actionGeneration)) return;
        saveIntent(null);
        feedback = `${model.recipe.name} ${result.event?.foodAmount ?? amount}개를 만들었어!`;
        showToast(feedback + (typeof farmBonusMessage === "function" ? farmBonusMessage(result.event) : ""));
      } else if (knownFailure) {
        saveIntent(null);
        feedback = "요리를 저장하지 못했어. 재료는 그대로 있어.";
      }
    } finally {
      if (actionGeneration === generation) {
        pendingAction = null;
        render();
      }
    }
  }

  async function sellAll() {
    if (!canAct()) return;
    if (unresolvedIntent && unresolvedIntent.kind !== "sell") return;
    const retry = unresolvedIntent?.kind === "sell";
    const sale = saleModel();
    if (!retry && !sale.count) return;
    const userId = activeAuthUser.id;
    const actionGeneration = generation;
    const intent = unresolvedIntent || { userId, kind: "sell", requestId: createUuid() };
    let knownFailure = false;
    saveIntent(intent);
    const previousMoney = state.farmMoney;
    const previousWeeklyMoney = state.weeklyFarmMoneyEarned;
    pendingAction = "sell";
    feedback = "";
    render();
    try {
      const result = await runFarmAction({
        rpc: "sell_all_my_farm_food",
        params: {},
        requestId: intent.requestId,
        skipReconciliation: retry,
        onError: (error) => { if (actionGeneration === generation) knownFailure = isKnownFailure(error); },
        apply: () => {
          if (retry || actionGeneration !== generation) return;
          sale.foods.forEach(({ recipeId }) => { state.foodInventory[recipeId] = 0; });
          state.farmMoney = previousMoney + sale.amount;
          state.weeklyFarmMoneyEarned = (previousWeeklyMoney || 0) + sale.amount;
        },
        revert: () => {
          if (retry || actionGeneration !== generation) return;
          sale.foods.forEach(({ recipeId, count }) => { state.foodInventory[recipeId] = count; });
          state.farmMoney = previousMoney;
          state.weeklyFarmMoneyEarned = previousWeeklyMoney;
        },
        failureMessage: "음식 판매 저장에 실패해서 되돌렸어. 다시 시도해줘.",
      });
      if (activeAuthUser?.id !== userId || actionGeneration !== generation) return;
      if (result) {
        if (retry && !await refreshRecoveredState(activeAuthUser, actionGeneration)) return;
        saveIntent(null);
        feedback = `음식 ${result.event?.soldCount ?? sale.count}개를 팔고 ${money(result.event?.saleAmount ?? sale.amount)} Farm Money를 받았어!`;
        showToast(feedback + (typeof farmBonusMessage === "function" ? farmBonusMessage(result.event) : ""));
      } else if (knownFailure) {
        saveIntent(null);
        feedback = "음식을 판매하지 못했어. 완성된 음식은 그대로 있어.";
      }
    } finally {
      if (actionGeneration === generation) {
        pendingAction = null;
        render();
      }
    }
  }

  function reset() {
    generation += 1;
    selectedRecipeId = null;
    quantity = 1;
    showAllRecipes = false;
    search = "";
    pendingAction = null;
    unresolvedIntent = null;
    intentUserId = null;
    feedback = "";
    returnFocus = null;
    // Pending requests remain in the old account's outbox for later recovery.
    if (modal) {
      modal.classList.add("hidden");
      document.getElementById("kitchenRecipeSearch").value = "";
      render();
    }
  }

  function open() {
    if (!modal) return;
    if (modal.classList.contains("hidden") || !modal.contains(document.activeElement)) returnFocus = document.activeElement;
    modal.classList.remove("hidden");
    render();
    modal.querySelector("button[data-close-kitchen]")?.focus({ preventScroll: true });
  }

  function close() {
    if (!modal) return;
    modal.classList.add("hidden");
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }

  window.FarmKitchen = { render, open, close, reset, recipeModel, saleModel, clampQuantity };
  if (!modal) return;
  modal.addEventListener("click", (event) => {
    const recipe = event.target.closest("[data-kitchen-recipe]");
    if (recipe && !pendingAction && !unresolvedIntent) { selectedRecipeId = recipe.dataset.kitchenRecipe; quantity = 1; feedback = ""; render(); return; }
    if (event.target.closest("#kitchenShowAllRecipes")) { showAllRecipes = !showAllRecipes; render(); return; }
    if (event.target.closest("[data-close-kitchen]")) { close(); return; }
    const step = event.target.closest("[data-kitchen-quantity-step]");
    const max = event.target.closest("[data-kitchen-quantity-max]");
    if ((step || max) && !pendingAction && !unresolvedIntent) {
      const model = recipeModel(selectedRecipeId);
      quantity = max ? model.maxQuantity : clampQuantity(quantity + Number(step.dataset.kitchenQuantityStep), model.maxQuantity);
      render();
      return;
    }
    if (event.target.closest("#kitchenCookSelected")) void cook();
    if (event.target.closest("#kitchenSellAllFood")) void sellAll();
  });
  document.getElementById("kitchenRecipeSearch").addEventListener("input", (event) => { search = event.target.value.trim(); render(); });
  modal.addEventListener("change", (event) => {
    if (event.target.id !== "kitchenCookQuantity" || pendingAction || unresolvedIntent) return;
    quantity = clampQuantity(event.target.value, recipeModel(selectedRecipeId)?.maxQuantity || 0);
    render();
  });
  document.getElementById("openFarmKitchen")?.addEventListener("click", open);
  new MutationObserver(() => { if (!modal.classList.contains("hidden")) render(); }).observe(modal, { attributes: true, attributeFilter: ["class"] });
  render();
})();
