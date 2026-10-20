import { nearestNode, shortestPath } from './nav.js';
/* 交互：点击建筑 → 信息卡；地标导览；昼夜主题 */

const Cesium = window.Cesium;

const KIND_LABEL = {
  teach: '教学科研',
  dorm: '学生宿舍',
  library: '图书馆',
  canteen: '食堂',
  sport: '体育场馆',
  office: '办公',
  other: '建筑',
  landmark: '地标',
};

export function initInteraction(viewer, data, terrain, graph) {
  const card = document.getElementById('card');
  const cardTitle = document.getElementById('card-title');
  const cardSub = document.getElementById('card-sub');
  const cardMeta = document.getElementById('card-meta');
  const cardDesc = document.getElementById('card-desc');
  const cardTags = document.getElementById('card-tags');
  const cardExtra = document.getElementById('card-extra');

  let current = null;

  function hide() {
    card.classList.remove('show');
    current = null;
    if (viewer.scene.canvas) viewer.scene.canvas.style.cursor = 'grab';
  }

  function show(entity) {
    const props = entity.properties;
    if (!props) return;
    const b = props.data.getValue();
    if (!b) return;
    current = b;

    cardTitle.textContent = b.name || '未命名建筑';
    cardSub.textContent = b.alias || (b.landmark ? '校园地标' : '');
    const kind = KIND_LABEL[b.kind] || '建筑';
    cardMeta.innerHTML = `
      <span>${kind}</span>
      <span>${b.levels} 层</span>
      <span>约 ${b.height} m</span>
      ${b.area ? `<span>基底 ${b.area.toLocaleString()} m²</span>` : ''}
    `;
    cardDesc.textContent = b.desc || '';
    cardDesc.style.display = b.desc ? 'block' : 'none';

    if (cardExtra) {
      const parts = [];
      if (b.use) parts.push('<p><b>使用</b>' + b.use + '</p>');
      if (b.hours) parts.push('<p><b>开放</b>' + b.hours + '</p>');
      cardExtra.innerHTML = parts.join('');
    }

    cardTags.innerHTML = '';
    if (b.landmark) {
      const t = document.createElement('span');
      t.className = 'tag';
      t.textContent = '重点建筑';
      cardTags.appendChild(t);
    }
    if (b.roof === 'hip' || b.roof === 'gable') {
      const t = document.createElement('span');
      t.className = 'tag';
      t.textContent = '坡屋顶';
      cardTags.appendChild(t);
    }

    card.classList.add('show');

    // 相机飞到该建筑
    const h0 = terrain.sample(b.center[0], b.center[1]);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        b.center[0] - 0.0016,
        b.center[1] - 0.0016,
        h0 + Math.max(90, b.height * 1.8 + 60),
      ),
      orientation: {
        heading: Cesium.Math.toRadians(35),
        pitch: Cesium.Math.toRadians(-32),
        roll: 0,
      },
      duration: 1.5,
    });
  }

  /* ---------- 步行导航 ---------- */
  let navMode = false;
  let navFrom = null;
  let navLine = null;
  const hintEl = document.querySelector('.hint');
  const baseHint = hintEl ? hintEl.firstChild.textContent : '';
  function setHint(text) {
    if (!hintEl) return;
    hintEl.innerHTML = text + '<span class="credit-line">建筑轮廓 © OpenStreetMap 贡献者（ODbL） · 地形 AWS Terrain Tiles · 考据：重庆市文旅委 / 重庆大学公开资料</span>';
  }
  const navBtn = document.getElementById('nav-btn');
  const navMod = {};

  function clearNavLine() {
    if (navLine) {
      viewer.entities.remove(navLine);
      navLine = null;
    }
  }

  if (navBtn) {
    navBtn.addEventListener('click', () => {
      navMode = !navMode;
      navBtn.classList.toggle('active', navMode);
      navFrom = null;
      clearNavLine();
      setHint(navMode ? '导航模式：先点击起点建筑' : '点击建筑查看详情 · 左键拖拽旋转 · 滚轮缩放 · 右键平移');
    });
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.position);
    if (Cesium.defined(picked) && picked.id && picked.id.properties) {
      if (navMode && graph) {
        const b = picked.id.properties.data.getValue();
        if (b) {
          if (!navFrom) {
            navFrom = b;
            setHint('起点：' + b.name + '，再点击终点建筑');
          } else {
            const s = nearestNode(graph, navFrom.center[0], navFrom.center[1]);
            const t = nearestNode(graph, b.center[0], b.center[1]);
            const res = shortestPath(graph, s.id, t.id);
            clearNavLine();
            if (res) {
              const arr = [];
              for (const n of res.path) arr.push(n.lon, n.lat);
              navLine = viewer.entities.add({
                polyline: {
                  positions: Cesium.Cartesian3.fromDegreesArray(arr),
                  width: 6,
                  material: Cesium.Color.fromCssColorString('#2f6f6a'),
                  clampToGround: true,
                },
              });
              const min = Math.max(1, Math.round(res.length / 78));
              setHint('步行 ' + Math.round(res.length) + ' m，约 ' + min + ' 分钟（' + navFrom.name + ' → ' + b.name + '）');
            } else {
              setHint('这两点之间没有找到步行路线');
            }
            navFrom = null;
          }
          return;
        }
      }
      show(picked.id);
    } else {
      hide();
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  document.getElementById('card-close').addEventListener('click', hide);
  viewer.scene.canvas.addEventListener('mousemove', (e) => {
    const picked = viewer.scene.pick(new Cesium.Cartesian2(e.offsetX, e.offsetY));
    const hit = Cesium.defined(picked) && picked.id && picked.id.properties;
    viewer.scene.canvas.style.cursor = hit ? 'pointer' : 'grab';
  });

  /* ---------- 地标导览 ---------- */
  const guide = [
    { name: '主教学楼', lon: 106.46655, lat: 29.5684, h: 165, pitch: -30 },
    { name: '钟塔', lon: 106.4634, lat: 29.56991, h: 70, pitch: -22 },
    { name: '大校门', lon: 106.46, lat: 29.5695, h: 55, pitch: -20 },
    { name: '民主湖', lon: 106.46599, lat: 29.56635, h: 130, pitch: -35 },
    { name: '风雨操场', lon: 106.46852, lat: 29.56692, h: 120, pitch: -32 },
    { name: '思群广场', lon: 106.46433, lat: 29.56698, h: 180, pitch: -38 },
    { name: '老图书馆', lon: 106.46616, lat: 29.56926, h: 90, pitch: -28 },
    { name: '寅初亭', lon: 106.4633, lat: 29.5687, h: 70, pitch: -26 },
  ];
  const nav = document.getElementById('guides');
  if (nav) {
    for (const g of guide) {
      const b = document.createElement('button');
      b.className = 'guide-btn';
      b.textContent = g.name;
      b.addEventListener('click', () => {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(g.lon - 0.0011, g.lat - 0.0014, g.h + 260),
          orientation: {
            heading: Cesium.Math.toRadians(20),
            pitch: Cesium.Math.toRadians(g.pitch),
            roll: 0,
          },
          duration: 1.6,
        });
      });
      nav.appendChild(b);
    }
  }

  /* ---------- 昼夜 ---------- */
  const root = document.documentElement;
  const origColors = new WeakMap();

  function tuneEntities(t) {
    const f = t === 'day' ? 1 : t === 'dusk' ? 0.78 : 0.42;
    const tint = t === 'night' ? [0.82, 0.86, 1.0] : [1, 1, 1];
    for (const e of viewer.entities.values) {
      const poly = e.polygon;
      const prop = poly && poly.material && poly.material.color;
      if (prop) {
        if (t === 'night' && typeof e.id === 'string' && e.id.startsWith('win:')) {
          prop.setValue(Cesium.Color.fromCssColorString('#ffd8a0'));
          if (!origColors.has(e)) origColors.set(e, Cesium.Color.fromCssColorString('#7d8b96'));
          continue;
        }
        if (!origColors.has(e)) origColors.set(e, Cesium.Color.clone(prop.getValue(Cesium.JulianDate.now())));
        const c = origColors.get(e);
        prop.setValue(
          new Cesium.Color(c.red * f * tint[0], c.green * f * tint[1], c.blue * f * tint[2], 1),
        );
      }
      const ell = e.ellipsoid;
      const emat = ell && ell.material && ell.material.color;
      if (emat) {
        if (!origColors.has(e)) origColors.set(e, Cesium.Color.clone(emat.getValue(Cesium.JulianDate.now())));
        const c = origColors.get(e);
        if (t === 'night' && typeof e.id === 'string' && e.id.startsWith('lamp:')) {
          emat.setValue(Cesium.Color.fromCssColorString('#ffd27a'));
        } else {
          emat.setValue(new Cesium.Color(c.red * f * tint[0], c.green * f * tint[1], c.blue * f * tint[2], 1));
        }
      }
      const line = e.polyline;
      const lprop = line && line.material && line.material.color;
      if (lprop) {
        if (!origColors.has(e)) origColors.set(e, Cesium.Color.clone(lprop.getValue(Cesium.JulianDate.now())));
        const c = origColors.get(e);
        lprop.setValue(new Cesium.Color(c.red * f * tint[0], c.green * f * tint[1], c.blue * f * tint[2], 1));
      }
    }
  }

  // 整屏压暗（覆盖树木/道路/场地等不可单独调色的图元）
  const nightStage = new Cesium.PostProcessStage({
    name: 'cqu_night',
    fragmentShader: `
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
uniform float uFactor;
void main() {
  vec4 c = texture(colorTexture, v_textureCoordinates);
  c.rgb *= uFactor;
  c.rgb = vec3(c.r * 0.9, c.g * 0.95, c.b * 1.14);
  out_FragColor = c;
}`,
    uniforms: { uFactor: 1.0 },
  });
  nightStage.enabled = false;
  viewer.scene.postProcessStages.add(nightStage);

  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    const bg = t === 'night' ? '#0e1520' : t === 'dusk' ? '#26324a' : '#e9e6de';
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString(bg);
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString(bg);
    // 底图调暗/去饱和，让夜间整体统一
    for (let i = 0; i < viewer.imageryLayers.length; i++) {
      const layer = viewer.imageryLayers.get(i);
      layer.brightness = t === 'day' ? 1 : t === 'dusk' ? 0.68 : 0.3;
      layer.saturation = t === 'day' ? 1 : t === 'dusk' ? 0.7 : 0.25;
      layer.gamma = t === 'day' ? 1 : t === 'dusk' ? 1.05 : 1.25;
      layer.contrast = t === 'day' ? 1 : t === 'dusk' ? 1.05 : 1.15;
    }
    tuneEntities(t);
    nightStage.enabled = t !== 'day';
    nightStage.uniforms.uFactor = t === 'night' ? 0.55 : 0.8;
  }

  document.querySelectorAll('[data-time]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-time]').forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
      applyTheme(btn.getAttribute('data-time'));
    });
  });

  /* ---------- 搜索 ---------- */
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  const all = data.buildings || [];

  function renderResults(q) {
    results.innerHTML = '';
    if (!q) {
      results.classList.remove('show');
      return;
    }
    const lower = q.toLowerCase();
    const hits = all
      .filter((b) => {
        const n = (b.name || '').toLowerCase();
        return n.includes(lower) || (b.desc || '').toLowerCase().includes(lower);
      })
      .slice(0, 8);
    if (!hits.length) {
      results.innerHTML = '<div class="sr-empty">没有找到相关建筑</div>';
      results.classList.add('show');
      return;
    }
    for (const b of hits) {
      const btn = document.createElement('button');
      btn.className = 'sr-item';
      btn.innerHTML = '<span>' + (b.name || '未命名') + '</span><em>' + b.levels + ' 层 · ' + b.height + ' m</em>';
      btn.addEventListener('click', () => {
        results.classList.remove('show');
        input.value = b.name || '';
        show({ properties: { data: { getValue: () => b } } });
      });
      results.appendChild(btn);
    }
    results.classList.add('show');
  }

  if (input) {
    input.addEventListener('input', (e) => renderResults(e.target.value.trim()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = results.querySelector('.sr-item');
        if (first) first.click();
      }
      if (e.key === 'Escape') {
        input.value = '';
        renderResults('');
      }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search')) results.classList.remove('show');
    });
  }

  return { hide };
}
