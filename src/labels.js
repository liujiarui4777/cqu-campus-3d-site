/* 主要建筑名称标签：小字号、半透明底，近距离才显示，不干扰整体观感 */

export function addBuildingLabels(viewer, data, terrain) {
  const Cesium = window.Cesium;
  const MAJOR = [
    '主教学楼',
    '第一教学楼',
    '第二教学楼',
    '第三教学楼',
    '第五教学楼',
    '第六教学楼',
    '理科教学楼',
    '理工馆',
    '逸夫图书馆',
    '博雅书院',
    '人文社会科学研究院',
    '理学院',
    '工学院',
    '学生一食堂',
    '学生二食堂',
    '学生三食堂',
    '重庆大学A区体育馆',
    '学生十宿舍',
    '学生四宿舍',
  ];

  let count = 0;
  for (const b of data.buildings || []) {
    const name = b.name || '';
    if (!name) continue;
    const isMajor = b.landmark || MAJOR.includes(name);
    if (!isMajor) continue;
    const h0 = terrain.sample(b.center[0], b.center[1]);
    viewer.entities.add({
      id: 'label:' + b.id,
      position: Cesium.Cartesian3.fromDegrees(b.center[0], b.center[1], h0 + b.height + 6),
      label: {
        text: name.replace('重庆大学', ''),
        font: '11px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#2c3a46'),
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.62),
        backgroundPadding: new Cesium.Cartesian2(5, 2),
        pixelOffset: new Cesium.Cartesian2(0, -4),
        scale: 1,
        // 只在 1.6 km 内显示，避免全景时满屏小字
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1600),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        translucencyByDistance: new Cesium.NearFarScalar(700, 1.0, 1600, 0.15),
      },
      properties: { kind: 'building', data: b },
    });
    count++;
  }
  return count;
}
