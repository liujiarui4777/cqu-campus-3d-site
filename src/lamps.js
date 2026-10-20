/* 路灯：沿主干道两侧每 32 m 一根，灯杆用共享几何批量绘制，灯头用 Entity 便于昼夜调色 */

const MLAT = 110540;
const mLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

export function addLamps(viewer, data, terrain) {
  const Cesium = window.Cesium;
  const major = ['primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link', 'residential'];
  const spots = [];

  for (const r of data.roads || []) {
    if (!major.includes(r.cls)) continue;
    if (!r.path || r.path.length < 2) continue;
    const half = Math.max(4, (r.width || 8) / 2) + 1.4;
    let side = 1;
    for (let i = 0; i < r.path.length - 1; i++) {
      const [lon0, lat0] = r.path[i];
      const [lon1, lat1] = r.path[i + 1];
      const dx = (lon1 - lon0) * mLon(lat0);
      const dy = (lat1 - lat0) * MLAT;
      const len = Math.hypot(dx, dy);
      if (len < 14) continue;
      const steps = Math.max(1, Math.floor(len / 34));
      for (let k = 0; k < steps; k++) {
        const t = (k + 0.5) / steps;
        const lon = lon0 + (lon1 - lon0) * t;
        const lat = lat0 + (lat1 - lat0) * t;
        const nx = (-dy / len) * half * side;
        const ny = (dx / len) * half * side;
        side *= -1;
        const plon = lon + nx / mLon(lat);
        const plat = lat + ny / MLAT;
        spots.push({ lon: plon, lat: plat, h: terrain.sample(plon, plat) });
      }
    }
  }

  // 灯杆（共享几何 + 实例矩阵）
  const poleGeo = new Cesium.CylinderGeometry({
    length: 8,
    topRadius: 0.07,
    bottomRadius: 0.12,
    vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
  });
  const poleColor = Cesium.Color.fromCssColorString('#6b7076');
  const poles = [];
  for (const s of spots) {
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(
      Cesium.Cartesian3.fromDegrees(s.lon, s.lat, s.h - 0.2),
    );
    poles.push(
      new Cesium.GeometryInstance({
        geometry: poleGeo,
        modelMatrix: Cesium.Matrix4.multiplyByTranslation(enu, new Cesium.Cartesian3(0, 0, 4), new Cesium.Matrix4()),
        attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(poleColor) },
      }),
    );
  }
  viewer.scene.primitives.add(
    new Cesium.Primitive({
      geometryInstances: poles,
      appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true }),
      asynchronous: true,
    }),
  );

  // 灯头（Entity，便于夜间发亮）
  spots.forEach((s, i) => {
    viewer.entities.add({
      id: 'lamp:' + i,
      position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, s.h + 7.8),
      ellipsoid: {
        radii: new Cesium.Cartesian3(0.3, 0.3, 0.34),
        material: Cesium.Color.fromCssColorString('#8b8f94'),
      },
      properties: { kind: 'lamp' },
    });
  });

  return spots.length;
}
