/* 校园周边建筑：极简方块，仅作为城市背景，不参与拾取 */
export async function addSurroundings(viewer, base, terrain) {
  const Cesium = window.Cesium;
  const data = await fetch(`${base}data/surroundings.json`).then((r) => r.json());
  if (!data.items || !data.items.length) return 0;

  const boxGeo = new Cesium.BoxGeometry({
    minimum: new Cesium.Cartesian3(-0.5, -0.5, -0.5),
    maximum: new Cesium.Cartesian3(0.5, 0.5, 0.5),
    vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
  });

  const insts = [];
  for (const b of data.items) {
    const h0 = terrain.sample(b.lon, b.lat);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(
      Cesium.Cartesian3.fromDegrees(b.lon, b.lat, h0 + b.h / 2),
    );
    const scale = Cesium.Matrix4.fromScale(new Cesium.Cartesian3(b.w, b.d, b.h));
    const m = Cesium.Matrix4.multiply(enu, scale, new Cesium.Matrix4());
    insts.push(
      new Cesium.GeometryInstance({
        geometry: boxGeo,
        modelMatrix: m,
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(
            Cesium.Color.fromCssColorString(b.color || '#cfd3d7'),
          ),
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
