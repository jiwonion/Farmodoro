const STORAGE_KEY = "farmodoro-dashboard-v1";
const LAST_PAGE_STORAGE_KEY = "farmodoro-last-page";
const APP_PAGES = ["today", "tasks", "habits", "focus", "farm"];
const GROUP_COLOR_COUNT = 8;

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

const FARM_ITEMS = {
  luckyFertilizer: {
    name: "행운 비료",
    icon: "✦",
    price: 240,
    description: "다음 수확량이 2개가 되고, 5% 확률로 5개를 수확해",
    type: "plot",
  },
  moistureFertilizer: {
    name: "보습 비료",
    icon: "💧",
    price: 220,
    description: "다음 수확까지 물 1회당 2단계 성장해",
    type: "plot",
  },
  premiumFertilizer: {
    name: "프리미엄 비료",
    icon: "♛",
    price: 420,
    description: "행운 비료와 보습 비료 효과를 함께 적용해",
    type: "plot",
  },
  goldenFestivalPass: {
    name: "황금 수확제 초대장",
    icon: "🎟",
    price: 650,
    description: "사용 후 24시간 동안 생산으로 얻는 Coin이 2배가 돼",
    type: "instant",
  },
  farmFestivalPass: {
    name: "푸른 들판 축제권",
    icon: "🎐",
    price: 550,
    description: "사용 후 24시간 동안 모든 작물이 시들지 않아",
    type: "instant",
  },
  freePass: {
    name: "농부의 프리패스",
    icon: "✓",
    price: 480,
    description: "완료하지 않은 할 일 또는 오늘의 습관 하나를 완료 처리해",
    type: "target",
  },
  revivalTonic: {
    name: "새벽이슬 회복제",
    icon: "☘",
    price: 180,
    description: "시든 작물 하나를 되살려",
    type: "plot",
  },
  growthTonic: {
    name: "햇살 성장제",
    icon: "☀",
    price: 220,
    description: "작물 하나를 Coin 소비 없이 2단계 성장시켜",
    type: "plot",
  },
};

const MOCK_FARM_FRIENDS = [
  { id: "dawn", name: "새벽이슬", farmName: "푸른 언덕 농장", avatar: "🌿" },
  { id: "potato", name: "감자대장", farmName: "포근한 감자밭", avatar: "🥔" },
  { id: "luna", name: "달빛 호미", farmName: "달맞이 농원", avatar: "🌙" },
  { id: "bean", name: "콩콩이", farmName: "작은 콩밭", avatar: "🫛" },
];

const SYSTEM_FARM_SENDER = {
  id: "system",
  name: "시스템",
  farmName: "Farmodoro 운영국",
  avatar: "🤖",
};

const MOCK_FARM_RANKINGS = [
  { name: "새벽이슬 농장", score: 840 },
  { name: "감자대장", score: 715 },
  { name: "달빛 호미", score: 590 },
  { name: "토마토 연구소", score: 465 },
  { name: "콩콩이네 밭", score: 350 },
  { name: "노을빛 과수원", score: 245 },
  { name: "초보 새싹", score: 130 },
];

const DAILY_FARM_INBOX_GIFTS = [
  { category: "harvest", itemId: "carrot" },
  { category: "seed", itemId: "strawberry" },
  { category: "supply", itemId: "moistureFertilizer" },
  { category: "food", itemId: "countryStew" },
  { category: "harvest", itemId: "tomato" },
  { category: "seed", itemId: "sunflower" },
];

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
  schemaVersion: 15,
  coins: 999,
  farmMoney: 999,
  farmRankingWeekStart: "",
  weeklyFarmMoneyEarned: 0,
  farmRankingDemoRewardSent: false,
  farmRankingBoxExperienceReady: false,
  farmRankingSecondPlaceDemoSent: false,
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
  settings: {
    linked: { focusMinutes: 25, breakEnabled: true, breakMinutes: 5 },
    quick: { focusMinutes: 25, breakEnabled: true, breakMinutes: 5 },
  },
  seedInventory: Object.fromEntries(Object.keys(CROPS).map((cropId) => [cropId, 0])),
  harvestInventory: Object.fromEntries(Object.keys(CROPS).map((cropId) => [cropId, 0])),
  farmPlots: Array.from({ length: 16 }, (_, index) => {
    const wiltedExamples = [
      { crop: "carrot", growth: 1 },
      { crop: "tomato", growth: 2 },
      { crop: "sunflower", growth: 3 },
    ];
    const example = wiltedExamples[index];
    return {
      id: index,
      crop: example?.crop ?? null,
      growth: example?.growth ?? 0,
      plantedDate: example ? "2000-01-01" : "",
      lastWateredDate: example ? "2000-01-01" : "",
      lastFreeWaterAt: 0,
      wilted: Boolean(example),
      fertilizer: null,
    };
  }),
  groups: [
    { id: "work", name: "업무", colorIndex: 0 },
    { id: "study", name: "공부", colorIndex: 3 },
    { id: "life", name: "생활", colorIndex: 1 },
  ],
  tasks: [
    { id: 1, title: "Farmodoro 메인 화면 정리", status: "doing", focusSeconds: 0, groupId: "work", archived: false, completedDate: "" },
    { id: 2, title: "책 20페이지 읽기", status: "waiting", focusSeconds: 0, groupId: "study", archived: false, completedDate: "" },
    { id: 3, title: "장보기 목록 확인", status: "waiting", focusSeconds: 0, groupId: "life", archived: false, completedDate: "" },
    { id: 4, title: "프로젝트 요구사항 작성", status: "done", focusSeconds: 0, groupId: "work", archived: false, completedDate: toLocalDateString() },
  ],
  habits: [
    { id: 11, title: "물 2L 마시기", streak: 8, complete: true, focusSeconds: 0, measureType: "amount", targetValue: 2, unit: "L", weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: "", endDate: "" },
    { id: 12, title: "30분 운동", streak: 4, complete: false, focusSeconds: 0, measureType: "time", targetValue: 30, unit: "분", weekdays: [1, 2, 3, 4, 5], startDate: "", endDate: "" },
    { id: 13, title: "영양제 챙기기", streak: 12, complete: true, focusSeconds: 0, measureType: "count", targetValue: 1, unit: "회", weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: "", endDate: "" },
  ],
};

let state = loadState();
ensureWeeklyFarmRanking();
ensureFarmRankingDemoReward();
ensureFarmRankingBoxExperience();
ensureFarmRankingSecondPlaceDemoReward();
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
    completedDate: habit.completedDate ?? (habit.complete ? toLocalDateString() : ""),
    completionDates,
    progressByDate:
      habit.progressByDate ??
      (habit.measureType === "count"
        ? Object.fromEntries(completionDates.map((date) => [date, habit.targetValue ?? 1]))
        : {}),
  };
});
let toastTimer;
let focusInterval;
let focusSeconds = state.settings.linked.focusMinutes * 60;
let focusRunning = false;
let focusSessionStarted = false;
let focusMode = "linked";
let runningFocusMode = null;
let timerPhase = "focus";
const focusRuntimeByMode = {
  linked: { seconds: state.settings.linked.focusMinutes * 60, phase: "focus", started: false },
  quick: { seconds: state.settings.quick.focusMinutes * 60, phase: "focus", started: false },
};
let activeFocus = null;
let currentPage = "today";
let taskGroupFilter = "all";
let taskArchiveView = false;
let habitCalendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedSeed = null;
let selectedFarmItem = null;
let selectedMailFriendId = null;
let selectedMailCategory = "harvest";
let selectedMailItemId = null;
let farmMailView = "send";
let activeRankingRewardMailId = null;
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
const openHabitFormButton = document.querySelector("#openHabitForm");
const habitDeleteModal = document.querySelector("#habitDeleteModal");
const habitDeleteName = document.querySelector("#habitDeleteName");
const confirmHabitDelete = document.querySelector("#confirmHabitDelete");
const habitModalFormSlot = document.querySelector("#habitModalFormSlot");
const habitInput = document.querySelector("#habitInput");
const habitMeasureType = document.querySelector("#habitMeasureType");
const habitTargetValue = document.querySelector("#habitTargetValue");
const habitUnit = document.querySelector("#habitUnit");
const habitEndDate = document.querySelector("#habitEndDate");
const toast = document.querySelector("#toast");
const miniFocusTimer = document.querySelector("#miniFocusTimer");
const miniFocusStatus = document.querySelector("#miniFocusStatus");
const miniFocusTitle = document.querySelector("#miniFocusTitle");
const miniFocusTime = document.querySelector("#miniFocusTime");
const miniFocusPause = document.querySelector("#miniFocusPause");
let pendingHabitDeleteId = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return structuredClone(defaultState);
    delete saved.decorationInventory;
    delete saved.farmDecorations;
    const savedSchemaVersion = saved.schemaVersion ?? 1;
    const migratedCoins = savedSchemaVersion < 4 ? 999 : saved.coins;
    const migratedFarmMoney =
      savedSchemaVersion < 4 ? 999 : (saved.farmMoney ?? 0);
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
            wilted: plot.wilted ?? false,
            fertilizer: plot.fertilizer ?? null,
          }))
        : structuredClone(defaultState.farmPlots);

    if (savedSchemaVersion < 5) {
      const examples = [
        { crop: "carrot", growth: 1 },
        { crop: "tomato", growth: 2 },
        { crop: "sunflower", growth: 3 },
      ];
      const emptyPlots = migratedFarmPlots.filter((plot) => !plot.crop).slice(0, examples.length);
      emptyPlots.forEach((plot, index) => {
        Object.assign(plot, {
          ...examples[index],
          plantedDate: "2000-01-01",
          lastWateredDate: "2000-01-01",
          wilted: true,
        });
      });
    }

    return {
      ...structuredClone(defaultState),
      ...saved,
      schemaVersion: 15,
      coins: migratedCoins,
      farmMoney: migratedFarmMoney,
      farmRankingWeekStart: saved.farmRankingWeekStart ?? "",
      weeklyFarmMoneyEarned: Number(saved.weeklyFarmMoneyEarned ?? 0),
      farmRankingDemoRewardSent: Boolean(saved.farmRankingDemoRewardSent),
      farmRankingBoxExperienceReady: Boolean(saved.farmRankingBoxExperienceReady),
      farmRankingSecondPlaceDemoSent: Boolean(saved.farmRankingSecondPlaceDemoSent),
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
        completedDate:
          task.completedDate ??
          (task.status === "done" && !task.archived ? toLocalDateString() : ""),
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
          ${archiveActive ? "disabled" : ""}
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
              ${group ? `<span class="task-category ${getGroupColorClass(group)}">${escapeHtml(group.name)}</span>` : ""}
              ${
                task.archived
                  ? '<span class="task-archived-label">보관됨</span>'
                  : task.status === "done"
                    ? `<span class="task-focus-pill completed-focus-time">◷ 집중 ${formatFocusTime(task.focusSeconds)}</span>`
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

function getFarmWeekStart(date = new Date()) {
  const monday = new Date(date);
  monday.setHours(12, 0, 0, 0);
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);
  return toLocalDateString(monday);
}

function getFarmRankings(userScore = state.weeklyFarmMoneyEarned) {
  return [
    ...MOCK_FARM_RANKINGS,
    {
      name: state.farmName || "내 농장",
      score: userScore,
      isMe: true,
    },
  ].sort((first, second) => second.score - first.score || Number(second.isMe) - Number(first.isMe));
}

function createFarmRankingRewardMail({
  id,
  boxCount,
  ranking,
  rewardWeekStart = state.farmRankingWeekStart,
}) {
  if (state.farmInbox.some((mail) => mail.id === id)) return false;
  const cropIds = Object.keys(CROPS);
  state.farmInbox.unshift({
    id,
    friendId: SYSTEM_FARM_SENDER.id,
    category: "rankingBox",
    itemId: "weeklyCropBox",
    boxCount,
    boxCropIds: Array.from(
      { length: boxCount },
      () => cropIds[Math.floor(Math.random() * cropIds.length)],
    ),
    openedBoxIndexes: [],
    ranking,
    rewardWeekStart,
    receivedDate: toLocalDateString(),
    claimed: false,
  });
  return true;
}

function addWeeklyFarmRankingReward(rewardWeekStart, userScore) {
  const rank = getFarmRankings(userScore).findIndex((farmer) => farmer.isMe) + 1;
  const boxCountByRank = { 1: 5, 2: 2, 3: 1 };
  const boxCount = boxCountByRank[rank];
  if (!boxCount) return false;

  return createFarmRankingRewardMail({
    id: `weekly-ranking-${rewardWeekStart}`,
    boxCount,
    ranking: rank,
    rewardWeekStart,
  });
}

function ensureFarmRankingDemoReward() {
  if (state.farmRankingDemoRewardSent) return false;
  createFarmRankingRewardMail({
    id: "demo-weekly-ranking-first-place",
    boxCount: 5,
    ranking: 1,
  });
  state.farmRankingDemoRewardSent = true;
  return true;
}

function ensureFarmRankingBoxExperience() {
  if (state.farmRankingBoxExperienceReady) return false;
  const previousDemoMail = state.farmInbox.find(
    (mail) => mail.id === "demo-weekly-ranking-first-place",
  );
  if (previousDemoMail && !previousDemoMail.claimed) {
    previousDemoMail.openedBoxIndexes = previousDemoMail.openedBoxIndexes ?? [];
    state.farmRankingBoxExperienceReady = true;
    return true;
  }

  createFarmRankingRewardMail({
    id: "demo-weekly-ranking-box-opening",
    boxCount: 5,
    ranking: 1,
  });
  state.farmRankingBoxExperienceReady = true;
  return true;
}

function ensureFarmRankingSecondPlaceDemoReward() {
  if (state.farmRankingSecondPlaceDemoSent) return false;
  createFarmRankingRewardMail({
    id: "demo-weekly-ranking-second-place",
    boxCount: 2,
    ranking: 2,
  });
  state.farmRankingSecondPlaceDemoSent = true;
  return true;
}

function ensureWeeklyFarmRanking() {
  const currentWeekStart = getFarmWeekStart();
  if (state.farmRankingWeekStart === currentWeekStart) return false;
  if (state.farmRankingWeekStart) {
    addWeeklyFarmRankingReward(
      state.farmRankingWeekStart,
      state.weeklyFarmMoneyEarned,
    );
  }
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
  selectedMailFriendId = null;
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
  const daySeed = Number(today.replaceAll("-", ""));
  state.farmInboxDate = today;
  const existingMailIds = new Set(state.farmInbox.map((mail) => mail.id));
  const newMail = Array.from({ length: 7 }, (_, index) => index)
    .filter((index) => !existingMailIds.has(`${today}-${index}`))
    .map((index) => {
      const gift = DAILY_FARM_INBOX_GIFTS[
        (daySeed + index * 3) % DAILY_FARM_INBOX_GIFTS.length
      ];
      const friend = MOCK_FARM_FRIENDS[(daySeed + index) % MOCK_FARM_FRIENDS.length];
      return {
        id: `${today}-${index}`,
        friendId: friend.id,
        category: gift.category,
        itemId: gift.itemId,
        receivedDate: today,
        claimed: false,
      };
    });
  state.farmInbox = [...newMail, ...state.farmInbox];
  return expiredMailRemoved || newMail.length > 0;
}

function earnFarmMoney(amount) {
  ensureWeeklyFarmRanking();
  state.farmMoney += amount;
  state.weeklyFarmMoneyEarned += amount;
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

function getWiltGraceDays(plot) {
  return plot.growth <= 1 ? 1 : 2;
}

function updateWiltedCrops() {
  if (isWiltProtectionActive()) return false;
  let changed = false;
  state.farmPlots.forEach((plot) => {
    if (!plot.crop || plot.wilted) return;
    const lastCareDate = plot.lastWateredDate || plot.plantedDate;
    if (lastCareDate && daysBetweenDates(lastCareDate) > getWiltGraceDays(plot)) {
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
  return maxGrowth;
}

function isHabitScheduledOn(habit, date) {
  const dateString = toLocalDateString(date);
  const weekday = date.getDay() === 0 ? 7 : date.getDay();
  const beforeEndDate = !habit.endDate || habit.endDate >= dateString;
  return beforeEndDate && habit.weekdays.includes(weekday);
}

function isHabitScheduledToday(habit) {
  return isHabitScheduledOn(habit, new Date());
}

function getHabitProgress(habit, dateString = toLocalDateString()) {
  if (habit.measureType !== "count") {
    return habit.completionDates.includes(dateString) ? habit.targetValue : 0;
  }
  return Math.max(0, Number(habit.progressByDate?.[dateString] ?? 0));
}

function getHabitProgressRatio(habit, dateString = toLocalDateString()) {
  return Math.min(1, getHabitProgress(habit, dateString) / Math.max(1, habit.targetValue));
}

function isHabitCompleteToday(habit) {
  return getHabitProgressRatio(habit) >= 1;
}

function formatHabitSchedule(habit) {
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
  return habit.endDate ? `${weekdays} · ${habit.endDate}까지` : weekdays;
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

function renderHabits() {
  const habitList = document.querySelector("#habitList");

  habitList.innerHTML = state.habits
    .map((habit) => {
      const scheduledToday = isHabitScheduledToday(habit);
      const completeToday = isHabitCompleteToday(habit);
      const countProgress = getHabitProgress(habit);
      const isCountHabit = habit.measureType === "count";
      const control = isCountHabit
        ? `
          <div class="habit-count-control" aria-label="${escapeHtml(habit.title)} 진행 횟수">
            <button
              type="button"
              data-adjust-habit="${habit.id}"
              data-delta="1"
              aria-label="횟수 늘리기"
              ${!scheduledToday || countProgress >= habit.targetValue ? "disabled" : ""}
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
          ? `<button class="habit-focus-button" type="button" data-focus-habit="${habit.id}" ${scheduledToday ? "" : "disabled"}>◷ 집중 시작</button>`
          : "";
      return `
        <article class="habit-item ${["today", "habits"].includes(currentPage) ? "reorderable" : ""} ${isCountHabit ? "count-habit" : ""} ${completeToday ? "complete" : ""} ${scheduledToday ? "" : "off-day"}" draggable="${["today", "habits"].includes(currentPage)}" data-habit-id="${habit.id}">
          ${control}
          <span class="habit-copy">
            <strong>${escapeHtml(habit.title)}</strong>
            <small class="habit-summary">${scheduledToday ? (completeToday ? "오늘 완료" : isCountHabit ? `${countProgress} / ${habit.targetValue}${escapeHtml(habit.unit)}` : `${habit.targetValue}${escapeHtml(habit.unit)}`) : "오늘은 쉬는 날"} · ${escapeHtml(formatHabitSchedule(habit))}${habit.measureType === "time" ? ` · 집중 ${formatFocusTime(habit.focusSeconds)}` : ""}</small>
            ${focusAction}
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
        const progress = getHabitProgress(habit, dateString);
        const progressRatio = getHabitProgressRatio(habit, dateString);
        const completed = progressRatio >= 1;
        const scheduled = isHabitScheduledOn(habit, date);
        const progressClass =
          habit.measureType === "count" && progressRatio > 0
            ? progressRatio >= 0.75
              ? "progress-3"
              : progressRatio >= 0.5
                ? "progress-2"
                : "progress-1"
            : "";
        const className = completed
          ? "completed"
          : progressClass || (scheduled ? "scheduled" : "inactive");
        const status =
          habit.measureType === "count" && scheduled
            ? `${progress} / ${habit.targetValue}${habit.unit}`
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
    .map((task) => ({ value: `task:${task.id}`, label: `할 일 · ${task.title}` }));
  const habits = state.habits
    .filter((habit) => isHabitScheduledToday(habit) && !isHabitCompleteToday(habit))
    .map((habit) => ({ value: `habit:${habit.id}`, label: `습관 · ${habit.title}` }));
  return [...tasks, ...habits];
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
            ${farmer.isMe ? "<small>나</small>" : "<small>임시 농부</small>"}
          </span>
          <strong class="farm-ranking-score">✦ ${farmer.score.toLocaleString("ko-KR")}</strong>
        </li>
      `;
    })
    .join("");
}

function getFarmMailSender(friendId) {
  if (friendId === SYSTEM_FARM_SENDER.id) return SYSTEM_FARM_SENDER;
  return MOCK_FARM_FRIENDS.find((friend) => friend.id === friendId) ?? null;
}

function getFarmGiftDetails(category, itemId, mail = null) {
  if (category === "rankingBox") {
    const boxCount = mail?.boxCropIds?.length ?? mail?.boxCount ?? 1;
    return {
      name: `작물 랜덤 박스 ${boxCount}개`,
      icon: "🎁",
      inventory: state.harvestInventory,
      categoryName: `주간 랭킹 ${mail?.ranking ?? ""}위 보상`,
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
  renderFarmRewardBoxes(mail);
  document.querySelector("#farmRewardBoxModal").classList.remove("hidden");
}

function closeFarmRewardBoxModal() {
  activeRankingRewardMailId = null;
  document.querySelector("#farmRewardBoxModal").classList.add("hidden");
}

function revealFarmRankingBox(mail, index) {
  const cropId = mail.boxCropIds?.[index];
  if (!CROPS[cropId]) return;
  const openedIndexes = getOpenedFarmRankingBoxIndexes(mail);
  if (openedIndexes.includes(index)) return;
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
  const friendList = document.querySelector("#farmMailFriendList");
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
  if (
    !remaining ||
    !friendList ||
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
  const unclaimedCount = state.farmInbox.filter((mail) => !mail.claimed).length;
  unreadCount.textContent = unclaimedCount;
  unreadCount.hidden = unclaimedCount === 0;
  headerUnreadCount.textContent = unclaimedCount > 99 ? "99+" : unclaimedCount;
  headerUnreadCount.hidden = unclaimedCount === 0;
  openMailButton.classList.toggle("has-unread", unclaimedCount > 0);
  openMailButton.setAttribute(
    "aria-label",
    unclaimedCount ? `농장 우편소 · 받지 않은 우편 ${unclaimedCount}통` : "농장 우편소",
  );

  inboxList.innerHTML = state.farmInbox.length
    ? state.farmInbox
        .map((mail) => {
          const friend = getFarmMailSender(mail.friendId);
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
                  ? mail.category === "rankingBox" ? "개봉 완료" : "수령 완료"
                  : mail.category === "rankingBox"
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

  friendList.innerHTML = MOCK_FARM_FRIENDS.map(
    (friend) => `
      <button class="farm-mail-friend ${selectedMailFriendId === friend.id ? "selected" : ""}" type="button" data-mail-friend="${friend.id}">
        <span>${friend.avatar}</span>
        <strong>${escapeHtml(friend.name)}</strong>
        <small>${escapeHtml(friend.farmName)}</small>
      </button>
    `,
  ).join("");

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
    remainingCount === 0 || !selectedMailFriendId || !selectedMailItemId;
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
  marketFarmMoney.textContent = state.farmMoney;
  modalFarmMoney.textContent = state.farmMoney;
  topFarmMoney.textContent = state.farmMoney;
  farmBalance.closest(".farm-wallet").classList.toggle("negative", state.coins < 0);
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

  const freePassTargets = getFreePassTargets();
  farmItemInventory.innerHTML = Object.entries(FARM_ITEMS)
    .map(([itemId, item]) => {
      const count = state.farmItemInventory[itemId] ?? 0;
      const targetPicker =
        itemId === "freePass" && count
          ? `
            <select id="freePassTarget" aria-label="프리패스 적용 대상">
              ${freePassTargets.length
                ? freePassTargets
                    .map(
                      (target) =>
                        `<option value="${target.value}">${escapeHtml(target.label)}</option>`,
                    )
                    .join("")
                : '<option value="">완료할 항목 없음</option>'}
            </select>
          `
          : "";
      const boostStatus =
        itemId === "goldenFestivalPass" && isProductionBoostActive()
          ? `<small class="boost-status">2배 효과 진행 중</small>`
          : itemId === "farmFestivalPass" && isWiltProtectionActive()
            ? `<small class="boost-status">시듦 방지 진행 중</small>`
          : "";
      return `
        <article
          class="farm-item-card farm-supply-item ${count ? "" : "empty"} ${selectedFarmItem === itemId ? "selected" : ""} ${itemId === "freePass" && count ? "target-item" : ""}"
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
          ${targetPicker}
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
    select.innerHTML = ingredientOptions;
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
            <div class="plot-growth-actions">
              <button type="button" data-grow-plot="${plot.id}" aria-label="${crop.name}에 1 Coin 주기">● 1</button>
              <button
                class="water-plot-button"
                type="button"
                data-water-plot="${plot.id}"
                aria-label="${waterRemaining ? `다음 무료 물주기까지 ${formatPlotWaterCooldown(waterRemaining)}` : `${crop.name}에 무료로 물 주기`}"
                ${waterRemaining ? "disabled" : ""}
              >💧 <span>${formatPlotWaterCooldown(waterRemaining)}</span></button>
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
    return !Number.isFinite(archivedTime) || now - archivedTime < archiveRetentionMs;
  });

  if (retainedTasks.length !== state.tasks.length) {
    state.tasks = retainedTasks;
    changed = true;
  }

  return changed;
}

function moveTaskTo(id, nextStatus) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || task.status === nextStatus) return;

  const previousStatus = task.status;
  task.status = nextStatus;
  let stoppedLinkedFocus = false;

  if (previousStatus !== "done" && nextStatus === "done") {
    const reward = productionCoinReward();
    task.completionReward = reward;
    task.completedWithFreePass = false;
    task.completedDate = toLocalDateString();
    state.coins += reward;
    if (activeFocus?.type === "task" && activeFocus.id === task.id) {
      activeFocus = null;
      stopFocusTimer();
      if (focusMode === "linked") {
        resetToFocus();
      } else {
        const linkedSettings = getFocusSettings("linked");
        focusRuntimeByMode.linked = {
          seconds: linkedSettings.focusMinutes * 60,
          phase: "focus",
          started: false,
        };
        updateMiniFocusTimer();
      }
      stoppedLinkedFocus = true;
    }
    showToast(
      stoppedLinkedFocus
        ? `완료 ${reward} Coin 획득 · 집중 측정 종료`
        : `완료 ${reward} Coin 획득`,
    );
  } else if (previousStatus === "done" && nextStatus !== "done") {
    state.coins -= task.completionReward ?? 1;
    task.completionReward = 0;
    task.completedDate = "";
    if (task.completedWithFreePass) {
      state.farmItemInventory.freePass += 1;
      task.completedWithFreePass = false;
    }
    showToast(`완료를 취소했어 현재 ${state.coins} Coin`);
  } else {
    showToast(nextStatus === "doing" ? "진행 중으로 옮겼어" : "대기로 옮겼어");
  }

  render();
}

function applyHabitCompletionChange(habit, wasComplete, complete) {
  if (wasComplete === complete) return null;
  const today = toLocalDateString();
  habit.complete = complete;
  habit.completedDate = complete ? today : "";
  habit.completionDates = complete
    ? [...new Set([...habit.completionDates, today])]
    : habit.completionDates.filter((date) => date !== today);

  if (complete) {
    const reward = productionCoinReward();
    state.coins += reward;
    habit.completionReward = reward;
    habit.completedWithFreePass = false;
    return { complete: true, reward };
  }

  const reward = habit.completionReward ?? 1;
  state.coins -= reward;
  habit.completionReward = 0;
  if (habit.completedWithFreePass) {
    state.farmItemInventory.freePass += 1;
    habit.completedWithFreePass = false;
  }
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
  showToast(
    result.complete
      ? `습관 완료 ${result.reward} Coin 획득`
      : `완료를 취소했어 현재 ${state.coins} Coin`,
  );
  renderHabitUpdates();
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
    habit.targetValue,
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
    showToast(`${nextProgress} / ${habit.targetValue}${habit.unit}`);
  }
  renderHabitUpdates();
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
  const totalSeconds = Math.max(
    1,
    (timerPhase === "focus" ? settings.focusMinutes : settings.breakMinutes) * 60,
  );
  const remainingRatio = Math.max(0, Math.min(1, focusSeconds / totalSeconds));
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
  timerRing.querySelector("span").textContent = timerPhase === "focus" ? "FOCUS" : "BREAK";
  updateMiniFocusTimer();
}

function updateMiniFocusTimer() {
  const fullTimerVisible = currentPage === "today" || currentPage === "focus";
  const linkedRuntime = focusRuntimeByMode.linked;
  const showLinkedTimer = linkedRuntime.started && (runningFocusMode === "linked" || focusMode === "linked");
  miniFocusTimer.hidden = !showLinkedTimer || fullTimerVisible;
  if (miniFocusTimer.hidden) return;

  const item = getFocusItem();
  const minutes = String(Math.floor(linkedRuntime.seconds / 60)).padStart(2, "0");
  const seconds = String(linkedRuntime.seconds % 60).padStart(2, "0");
  const linkedRunning = runningFocusMode === "linked";
  miniFocusStatus.textContent = linkedRuntime.phase === "break" ? "휴식 중" : linkedRunning ? "집중 중" : "일시정지";
  miniFocusTitle.textContent = linkedRuntime.phase === "break" ? "다음 집중을 위한 휴식" : item?.title ?? "항목 집중";
  miniFocusTime.textContent = `${minutes}:${seconds}`;
  miniFocusPause.textContent = linkedRunning ? "일시정지" : "계속";
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
    target.textContent = `그냥 ${settings.focusMinutes}분 집중해`;
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
  runningFocusMode = null;
  focusRunning = false;
}

function saveCurrentFocusRuntime() {
  focusRuntimeByMode[focusMode] = {
    seconds: focusSeconds,
    phase: timerPhase,
    started: focusSessionStarted,
  };
}

function addFocusSecond() {
  state.focusRewardSeconds += 1;

  if (state.focusRewardSeconds >= 3600) {
    state.focusRewardSeconds -= 3600;
    const reward = productionCoinReward();
    state.coins += reward;
    showToast(`집중 누적 60분 완료 ${reward} Coin을 받았어`);
  }
}

function resetToFocus() {
  const settings = getFocusSettings();
  focusSessionStarted = false;
  timerPhase = "focus";
  focusSeconds = settings.focusMinutes * 60;
  saveCurrentFocusRuntime();
  document.querySelector("#focusButton").innerHTML =
    `<span>▶</span> ${settings.focusMinutes}분 시작`;
  updateFocusDisplay();
  updateFocusTarget();
}

function finishFocusRuntime(mode) {
  const runtime = focusRuntimeByMode[mode];
  const settings = getFocusSettings(mode);
  const item = mode === "linked" ? getFocusItem() : null;
  let completedItem = false;

  if (item && activeFocus?.type === "task" && item.status !== "done") {
    item.status = "done";
    item.completedDate = toLocalDateString();
    item.completedWithFreePass = false;
    completedItem = true;
  }
  if (item && activeFocus?.type === "habit" && !isHabitCompleteToday(item)) {
    item.complete = true;
    item.completedDate = toLocalDateString();
    item.completionDates.push(toLocalDateString());
    item.completedWithFreePass = false;
    completedItem = true;
  }
  if (completedItem) {
    const reward = productionCoinReward();
    state.coins += reward;
    item.completionReward = reward;
  }

  clearInterval(focusInterval);
  runningFocusMode = null;
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
    document.querySelector("#focusButton").innerHTML = runtime.started
      ? `<span>▶</span> ${settings.breakMinutes}분 휴식`
      : `<span>▶</span> ${settings.focusMinutes}분 시작`;
    updateFocusDisplay();
    updateFocusTarget();
  }
  render();
  showToast(completedItem ? "집중 세트와 항목을 완료했어" : "집중 세트를 완료했어");
}

function finishBreakRuntime(mode) {
  const runtime = focusRuntimeByMode[mode];
  const settings = getFocusSettings(mode);
  clearInterval(focusInterval);
  runningFocusMode = null;
  runtime.phase = "focus";
  runtime.seconds = settings.focusMinutes * 60;
  runtime.started = false;
  if (focusMode === mode) {
    focusRunning = false;
    timerPhase = "focus";
    focusSeconds = runtime.seconds;
    focusSessionStarted = false;
    document.querySelector("#focusButton").innerHTML = `<span>▶</span> ${settings.focusMinutes}분 시작`;
    updateFocusDisplay();
    updateFocusTarget();
  }
  updateMiniFocusTimer();
  showToast("휴식 끝 다음 세트를 시작하면 돼");
}

function toggleFocus() {
  const button = document.querySelector("#focusButton");
  const runtime = focusRuntimeByMode[focusMode];

  if (runningFocusMode === focusMode) {
    clearInterval(focusInterval);
    runningFocusMode = null;
    focusRunning = false;
    button.innerHTML = "<span>▶</span> 계속하기";
    updateMiniFocusTimer();
    return;
  }

  if (runningFocusMode && runningFocusMode !== focusMode) {
    clearInterval(focusInterval);
  }

  runningFocusMode = focusMode;
  focusRunning = true;
  focusSessionStarted = true;
  runtime.started = true;
  runtime.phase = timerPhase;
  runtime.seconds = focusSeconds;

  const linkedItem = focusMode === "linked" ? getFocusItem() : null;
  if (activeFocus?.type === "task" && linkedItem?.status === "waiting") {
    linkedItem.status = "doing";
    renderTasks();
    saveState();
  }
  button.innerHTML = timerPhase === "focus"
    ? "<span>Ⅱ</span> 집중 멈춤"
    : "<span>Ⅱ</span> 휴식 멈춤";

  const startedMode = focusMode;
  focusInterval = setInterval(() => {
    const activeRuntime = focusRuntimeByMode[startedMode];
    activeRuntime.seconds -= 1;
    if (activeRuntime.phase === "focus") {
      const item = startedMode === "linked" ? getFocusItem() : null;
      if (item) item.focusSeconds = (item.focusSeconds ?? 0) + 1;
      addFocusSecond();
    }
    if (focusMode === startedMode) {
      focusSeconds = activeRuntime.seconds;
      timerPhase = activeRuntime.phase;
      updateFocusDisplay();
    } else {
      updateMiniFocusTimer();
    }
    if (activeRuntime.seconds <= 0) {
      if (activeRuntime.phase === "focus") finishFocusRuntime(startedMode);
      else finishBreakRuntime(startedMode);
      return;
    }
    saveState();
    if (activeRuntime.seconds % 10 === 0) renderSummary();
  }, 1000);
  updateMiniFocusTimer();
}

function endFocusSession() {
  stopFocusTimer();
  activeFocus = null;
  resetToFocus();
  renderFocusPicker();
  saveState();
  showToast("집중 측정을 종료했어");
}

function setFocusMode(mode) {
  saveCurrentFocusRuntime();
  focusMode = mode;
  const settings = getFocusSettings(mode);
  const runtime = focusRuntimeByMode[mode];
  timerPhase = runtime.phase;
  focusSeconds = runtime.seconds;
  focusSessionStarted = runtime.started;
  focusRunning = runningFocusMode === mode;

  document.querySelectorAll("[data-focus-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.focusMode === mode);
  });

  document.querySelector("#focusButton").innerHTML = focusRunning
    ? timerPhase === "focus"
      ? "<span>Ⅱ</span> 집중 멈춤"
      : "<span>Ⅱ</span> 휴식 멈춤"
    : focusSessionStarted
      ? "<span>▶</span> 계속하기"
      : `<span>▶</span> ${settings.focusMinutes}분 시작`;
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
  timerPhase = "focus";
  focusSessionStarted = false;
  activeFocus = { type, id };

  if (type === "task" && item.status === "waiting") item.status = "doing";
  focusSeconds = getFocusSettings("linked").focusMinutes * 60;
  saveCurrentFocusRuntime();
  document.querySelectorAll("[data-focus-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.focusMode === "linked");
  });
  updateFocusDisplay();
  updateFocusTarget();
  render();
  toggleFocus();
  showToast(`‘${item.title}’ 집중 측정을 시작했어`);
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

function closeHabitModal() {
  habitModal.classList.add("hidden");
  habitForm.classList.add("hidden");
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

openHabitFormButton.addEventListener("click", () => {
  if (currentPage !== "habits") return;
  habitModalFormSlot.appendChild(habitForm);
  habitModal.classList.remove("hidden");
  habitForm.classList.remove("hidden");
  window.setTimeout(() => habitInput.focus(), 0);
});

habitModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-habit-modal]")) closeHabitModal();
});

habitDeleteModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-cancel-habit-delete]")) closeHabitDeleteModal();
});

confirmHabitDelete.addEventListener("click", () => {
  if (pendingHabitDeleteId === null) return;
  state.habits = state.habits.filter((habit) => habit.id !== pendingHabitDeleteId);
  closeHabitDeleteModal();
  showToast("습관을 삭제했어");
  render();
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
}

habitMeasureType.addEventListener("change", syncHabitMeasureFields);

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
  const name = groupInput.value.trim();
  if (!name) return;
  if (state.groups.some((group) => group.name === name)) {
    showToast("이미 있는 그룹이야");
    return;
  }

  const group = {
    id: `group-${Date.now()}`,
    name,
    colorIndex: Math.floor(Math.random() * GROUP_COLOR_COUNT),
  };
  state.groups.push(group);
  groupInput.value = "";
  render();
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
  showToast(`‘${group?.name ?? "그룹"}’을 삭제하고 할 일은 그룹 없음으로 옮겼어`);
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
    completedDate: "",
  });
  taskInput.value = "";
  taskForm.classList.add("hidden");
  showToast("대기 목록에 추가했어");
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
  if (!unit) {
    showToast("목표 단위를 입력해");
    return;
  }
  state.habits.push({
    id: Date.now(),
    title,
    streak: 0,
    complete: false,
    completedDate: "",
    completionDates: [],
    progressByDate: {},
    focusSeconds: 0,
    measureType: habitMeasureType.value,
    targetValue,
    unit,
    weekdays,
    startDate: "",
    endDate: habitEndDate.value,
  });
  habitInput.value = "";
  habitMeasureType.value = "count";
  habitTargetValue.value = 1;
  habitUnit.value = "회";
  document
    .querySelectorAll('[name="habitWeekday"]')
    .forEach((input) => (input.checked = true));
  habitEndDate.value = "";
  syncHabitMeasureFields();
  closeHabitModal();
  showToast("새 습관을 추가했어");
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
      showToast("완료한 할 일을 보관함에 넣었어");
      render();
    }
    return;
  }
  if (restoreButton) {
    const task = state.tasks.find((item) => item.id === Number(restoreButton.dataset.restoreTask));
    if (task) {
      task.archived = false;
      task.archivedAt = "";
      task.completedDate = toLocalDateString();
      showToast("보관함에서 다시 꺼냈어");
      render();
    }
    return;
  }
  if (deleteButton) {
    state.tasks = state.tasks.filter((task) => task.id !== Number(deleteButton.dataset.deleteTask));
    showToast("할 일을 삭제했어");
    render();
  }
});

document.querySelector("#taskGroupFilters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-task-group-filter]");
  if (!button || taskArchiveView) return;
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

document.querySelector("#taskBoard").addEventListener("drop", (event) => {
  const column = event.target.closest("[data-status]");
  if (!column) return;

  event.preventDefault();
  const taskId = Number(event.dataTransfer.getData("text/plain"));
  const targetCard = event.target.closest(".task-card:not(.dragging)");
  const targetId = targetCard ? Number(targetCard.dataset.taskId) : null;
  const placeAfter = targetCard
    ? event.clientY >= targetCard.getBoundingClientRect().top + targetCard.offsetHeight / 2
    : false;
  document.querySelectorAll(".board-column").forEach((item) => item.classList.remove("drag-over"));
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) return;
  if (task.status !== column.dataset.status) moveTaskTo(taskId, column.dataset.status);
  reorderTask(taskId, column.dataset.status, targetId, placeAfter);
  renderTasks();
  saveState();
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
  event.dataTransfer.setData("text/x-habit-id", card.dataset.habitId);
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
  const habitId = Number(event.dataTransfer.getData("text/x-habit-id"));
  const target = event.target.closest(".habit-item:not(.dragging)");
  if (!habitId || !target) return;
  const targetId = Number(target.dataset.habitId);
  const sourceIndex = state.habits.findIndex((habit) => habit.id === habitId);
  if (sourceIndex < 0 || habitId === targetId) return;
  const placeAfter = event.clientY >= target.getBoundingClientRect().top + target.offsetHeight / 2;
  const [habit] = state.habits.splice(sourceIndex, 1);
  const targetIndex = state.habits.findIndex((entry) => entry.id === targetId);
  state.habits.splice(targetIndex + (placeAfter ? 1 : 0), 0, habit);
  renderHabits();
  saveState();
});

document.querySelector("#habitList").addEventListener("dragend", () => {
  document.querySelectorAll(".habit-item").forEach((card) => card.classList.remove("dragging", "drop-before", "drop-after"));
});

document.querySelector("#habitList").addEventListener("click", (event) => {
  const focusButton = event.target.closest("[data-focus-habit]");
  const toggleButton = event.target.closest("[data-toggle-habit]");
  const adjustButton = event.target.closest("[data-adjust-habit]");
  const deleteButton = event.target.closest("[data-delete-habit]");

  if (focusButton) startItemFocus("habit", Number(focusButton.dataset.focusHabit));
  if (toggleButton) toggleHabit(Number(toggleButton.dataset.toggleHabit));
  if (adjustButton) {
    adjustHabitCount(
      Number(adjustButton.dataset.adjustHabit),
      Number(adjustButton.dataset.delta),
    );
  }
  if (deleteButton) {
    const habitId = Number(deleteButton.dataset.deleteHabit);
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

  state.coins -= crop.seedPrice;
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
  state.farmMoney -= item.price;
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
    const targetValue = document.querySelector("#freePassTarget")?.value;
    if (!targetValue) {
      showToast("완료할 수 있는 항목이 없어");
      return;
    }
    const [targetType, rawId] = targetValue.split(":");
    const targetId = Number(rawId);
    const reward = productionCoinReward();
    if (targetType === "task") {
      const task = state.tasks.find((entry) => entry.id === targetId && entry.status !== "done");
      if (!task) return;
      task.status = "done";
      task.completedDate = toLocalDateString();
      task.completionReward = reward;
      task.completedWithFreePass = true;
    } else {
      const habit = state.habits.find((entry) => entry.id === targetId);
      if (!habit || isHabitCompleteToday(habit)) return;
      if (habit.measureType === "count") {
        habit.progressByDate ??= {};
        habit.progressByDate[toLocalDateString()] = habit.targetValue;
      }
      habit.complete = true;
      habit.completedDate = toLocalDateString();
      habit.completionDates.push(toLocalDateString());
      habit.completionReward = reward;
      habit.completedWithFreePass = true;
    }
    state.coins += reward;
    state.farmItemInventory[itemId] -= 1;
    showToast(`프리패스로 완료 처리했어 ${reward} Coin 획득`);
    render();
  }
});

document.querySelector("#farmGrid").addEventListener("click", (event) => {
  const plotElement = event.target.closest("[data-plot-id]");
  if (selectedFarmItem && plotElement) {
    const plot = state.farmPlots.find(
      (item) => item.id === Number(plotElement.dataset.plotId),
    );
    const itemId = selectedFarmItem;
    const item = FARM_ITEMS[itemId];
    if (!plot?.crop || !item || !state.farmItemInventory[itemId]) {
      showToast("작물이 심어진 밭에만 사용할 수 있어");
      return;
    }

    if (itemId === "revivalTonic") {
      if (!plot.wilted) {
        showToast("시든 작물에만 회복제를 사용할 수 있어");
        return;
      }
      plot.wilted = false;
      plot.lastWateredDate = toLocalDateString();
    } else if (itemId === "growthTonic") {
      if (plot.wilted || plot.growth >= getCropGrowthCost(plot.crop)) {
        showToast("성장 중인 작물에만 사용할 수 있어");
        return;
      }
      plot.growth = Math.min(getCropGrowthCost(plot.crop), plot.growth + 2);
      plot.lastWateredDate = toLocalDateString();
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
    return;
  }

  const plantButton = event.target.closest("[data-plant-plot]");
  const growButton = event.target.closest("[data-grow-plot]");
  const waterButton = event.target.closest("[data-water-plot]");
  const harvestButton = event.target.closest("[data-harvest-plot]");
  const discardButton = event.target.closest("[data-discard-plot]");

  if (plantButton) {
    if (!selectedSeed || !state.seedInventory[selectedSeed]) {
      showToast("씨앗 보관함에서 심을 씨앗을 먼저 골라");
      return;
    }

    const plot = state.farmPlots.find(
      (item) => item.id === Number(plantButton.dataset.plantPlot),
    );
    if (!plot || plot.crop) return;

    plot.crop = selectedSeed;
    plot.growth = 0;
    plot.plantedDate = toLocalDateString();
    plot.lastWateredDate = "";
    plot.wilted = false;
    state.seedInventory[selectedSeed] -= 1;
    const cropName = CROPS[selectedSeed].name;
    if (state.seedInventory[selectedSeed] === 0) selectedSeed = null;
    showToast(`${cropName} 씨앗을 심었어`);
    render();
    return;
  }

  if (discardButton) {
    const plot = state.farmPlots.find(
      (item) => item.id === Number(discardButton.dataset.discardPlot),
    );
    if (!plot?.crop || !plot.wilted) return;

    const cropName = CROPS[plot.crop].name;
    clearFarmPlot(plot);
    showToast(`시든 ${cropName}을 폐기했어`);
    render();
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

    plot.lastFreeWaterAt = Date.now();
    advanceFarmPlotGrowth(plot);
    showToast(
      plot.growth >= maxGrowth
        ? `물을 주니 ${crop.name}이 다 자랐어`
        : `물을 주니 ${crop.name}이 한 단계 자랐어`,
    );
    render();
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

    state.coins -= 1;
    advanceFarmPlotGrowth(plot);
    showToast(
      plot.growth >= maxGrowth
        ? `${crop.name}이 다 자랐어`
        : `${crop.name}이 한 단계 자랐어`,
    );
    render();
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

  state.foodInventory[recipeId] -= 1;
  earnFarmMoney(recipe.sellPrice);
  showToast(`${recipe.name}을 팔고 ${recipe.sellPrice} Farm Money를 받았어`);
  render();
});

document.querySelector("#cookRecipeButton").addEventListener("click", () => {
  const ingredientIds = [1, 2, 3]
    .map((index) => document.querySelector(`#recipeIngredient${index}`).value)
    .filter(Boolean);
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
    showToast("도감에 없는 조합이야 폐기물이 생겼어");
    render();
    return;
  }

  const [recipeId, recipe] = recipeEntry;
  state.foodInventory[recipeId] += 1;
  const firstDiscovery = !state.discoveredRecipes.includes(recipeId);
  if (firstDiscovery) state.discoveredRecipes.push(recipeId);
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
document.querySelector("#openFarmRanking").addEventListener("click", () => {
  renderFarmRanking();
  farmRankingModal.classList.remove("hidden");
});
farmRankingModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-farm-ranking]")) {
    farmRankingModal.classList.add("hidden");
  }
});
const farmMailModal = document.querySelector("#farmMailModal");
document.querySelector("#openFarmMail").addEventListener("click", () => {
  renderFarmMail();
  farmMailModal.classList.remove("hidden");
});
farmMailModal.addEventListener("click", (event) => {
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

  const claimButton = event.target.closest("[data-claim-farm-mail]");
  if (claimButton) {
    const mail = state.farmInbox.find((entry) => entry.id === claimButton.dataset.claimFarmMail);
    if (!mail || mail.claimed) return;
    const gift = getFarmGiftDetails(mail.category, mail.itemId, mail);
    if (!gift) return;
    if (mail.category === "rankingBox") {
      openFarmRewardBoxModal(mail);
      return;
    }
    gift.inventory[mail.itemId] = (gift.inventory[mail.itemId] ?? 0) + 1;
    mail.claimed = true;
    showToast(`${gift.name} 1개를 보관함에 넣었어`);
    render();
    return;
  }

  const friendButton = event.target.closest("[data-mail-friend]");
  if (friendButton) {
    selectedMailFriendId = friendButton.dataset.mailFriend;
    renderFarmMail();
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
document.querySelector("#sendFarmMail").addEventListener("click", () => {
  ensureDailyFarmMail();
  if (state.farmMailSentCount >= 3) {
    showToast("오늘 보낼 수 있는 우편을 모두 사용했어");
    return;
  }

  const friend = MOCK_FARM_FRIENDS.find((entry) => entry.id === selectedMailFriendId);
  const item = getFarmMailItems().find((entry) => entry.id === selectedMailItemId);
  if (!friend || !item || item.count < 1) {
    showToast("친구와 보낼 물건을 다시 골라줘");
    renderFarmMail();
    return;
  }

  item.inventory[item.id] -= 1;
  state.farmMailSentCount += 1;
  state.farmMailHistory.unshift({
    id: Date.now(),
    friendId: friend.id,
    friendName: friend.name,
    category: selectedMailCategory,
    itemId: item.id,
    itemName: item.name,
    sentTime: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
  });
  selectedMailItemId = null;
  showToast(`${friend.name}에게 ${item.name} 1개를 보냈어`);
  render();
});
const farmRewardBoxModal = document.querySelector("#farmRewardBoxModal");
farmRewardBoxModal.addEventListener("click", (event) => {
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
  revealFarmRankingBox(mail, Number(boxButton.dataset.openRewardBox));
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
    permanentMarketModal.classList.add("hidden");
    farmRankingModal.classList.add("hidden");
    farmMailModal.classList.add("hidden");
    farmKitchenModal.classList.add("hidden");
    Object.values(storageModals).forEach((modal) => modal.classList.add("hidden"));
    closeHabitModal();
    closeHabitDeleteModal();
    closeFocusItemMenu();
    closeTaskGroupMenu();
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
  const [type, id] = option.dataset.focusValue.split(":");
  activeFocus = type && id ? { type, id: Number(id) } : null;
  setFocusMode("linked");
  renderFocusPicker();
  closeFocusItemMenu();
  if (activeFocus) {
    const item = getFocusItem();
    showToast(`‘${item.title}’을 집중 항목으로 골랐어`);
  }
});

document.addEventListener("click", (event) => {
  if (!focusItemPicker.contains(event.target)) closeFocusItemMenu();
});

const focusPageStage = document.querySelector("#focusPageStage");
const focusFullscreenButton = document.querySelector("#toggleFocusFullscreen");
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
let focusNextAudio = null;
let focusPlaylistQueue = [];
let currentFocusTrack = null;
let focusBackgroundObjectUrl = null;

function openFocusBackgroundDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("farmodoro-focus-assets", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("backgrounds")) {
        request.result.createObjectStore("backgrounds");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readFocusBackground() {
  const database = await openFocusBackgroundDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction("backgrounds", "readonly")
      .objectStore("backgrounds")
      .get("custom");
    request.onsuccess = () => {
      database.close();
      resolve(request.result ?? null);
    };
    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  });
}

async function writeFocusBackground(file) {
  const database = await openFocusBackgroundDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("backgrounds", "readwrite");
    transaction.objectStore("backgrounds").put(file, "custom");
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

async function deleteFocusBackground() {
  const database = await openFocusBackgroundDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("backgrounds", "readwrite");
    transaction.objectStore("backgrounds").delete("custom");
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
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

focusBackgroundInput.addEventListener("change", async () => {
  const [file] = focusBackgroundInput.files;
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("이미지 파일만 배경으로 사용할 수 있어");
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    showToast("배경 이미지는 15MB 이하로 골라");
    return;
  }

  try {
    await writeFocusBackground(file);
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
    await deleteFocusBackground();
    applyFocusBackground(null);
    showToast("기본 집중 배경으로 돌렸어");
  } catch {
    showToast("기본 배경으로 변경하지 못했어");
  }
});

readFocusBackground()
  .then((file) => {
    if (file) applyFocusBackground(file);
  })
  .catch(() => {});

focusFullscreenButton.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement === focusPageStage) {
      await document.exitFullscreen();
    } else {
      await focusPageStage.requestFullscreen();
    }
  } catch {
    showToast("이 브라우저에서는 전체 화면을 사용할 수 없어");
  }
});

document.addEventListener("fullscreenchange", () => {
  const active = document.fullscreenElement === focusPageStage;
  focusFullscreenButton.innerHTML = active
    ? '<span aria-hidden="true">×</span> 전체 화면 종료'
    : '<span aria-hidden="true">⛶</span> 전체 화면';
});

function stopFocusAudio() {
  focusAudioPlayer?.pause();
  focusAudioButton.classList.remove("active");
  focusAudioButton.setAttribute("aria-pressed", "false");
  focusAudioButton.innerHTML = '<span aria-hidden="true">♪</span> 음악 계속 듣기';
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
  const audio = new Audio(track.src);
  audio.preload = "auto";
  audio.volume = 0.4;
  audio.dataset.title = track.title;
  audio.addEventListener("ended", playNextFocusTrack, { once: true });
  return audio;
}

function prepareNextFocusTrack() {
  if (focusNextAudio) return;
  focusNextAudio = createFocusAudio(takeNextFocusTrack());
  focusNextAudio.load();
}

async function playNextFocusTrack() {
  focusAudioPlayer = focusNextAudio ?? createFocusAudio(takeNextFocusTrack());
  focusNextAudio = null;
  currentFocusTrack = FOCUS_PLAYLIST.find(
    (track) => track.title === focusAudioPlayer.dataset.title,
  );
  prepareNextFocusTrack();
  try {
    await focusAudioPlayer.play();
  } catch {
    stopFocusAudio();
    showToast("음악을 재생하지 못했어");
    return;
  }
  focusAudioButton.classList.add("active");
  focusAudioButton.setAttribute("aria-pressed", "true");
  focusAudioButton.innerHTML = '<span aria-hidden="true">Ⅱ</span> 음악 끄기';
}

function startFocusAudio() {
  if (focusAudioPlayer && focusAudioPlayer.paused && !focusAudioPlayer.ended) {
    focusAudioPlayer.play().catch(() => showToast("음악을 재생하지 못했어"));
    focusAudioButton.classList.add("active");
    focusAudioButton.setAttribute("aria-pressed", "true");
    focusAudioButton.innerHTML = '<span aria-hidden="true">Ⅱ</span> 음악 끄기';
    return;
  }
  prepareNextFocusTrack();
  playNextFocusTrack();
}

focusAudioButton.addEventListener("click", () => {
  if (focusAudioPlayer && !focusAudioPlayer.paused) stopFocusAudio();
  else startFocusAudio();
});

const focusSettings = document.querySelector("#focusSettings");
const focusSettingsButton = document.querySelector("#toggleFocusSettings");
const focusMinutesInput = document.querySelector("#focusMinutesInput");
const breakEnabledInput = document.querySelector("#breakEnabledInput");
const breakMinutesInput = document.querySelector("#breakMinutesInput");

function syncFocusSettingsForm() {
  const settings = getFocusSettings();
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

document.querySelector("#saveFocusSettings").addEventListener("click", () => {
  const focusMinutes = Math.min(120, Math.max(5, Number(focusMinutesInput.value) || 25));
  const breakMinutes = Math.min(60, Math.max(1, Number(breakMinutesInput.value) || 5));

  state.settings[focusMode] = {
    focusMinutes,
    breakEnabled: breakEnabledInput.checked,
    breakMinutes,
  };
  if (runningFocusMode === focusMode) stopFocusTimer();
  resetToFocus();
  saveState();
  focusSettings.classList.add("hidden");
  showToast("집중 설정을 저장했어");
});

const todayWorkspace = document.querySelector("#todayWorkspace");
const taskSection = document.querySelector("#taskSection");
const habitSection = document.querySelector("#habitSection");
const summaryGrid = document.querySelector("#summaryGrid");
const focusCard = document.querySelector("#focusCard");
const focusPageSlot = document.querySelector("#focusPageSlot");

function showPage(page) {
  const validPage = APP_PAGES.includes(page) ? page : "today";
  localStorage.setItem(LAST_PAGE_STORAGE_KEY, validPage);

  if (currentPage !== validPage) {
    taskForm.classList.add("hidden");
    groupManager.classList.add("hidden");
  }

  if (validPage !== "habits" && !habitModal.classList.contains("hidden")) {
    closeHabitModal();
  }

  if (
    currentPage === "focus" &&
    validPage !== "focus" &&
    focusAudioPlayer &&
    !focusAudioPlayer.paused
  ) {
    stopFocusAudio();
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
  document.documentElement.classList.remove("app-initializing");
}

window.addEventListener("hashchange", () => {
  showPage(location.hash.slice(1));
});

document.querySelector("#openMiniFocus").addEventListener("click", () => {
  location.hash = "focus";
});

miniFocusPause.addEventListener("click", () => {
  if (!focusRuntimeByMode.linked.started) return;
  if (focusMode !== "linked") setFocusMode("linked");
  toggleFocus();
});

document.querySelector("#miniFocusStop").addEventListener("click", () => {
  if (focusMode !== "linked") setFocusMode("linked");
  endFocusSession();
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
  const archiveChanged = maintainTaskArchive();
  const farmChanged = updateWiltedCrops();
  const farmRankingChanged = ensureWeeklyFarmRanking();
  const farmMailChanged = ensureDailyFarmMail();
  const farmInboxChanged = ensureDailyFarmInbox();
  if (archiveChanged || farmChanged || farmRankingChanged || farmMailChanged || farmInboxChanged) render();
}, 60000);

render();
syncFocusSettingsForm();
syncHabitMeasureFields();
resetToFocus();
const savedPage = localStorage.getItem(LAST_PAGE_STORAGE_KEY);
const hashPage = location.hash.slice(1);
const initialPage = APP_PAGES.includes(hashPage)
  ? hashPage
  : APP_PAGES.includes(savedPage)
    ? savedPage
    : "today";
showPage(initialPage);
