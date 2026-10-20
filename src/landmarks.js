/* 地标构筑物：钟塔 / 大校门 / 寅初亭 / 风雨操场看台 / 思群广场跑道
 * 参数来自 docs/调研-A区建筑资料.md（形制有据，尺寸为合理推测）
 */
const MLAT = 110540;
const METER_LAT = 110540;
const meterLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

function offset(lon, lat, dx, dy) {
  return [lon + dx / meterLon(lat), lat + dy / METER_LAT];
}

function polygonPoints(Cesium, pts, height) {
  const arr = [];
  for (const [lon, lat] of pts) arr.push(lon, lat);
  return Cesium.Cartesian3.fromDegreesArray(arr, undefined, height);
}

function ring(cx, cy, r, n, a0 = 0, a1 = Math.PI * 2) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

export function addLandmarks(viewer, data, terrain) {
  const Cesium = window.Cesium;
  const E = viewer.entities;
  const lm = data.landmarks || [];
  const cr = Cesium.Color.fromCssColorString;

  /* ---------- 钟塔：独立三面钟塔，向上收分 ---------- */
  const clock = lm.find((l) => l.type === 'clocktower');
  if (clock) {
    const h0 = terrain.sample(clock.lon, clock.lat);
    const cx = clock.lon;
    const cy = clock.lat;
    // 三角塔身（三段收分）
    const segs = [
      { r: 2.6, y0: 0, y1: 9, c: '#9aa0a6' },
      { r: 2.1, y0: 9, y1: 18, c: '#a4a9ae' },
      { r: 1.5, y0: 18, y1: 25, c: '#aeb2b6' },
    ];
    for (const s of segs) {
      const tri = [];
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
        tri.push(offset(cx, cy, Math.cos(a) * s.r, Math.sin(a) * s.r));
      }
      E.add({
        id: 'clock-' + s.y0,
        polygon: {
          hierarchy: polygonPoints(Cesium, tri),
          height: h0 + s.y0,
          extrudedHeight: h0 + s.y1,
          material: cr(s.c),
        },
        properties: { kind: 'landmark', name: '钟塔' },
      });
    }
    // 钟盘（三个白面，朝向三面）
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
      const face = [
        offset(cx, cy, Math.cos(a) * 2.0 - 0.9, Math.sin(a) * 2.0 - 0.1),
        offset(cx, cy, Math.cos(a) * 2.0 + 0.9, Math.sin(a) * 2.0 - 0.1),
        offset(cx, cy, Math.cos(a) * 2.0 + 0.9, Math.sin(a) * 2.0 + 0.9),
        offset(cx, cy, Math.cos(a) * 2.0 - 0.9, Math.sin(a) * 2.0 + 0.9),
      ];
      E.add({
        polygon: {
          hierarchy: polygonPoints(Cesium, face),
          height: h0 + 20.5,
          extrudedHeight: h0 + 22.5,
          material: cr('#f6f4ef'),
        },
        properties: { kind: 'landmark', name: '钟塔' },
      });
    }
    // 塔尖
    E.add({
      position: Cesium.Cartesian3.fromDegrees(cx, cy, h0 + 25),
      cylinder: {
        length: 4.2,
        topRadius: 0.05,
        bottomRadius: 1.5,
        material: cr('#8f959a'),
      },
      properties: { kind: 'landmark', name: '钟塔' },
    });
    // 塔前水池（镜面）
    E.add({
      polygon: {
        hierarchy: polygonPoints(Cesium, ring(cx, cy - 8, 7.5, 24)),
        height: h0 + 0.12,
        material: cr('#a9c6d4').withAlpha(0.85),
      },
      properties: { kind: 'landmark', name: '钟塔广场水池' },
    });
  }

  /* ---------- 大校门：四根光秃石方柱 + 八字石壁 ---------- */
  const gate = lm.find((l) => l.type === 'gate');
  if (gate) {
    const h0 = terrain.sample(gate.lon, gate.lat);
    const stone = cr('#cfc8ba');
    // 四柱沿南北向排开，间距 4.2m
    for (let i = 0; i < 4; i++) {
      const dy = (i - 1.5) * 4.2;
      const c = offset(gate.lon, gate.lat, 0, dy);
      const half = 0.55;
      const sq = [
        offset(c[0], c[1], -half, -half),
        offset(c[0], c[1], half, -half),
        offset(c[0], c[1], half, half),
        offset(c[0], c[1], -half, half),
      ];
      E.add({
        polygon: {
          hierarchy: polygonPoints(Cesium, sq),
          height: h0 - 1,
          extrudedHeight: h0 + 7.6,
          material: stone,
        },
        properties: { kind: 'landmark', name: '大校门' },
      });
    }
    // 两侧八字石壁
    for (const sign of [-1, 1]) {
      const baseY = sign * 8.4;
      const wall = [
        offset(gate.lon, gate.lat, -0.35, baseY - 1.2),
        offset(gate.lon, gate.lat, 0.35, baseY - 1.2),
        offset(gate.lon, gate.lat, 0.35 + sign * 0.5, baseY + sign * 6.2),
        offset(gate.lon, gate.lat, -0.35 + sign * 0.5, baseY + sign * 6.2),
      ];
      E.add({
        polygon: {
          hierarchy: polygonPoints(Cesium, wall),
          height: h0 - 1,
          extrudedHeight: h0 + 4.6,
          material: cr('#d5cec0'),
        },
        properties: { kind: 'landmark', name: '大校门校训石壁' },
      });
    }
  }

  /* ---------- 寅初亭：六角重檐攒尖 ---------- */
  const pav = lm.find((l) => l.type === 'pavilion');
  if (pav) {
    const h0 = terrain.sample(pav.lon, pav.lat);
    E.add({
      polygon: {
        hierarchy: polygonPoints(Cesium, ring(pav.lon, pav.lat, 2.7, 6)),
        height: h0 - 0.5,
        extrudedHeight: h0 + 4.4,
        material: cr('#b9ab97'),
      },
      properties: { kind: 'landmark', name: '寅初亭' },
    });
    E.add({
      position: Cesium.Cartesian3.fromDegrees(pav.lon, pav.lat, h0 + 4.4),
      cylinder: {
        length: 2.6,
        topRadius: 0.25,
        bottomRadius: 3.4,
        material: cr('#6a6f6b'),
      },
      properties: { kind: 'landmark', name: '寅初亭' },
    });
    E.add({
      position: Cesium.Cartesian3.fromDegrees(pav.lon, pav.lat, h0 + 7.2),
      cylinder: {
        length: 1.4,
        topRadius: 0.15,
        bottomRadius: 1.7,
        material: cr('#7a6a55'),
      },
      properties: { kind: 'landmark', name: '寅初亭' },
    });
  }

  /* ---------- 风雨操场：半环形青石看台（无罩棚） ---------- */
  const stand = lm.find((l) => l.type === 'stand');
  if (stand) {
    const h0 = terrain.sample(stand.lon, stand.lat);
    const steps = 11;
    const inner = 24;
    const stepW = 1.5;
    const stepH = 0.55;
    const a0 = Math.PI * 0.05;
    const a1 = Math.PI * 0.95;
    for (let i = 0; i < steps; i++) {
      const r0 = inner + i * stepW;
      const r1 = r0 + stepW;
      const pts = [];
      const N = 28;
      for (let k = 0; k <= N; k++) {
        const a = a0 + ((a1 - a0) * k) / N;
        pts.push(offset(stand.lon, stand.lat, Math.cos(a) * r0, Math.sin(a) * r0));
      }
      for (let k = N; k >= 0; k--) {
        const a = a0 + ((a1 - a0) * k) / N;
        pts.push(offset(stand.lon, stand.lat, Math.cos(a) * r1, Math.sin(a) * r1));
      }
      E.add({
        polygon: {
          hierarchy: polygonPoints(Cesium, pts),
          height: h0 + i * stepH - 0.4,
          extrudedHeight: h0 + (i + 1) * stepH,
          material: cr(i % 2 ? '#c9c2b1' : '#d3ccbb'),
        },
        properties: { kind: 'landmark', name: '风雨操场看台' },
      });
    }
    // 中心舞台
    E.add({
      polygon: {
        hierarchy: polygonPoints(Cesium, ring(stand.lon, stand.lat, 12, 24)),
        height: h0 - 0.3,
        extrudedHeight: h0 + 0.9,
        material: cr('#bfb6a2'),
      },
      properties: { kind: 'landmark', name: '风雨操场舞台' },
    });
  }

  /* ---------- 入口雨棚：地标建筑最长边中点加悬挑板 ---------- */
  for (const b of data.buildings || []) {
    if (!b.landmark || !b.outline || b.outline.length < 3) continue;
    const hEave = terrain.sample(b.center[0], b.center[1]) + Math.min(b.height, 12);
    const kLon = 111320 * Math.cos((b.center[1] * Math.PI) / 180);
    let best = null;
    for (let i = 0; i < b.outline.length; i++) {
      const a = b.outline[i];
      const c = b.outline[(i + 1) % b.outline.length];
      const dx = (c[0] - a[0]) * kLon;
      const dy = (c[1] - a[1]) * MLAT;
      const len = Math.hypot(dx, dy);
      if (!best || len > best.len) best = { a, c, dx, dy, len };
    }
    if (!best || best.len < 4) continue;
    const mx = (best.a[0] + best.c[0]) / 2;
    const my = (best.a[1] + best.c[1]) / 2;
    const nx = -(best.dy / best.len);
    const ny = best.dx / best.len;
    const out = 1.6;
    const halfW = Math.min(2.6, best.len / 3);
    const pts = [
      [mx + (nx * -0.2 + (best.dx / best.len) * halfW) / kLon, my + (ny * -0.2 + (best.dy / best.len) * halfW) / MLAT],
      [mx + (nx * -0.2 - (best.dx / best.len) * halfW) / kLon, my + (ny * -0.2 - (best.dy / best.len) * halfW) / MLAT],
      [mx + (nx * out - (best.dx / best.len) * halfW) / kLon, my + (ny * out - (best.dy / best.len) * halfW) / MLAT],
      [mx + (nx * out + (best.dx / best.len) * halfW) / kLon, my + (ny * out + (best.dy / best.len) * halfW) / MLAT],
    ];
    const flatC = [];
    for (const p of pts) flatC.push(p[0], p[1]);
    E.add({
      id: 'canopy:' + b.id,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(flatC),
        height: hEave,
        extrudedHeight: hEave + 0.22,
        material: cr('#9aa0a6'),
        outline: false,
      },
      properties: { kind: 'landmark', name: (b.name || '') + ' 入口雨棚' },
    });
  }

  /* ---------- 坡屋顶：给民国建筑的平顶换成双坡瓦屋面 ---------- */
  for (const b of data.buildings || []) {
    if (b.roof !== 'hip' && b.roof !== 'gable') continue;
    if (!b.outline || b.outline.length < 3) continue;
    const hEave = terrain.sample(b.center[0], b.center[1]) + b.height;
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lo, la] of b.outline) {
      minLon = Math.min(minLon, lo); maxLon = Math.max(maxLon, lo);
      minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la);
    }
    const pad = -0.00008;
    minLon -= pad; maxLon += pad; minLat -= pad; maxLat += pad;
    const rise = Math.min(2.6, Math.max(1.4, (maxLon - minLon) * 30000));
    const hRidge = hEave + rise;
    const midLat = (minLat + maxLat) / 2;
    const midLon = (minLon + maxLon) / 2;
    const longAxisLon = (maxLon - minLon) * Math.cos((midLat * Math.PI) / 180) > (maxLat - minLat);
    const mat = cr(b.roofColor || '#5f6462');

    const quads = longAxisLon
      ? [
          [[minLon, minLat, hEave], [maxLon, minLat, hEave], [maxLon, midLat, hRidge], [minLon, midLat, hRidge]],
          [[maxLon, maxLat, hEave], [minLon, maxLat, hEave], [minLon, midLat, hRidge], [maxLon, midLat, hRidge]],
          [[maxLon, minLat, hEave], [maxLon, maxLat, hEave], [maxLon, midLat, hRidge]],
          [[minLon, maxLat, hEave], [minLon, minLat, hEave], [minLon, midLat, hRidge]],
        ]
      : [
          [[minLon, minLat, hEave], [minLon, maxLat, hEave], [midLon, maxLat, hRidge], [midLon, minLat, hRidge]],
          [[maxLon, maxLat, hEave], [maxLon, minLat, hEave], [midLon, minLat, hRidge], [midLon, maxLat, hRidge]],
          [[minLon, maxLat, hEave], [maxLon, maxLat, hEave], [midLon, maxLat, hRidge]],
          [[maxLon, minLat, hEave], [minLon, minLat, hEave], [midLon, minLat, hRidge]],
        ];

    for (const poly of quads) {
      const arr = [];
      for (const [lo, la, h] of poly) arr.push(lo, la, h);
      E.add({
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArrayHeights(arr),
          perPositionHeight: true,
          material: mat,
          outline: false,
        },
        properties: { kind: 'landmark', name: (b.name || '') + ' 坡屋顶' },
      });
    }
  }

  /* ---------- 民国建筑细节：理学院屋顶攒尖亭、工学院六边形塔楼 ---------- */
  const sci = (data.buildings || []).find((b) => b.name === '理学院');
  if (sci) {
    const h0 = terrain.sample(sci.center[0], sci.center[1]) + sci.height;
    // 重檐八角攒尖小亭（屋脊正中的"宝塔"）
    E.add({
      position: Cesium.Cartesian3.fromDegrees(sci.center[0], sci.center[1], h0 + 1.6),
      cylinder: {
        length: 3.2,
        topRadius: 1.2,
        bottomRadius: 2.3,
        material: cr('#6a6f6b'),
      },
      properties: { kind: 'landmark', name: '理学院屋顶攒尖亭' },
    });
    E.add({
      position: Cesium.Cartesian3.fromDegrees(sci.center[0], sci.center[1], h0 + 3.9),
      cylinder: {
        length: 2.0,
        topRadius: 0.12,
        bottomRadius: 1.5,
        material: cr('#5f6462'),
      },
      properties: { kind: 'landmark', name: '理学院屋顶攒尖亭' },
    });
  }

  const eng = (data.buildings || []).find((b) => b.name === '工学院');
  if (eng) {
    const h0 = terrain.sample(eng.center[0], eng.center[1]);
    // 六边形塔楼：贯通四层，比主体略高
    E.add({
      position: Cesium.Cartesian3.fromDegrees(eng.center[0], eng.center[1], h0 + (eng.height + 4) / 2),
      cylinder: {
        length: eng.height + 4,
        topRadius: 3.4,
        bottomRadius: 3.6,
        material: cr('#c2bbaa'),
      },
      properties: { kind: 'landmark', name: '工学院六边形塔楼' },
    });
    E.add({
      position: Cesium.Cartesian3.fromDegrees(eng.center[0], eng.center[1], h0 + eng.height + 4.6),
      cylinder: {
        length: 1.4,
        topRadius: 3.8,
        bottomRadius: 3.8,
        material: cr('#5f6462'),
      },
      properties: { kind: 'landmark', name: '工学院塔楼屋面' },
    });
  }

  /* ---------- 思群广场：400m 标准跑道 ---------- */
  const track = data.track;
  if (track) {
    const [clon, clat] = track.center;
    const h0 = terrain.sample(clon, clat);
    const bearing = (track.bearing || 0) * (Math.PI / 180);
    // 400m 半圆式：直道 84.39m、弯道半径 36.5m、道宽 9.76m（8 道）
    const R = 36.5;
    const L = 84.39;
    const W = 9.76;
    // 外圈与内圈分成两个环，用带洞多边形，避免自交
    const outerPts = trackRing(R, L, W, 28, true);
    const innerPts = trackRing(R, L, W, 28, false);
    const outerDeg = outerPts.map(([x, y]) => {
      const [rx, ry] = rotate(x, y, bearing);
      return offset(clon, clat, rx, ry);
    });
    const innerDeg = innerPts.map(([x, y]) => {
      const [rx, ry] = rotate(x, y, bearing);
      return offset(clon, clat, rx, ry);
    });
    const outerPos = [];
    for (const [lo, la] of outerDeg) outerPos.push(lo, la);
    const innerPos = [];
    for (const [lo, la] of innerDeg) innerPos.push(lo, la);
    E.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(outerPos)),
        height: h0 + 0.26,
        material: cr('#b4573f'),
      },
      properties: { kind: 'landmark', name: '思群广场 400m 跑道' },
    });
    // 内场草地（覆盖跑道内侧，形成环形观感）
    const innerOutline = trackRing(R, L, 0, 28, true).map(([x, y]) => {
      const [rx, ry] = rotate(x, y, bearing);
      return offset(clon, clat, rx, ry);
    });
    const innerFlat = [];
    for (const [lo, la] of innerOutline) innerFlat.push(lo, la);
    E.add({
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(innerFlat),
        height: h0 + 0.34,
        material: cr('#6f9a5e'),
      },
      properties: { kind: 'landmark', name: '思群广场内场' },
    });
  }
}

/* 生成 400m 环形跑道带的多边形（局部坐标，x 东 y 北） */
function trackRing(R, L, width, N, outer) {
  const r = outer ? R + width : R;
  const half = L / 2;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / N;
    pts.push([half + Math.cos(a) * r, Math.sin(a) * r]);
  }
  pts.push([-half, r]);
  for (let i = 0; i <= N; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / N;
    pts.push([-half + Math.cos(a) * r, Math.sin(a) * r]);
  }
  pts.push([half, -r]);
  return pts;
}

function rotate(x, y, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}
