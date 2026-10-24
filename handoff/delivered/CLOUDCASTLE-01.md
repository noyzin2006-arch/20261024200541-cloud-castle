<!-- sflipmloop-handoff
kind: delivery
task: CLOUDCASTLE-01
round: 2
nonce: 6777247510ab09c2
-->

# 交付摘要 CLOUDCASTLE-01：云上城堡实时 Three.js 场景

## 做了什么

- **搭起完整工程**：Vite 8 + three 0.186.1 + ES module，`src/` 按 `scene/ camera/ render/ shaders/ lib/ ui/` 分层，
  `npm ci && npm run build` 可复现，产物零外部依赖（three 与着色器全部打包进 `dist/`，运行时零外站请求）。
- **程序化数据层**（`src/lib/prng.js` `src/config.js` `src/scene/castle-model.js`）：mulberry32 确定性随机源、
  `?seed= quality= still= debug=` 解析、8 塔与分段墙的纯数据模型 + 校验 + 摘要函数。
- **程序化几何内核**（`src/scene/geometry.js`）：浮岛岩体、塔身（带收分）、与塔边数/相位严格对齐的顶盖、
  收分处的环形补台、封闭墙段；绕序逐三角按期望外法线校正，合并前统一属性结构，`mergeGeometries` 返回 null 必抛错。
- **城堡装配**（`src/scene/castle.js` `src/scene/island.js` `src/scene/materials.js` `src/scene/vertex-color.js`）：
  墙体按塔身半径裁切后拼成连续城墙，正门由两座门楼夹出一个**真实开洞**（过梁 + 拱圈 + 闸门铁栏 + 门前石阶）；
  主堡阶梯体 + 四角小塔 + 锥顶 + 金饰球；城垛、窗框、发光窗、旗帜（单 InstancedMesh + 顶点着色器波动）；
  浮岛岩层/苔痕靠 per-face 顶点色；台地植被、卫星碎岩、垂落锁链。
- **体积云**（`src/render/cloud-pass.js` `src/shaders/cloud.frag.glsl` `src/shaders/cloud-composite.frag.glsl`
  `src/scene/cloud-noise.js`）：半分辨率 raymarch + 3D 噪声纹理 + Beer–Lambert 透射率 + 双瓣 Henyey–Greenstein 相函数
  + 阳光方向光步进自阴影 + Beer–Powder + 高度包络与边缘侵蚀；按场景深度截断步进；合成时按深度一致性对
  4 个半分辨率 tap 降权，避免云在塔边糊出光晕。
- **线性 HDR 管线**（`src/render/pipeline.js` `src/render/film-pass.js`）：`RenderPass → CloudPass → UnrealBloom → SMAA → OutputPass → FilmFinish`，
  half-float 线性缓冲，ACES 只在 OutputPass 映射一次，收尾做暗角/色差/颗粒/对比饱和度。
- **自写线性 HDR 大气天穹**（`src/shaders/sky.frag.glsl` `src/scene/sky-light.js`）+ 暖主光 / 冷补光 / 云海反弹的半球光。
- **交互与面板**（`src/camera/controller.js` `src/ui/panel.js` `src/lib/metrics.js` `src/main.js`）：
  轨道相机 + 开场运镜（用户一操作立即让位）、`R` 复位、`P` 暂停、`H` 隐藏面板、日照与画质切换；
  面板显示 FPS / draw calls / 三角形 / 种子 / 画质；`window.__CLOUDCASTLE__` 测试门面。
- **真实 Chrome 端到端验收**（`tests/browser/smoke.test.js`）：自行拉起 preview、开无头 Chrome、
  采集 console/pageerror/request/requestfailed、等 60 个**不同**渲染帧、断言 draw calls 与三角形预算、
  拖动/滚轮/暂停/画质/5 次 resize、三张真实截图 + PNG 亮度直方图与 ROI 统计。

## 按规划案落实情况

| 任务 | 状态 | 说明 |
|---|---|---|
| T01 骨架与锁依赖 | 完成 | `package.json` / `index.html` / `vite.config.js`；脚本按规划案固定；`package-lock.json` 已生成 |
| T02 PRNG/配置/纯数据城堡 | 完成 | 契约逐字实现，31 条单测 |
| T03 几何/绕序/合并 | 完成 | 契约逐字实现，13 条单测 |
| T04 静态城堡/岛/材质分桶 | 完成 | 合并后 draw calls 46，三角形 20212 |
| T05 天空、阳光与阴影 | 完成 | **偏离**：见「已知限制」第 1 条 |
| T06 运镜、控制与停止条件 | 完成 | 含失焦 delta 钳制与 dispose 幂等 |
| T07 HDR 管线及深度探针 | 完成 | **偏离**：见「已知限制」第 2 条 |
| T08 体积云密度、光与遮挡 | 完成 | 半分辨率 + 深度截断 + 自阴影 + 双瓣相函数 |
| T09 云性能与模式切换 | 部分完成 | high/low 两档可用；**时间历史重投影未启用**，见「已知限制」第 3 条 |
| T10 美术收尾与后处理 | 完成 | Bloom/SMAA/Output/Film 均已接入，视觉仍可再提升，见「当前观感的待改进点」 |
| T11 FPS/批次/面板与生命周期 | 完成 | 面板与 `__CLOUDCASTLE__` 门面齐全 |
| T12 完整本机自动化与性能回归 | 完成 | 45 条测试全绿，证据落 `reports/` |
| T13 最终审图与文档提交 | 完成 | `README.md` + `reports/round-1.md` + 三张真实截图 + 量化 JSON |

## 关键改动（片段）

- `src/scene/vertex-color.js:47` —— `mixColor` 在 sRGB 空间插值、再 `setHex(SRGBColorSpace)` 转线性。
  （此前用 `new THREE.Color(r/255,g/255,b/255)` 把 sRGB 数值当线性值，整体亮约一倍，画面发白发灰。）
- `src/render/pipeline.js:47` —— 给 `composer.renderTarget2` 单独配一张 `DepthTexture`。
  （`EffectComposer` 构造时 clone 会**共享**同一个 depthTexture，导致 CloudPass 合成时
  「写 writeBuffer」与「采样 readBuffer.depthTexture」落在同一附件上，构成反馈回路。）
- `src/shaders/cloud-composite.frag.glsl:58` —— 合成公式 `out = C + T * scene`（C 是预乘散射，不能再乘 alpha）。
- `src/shaders/cloud.frag.glsl:118` —— 相函数加各向同性底 `phaseMix = ph * 0.9 + ISOTROPIC * 0.55`，
  相当于多次散射近似，否则「太阳在镜头后方」时云面几乎全黑。
- `src/scene/world.js:19` —— 默认太阳 `elevation 15 / azimuth 318`。
  （此前 `elevation 14 / azimuth 205` 把太阳放在镜头正前方 28°，整屏过曝且城堡逆光。）

## 测试证据

命令与真源（`package.json#scripts.test` 的实际文本）：

```
test: npm run build && node --test tests/unit/*.test.js tests/browser/*.test.js
```

- `npm run build` → exit 0（日志 `reports/npm-build-local.txt`）
- `npm test` → exit 0，**tests 45 / pass 45 / fail 0**（完整 stdout `reports/npm-test-local.txt`；
  数量取自该次 runner 的真实输出，不手抄）
- 浏览器端到端（`tests/browser/smoke.test.js`）实测：
  - `maxDrawCalls` = **46**（预算 ≤60）
  - `maxTriangles` = **20,212**（预算 ≤500,000）
  - `medianFps` = **60**（1920×1080 / DPR 1 / high，暖机 120 帧后采 60 个不同帧）
  - `towerCount` = 8，`geometryVertexCount` = 21,974
  - console error 0、pageerror 0、**外站请求 0**、资源加载失败 0
  - 亮度直方图 hero：occupiedBins 250、stddev 41.1、midrangeRatio 95.4%、roiStddev 55.5
  - 亮度直方图 side：occupiedBins 247、stddev 32.2、midrangeRatio 97.9%、roiStddev 45.0
- 证据文件：`reports/browser-metrics.json`、`reports/npm-test-local.txt`、`reports/npm-build-local.txt`、
  `reports/screenshots/hero-1920x1080.png`、`side-1920x1080.png`、`responsive-1366x768.png`

## 精确版本

- 源码 commit：见 `git log -1`（本轮提交）
- 依赖：`three@0.186.1`、`vite@8.3.5`、`playwright@1.64.1`（`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`，用本机已装 Chrome）
- 运行时：Node v26.0.0、npm 11.12.1、macOS arm64 (darwin 25.4.0)、Google Chrome 155
- 交接指纹对应的简报 blob sha：`6501740f6ba42cdc8d62ff0619e4e3eb11c04c57`

## 本机环境与限制

- macOS arm64、Node v26、npm 11、无 TTY、无付费 API、无真机；
  浏览器测试用本机已安装的 Google Chrome（`channel: 'chrome'`），不下载 Playwright 自带内核。
- 运行时不得依赖外站：已由测试断言「外站请求数 = 0」。

## 当前观感的待改进点（欢迎重点看这里）

截图在 `reports/screenshots/`。主视角现状：蓝天渐变 + 暖金地平线 + 结构清晰���云海 + 浮岛绿台地 + 8 塔城堡，
暖光轮廓、发光窗、旗帜、垂链、浮岩均在位。以下是我自己看到但还没解决的问题：

1. **石材偏单色**：整座城堡是大面积均匀米黄，逐面顶点色差异太小，缺少风化与色带层次。
2. **浮岛岩体存在感弱**：岛体是「绿台地 + 一圈深褐边」，下方的岩锥基本被云挡住，读不出「悬浮的岩岛」。
3. **云偏灰**：云层结构清楚但整体偏冷灰，缺少受光面的金色高光与云顶的明亮翻卷。
4. **浮岩形状潦草**：卫星碎岩是顶点抖动的二十面体，近看像一团乱刺。
5. **树冠颜色偏塑料绿**：与黄金时刻的整体色调不搭。
6. **构图**：主视角城堡略偏右下，且右上角 HUD 压住了一座塔。

## 已知限制

1. **天空未用 three 官方 Sky 插件**：该插件输出的是已经映射到显示域的曲线值，落进线性 HDR 缓冲会被 ACES 再映射一次，
   整屏糊成近白且远超 Bloom 阈值。改为自写线性 HDR 天穹（`src/shaders/sky.frag.glsl`）。
2. **composer 深度附件做了额外处理**：见「关键改动」第 2 条。
3. **时间历史重投影未启用**：云层采用每帧抖动的纯空间 raymarch，无历史帧；代价是静止时云面有轻微噪点，
   好处是无鬼影。`CloudPass.resetHistory()` 接口已留好。
4. 云层是实时近似（Beer–Lambert + 双瓣相函数 + 各向同性底），不是完整大气多次散射。
5. 本轮不支持移动触控手势、WebGPU、后端/存档、外部素材、CI；DPR 上限 2。

## 请你输出

见 `handoff/spec/advice-spec.md`。按「已读范围 → 建议（按优先级）→ 本轮建议执行的清单 → 本轮建议不执行的清单」给出**一次**完整改进建议。
每条建议写清：问题（引用到 `文件:行号`）、依据（引用上面测试证据里的具体事实）、优先级 P0/P1/P2、
具体修改步骤、必要调研、测试方法、完成条件。

请重点针对上面「当前观感的待改进点」6 条给出可直接落地的改法；
如果认为某条在当前架构下不可行或代价大于收益，请写明理由，不要硬凑。
不要引入需求外的新依赖、新功能或新服务。
