(() => {
  let plotId = null;
  let busy = false;
  let query = "";
  let request = null;
  let generation = 0;
  const modal = document.querySelector("#gardenSeedModal");
  if (!modal) return;
  const choices = modal.querySelector("#gardenSeedChoices");
  function render() {
    const wallet = modal.querySelector("#gardenSeedCoinBalance");
    wallet.textContent = `${state.coins.toLocaleString()} Coin`;
    const entries = Object.entries(CROPS).filter(([, crop]) => crop.name.includes(query.trim()));
    choices.innerHTML = entries.map(([id, crop]) => {
      const owned = Math.max(0, Number(state.seedInventory[id]) || 0);
      const harvest = Math.max(0, Number(state.harvestInventory?.[id]) || 0);
      const canPlant = farmDataHydrated && activeAuthUser && (owned > 0 || state.coins >= crop.seedPrice);
      return `<article class="garden-seed-card"><span class="garden-seed-art">${window.FarmGardenArt?.crop(id) || cropPixel(id)}</span><strong>${escapeHtml(crop.name)}</strong><small>수확까지 돌보기 ${getCropGrowthCost(id)}단계</small><small>보유 수확물 ${harvest.toLocaleString()}개</small>${owned ? `<small>보유 씨앗 ${owned}개</small>` : ""}<button type="button" data-garden-plant="${id}" ${busy || !canPlant ? "disabled" : ""}>${owned ? "보유 씨앗으로 심기" : `${crop.seedPrice} Coin으로 심기`}</button></article>`;
    }).join("") || '<p class="garden-seed-empty">찾는 작물이 없어요.</p>';
  }
  function open(id) {
    const plot = state.farmPlots.find(entry => entry.id === id);
    if (!plot || plot.crop) return;
    plotId = id;
    query = "";
    modal.querySelector("#gardenSeedSearch").value = "";
    modal.querySelector("#gardenSeedTitle").textContent = `${state.farmPlots.indexOf(plot) + 1}번 밭에 심을 작물`;
    modal.classList.remove("hidden");
    render();
    modal.querySelector("#gardenSeedSearch").focus({preventScroll:true});
  }
  function close() {
    if (busy) return;
    modal.classList.add("hidden");
    document.querySelector(`#farmGrid [data-plant-plot="${plotId}"]`)?.focus({preventScroll:true});
    plotId = null;
  }
  async function plant(cropId) {
    if (busy || !activeAuthUser || !farmDataHydrated) return;
    const plot = state.farmPlots.find(entry => entry.id === plotId);
    const crop = CROPS[cropId];
    if (!plot || plot.crop || !crop) return;
    const owned = state.seedInventory[cropId] > 0;
    if (!owned && state.coins < crop.seedPrice) return;
    busy = true;
    render();
    const userId = activeAuthUser.id;
    const currentGeneration = generation;
    const stillCurrent = () => generation === currentGeneration && activeAuthUser?.id === userId;
    const retrying = request?.userId === userId && request.plotId === plot.id && request.cropId === cropId;
    // A response can be lost after committing. Keep its request identity for
    // a retry instead of buying or planting twice with a new request ID.
    if (!request || request.userId !== userId || request.plotId !== plot.id || request.cropId !== cropId) {
      request = { userId, plotId: plot.id, cropId, id: createUuid() };
    }
    const intent = request;
    let succeeded = false;
    const operation = farmActionChain.then(async () => {
      if (!stillCurrent()) throw new Error("FARM_ACCOUNT_CHANGED");
      let response = await supabaseClient.rpc("buy_and_plant_farm_seed", {p_plot_index:intent.plotId,p_crop_id:intent.cropId,p_request_id:intent.id});
      if (["42883","PGRST202"].includes(response.error?.code) && owned) {
        if (!stillCurrent()) throw new Error("FARM_ACCOUNT_CHANGED");
        response = await supabaseClient.rpc("plant_farm_seed", {p_plot_index:intent.plotId,p_crop_id:intent.cropId,p_request_id:intent.id});
      }
      if (response.error) throw response.error;
      return response.data;
    });
    farmActionChain = operation.catch(() => {});
    try {
      const result = await operation;
      if (!stillCurrent()) return;
      request = null;
      succeeded = true;
      if (retrying && typeof loadFarmDataFromDatabase === "function") {
        const user = activeAuthUser;
        await loadFarmDataFromDatabase(user);
        if (!stillCurrent()) return;
        if (typeof loadFarmWallet === "function") await loadFarmWallet(user);
        if (!stillCurrent()) return;
      } else applyFarmActionResult(result);
      showToast(retrying ? "이전 심기 저장을 확인했어" : `${crop.name}을 심었어`);
      renderFarm();
      renderSummary();
    } catch (error) {
      if (!stillCurrent()) return;
      const code = farmActionErrorSentinel(error);
      if (["42883","PGRST202"].includes(error?.code)) showToast("밭에서 씨앗 구매를 준비하고 있어. 잠시 후 다시 시도해줘");
      else showToast(FARM_ACTION_ERROR_MESSAGES[code] || "심기를 저장하지 못했어. 다시 눌러줘");
      if (code || ["42883","PGRST202"].includes(error?.code)) request = null;
    } finally {
      if (stillCurrent()) {
        busy = false;
        if (succeeded) close();
        else render();
      }
    }
  }
  modal.addEventListener("click", event => {
    if (event.target.closest("[data-close-garden-seed]")) close();
    const button = event.target.closest("[data-garden-plant]");
    if (button && !button.disabled) void plant(button.dataset.gardenPlant);
  });
  modal.addEventListener("keydown", event => {if(event.key === "Escape") close();});
  modal.querySelector("#gardenSeedSearch").addEventListener("input", event => {query=event.target.value;render();});
  window.FarmSeeds = {open,close,render,reset(){generation++;busy=false;request=null;plotId=null;modal.classList.add("hidden");}};
})();
