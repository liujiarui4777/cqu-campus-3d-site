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

import { currentScene, sceneHref } from './scenes.js?v=20261104b';

// 当前场景：A/B/C 三校区（默认）或虎溪校区（?campus=hx）
const S = currentScene();
const DIR = S.dir;
const CENTER = S.center;
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

// 调试 / 自动化（录制演示视频、写测试）用：把 viewer 暴露到全局
window.__viewer = viewer;
window.__CENTER = CENTER;

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
scene.globe.maximumScreenSpaceError = 2.2; // 地形细分保持精细档（调高会让山体/坡面变粗）
scene.screenSpaceCameraController.minimumZoomDistance = 140; // 不允许钻进建筑内部
// 地图覆盖 15 km，允许拉到能看全整张底图的高度
scene.screenSpaceCameraController.maximumZoomDistance = 22000;

/* 渲染分辨率按物理像素 1:1，不做任何降采样。
 * Cesium 默认 useBrowserRecommendedResolution = true：DPR>1 的屏幕上只按 CSS 像素渲染
 * （4K 屏实际只画 1920×1080 再拉伸），建筑边缘和文字会发虚。
 * 这里强制关掉，并锁 resolutionScale = 1，保证画布像素 = 屏幕物理像素。 */
viewer.useBrowserRecommendedResolution = false;
viewer.resolutionScale = 1;

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
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    viewer.resize();
    viewer.scene.requestRender();
  }, 120);
});

// 固定机位：来自 scenes.js（A/B/C 三校区 + 全景；虎溪是全景/生活区/教学区/运动区）
// 相机只在这些机位之间切换，避免钻进楼里迷路。
const VIEWS = {};
for (const v of S.views) VIEWS[v.key] = v;

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

// 首屏机位：默认全景；带 ?view=life|teach|sport 时直接落到该机位（截图/深链用）
const START_KEY = (() => {
  const k = new URLSearchParams(location.search).get('view');
  return k && VIEWS[k] ? k : 'all';
})();

function overview(animate) {
  if (animate) {
    viewer.camera.flyTo({ ...HOME_VIEW, duration: 1.7 });
  } else {
    viewer.camera.setView(HOME_VIEW);
  }
}
viewer.camera.setView(viewFor(START_KEY));

// 供 ui.js 调用：切换到指定机位
function flyToView(key, animate = true) {
  const target = viewFor(key);
  if (animate) {
    viewer.camera.flyTo({ ...target, duration: 1.6 });
  } else {
    viewer.camera.setView(target);
  }
}

/* 底部机位按钮：按场景生成（A/B/C 是全景 + 三校区；虎溪是全景 + 生活/教学/运动区）
 * 必须在 initInteraction 之前调用，ui.js 在初始化时一次性收集 [data-view] 按钮 */
function buildViewBar() {
  const nav = document.getElementById('views');
  if (!nav) return;
  nav.innerHTML = '';
  for (const v of S.views) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.view = v.key;
    btn.textContent = v.label;
    if (v.key === 'all') btn.classList.add('active');
    nav.appendChild(btn);
  }
}

/* 校区切换按钮：A/B/C ↔ 虎溪（整页跳转，Cesium 走缓存，1–2 秒可进） */
function initSceneSwitch() {
  const btn = document.getElementById('scene-switch');
  if (!btn) return;
  const target = S.id === 'hx' ? 'abc' : 'hx';
  btn.href = sceneHref(target);
  btn.textContent = S.id === 'hx' ? '← 返回 A / B / C 区' : '虎溪校区 →';
  btn.title = S.id === 'hx' ? '切换到沙坪坝 A / B / C 区三维地图' : '切换到重庆大学虎溪校区三维地图';
}

import { loadTerrain } from './terrain.js?v=20261104c';
import { addAreas, addRoads, addBuildings, addBoundary, addRiver } from './build.js?v=20261104b';
import { addLandmarks } from './landmarks.js?v=20261104b';
import { createBasemapProvider } from './basemap.js?v=20261104b';
import { initInteraction } from './ui.js?v=20261105a';
import { initPanels } from './panels.js?v=20261106a';
import { initLogin, isAuthed } from './login.js?v=20261106a';
import { addTrees } from './trees.js?v=20261104b';
import { buildRoadGraph, nearestNode, shortestPath } from './nav.js?v=20261104b';
import { addLamps } from './lamps.js?v=20261104b';
import { addRoofProps } from './props.js?v=20261104b';
import { addGates } from './gates.js?v=20261104b';
import { addSports } from './sports.js?v=20261104b';
import { addBuildingLabels } from './labels.js?v=20261104b';

(async () => {
  initLogin();
  // 场景标题 / 搜索提示 / 启动文案（index.html 里写的是 A/B/C 默认值，这里按场景覆盖）
  document.title = S.title + '（' + S.subtitle.replace(' · ', '，') + '）';
  const brandTitle = document.querySelector('.brand-text h1');
  const brandSub = document.querySelector('.brand-text p');
  if (brandTitle) brandTitle.textContent = S.title;
  if (brandSub) brandSub.textContent = S.subtitle;
  const bootTextEl = document.getElementById('boot-text');
  if (bootTextEl) bootTextEl.textContent = S.bootText;
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.placeholder = S.searchHint;
  window.__SCENE = S;
  try {
    setStatus('正在加载地形…');
    // 大图版本号：影像/底图改了必须换版本，否则浏览器缓存会让用户看到旧图。
    // 按场景分开，只让改过数据的那套重新下载，A/B/C 的大图不会跟着刷新。
    const ASSET_V = S.id === 'hx' ? '20261104b' : '20261103b';
    const layers = {};
    const only = new URLSearchParams(location.search).get('only');

    // 地形与 scene.json 互不依赖 → 并行发请求；底图依赖 terrain.meta，排在地形之后
    const terrainP = loadTerrain([ASSET_BASE, BASE], Cesium, DIR);
    const dataP = Promise.any(
      [ASSET_BASE, BASE].map(async (base) => {
        const r = await fetch(base + 'data/' + DIR + 'scene.json?v=' + ASSET_V);
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      }),
    ).catch(() => {
      throw new Error('场景数据加载失败（scene.json）');
    });
    // 若上一步地形先失败，dataP 会无人 await —— 挂一个空 catch 避免 unhandledrejection
    dataP.catch(() => {});

    const terrain = await terrainP;
    viewer.scene.terrainProvider = terrain.provider;

    setStatus('正在铺设地面…');
    // 底图两级：S.basemapLo 存在时先铺小图（409 KB）立刻出画面，
    // 高清图（4096²，1.16 MB）在空闲时后台补上，首屏少等约 5 秒。
    const loFile = S.basemapLo || '';
    const mainP = createBasemapProvider(
      ASSET_BASE, Cesium, terrain.meta, loFile || 'basemap.jpg', ASSET_V, BASE, DIR,
    );
    const [mainLayer, data] = await Promise.all([mainP, dataP]);
    layers.style = viewer.scene.imageryLayers.addImageryProvider(mainLayer);
    if (loFile) {
      // 高清底图在首屏渲染之后补，不阻塞出图
      const upgrade = () => {
        createBasemapProvider(ASSET_BASE, Cesium, terrain.meta, 'basemap.jpg', ASSET_V, BASE, DIR)
          .then((hd) => {
            const hdLayer = viewer.scene.imageryLayers.addImageryProvider(hd);
            // 已经切到卫星影像的话，高清底图先别显示，等切回来
            hdLayer.show = !(layers.esri && layers.esri.show);
            layers.style.show = false;
            layers.styleLo = layers.style;
            layers.style = hdLayer;
          })
          .catch(() => {});
      };
      if ('requestIdleCallback' in window) requestIdleCallback(upgrade, { timeout: 2500 });
      else setTimeout(upgrade, 1200);
    }
    let esriLayer = null;
    // 卫星影像按需加载：默认不下载大体积 esri.jpg，第一次打开「卫星影像」时才拉取
    async function ensureEsri() {
      if (esriLayer) return esriLayer;
      // 影像必须与精细底图/地形用同一范围（terrain.json），否则整体错位
      const esri = await createBasemapProvider(ASSET_BASE, Cesium, terrain.meta, 'esri.jpg', ASSET_V, BASE, DIR);
      esriLayer = viewer.scene.imageryLayers.addImageryProvider(esri);
      esriLayer.show = false;
      layers.esri = esriLayer;
      return esriLayer;
    }
    window.__ensureEsri = ensureEsri;
    layers.esri = null;
    window.__layers = layers;

    setStatus('正在生成建筑…');

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
      dom.stats.innerHTML = S.stats(data).map((t) => `<span>${t}</span>`).join('');
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

    // 机位按钮先建好，ui.js 初始化时一次性收集
    buildViewBar();
    initInteraction(viewer, data, terrain, graph, overview);
    initPanels();
    initSceneSwitch();
    // 首屏若指定了 ?view=，在图层就绪后再落一次机位（早期 setView 会被地形/图层加载覆盖）
    if (START_KEY !== 'all') viewer.camera.setView(viewFor(START_KEY));
    window.__flyToView = flyToView;
    window.__bootMs = Math.round(performance.now());    console.info('[cqu] 首屏完成 ' + window.__bootMs + ' ms');
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






