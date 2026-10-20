/* 建筑标签：用 DOM 覆盖层渲染，字体清晰、可点击、带 hover 效果
 * 位置每帧由 Cesium 投影到屏幕坐标
 */

export function addBuildingLabels(viewer, data, terrain) {
  const Cesium = window.Cesium;
  const MAJOR = [
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
    '民主湖',
  ];

  const layer = document.createElement('div');
  layer.className = 'label-layer';
  document.body.appendChild(layer);

  const items = [];
  const seen = new Set();
  for (const b of data.buildings || []) {
    const name = (b.name || '').replace('重庆大学', '');
    if (!name || seen.has(name)) continue;
    if (!(b.landmark || MAJOR.includes(name))) continue;
    seen.add(name);

    const h0 = terrain.sample(b.center[0], b.center[1]);
    const btn = document.createElement('button');
    btn.className = 'bldg-label' + (b.landmark ? ' landmark' : '');
    btn.type = 'button';
    btn.innerHTML = `<span>${name}</span>`;
    btn.dataset.name = name;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.__focusBuilding) window.__focusBuilding(b);
    });
    layer.appendChild(btn);

    items.push({
      el: btn,
      pos: Cesium.Cartesian3.fromDegrees(b.center[0], b.center[1], h0 + b.height + 4),
      b,
    });
  }

  const ST = Cesium.SceneTransforms;
  const project =
    ST.worldToWindowCoordinates ? (sc, pos) => ST.worldToWindowCoordinates(sc, pos)
      : ST.wgs84ToWindowCoordinates ? (sc, pos) => ST.wgs84ToWindowCoordinates(sc, pos)
      : null;
  if (!project) {
    console.warn('SceneTransforms 投影函数不可用，标签层跳过');
    return () => {};
  }

  const canvas = viewer.scene.canvas;
  const removeHandler = viewer.scene.postRender.addEventListener(() => {
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
      if (dist > 1600 || p.x < -80 || p.x > w + 80 || p.y < -40 || p.y > h + 40) {
        it.el.style.display = 'none';
        continue;
      }
      it.el.style.display = 'block';
      it.el.style.transform = `translate(-50%, -100%) translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      it.el.style.opacity = dist < 750 ? '1' : String(Math.max(0.35, 1 - (dist - 750) / 1100));
      it.el.style.zIndex = String(10000 - Math.round(dist / 10));
    }
  });

  window.__labelCount = items.length;
  return () => {
    removeHandler && removeHandler();
    layer.remove();
  };
}
