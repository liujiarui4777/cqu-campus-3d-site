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
  if (!data.boundary || !data.boundary.length) return;
  const coords = [];
  for (const [lon, lat] of data.boundary) coords.push(lon, lat);
  const inst = new Cesium.GeometryInstance({
    geometry: new Cesium.GroundPolylineGeometry({
      positions: Cesium.Cartesian3.fromDegreesArray(coords),
      width: 2.2,
    }),
    attributes: {
      color: Cesium.ColorGeometryInstanceAttribute.fromColor(
        Cesium.Color.fromCssColorString('#2f6f6a').withAlpha(0.9),
      ),
    },
  });
  viewer.scene.primitives.add(
    new Cesium.GroundPolylinePrimitive({
      geometryInstances: [inst],
      appearance: new Cesium.PolylineColorAppearance({ translucent: true }),
      classificationType: Cesium.ClassificationType.TERRAIN,
      asynchronous: true,
    }),
  );
}

export function addBuildings(viewer, data, terrain) {
  const Cesium = window.Cesium;
  const store = viewer.entities;

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

    // 窗带：沿立面每隔若干层一条深色薄环（外扩 0.12m 避免共面闪烁）
    if (top - bottom > 10 && b.levels >= 3) {
      const mLon = 111320 * Math.cos((b.center[1] * Math.PI) / 180);
      const MLAT = 110540;
      const cx = b.center[0];
      const cy = b.center[1];
      const exp = b.outline.map(([lon, lat]) => {
        const dx = (lon - cx) * mLon;
        const dy = (lat - cy) * MLAT;
        const len = Math.hypot(dx, dy) || 1;
        return [lon + ((dx / len) * 0.14) / mLon, lat + ((dy / len) * 0.14) / MLAT];
      });
      const expPos = [];
      for (const [lo, la] of exp) expPos.push(lo, la);
      const expHierarchy = Cesium.Cartesian3.fromDegreesArray(expPos);
      const bands = Math.max(1, Math.min(8, Math.floor(b.levels / 2)));
      const span = top - bottom;
      const glass = Cesium.Color.fromCssColorString('#7d8b96');
      for (let i = 1; i <= bands; i++) {
        const y = bottom + (span * i) / (bands + 1);
        store.add({
          id: 'win:' + b.id + ':' + i,
          polygon: {
            hierarchy: expHierarchy,
            height: y,
            extrudedHeight: y + Math.min(1.5, span / (bands + 1) * 0.5),
            material: glass,
            outline: false,
          },
          properties: { kind: 'building', data: b },
        });
      }
    }

    // 地标建筑：沿立面每 4.5m 加一道竖向窗间柱（形成竖窗格感）
    if (b.landmark && b.outline.length >= 3) {
      const kLon = 111320 * Math.cos((b.center[1] * Math.PI) / 180);
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
      const step = 4.5;
      const n = Math.max(3, Math.floor(per / step));
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
        store.add({
          id: 'pier:' + b.id + ':' + k,
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray(fp),
            height: bottom + 1.4,
            extrudedHeight: top - 0.8,
            material: new Cesium.Color(dark.red * 0.82, dark.green * 0.82, dark.blue * 0.82, 1),
            outline: false,
          },
          properties: { kind: 'building', data: b },
        });
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
      const h0 = terrain.sample(a.center[0], a.center[1]);
      // 岸线石条：沿水面轮廓外扩 1.3m 的深色环
      const kLon = 111320 * Math.cos((a.center[1] * Math.PI) / 180);
      const expRing = a.outline.map(([lon, lat]) => {
        const dx = (lon - a.center[0]) * kLon;
        const dy = (lat - a.center[1]) * MLAT;
        const len = Math.hypot(dx, dy) || 1;
        const off = 1.3;
        return [lon + ((dx / len) * off) / kLon, lat + ((dy / len) * off) / MLAT];
      });
      const bankFlat = [];
      for (const [lo, la] of expRing) bankFlat.push(lo, la);
      viewer.entities.add({
        id: 'bank:' + a.id,
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(bankFlat),
          height: h0 + 0.02,
          material: Cesium.Color.fromCssColorString('#b9b2a2'),
          outline: false,
        },
        properties: { kind: 'area' },
      });
      viewer.entities.add({
        id: 'water:' + a.id,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(ringPositions(Cesium, a.outline, 0)),
          height: h0 + 0.04,
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

  function ringToPositions(ring, h) {
    const arr = [];
    for (const [lon, lat] of ring) arr.push(lon, lat, h);
    return Cesium.Cartesian3.fromDegreesArrayHeights(arr);
  }

  const surfaces = [];
  const walks = [];
  const centerLines = [];

  for (const r of data.roads) {
    if (!r.path || r.path.length < 2) continue;
    const isWalk = r.cls === 'footway' || r.cls === 'steps' || r.lanes === 0;
    const w = isWalk ? 2.4 : Math.max(3, r.width);

    const isMajorRoad = ['primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link'].includes(r.cls);
    if (!isMajorRoad) {
      // 支路/服务道：已烘焙进底图，这里不再生成几何（大幅降低贴地多边形数量）
      continue;
    }

    if (!isWalk && w > 4) {
      // 路缘石：路面两侧各一条 0.44m 宽的石条
      for (const side of [-1, 1]) {
        const line = offsetPath(r.path, side * (w / 2 + 0.24));
        const ring = bufferRing(line, 0.22);
        if (ring.length < 4) continue;
        walks.push(
          new Cesium.GeometryInstance({
            geometry: new Cesium.PolygonGeometry({
              polygonHierarchy: new Cesium.PolygonHierarchy(ringPositions(Cesium, ring, 0)),
              perPositionHeight: true,
              vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                Cesium.Color.fromCssColorString('#b3ada0'),
              ),
            },
          }),
        );
      }
    }

    // 路面
    const roadRing = bufferRing(r.path, w / 2);
    const roadColor = isWalk
      ? '#d6d0c1'
      : r.tunnel
        ? '#3a3f45'
        : r.bridge
          ? '#5a5f66'
          : '#575c63';
    surfaces.push(
      new Cesium.GeometryInstance({
        geometry: new Cesium.PolygonGeometry({
          polygonHierarchy: new Cesium.PolygonHierarchy(ringToPositions(roadRing, 0.06)),
          vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(
            Cesium.Color.fromCssColorString(roadColor),
          ),
        },
      }),
    );

    // 车道分道线：按车道数在路面内均分
    // 台阶：每 1.3m 一条横向踏步线
    if (r.cls === 'steps' && r.path.length >= 2) {
      for (let i = 0; i < r.path.length - 1; i++) {
        const lon0 = r.path[i][0];
        const lat0 = r.path[i][1];
        const lon1 = r.path[i + 1][0];
        const lat1 = r.path[i + 1][1];
        const dx = (lon1 - lon0) * mLon(lat0);
        const dy = (lat1 - lat0) * MLAT;
        const len = Math.hypot(dx, dy);
        if (len < 1) continue;
        const n = Math.max(1, Math.floor(len / 1.3));
        const nx = -dy / len;
        const ny = dx / len;
        const half = 1.7;
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const lon = lon0 + (lon1 - lon0) * t;
          const lat = lat0 + (lat1 - lat0) * t;
          const a = [
            lon + (nx * half) / mLon(lat),
            lat + (ny * half) / MLAT,
            lon - (nx * half) / mLon(lat),
            lat - (ny * half) / MLAT,
          ];
          centerLines.push(
            new Cesium.GeometryInstance({
              geometry: new Cesium.GroundPolylineGeometry({
                positions: Cesium.Cartesian3.fromDegreesArray(a),
                width: 1.4,
              }),
              attributes: {
                color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                  Cesium.Color.fromCssColorString('#9a9486'),
                ),
              },
            }),
          );
        }
      }
    }

    if (!isWalk && r.lanes >= 2 && r.path.length >= 2) {
      for (let i = 1; i < r.lanes; i++) {
        const off = -w / 2 + (w / r.lanes) * i;
        const isCenter = Math.abs(off) < 0.2;
        const line = offsetPath(r.path, off);
        const arr = [];
        for (const [lon, lat] of line) arr.push(lon, lat);
        centerLines.push(
          new Cesium.GeometryInstance({
            geometry: new Cesium.GroundPolylineGeometry({
              positions: Cesium.Cartesian3.fromDegreesArray(arr),
              width: isCenter ? 1.5 : 0.9,
            }),
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                Cesium.Color.fromCssColorString(isCenter ? '#cbb98a' : '#cfc9b8'),
              ),
            },
          }),
        );
      }
    }
  }

  const add = (insts, appearance) => {
    if (!insts.length) return;
    viewer.scene.primitives.add(
      new Cesium.GroundPrimitive({
        geometryInstances: insts,
        appearance,
        classificationType: Cesium.ClassificationType.TERRAIN,
        asynchronous: true,
      }),
    );
  };

  add(walks, new Cesium.PerInstanceColorAppearance({ translucent: false, closed: false }));
  add(surfaces, new Cesium.PerInstanceColorAppearance({ translucent: false, closed: false }));
  if (centerLines.length) {
    viewer.scene.primitives.add(
      new Cesium.GroundPolylinePrimitive({
        geometryInstances: centerLines,
        appearance: new Cesium.PolylineColorAppearance({ translucent: true }),
        classificationType: Cesium.ClassificationType.TERRAIN,
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
