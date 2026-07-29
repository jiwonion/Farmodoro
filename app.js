const STORAGE_KEY = "farmodoro-dashboard-v1";

const CROPS = {
  carrot: {
    name: "당근",
    emoji: "🥕",
    seedPrice: 1,
    sellPrice: 5,
    stages: ["•", "🌱", "🌿", "🥕"],
  },
  tomato: {
    name: "토마토",
    emoji: "🍅",
    seedPrice: 2,
    sellPrice: 9,
    stages: ["•", "🌱", "🌿", "🌼", "🍅"],
  },
  corn: {
    name: "옥수수",
    emoji: "🌽",
    seedPrice: 3,
    sellPrice: 12,
    stages: ["•", "🌱", "🌿", "🌾", "🌽"],
  },
};

const DECORATIONS = {
  flower: { name: "꽃", emoji: "🌷", price: 8 },
  fence: { name: "울타리", emoji: "🪵", price: 12 },
  stone: { name: "돌", emoji: "🪨", price: 10 },
  tree: { name: "나무", emoji: "🌳", price: 25 },
  bench: { name: "벤치", emoji: "🪑", price: 20 },
  well: { name: "우물", emoji: "⛲", price: 35 },
};

const DECORATION_SLOTS = Array.from({ length: 144 }, (_, index) => ({
  row: Math.floor(index / 12) + 1,
  column: (index % 12) + 1,
})).filter(
  ({ row, column }) =>
    !(row >= 3 && row <= 10 && column >= 3 && column <= 10),
);

const defaultState = {
  schemaVersion: 4,
  coins: 999,
  farmMoney: 999,
  focusRewardSeconds: 0,
  settings: {
    focusMinutes: 25,
    breakEnabled: true,
    breakMinutes: 5,
  },
  seedInventory: {
    carrot: 0,
    tomato: 0,
    corn: 0,
  },
  harvestInventory: {
    carrot: 0,
    tomato: 0,
    corn: 0,
  },
  decorationInventory: Object.fromEntries(
    Object.keys(DECORATIONS).map((decorationId) => [decorationId, 0]),
  ),
  farmDecorations: Array.from({ length: DECORATION_SLOTS.length }, (_, index) => ({
    id: index,
    decoration: null,
    rotation: 0,
  })),
  farmPlots: Array.from({ length: 16 }, (_, index) => ({
    id: index,
    crop: null,
    growth: 0,
  })),
  groups: [
    { id: "work", name: "업무" },
    { id: "study", name: "공부" },
    { id: "life", name: "생활" },
  ],
  tasks: [
    { id: 1, title: "Farmodoro 메인 화면 정리", status: "doing", focusSeconds: 0, groupId: "work", archived: false },
    { id: 2, title: "책 20페이지 읽기", status: "waiting", focusSeconds: 0, groupId: "study", archived: false },
    { id: 3, title: "장보기 목록 확인", status: "waiting", focusSeconds: 0, groupId: "life", archived: false },
    { id: 4, title: "프로젝트 요구사항 작성", status: "done", focusSeconds: 0, groupId: "work", archived: false },
  ],
  habits: [
    { id: 11, title: "물 2L 마시기", streak: 8, complete: true, focusSeconds: 0, measureType: "amount", targetValue: 2, unit: "L", weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: "", endDate: "" },
    { id: 12, title: "30분 운동", streak: 4, complete: false, focusSeconds: 0, measureType: "time", targetValue: 30, unit: "분", weekdays: [1, 2, 3, 4, 5], startDate: "", endDate: "" },
    { id: 13, title: "영양제 챙기기", streak: 12, complete: true, focusSeconds: 0, measureType: "count", targetValue: 1, unit: "회", weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: "", endDate: "" },
  ],
};

let state = loadState();
state.habits = state.habits.map((habit) => ({
  ...habit,
  completedDate: habit.completedDate ?? (habit.complete ? toLocalDateString() : ""),
  completionDates:
    habit.completionDates ??
    (habit.completedDate
      ? [habit.completedDate]
      : habit.complete
        ? [toLocalDateString()]
        : []),
}));
let toastTimer;
let focusInterval;
let focusSeconds = state.settings.focusMinutes * 60;
let focusRunning = false;
let focusMode = "linked";
let timerPhase = "focus";
let activeFocus = null;
let currentPage = "today";
let taskGroupFilter = "all";
let taskArchiveView = false;
let habitCalendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedSeed = null;
let selectedDecoration = null;
let decorationMode = false;

const taskForm = document.querySelector("#taskForm");
const taskInput = document.querySelector("#taskInput");
const taskGroup = document.querySelector("#taskGroup");
const groupManager = document.querySelector("#groupManager");
const groupInput = document.querySelector("#groupInput");
const habitForm = document.querySelector("#habitForm");
const habitInput = document.querySelector("#habitInput");
const habitMeasureType = document.querySelector("#habitMeasureType");
const habitTargetValue = document.querySelector("#habitTargetValue");
const habitUnit = document.querySelector("#habitUnit");
const habitStartDate = document.querySelector("#habitStartDate");
const habitEndDate = document.querySelector("#habitEndDate");
const toast = document.querySelector("#toast");

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return structuredClone(defaultState);
    const migratedCoins = (saved.schemaVersion ?? 1) < 4 ? 999 : saved.coins;
    const migratedFarmMoney =
      (saved.schemaVersion ?? 1) < 4 ? 999 : (saved.farmMoney ?? 0);
    const decorationInventory = {
      ...structuredClone(defaultState.decorationInventory),
      ...(saved.decorationInventory ?? {}),
    };
    const savedDecorations = Array.isArray(saved.farmDecorations)
      ? saved.farmDecorations
      : [];
    savedDecorations.slice(DECORATION_SLOTS.length).forEach((cell) => {
      if (cell?.decoration && decorationInventory[cell.decoration] !== undefined) {
        decorationInventory[cell.decoration] += 1;
      }
    });
    return {
      ...structuredClone(defaultState),
      ...saved,
      schemaVersion: 4,
      coins: migratedCoins,
      farmMoney: migratedFarmMoney,
      settings: {
        ...structuredClone(defaultState.settings),
        ...(saved.settings ?? {}),
      },
      seedInventory: {
        ...structuredClone(defaultState.seedInventory),
        ...(saved.seedInventory ?? {}),
      },
      harvestInventory: {
        ...structuredClone(defaultState.harvestInventory),
        ...(saved.harvestInventory ?? {}),
      },
      decorationInventory,
      farmDecorations: savedDecorations.length
        ? structuredClone(defaultState.farmDecorations).map((cell, index) => ({
            ...cell,
            decoration: savedDecorations[index]?.decoration ?? null,
            rotation: savedDecorations[index]?.rotation ?? 0,
          }))
        : structuredClone(defaultState.farmDecorations),
      farmPlots:
        Array.isArray(saved.farmPlots) && saved.farmPlots.length === 16
          ? saved.farmPlots
          : structuredClone(defaultState.farmPlots),
      groups: saved.groups ?? structuredClone(defaultState.groups),
      tasks: (saved.tasks ?? []).map((task) => ({
        ...task,
        groupId: task.groupId ?? null,
        focusSeconds: task.focusSeconds ?? 0,
        archived: task.archived ?? false,
        archivedAt: task.archivedAt ?? "",
      })),
      habits: (saved.habits ?? []).map((habit) => ({
        ...habit,
        focusSeconds: habit.focusSeconds ?? 0,
        measureType: habit.measureType ?? "count",
        targetValue: habit.targetValue ?? 1,
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

  document.querySelector("#groupList").innerHTML = state.groups
    .map(
      (group) => `
        <span class="group-chip">
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
  if (!filters || !archiveButton) return;

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
          ${archiveActive ? "disabled" : ""}
        >${escapeHtml(option.name)}</button>
      `,
    )
    .join("");

  archiveButton.classList.toggle("active", archiveActive);
  archiveButton.textContent = archiveActive ? "← 할 일로 돌아가기" : "보관함";
  document.querySelector("#taskBoard").classList.toggle("archive-view", archiveActive);
  document.querySelector('[data-status="done"] h3').textContent =
    archiveActive ? "보관된 할 일" : "완료";
}

function getVisibleTasks(status) {
  return state.tasks.filter((task) => {
    if (task.status !== status) return false;

    if (currentPage === "tasks") {
      if (taskArchiveView) return task.archived;
      if (task.archived) return false;
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
        return `
          <article
            class="task-card ${status === "done" ? "done" : ""} ${task.archived ? "archived" : ""}"
            draggable="${task.archived ? "false" : "true"}"
            data-task-id="${task.id}"
          >
            <div class="task-top">
              <h4>${escapeHtml(task.title)}</h4>
            </div>
            <div class="task-meta">
              ${group ? `<span class="task-category">${escapeHtml(group.name)}</span>` : ""}
              ${
                task.archived
                  ? '<span class="task-archived-label">보관됨</span>'
                  : `
                    <button
                      class="task-focus-pill"
                      type="button"
                      data-focus-task="${task.id}"
                      aria-label="${escapeHtml(task.title)} 집중 시작"
                    >
                      ◷ 집중 ${formatFocusTime(task.focusSeconds)}
                    </button>
                  `
              }
            </div>
            ${
              currentPage === "tasks" && status === "done"
                ? `
                  <button
                    class="task-archive-button"
                    type="button"
                    ${task.archived ? `data-restore-task="${task.id}"` : `data-archive-task="${task.id}"`}
                  >${task.archived ? "↩ 보관 해제" : "▣ 보관하기"}</button>
                `
                : ""
            }
            <div class="task-actions">
              <button class="delete-button" type="button" data-delete-task="${task.id}" aria-label="삭제">×</button>
            </div>
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

function isHabitScheduledOn(habit, date) {
  const dateString = toLocalDateString(date);
  const weekday = date.getDay() === 0 ? 7 : date.getDay();
  const inDateRange =
    (!habit.startDate || habit.startDate <= dateString) &&
    (!habit.endDate || habit.endDate >= dateString);
  return inDateRange && habit.weekdays.includes(weekday);
}

function isHabitScheduledToday(habit) {
  return isHabitScheduledOn(habit, new Date());
}

function isHabitCompleteToday(habit) {
  return habit.completionDates.includes(toLocalDateString());
}

function formatHabitSchedule(habit) {
  const labels = ["월", "화", "수", "목", "금", "토", "일"];
  const weekdays =
    habit.weekdays.length === 7
      ? "매일"
      : habit.weekdays.map((day) => labels[day - 1]).join("·");
  const dateRange =
    habit.startDate || habit.endDate
      ? `${habit.startDate || "시작 제한 없음"} ~ ${habit.endDate || "계속"}`
      : "기간 제한 없음";
  return `${weekdays} · ${dateRange}`;
}

function renderHabits() {
  const habitList = document.querySelector("#habitList");

  habitList.innerHTML = state.habits
    .map((habit) => {
      const scheduledToday = isHabitScheduledToday(habit);
      const completeToday = isHabitCompleteToday(habit);
      return `
        <article class="habit-item ${completeToday ? "complete" : ""} ${scheduledToday ? "" : "off-day"}">
          <button
            class="habit-check"
            type="button"
            data-toggle-habit="${habit.id}"
            aria-label="${escapeHtml(habit.title)} ${completeToday ? "완료 취소" : "완료"}"
            ${scheduledToday ? "" : "disabled"}
          >✓</button>
          <span class="habit-copy">
            <strong>${escapeHtml(habit.title)}</strong>
            <small>${scheduledToday ? (completeToday ? "오늘 완료" : `목표 ${habit.targetValue}${escapeHtml(habit.unit)}`) : "오늘은 쉬는 날"} · 집중 ${formatFocusTime(habit.focusSeconds)}</small>
            <small class="habit-schedule">${escapeHtml(formatHabitSchedule(habit))}</small>
            <button class="habit-focus-button" type="button" data-focus-habit="${habit.id}" ${scheduledToday ? "" : "disabled"}>◷ 집중 시작</button>
          </span>
          <span>
            <span class="streak">${habit.streak}일</span>
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
  grid.style.gridTemplateColumns = `130px repeat(${daysInMonth}, 18px)`;

  const dayHeaders = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return `<span class="heatmap-day-label">${day === 1 || day % 5 === 0 ? day : ""}</span>`;
  }).join("");

  const rows = state.habits
    .map((habit) => {
      const cells = Array.from({ length: daysInMonth }, (_, index) => {
        const date = new Date(year, month, index + 1);
        const dateString = toLocalDateString(date);
        const completed = habit.completionDates.includes(dateString);
        const scheduled = isHabitScheduledOn(habit, date);
        const className = completed ? "completed" : scheduled ? "scheduled" : "inactive";
        return `<span class="heatmap-cell ${className}" title="${dateString} · ${completed ? "완료" : scheduled ? "예정" : "일정 없음"}"></span>`;
      }).join("");

      return `
        <span class="heatmap-habit-name" title="${escapeHtml(habit.title)}">${escapeHtml(habit.title)}</span>
        ${cells}
      `;
    })
    .join("");

  grid.innerHTML = `<span></span>${dayHeaders}${rows}`;
}

function renderFarm() {
  const inventory = document.querySelector("#seedInventory");
  const shop = document.querySelector("#seedShop");
  const grid = document.querySelector("#farmGrid");
  const farmBalance = document.querySelector("#farmCoinBalance");
  const harvestInventory = document.querySelector("#harvestInventory");
  const morrisonBuyList = document.querySelector("#morrisonBuyList");
  const marketFarmMoney = document.querySelector("#marketFarmMoneyBalance");
  const topFarmMoney = document.querySelector("#farmMoneyBalance");
  const decorInventory = document.querySelector("#decorInventory");
  const decorGrid = document.querySelector("#decorGrid");
  const decorShop = document.querySelector("#decorShop");
  const decorWorkshop = document.querySelector("#decorWorkshop");
  const decorModeButton = document.querySelector("#toggleDecorMode");
  if (
    !inventory ||
    !shop ||
    !grid ||
    !farmBalance ||
    !harvestInventory ||
    !morrisonBuyList ||
    !marketFarmMoney ||
    !topFarmMoney ||
    !decorInventory ||
    !decorGrid ||
    !decorShop ||
    !decorWorkshop ||
    !decorModeButton
  ) {
    return;
  }

  farmBalance.textContent = state.coins;
  marketFarmMoney.textContent = state.farmMoney;
  topFarmMoney.textContent = state.farmMoney;
  farmBalance.closest(".farm-wallet").classList.toggle("negative", state.coins < 0);
  decorWorkshop.classList.toggle("hidden", !decorationMode);
  decorModeButton.classList.toggle("active", decorationMode);
  decorModeButton.textContent = decorationMode ? "꾸미기 닫기" : "꾸미기 모드";

  inventory.innerHTML = Object.entries(CROPS)
    .map(([cropId, crop]) => {
      const count = state.seedInventory[cropId] ?? 0;
      return `
        <button
          class="inventory-seed ${selectedSeed === cropId ? "selected" : ""} ${count === 0 ? "empty" : ""}"
          type="button"
          data-select-seed="${cropId}"
        >
          <span>${crop.emoji}</span>
          <strong>${crop.name}</strong>
          <small>${count}개</small>
        </button>
      `;
    })
    .join("");

  shop.innerHTML = Object.entries(CROPS)
    .map(([cropId, crop]) => {
      const growthCost = crop.stages.length - 1;
      return `
        <article class="seed-shop-card">
          <span class="seed-shop-emoji">${crop.emoji}</span>
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
        <span class="harvest-item ${state.harvestInventory[cropId] ? "" : "empty"}">
          <i>${crop.emoji}</i>
          <strong>${crop.name}</strong>
          <small>${state.harvestInventory[cropId] ?? 0}개</small>
        </span>
      `,
    )
    .join("");

  morrisonBuyList.innerHTML = Object.entries(CROPS)
    .map(
      ([cropId, crop]) => `
        <article class="morrison-buy-card">
          <span>${crop.emoji}</span>
          <div>
            <strong>${crop.name}</strong>
            <small>보유 ${state.harvestInventory[cropId] ?? 0}개</small>
          </div>
          <button type="button" data-sell-crop="${cropId}">
            ✦ ${crop.sellPrice}
          </button>
        </article>
      `,
    )
    .join("");

  decorShop.innerHTML = Object.entries(DECORATIONS)
    .map(
      ([decorationId, decoration]) => `
        <article class="decor-shop-card">
          <span>${decoration.emoji}</span>
          <strong>${decoration.name}</strong>
          <button type="button" data-buy-decoration="${decorationId}">
            ✦ ${decoration.price}
          </button>
        </article>
      `,
    )
    .join("");

  decorInventory.innerHTML = Object.entries(DECORATIONS)
    .map(([decorationId, decoration]) => {
      const count = state.decorationInventory[decorationId] ?? 0;
      return `
        <button
          class="decor-inventory-item ${selectedDecoration === decorationId ? "selected" : ""} ${count === 0 ? "empty" : ""}"
          type="button"
          data-select-decoration="${decorationId}"
        >
          <span>${decoration.emoji}</span>
          <strong>${decoration.name}</strong>
          <small>${count}개</small>
        </button>
      `;
    })
    .join("");

  decorGrid.classList.toggle("editing", decorationMode);
  decorGrid.innerHTML = state.farmDecorations
    .map((cell, index) => {
      const position = DECORATION_SLOTS[index];
      if (!cell.decoration) {
        return `
          <button
            class="decor-cell empty ${selectedDecoration ? "ready" : ""}"
            type="button"
            data-place-decoration="${cell.id}"
            style="grid-row:${position.row};grid-column:${position.column}"
            ${decorationMode ? "" : "disabled"}
            aria-label="${cell.id + 1}번 꾸미기 칸"
          ></button>
        `;
      }

      const decoration = DECORATIONS[cell.decoration];
      return `
        <article class="decor-cell placed" style="grid-row:${position.row};grid-column:${position.column}">
          <span style="transform: rotate(${cell.rotation}deg)">${decoration.emoji}</span>
          <div>
            <button type="button" data-rotate-decoration="${cell.id}" aria-label="${decoration.name} 회전">↻</button>
            <button type="button" data-store-decoration="${cell.id}" aria-label="${decoration.name} 보관">×</button>
          </div>
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
            aria-label="${plot.id + 1}번 빈 밭"
          >
            <span>＋</span>
          </button>
        `;
      }

      const crop = CROPS[plot.crop];
      const maxGrowth = crop.stages.length - 1;
      const mature = plot.growth >= maxGrowth;
      const stage = crop.stages[Math.min(plot.growth, maxGrowth)];

      if (!mature) {
        return `
          <button
            class="farm-plot crop-plot growable-plot"
            type="button"
            data-grow-plot="${plot.id}"
            aria-label="${crop.name}에 1 Coin 주기"
          >
            <div class="crop-visual stage-${plot.growth}">
              <span>${stage}</span>
            </div>
            <div class="crop-info">
              <strong>${crop.name}</strong>
              <small>${plot.growth} / ${maxGrowth} 단계</small>
            </div>
          </button>
        `;
      }

      return `
        <article class="farm-plot crop-plot mature">
          <div class="crop-visual stage-${plot.growth}">
            <span>${stage}</span>
          </div>
          <div class="crop-info">
            <strong>${crop.name}</strong>
            <small>성장 완료</small>
          </div>
          <button class="harvest-button" type="button" data-harvest-plot="${plot.id}">수확하기</button>
        </article>
      `;
    })
    .join("");
}

function renderSummary() {
  const activeTasks = state.tasks.filter((task) => !task.archived);
  const todoDone = activeTasks.filter((task) => task.status === "done").length;
  const scheduledHabits = state.habits.filter(isHabitScheduledToday);
  const habitDone = scheduledHabits.filter(isHabitCompleteToday).length;
  const total = activeTasks.length + scheduledHabits.length;
  const completed = todoDone + habitDone;
  const percent = total ? Math.round((completed / total) * 100) : 0;

  document.querySelector("#coinBalance").textContent = state.coins;
  document.querySelector(".currency.coin").classList.toggle("negative", state.coins < 0);
  document.querySelector("#completedCount").textContent = completed;
  document.querySelector("#progressPercent").textContent = `${percent}%`;
  document.querySelector("#progressBar").style.width = `${percent}%`;
  document.querySelector("#todoDone").textContent = todoDone;
  document.querySelector("#todoTotal").textContent = activeTasks.length;
  document.querySelector("#habitDone").textContent = habitDone;
  document.querySelector("#habitTotal").textContent = scheduledHabits.length;
  const rewardMinutes = Math.floor(state.focusRewardSeconds / 60);
  document.querySelector("#rewardFocusMinutes").textContent = rewardMinutes;
  document.querySelector("#summaryFocusMinutes").textContent = rewardMinutes;
  document.querySelector("#focusRewardBar").style.width = `${(state.focusRewardSeconds / 3600) * 100}%`;
}

function render() {
  renderGroups();
  renderTasks();
  renderHabits();
  renderHabitHeatmap();
  renderFarm();
  renderSummary();
  saveState();
}

function moveTaskTo(id, nextStatus) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || task.status === nextStatus) return;

  const previousStatus = task.status;
  task.status = nextStatus;

  if (previousStatus !== "done" && nextStatus === "done") {
    state.coins += 1;
    showToast("완료. 1 Coin 획득.");
  } else if (previousStatus === "done" && nextStatus !== "done") {
    state.coins -= 1;
    showToast(`완료를 취소했어. 현재 ${state.coins} Coin.`);
  } else {
    showToast(nextStatus === "doing" ? "진행 중으로 옮겼어." : "대기로 옮겼어.");
  }

  render();
}

function toggleHabit(id) {
  const habit = state.habits.find((item) => item.id === id);
  if (!habit) return;
  if (!isHabitScheduledToday(habit)) {
    showToast("오늘 일정에 없는 습관이야.");
    return;
  }

  const completeToday = isHabitCompleteToday(habit);
  habit.complete = !completeToday;
  habit.completedDate = completeToday ? "" : toLocalDateString();
  habit.completionDates = completeToday
    ? habit.completionDates.filter((date) => date !== toLocalDateString())
    : [...habit.completionDates, toLocalDateString()];
  state.coins += habit.complete ? 1 : -1;
  showToast(
    habit.complete
      ? "습관 완료. 1 Coin 획득."
      : `완료를 취소했어. 현재 ${state.coins} Coin.`,
  );
  render();
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
  document.querySelector("#focusTime").textContent = `${minutes}:${seconds}`;
  document.querySelector(".timer-ring span").textContent =
    timerPhase === "focus" ? "FOCUS" : "BREAK";
}

function updateFocusTarget() {
  const item = getFocusItem();
  const target = document.querySelector("#focusTarget");
  const description = document.querySelector("#focusDescription");
  const focusButton = document.querySelector("#focusButton");

  if (timerPhase === "break") {
    focusButton.disabled = false;
    target.textContent = "잠깐 쉬어.";
    description.textContent = `${state.settings.breakMinutes}분 휴식 후 다시 집중해.`;
    return;
  }

  if (focusMode === "quick") {
    focusButton.disabled = false;
    target.textContent = `그냥 ${state.settings.focusMinutes}분 집중해.`;
    description.textContent = "할 일이나 습관에 연결하지 않고 집중 시간을 기록해.";
    return;
  }

  if (!item) {
    focusButton.disabled = true;
    target.textContent = "집중할 항목을 선택해.";
    description.textContent = "아래 할 일이나 습관에서 집중 버튼을 눌러.";
    return;
  }

  focusButton.disabled = false;
  target.textContent = item.title;
  description.textContent = `${activeFocus.type === "task" ? "이 할 일" : "이 습관"}에 ${state.settings.focusMinutes}분 동안 집중해.`;
}

function stopFocusTimer() {
  clearInterval(focusInterval);
  focusRunning = false;
}

function addFocusSecond() {
  state.focusRewardSeconds += 1;

  if (state.focusRewardSeconds >= 3600) {
    state.focusRewardSeconds -= 3600;
    state.coins += 1;
    showToast("집중 누적 60분 완료. 1 Coin을 받았어.");
  }
}

function resetToFocus() {
  timerPhase = "focus";
  focusSeconds = state.settings.focusMinutes * 60;
  document.querySelector("#focusButton").innerHTML =
    `<span>▶</span> ${state.settings.focusMinutes}분 시작`;
  updateFocusDisplay();
  updateFocusTarget();
}

function completeFocus() {
  const item = focusMode === "linked" ? getFocusItem() : null;
  let completedItem = false;

  if (item) {
    if (activeFocus.type === "task" && item.status !== "done") {
      item.status = "done";
      completedItem = true;
    }
    if (activeFocus.type === "habit" && !isHabitCompleteToday(item)) {
      item.complete = true;
      item.completedDate = toLocalDateString();
      item.completionDates.push(toLocalDateString());
      completedItem = true;
    }
  }

  if (completedItem) state.coins += 1;
  stopFocusTimer();

  if (state.settings.breakEnabled) {
    timerPhase = "break";
    focusSeconds = state.settings.breakMinutes * 60;
    document.querySelector("#focusButton").innerHTML =
      `<span>▶</span> ${state.settings.breakMinutes}분 휴식`;
    updateFocusDisplay();
    updateFocusTarget();
  } else {
    resetToFocus();
  }

  render();
  showToast(
    completedItem
      ? "집중 세트와 항목을 완료했어. 항목 보상 1 Coin."
      : "집중 세트를 완료했어.",
  );
}

function completeBreak() {
  stopFocusTimer();
  resetToFocus();
  showToast("휴식 끝. 다음 세트를 시작하면 돼.");
}

function toggleFocus() {
  const button = document.querySelector("#focusButton");
  focusRunning = !focusRunning;

  if (focusRunning) {
    button.innerHTML =
      timerPhase === "focus"
        ? "<span>Ⅱ</span> 집중 멈춤"
        : "<span>Ⅱ</span> 휴식 멈춤";
    focusInterval = setInterval(() => {
      focusSeconds -= 1;

      if (timerPhase === "focus") {
        const item = focusMode === "linked" ? getFocusItem() : null;
        if (item) item.focusSeconds = (item.focusSeconds ?? 0) + 1;
        addFocusSecond();
      }

      updateFocusDisplay();

      if (focusSeconds <= 0) {
        if (timerPhase === "focus") completeFocus();
        else completeBreak();
        return;
      }

      saveState();
      if (focusSeconds % 10 === 0) renderSummary();
    }, 1000);
  } else {
    clearInterval(focusInterval);
    button.innerHTML = "<span>▶</span> 계속하기";
  }
}

function setFocusMode(mode) {
  stopFocusTimer();
  focusMode = mode;
  timerPhase = "focus";
  focusSeconds = state.settings.focusMinutes * 60;

  document.querySelectorAll("[data-focus-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.focusMode === mode);
  });

  document.querySelector("#focusButton").innerHTML =
    `<span>▶</span> ${state.settings.focusMinutes}분 시작`;
  updateFocusDisplay();
  updateFocusTarget();
}

function startItemFocus(type, id) {
  stopFocusTimer();
  focusMode = "linked";
  timerPhase = "focus";
  activeFocus = { type, id };
  const item = getFocusItem();
  if (!item) return;
  if (type === "habit" && !isHabitScheduledToday(item)) {
    activeFocus = null;
    updateFocusTarget();
    showToast("오늘 일정에 없는 습관이야.");
    return;
  }

  if (type === "task" && item.status === "waiting") item.status = "doing";
  focusSeconds = state.settings.focusMinutes * 60;
  document.querySelectorAll("[data-focus-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.focusMode === "linked");
  });
  updateFocusDisplay();
  updateFocusTarget();
  render();
  toggleFocus();
  document.querySelector(".focus-card").scrollIntoView({ behavior: "smooth", block: "center" });
  showToast(`‘${item.title}’ 집중 측정을 시작했어.`);
}

document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "long",
}).format(new Date());

document.querySelector("#openTaskForm").addEventListener("click", () => {
  taskForm.classList.toggle("hidden");
  if (!taskForm.classList.contains("hidden")) taskInput.focus();
});

document.querySelector("#openHabitForm").addEventListener("click", () => {
  habitForm.classList.toggle("hidden");
  if (!habitForm.classList.contains("hidden")) {
    if (!habitStartDate.value) habitStartDate.value = toLocalDateString();
    habitInput.focus();
  }
});

function syncHabitMeasureFields() {
  const units = { count: "회", time: "분" };
  const isAmount = habitMeasureType.value === "amount";
  habitUnit.readOnly = !isAmount;
  habitTargetValue.step = habitMeasureType.value === "count" ? "1" : "any";
  if (!isAmount) habitUnit.value = units[habitMeasureType.value];
  if (isAmount && ["회", "분"].includes(habitUnit.value)) habitUnit.value = "";
  habitUnit.placeholder = isAmount ? "단위" : "";
}

habitMeasureType.addEventListener("change", syncHabitMeasureFields);

document.querySelector("#toggleGroupManager").addEventListener("click", () => {
  groupManager.classList.toggle("hidden");
  if (!groupManager.classList.contains("hidden")) groupInput.focus();
});

document.querySelector("#addGroupButton").addEventListener("click", () => {
  const name = groupInput.value.trim();
  if (!name) return;
  if (state.groups.some((group) => group.name === name)) {
    showToast("이미 있는 그룹이야.");
    return;
  }

  const group = { id: `group-${Date.now()}`, name };
  state.groups.push(group);
  groupInput.value = "";
  render();
  taskGroup.value = group.id;
  showToast(`‘${name}’ 그룹을 추가했어.`);
});

groupInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    document.querySelector("#addGroupButton").click();
  }
});

document.querySelector("#groupList").addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-group]");
  if (!deleteButton) return;

  const groupId = deleteButton.dataset.deleteGroup;
  const group = getGroup(groupId);
  state.groups = state.groups.filter((item) => item.id !== groupId);
  if (taskGroupFilter === groupId) taskGroupFilter = "all";
  state.tasks.forEach((task) => {
    if (task.groupId === groupId) task.groupId = null;
  });
  render();
  showToast(`‘${group?.name ?? "그룹"}’을 삭제하고 할 일은 그룹 없음으로 옮겼어.`);
});

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = taskInput.value.trim();
  if (!title) return;

  state.tasks.unshift({
    id: Date.now(),
    title,
    status: "waiting",
    focusSeconds: 0,
    groupId: taskGroup.value || null,
    archived: false,
    archivedAt: "",
  });
  taskInput.value = "";
  taskForm.classList.add("hidden");
  showToast("대기 목록에 추가했어.");
  render();
});

habitForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = habitInput.value.trim();
  if (!title) return;
  const weekdays = [...document.querySelectorAll('[name="habitWeekday"]:checked')].map(
    (input) => Number(input.value),
  );
  const targetValue = Number(habitTargetValue.value);
  const unit = habitUnit.value.trim();

  if (!weekdays.length) {
    showToast("반복할 요일을 하나 이상 선택해.");
    return;
  }
  if (!targetValue || targetValue <= 0) {
    showToast("목표값을 확인해.");
    return;
  }
  if (habitMeasureType.value === "count" && !Number.isInteger(targetValue)) {
    showToast("횟수는 정수로 입력해.");
    return;
  }
  if (!unit) {
    showToast("목표 단위를 입력해.");
    return;
  }
  if (habitEndDate.value && habitEndDate.value < habitStartDate.value) {
    showToast("종료일은 시작일보다 빠를 수 없어.");
    return;
  }

  state.habits.push({
    id: Date.now(),
    title,
    streak: 0,
    complete: false,
    completedDate: "",
    completionDates: [],
    focusSeconds: 0,
    measureType: habitMeasureType.value,
    targetValue,
    unit,
    weekdays,
    startDate: habitStartDate.value,
    endDate: habitEndDate.value,
  });
  habitInput.value = "";
  habitMeasureType.value = "count";
  habitTargetValue.value = 1;
  habitUnit.value = "회";
  document
    .querySelectorAll('[name="habitWeekday"]')
    .forEach((input) => (input.checked = true));
  habitStartDate.value = toLocalDateString();
  habitEndDate.value = "";
  syncHabitMeasureFields();
  habitForm.classList.add("hidden");
  showToast("새 습관을 추가했어.");
  render();
});

document.querySelector("#taskBoard").addEventListener("click", (event) => {
  const focusButton = event.target.closest("[data-focus-task]");
  const deleteButton = event.target.closest("[data-delete-task]");
  const archiveButton = event.target.closest("[data-archive-task]");
  const restoreButton = event.target.closest("[data-restore-task]");

  if (focusButton) startItemFocus("task", Number(focusButton.dataset.focusTask));
  if (archiveButton) {
    const task = state.tasks.find((item) => item.id === Number(archiveButton.dataset.archiveTask));
    if (task) {
      task.archived = true;
      task.archivedAt = new Date().toISOString();
      showToast("완료한 할 일을 보관함에 넣었어.");
      render();
    }
    return;
  }
  if (restoreButton) {
    const task = state.tasks.find((item) => item.id === Number(restoreButton.dataset.restoreTask));
    if (task) {
      task.archived = false;
      task.archivedAt = "";
      showToast("보관함에서 다시 꺼냈어.");
      render();
    }
    return;
  }
  if (deleteButton) {
    state.tasks = state.tasks.filter((task) => task.id !== Number(deleteButton.dataset.deleteTask));
    showToast("할 일을 삭제했어.");
    render();
  }
});

document.querySelector("#taskGroupFilters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-task-group-filter]");
  if (!button || taskArchiveView) return;
  taskGroupFilter = button.dataset.taskGroupFilter;
  renderTasks();
});

document.querySelector("#toggleArchiveView").addEventListener("click", () => {
  taskArchiveView = !taskArchiveView;
  renderTasks();
});

document.querySelector("#taskBoard").addEventListener("dragstart", (event) => {
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
});

document.querySelector("#taskBoard").addEventListener("drop", (event) => {
  const column = event.target.closest("[data-status]");
  if (!column) return;

  event.preventDefault();
  const taskId = Number(event.dataTransfer.getData("text/plain"));
  document.querySelectorAll(".board-column").forEach((item) => item.classList.remove("drag-over"));
  moveTaskTo(taskId, column.dataset.status);
});

document.querySelector("#taskBoard").addEventListener("dragend", () => {
  document.querySelectorAll(".board-column").forEach((item) => item.classList.remove("drag-over"));
  document.querySelectorAll(".task-card").forEach((item) => item.classList.remove("dragging"));
});

document.querySelector("#habitList").addEventListener("click", (event) => {
  const focusButton = event.target.closest("[data-focus-habit]");
  const toggleButton = event.target.closest("[data-toggle-habit]");
  const deleteButton = event.target.closest("[data-delete-habit]");

  if (focusButton) startItemFocus("habit", Number(focusButton.dataset.focusHabit));
  if (toggleButton) toggleHabit(Number(toggleButton.dataset.toggleHabit));
  if (deleteButton) {
    const habitId = Number(deleteButton.dataset.deleteHabit);
    const habit = state.habits.find((item) => item.id === habitId);
    if (!window.confirm(`‘${habit?.title ?? "이 습관"}’을 삭제할까?\n삭제한 습관은 복구할 수 없어.`)) {
      return;
    }
    state.habits = state.habits.filter((item) => item.id !== habitId);
    showToast("습관을 삭제했어.");
    render();
  }
});

document.querySelector("#seedShop").addEventListener("click", (event) => {
  const button = event.target.closest("[data-buy-seed]");
  if (!button) return;

  const cropId = button.dataset.buySeed;
  const crop = CROPS[cropId];
  if (!crop) return;
  if (state.coins < crop.seedPrice) {
    showToast(`${crop.name} 씨앗을 사려면 ${crop.seedPrice} Coin이 필요해.`);
    return;
  }

  state.coins -= crop.seedPrice;
  state.seedInventory[cropId] += 1;
  if (!selectedSeed) selectedSeed = cropId;
  showToast(`${crop.name} 씨앗을 1개 샀어.`);
  render();
});

document.querySelector("#seedInventory").addEventListener("click", (event) => {
  const button = event.target.closest("[data-select-seed]");
  if (!button) return;

  const cropId = button.dataset.selectSeed;
  if (!state.seedInventory[cropId]) {
    showToast("보유한 씨앗이 없어.");
    return;
  }

  selectedSeed = selectedSeed === cropId ? null : cropId;
  renderFarm();
});

document.querySelector("#farmGrid").addEventListener("click", (event) => {
  const plantButton = event.target.closest("[data-plant-plot]");
  const growButton = event.target.closest("[data-grow-plot]");
  const harvestButton = event.target.closest("[data-harvest-plot]");

  if (plantButton) {
    if (!selectedSeed || !state.seedInventory[selectedSeed]) {
      showToast("씨앗 보관함에서 심을 씨앗을 먼저 골라.");
      return;
    }

    const plot = state.farmPlots.find(
      (item) => item.id === Number(plantButton.dataset.plantPlot),
    );
    if (!plot || plot.crop) return;

    plot.crop = selectedSeed;
    plot.growth = 0;
    state.seedInventory[selectedSeed] -= 1;
    const cropName = CROPS[selectedSeed].name;
    if (state.seedInventory[selectedSeed] === 0) selectedSeed = null;
    showToast(`${cropName} 씨앗을 심었어.`);
    render();
    return;
  }

  if (harvestButton) {
    const plot = state.farmPlots.find(
      (item) => item.id === Number(harvestButton.dataset.harvestPlot),
    );
    if (!plot?.crop) return;

    const crop = CROPS[plot.crop];
    const maxGrowth = crop.stages.length - 1;
    if (plot.growth < maxGrowth) return;

    state.harvestInventory[plot.crop] += 1;
    const cropName = crop.name;
    plot.crop = null;
    plot.growth = 0;
    showToast(`${cropName}을 수확해서 보관함에 넣었어.`);
    render();
    return;
  }

  if (growButton) {
    const plot = state.farmPlots.find(
      (item) => item.id === Number(growButton.dataset.growPlot),
    );
    if (!plot?.crop) return;

    const crop = CROPS[plot.crop];
    const maxGrowth = crop.stages.length - 1;
    if (plot.growth >= maxGrowth) return;
    if (state.coins < 1) {
      showToast("작물을 키우려면 1 Coin이 필요해.");
      return;
    }

    state.coins -= 1;
    plot.growth += 1;
    showToast(
      plot.growth >= maxGrowth
        ? `${crop.name}이 다 자랐어.`
        : `${crop.name}이 한 단계 자랐어.`,
    );
    render();
  }
});

document.querySelector("#morrisonBuyList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-sell-crop]");
  if (!button) return;

  const cropId = button.dataset.sellCrop;
  const crop = CROPS[cropId];
  if (!crop || !state.harvestInventory[cropId]) {
    showToast("Morrison에게 팔 수확물이 없어.");
    return;
  }

  state.harvestInventory[cropId] -= 1;
  state.farmMoney += crop.sellPrice;
  showToast(`${crop.name} 1개를 팔고 ${crop.sellPrice} Farm Money를 받았어.`);
  render();
});

document.querySelector("#toggleDecorMode").addEventListener("click", () => {
  decorationMode = !decorationMode;
  renderFarm();
});

document.querySelector("#decorShop").addEventListener("click", (event) => {
  const button = event.target.closest("[data-buy-decoration]");
  if (!button) return;

  const decorationId = button.dataset.buyDecoration;
  const decoration = DECORATIONS[decorationId];
  if (!decoration) return;
  if (state.farmMoney < decoration.price) {
    showToast(`${decoration.name}을 사려면 ${decoration.price} Farm Money가 필요해.`);
    return;
  }

  state.farmMoney -= decoration.price;
  state.decorationInventory[decorationId] += 1;
  selectedDecoration = decorationId;
  decorationMode = true;
  showToast(`${decoration.name}을 샀어. 마당에 놓아봐.`);
  render();
});

document.querySelector("#decorInventory").addEventListener("click", (event) => {
  const button = event.target.closest("[data-select-decoration]");
  if (!button) return;

  const decorationId = button.dataset.selectDecoration;
  if (!state.decorationInventory[decorationId]) {
    showToast("보관 중인 장식이 없어.");
    return;
  }

  selectedDecoration = selectedDecoration === decorationId ? null : decorationId;
  renderFarm();
});

document.querySelector("#decorGrid").addEventListener("click", (event) => {
  const placeButton = event.target.closest("[data-place-decoration]");
  const rotateButton = event.target.closest("[data-rotate-decoration]");
  const storeButton = event.target.closest("[data-store-decoration]");

  if (placeButton) {
    if (!selectedDecoration || !state.decorationInventory[selectedDecoration]) {
      showToast("보관함에서 놓을 장식을 먼저 골라.");
      return;
    }

    const cell = state.farmDecorations.find(
      (item) => item.id === Number(placeButton.dataset.placeDecoration),
    );
    if (!cell || cell.decoration) return;

    cell.decoration = selectedDecoration;
    cell.rotation = 0;
    state.decorationInventory[selectedDecoration] -= 1;
    if (state.decorationInventory[selectedDecoration] === 0) selectedDecoration = null;
    render();
    return;
  }

  if (rotateButton) {
    const cell = state.farmDecorations.find(
      (item) => item.id === Number(rotateButton.dataset.rotateDecoration),
    );
    if (!cell?.decoration) return;
    cell.rotation = (cell.rotation + 90) % 360;
    render();
    return;
  }

  if (storeButton) {
    const cell = state.farmDecorations.find(
      (item) => item.id === Number(storeButton.dataset.storeDecoration),
    );
    if (!cell?.decoration) return;
    state.decorationInventory[cell.decoration] += 1;
    cell.decoration = null;
    cell.rotation = 0;
    render();
  }
});

document.querySelector("#focusButton").addEventListener("click", toggleFocus);
document.querySelectorAll("[data-focus-mode]").forEach((button) => {
  button.addEventListener("click", () => setFocusMode(button.dataset.focusMode));
});

const focusSettings = document.querySelector("#focusSettings");
const focusMinutesInput = document.querySelector("#focusMinutesInput");
const breakEnabledInput = document.querySelector("#breakEnabledInput");
const breakMinutesInput = document.querySelector("#breakMinutesInput");

function syncFocusSettingsForm() {
  focusMinutesInput.value = state.settings.focusMinutes;
  breakEnabledInput.checked = state.settings.breakEnabled;
  breakMinutesInput.value = state.settings.breakMinutes;
  breakMinutesInput.disabled = !state.settings.breakEnabled;
}

document.querySelector("#toggleFocusSettings").addEventListener("click", () => {
  focusSettings.classList.toggle("hidden");
  syncFocusSettingsForm();
});

breakEnabledInput.addEventListener("change", () => {
  breakMinutesInput.disabled = !breakEnabledInput.checked;
});

document.querySelector("#saveFocusSettings").addEventListener("click", () => {
  const focusMinutes = Math.min(120, Math.max(5, Number(focusMinutesInput.value) || 25));
  const breakMinutes = Math.min(60, Math.max(1, Number(breakMinutesInput.value) || 5));

  state.settings = {
    focusMinutes,
    breakEnabled: breakEnabledInput.checked,
    breakMinutes,
  };
  stopFocusTimer();
  resetToFocus();
  saveState();
  focusSettings.classList.add("hidden");
  showToast("집중 설정을 저장했어.");
});

const todayWorkspace = document.querySelector("#todayWorkspace");
const taskSection = document.querySelector("#taskSection");
const habitSection = document.querySelector("#habitSection");
const summaryGrid = document.querySelector("#summaryGrid");
const focusCard = document.querySelector("#focusCard");
const focusPageSlot = document.querySelector("#focusPageSlot");

function showPage(page) {
  const validPage = ["today", "tasks", "habits", "focus", "farm"].includes(page) ? page : "today";
  currentPage = validPage;

  if (validPage === "today") {
    summaryGrid.prepend(focusCard);
    focusCard.classList.remove("standalone");
    todayWorkspace.appendChild(taskSection);
    todayWorkspace.appendChild(habitSection);
    taskSection.querySelector(".section-header h2").textContent = "오늘의 할 일";
    habitSection.querySelector(".section-header h2").textContent = "오늘의 습관";
  }

  if (validPage === "tasks") {
    document.querySelector("#tasksPageSlot").appendChild(taskSection);
    taskSection.querySelector(".section-header h2").textContent = "전체 할 일";
  }

  if (validPage === "habits") {
    document.querySelector("#habitsPageSlot").appendChild(habitSection);
    habitSection.querySelector(".section-header h2").textContent = "습관 관리";
  }

  if (validPage === "focus") {
    focusPageSlot.appendChild(focusCard);
    focusCard.classList.add("standalone");
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
  renderHabitHeatmap();
}

window.addEventListener("hashchange", () => {
  showPage(location.hash.slice(1));
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

render();
syncFocusSettingsForm();
habitStartDate.value = toLocalDateString();
syncHabitMeasureFields();
resetToFocus();
showPage(location.hash.slice(1) || "today");
