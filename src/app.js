/* 重庆大学 A 区三维校园 —— 场景入口（原生 ES module，不依赖构建工具） */
const Cesium = window.Cesium;

const CENTER = [106.4648, 29.5672];
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
scene.globe.maximumScreenSpaceError = 2.4;
scene.screenSpaceCameraController.minimumZoomDistance = 18;
scene.screenSpaceCameraController.maximumZoomDistance = 4200;

const credit = viewer.cesiumWidget.creditContainer;
if (credit) credit.style.display = 'none';

const HOME_VIEW = {
  destination: Cesium.Cartesian3.fromDegrees(106.4648, 29.5568, 1250),
  orientation: {
    heading: Cesium.Math.toRadians(6),
    pitch: Cesium.Math.toRadians(-44),
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
    const basemap = await createBasemapProvider(BASE, Cesium, terrain.meta, 'basemap.jpg');
    const styleLayer = viewer.scene.imageryLayers.addImageryProvider(basemap);
    let esriLayer = null;
    try {
      const esri = await createBasemapProvider(BASE, Cesium, terrain.meta, 'esri.jpg');
      esriLayer = viewer.scene.imageryLayers.addImageryProvider(esri);
      esriLayer.show = false;
    } catch (e) {
      console.warn('影像层加载失败', e);
    }
    window.__layers = { style: styleLayer, esri: esriLayer };

    setStatus('正在生成建筑…');
    const data = await fetch(BASE + 'data/scene.json').then((r) => r.json());
    const only = new URLSearchParams(location.search).get('only');

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
    if (!only || only === 'surroundings') window.__surroundCount = await addSurroundings(viewer, BASE, terrain);
    if (!only || only === 'labels') window.__labelApi = addBuildingLabels(viewer, data, terrain);
    if (!only || only === 'boundary') addBoundary(viewer, data, terrain);

    if (dom.stats) {
      dom.stats.innerHTML = `<span>${data.buildings.length} 栋建筑</span><span>${data.roads.length} 条道路</span><span>${data.areas.length} 处场地</span>`;
    }
    if (dom.boot) dom.boot.style.display = 'none';
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
