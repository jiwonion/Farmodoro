/* Theme scenery artwork and terrain rendering. */
(() => {
  const sceneRoot = "./assets/garden-v3";
  const themeRoot = "./assets/garden-v4";
  function theme(id) {
    if (id === "tuxedoCat") return { url: "./assets/scenery-creations/cat-park-scene-v1.png", size: "100% 100%", index: 0, x: 0, y: 0, thumbnailY: 0, filter: "none" };
    if (id === "space") return { url: "./assets/scenery-creations/space-scene-v1.png", size: "100% 100%", index: 0, x: 0, y: 0, thumbnailY: 0, filter: "none" };
    if (id === "ocean") return { url: "./assets/scenery-creations/ocean-scene-v1.png", size: "100% 100%", index: 0, x: 0, y: 0, thumbnailY: 0, filter: "none" };
    const themes = {
      cherryBlossom: [`${sceneRoot}/terrain-atlas.png`, 1], galaxyNight: [`${sceneRoot}/terrain-atlas.png`, 2],
      springMeadow: [`${themeRoot}/cozy-atlas.png`, 0], goldenHarvest: [`${themeRoot}/cozy-atlas.png`, 1],
      valentine: [`${themeRoot}/cozy-atlas.png`, 2], whiteDay: [`${themeRoot}/cozy-atlas.png`, 3],
      volcano: [`${themeRoot}/festivals-atlas.png`, 0], halloween: [`${themeRoot}/festivals-atlas.png`, 1],
      peperoDay: [`${themeRoot}/festivals-atlas.png`, 2], christmas: [`${themeRoot}/festivals-atlas.png`, 3],
      auroraNight: [`${themeRoot}/fantasy-atlas.png`, 0], ocean: [`${themeRoot}/fantasy-atlas.png`, 1],
      bubbleField: [`${themeRoot}/fantasy-atlas.png`, 2], iceKingdom: [`${themeRoot}/fantasy-atlas.png`, 3],
      lavenderField: [`${themeRoot}/seasons-atlas.png`, 0], rainyGarden: [`${themeRoot}/seasons-atlas.png`, 1],
      lavender: [`${themeRoot}/seasons-atlas.png`, 0],
      desertOasis: [`${themeRoot}/seasons-atlas.png`, 2], moonGarden: [`${themeRoot}/seasons-atlas.png`, 3],
    };
    const [url, index] = themes[id] || [`${sceneRoot}/terrain-atlas.png`, 0];
    return { url, size: "200% auto", index, x: index % 2 * 100, y: Math.floor(index / 2) * 100, thumbnailY: index < 2 ? 14.864865 : 85.135135, filter: "none" };
  }
  function renderTerrain(scene, themeId) {
    if (!scene) return;
    let terrain = scene.querySelector(":scope > .garden-terrain");
    if (!terrain) {
      terrain = document.createElement("div");
      terrain.className = "garden-terrain";
      terrain.setAttribute("aria-hidden", "true");
      scene.prepend(terrain);
    }
    const value = theme(themeId);
    terrain.style.backgroundImage = `url('${value.url}')`;
    terrain.style.backgroundSize = value.size;
    terrain.style.backgroundPosition = `${value.x}% ${value.y}%`;
    terrain.style.filter = value.filter;
  }
  window.FarmGardenArt = { theme, renderTerrain };
  if (typeof renderFarm === "function") renderFarm();
})();
