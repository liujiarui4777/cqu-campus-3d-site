/* 建筑标签：DOM 覆盖层，清晰、可点击、可开关、按距离分级显示
 *
 * 分级规则（避免 170+ 个标签糊成一片）：
 *   < 650 m  显示全部建筑
 *   650–2200 只显示地标与主要建筑
 *   > 2200 m 只显示地标
 */

const MAJOR = new Set([
  '主教学楼',
  '第一教学楼',
  '第二教学楼',
  '第三教学楼',
  '第五教学楼',
  '第六教学楼',
  '理科教学楼',
  '理工馆',
  '逸夫图书馆',
  '博雅书院',
  '人文社会科学研究院',
  '理学院',
  '工学院',
  '学生一食堂',
  '学生二食堂',
  '学生三食堂',
  '重庆大学A区体育馆',
  '学生十宿舍',
  '学生四宿舍',
  // B 区（原重庆建筑大学）
  'B区图书馆',
  'B区第一综合楼',
  'B区第二综合楼',
  '建筑城规学院',
  '建工馆',
  '材料楼',
  '学术报告厅',
  '科学会堂',
  'B区机电安装教学楼',
  '建筑与房地产管理学院',
  '学生三舍',
  // C 区（原重庆建筑高等专科学校）
  '校友会',
  '陶艺坊',
]);

export function addBuildingLabels(viewer, data, terrain) {
  const Cesium = window.Cesium;
  const layer = document.createElement('div');
  layer.className = 'label-layer';
  document.body.appendChild(layer);

  const items = [];
  const seen = new Set();

  // ---- 建筑 ----
  for (const b of data.buildings || []) {
    const raw = b.name || '';
    if (!raw || raw === '未知建筑') continue;
    const name = raw.replace('重庆大学', '');
    const key = name + '@' + Math.round(b.center[0] * 1e5) + ',' + Math.round(b.center[1] * 1e5);
    if (seen.has(key)) continue;
    seen.add(key);

    const h0 = terrain.sample(b.center[0], b.center[1]);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bldg-label' + (b.landmark ? ' landmark' : '') + (MAJOR.has(name) ? ' major' : '');
    btn.textContent = name;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.__focusBuilding) window.__focusBuilding(b);
    });
    layer.appendChild(btn);

    items.push({
      el: btn,
      pos: Cesium.Cartesian3.fromDegrees(b.center[0], b.center[1], h0 + b.height + 4),
      tier: b.landmark ? 0 : MAJOR.has(name) ? 1 : 2,
      b,
    });
  }

  // ---- 每帧投影 ----
  const ST = Cesium.SceneTransforms;
  const project = ST.worldToWindowCoordinates
    ? (sc, pos) => ST.worldToWindowCoordinates(sc, pos)
    : ST.wgs84ToWindowCoordinates
      ? (sc, pos) => ST.wgs84ToWindowCoordinates(sc, pos)
      : null;

  if (!project) {
    console.warn('SceneTransforms 投影函数不可用');
    return { setVisible() {}, isVisible: () => false, dispose() {} };
  }

  const canvas = viewer.scene.canvas;
  let visible = true;

  let frameSkip = 0;
  const stop = viewer.scene.postRender.addEventListener(() => {
    // 标签位置每 3 帧更新一次即可（60fps 下 20Hz，肉眼无感），省掉投影与样式重算
    if (++frameSkip % 3 !== 0) return;
    if (!visible) {
      if (layer.style.display !== 'none') layer.style.display = 'none';
      return;
    }
    if (layer.style.display !== '') layer.style.display = '';

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const camPos = viewer.camera.positionWC;

    for (const it of items) {
      const p = project(viewer.scene, it.pos);
      if (!p) {
        it.el.style.display = 'none';
        continue;
      }
      const dist = Cesium.Cartesian3.distance(camPos, it.pos);
      const maxDist = it.tier === 0 ? 3600 : it.tier === 1 ? 2200 : 650;
      if (dist > maxDist || p.x < -60 || p.x > w + 60 || p.y < -30 || p.y > h + 30) {
        it.el.style.display = 'none';
        continue;
      }
      it.el.style.display = 'block';
      it.el.style.transform = `translate(-50%, -100%) translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      it.el.style.opacity =
        dist < maxDist * 0.55 ? '1' : String(Math.max(0.32, 1 - (dist - maxDist * 0.55) / (maxDist * 0.45)));
      it.el.style.zIndex = String(10000 - Math.round(dist / 10));
    }
  });

  window.__labelCount = items.length;

  return {
    setVisible(v) {
      visible = !!v;
      if (!v) layer.style.display = 'none';
    },
    isVisible() {
      return visible;
    },
    dispose() {
      stop && stop();
      layer.remove();
    },
  };
}
