/* 校门：A 区依据《调研-A区道路资料》的 6 个校门 + 江边电梯口；虎溪按边界出入口布置 */

const MLAT = 110540;
const mLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

const GATES = [
  { name: '大校门', lon: 106.4600, lat: 29.5695, rot: 0, stone: true },
  { name: '南门', lon: 106.4643, lat: 29.5624, rot: 90 },
  { name: '南二门', lon: 106.4667, lat: 29.5626, rot: 90 },
  { name: '南一门', lon: 106.4617, lat: 29.5629, rot: 90 },
  { name: '东南门', lon: 106.4702, lat: 29.5639, rot: 55 },
  { name: '高知楼门', lon: 106.4677, lat: 29.5628, rot: 90 },
  { name: '西北门', lon: 106.4609, lat: 29.5716, rot: 270 },
];

// 虎溪校区：北门在大学城南路（校区正门），东门接大学城中路
const GATES_HX = [
  { name: '北门', lon: 106.29480, lat: 29.60092, rot: 0, stone: true },
  { name: '东门', lon: 106.30305, lat: 29.59760, rot: 90 },
];

export function addGates(viewer, data, terrain) {
  const Cesium = window.Cesium;
  const stone = Cesium.Color.fromCssColorString('#cfc8ba');
  const steel = Cesium.Color.fromCssColorString('#8d9298');
  const isHx = (data.buildings || []).some((b) => b.campus === 'HX');
  const list = isHx ? GATES_HX : GATES;

  for (const g of list) {
    const h0 = terrain.sample(g.lon, g.lat);
    const a = (g.rot * Math.PI) / 180;
    // 门宽方向（沿门洞）
    const tx = Math.cos(a);
    const ty = Math.sin(a);
    const half = 3.2;
    const colW = g.stone ? 0.62 : 0.35;
    const colH = g.stone ? 6.4 : 4.6;

    for (const sign of [-1, 1]) {
      const lon = g.lon + (tx * half * sign) / mLon(g.lat);
      const lat = g.lat + (ty * half * sign) / MLAT;
      viewer.entities.add({
        id: `gate:${g.name}:${sign}`,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, h0 + colH / 2),
        box: {
          dimensions: new Cesium.Cartesian3(colW * 2, colW * 2, colH),
          material: g.stone ? stone : steel,
        },
        properties: { kind: 'gate', name: g.name, data: { name: g.name, desc: '校区校门' } },
      });
    }

    // 横梁 / 门楣
    viewer.entities.add({
      id: `gate:${g.name}:beam`,
      position: Cesium.Cartesian3.fromDegrees(g.lon, g.lat, h0 + colH - 0.35),
      box: {
        dimensions: new Cesium.Cartesian3(
          (half * 2 + 1.0) * Math.max(0.4, Math.abs(tx)),
          0.5,
          (half * 2 + 1.0) * Math.max(0.4, Math.abs(ty)),
        ),
        material: g.stone ? stone : steel,
      },
      properties: { kind: 'gate', name: g.name },
    });
  }

  return list.length;
}
