/* 场景配置：一个站点跑两套校区（沙坪坝 A/B/C 区、虎溪校区）
 *
 * 每个场景的差别只有：数据目录、机位、标题、统计口径、天气坐标。
 * 其余渲染逻辑（build / trees / labels / panels / ui）完全共用。
 *
 * 机位数值的来源：相机放在区域正南、按俯角把整个区域压进画面 80% 以内，
 * 由 worldToWindowCoordinates 反推；改机位请用同样的方法校验，别凭手感。
 */

export const SCENES = {
  abc: {
    id: 'abc',
    query: '',
    dir: '', // 数据在 data/ 根目录
    title: '重庆大学 · 三维校园',
    subtitle: 'A / B / C 区 · 3.4 km',
    bootText: '正在生成 A / B / C 区校园…',
    searchHint: '搜索建筑：主教 / B区图书馆 / C区校友会…',
    center: [106.4615, 29.5695],
    weather: { lon: 106.465, lat: 29.567 },
    views: [
      { key: 'all', label: '全景', lon: 106.4585, lat: 29.5520, h: 1950, heading: 4, pitch: -47 },
      { key: 'a', label: 'A 区', lon: 106.46377, lat: 29.55715, h: 2058, heading: 0, pitch: -60 },
      { key: 'b', label: 'B 区', lon: 106.45549, lat: 29.56445, h: 1242, heading: 0, pitch: -60 },
      { key: 'c', label: 'C 区', lon: 106.4523, lat: 29.56271, h: 675, heading: 0, pitch: -60 },
    ],
    // 统计文案：A / B / C 分校区计数
    stats(data) {
      const n = (c) => data.buildings.filter((b) => b.campus === c).length;
      return [
        `${data.buildings.length} 栋建筑（A ${n('A')} / B ${n('B')} / C ${n('C')}）`,
        `${data.roads.length} 条道路`,
        `${data.areas.length} 处场地`,
      ];
    },
  },

  hx: {
    id: 'hx',
    query: 'campus=hx',
    dir: 'hx/', // 数据在 data/hx/
    title: '重庆大学 · 虎溪校区',
    subtitle: '虎溪校区 · 大学城 · 3.0 km',
    bootText: '正在生成虎溪校区校园…',
    searchHint: '搜索建筑：图书馆 / 第一食堂 / 兰园 / 工科大楼…',
    center: [106.2932, 29.5960],
    weather: { lon: 106.297, lat: 29.596 },
    views: [
      // 地形范围 2.79 km × 2.76 km（data/hx/terrain.json），相机高 1850 m、俯角 54° 时
      // 画面四边都落在地形内，不会露出沙盘边缘
      { key: 'all', label: '全景', lon: 106.2939, lat: 29.5840, h: 1850, heading: 0, pitch: -54 },
      // 北部生活区（松园/竹园/梅园/兰园 + 三个食堂）
      { key: 'life', label: '生活区', lon: 106.2945, lat: 29.5930, h: 980, heading: 0, pitch: -52 },
      // 东侧教学区（图书馆 / 学院楼群 / 实验楼 / 行政）
      { key: 'teach', label: '教学区', lon: 106.2966, lat: 29.5892, h: 900, heading: 0, pitch: -52 },
      // 东北运动区（400 m 跑道 / 体育馆 / 球场群）
      { key: 'sport', label: '运动区', lon: 106.2997, lat: 29.5960, h: 720, heading: 0, pitch: -54 },
    ],
    stats(data) {
      return [
        `${data.buildings.length} 栋建筑`,
        `${data.roads.length} 条道路`,
        `${data.areas.length} 处场地`,
      ];
    },
  },
};

export function currentScene() {
  const q = new URLSearchParams(location.search);
  const id = q.get('campus') === 'hx' ? 'hx' : 'abc';
  return SCENES[id];
}

export function sceneHref(id) {
  const s = SCENES[id];
  if (!s) return './';
  return s.query ? `./?${s.query}` : './';
}
