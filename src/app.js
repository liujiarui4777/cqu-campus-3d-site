/* 重庆大学 A 区 + B 区三维校园 —— 场景入口（原生 ES module，不依赖构建工具） */

// Cesium 走 CDN，失败时 index.html 会补一个本站脚本；这里等一下它
async function waitForCesium(timeoutMs = 12000) {
  const t0 = Date.now();
  while (!window.Cesium && Date.now() - t0 < timeoutMs) {
    await new Promise((r) => setTimeout(r, 80));
  }
  if (!window.Cesium) throw new Error('Cesium 加载失败，请刷新重试');
  return window.Cesium;
}

const Cesium = window.Cesium || (await waitForCesium());

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
scene.globe.maximumScreenSpaceError = 2.2; // 略降地形细分，换更快出图与更稳帧率
scene.screenSpaceCameraController.minimumZoomDistance = 140; // 不允许钻进建筑内部
// 地图覆盖 15 km，允许拉到能看全整张底图的高度
scene.screenSpaceCameraController.maximumZoomDistance = 22000;

// 视角锁定：默认锁定 → 只能用底部机位按钮 / 点击建筑飞行。
// 点顶部「锁定」按钮解锁后可以拖拽、滚轮、平移，但俯仰角不允许改（角度保持一致），
// 且相机被限制在校园范围内，看不到校区以外。
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

import { loadTerrain } from './terrain.js?v=20261031m';
import { addAreas, addRoads, addBuildings, addBoundary, addRiver } from './build.js?v=20261031m';
import { addLandmarks } from './landmarks.js?v=20261031m';
import { createBasemapProvider } from './basemap.js?v=20261031m';
import { initInteraction } from './ui.js?v=20261031m';
import { initPanels } from './panels.js?v=20261031m';
import { initLogin, isAuthed } from './login.js?v=20261030b';
import { addTrees } from './trees.js?v=20261031m';
import { buildRoadGraph, nearestNode, shortestPath } from './nav.js?v=20261031m';
import { addLamps } from './lamps.js?v=20261031m';
import { addRoofProps } from './props.js?v=20261031m';
import { addGates } from './gates.js?v=20261031m';
import { addSports } from './sports.js?v=20261031m';
import { addBuildingLabels } from './labels.js?v=20261031m';

(async () => {
  initLogin();
  try {
    setStatus('正在加载地形…');
    // CDN 与本站并行抢，谁先回用谁（不再做阻塞式探活）
    const terrain = await loadTerrain([ASSET_BASE, BASE], Cesium);
    viewer.scene.terrainProvider = terrain.provider;

    setStatus('正在铺设地面…');
    // 大图版本号：影像/底图改了必须换版本，否则浏览器缓存会让用户看到旧图
    const ASSET_V = '20261031a';
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
    // 只保留 A/B/C 校园范围：15 km 白模、10 km/20 km 底图与地形全部不加载
    // CDN 拿不到就回退本站，避免 jsDelivr 抖动导致整页卡在加载
    const data = await Promise.any(
      [ASSET_BASE, BASE].map(async (base) => {
        const r = await fetch(base + 'data/scene.json?v=' + ASSET_V);
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      }),
    ).catch(() => {
      throw new Error('场景数据加载失败（scene.json）');
    });

    if (!only || only === 'areas') addAreas(viewer, data, terrain);
    if (!only || only === 'river') addRiver(viewer, data, terrain);
    if (!only || only === 'roads') addRoads(viewer, data, terrain);
    const glbMode = new URLSearchParams(location.search).get('glb') === '1';
    if ((!only || only === 'buildings') && !glbMode) addBuildings(viewer, data, terrain);
    if (!only || only === 'landmarks') addLandmarks(viewer, data, terrain);

    // 轻量元素（树、路灯、屋顶设备、校门、球场、标签、边界）放到首屏之后补，
    // 让「能看到校园」优先，交互不用等这些几何
    const afterPaint = () => {
      if (!only || only === 'trees') window.__treeCount = addTrees(viewer, data, terrain);
      if (!only || only === 'lamps') window.__lampCount = addLamps(viewer, data, terrain);
      if (!only || only === 'props') window.__propCount = addRoofProps(viewer, data, terrain);
      if (!only || only === 'gates') window.__gateCount = addGates(viewer, data, terrain);
      if (!only || only === 'sports') window.__sportCount = addSports(viewer, data, terrain);
      if (!only || only === 'labels') window.__labelApi = addBuildingLabels(viewer, data, terrain);
      if (!only || only === 'boundary') addBoundary(viewer, data, terrain);
    };

    if (dom.stats) {
      const a = data.buildings.filter((b) => b.campus === 'A').length;
      const b = data.buildings.filter((b) => b.campus === 'B').length;
      const c = data.buildings.filter((b) => b.campus === 'C').length;
      dom.stats.innerHTML = `<span>${data.buildings.length} 栋建筑（A ${a} / B ${b} / C ${c}）</span><span>${data.roads.length} 条道路</span><span>${data.areas.length} 处场地</span>`;
    }
    if (dom.boot) dom.boot.style.display = 'none';
    setTimeout(afterPaint, 50);

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
    window.__bootMs = Math.round(performance.now());
    console.info('[cqu] 首屏完成 ' + window.__bootMs + ' ms');
    window.__CQU__ = { viewer, data, terrain, graph, nav: { nearestNode, shortestPath } };

    // ---------- 视角锁定 / 自由 ----------
    // 锁定：只能用底部机位按钮或点建筑飞行（默认）
    // 自由：可拖动、滚轮、平移，但俯仰角锁死（角度不变），且相机被限制在校园范围内
    const box = (() => {
      let w = 1e9, s = 1e9, e = -1e9, n = -1e9;
      const take = (lon, lat) => {
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
        w = Math.min(w, lon); e = Math.max(e, lon);
        s = Math.min(s, lat); n = Math.max(n, lat);
      };
      for (const b of data.buildings || []) {
        if (b.center) take(b.center[0], b.center[1]);
      }
      for (const a of data.areas || []) {
        if (a.center) take(a.center[0], a.center[1]);
      }
      // 允许环视的范围要「往校园里面收」，不是往外扩：
      // 目标点被限制在校园内部，相机就不会把视线带到校外
      const m = 0.0011; // 约 120 m，留出边缘建筑
      return { west: w + m, east: e - m, south: s + m, north: n - m };
    })();
    const MAX_H = 2000; // 最高只能拉到「全景」高度，再高就会看到校外

    let camLocked = true;
    let fixing = false;

    function applyCamLock(locked) {
      camLocked = !!locked;
      const free = !camLocked;
      camCtl.enableRotate = free;
      camCtl.enableTranslate = free;
      camCtl.enableZoom = free;
      // 俯仰角不允许改：解锁后角度与当前机位保持一致
      camCtl.enableTilt = false;
      camCtl.enableLook = false;
      camCtl.maximumZoomDistance = free ? MAX_H : 22000;
      viewer.scene.canvas.style.cursor = free ? 'grab' : 'default';
      document.body.classList.toggle('cam-free', free);
      const btn = document.getElementById('cam-lock');
      if (btn) {
        btn.classList.toggle('is-on', camLocked);
        btn.textContent = camLocked ? '🔒 已锁定' : '🔓 自由视角';
      }
    }
    window.__setCamLock = applyCamLock;
    window.__isCamLocked = () => camLocked;
    window.__camBox = box;

    viewer.scene.preRender.addEventListener(() => {
      if (camLocked || fixing) return;
      const c = viewer.camera;
      const canvas = viewer.scene.canvas;
      const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
      // 盯住画面中心对应的地面点：它必须留在校园框内，否则把相机整体拉回来
      const target = c.pickEllipsoid(center, Cesium.Ellipsoid.WGS84, new Cesium.Cartesian3());
      if (!target) return;

      const carto = Cesium.Cartographic.fromCartesian(target);
      if (!carto) return;
      const tLon = Cesium.Math.toDegrees(carto.longitude);
      const tLat = Cesium.Math.toDegrees(carto.latitude);
      const cLon = Math.min(Math.max(tLon, box.west), box.east);
      const cLat = Math.min(Math.max(tLat, box.south), box.north);
      const outOfBox = Math.abs(cLon - tLon) > 1e-9 || Math.abs(cLat - tLat) > 1e-9;

      // 距离上限：保证俯视高度不超过 MAX_H（pitch 越平，允许的距离越短）
      const pitch = c.pitch;
      const sinP = Math.max(0.18, Math.sin(Math.abs(pitch)));
      const maxDist = (MAX_H - 20) / sinP;
      const camPos = c.positionWC;
      const dist = Cesium.Cartesian3.distance(camPos, target);
      const tooFar = dist > maxDist;
      const tooClose = dist < 120;

      if (!outOfBox && !tooFar && !tooClose) return;

      fixing = true;
      const anchor = outOfBox ? Cesium.Cartesian3.fromDegrees(cLon, cLat, 0) : target;
      const dir = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.subtract(camPos, target, new Cesium.Cartesian3()),
        new Cesium.Cartesian3(),
      );
      const newDist = Math.min(Math.max(dist, 120), maxDist);
      const newPos = Cesium.Cartesian3.add(
        anchor,
        Cesium.Cartesian3.multiplyByScalar(dir, newDist, new Cesium.Cartesian3()),
        new Cesium.Cartesian3(),
      );
      c.setView({
        destination: newPos,
        orientation: { heading: c.heading, pitch: c.pitch, roll: 0 },
      });
      fixing = false;
    });

    const lockBtn = document.getElementById('cam-lock');
    if (lockBtn) {
      lockBtn.addEventListener('click', () => applyCamLock(!camLocked));
      applyCamLock(true);
    }
  } catch (e) {
    showError(e);
  }
})();






