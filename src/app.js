/* 重庆大学 A 区 + B 区三维校园 —— 场景入口（原生 ES module，不依赖构建工具） */
const Cesium = window.Cesium;

const CENTER = [106.4615, 29.5695];
const BASE = new URL('./', document.baseURI).href;
let ASSET_BASE = window.__ASSET_BASE || BASE;

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
scene.screenSpaceCameraController.minimumZoomDistance = 140; // 不允许钻进建筑内部
// 地图覆盖 15 km，允许拉到能看全整张底图的高度
scene.screenSpaceCameraController.maximumZoomDistance = 22000;

// 视角锁定：只能用底部机位按钮 / 点击建筑飞行，禁止拖拽、滚轮、双指缩放
const camCtl = scene.screenSpaceCameraController;
camCtl.enableRotate = false;
camCtl.enableTranslate = false;
camCtl.enableZoom = false;
camCtl.enableTilt = false;
camCtl.enableLook = false;
viewer.scene.canvas.style.cursor = 'default';

const credit = viewer.cesiumWidget.creditContainer;
if (credit) credit.style.display = 'none';

// 窗口尺寸变化时强制重算画布，保证地图始终铺满浏览器
window.addEventListener('resize', () => {
  viewer.resize();
  viewer.scene.requestRender();
});

// 固定机位：全景 + A/B/C 三个校区。相机只在这些机位之间切换，避免钻进楼里迷路
// 三个校区机位按各自建筑外轮廓的包围盒算：相机在区域正南、俯角 60°，
// 高度取到「整个区域完整落在画面 80% 以内」，数值由 worldToWindowCoordinates
// 投影迭代求出来的；改机位后请同样用四个角点校验，别凭手感改。
const VIEWS = {
  all: { lon: 106.4585, lat: 29.5520, h: 1950, heading: 4, pitch: -47 },
  // A 区：建筑范围约 1018×1266 m，地面 ~258 m，视高 1800 m
  a: { lon: 106.46377, lat: 29.55715, h: 2058, heading: 0, pitch: -60 },
  // B 区：约 646×696 m，地面 ~242 m，视高 1000 m
  b: { lon: 106.45549, lat: 29.56445, h: 1242, heading: 0, pitch: -60 },
  // C 区：约 256×273 m，地面 ~255 m，视高 420 m（对准建筑群中心，西侧长楼也进画面）
  c: { lon: 106.4523, lat: 29.56271, h: 675, heading: 0, pitch: -60 },
};

function viewFor(key) {
  const v = VIEWS[key] || VIEWS.all;
  return {
    destination: Cesium.Cartesian3.fromDegrees(v.lon, v.lat, v.h),
    orientation: {
      heading: Cesium.Math.toRadians(v.heading),
      pitch: Cesium.Math.toRadians(v.pitch),
      roll: 0,
    },
  };
}

const HOME_VIEW = viewFor('all');

function overview(animate) {
  if (animate) {
    viewer.camera.flyTo({ ...HOME_VIEW, duration: 1.7 });
  } else {
    viewer.camera.setView(HOME_VIEW);
  }
}
overview(false);

// 供 ui.js 调用：切换到指定机位
function flyToView(key, animate = true) {
  const target = viewFor(key);
  if (animate) {
    viewer.camera.flyTo({ ...target, duration: 1.6 });
  } else {
    viewer.camera.setView(target);
  }
}

import { loadTerrain } from './terrain.js';
import { addAreas, addRoads, addBuildings, addBoundary, addRiver } from './build.js';
import { addLandmarks } from './landmarks.js';
import { createBasemapProvider } from './basemap.js';
import { initInteraction } from './ui.js';
import { initPanels } from './panels.js';
import { initLogin, isAuthed } from './login.js';
import { addTrees } from './trees.js';
import { buildRoadGraph, nearestNode, shortestPath } from './nav.js';
import { addLamps } from './lamps.js';
import { addRoofProps } from './props.js';
import { addGates } from './gates.js';
import { addSports } from './sports.js';
import { addSurroundings } from './surroundings.js';
import { addBuildingLabels } from './labels.js';

(async () => {
  initLogin();
  // CDN 不通（国内 jsDelivr 会抖）就整体回退到本站，避免卡在「加载地形」
  if (ASSET_BASE !== BASE) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7000);
      const probe = await fetch(ASSET_BASE + 'data/terrain.json', { signal: ctrl.signal });
      clearTimeout(timer);
      if (!probe.ok) ASSET_BASE = BASE;
    } catch (e) {
      ASSET_BASE = BASE;
    }
  }
  try {
    setStatus('正在加载地形…');
    const terrain = await loadTerrain(ASSET_BASE, Cesium);
    viewer.scene.terrainProvider = terrain.provider;

    setStatus('正在铺设地面…');
    // 大图版本号：影像/底图改了必须换版本，否则浏览器缓存会让用户看到旧图
    const ASSET_V = '20261030a';
    const layers = {};
    // 首屏只铺 A/B/C 区精细底图（约 0.8 MB），10 km / 20 km 底图与地形后台补全
    const basemap = await createBasemapProvider(ASSET_BASE, Cesium, terrain.meta, 'basemap.jpg', ASSET_V, BASE);
    layers.style = viewer.scene.imageryLayers.addImageryProvider(basemap);
    let esriLayer = null;
    // 卫星影像按需加载：默认不下载 4 MB 的 esri.jpg，第一次打开「卫星影像」时才拉取
    async function ensureEsri() {
      if (esriLayer) return esriLayer;
      // 影像必须与精细底图/地形用同一范围（data/terrain.json），否则整体错位
      const esri = await createBasemapProvider(ASSET_BASE, Cesium, terrain.meta, 'esri.jpg', ASSET_V, BASE);
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
      ? addSurroundings(viewer, ASSET_BASE, terrain).then((n) => {
          window.__surroundCount = n;
          return n;
        }).catch(() => 0)
      : Promise.resolve(0);
    // CDN 拿不到就回退本站，避免 jsDelivr 抖动导致整页卡在加载
    const data = await (async () => {
      for (const base of [ASSET_BASE, BASE]) {
        try {
          const r = await fetch(base + 'data/scene.json?v=' + ASSET_V);
          if (r.ok) return await r.json();
        } catch (e) {
          /* try next base */
        }
      }
      throw new Error('场景数据加载失败（scene.json）');
    })();

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
          const midBase = await createBasemapProvider(ASSET_BASE, Cesium, ext.midMeta, 'basemap_mid.jpg', ASSET_V, BASE);
          layers.mid = viewer.scene.imageryLayers.addImageryProvider(midBase, 0);
        } catch (e) {
          console.warn('10 km 底图加载失败', e);
        }
        if (ext.hasCoarse) {
          try {
            const coarseBase = await createBasemapProvider(ASSET_BASE, Cesium, ext.coarseMeta, 'basemap_coarse.jpg', ASSET_V, BASE);
            layers.coarse = viewer.scene.imageryLayers.addImageryProvider(coarseBase, 0);
          } catch (e) {
            console.warn('外围底图加载失败', e);
          }
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
          url: ASSET_BASE + 'data/buildings.glb',
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
    initPanels();
    window.__flyToView = flyToView;
    window.__CQU__ = { viewer, data, terrain, graph, nav: { nearestNode, shortestPath } };
  } catch (e) {
    showError(e);
  }
})();






