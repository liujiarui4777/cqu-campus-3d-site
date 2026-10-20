# 重庆大学 · 三维校园（A 区 + B 区 + C 区）

> 在线地址：**https://liujiarui4777.github.io/cqu-campus-3d-site/**
>
> 用 CesiumJS 做的重庆大学沙坪坝校区三维地图：A 区（沙坪坝正街 174 号）、B 区（原重庆建筑大学）、C 区（原重庆建筑高等专科学校），15 km 范围真实地形 + 城市白模，地标导览、搜索、点击信息卡、昼夜切换、步行导航、今日课程。

---

## 功能

| 功能 | 说明 |
|---|---|
| **三个校区** | 191 栋建筑（A 108 / B 65 / C 18）、298 条道路、32 处场地 |
| **15 km 城市白模** | 3,896 栋非重庆大学建筑，按 OSM 真实轮廓挤出成白色体块（高德地图式白模），A/B/C 区内已排除 |
| **真实地形** | 三级 DEM：A/B/C 区 3.4 km（约 1.7 m/px）+ 15 km 中网格（约 9.8 m/px）+ 20 km 外围（约 20 m/px） |
| **三层底图** | 15 km 城市底图（道路/水系/绿地/建设用地）+ A/B/C 区细节底图 + 20 km 外围底图，边界自动衔接 |
| **地标导览** | 底部一键飞行：主教 / 钟塔 / 大校门 / 民主湖 / 风雨操场 / 思群广场 / 老图书馆 / 寅初亭 / B区图书馆 / B区运动场 / 建筑城规学院 / 科学会堂 / C区校友会 / C区陶艺坊 / C区宿舍 |
| **搜索定位** | 顶部搜索框，输入楼名直接飞到并弹卡（含 B、C 区建筑） |
| **建筑信息卡** | 名称、功能、层数、高度、基底面积、使用单位、开放时间、历史沿革 |
| **昼夜切换** | 日 / 昏 / 夜三档，夜间整屏压暗 + 窗户发光 + 路灯点亮 |
| **步行导航** | 左上「步行导航」→ 点起点 → 点终点，按 OSM 路网算最短路径并画线（A ⇄ B ⇄ C 互通） |
| **今日课程** | 粘贴课表 → 自动解析 → 今天有课的楼在地图上标出标签与光圈 |

## 操作

- 左键拖拽旋转，滚轮缩放，右键平移
- 点击建筑 → 信息卡 + 相机飞行
- `Esc` 或「全景」按钮 → 回到全景
- 拖动底部地标条可横向滚动
- 「图层」→ 卫星影像可切换 A 区真实影像（仅 A 区范围）

## 技术栈

- **CesiumJS 1.146**（UMD，无构建工具、无 ion token）
- 原生 ES Modules + 原生 DOM，零框架
- 地形：`CustomHeightmapTerrainProvider`（本地 DEM，非在线服务，三级混合）
- 底图：自绘（DEM 晕渲 + OSM 水域/绿地/道路/白模烘焙）+ 自定义 `ImageryProvider`
- 静态服务器：`tools/serve.mjs`（Node 原生 http）

## 数据来源与署名

| 数据 | 来源 | 许可 |
|---|---|---|
| 建筑轮廓 / 道路 / 水域 / 绿地 / 球场 | © OpenStreetMap 贡献者 | ODbL 1.0 |
| 地形高程 | AWS Terrain Tiles（Mapzen terrarium） | 公开数据集 |
| B/C 区名称与位置 | © OpenStreetMap 贡献者 | ODbL 1.0 |
| A 区建筑层数 / 高度 / 形制 / 历史 | 重庆市文旅委文物资料、中国土木工程学会詹天佑奖工程页、重庆大学官方发布 | 公开资料 |
| 道路资料 | 沙坪坝区政府道路命名批复、重庆大学官方发布、百度百科 | 公开资料 |

考据文档：`../docs/调研-A区建筑资料.md`、`../docs/调研-A区道路资料.md`

## 本地开发

```bash
node tools/serve.mjs          # http://127.0.0.1:5181/
```

数据管线（已生成，无需重跑）：

```bash
# 建筑/道路/场地（A/B/C 三区）
node tools/build-scene.mjs

# 15 km 白模
node tools/build-surroundings-15km.mjs

# 15 km 底图矢量 + 底图
node tools/build-basemap-vectors.mjs
python tools/gen_basemap2.py --bin terrain     --out basemap        --size 4096 --vectors basemap-vectors.json
python tools/gen_basemap2.py --bin terrain_mid --out basemap_mid    --size 4096 --vectors basemap-vectors.json
python tools/gen_basemap2.py --bin terrain_coarse --out basemap_coarse --size 2048 --vectors basemap-vectors.json

# 地形（三级）
python tools/dem_build2.py --z 15 --west 106.4445 --south 29.5500 --east 106.4790 --north 29.5805 --out terrain --size 2048
python tools/dem_build2.py --z 14 --west 106.3840 --south 29.5017 --east 106.5390 --north 29.6373 --out terrain_mid --size 1536
python tools/dem_build2.py --z 13 --west 106.3550 --south 29.4700 --east 106.5680 --north 29.6690 --out terrain_coarse --size 1024
python tools/gzip_terrain.py
```

原始数据下载（Overpass / ArcGIS）：

```bash
node tools/fetch-bqu.mjs              # B 区边界/建筑/道路
node tools/fetch-cqu-area.mjs         # C 区边界/建筑/道路/场地
node tools/fetch-15km.mjs             # 15 km 道路/水系/绿地
node tools/fetch-10km-buildings.mjs   # 早期 10 km 建筑（15 km 已覆盖）
node tools/fetch-esri.mjs             # A 区卫星影像
```

## 部署

- 源码仓库：https://github.com/liujiarui4777/cqu-campus-3d
- 部署仓库（公开，GitHub Pages）：https://github.com/liujiarui4777/cqu-campus-3d-site
- 发布：把 `index.html`、`src/`、`data/` 同步到 `../site/` 后 `node tools/push-site.mjs`

## 性能

- 首屏加载约 6–8 s（地形 gzip 约 7 MB + 底图约 5 MB + 白模 1 MB）
- 帧率 **约 45 FPS**（Intel Iris Xe 集显，2 km 全景、3,896 栋白模）
- 关键决策：道路全部烘焙进底图；白模用一个实例化 `Primitive`（单 draw call）；校园建筑用 Entity 多边形

## 已知限制

- 建筑是"体块 + 窗带 + 窗间柱"的几何近似，不是贴图级的写实模型
- B/C 区建筑层数多为类型推断（OSM 无层数标签），页面标注为「约」
- C 区的 OSM 行政边界只覆盖西半部、与实测楼群错位，地图上 C 区边界用楼群凸包外扩 85 m 作示意
- 城市白模的覆盖密度取决于 OSM 建筑标注密度（重庆主城 OSM 建筑偏稀疏）
- 卫星影像只覆盖 A 区（旧影像范围），切换后 A 区以外仍显示自绘底图
- 校门位置是按方位推测的，未逐一实测

## 版权

© 2026 保留所有权利。详见 `LICENSE`。
