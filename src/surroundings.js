/* 非重庆大学建筑：15 km 范围内的白色体块（白模），按高德地图城市白模的观感，
 * 用 OSM 真实建筑轮廓挤出，而不是方块近似。不参与拾取。
 *
 * 数据由 tools/build-surroundings-15km.mjs 生成：items[].outline + h；
 * A/B/C 区内的精细建筑已排除。
 */
export async function addSurroundings(viewer, base, terrain) {
  const Cesium = window.Cesium;
  const data = await fetch(`${base}data/surroundings.json`).then((r) => r.json());
  const items = data.items || [];
  if (!items.length) return 0;

  const palette = ['#f8f7f4', '#f1efe9', '#f4f2ed'].map((c) => Cesium.Color.fromCssColorString(c));
  const insts = [];

  for (let i = 0; i < items.length; i++) {
    const b = items[i];
    const ring = b.outline;
    if (!ring || ring.length < 3) continue;
    let topGround = -Infinity;
    let sx = 0;
    let sy = 0;
    const flat = [];
    for (const [lon, lat] of ring) {
      const h = terrain.sample(lon, lat);
      if (h > topGround) topGround = h;
      sx += lon;
      sy += lat;
      flat.push(lon, lat, h - 0.8);
    }
    // 顶部取最高地面 + 建筑高度，保证平屋顶不被坡地切穿
    const roof = topGround + Math.max(3.5, b.h || 12);
    insts.push(
      new Cesium.GeometryInstance({
        geometry: new Cesium.PolygonGeometry({
          polygonHierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArrayHeights(flat)),
          perPositionHeight: true,
          extrudedHeight: roof,
          vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(palette[(b.tone ?? i) % palette.length]),
        },
      }),
    );
  }

  viewer.scene.primitives.add(
    new Cesium.Primitive({
      geometryInstances: insts,
      appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true }),
      asynchronous: true,
    }),
  );

  return insts.length;
}
