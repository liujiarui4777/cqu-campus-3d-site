/* 体育设施：球场围网、篮架、看台灯柱 */

const MLAT = 110540;
const mLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

export function addSports(viewer, data, terrain) {
  const Cesium = window.Cesium;
  const posts = Cesium.Color.fromCssColorString('#6f7479');
  const net = Cesium.Color.fromCssColorString('#9aa3ab').withAlpha(0.5);
  const board = Cesium.Color.fromCssColorString('#e8e6e0');
  let count = 0;

  for (const a of data.areas || []) {
    if (a.kind !== 'pitch') continue;
    const sport = a.sport || '';
    if (!['basketball', 'tennis', 'volleyball', 'badminton'].includes(sport)) continue;
    if (!a.outline || a.outline.length < 3) continue;

    // 1) 围网：沿场地边界一圈 3.2m 高的半透明网（用 wall）
    const pos = [];
    for (const [lon, lat] of a.outline) {
      pos.push(lon, lat, terrain.sample(lon, lat));
    }
    const heights = [];
    for (const [lon, lat] of a.outline) {
      heights.push(terrain.sample(lon, lat) + 3.2);
    }
    const flatHeights = [];
    for (let i = 0; i < a.outline.length; i++) flatHeights.push(heights[i]);
    viewer.entities.add({
      id: 'fence:' + a.id,
      wall: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(pos),
        maximumHeights: flatHeights,
        minimumHeights: a.outline.map(([lon, lat]) => terrain.sample(lon, lat)),
        material: net,
        outline: false,
      },
      properties: { kind: 'sport' },
    });

    // 2) 四角立柱
    for (const [lon, lat] of a.outline) {
      const h = terrain.sample(lon, lat);
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, h + 1.6),
        cylinder: { length: 3.2, topRadius: 0.09, bottomRadius: 0.12, material: posts },
        properties: { kind: 'sport' },
      });
    }

    // 3) 篮架（篮球场）：长轴两端各一组
    if (sport === 'basketball') {
      let minLon = Infinity;
      let maxLon = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;
      for (const [lo, la] of a.outline) {
        minLon = Math.min(minLon, lo);
        maxLon = Math.max(maxLon, lo);
        minLat = Math.min(minLat, la);
        maxLat = Math.max(maxLat, la);
      }
      const lonSpan = (maxLon - minLon) * mLon(a.center[1]);
      const latSpan = (maxLat - minLat) * MLAT;
      const alongLon = lonSpan > latSpan;
      const ends = alongLon
        ? [
            [minLon + (maxLon - minLon) * 0.12, a.center[1]],
            [minLon + (maxLon - minLon) * 0.88, a.center[1]],
          ]
        : [
            [a.center[0], minLat + (maxLat - minLat) * 0.12],
            [a.center[0], minLat + (maxLat - minLat) * 0.88],
          ];
      for (const [lon, lat] of ends) {
        const h = terrain.sample(lon, lat);
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat, h + 1.7),
          cylinder: { length: 3.4, topRadius: 0.08, bottomRadius: 0.1, material: posts },
          properties: { kind: 'sport' },
        });
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat, h + 3.1),
          box: { dimensions: new Cesium.Cartesian3(1.8, 0.1, 1.05), material: board },
          properties: { kind: 'sport' },
        });
      }
    }
    count++;
  }

  return count;
}
