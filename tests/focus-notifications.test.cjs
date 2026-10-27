const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));

function setup(options = {}) {
  const effects = { readyReads: 0, subscriptionReads: 0, notifications: [], warnings: [], banners: [], cancellations: [] };
  const failure = new Error("notification unavailable");
  const registration = {
    pushManager: {
      async getSubscription() {
        effects.subscriptionReads++;
        if (options.failure === "subscription") throw failure;
        return options.subscription === null ? null : { endpoint: "https://push.example/device" };
      },
    },
    async showNotification(title, notificationOptions) {
      if (options.failure === "show") throw failure;
      effects.notifications.push({ title, options: plain(notificationOptions) });
    },
  };
  const serviceWorker = {
    get ready() {
      effects.readyReads++;
      return options.failure === "ready" ? Promise.reject(failure) : Promise.resolve(registration);
    },
  };
  const ctx = vm.createContext({
    console: { warn: (...args) => effects.warnings.push(args) },
    ...(options.notificationMissing ? {} : { Notification: { permission: options.permission ?? "granted" } }),
    navigator: options.serviceWorkerMissing ? {} : { serviceWorker },
    window: options.pushManagerMissing ? {} : { PushManager: function PushManager() {} },
    showFocusAlertBanner: (title, subtitle) => effects.banners.push({ title, subtitle }),
    cancelFarmPushNotification: (kind, subjectKey) => effects.cancellations.push({ kind, subjectKey }),
  });
  for (const name of ["isFarmPushSupported", "showFocusSystemNotification", "notifyFocusPhaseComplete"]) {
    const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?^\\}`, "m"));
    assert.ok(match, name);
    vm.runInContext(match[0], ctx);
  }
  return { ctx, effects };
}

test("focus completion shows a native popup on the subscribed device with a focus-page destination", async () => {
  const { ctx, effects } = setup();
  await ctx.showFocusSystemNotification("습관 목표 시간을 채웠어", "오늘 목표를 달성했어");
  assert.equal(effects.subscriptionReads, 1);
  assert.deepEqual(effects.notifications, [{
    title: "습관 목표 시간을 채웠어",
    options: {
      body: "오늘 목표를 달성했어",
      icon: "./assets/icons/pixel-clock-192.png?v=268",
      tag: "farmodoro-timer-end",
      data: { url: "./#focus" },
    },
  }]);
  assert.equal(effects.warnings.length, 0);
});

test("disabling device notifications prevents a native focus popup despite granted browser permission", async () => {
  const { ctx, effects } = setup({ subscription: null });
  await ctx.showFocusSystemNotification("집중 시간이 끝났어", "쉬어도 좋아");
  assert.equal(effects.subscriptionReads, 1);
  assert.equal(effects.notifications.length, 0);
  assert.equal(effects.warnings.length, 0);
});

for (const [description, options] of [
  ["denied permission", { permission: "denied" }],
  ["permission not yet granted", { permission: "default" }],
  ["missing Notification API", { notificationMissing: true }],
  ["missing service worker support", { serviceWorkerMissing: true }],
  ["missing push support", { pushManagerMissing: true }],
]) {
  test(`focus popup safely skips ${description} without accessing device registration`, async () => {
    const { ctx, effects } = setup(options);
    await ctx.showFocusSystemNotification("집중 시간이 끝났어", "쉬어도 좋아");
    assert.equal(effects.readyReads, 0);
    assert.equal(effects.subscriptionReads, 0);
    assert.equal(effects.notifications.length, 0);
    assert.equal(effects.warnings.length, 0);
  });
}

for (const failure of ["ready", "subscription", "show"]) {
  test(`a ${failure} failure does not reject focus completion`, async () => {
    const { ctx, effects } = setup({ failure });
    await assert.doesNotReject(ctx.showFocusSystemNotification("집중 시간이 끝났어", "쉬어도 좋아"));
    assert.equal(effects.notifications.length, 0);
    assert.equal(effects.warnings.length, 1);
  });
}

for (const [kind, title, subtitle] of [
  ["habit", "습관 목표 시간을 채웠어", "오늘 정한 시간만큼 집중했어. 잠깐 쉬어도 좋아."],
  ["focus", "집중 시간이 끝났어", "정한 시간만큼 집중했어. 더 하려면 새로 시작해줘."],
]) {
  test(`${kind} completion preserves its in-app banner and cancels the pending push while showing a native popup`, async () => {
    const { ctx, effects } = setup();
    assert.equal(ctx.notifyFocusPhaseComplete(kind), undefined);
    assert.deepEqual(effects.cancellations, [{ kind: "timer_end", subjectKey: "" }]);
    assert.deepEqual(effects.banners, [{ title, subtitle }]);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(effects.notifications.length, 1);
    assert.equal(effects.notifications[0].title, title);
    assert.equal(effects.notifications[0].options.body, subtitle);
  });
}

test("a failed native popup leaves the completion banner and scheduled-push cancellation intact", async () => {
  const { ctx, effects } = setup({ failure: "show" });
  ctx.notifyFocusPhaseComplete("habit");
  assert.equal(effects.banners.length, 1);
  assert.deepEqual(effects.cancellations, [{ kind: "timer_end", subjectKey: "" }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(effects.notifications.length, 0);
  assert.equal(effects.warnings.length, 1);
});
