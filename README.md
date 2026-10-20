# 重庆大学 · 三维校园（A 区）

> 在线地址：**https://liujiarui4777.github.io/cqu-campus-3d-site/**
>
> 用 CesiumJS 做的重庆大学 A 区（沙坪坝正街 174 号）三维校园地图：真实地形、按考据还原的 108 栋建筑、地标导览、搜索、点击信息卡、昼夜切换、步行导航、今日课程。

---

## 功能

| 功能 | 说明 |
|---|---|
| **三维校园** | 108 栋建筑、150 条道路、2350 棵树、986 根路灯、7 个校门、13 片球场 |
| **真实地形** | AWS Terrain Tiles（3 km 细网格 2 m/px + 13 km 粗网格 13 m/px），不是平地 |
| **地标导览** | 底部 8 个地标一键飞行：主教 / 钟塔 / 大校门 / 民主湖 / 风雨操场 / 思群广场 / 老图书馆 / 寅初亭 |
| **搜索定位** | 顶部搜索框，输入楼名直接飞到并弹卡 |
| **建筑信息卡** | 名称、功能、层数、高度、基底面积、使用单位、开放时间、历史沿革 |
| **昼夜切换** | 日 / 昏 / 夜三档，夜间整屏压暗 + 窗户发光 + 路灯点亮 |
| **步行导航** | 左上「步行导航」→ 点起点 → 点终点，按 OSM 路网算最短路径并画线 |
| **今日课程** | 粘贴课表 → 自动解析 → 今天有课的楼在地图上标出标签与光圈 |

## 操作

- 左键拖拽旋转，滚轮缩放，右键平移
- 点击建筑 → 信息卡 + 相机飞行
- `Esc` 或「全景」按钮 → 回到全景
- 拖动底部地标条可横向滚动

## 技术栈

- **CesiumJS 1.146**（UMD，无构建工具、无 ion token）
- 原生 ES Modules + 原生 DOM，零框架
- 地形：`CustomHeightmapTerrainProvider`（本地 DEM，非在线服务）
- 底图：自绘（DEM 晕渲 + OSM 水域/绿地/道路烘焙）+ 自定义 `ImageryProvider`
- 静态服务器：`tools/serve.mjs`（Node 原生 http）

## 数据来源与署名

| 数据 | 来源 | 许可 |
|---|---|---|
| 建筑轮廓 / 道路 / 水域 / 球场 | © OpenStreetMap 贡献者 | ODbL 1.0 |
| 地形高程 | AWS Terrain Tiles（Mapzen terrarium） | 公开数据集 |
| 建筑层数 / 高度 / 形制 / 历史 | 重庆市文旅委文物资料、中国土木工程学会詹天佑奖工程页、重庆大学官方发布 | 公开资料 |
| 道路资料 | 沙坪坝区政府道路命名批复、重庆大学官方发布、百度百科 | 公开资料 |

考据文档：`../docs/调研-A区建筑资料.md`、`../docs/调研-A区道路资料.md`

## 本地开发

```bash
node tools/serve.mjs          # http://127.0.0.1:5181/
```

数据管线（已生成，无需重跑）：

```bash
node tools/build-scene.mjs    # OSM → data/scene.json
python tools/dem_build2.py --z 15 --west 106.451 --south 29.5545 --east 106.479 --north 29.5805 --out terrain --size 2048
python tools/dem_build2.py --z 14 --west 106.395 --south 29.4975 --east 106.5345 --north 29.6365 --out terrain_coarse --size 1024
python tools/gen_basemap2.py --bin terrain --out basemap --size 2048
python tools/gen_basemap2.py --bin terrain_coarse --out basemap_coarse --size 1024
python tools/gzip_terrain.py   # 地形压缩 10MB → 3.5MB
```

## 部署

- 源码仓库（私有/公开）：https://github.com/liujiarui4777/cqu-campus-3d
- 部署仓库（公开，GitHub Pages）：https://github.com/liujiarui4777/cqu-campus-3d-site
- 发布：`node tools/push-site.mjs` 推送 `../site/` 目录，Pages 自动构建

## 性能

- 首屏加载 **4.2 s**（地形 gzip + 底图烘焙）
- 帧率 **52–61 FPS**（Intel Iris Xe 集显，1500 m 全景视角）
- 关键决策：**道路全部烘焙进底图**，3D 中不生成贴地多边形（Cesium 的 `GroundPrimitive` 每帧做模板测试，是最大瓶颈）

## 已知限制

- 建筑是"体块 + 窗带 + 窗间柱"的几何近似，不是贴图级的写实模型；要人眼尺度的窗框/玻璃反光，需要换成 glTF + UV 贴图管线
- 校门位置是按方位推测的，未逐一实测
- 建筑高度在缺公开数据时按层高推断，页面标注为推测
- 道路属性（车道数/宽度）部分依据规范推断

## 版权

© 2026 保留所有权利。详见 `LICENSE`。
