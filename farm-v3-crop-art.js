/* Reused crop-only atlas mappings from 98e9bd9^; no retired game logic. */
(() => {
  const root = "./assets/garden-v2";
  const sceneRoot = "./assets/garden-v3";
  const themeRoot = "./assets/garden-v4";
  const originalCropIds = ["carrot", "strawberry", "wheat", "potato", "pumpkin", "onion", "mushroom", "tomato", "corn", "apple", "lemon", "rice"];
  // Bounds describe the painted object, rather than the padded grid cell.
  // A few original sprites cross their nominal cell, so equal-grid frames
  // would cut off leaves and roots even after the layout was centred.
  const originalCropBounds = [[68,28,304,328],[438,61,243,280],[790,28,269,333],[1114,82,295,260],[46,404,298,289],[434,377,250,322],[788,416,289,271],[1134,415,273,271],[71,708,311,332],[427,737,273,288],[779,736,296,292],[1137,715,286,324]];
  const originalPlantBounds = [[45,45,310,319],[406,101,305,260],[753,55,303,316],[1097,84,314,283],[34,428,339,262],[413,395,277,291],[756,485,289,201],[1094,411,322,279],[41,703,306,324],[422,717,276,307],[771,725,267,305],[1123,736,280,291]];
  const stageBounds = [[172,311,189,84],[589,277,187,132],[945,158,306,274],[1372,126,321,303],[100,621,298,202],[501,533,345,282],[933,519,318,296],[1346,547,355,268]];
  const cropAtlases = [
    { ids: originalCropIds, crop: `${root}/crop-atlas.png`, plant: `${sceneRoot}/plants-atlas.png`, width:1448, height:1086, cropBounds:originalCropBounds, plantBounds:originalPlantBounds },
    { ids:["sweetPotato","eggplant","pepper","cucumber","garlic","cabbage","broccoli","beet","radish","turnip","chili","lettuce"], crop:"./assets/garden-v6/crop-vegetables.png", plant:"./assets/garden-v6/plants-vegetables.png", width:1448, height:1086, cropBounds:[[32,80,333,270],[421,43,280,309],[771,50,258,298],[1108,66,308,285],[40,411,328,283],[432,367,259,346],[728,383,335,320],[1115,367,305,350],[29,710,363,339],[429,721,278,320],[729,725,312,317],[1094,739,328,299]], plantBounds:[[28,63,331,299],[392,46,320,316],[743,46,313,316],[1099,57,322,304],[37,385,319,311],[383,385,329,307],[738,405,340,292],[1098,379,325,316],[28,706,328,333],[392,709,321,327],[743,718,324,317],[1097,762,326,273]] },
    { ids:["spinach","kale","celery","pea","bean","peanut","barley","oat","daikon","edamame","bokchoy","sweetCorn"], crop:"./assets/garden-v6/crop-grains.png", plant:"./assets/garden-v6/plants-grains.png", width:1448, height:1086, cropBounds:[[43,43,328,324],[393,55,331,312],[770,34,302,333],[1094,62,314,292],[35,398,330,287],[424,413,283,273],[763,371,324,325],[1104,395,307,300],[42,709,336,340],[401,735,320,304],[739,707,335,338],[1109,715,323,337]], plantBounds:[[30,100,331,277],[389,75,346,301],[758,58,286,319],[1098,77,324,299],[33,405,331,295],[397,415,334,285],[753,385,307,314],[1108,401,317,298],[30,716,336,315],[405,722,321,307],[745,729,321,302],[1099,709,328,322]] },
    { ids:["watermelon","melon","grape","blueberry","raspberry","pear","peach","cherry","orange","pineapple","kiwi","chestnut"], crop:"./assets/garden-v6/crop-fruits.png", plant:"./assets/garden-v6/plants-fruits.png", width:1448, height:1086, cropBounds:[[62,52,318,333],[425,68,278,305],[764,61,310,322],[1100,113,292,253],[49,426,332,277],[411,410,310,286],[760,410,307,290],[1105,406,303,294],[43,731,329,299],[415,703,287,349],[743,764,319,262],[1095,743,324,288]], plantBounds:[[27,79,340,287],[403,88,316,281],[764,51,311,316],[1105,72,318,297],[33,398,315,301],[396,390,319,308],[753,388,327,314],[1106,387,319,312],[31,714,330,324],[387,719,335,323],[749,722,321,314],[1112,714,307,323]] },
    { ids:["fig","plum","mango","passionFruit","pumpkinSquash","sunflower","bellFlower","truffle","lavender"], crop:"./assets/garden-v6/crop-special.png", plant:"./assets/garden-v6/plants-special.png", width:1448, height:1086, cropBounds:[[49,101,314,287],[419,102,277,289],[748,91,304,297],[1110,103,298,285],[41,429,328,283],[402,412,312,316],[748,407,313,326],[1102,450,312,254],[49,735,320,319]], plantBounds:[[31,50,329,334],[387,46,329,338],[749,33,320,351],[1105,65,319,325],[26,458,359,283],[417,412,283,327],[755,437,296,305],[1118,435,297,303],[26,765,324,290]] },
  ];
  const cropArtwork = new Map();
  for (const atlas of cropAtlases) atlas.ids.forEach((id,index) => cropArtwork.set(id,{atlas,index}));
  function paintedSprite(className, source, width, height, bounds) {
    const padding = 3;
    const [left,top,paintedWidth,paintedHeight] = bounds;
    const clip = [left-padding,top-padding,paintedWidth+padding*2,paintedHeight+padding*2];
    const scale = 100 / Math.max(clip[2],clip[3]);
    const fittedWidth = clip[2]*scale, fittedHeight = clip[3]*scale;
    // The inner viewport clips the full atlas before fitting to a square.
    // Native proportions and equal padding keep the painted centre at 50%.
    return `<svg class="${className}" aria-hidden="true" viewBox="0 0 100 100"><svg x="${(100-fittedWidth)/2}" y="${(100-fittedHeight)/2}" width="${fittedWidth}" height="${fittedHeight}" viewBox="${clip.join(" ")}" preserveAspectRatio="none" overflow="hidden"><image href="${source}" width="${width}" height="${height}"/></svg></svg>`;
  }
  function crop(id) {
    const art = cropArtwork.get(id);
    return art ? paintedSprite("garden-crop-art garden-crop-svg",art.atlas.crop,art.atlas.width,art.atlas.height,art.atlas.cropBounds[art.index]) : typeof cropPixel === "function" ? cropPixel(id) : "";
  }
  function plantedCrop(id, stage = "mature") {
    const stages = {seed:0,sprout:1,growing:2,flower:6,wilted:4};
    if (stage in stages) return paintedSprite(`garden-plant-art garden-plant-${stage} garden-plant-svg`,`${sceneRoot}/stages-atlas.png`,1774,887,stageBounds[stages[stage]]);
    const art = cropArtwork.get(id);
    return art ? paintedSprite("garden-plant-art garden-plant-mature garden-plant-svg",art.atlas.plant,art.atlas.width,art.atlas.height,art.atlas.plantBounds[art.index]) : "";
  }
  window.FarmV3CropArt = { crop, plantedCrop };
})();
