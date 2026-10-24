import { SHUTTLE, SHUTTLE_STOPS, BUS_INFO, todaySchedule, nextBus } from './shuttle.js';
import { parseSchedule, matchBuilding, todayIndex, save as saveSchedule, load as loadSchedule, DAY_NAMES } from './schedule.js';
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

export function initInteraction(viewer, data, terrain, graph, overview) {
  const card = document.getElementById('card');
  const cardTitle = document.getElementById('card-title');
  const cardSub = document.getElementById('card-sub');
  const cardMeta = document.getElementById('card-meta');
  const cardDesc = document.getElementById('card-desc');
  const cardTags = document.getElementById('card-tags');
  const cardRooms = document.getElementById('card-rooms');
  const cardExtra = document.getElementById('card-extra');

  let current = null;

  /* 教室数据（2026 秋 18639 条排课统计，见 docs/调研-教室信息.md） */
  let classroomData = null;
  fetch(new URL('data/classrooms.json', document.baseURI))
    .then((r) => r.json())
    .then((d) => {
      classroomData = d.buildings || {};
      if (current) renderRooms(current);
    })
    .catch(() => {});

  function renderRooms(b) {
    if (!cardRooms) return;
    const c = classroomData && classroomData[b.name];
    if (!c) {
      cardRooms.innerHTML = '';
      return;
    }
    const parts = ['<div class="rooms-head"><b>教室</b>'];
    if (c.roomCount) {
      parts.push(
        '<span>' + c.roomCount + ' 间 · 本学期排课 ' + c.rows + ' 次 · 最大 ' + c.maxStu + ' 人</span></div>',
      );
      const floors = Object.keys(c.floors || {}).sort((x, y) => Number(x) - Number(y));
      if (floors.length) {
        parts.push(
          '<div class="rooms-floors">' +
            floors.map((f) => '<span>' + f + ' 层 ' + c.floors[f] + '</span>').join('') +
            '</div>',
        );
      }
      parts.push(
        '<div class="rooms-list">' +
          c.rooms
            .map((r) => '<em>' + r.code + '<i>' + r.max + ' 人</i></em>')
            .join('') +
          '</div>',
      );
      if (c.colleges && c.colleges.length) {
        parts.push(
          '<p class="rooms-dept">排课学院：' + c.colleges.map((x) => x.name).join('、') + '</p>',
        );
      }
    } else {
      parts.push('<span>待核</span></div>');
    }
    if (c.note) parts.push('<p class="rooms-note">' + c.note + '</p>');
    cardRooms.innerHTML = parts.join('');
  }

  function hide() {
    card.classList.remove('show');
    current = null;
    if (viewer.scene.canvas) viewer.scene.canvas.style.cursor = 'grab';
    setHint('在地图上依次点击起点、终点建筑');
  }

  function show(entity) {
    const props = entity.properties;
    if (!props) return;
    const b = props.data.getValue();
    if (!b) return;
    current = b;

    cardTitle.textContent = b.name || '未命名建筑';
    cardSub.textContent = b.alias || (b.landmark ? '校园地标' : '');

    // 建筑图片（离线生成的 3D 示意图，缺失时自动隐藏）
    const photoWrap = document.getElementById('card-photo-wrap');
    const photo = document.getElementById('card-photo');
    if (photoWrap && photo) {
      if (b.id) {
        photoWrap.hidden = false;
        photo.onerror = () => {
          photoWrap.hidden = true;
        };
        photo.src = './data/imgs/' + b.id + '.jpg';
        photo.alt = (b.name || '建筑') + ' 三维示意';
      } else {
        photoWrap.hidden = true;
      }
    }
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

    renderRooms(b);
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
  let navFrom = null;
  let navTo = null;
  let navLine = null;
  const navBtn = document.getElementById('nav-btn');
  const navPanel = document.getElementById('nav-panel');
  const navResult = document.getElementById('nav-result');
  const navClear = document.getElementById('nav-clear');
  const navClose = document.getElementById('nav-close');
  const fromInput = document.getElementById('nav-from-input');
  const toInput = document.getElementById('nav-to-input');
  const fromSuggest = document.getElementById('nav-from-suggest');
  const toSuggest = document.getElementById('nav-to-suggest');

  function setHint(text) {
    if (navResult) navResult.textContent = text;
  }

  function clearNavLine() {
    if (navLine) {
      for (const e of navLine) viewer.entities.remove(e);
      navLine = null;
    }
  }

  const campusName = (c) => (c === 'B' ? 'B 区' : c === 'C' ? 'C 区' : c === 'HX' ? '虎溪' : 'A 区');
  const navAll = (data.buildings || []).filter((b) => b.name);

  function hideSuggest(box) {
    if (!box) return;
    box.classList.remove('show');
    box.innerHTML = '';
  }

  function renderSuggest(input, box, which) {
    if (!input || !box) return;
    const q = input.value.trim().toLowerCase();
    if (!q) {
      hideSuggest(box);
      return;
    }
    const hits = navAll
      .filter((b) => matchesQuery(b, normalizeQuery(q), q))
      .slice(0, 8);
    box.innerHTML = '';
    if (!hits.length) {
      box.innerHTML = '<div class="nav-empty">没有匹配的建筑</div>';
      box.classList.add('show');
      return;
    }
    for (const b of hits) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-sitem';
      btn.innerHTML =
        '<b>' + (b.name || '') + '</b><small>' + campusName(b.campus) + ' · ' + (b.levels || 0) + ' 层</small>';
      btn.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        chooseNav(which, b);
        hideSuggest(box);
      });
      box.appendChild(btn);
    }
    box.classList.add('show');
  }

  function resetNav() {
    clearNavLine();
    navFrom = null;
    navTo = null;
    if (fromInput) fromInput.value = '';
    if (toInput) toInput.value = '';
    hideSuggest(fromSuggest);
    hideSuggest(toSuggest);
    setHint('输入起点、终点，或直接点击地图上的建筑');
  }

  function openNav() {
    if (navPanel) navPanel.hidden = false;
    if (navBtn) navBtn.classList.add('active');
    if (fromInput) setTimeout(() => fromInput.focus(), 120);
    setHint('输入起点、终点，或直接点击地图上的建筑');
  }

  function closeNav() {
    if (navPanel) navPanel.hidden = true;
    if (navBtn) navBtn.classList.remove('active');
    resetNav();
  }

  if (navBtn) {
    // 抽屉的开关由 panels.js 负责，这里只保证面板内容和输入焦点就绪
    navBtn.addEventListener('click', () => openNav());
  }
  if (navClear) navClear.addEventListener('click', resetNav);
  if (navClose) navClose.addEventListener('click', closeNav);

  if (fromInput) {
    fromInput.addEventListener('input', () => renderSuggest(fromInput, fromSuggest, 'from'));
    fromInput.addEventListener('focus', () => renderSuggest(fromInput, fromSuggest, 'from'));
    fromInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = fromSuggest && fromSuggest.querySelector('.nav-sitem');
        if (first) first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      }
      if (e.key === 'Escape') hideSuggest(fromSuggest);
    });
  }
  if (toInput) {
    toInput.addEventListener('input', () => renderSuggest(toInput, toSuggest, 'to'));
    toInput.addEventListener('focus', () => renderSuggest(toInput, toSuggest, 'to'));
    toInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = toSuggest && toSuggest.querySelector('.nav-sitem');
        if (first) first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      }
      if (e.key === 'Escape') hideSuggest(toSuggest);
    });
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-search')) {
      hideSuggest(fromSuggest);
      hideSuggest(toSuggest);
    }
  });

  function chooseNav(which, b) {
    if (which === 'from') {
      navFrom = b;
      if (fromInput) fromInput.value = b.name || '';
      if (navTo) computeRoute();
      else {
        setHint('已选起点，再选终点');
        if (toInput) setTimeout(() => toInput.focus(), 60);
      }
    } else {
      navTo = b;
      if (toInput) toInput.value = b.name || '';
      if (navFrom) computeRoute();
      else {
        setHint('已选终点，再选起点');
        if (fromInput) fromInput.focus();
      }
    }
  }

  function addRouteMarker(b, color, text) {
    const h0 = terrain.sample(b.center[0], b.center[1]);
    return viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(b.center[0], b.center[1], h0 + 4),
      point: {
        pixelSize: 14,
        color: Cesium.Color.fromCssColorString(color),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text,
        font: '12px system-ui, sans-serif',
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString(color).withAlpha(0.92),
        backgroundPadding: new Cesium.Cartesian2(6, 3),
        pixelOffset: new Cesium.Cartesian2(0, -22),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }

  function computeRoute() {
    if (!navFrom || !navTo || !graph) return;
    const s = nearestNode(graph, navFrom.center[0], navFrom.center[1]);
    const t = nearestNode(graph, navTo.center[0], navTo.center[1]);
    const res = shortestPath(graph, s.id, t.id);
    clearNavLine();
    if (!res) {
      setHint('这两点之间没有找到步行路线');
      return;
    }
    const arr = [];
    for (const n of res.path) arr.push(n.lon, n.lat, terrain.sample(n.lon, n.lat) + 2.4);
    const positions = Cesium.Cartesian3.fromDegreesArrayHeights(arr);

    // 三层路径：深色描边 → 发光主线 → 方向箭头（用带高度折线，保证线宽生效）
    const casing = viewer.entities.add({
      polyline: {
        positions,
        width: 24,
        material: Cesium.Color.fromCssColorString('#0a2a38').withAlpha(0.55),
      },
    });
    const glow = viewer.entities.add({
      polyline: {
        positions,
        width: 14,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.25,
          color: Cesium.Color.fromCssColorString('#00f0ff'),
        }),
      },
    });
    const arrows = viewer.entities.add({
      polyline: {
        positions,
        width: 18,
        material: new Cesium.PolylineArrowMaterialProperty(Cesium.Color.fromCssColorString('#dfffff')),
      },
    });
    const start = addRouteMarker(navFrom, '#22b573', '起点');
    const end = addRouteMarker(navTo, '#e2574c', '终点');
    navLine = [casing, glow, arrows, start, end];

    const dist = Math.round(res.length);
    const min = Math.max(1, Math.round(dist / 75));
    if (navResult) {
      navResult.innerHTML =
        '<div class="nr-main">全程 <b>' + dist + ' m</b> · 步行约 <b>' + min + ' 分钟</b></div>' +
        '<div class="nr-sub">' +
        (navFrom.name || '起点') +
        ' → ' +
        (navTo.name || '终点') +
        ' · ' +
        res.path.length +
        ' 个路点</div>';
    }
  }

  function setNavPoint(b) {
    if (!navFrom) chooseNav('from', b);
    else chooseNav('to', b);
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.position);
    if (Cesium.defined(picked) && picked.id && picked.id.properties) {
      if (navPanel && !navPanel.hidden && graph) {
        const b = picked.id.properties.data.getValue();
        if (b) {
          setNavPoint(b);
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

  /* ---------- 地标导览（已简化：底部地标条移除，改由搜索定位） ---------- */

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
    if (window.__lampPrims) {
      const night = t === 'night';
      window.__lampPrims.day.show = !night;
      window.__lampPrims.night.show = night;
    }
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

  // 宿舍别名：学生十宿舍 ←→ 10舍 / 十舍 / 十号舍（学生平时不会说全称）
  const CN_DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  function cnNumber(n) {
    if (n <= 9) return CN_DIGIT[n];
    if (n === 10) return '十';
    if (n < 20) return '十' + CN_DIGIT[n % 10];
    return String(n);
  }
  function aliasesOf(b) {
    const out = [];
    const name = b.name || '';
    const m = /^学生(.+?)宿舍$/.exec(name);
    if (m) {
      const raw = m[1];
      out.push(raw + '舍', raw + '号舍', '学生' + raw + '舍');
      // 把「十」这类汉字再补一组阿拉伯数字写法
      const idx = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'].indexOf(raw);
      if (idx >= 0) out.push(String(idx + 1) + '舍', String(idx + 1) + '号舍');
    }
    if (b.alias) out.push(b.alias);
    return out;
  }
  // 把查询里的「10舍 / 10号舍」转成中文，便于和楼名对齐
  function normalizeQuery(q) {
    return q.replace(/(\d{1,2})\s*(号?舍)/g, (_, d, tail) => cnNumber(Number(d)) + tail);
  }
  function matchesQuery(b, q, qRaw) {
    const n = (b.name || '').toLowerCase();
    if (n.includes(q)) return true;
    if ((b.alias || '').toLowerCase().includes(q)) return true;
    for (const a of aliasesOf(b)) {
      if (a.toLowerCase().includes(q) || q.includes(a.toLowerCase())) return true;
    }
    if (qRaw && qRaw !== q && n.includes(qRaw)) return true;
    return false;
  }

  function renderResults(q) {
    results.innerHTML = '';
    if (!q) {
      results.classList.remove('show');
      return;
    }
    const qRaw = q.toLowerCase();
    const lower = normalizeQuery(qRaw);
    const hits = all
      .filter((b) => matchesQuery(b, lower, qRaw) || (b.desc || '').toLowerCase().includes(lower))
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

  /* ---------- 今日课程 ---------- */
  const schedBtn = document.getElementById('schedule-btn');
  const schedPanel = document.getElementById('schedule');
  const schedList = document.getElementById('schedule-list');
  const schedInput = document.getElementById('schedule-input');
  const schedDate = document.getElementById('schedule-date');
  let schedule = loadSchedule();
  const markers = [];

  function renderSchedule() {
    if (!schedPanel) return;
    const today = todayIndex();
    const toMin = (t) => {
      const p = String(t).split(':');
      return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
    };
    const rows = schedule
      .filter((r) => r.day === today)
      .sort((a, b) => toMin(a.start) - toMin(b.start));
    if (schedDate) {
      schedDate.textContent = DAY_NAMES[today] + ' · ' + new Date().toLocaleDateString('zh-CN');
    }
    for (const m of markers) viewer.entities.remove(m);
    markers.length = 0;
    schedList.innerHTML = '';
    if (!rows.length) {
      schedList.innerHTML = '<p class="sched-empty">今天没有课。在下方粘贴课表后点「导入课表」。</p>';
      return;
    }
    for (const r of rows) {
      const b = matchBuilding(data.buildings || [], r.place);
      const item = document.createElement('button');
      item.className = 'sched-item';
      item.innerHTML =
        '<b>' + r.start + '–' + r.end + '</b><span>' + r.name + '</span><em>' +
        (b ? b.name : (r.place || '地点未匹配')) + '</em>';
      if (b) {
        item.addEventListener('click', () => show({ properties: { data: { getValue: () => b } } }));
      }
      schedList.appendChild(item);
      if (b) {
        const h0 = terrain.sample(b.center[0], b.center[1]);
        markers.push(
          viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(b.center[0], b.center[1], h0 + b.height + 14),
            label: {
              text: r.name + '  ' + r.start,
              font: '13px system-ui, sans-serif',
              fillColor: Cesium.Color.fromCssColorString('#1f2a33'),
              showBackground: true,
              backgroundColor: Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.88),
              pixelOffset: new Cesium.Cartesian2(0, -12),
              scale: 1,
            },
            ellipse: {
              semiMajorAxis: 20,
              semiMinorAxis: 20,
              height: h0 + 0.4,
              material: Cesium.Color.fromCssColorString('#e8b84b').withAlpha(0.32),
            },
          }),
        );
      }
    }
  }

  function clearMarkers() {
    for (const m of markers) viewer.entities.remove(m);
    markers.length = 0;
  }
  if (schedBtn) {
    schedBtn.addEventListener('click', () => {
      renderSchedule();
    });
  }
  const schedClose = document.getElementById('schedule-close');
  if (schedClose) {
    schedClose.addEventListener('click', () => {
      schedPanel.classList.remove('show');
      clearMarkers();
    });
  }
  const schedClear = document.getElementById('schedule-clear');
  if (schedClear) {
    schedClear.addEventListener('click', () => {
      schedule = [];
      saveSchedule([]);
      clearMarkers();
      renderSchedule();
      setHint('已清除课表');
    });
  }
  const schedSave = document.getElementById('schedule-save');
  if (schedSave) {
    schedSave.addEventListener('click', () => {
      const rows = parseSchedule(schedInput.value);
      if (!rows.length) {
        setHint('没有解析到课程，格式示例：周一 8:00-9:40 高等数学 第一教学楼');
        return;
      }
      schedule = rows;
      saveSchedule(rows);
      renderSchedule();
      setHint('已导入 ' + rows.length + ' 门课，今天的课已标在地图上');
    });
  }
  // 启动时不渲染课表标记，只有打开「今日课程」面板才显示

  /* ---------- 校园巴士 ---------- */
  const shuttleBtn = document.getElementById('bus-btn') || document.getElementById('shuttle-btn');
  const shuttlePanel = document.getElementById('shuttle');
  const busNextTime = document.getElementById('bus-next-time');
  const busNextMeta = document.getElementById('bus-next-meta');
  const busCount = document.getElementById('bus-count');
  const shuttleList = document.getElementById('shuttle-list');
  const shuttleStops = document.getElementById('shuttle-stops');
  const busMeta = document.getElementById('bus-meta');
  const busTips = document.getElementById('bus-tips');
  const busSource = document.getElementById('bus-source');
  const campusMeta = document.getElementById('campus-meta');
  const campusTips = document.getElementById('campus-tips');
  const campusSource = document.getElementById('campus-source');
  const busBodyCommuter = document.getElementById('bus-body-commuter');
  const busBodyCampus = document.getElementById('bus-body-campus');
  let shuttleDir = 'outbound';
  let shuttleStopIdx = 1;
  let busTab = 'commuter';
  let busTimer = null;

  function renderBusInfo() {
    const c = BUS_INFO.commuter;
    if (busMeta) {
      busMeta.innerHTML =
        '<div><span>单程</span><b>' + c.duration + '</b></div>' +
        '<div><span>距离</span><b>' + c.distance + '</b></div>' +
        '<div><span>票价</span><b>' + c.fare + '</b></div>' +
        '<div><span>电话</span><b>' + c.phone + '</b></div>';
    }
    if (busTips) busTips.innerHTML = c.tips.map((t) => '<li>' + t + '</li>').join('');
    if (busSource) busSource.textContent = '来源：' + c.source;
    const s = BUS_INFO.campus;
    if (campusMeta) {
      campusMeta.innerHTML =
        '<div><span>线路</span><b>' + s.route + '</b></div>' +
        '<div><span>单程</span><b>' + s.duration + '</b></div>' +
        '<div><span>票价</span><b>' + s.fare + '</b></div>' +
        '<div><span>电话</span><b>' + s.phone + '</b></div>';
    }
    if (campusTips) campusTips.innerHTML = s.tips.map((t) => '<li>' + t + '</li>').join('');
    if (campusSource) campusSource.textContent = '来源：' + s.source;
  }

  function renderShuttle() {
    const t = SHUTTLE[shuttleDir];
    const stopIdx = Math.min(shuttleStopIdx, t.stops.length - 1);
    const nb = nextBus(stopIdx, shuttleDir);
    if (busNextTime) busNextTime.textContent = nb ? nb.time : t.times[0][stopIdx];
    if (busNextMeta) {
      busNextMeta.textContent = nb
        ? nb.inMin + ' 分钟后 · ' + t.stops[stopIdx] + ' 上车'
        : '今日已结束 · 明日首班 ' + t.times[0][stopIdx] + '（' + t.stops[stopIdx] + '）';
    }
    if (shuttleStops) {
      shuttleStops.innerHTML = t.stops
        .map(
          (name, i) =>
            '<button type="button" class="bus-stop' + (i === stopIdx ? ' current' : '') + '" data-idx="' + i + '">' +
            '<span class="bus-stop-idx">' + (i + 1) + '</span>' +
            '<span class="bus-stop-name">' + name + '</span>' +
            (i === stopIdx ? '<span class="bus-stop-tag">在此上车</span>' : '') +
            '</button>',
        )
        .join('');
      shuttleStops.querySelectorAll('.bus-stop').forEach((el) => {
        el.addEventListener('click', () => {
          shuttleStopIdx = Number(el.getAttribute('data-idx'));
          renderShuttle();
        });
      });
    }
    if (shuttleList) {
      shuttleList.innerHTML = todaySchedule(stopIdx, shuttleDir)
        .map(
          (x) =>
            '<div class="shuttle-item' + (x.passed ? ' past' : '') + '"><b>' + x.time +
            '</b><span>' + (x.passed ? '已发车' : x.inMin + ' 分钟后') + '</span></div>',
        )
        .join('');
    }
    if (busCount) {
      busCount.textContent = '共 ' + t.times.length + ' 班 · ' + t.stops[stopIdx] + ' 发车';
    }
  }

  function startBusTimer() {
    if (busTimer) clearInterval(busTimer);
    busTimer = setInterval(() => {
      if (shuttlePanel && shuttlePanel.classList.contains('show') && busTab === 'commuter') renderShuttle();
    }, 30000);
  }

  document.querySelectorAll('.bus-tabs button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.bus-tabs button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      busTab = b.getAttribute('data-bus');
      if (busBodyCommuter) busBodyCommuter.hidden = busTab !== 'commuter';
      if (busBodyCampus) busBodyCampus.hidden = busTab !== 'campus';
    });
  });

  document.querySelectorAll('.shuttle-tabs button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.shuttle-tabs button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      shuttleDir = b.getAttribute('data-dir');
      shuttleStopIdx = shuttleDir === 'outbound' ? 1 : 2;
      renderShuttle();
    });
  });

  if (shuttleBtn) {
    shuttleBtn.addEventListener('click', () => {
      renderBusInfo();
      renderShuttle();
      startBusTimer();
    });
  }
  const shuttleClose = document.getElementById('shuttle-close');
  if (shuttleClose) {
    shuttleClose.addEventListener('click', () => {
      shuttlePanel.classList.remove('show');
      if (busTimer) clearInterval(busTimer);
      busTimer = null;
    });
  }

  // 地图上标记 A 区乘车点（只留圆点，不再显示旧“校车 ·”文字标签）
  for (const s of SHUTTLE_STOPS) {
    const h0 = terrain.sample(s.lon, s.lat);
    viewer.entities.add({
      id: s.id,
      position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, h0 + 3),
      point: {
        pixelSize: 7,
        color: Cesium.Color.fromCssColorString('#2f6f6a'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: { kind: 'shuttle', name: s.name },
    });
  }

  /* ---------- 图层面板 ---------- */
  const panelBtn = document.getElementById('panel-btn');
  const layerPanel = document.getElementById('layer-panel');
  if (panelBtn && layerPanel) {
    panelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = layerPanel.hidden;
      layerPanel.hidden = !open;
      panelBtn.setAttribute('aria-expanded', String(open));
      panelBtn.classList.toggle('active', open);
    });
    document.addEventListener('click', (e) => {
      if (!layerPanel.hidden && !layerPanel.contains(e.target) && e.target !== panelBtn) {
        layerPanel.hidden = true;
        panelBtn.setAttribute('aria-expanded', 'false');
        panelBtn.classList.remove('active');
      }
    });
  }

  // 卫星影像开关（影像按需加载：第一次打开时才下载 esri.jpg）
  const satBtn = document.getElementById('sat-btn');
  let satOn = false;
  if (satBtn) {
    satBtn.addEventListener('click', async () => {
      const L = window.__layers;
      if (!L) return;
      if (satOn) {
        satOn = false;
        satBtn.classList.remove('active');
        if (L.esri) L.esri.show = false;
        if (L.style) L.style.show = true;
        return;
      }
      satBtn.disabled = true;
      try {
        const layer = window.__ensureEsri ? await window.__ensureEsri() : L.esri;
        if (!layer) throw new Error('no esri layer');
        layer.show = true;
        if (L.style) L.style.show = false;
        satOn = true;
        satBtn.classList.add('active');
      } catch (e) {
        satOn = false;
        satBtn.classList.remove('active');
      } finally {
        satBtn.disabled = false;
      }
    });
  }

  /* ---------- 固定视角：由 scenes.js 决定（A/B/C 三校区 / 虎溪各区） ---------- */
  const viewsNav = document.getElementById('views');
  const viewBtns = viewsNav ? Array.from(viewsNav.querySelectorAll('[data-view]')) : [];
  const backHomeBtn = document.getElementById('back-home');
  const HOME_POS = (() => {
    const sc = window.__SCENE;
    const v = sc && Array.isArray(sc.views) ? sc.views.find((x) => x.key === 'all') : null;
    return v ? { lon: v.lon, lat: v.lat, h: v.h } : { lon: 106.4585, lat: 29.5520, h: 1950 };
  })();

  function setActiveView(key) {
    for (const b of viewBtns) b.classList.toggle('active', b.getAttribute('data-view') === key);
  }
  function goView(key, msg) {
    hide();
    if (window.__flyToView) window.__flyToView(key);
    setActiveView(key);
    if (msg) setHint(msg);
  }
  for (const b of viewBtns) {
    b.addEventListener('click', () => goView(b.getAttribute('data-view')));
  }
  if (backHomeBtn) backHomeBtn.addEventListener('click', () => goView('all', '已回到全景视角'));

  // 相机离开全景机位（放大、拖走、点了某栋楼）时，右上角出现「返回全景」
  let lastCamCheck = 0;
  viewer.scene.postRender.addEventListener(() => {
    const now = performance.now();
    if (now - lastCamCheck < 300) return;
    lastCamCheck = now;
    const c = viewer.camera.positionCartographic;
    const lon = Cesium.Math.toDegrees(c.longitude);
    const lat = Cesium.Math.toDegrees(c.latitude);
    const away =
      Math.abs(c.height - HOME_POS.h) > 260 ||
      Math.abs(lon - HOME_POS.lon) > 0.0045 ||
      Math.abs(lat - HOME_POS.lat) > 0.0035;
    if (backHomeBtn) backHomeBtn.classList.toggle('show', away);
  });

  /* ---------- 回到全景 ---------- */
  function flyHome(msg) {
    hide();
    if (typeof overview === 'function') overview(true);
    setActiveView('all');
    if (msg) setHint(msg);
  }
  const homeBtn = document.getElementById('brand-home');
  if (homeBtn) homeBtn.addEventListener('click', () => flyHome('已回到全景视角'));
  const cardBack = document.getElementById('card-back');
  if (cardBack) cardBack.addEventListener('click', () => flyHome('已回到全景视角'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') flyHome('已回到全景视角');
  });

  /* ---------- 天气（Open-Meteo，无需 key） ---------- */
  const weatherIcon = document.getElementById('weather-icon');
  const weatherText = document.getElementById('weather-text');
  const WEATHER_MAP = {
    0: ['☀', '晴'], 1: ['☀', '晴'], 2: ['⛅', '多云'], 3: ['☁', '阴'],
    45: ['🌫', '雾'], 48: ['🌫', '雾'],
    51: ['🌦', '小雨'], 53: ['🌦', '小雨'], 55: ['🌧', '中雨'],
    56: ['🌧', '冻雨'], 57: ['🌧', '冻雨'],
    61: ['🌧', '小雨'], 63: ['🌧', '中雨'], 65: ['🌧', '大雨'],
    66: ['🌧', '冻雨'], 67: ['🌧', '冻雨'],
    71: ['🌨', '小雪'], 73: ['🌨', '中雪'], 75: ['❄', '大雪'], 77: ['🌨', '雪'],
    80: ['🌦', '阵雨'], 81: ['🌧', '阵雨'], 82: ['⛈', '强阵雨'],
    85: ['🌨', '阵雪'], 86: ['❄', '强阵雪'],
    95: ['⛈', '雷雨'], 96: ['⛈', '雷雨'], 99: ['⛈', '雷雨'],
  };
  async function loadWeather() {
    if (!weatherText) return;
    const w = (window.__SCENE && window.__SCENE.weather) || { lon: 106.465, lat: 29.567 };
    try {
      const r = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=' +
          w.lat +
          '&longitude=' +
          w.lon +
          '&current=temperature_2m,weather_code&timezone=Asia%2FShanghai',
      );
      const j = await r.json();
      const t = Math.round(j.current.temperature_2m);
      const [icon, label] = WEATHER_MAP[j.current.weather_code] || ['☁', '多云'];
      if (weatherIcon) weatherIcon.textContent = icon;
      weatherText.textContent = t + '° ' + label;
    } catch (e) {
      weatherText.textContent = '--°';
    }
  }
  loadWeather();
  setInterval(loadWeather, 10 * 60 * 1000);

  // 供 DOM 建筑标签调用：导航面板打开时用于选点，否则弹信息卡
  window.__focusBuilding = (b) => {
    if (!b) return;
    if (navPanel && !navPanel.hidden) {
      setNavPoint(b);
      return;
    }
    const e = viewer.entities.getById('b:' + b.id);
    if (e) show(e);
  };

  return { hide };
}



