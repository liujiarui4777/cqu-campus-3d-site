const MLAT = 110540;

function ringWithHeights(Cesium, ring, terrain, offset) {
  const arr = [];
  for (const [lon, lat] of ring) {
    arr.push(lon, lat, terrain.sample(lon, lat) + offset);
  }
  return Cesium.Cartesian3.fromDegreesArrayHeights(arr);
}

/* 场景构件：区域 / 道路 / 建筑 / 边界 */

function flatLonLat(ring) {
  const out = [];
  for (const [lon, lat] of ring) out.push(lon, lat);
  return out;
}

const ringPositions = (Cesium, ring, height) =>
  ring.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, height));

export function addBoundary(viewer, data, terrain) {
  const Cesium = window.Cesium;
  const list =
    data.boundaries && data.boundaries.length
      ? data.boundaries
      : data.boundary && data.boundary.length
        ? [{ name: '校区边界', campus: 'A', coords: data.boundary }]
        : [];
  if (!list.length) return;

  const insts = [];
  for (const bdr of list) {
    if (!bdr.coords || bdr.coords.length < 3) continue;
    const coords = [];
    for (const [lon, lat] of bdr.coords) coords.push(lon, lat);
    insts.push(
      new Cesium.GeometryInstance({
        geometry: new Cesium.GroundPolylineGeometry({
          positions: Cesium.Cartesian3.fromDegreesArray(coords),
          width: bdr.campus === 'B' ? 2.0 : 2.2,
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(
            Cesium.Color.fromCssColorString(
              bdr.campus === 'B'
                ? '#8a6a3f'
                : bdr.campus === 'C'
                  ? '#7a5f9a'
                  : bdr.campus === 'HX'
                    ? '#b25c44'
                    : '#2f6f6a',
            ).withAlpha(0.9),
          ),
        },
      }),
    );
  }
  if (!insts.length) return;
  viewer.scene.primitives.add(
    new Cesium.GroundPolylinePrimitive({
      geometryInstances: insts,
      appearance: new Cesium.PolylineColorAppearance({ translucent: true }),
      classificationType: Cesium.ClassificationType.TERRAIN,
      asynchronous: true,
    }),
  );
}

function expandRing(ring, center, d, kLon) {
  const kLat = 110540;
  return ring.map(([lon, lat]) => {
    const dx = (lon - center[0]) * kLon;
    const dy = (lat - center[1]) * kLat;
    const len = Math.hypot(dx, dy) || 1;
    return [lon + ((dx / len) * d) / kLon, lat + ((dy / len) * d) / kLat];
  });
}

function mixColor(c, target, t) {
  return new c.constructor(
    c.red + (target.red - c.red) * t,
    c.green + (target.green - c.green) * t,
    c.blue + (target.blue - c.blue) * t,
    1,
  );
}

export function addBuildings(viewer, data, terrain) {
  const Cesium = window.Cesium;
  const store = viewer.entities;
  // 窗间柱按颜色分组，最后一次性实例化（避免几百个 Entity 拖慢帧率）
  const pierGroups = new Map();

  for (const b of data.buildings) {
    if (!b.outline || b.outline.length < 3) continue;
    const h0 = terrain.sample(b.center[0], b.center[1]);
    const bottom = h0 - 8;
    const top = h0 + b.height;
    // 底部按每个顶点采样地形，贴合坡地，避免悬空/埋地
    const flat = [];
    for (const [lon, lat] of b.outline) {
      const h = terrain.sample(lon, lat);
      flat.push(lon, lat, h - 0.8);
    }
    const hierarchy = Cesium.Cartesian3.fromDegreesArrayHeights(flat);

    const wall = Cesium.Color.fromCssColorString(b.wall || '#e1dcd0');
    const roof = Cesium.Color.fromCssColorString(b.roofColor || '#a8a49b');

    store.add({
      id: 'b:' + b.id,
      name: b.name || '未命名建筑',
      position: Cesium.Cartesian3.fromDegrees(b.center[0], b.center[1], top),
      polygon: {
        hierarchy,
        perPositionHeight: true,
        extrudedHeight: top,
        material: wall,
        outline: false,
      },
      properties: { kind: 'building', data: b },
    });

    // 基座：底部一段深色，让楼"立"在地面上
    const wallC = Cesium.Color.fromCssColorString(b.wall || '#e1dcd0');
    const dark = new Cesium.Color(wallC.red * 0.86, wallC.green * 0.86, wallC.blue * 0.86, 1);
    const baseH = Math.min(4.2, Math.max(1.2, (top - bottom) * 0.16));
    store.add({
      id: 'base:' + b.id,
      polygon: {
        hierarchy,
        perPositionHeight: true,
        extrudedHeight: bottom + baseH,
        material: dark,
        outline: false,
      },
      properties: { kind: 'building', data: b },
    });

    // 窗带：沿立面每隔若干层一条深色薄环（外扩 0.14m 避免共面闪烁）
    const kLon = 111320 * Math.cos((b.center[1] * Math.PI) / 180);
    if (top - bottom > 10 && b.levels >= 3 && b.campus !== 'B') {
      const exp = expandRing(b.outline, b.center, 0.14, kLon);
      const expPos = [];
      for (const [lo, la] of exp) expPos.push(lo, la);
      const expHierarchy = Cesium.Cartesian3.fromDegreesArray(expPos);
      const bands = Math.max(1, Math.min(6, Math.floor(b.levels / 2)));
      const span = top - bottom;
      const glass = Cesium.Color.fromCssColorString(b.glass || '#5f7076');
      for (let i = 1; i <= bands; i++) {
        const y = bottom + (span * i) / (bands + 1);
        store.add({
          id: 'win:' + b.id + ':' + i,
          polygon: {
            hierarchy: expHierarchy,
            height: y,
            extrudedHeight: y + Math.min(1.5, (span / (bands + 1)) * 0.5),
            material: glass,
            outline: false,
          },
          properties: { kind: 'building', data: b },
        });
      }
    }

    // 檐口 / 女儿墙：顶部一圈 0.7—1.0m 的收头，让屋顶边缘有厚度
    const accent = Cesium.Color.fromCssColorString(b.accent || b.wall || '#e1dcd0');
    const isPitched = b.roof === 'hip' || b.roof === 'gable' || b.roof === 'arc';
    if (b.height > 6) {
      if (isPitched) {
        // 坡屋顶：屋檐挑出一圈浅色檐口
        const eave = expandRing(b.outline, b.center, 0.4, kLon);
        const ep = [];
        for (const [lo, la] of eave) ep.push(lo, la);
        store.add({
          id: 'ev' + b.id,
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray(ep),
            height: top - 0.5,
            extrudedHeight: top + 0.12,
            material: mixColor(wall, Cesium.Color.WHITE, 0.22),
            outline: false,
          },
          properties: { kind: 'building', data: b },
        });
      } else {
        // 平屋顶：女儿墙（略深，压住屋顶与墙面的交界）
        const par = expandRing(b.outline, b.center, 0.08, kLon);
        const pp = [];
        for (const [lo, la] of par) pp.push(lo, la);
        store.add({
          id: 'pp' + b.id,
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray(pp),
            height: top - 0.85,
            extrudedHeight: top + 0.02,
            material: mixColor(wall, Cesium.Color.BLACK, 0.08),
            outline: false,
          },
          properties: { kind: 'building', data: b },
        });
      }
    }

    // 竖向窗间柱：地标建筑 4.5m 一道；体量较大的教学/办公建筑 7m 一道
    // 用实例化 Primitive 批量绘制（每栋楼几百根柱不会拖慢帧率）
    const pierStep = b.landmark ? 4.5 : 7;
    const wantPiers = b.landmark || (b.area > 1600 && b.levels >= 3 && b.height > 10);
    if (wantPiers && b.outline.length >= 3) {
      const ring = b.outline;
      const segs = [];
      let per = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const c = ring[(i + 1) % ring.length];
        const dx = (c[0] - a[0]) * kLon;
        const dy = (c[1] - a[1]) * MLAT;
        const len = Math.hypot(dx, dy);
        if (len < 0.5) continue;
        segs.push({ a, c, tx: dx / len, ty: dy / len, len, start: per });
        per += len;
      }
      const n = Math.max(3, Math.floor(per / pierStep));
      for (let k = 0; k < n; k++) {
        const target = (k + 0.5) * (per / n);
        let seg = segs[segs.length - 1];
        for (const s of segs) {
          if (target >= s.start && target < s.start + s.len) { seg = s; break; }
        }
        if (!seg) continue;
        const t = Math.max(0, Math.min(1, (target - seg.start) / seg.len));
        const px = seg.a[0] + (seg.c[0] - seg.a[0]) * t;
        const py = seg.a[1] + (seg.c[1] - seg.a[1]) * t;
        const nx = -seg.ty;
        const ny = seg.tx;
        const halfW = 0.34;
        const out = 0.1;
        const pts = [
          [px + (nx * out + seg.tx * halfW) / kLon, py + (ny * out + seg.ty * halfW) / MLAT],
          [px + (nx * out - seg.tx * halfW) / kLon, py + (ny * out - seg.ty * halfW) / MLAT],
          [px + (nx * (out + 0.2) - seg.tx * halfW) / kLon, py + (ny * (out + 0.2) - seg.ty * halfW) / MLAT],
          [px + (nx * (out + 0.2) + seg.tx * halfW) / kLon, py + (ny * (out + 0.2) + seg.ty * halfW) / MLAT],
        ];
        const fp = [];
        for (const p of pts) fp.push(p[0], p[1]);
        const pierColor = b.landmark ? accent : mixColor(dark, Cesium.Color.BLACK, 0.06);
        const key = pierColor.toCssColorString();
        let group = pierGroups.get(key);
        if (!group) {
          group = { color: pierColor, insts: [] };
          pierGroups.set(key, group);
        }
        group.insts.push(
          new Cesium.GeometryInstance({
            geometry: new Cesium.PolygonGeometry({
              polygonHierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(fp)),
              height: bottom + 1.4,
              extrudedHeight: top - 0.8,
              vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(pierColor),
            },
          }),
        );
      }
    }

    // 屋顶面：单独一层薄面，保证屋顶色与墙面色分开
    store.add({
      id: 'r:' + b.id,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(flatLonLat(b.outline)),
        height: top + 0.06,
        material: roof,
        outline: false,
      },
      properties: { kind: 'roof', data: b },
    });
  }

  // 窗间柱：每个颜色一个实例化 Primitive
  window.__pierPrims = [];
  for (const group of pierGroups.values()) {
    if (!group.insts.length) continue;
    const prim = new Cesium.Primitive({
      geometryInstances: group.insts,
      appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: false }),
      asynchronous: true,
    });
    viewer.scene.primitives.add(prim);
    window.__pierPrims.push({ prim, color: group.color });
  }
}

export function addAreas(viewer, data, terrain) {
  const Cesium = window.Cesium;
  const water = [];
  const green = [];
  const pitch = [];

  for (const a of data.areas) {
    if (!a.outline || a.outline.length < 3) continue;
    if (a.kind === 'river') continue;
    const inst = new Cesium.GeometryInstance({
      geometry: new Cesium.PolygonGeometry({
        polygonHierarchy: new Cesium.PolygonHierarchy(ringWithHeights(Cesium, a.outline, terrain, 0.65)),
        perPositionHeight: true,
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(
          Cesium.Color.fromCssColorString(a.color),
        ),
      },
      id: { kind: 'area', id: a.id },
    });
    if (a.kind === 'water') {
      // 岸线石条：外扩 1.2m 的环形（外环 - 内环），逐顶点贴地形，避免整片盖住水面
      const kLon = 111320 * Math.cos((a.center[1] * Math.PI) / 180);
      const expRing = a.outline.map(([lon, lat]) => {
        const dx = (lon - a.center[0]) * kLon;
        const dy = (lat - a.center[1]) * MLAT;
        const len = Math.hypot(dx, dy) || 1;
        const off = 1.2;
        return [lon + ((dx / len) * off) / kLon, lat + ((dy / len) * off) / MLAT];
      });
      const outerArr = [];
      for (const [lo, la] of expRing) outerArr.push(lo, la, terrain.sample(lo, la) + 0.18);
      const innerArr = [];
      for (const [lo, la] of a.outline) innerArr.push(lo, la, terrain.sample(lo, la) + 0.18);
      viewer.entities.add({
        id: 'bank:' + a.id,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(
            Cesium.Cartesian3.fromDegreesArrayHeights(outerArr),
            [new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArrayHeights(innerArr))],
          ),
          perPositionHeight: true,
          material: Cesium.Color.fromCssColorString('#b9b2a2'),
          outline: false,
        },
        properties: { kind: 'area' },
      });
      // 水面：逐顶点贴地形 +0.1m（比固定高程更稳，避免地形穿透出现“假岛”）
      const waterArr = [];
      for (const [lo, la] of a.outline) waterArr.push(lo, la, terrain.sample(lo, la) + 0.1);
      viewer.entities.add({
        id: 'water:' + a.id,
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArrayHeights(waterArr),
          perPositionHeight: true,
          material: Cesium.Color.fromCssColorString(a.color).withAlpha(0.96),
          outline: false,
        },
        properties: { kind: 'area', name: a.name || '水面' },
      });
      continue;
    }
    else if (a.kind === 'green') green.push(inst);
    else if (a.kind === 'pitch') pitch.push(inst);
  }

  const add = (insts) => {
    if (!insts.length) return;
    viewer.scene.primitives.add(
      new Cesium.Primitive({
        geometryInstances: insts,
        appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: false }),
        asynchronous: true,
      }),
    );
  };
  add(green);
  add(pitch);
  add(water);
}


export function addRoads(viewer, data, terrain) {
  const Cesium = window.Cesium;
  const MLAT = 110540;
  const mLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);
  // 只对主干道生成 3D 路面；支路/步道仍烘焙进底图（性能关键）
  const MAJOR = ['primary', 'secondary', 'tertiary'];

  // 折线按 maxStep 米加密，保证路面贴合地形起伏
  function densify(path, maxStep) {
    const out = [path[0]];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const k = mLon((a[1] + b[1]) / 2);
      const len = Math.hypot((b[0] - a[0]) * k, (b[1] - a[1]) * MLAT);
      const n = Math.max(1, Math.ceil(len / maxStep));
      for (let j = 1; j <= n; j++) {
        const t = j / n;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  }

  // 按真实米宽生成道路带（Cesium 的 polyline 宽度是像素，不能用）
  function bufferRing(path, halfWidth) {
    const left = [];
    const right = [];
    for (let i = 0; i < path.length; i++) {
      const p0 = path[Math.max(0, i - 1)];
      const p1 = path[Math.min(path.length - 1, i + 1)];
      const lat = path[i][1];
      const dx = (p1[0] - p0[0]) * mLon(lat);
      const dy = (p1[1] - p0[1]) * MLAT;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      left.push([path[i][0] + (nx * halfWidth) / mLon(lat), path[i][1] + (ny * halfWidth) / MLAT]);
      right.push([path[i][0] - (nx * halfWidth) / mLon(lat), path[i][1] - (ny * halfWidth) / MLAT]);
    }
    const ring = left.slice();
    for (let i = right.length - 1; i >= 0; i--) ring.push(right[i]);
    return ring;
  }

  function offsetPath(path, dist) {
    const out = [];
    for (let i = 0; i < path.length; i++) {
      const p0 = path[Math.max(0, i - 1)];
      const p1 = path[Math.min(path.length - 1, i + 1)];
      const lat = path[i][1];
      const dx = (p1[0] - p0[0]) * mLon(lat);
      const dy = (p1[1] - p0[1]) * MLAT;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      out.push([path[i][0] + (nx * dist) / mLon(lat), path[i][1] + (ny * dist) / MLAT]);
    }
    return out;
  }

  function ringPositions(ring, h) {
    const arr = [];
    for (const [lon, lat] of ring) arr.push(lon, lat, terrain.sample(lon, lat) + h);
    return Cesium.Cartesian3.fromDegreesArrayHeights(arr);
  }

  const groups = new Map(); // 颜色 → GeometryInstance[]
  const push = (color, ring, h) => {
    let arr = groups.get(color);
    if (!arr) {
      arr = [];
      groups.set(color, arr);
    }
    arr.push(
      new Cesium.GeometryInstance({
        geometry: new Cesium.PolygonGeometry({
          polygonHierarchy: new Cesium.PolygonHierarchy(ringPositions(ring, h)),
          perPositionHeight: true,
          vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString(color)),
        },
      }),
    );
  };

  // 分段四边形：每段单独成面，避免长条带在多边形三角化时出现“大面片”
  function addBand(path, width, color, h) {
    const half = width / 2;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const k = mLon((a[1] + b[1]) / 2);
      let dx = (b[0] - a[0]) * k;
      let dy = (b[1] - a[1]) * MLAT;
      const len = Math.hypot(dx, dy);
      if (len < 0.4) continue;
      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy;
      const ny = ux;
      // 两端各外延 0.18m，让相邻段搭接，避免出现缝隙
      const ext = 0.18;
      const a2 = [a[0] - (ux * ext) / k, a[1] - (uy * ext) / MLAT];
      const b2 = [b[0] + (ux * ext) / k, b[1] + (uy * ext) / MLAT];
      const ring = [
        [a2[0] + (nx * half) / k, a2[1] + (ny * half) / MLAT],
        [b2[0] + (nx * half) / k, b2[1] + (ny * half) / MLAT],
        [b2[0] - (nx * half) / k, b2[1] - (ny * half) / MLAT],
        [a2[0] - (nx * half) / k, a2[1] - (ny * half) / MLAT],
      ];
      push(color, ring, h);
    }
  }

  let idx = 0;
  for (const r of data.roads) {
    if (!MAJOR.includes(r.cls)) continue;
    if (!r.path || r.path.length < 2) continue;
    const w = Math.max(4, r.width || 7.5);
    const path = densify(r.path, 8);
    // 逐条微调高度，减少路口处同高面片的 z-fighting
    const lift = 0.14 + (idx % 5) * 0.012;
    idx++;

    const surface = r.tunnel ? '#3b4046' : r.bridge ? '#5d6268' : r.lanes >= 2 ? '#4b5057' : '#545960';
    addBand(path, w, surface, lift);

    // 路缘石：主干道（≥10m）两侧各 0.36m 宽，比路面高 6cm
    if (w >= 10) {
      addBand(offsetPath(path, w / 2 + 0.18), 0.36, '#b5afa2', lift + 0.06);
      addBand(offsetPath(path, -w / 2 - 0.18), 0.36, '#b5afa2', lift + 0.06);
    }

    // 中心线
    if (!r.tunnel && r.lanes >= 2) {
      addBand(path, 0.28, '#dcd0a4', lift + 0.03);
    }
  }

  for (const [color, insts] of groups) {
    if (!insts.length) continue;
    viewer.scene.primitives.add(
      new Cesium.Primitive({
        geometryInstances: insts,
        appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: false }),
        asynchronous: true,
      }),
    );
  }
}

/* 嘉陵江：用固定水面高程的多边形，避免贴地后被岸边地形切碎 */
export function addRiver(viewer, data, terrain) {
  const Cesium = window.Cesium;
  const rivers = (data.areas || []).filter((a) => a.kind === 'river');
  if (!rivers.length) return;
  for (const r of rivers) {
    let minH = Infinity;
    for (const [lon, lat] of r.outline) minH = Math.min(minH, terrain.sample(lon, lat));
    if (!isFinite(minH)) minH = 170;
    const flat = [];
    for (const [lon, lat] of r.outline) flat.push(lon, lat);
    viewer.entities.add({
      id: 'river:' + r.id,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(flat),
        height: minH + 2.5,
        material: Cesium.Color.fromCssColorString('#a5c8d8').withAlpha(0.94),
      },
      properties: { kind: 'river', name: '嘉陵江' },
    });
  }
}
