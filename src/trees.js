/* 树木：在绿地与道路两侧程序化撒点，用低模几何（树干 + 树冠）批量绘制 */

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const MLAT = 110540;
const mLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function addTrees(viewer, data, terrain) {
  const Cesium = window.Cesium;
  const rand = seededRandom(20261020);
  const trees = [];

  // 1) 绿地内部撒点
  for (const a of data.areas || []) {
    if (a.kind !== 'green') continue;
    const ring = a.outline;
    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const [lo, la] of ring) {
      minLon = Math.min(minLon, lo);
      maxLon = Math.max(maxLon, lo);
      minLat = Math.min(minLat, la);
      maxLat = Math.max(maxLat, la);
    }
    const area = (maxLon - minLon) * mLon(minLat) * (maxLat - minLat) * MLAT;
    const want = Math.min(55, Math.max(4, Math.round(area / 420)));
    let tries = 0;
    let placed = 0;
    while (placed < want && tries < want * 12) {
      tries++;
      const lon = minLon + rand() * (maxLon - minLon);
      const lat = minLat + rand() * (maxLat - minLat);
      if (!pointInRing(lon, lat, ring)) continue;
      trees.push({ lon, lat, s: 0.85 + rand() * 0.5 });
      placed++;
    }
  }

  // 2) 主要道路两侧行道树
  for (const r of data.roads || []) {
    if (!r.path || r.path.length < 2) continue;
    const isMajor = ['primary', 'secondary', 'tertiary'].includes(r.cls);
    if (!isMajor && rand() > 0.18) continue;
    for (let i = 0; i < r.path.length - 1; i++) {
      const [lon0, lat0] = r.path[i];
      const [lon1, lat1] = r.path[i + 1];
      const dx = (lon1 - lon0) * mLon(lat0);
      const dy = (lat1 - lat0) * MLAT;
      const len = Math.hypot(dx, dy);
      if (len < 18) continue;
      const steps = Math.floor(len / 26);
      for (let k = 0; k < steps; k++) {
        const t = (k + 0.5) / steps;
        const lon = lon0 + (lon1 - lon0) * t;
        const lat = lat0 + (lat1 - lat0) * t;
        const nx = (-dy / len) * (isMajor ? 7.5 : 4.5);
        const ny = (dx / len) * (isMajor ? 7.5 : 4.5);
        for (const sign of [-1, 1]) {
          trees.push({
            lon: lon + (nx * sign) / mLon(lat),
            lat: lat + (ny * sign) / MLAT,
            s: 0.75 + rand() * 0.35,
          });
        }
      }
    }
  }

  // 3) 校园边界内的零星绿地：A 区 + B 区
  const campusSquares = [
    { lon0: 106.4595, lat0: 29.5625, lonW: 0.0105, latH: 0.0105, n: 260, p: 0.35 },
    { lon0: 106.4510, lat0: 29.5668, lonW: 0.0080, latH: 0.0064, n: 130, p: 0.4 },
  ];
  for (const sq of campusSquares) {
    for (let i = 0; i < sq.n; i++) {
      const lon = sq.lon0 + rand() * sq.lonW;
      const lat = sq.lat0 + rand() * sq.latH;
      if (rand() > sq.p) continue;
      trees.push({ lon, lat, s: 0.7 + rand() * 0.4 });
    }
  }

  // 去重（间距 > 4m）
  const kept = [];
  for (const t of trees) {
    let ok = true;
    for (let i = kept.length - 1; i >= 0 && i > kept.length - 400; i--) {
      const d = Math.hypot(
        (t.lon - kept[i].lon) * mLon(t.lat),
        (t.lat - kept[i].lat) * MLAT,
      );
      if (d < 4.2) {
        ok = false;
        break;
      }
    }
    if (ok) kept.push(t);
  }

  const trunks = [];
  const crowns = [];
  const crownColor = Cesium.Color.fromCssColorString('#7f9b6b');
  const trunkColor = Cesium.Color.fromCssColorString('#8a7358');

  const trunkGeo = new Cesium.CylinderGeometry({
    length: 3.4,
    topRadius: 0.18,
    bottomRadius: 0.3,
    vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
  });
  const coneGeo = new Cesium.CylinderGeometry({
    length: 7.2,
    topRadius: 0.15,
    bottomRadius: 2.6,
    slices: 7,
    vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
  });
  const ballGeo = new Cesium.EllipsoidGeometry({
    radii: new Cesium.Cartesian3(2.4, 2.4, 2.7),
    stackPartitions: 5,
    slicePartitions: 9,
    vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
  });

  const greens = ['#4f7a45', '#5c8a50', '#3f6b3c', '#6b9459'];
  for (let i = 0; i < kept.length; i++) {
    const t = kept[i];
    const h0 = terrain.sample(t.lon, t.lat);
    const base = Cesium.Cartesian3.fromDegrees(t.lon, t.lat, h0 - 0.3);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(base);
    // 民主湖周边以阔叶（垂柳）为主，北侧松林坡以针叶为主
    const dLake = Math.hypot((t.lon - 106.46599) * 96000, (t.lat - 29.56635) * 110540);
    const dNorth = Math.hypot((t.lon - 106.4625) * 96000, (t.lat - 29.5725) * 110540);
    const conifer = dNorth < 260 ? i % 4 !== 0 : dLake < 300 ? i % 7 === 0 : i % 3 === 0;
    const scale = Math.min(1.25, Math.max(0.75, t.s));

    const tm = Cesium.Matrix4.multiplyByTranslation(enu, new Cesium.Cartesian3(0, 0, 1.7 * scale), new Cesium.Matrix4());
    trunks.push(
      new Cesium.GeometryInstance({
        geometry: trunkGeo,
        modelMatrix: tm,
        attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(trunkColor) },
      }),
    );

    const cm = Cesium.Matrix4.multiplyByTranslation(
      enu,
      new Cesium.Cartesian3(0, 0, conifer ? 4.2 * scale : 4.5 * scale),
      new Cesium.Matrix4(),
    );
    const node = new Cesium.GeometryInstance({
      geometry: conifer ? coneGeo : ballGeo,
      modelMatrix: Cesium.Matrix4.multiply(
        cm,
        Cesium.Matrix4.fromUniformScale(scale),
        new Cesium.Matrix4(),
      ),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(
          Cesium.Color.fromCssColorString(greens[i % greens.length]),
        ),
      },
    });
    crowns.push(node);
  }

  viewer.scene.primitives.add(
    new Cesium.Primitive({
      geometryInstances: trunks,
      appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true }),
      asynchronous: true,
    }),
  );
  viewer.scene.primitives.add(
    new Cesium.Primitive({
      geometryInstances: crowns,
      appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true }),
      asynchronous: true,
    }),
  );

  return kept.length;
}
