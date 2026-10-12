/* A distinct default creation for each scenery; old choices remain available. */
(() => {
  "use strict";
  const previousTypes = id => {
    if (id === "tuxedoCat") return [];
    if (id === "space") return ["star", "planet"];
    if (["ocean", "bubbleField"].includes(id)) return ["coral", "pinkCoral", "sandcastle"];
    if (["iceKingdom", "christmas"].includes(id)) return ["snowman", "snowRabbit"];
    if (["galaxyNight", "moonGarden"].includes(id)) return ["star", "planet"];
    if (["volcano", "auroraNight"].includes(id)) return ["crystal", "roseCrystal"];
    if (id === "desertOasis") return ["cactus", "floweringCactus"];
    return ["tree", "blossomTree", "goldenTree"];
  };
  const definitions = [
    [null, "초록 정원", "tree", "초록 나무", "작은 새싹에서 풍성한 나무로 자라나.", ["새싹", "어린 나무", "풍성한 잎", "큰 나무"]],
    ["cherryBlossom", "벚꽃", "cherryTree", "벚꽃나무", "가지에 꽃봉오리가 맺히고 벚꽃이 만개해.", ["작은 가지", "꽃봉오리", "꽃이 피기 시작해", "벚꽃 만개"]],
    ["goldenHarvest", "황금 들판", "goldenWheat", "황금 이삭 무리", "가느다란 싹이 자라 황금빛 이삭이 돼.", ["어린 풀", "초록 줄기", "이삭이 맺혀", "황금빛 이삭"]],
    ["springMeadow", "봄날 들판", "tulipPatch", "튤립 꽃밭", "잎 사이에서 여러 빛깔의 튤립이 피어나.", ["잎이 돋아", "줄기가 자라", "튤립 봉오리", "알록달록 만개"]],
    ["lavenderField", "라벤더 정원", "lavenderPatch", "라벤더 무리", "가느다란 꽃대가 보랏빛 라벤더로 물들어.", ["작은 잎", "꽃대가 자라", "보라색 꽃망울", "풍성한 라벤더"]],
    ["valentine", "발렌타인", "heartRose", "하트 장미 덩굴", "덩굴이 하트를 만들고 장미꽃이 피어나.", ["장미 새싹", "덩굴이 뻗어", "하트와 꽃봉오리", "장미 하트 완성"]],
    ["halloween", "할로윈", "jackOLantern", "잭오랜턴", "호박을 키우고 얼굴을 새겨 등불을 밝혀.", ["호박 새싹", "작은 호박", "얼굴을 새겨", "등불이 켜져"]],
    ["christmas", "크리스마스", "christmasTree", "크리스마스 트리", "전나무를 키우고 반짝이는 장식을 더해.", ["작은 전나무", "전나무가 자라", "장식을 달아", "반짝이는 트리"]],
    ["whiteDay", "화이트데이", "candyBouquet", "사탕 꽃다발", "작은 사탕을 모아 리본으로 꽃다발을 완성해.", ["사탕 한 송이", "세 송이가 모여", "풍성한 다발", "포장과 리본"]],
    ["peperoDay", "빼빼로데이", "biscuitTower", "초콜릿 과자 탑", "과자를 차곡차곡 쌓아 달콤한 탑을 완성해.", ["과자 한 조각", "탑의 뼈대", "차곡차곡 쌓아", "달콤한 탑 완성"]],
    ["ocean", "바다", "coral", "산호", "작은 산호 가지가 넓고 풍성한 무리로 자라나.", ["산호 싹", "가지가 뻗어", "산호 무리", "풍성한 산호"]],
    ["bubbleField", "거품 밭", "bubbleFountain", "거품 분수", "물방울이 모여 무지갯빛 거품 분수가 돼.", ["물방울 하나", "거품이 모여", "작은 거품 분수", "무지갯빛 분수"]],
    ["rainyGarden", "비 오는 정원", "mushroomGarden", "버섯 정원", "촉촉한 이끼 위로 작은 버섯들이 피어나.", ["버섯 싹", "작은 버섯", "버섯이 모여", "촉촉한 버섯 정원"]],
    ["iceKingdom", "얼음 왕국", "snowman", "눈사람", "눈을 쌓고 얼굴과 목도리를 더해 눈사람을 완성해.", ["눈덩이", "몸과 머리", "얼굴과 목도리", "눈사람 완성"]],
    ["desertOasis", "사막 오아시스", "cactus", "꽃 선인장", "선인장의 팔이 자라고 사막의 꽃이 피어나.", ["작은 선인장", "팔이 자라", "꽃봉오리", "선인장 꽃 만개"]],
    ["volcano", "용암", "volcanoCrystal", "용암 수정", "붉은 광석이 용암빛을 품은 검은 수정 기둥으로 자라나.", ["붉은 광석", "수정이 솟아", "용암빛 기둥", "타오르는 수정"]],
    ["galaxyNight", "은하수 밤", "galaxyPlanet", "작은 행성", "별 먼지가 모이고 고리가 생겨 작은 행성이 돼.", ["별 먼지", "작은 구체", "고리가 생겨", "행성 완성"]],
    ["auroraNight", "오로라", "auroraCrystal", "오로라 수정", "투명한 수정에 오로라가 감겨 빛나는 탑이 돼.", ["수정 조각", "수정 기둥", "오로라가 감겨", "빛나는 오로라 수정"]],
    ["moonGarden", "달빛 정원", "moonFlower", "달빛 꽃", "은빛 꽃봉오리가 달빛 아래 피어나.", ["은빛 새싹", "달빛 꽃봉오리", "은빛 꽃잎", "달빛 꽃 만개"]],
    ["space", "우주", "spaceTree", "우주 나무", "별빛 새싹이 자라 행성 고리를 두른 우주 나무가 돼.", ["별빛 새싹", "어린 별나무", "별꽃이 맺혀", "우주 나무 완성"]],
    ["tuxedoCat", "고양이 동산", "tuxedoCat", "턱시도 고양이", "푸른 나무와 꽃 사이로 턱시도·치즈·페르시안 고양이들이 쉬어 가는 동산.", ["작은 새끼 고양이", "호기심 많은 아기 고양이", "쑥쑥 자라는 고양이", "다 자란 턱시도 고양이"]],
  ];
  const themes = Object.freeze(definitions.map(([id, name, defaultType, subject, description, stageLabels]) => Object.freeze({
    id, name, defaultType, subject, description, stageLabels: Object.freeze(stageLabels),
    types: Object.freeze([...new Set([defaultType, ...previousTypes(id)])]),
  })));
  const originalTypes = new Set(["tree", "coral", "snowman", "cactus"]);
  const newTypes = Object.freeze(themes.filter(item => !originalTypes.has(item.defaultType)).map(item => Object.freeze({
    id: item.defaultType, name: item.subject, family: item.defaultType, variant: 0, unlockPrice: 0, growthCost: 20, reward: 50,
  })));
  const theme = id => themes.find(item => item.id === (id || null)) || themes[0];
  window.SceneryThemePresets = Object.freeze({
    themes, newTypes, theme, themeTypes: id => [...theme(id).types], defaultType: id => theme(id).defaultType,
  });
})();
