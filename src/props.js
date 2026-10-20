/* 建筑小品：屋顶设备（空调机组/楼梯间/水箱）、檐口挑出 */

const MLAT = 110540;
const mLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function addRoofProps(viewer, data, terrain) {
  const Cesium = window.Cesium;
  const rand = seeded(8801);
  const gray = Cesium.Color.fromCssColorString('#b9b6ae');
  let count = 0;

  for (const b of data.buildings || []) {
    if (!b.outline || b.outline.length < 3) continue;
    if (b.roof !== 'flat') continue;
    if (b.height < 9) continue;
    const h0 = terrain.sample(b.center[0], b.center[1]) + b.height;
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lo, la] of b.outline) {
      minLon = Math.min(minLon, lo); maxLon = Math.max(maxLon, lo);
      minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la);
    }
    const wm = (maxLon - minLon) * mLon(b.center[1]);
    const hm = (maxLat - minLat) * MLAT;
    const n = wm * hm > 900 ? 3 : wm * hm > 350 ? 2 : 1;
    let placed = 0;
    let tries = 0;
    while (placed < n && tries < 30) {
      tries++;
      const lon = minLon + rand() * (maxLon - minLon);
      const lat = minLat + rand() * (maxLat - minLat);
      if (!pointInRing(lon, lat, b.outline)) continue;
      const isTank = rand() > 0.78;
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, h0 + (isTank ? 1.1 : 0.5)),
        cylinder: isTank
          ? { length: 2.2, topRadius: 0.9, bottomRadius: 0.9, material: gray }
          : undefined,
        box: isTank
          ? undefined
          : { dimensions: new Cesium.Cartesian3(2.6, 2.6, 1.0), material: gray },
        properties: { kind: 'prop' },
      });
      placed++;
      count++;
    }
  }

  // 檐口：屋顶边缘挑出 0.35m 的深色薄带
  for (const b of data.buildings || []) {
    if (!b.outline || b.outline.length < 3) continue;
    if (b.height < 7) continue;
    const h0 = terrain.sample(b.center[0], b.center[1]) + b.height;
    const kLon = mLon(b.center[1]);
    const exp = b.outline.map(([lon, lat]) => {
      const dx = (lon - b.center[0]) * kLon;
      const dy = (lat - b.center[1]) * MLAT;
      const len = Math.hypot(dx, dy) || 1;
      return [
        lon + ((dx / len) * 0.38) / kLon,
        lat + ((dy / len) * 0.38) / MLAT,
      ];
    });
    const flat = [];
    for (const [lo, la] of exp) flat.push(lo, la);
    const c = Cesium.Color.fromCssColorString(b.roofColor || '#a8a49b');
    viewer.entities.add({
      id: 'eave:' + b.id,
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(flat),
        height: h0 - 0.32,
        extrudedHeight: h0 + 0.02,
        material: new Cesium.Color(Math.min(1, c.red * 0.88), Math.min(1, c.green * 0.88), Math.min(1, c.blue * 0.88), 1),
        outline: false,
      },
      properties: { kind: 'building', data: b },
    });
  }

  return count;
}
