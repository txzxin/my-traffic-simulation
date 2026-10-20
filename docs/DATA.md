# 数据来源与许可

## OpenStreetMap

`public/data/*.json` 为通过 [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) 下载的 OpenStreetMap 核心城区快照。地图数据库版权属于 OpenStreetMap contributors，按 **Open Data Commons Open Database License（ODbL）1.0** 提供：

- 来源与署名：<https://www.openstreetmap.org/copyright>
- 完整许可：<https://opendatacommons.org/licenses/odbl/1-0/>
- 查询源与边界：`scripts/fetch-osm.mjs` 中的 `areas` 与 Overpass QL 查询。
- 每份快照的 `fetchedAt` 是下载时间，`timestamp` 是 Overpass 返回的 OSM 数据时间（UTC）。

继续发布这些数据或其衍生数据库时，请保留 OSM 署名和许可，并遵守 ODbL 规定。页面底部、数据说明弹窗与导出报告均保留数据来源。

## 采集范围

边界顺序为 `south, west, north, east`（纬度 / 经度）。

| 文件 | 查询边界 |
| --- | --- |
| `shanghai.json` | `31.217, 121.465, 31.257, 121.521` |
| `newyork.json` | `40.693, -74.030, 40.733, -73.974` |
| `london.json` | `51.488, -0.123, 51.528, -0.067` |
| `tokyo.json` | `35.667, 139.749, 35.697, 139.791` |

保留 motorway、trunk、primary、secondary、tertiary、各级连接匝道、residential、unclassified 与 living_street。建筑采集为 OSM `building` 多边形；信号灯采集为 `highway=traffic_signals` 节点。快速路、桥梁和高架通过 highway、bridge、layer 识别。

道路真实几何和节点被保留。车辆通行图在共享节点或信号节点处分段，根据 OSM 单行信息构建合法方向。建筑节点 ID 被删去，保留其真实轮廓坐标。坐标精简到小数点后 6 位；不会将生成网格作为真实路网。

## 可视化概化与模型数据

- 建筑物没有高度数据时使用确定性高度估计，最高体块按场景性能要求限制。每个城市最多绘制 6,500 栋建筑，抽样顺序由 OSM ID 决定。
- 著名地标为简化几何，位置采用城市配置中的地理坐标。它们不是精确建筑模型。
- 河流使用手工概化的地理中心线与示意宽度绘制，用于辅助理解城市结构；并非精确水岸测量成果。
- 高架和桥梁高度按 OSM `layer` 示意，桥面端部使用平滑坡道；不等同于工程测量高程。隧道目前以路网连线表达。
- 交通速度、流量、拥堵和排队均由本项目模型生成，未接入实时交通 API。模拟信号灯使用固定 70 秒周期，不代表对应城市实际信号配时。
- 「路网覆盖 km」为纳入模型路段的中心线长度总和，不是道路面积，也不按车道重复计长。

模型代码和所有指标定义见 `src/simulation.js` 与项目 README。
