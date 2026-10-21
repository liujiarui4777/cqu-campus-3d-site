/* 重庆大学 A 区 + B 区三维校园 —— 场景入口（原生 ES module，不依赖构建工具） */
const Cesium = window.Cesium;

const CENTER = [106.4615, 29.5695];
const BASE = new URL('./', document.baseURI).href;

const dom = {
  boot: document.getElementById('boot'),
  bootText: document.getElementById('boot-text'),
  stats: document.getElementById('stats'),
  error: document.getElementById('error'),
};

function setStatus(t) {
  if (dom.bootText) dom.bootText.textContent = t;
}

function showError(e) {
  console.error(e);
  if (dom.error) {
    dom.error.style.display = 'block';
    dom.error.textContent = '加载失败：' + (e && e.message ? e.message : String(e));
  }
  if (dom.boot) dom.boot.style.display = 'none';
}

/* ---------------- 场景初始化 ---------------- */
const viewer = new Cesium.Viewer('cesium-root', {
  baseLayer: false,
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  creditContainer: document.createElement('div'),
  contextOptions: { webgl: { alpha: false, antialias: true } },
});

const scene = viewer.scene;
const globe = scene.globe;
globe.baseColor = Cesium.Color.fromCssColorString('#e9e6de');
globe.showGroundAtmosphere = false;
globe.enableLighting = false;
globe.showWaterEffect = false;
globe.depthTestAgainstTerrain = true;
scene.skyBox.show = false;
scene.skyAtmosphere.show = false;
scene.fog.enabled = false;
scene.backgroundColor = Cesium.Color.fromCssColorString('#e9e6de');
scene.globe.maximumScreenSpaceError = 1.6;
scene.screenSpaceCameraController.minimumZoomDistance = 18;
// 地图覆盖 15 km，允许拉到能看全整张底图的高度
scene.screenSpaceCameraController.maximumZoomDistance = 22000;

const credit = viewer.cesiumWidget.creditContainer;
if (credit) credit.style.display = 'none';

// 窗口尺寸变化时强制重算画布，保证地图始终铺满浏览器
window.addEventListener('resize', () => {
  viewer.resize();
  viewer.scene.requestRender();
});

// 全景：A 区 + B 区 + C 区居中，约 2.5 km 视野
const HOME_VIEW = {
  destination: Cesium.Cartesian3.fromDegrees(106.4585, 29.5520, 1950),
  orientation: {
    heading: Cesium.Math.toRadians(4),
    pitch: Cesium.Math.toRadians(-47),
    roll: 0,
  },
};

function overview(animate) {
  if (animate) {
    viewer.camera.flyTo({ ...HOME_VIEW, duration: 1.7 });
  } else {
    viewer.camera.setView(HOME_VIEW);
  }
}
overview(false);

import { loadTerrain } from './terrain.js';
import { addAreas, addRoads, addBuildings, addBoundary, addRiver } from './build.js';
import { addLandmarks } from './landmarks.js';
import { createBasemapProvider } from './basemap.js';
import { initInteraction } from './ui.js';
import { addTrees } from './trees.js';
import { buildRoadGraph, nearestNode, shortestPath } from './nav.js';
import { addLamps } from './lamps.js';
import { addRoofProps } from './props.js';
import { addGates } from './gates.js';
import { addSports } from './sports.js';
import { addSurroundings } from './surroundings.js';
import { addBuildingLabels } from './labels.js';

(async () => {
  try {
    setStatus('正在加载地形…');
    const terrain = await loadTerrain(BASE, Cesium);
    viewer.scene.terrainProvider = terrain.provider;

    setStatus('正在铺设地面…');
    // 大图版本号：影像/底图改了必须换版本，否则浏览器缓存会让用户看到旧图
    const ASSET_V = '20261027b';
    const layers = {};
    // 首屏只铺 A/B/C 区精细底图（约 0.8 MB），10 km / 20 km 底图与地形后台补全
    const basemap = await createBasemapProvider(BASE, Cesium, terrain.meta, 'basemap.jpg', ASSET_V);
    layers.style = viewer.scene.imageryLayers.addImageryProvider(basemap);
    let esriLayer = null;
    // 卫星影像按需加载：默认不下载 4 MB 的 esri.jpg，第一次打开「卫星影像」时才拉取
    async function ensureEsri() {
      if (esriLayer) return esriLayer;
      // data/esri.jpg 的实际范围（比精细底图稍大，偏移约 100 m，必须单独指定）
      const ESRI_META = { west: 106.4500, south: 29.5530, east: 106.4800, north: 29.5820 };
      const esri = await createBasemapProvider(BASE, Cesium, ESRI_META, 'esri.jpg', ASSET_V);
      esriLayer = viewer.scene.imageryLayers.addImageryProvider(esri);
      esriLayer.show = false;
      layers.esri = esriLayer;
      return esriLayer;
    }
    window.__ensureEsri = ensureEsri;
    layers.esri = null;
    window.__layers = layers;

    setStatus('正在生成建筑…');
    const only = new URLSearchParams(location.search).get('only');
    // 白模与场景数据并行拉取，白模不阻塞首屏
    const whiteP = !only || only === 'surroundings'
      ? addSurroundings(viewer, BASE, terrain).then((n) => {
          window.__surroundCount = n;
          return n;
        }).catch(() => 0)
      : Promise.resolve(0);
    const data = await fetch(BASE + 'data/scene.json?v=' + ASSET_V).then((r) => r.json());

    if (!only || only === 'areas') addAreas(viewer, data, terrain);
    if (!only || only === 'river') addRiver(viewer, data, terrain);
    if (!only || only === 'roads') addRoads(viewer, data, terrain);
    const glbMode = new URLSearchParams(location.search).get('glb') === '1';
    if ((!only || only === 'buildings') && !glbMode) addBuildings(viewer, data, terrain);
    if (!only || only === 'landmarks') addLandmarks(viewer, data, terrain);
    if (!only || only === 'trees') window.__treeCount = addTrees(viewer, data, terrain);
    if (!only || only === 'lamps') window.__lampCount = addLamps(viewer, data, terrain);
    if (!only || only === 'props') window.__propCount = addRoofProps(viewer, data, terrain);
    if (!only || only === 'gates') window.__gateCount = addGates(viewer, data, terrain);
    if (!only || only === 'sports') window.__sportCount = addSports(viewer, data, terrain);
    if (!only || only === 'labels') window.__labelApi = addBuildingLabels(viewer, data, terrain);
    if (!only || only === 'boundary') addBoundary(viewer, data, terrain);

    if (dom.stats) {
      const a = data.buildings.filter((b) => b.campus === 'A').length;
      const b = data.buildings.filter((b) => b.campus === 'B').length;
      const c = data.buildings.filter((b) => b.campus === 'C').length;
      dom.stats.innerHTML = `<span>${data.buildings.length} 栋建筑（A ${a} / B ${b} / C ${c}）</span><span>${data.roads.length} 条道路</span><span>${data.areas.length} 处场地</span>`;
    }
    if (dom.boot) dom.boot.style.display = 'none';

    // 首屏出现后，后台补全 15 km 地形与两层底图（不阻塞交互）
    setTimeout(async () => {
      try {
        const ext = await terrain.loadExtended();
        viewer.scene.terrainProvider = terrain.rebuild();
        try {
          const midBase = await createBasemapProvider(BASE, Cesium, ext.midMeta, 'basemap_mid.jpg', ASSET_V);
          layers.mid = viewer.scene.imageryLayers.addImageryProvider(midBase, 0);
        } catch (e) {
          console.warn('10 km 底图加载失败', e);
        }
        try {
          const coarseBase = await createBasemapProvider(BASE, Cesium, ext.coarseMeta, 'basemap_coarse.jpg', ASSET_V);
          layers.coarse = viewer.scene.imageryLayers.addImageryProvider(coarseBase, 0);
        } catch (e) {
          console.warn('外围底图加载失败', e);
        }
      } catch (e) {
        console.warn('外围地形加载失败', e);
      }
    }, 700);

    const graph = buildRoadGraph(data.roads);
    // glTF 建筑（试验）
    if (new URLSearchParams(location.search).get('glb') === '1') {
      try {
        const model = await Cesium.Model.fromGltfAsync({
          url: BASE + 'data/buildings.glb',
          modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(
            Cesium.Cartesian3.fromDegrees(106.4648, 29.5672, 0),
          ),
          shadows: Cesium.ShadowMode.ENABLED,
          scale: 1,
        });
        viewer.scene.primitives.add(model);
        viewer.shadows = true;
        window.__glbModel = model;
      } catch (e) {
        console.error('glb 加载失败', e);
        document.getElementById('error').textContent = 'glb 加载失败: ' + e.message;
      }
    }

    initInteraction(viewer, data, terrain, graph, overview);
    window.__CQU__ = { viewer, data, terrain, graph, nav: { nearestNode, shortestPath } };
  } catch (e) {
    showError(e);
  }
})();



