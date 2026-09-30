const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

function setup(rpc) {
  const list = { innerHTML: "" };
  const ctx = vm.createContext({
    console: { warn() {} }, activeAuthUser: { id: "me" },
    supabaseClient: { rpc }, farmLeaderboard: [], farmLeaderboardStatus: "idle",
    selectedMailFriendCode: "FARM-AAAA-1111",
    document: { querySelector: () => list },
  });
  for (const name of ["escapeHtml", "loadFarmLeaderboard", "renderFarmMailRanking"]) {
    const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?^\\}`, "m"));
    assert.ok(match, name);
    vm.runInContext(match[0], ctx);
  }
  return { ctx, list };
}

test("mailbox loads ranked recipients, excludes self and safely displays selectable farm codes", async () => {
  const { ctx, list } = setup(async (name) => {
    assert.equal(name, "get_farm_leaderboard");
    return { data: [
      { rank_position: 1, farm_code: "FARM-0000-0000", is_me: true },
      { rank_position: 2, farm_code: "farm-aaaa-1111", farm_name: '<img src=x onerror="bad()">', display_name: "친구" },
      { rank_position: 3, farm_name: "코드 없는 농장" },
    ] };
  });
  await ctx.loadFarmLeaderboard();
  assert.equal(ctx.farmLeaderboardStatus, "ready");
  assert.match(list.innerHTML, /2위 · &lt;img/);
  assert.doesNotMatch(list.innerHTML, /<img|FARM-0000-0000/);
  assert.match(list.innerHTML, /data-mail-friend-code="FARM-AAAA-1111"/);
  assert.match(list.innerHTML, /aria-pressed="true"/);
  assert.match(list.innerHTML, /disabled.*aria-pressed="false"/);
});

test("mailbox can retry a failed ranking request", async () => {
  let attempts = 0;
  const { ctx, list } = setup(async () => {
    if (++attempts === 1) throw new Error("offline");
    return { data: [] };
  });
  await ctx.loadFarmLeaderboard();
  assert.equal(ctx.farmLeaderboardStatus, "error");
  assert.match(list.innerHTML, /data-retry-mail-ranking/);
  await ctx.loadFarmLeaderboard();
  assert.equal(ctx.farmLeaderboardStatus, "ready");
  assert.match(list.innerHTML, /아직 우편을 보낼 랭킹 농장이 없어/);
});

test("ranking responses from a previous account are ignored", async () => {
  let resolve;
  const { ctx } = setup(() => new Promise(done => { resolve = done; }));
  const pending = ctx.loadFarmLeaderboard();
  ctx.activeAuthUser = { id: "another-user" };
  ctx.farmLeaderboardStatus = "idle";
  resolve({ data: [{ farm_code: "FARM-AAAA-1111" }] });
  await pending;
  assert.equal(ctx.farmLeaderboard.length, 0);
  assert.equal(ctx.farmLeaderboardStatus, "idle");
});

test("sending mail uses the selected leaderboard code and existing gift rules", async () => {
  let send;
  let request;
  const item = { id: "carrot", name: "당근", count: 3, inventory: { carrot: 3 } };
  const noop = () => {};
  const ctx = vm.createContext({
    document: { querySelector: () => ({ addEventListener: (_event, handler) => { send = handler; } }) },
    ensureDailyFarmMail: noop, state: { farmMailSentCount: 0, farmMailHistory: [] },
    selectedMailFriendCode: "FARM-AAAA-1111", selectedMailItemId: "carrot",
    selectedMailCategory: "harvest", selectedMailQuantity: 2,
    selectedMailPrice: "", selectedMailMessage: "안녕", farmMailContacts: [],
    FARM_MAIL_MAX_QUANTITY: 5, FARM_MAIL_MAX_PRICE_COINS: 200,
    getFarmMailItems: () => [item], showToast: noop, render: noop, launchFarmMailDispatch: noop,
    notifyFarmMailSent: noop,
    supabaseClient: { rpc: async (name, args) => {
      request = { name, ...args };
      return { data: null, error: null };
    } },
  });
  const start = source.indexOf('document.querySelector("#sendFarmMail").addEventListener');
  const end = source.indexOf('\n});', start) + 4;
  vm.runInContext(source.slice(start, end), ctx);
  await send();
  assert.equal(request.name, "send_farm_mail");
  assert.equal(request.p_recipient_farm_code, "FARM-AAAA-1111");
  assert.equal(request.p_quantity, 2);
  assert.equal(request.p_message, "안녕");
  assert.equal(item.inventory.carrot, 1);
  assert.equal(ctx.state.farmMailSentCount, 1);
});
