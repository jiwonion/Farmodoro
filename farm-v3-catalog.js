/* Shared visual catalog. Prices and ownership are always confirmed by the RPC. */
(() => {
  "use strict";
  const crops = [
    ["carrot","당근",3], ["potato","감자",3], ["strawberry","딸기",4], ["tomato","토마토",4], ["pumpkin","호박",6],
    ["corn","옥수수",4], ["sweetPotato","고구마",4], ["eggplant","가지",4], ["pepper","피망",4], ["cucumber","오이",4],
    ["onion","양파",3], ["garlic","마늘",3], ["cabbage","배추",3], ["broccoli","브로콜리",4], ["watermelon","수박",6],
    ["melon","멜론",6], ["rice","벼",4], ["mushroom","버섯",3], ["sunflower","해바라기",4], ["beet","비트",3],
    ["radish","무",3], ["turnip","순무",3], ["chili","고추",4], ["lettuce","상추",3], ["spinach","시금치",3],
    ["kale","케일",3], ["celery","셀러리",3], ["pea","완두콩",3], ["bean","콩",4], ["peanut","땅콩",4],
    ["wheat","밀",3], ["barley","보리",3], ["oat","귀리",4], ["grape","포도",6], ["blueberry","블루베리",6],
    ["raspberry","라즈베리",6], ["apple","사과",7], ["pear","배",7], ["peach","복숭아",7], ["cherry","체리",7],
    ["lemon","레몬",7], ["orange","오렌지",7], ["pineapple","파인애플",6], ["kiwi","키위",7], ["pumpkinSquash","단호박",5],
    ["daikon","열무",3], ["edamame","풋콩",4], ["bokchoy","청경채",3], ["chestnut","밤",7], ["fig","무화과",7],
    ["plum","자두",6], ["mango","망고",7], ["passionFruit","패션프루트",6], ["bellFlower","도라지",4],
    ["sweetCorn","찰옥수수",5], ["truffle","트러플",5], ["lavender","라벤더",4],
  ];
  const fish = [["minnow","피라미",2],["crucian","붕어",3],["carp","잉어",4],["trout","송어",4],["catfish","메기",5],["koi","비단잉어",6],["perch","농어",6],["salmon","연어",7]];
  const outfitSpecs = [
    ["blue","파랑 작업복","#76b8ea","#254b85",0,0], ["green","새싹 작업복","#8bbf79","#3a6844",0,0],
    ["cream","크림 작업복","#eeddb1","#805e42",0,0], ["rose","장미 작업복","#e9a2ae","#8b4b66",3,0],
    ["lavender","라벤더 작업복","#b8a1df","#5d5187",0,3], ["sunny","햇살 작업복","#f0c35d","#976830",6,0],
    ["ocean","바다 작업복","#73cdd8","#215b78",0,6], ["autumn","가을 작업복","#d69b63","#795040",10,0],
    ["mint","민트 작업복","#a5d8be","#3d7364",5,5], ["night","밤하늘 작업복","#697aae","#303852",0,12],
    ["peach","복숭아 작업복","#f2ba9d","#a36b75",18,0], ["festival","축제 작업복","#df8175","#6553a1",15,15],
  ];
  const hatSpecs = [["straw","밀짚모자",1,0],["cap","빨간 캡",0,0],["bucket","낚시 모자",0,1],["beret","크림 베레모",4,0],["beanie","밤색 비니",0,5],["crown","작은 왕관",25,20],["flowers","꽃 화관",8,4],["explorer","탐험가 모자",12,12]];
  const decorSpecs = [["sign","첫 수확 표지판",1,0,0],["flowers","작은 화단",0,0,3],["crate","수확 바구니",5,0,0],["well","정원 우물",12,0,0],["fence","포근한 울타리",8,5,0],["lantern","물가 화단",0,3,0]];
  const characterSpecs = [
    ["sprout-slime","새싹 슬라임",0,0,"멍하니 있어도 새싹은 쑥쑥."],
    ["aqua-slime","물방울 슬라임",0,10,"물가에서 둥실둥실 쉬는 친구."],
    ["berry-slime","딸기 젤리",25,0,"달콤한 딸기밭에서 찾아왔어."],
    ["mushroom","버섯 친구",60,0,"커다란 버섯 모자 아래 작은 미소."],
    ["jelly-cat","젤리 고양이",120,0,"말랑한 발로 광장을 산책해."],
    ["cloud-puff","구름 친구",100,60,"별생각 없이 둥실 떠 있는 구름."],
    ["star-slime","별빛 슬라임",0,150,"머리 위 작은 별과 함께 쉬어가."],
    ["royal-slime","왕관 슬라임",300,200,"왕관은 근사하고 표정은 느긋해."],
  ];
  const items = [
    ...crops.map(([id,name,cost],i)=>({kind:"crop",id,name,cost,harvests:i<5?0:(i-4)*2,fish:0,cropTypes:0,fishTypes:0,art:id})),
    ...fish.map(([id,name,cost],i)=>({kind:"fish",id,name,cost,harvests:0,fish:i<2?0:(i-1)*3,cropTypes:0,fishTypes:0,art:i})),
    ...outfitSpecs.map(([id,name,shirt,pants,harvests,fish])=>({kind:"outfit",id,name,cost:0,harvests,fish,cropTypes:0,fishTypes:0,shirt,pants})),
    ...hatSpecs.map(([id,name,harvests,fish],i)=>({kind:"hat",id,name,cost:0,harvests,fish,cropTypes:0,fishTypes:0,art:i+8})),
    ...decorSpecs.map(([id,name,harvests,fish,cropTypes])=>({kind:"decor",id,name,cost:0,harvests,fish,cropTypes,fishTypes:0})),
    ...characterSpecs.map(([id,name,harvests,fish,description],art)=>({kind:"character",id,name,cost:0,harvests,fish,cropTypes:0,fishTypes:0,art,description})),
  ].map((item,order)=>({...item,order}));
  // Five starter crops form five independent paths. Each later crop needs
  // harvests of the previous crop on its path, rather than a cheap total.
  const activeItems=items.filter(item=>!['outfit','hat'].includes(item.kind)).map(item=>{
    if(item.kind!=='crop')return {...item,cropRequirements:[]};
    const index=crops.findIndex(([id])=>id===item.id);
    return {...item,harvests:0,cropRequirements:index<5?[]:[{id:crops[index-5][0],count:Math.min(8,3+Math.floor((index-5)/5))}]};
  });
  window.FarmV3Catalog = {
    items:activeItems,
    legacyItems:items.filter(item=>item.kind!=='character'),
    defaultCharacter:'sprout-slime',
    recommendedAvatar:{gender:"female",skin:0,hair:0,style:2,eyes:0,nose:0,mouth:0,outfit:"cream",top:"cream",bottom:"cream",shoes:"cream",hat:null},
    genders:[{id:"male",name:"남성"},{id:"female",name:"여성"},{id:"neutral",name:"중성"}],
    hairStyles:["짧은 머리","단발·웨이브","묶은 머리","없음"],
    eyeStyles:["반짝이는 눈","차분한 눈","눈웃음","없음"],
    noseStyles:["작은 점","둥근 코","짧은 선","없음"],
    mouthStyles:["미소","활짝 웃기","무표정","없음"],
    skinColors:["#f4cfb0","#dfad87","#bd865f","#87583d","#684633"],
    hairColors:["#79503b","#211f28","#83502d","#d1a34e","#b57358","#b2a7c3","#77959b","#d27c9d"],
    find:(kind,id)=>activeItems.find(item=>item.kind===kind&&item.id===id)||items.find(item=>item.kind===kind&&item.id===id),
  };
})();
