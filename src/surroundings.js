/* 非重庆大学建筑：15 km 范围内的白色体块（白模），按高德城市白模观感。
 *
 * 用 OSM 建筑 bbox 做盒式白模（稳定、单 draw call）：
 * - 主体：近白侧墙；顶盖：另加一层更白的薄板，无光照也能看出体量；
 * - 底部按中心地形下沉 1.2 m，避免坡地悬空。
 */
export async function addSurroundings(viewer, base, terrain) {
  const Cesium = window.Cesium;
  const data = await fetch(`${base}data/surroundings.json`).then((r) => r.json());
  const items = data.items || [];
  if (!items.length) return 0;

  const vertexFormat = Cesium.PerInstanceColorAppearance.VERTEX_FORMAT;
  const boxGeo = new Cesium.BoxGeometry({
    minimum: new Cesium.Cartesian3(-0.5, -0.5, -0.5),
    maximum: new Cesium.Cartesian3(0.5, 0.5, 0.5),
    vertexFormat,
  });

  const bodyColor = Cesium.Color.fromCssColorString('#cfccc4');
  const roofColor = Cesium.Color.fromCssColorString('#eceae4');
  const bodies = [];
  const roofs = [];

  for (let i = 0; i < items.length; i++) {
    const b = items[i];
    if (!b.lon || !b.lat) continue;
    const h = Math.max(6, b.h || 12) * 1.15;
    const w = Math.max(5, b.w || 10);
    const d = Math.max(5, b.d || 10);
    // 取 bbox 轮廓上最高的地形作为基面，避免坡地上白模被地形“切掉”成白板
    let h0 = -Infinity;
    for (const [lon, lat] of b.outline || []) {
      const g = terrain.sample(lon, lat);
      if (g > h0) h0 = g;
    }
    if (!isFinite(h0)) h0 = terrain.sample(b.lon, b.lat);
    h0 -= 1.0;

    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(
      Cesium.Cartesian3.fromDegrees(b.lon, b.lat, h0 + h / 2 - 3.0),
    );
    const scale = Cesium.Matrix4.fromScale(new Cesium.Cartesian3(w, d, h + 2.6));
    const m = Cesium.Matrix4.multiply(enu, scale, new Cesium.Matrix4());
    bodies.push(
      new Cesium.GeometryInstance({
        geometry: boxGeo,
        modelMatrix: m,
        attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(bodyColor) },
      }),
    );

    // 顶盖：比主体略大 0.4 m，厚 1.2 m，视觉上形成亮顶
    const roofEnu = Cesium.Transforms.eastNorthUpToFixedFrame(
      Cesium.Cartesian3.fromDegrees(b.lon, b.lat, h0 + h + 0.35),
    );
    const roofScale = Cesium.Matrix4.fromScale(new Cesium.Cartesian3(w + 0.15, d + 0.15, 0.9));
    roofs.push(
      new Cesium.GeometryInstance({
        geometry: boxGeo,
        modelMatrix: Cesium.Matrix4.multiply(roofEnu, roofScale, new Cesium.Matrix4()),
        attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(roofColor) },
      }),
    );
  }

  const appearance = new Cesium.PerInstanceColorAppearance({ translucent: false, closed: false });
  viewer.scene.primitives.add(
    new Cesium.Primitive({ geometryInstances: bodies, appearance, asynchronous: true }),
  );
  viewer.scene.primitives.add(
    new Cesium.Primitive({ geometryInstances: roofs, appearance, asynchronous: true }),
  );

  return bodies.length;
}




