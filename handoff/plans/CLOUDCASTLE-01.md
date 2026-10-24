kind: plan
task: CLOUDCASTLE-01
round: 1
nonce: 0de9bd32613fa5cb
brief_sha: 6501740f6ba42cdc8d62ff0619e4e3eb11c04c57

# CLOUDCASTLE-01 云上城堡 Three.js 精品场景：第 1 轮完整执行规划案

> 本文是供 Mac Agent 逐项执行的规划，不是实测报告。下文称“新建”的代码、脚本和报告路径都是待创建产物，不代表已经存在。项目仓库仅读取获准的两份材料；外部调研来源见第 3 节。

## 1. 需求、范围与非目标

**原始诉求**：「做个一个完整的实时 Three.js 场景，城堡漂浮在云层之上……目标就是做个世界最精致的、最好的、效果最炫的云上城堡。」

**验收理解**：不是显示一堆方块就算完成。首帧必须形成清楚的视觉叙事——完整岩岛悬于厚薄分层的云海上，主堡、城墙、至少六座高低不同的塔、尖顶和入口一眼可辨；黄金时刻的冷暖光、阴影、体积云自阴影/透射、少量 Bloom 提升质感但不能抹除结构；用户能绕城堡观察，持续实时绘制。不可检验的“世界第一”转化成下述可判定质量门槛。

**范围内**：从空项目搭建 ES module/Vite；确定性城堡与浮岛程序化几何、材质/石块细节；大气 Sky、阳光和阴影；半分辨率体积云以及保守低质量云方案；鼠标旋转/缩放、演示运镜、重置/暂停、质量切换、窗口 resize；EffectComposer HDR/Bloom/抗锯齿/单次 tone mapping；显示 FPS/draw calls/triangles 的面板；Node 单测、Chrome 自动截图与性能/网络/日志测试；README 和执行报告。

**明确不做**：后端/数据库/登录/存档、WebGPU、移动端触控手势、外部下载/购买 3D 模型或纹理/HDRI/字体、CDN、付费 API、多语言 i18n 系统、复杂流体天气/气象数据、音频/游戏系统、CI/GitHub Actions/PR 流程。可调太阳高度不是整套昼夜天气模拟。只做 WebGL2。

**硬性验收门槛**（任何一项失败不得判可交付）：
- A01 `npm ci && npm run build` 退出 0；`npm run preview -- --host 127.0.0.1 --port 4173 --strictPort` 能在本机起服务。
- A02 实际使用无头 Google Chrome 打开生产预览；至少产生一帧，WebGL2 context 非 null；console.error 与 pageerror 均为零；页面非黑屏，首屏资源正常加载。
- A03 提交 1920×1080 主视角、1920×1080 侧视角和 1366×768 截图；**人工逐张**判明有主堡、至少六座塔、完整连贯城墙与顶盖、岛有可见厚度、云位于下方并有明显体积/纵深、塔尖和窗/门可读；无倒面、漏缝、云穿过塔体、大片过曝、被 Bloom 糊成一片。只靠亮度自动检测不足以代替此项。
- A04 主图 PNG 定量防退化：灰度 256 桶中至少 24 个非空桶；亮度标准差 >25；亮度在 [20,235] 内的像素比例 >35%；画面中央占宽 50%×高 60% 的 ROI 亮度标准差 >18。阈值为本轮设计判据，不是外部行业标准；报告须存真实统计。
- A05 固定 seed 的两次 `{towerCount,towerHeights,geometryVertexCount}` 完全一致；不同 seed 至少一个可变字段不同；存在实际运行的 `node:test` 回归。
- A06 默认 high、1920×1080 **DPR=1**，暖机后连续采样 60 个不同的已完成渲染帧，`renderer.info.render.calls` 的最大值 ≤60，`renderer.info.render.triangles` 最大值 ≤500000；**包括阴影和所有 post passes**，不能只计城堡。面板可读 FPS/calls/triangles，同时报告 FPS 中位值（因 GPU 未知，暂不设 FPS 硬阈值）。
- A07 鼠标横/竖拖动改变视角、滚轮缩放但不穿入岛体、R 重置、P 暂停/恢复、high/low 切换；两种视口均无主体裁断和横向滚动；resize 连续 5 次无错误。
- A08 页面运行时零外站 HTTP/HTTPS 请求（localhost 生产预览和 data:/blob: 可用）；无 CDN/外部纹理/字体下载。自动化记录请求目的地。
- A09 `npm test` 真正退出 0，完整终端 stdout/stderr 入库；实际通过/失败数**只能基于 `package.json.scripts.test` 真源执行时的 test runner 输出**，不能提前手抄预估。
- A10 多次 resize、切画质、刷新无 shader 编译错误、WebGL context lost、NaN/Infinity 统计；释放时 cancelAnimationFrame、dispose RT/composer/material/geometry/controls。
- A11 报告逐项标 PASS/FAIL/NOT TESTED 并附链接、SHA、限制；不存在“没实测却写 PASS”的证据缺口。

**假设/依赖**：简报已说明本机 macOS arm64 darwin 25.4.0、Node v26.0.0、npm 11.12.1、Python 3.9.6，Chrome 已安装，npm 可用 `three@0.186.1`、`vite@8.3.5`、`playwright@1.64.1`。这些是简报提供的环境数据，**不是本轮亲自运行的版本输出**。运行时不得依赖浏览器联网；只用 bundled JS/内联 GLSL/程序化形体。WebGL2、半浮点 RT、深度附件及真实 GPU 性能尚待本机测试。

## 2. 已读取的项目材料、版本与现状

**严格只读两份文件**：
1. `handoff/briefs/CLOUDCASTLE-01.md`，GitHub **blob SHA=6501740f6ba42cdc8d62ff0619e4e3eb11c04c57**。定位：L1–5 交接指纹；L7–11 任务与用户原话；L13–24 五类验收；L26–47 环境/约束/常见坑；L49–75 Sky、后处理、几何、云与 HDR 事实摘要；L77–102 当前空仓库、范围和不用读的文件；末节输出要求。
2. `handoff/spec/plan-spec.md`，GitHub **blob SHA=3ce3165d72d19e7868c867f7c22c0729f1ce3b0f**。定位：L1–17 硬性原则；第 1–5 节对需求、调研、模块、任务的格式要求；第 6–8 节对调查、验收和交付证据的要求；末节落盘与指纹要求。本文严格按其八节顺序组织。

**现状**：简报声明仓库中除 handoff 交接材料外没有业务代码，尚无测试和既有失败报告；因此是**从零搭建**，没有已验证代码可复用。并未读 `research/notes.md`、README、目录树或任何第三个仓库文件。下文 `src/`、`tests/`、`reports/` 等均是拟新建路径。

**版本约束**：计划精确固定 `three=0.186.1`、`vite=8.3.5`、`playwright=1.64.1`；`package.json` 设置 `type:"module"`，使用 Node 内置 `node:test`、Vite GLSL `?raw` 导入。Node 26 满足 Vite 8 官方公布的 Node 版本范围，但需执行真实 build 确定兼容性。

**未知**：macOS 的 Chrome 能否在无头环境稳定拿到 WebGL2+HalfFloat+depthTexture；three r186 的 Composer 深度交换行为和 SMAA constructor；GPU 瓶颈；实际首帧构图是否够精致；测试 runner 的 pass/fail 与源 commit。对应第 6 节 U01–U06；没证据之前绝不宣称通过。

## 3. 调研来源、技术选型与取舍

### 3.1 已调研的一手文档/参考实现

| 官方/原始来源 | 已核实结论与工程意义 |
|---|---|
| https://threejs.org/docs/pages/WebGLRenderer.html | WebGLRenderer 基于 WebGL2；`renderer.info.render.calls/triangles` 可读；多 pass 每帧需 `renderer.info.autoReset=false` + 手动 `info.reset()`，否则指标可能只剩一个 pass。 |
| https://threejs.org/docs/pages/EffectComposer.html | Composer 顺序执行 Pass、可构造 HDR RenderTarget、使用 `composer.render()`、`setSize`、`setPixelRatio` 和 `dispose`。 |
| https://threejs.org/docs/pages/Pass.html 和 https://threejs.org/docs/pages/FullScreenQuad.html | 自定义 `Pass` 必须支持 `render(renderer,writeBuffer,readBuffer,deltaTime,maskActive)`、`setSize`、`dispose`，可使用 `FullScreenQuad` 渲染合成。 |
| https://threejs.org/docs/pages/DepthTexture.html 和 https://threejs.org/docs/pages/RenderTarget.html | RenderTarget 能附带 depthTexture；深度可用于云层与城堡正确前后遮挡，但实际 Composer buffer 的深度内容需在 r186 现场验证。 |
| https://threejs.org/docs/pages/OutputPass.html 和 https://threejs.org/manual/pages/color-management.html | OutputPass 负责 tone mapping 与色彩空间转换；线性 HDR 必须在此之前合成，不重复应用 ACES/sRGB。 |
| https://threejs.org/docs/pages/UnrealBloomPass.html 和 https://threejs.org/docs/pages/SMAAPass.html | Bloom 有多级 mip 成本；SMAA 工作于 linear-sRGB、应在 OutputPass 之前；**现行官方 SMAAPass 文档是无参 constructor**，与简报旧形参不同，安装版需探针确认。 |
| https://threejs.org/docs/pages/OrbitControls.html | 官方 addon 引入、`enableDamping` 后每帧 `update()`，可配置 distance/polar/pan 限制。 |
| https://threejs.org/docs/pages/module-BufferGeometryUtils.html 和 https://threejs.org/docs/pages/InstancedMesh.html | `mergeGeometries` 要求几何属性兼容、可能返回 null；同原型 `InstancedMesh` 减 draw calls。 |
| https://threejs.org/examples/webgl_shaders_sky.html | 官方 Sky 示例；简报已核实 Sky uniforms、太阳方向换算公式。 |
| https://vite.dev/blog/announcing-vite8 、https://vite.dev/guide/assets 、https://vite.dev/guide/cli | Vite 8 Node 版本范围；`?raw` 可把 GLSL 内联打包；`preview --host --port --strictPort` 可用于稳定本机截图端口。 |
| https://playwright.dev/docs/api/class-browsertype 、https://playwright.dev/docs/api/class-page | 已装 Chrome 可用 `chromium.launch({channel:'chrome',headless:true})`；`page.screenshot`、`waitForFunction` 与事件收集真实浏览器证据。 |
| Schneider / Vos, SIGGRAPH 2015, “The Real-time Volumetric Cloudscapes of Horizon: Zero Dawn”, https://advances.realtimerendering.com/s2015/The%20Real-time%20Volumetric%20Cloudscapes%20of%20Horizon%20-%20Zero%20Dawn%20-%20ARTR.pdf | 原始分享用高度梯度、噪声、raymarch、光照和低分辨率/内存优化获得可导演的体积云；借鉴原理，不把游戏主机实测的毫秒数套到 WebGL2。 |

### 3.2 云路线至少四种候选

| 方案 | 优势 | 风险/代价 | 决定 |
|---|---|---|---|
| 半分辨率 view-ray march + 深度感知 HDR 合成 + 可关闭时间历史 | 真实厚薄、云顶翻卷/云隙、逆光银边与自阴影；无需外部资源 | 大量 fragment 噪声计算，边缘上采样和重投影拖影需要处理 | **主方案**：先 28 步且无历史做清晰版，再 5 步光照与历史分支；以实测预算为准 |
| 纯多层 billboard 程序云片 | 绘制成本低，失败时仍有云海 | 斜视角露片、透明排序/穿模、自阴影虚假 | **low 备用模式**；不能把低画质平面假称 high 的体积云验收 |
| 3D 密度纹理/体素场 | 可预计算噪声并快速采样、细节可多 | 纹理生成/内存/上传与 WebGL 差异、多一组调试环节 | 本轮不选；放弃更丰富噪声细节以压复杂度 |
| 全分辨率 100–200 步电影级 raymarch | 细节与边缘精度高 | 无头 Chrome/桌面负载高、稳定性差 | 本轮不选；牺牲近景极致质量换实时预算 |

**明确分段交付**：城堡纯几何清楚 → 半分辨率云密度可见 → 场景 depth 截断与 HDR 透射 → 云自阴影/散射 → 静止/运动下历史降噪。history 若导致鬼影关闭默认并在报告写限制，不能留下视觉 bug 冒充“先进技术”。

### 3.3 城堡路线对比

| 方案 | 优势 | 缺陷 | 决定 |
|---|---|---|---|
| 纯参数化实体连续网格 | 外轮廓一致 | 门窗、扶壁、连廊难以独立美术调整；拓扑更难调 | 用于岛和塔楼基体 |
| 每块砖/塔部件各建独立 Mesh | 零件组合快 | draw calls 爆炸、缝隙多、seed 摘要难控 | 不采用逐件独立绘制 |
| **参数化主体 + 零件库 + 按材质合并/实例化** | 结构可变、细节丰富、预算可管理 | 要统一 position/normal/uv/index，正确 applyMatrix4 | **选定** |

### 3.4 色彩、照明与取舍
建议 `RenderPass(scene) → [可选 SSAOPass，默认关] → CloudPass(HDR) → UnrealBloomPass → SMAAPass → OutputPass → [可选 FilmFinishPass]`。设置 `renderer.toneMapping=THREE.ACESFilmicToneMapping`、`renderer.toneMappingExposure≈1.05`、`renderer.outputColorSpace=THREE.SRGBColorSpace`，由 **OutputPass 唯一**把 HDR 映到输出；无第二份自写 ACES。后接 FilmFinishPass 时只针对已映射 sRGB 做细微暗角/颗粒，不再输出色彩转换 chunk；若 r186 实测有二次 gamma，关闭 FilmFinish 并将 OutputPass 放最后。SMAA 放在 OutputPass 前；SSAO 初版关闭避免额外重渲；不做景深以保护塔楼轮廓。

**风险与缓解**：NaN 导致屋顶消失→有限数/clamp 测试；背面剔除→首个棱柱/屋面绕序测试；分层塔楼浮板→补封闭台面；过曝→先关 Bloom 检视线性画面；浮云遮实体→深度 probe；成本超标→先关 SSAO、批量化阴影/材质，再降 cloudSteps/scale 并出对比图；无头 GPU 不可用→保留错误日志，不能虚报截图成功。

## 4. 模块结构、接口、数据流与关键实现细节

### 4.1 文件结构（**全部拟新建，不是已存在的仓库事实**）
- 根：`index.html`、`package.json`、`package-lock.json`、`vite.config.js`、`README.md`。
- 入口配置 UI：`src/main.js`、`src/config.js`、`src/styles.css`、`src/ui/panel.js`。
- 可复用逻辑：`src/lib/prng.js`、`src/lib/metrics.js`。
- 世界生成：`src/scene/castle-model.js`、`src/scene/geometry.js`、`src/scene/materials.js`、`src/scene/castle.js`、`src/scene/island.js`、`src/scene/sky-light.js`、`src/scene/world.js`。
- 交互/后处理：`src/camera/controller.js`、`src/render/cloud-pass.js`、`src/render/pipeline.js`、`src/render/film-pass.js`。
- GLSL（与场景逻辑分离）：`src/shaders/cloud.vert.glsl`、`cloud.frag.glsl`、`cloud-composite.frag.glsl`、`film.frag.glsl`。
- 测试/执行证据：`tests/unit/castle-model.test.js`、`geometry.test.js`、`config.test.js`、`tests/browser/smoke.test.js`、`reports/round-1.md`、`reports/npm-test-local.txt`、`reports/npm-build-local.txt`、`reports/browser-metrics.json`、`reports/screenshots/hero-1920x1080.png`、`side-1920x1080.png`、`responsive-1366x768.png`。

### 4.2 精确**自定义**接口契约（非声称 Three 内置）
- `src/config.js`：
  `export const DEFAULT_SEED = 20261024;`
  `export const QUALITY_PRESETS = Object.freeze({high:{cloudSteps:28,cloudScale:0.5,shadowSamples:5,history:false,bloom:true},low:{cloudSteps:12,cloudScale:0.35,shadowSamples:2,history:false,bloom:true}});`
  `export function parseSceneOptions(search='')` 返回 `{seed:uint32,quality:'high'|'low',still:boolean,debug:boolean}`；支持 `?seed=20261024&quality=high&still=1&debug=1`；仅 0…4294967295 的十进制整数 seed 有效，非法回退默认，0 是合法种子。history 待 T09 截图证明无拖影再允许默认打开。
- `src/lib/prng.js`：`export function createRng(seed)` 返回 `() => number`∈[0,1)，使用 mulberry32 32 位整数移位/`Math.imul`，固定 seed 独立新状态；`Math.random()` 禁用。
- `src/scene/castle-model.js`：
  `export function createCastleModel(seed)` 返回纯 JS 数据：
  `{seed,island:{radius,topY,bottomY,rings,segments},keep:{x,y,z,width,height,depth},walls:Array<{id,x,z,length,height,thickness,axis:'x'|'z'}>,towers:Array<{id,x,z,radius,bodyHeight,roofHeight,sides:8|12,style:'cone'|'spire'|'terrace'}>,details:{battlements,windows,flags}}`；
  `export function validateCastleModel(model)` 校验所有长度/高度>0、角数、所有 numeric finite，非法 throw `TypeError`；
  `export function summarizeCastleModel(model,geometryVertexCount)` 返回 `{towerCount,towerHeights,geometryVertexCount}`，塔按固定 id 顺序，塔高量化到 1e−4。`geometryVertexCount` 是**最终构建产物**中各唯一 geometry 的 `attributes.position.count` 总和，不计已释放中间几何，同实例原型只数一次。
- `src/scene/geometry.js`：
  `export function makeIslandGeometry(islandSpec,seed)`；
  `export function makeTowerBody(tower)`；
  `export function makeMatchingRoof(tower)`；
  `export function makeRingPlatform(tower,lowerRadius,upperRadius,y)`；
  `export function makeWallSegment(wall)`；
  `export function mergeTransformed(parts)`，其中 `parts:Array<{geometry:THREE.BufferGeometry,matrix:THREE.Matrix4}>`；
  `export function countGeometryVertices(root)`。几何函数返回 `THREE.BufferGeometry`；合并时先 clone + applyMatrix4 后才 merge，统一 `position,normal,uv` 与 index/非 index 一致；`mergeGeometries(...,false)` 返回 null 必须 throw，成功释放临时 clone；唯一几何用 Set 去重。
- `src/scene/materials.js`：`export function createCastleMaterials()` → `{stone,stoneDark,roof,trim,metal,windowGlow,flag,dispose()}`；使用 MeshStandardMaterial 与程序化 per-face vertex colors/基础颜色；石/屋顶 roughness、窗 glow emissive；没有外部纹理，颜色 attribute 如启用 vertexColors 必须在待合并几何上全部统一。
- `src/scene/island.js`：`export function buildIsland(model,materials)` → `{group:THREE.Group,geometries:THREE.BufferGeometry[]}`；
  `src/scene/castle.js`：`export function buildCastle(model,materials)` → 同结构。重复窗棂、城垛、悬饰可用 `THREE.InstancedMesh`，`setMatrixAt` 后 `instanceMatrix.needsUpdate=true`，必要时重新计算 bounds；建筑主可绘制材质批次目标 6–12 个而非每窗一个 draw。
- `src/scene/sky-light.js`：`export function createSkyAndLights(scene,{elevation=12,azimuth=220}={})` → `{sunDirection:THREE.Vector3,setSun(elevation,azimuth),dispose()}`；Sky `new Sky()`，`sky.scale.setScalar(10000)`，`sky.material.uniforms.sunPosition.value.copy(sun)`。`phi=degToRad(90-elevation)`、`theta=degToRad(azimuth)`、`sun.setFromSphericalCoords(1,phi,theta)`；DirectionalLight 统一方向与色温。
- `src/scene/world.js`：`export function createWorld({seed})` → `{scene,model,summary,materials,dispose()}`；先 model→island+castle→Sky/light，再按最终 group 汇总顶点；本模块不接触 DOM、不创建 RAF。
- `src/camera/controller.js`：`export function createCameraController(camera,canvas)` → `{controls,update(deltaSeconds),reset(),setPaused(value),dispose()}`。PerspectiveCamera FOV≈45、near=0.1、far=12000、位置 (66,46,78)、target (0,8,0)；OrbitControls `enableDamping=true`、`enablePan=false`、`minDistance=60,maxDistance=140,minPolarAngle=0.3,maxPolarAngle=1.45`。开场 2.5s easeOutCubic，从较远位置进入；用户开始鼠标操纵立即取消开场动画，杜绝运镜与手动抢控制权。
- `src/render/cloud-pass.js`：`export class CloudPass extends Pass`，`constructor(scene,camera,{scale,steps,shadowSamples,history})`、`render(renderer,writeBuffer,readBuffer,deltaTime,maskActive)`、`setSize(width,height)`、`setQuality(preset)`、`resetHistory()`、`dispose()`；`needsSwap=true`，使用 `FullScreenQuad` 半分辨率云 RT + 全尺寸 HDR 合成，输入 sceneHDR/readBuffer.depthTexture，输出 writeBuffer。
- `src/render/pipeline.js`：`export function createPipeline(renderer,scene,camera,{quality})` → `{composer,cloudPass,render(deltaSeconds),resize(width,height,pixelRatio),setQuality(name),dispose()}`；创建 `WebGLRenderTarget`：`type:THREE.HalfFloatType,format:THREE.RGBAFormat,samples:0` 并配置 depthTexture；只调用 `composer.render()`，禁止主循环另 `renderer.render(scene,camera)`。
- `src/render/film-pass.js`：`export function createFilmFinishPass()` → 一次轻量 ShaderPass，可关闭；色调映射仅 OutputPass 实施，Film 只作用于映射后的 LDR/sRGB。
- `src/lib/metrics.js`：`export function createMetrics(renderer,{windowSize=60}={})` → `{beginFrame(),endFrame(deltaSeconds),snapshot()}`，beginFrame 手动 `renderer.info.reset()`，endFrame（**在 composer.render 之后**）取 calls/triangles 与有效 FPS。
- `src/ui/panel.js`：`export function createPanel(mount,{onPause,onReset,onQuality,onSun})` → `{update(stats),dispose()}`，使用 `textContent` 更新文字、可聚焦按钮；面板展示 fps/calls/triangles/seed/quality。
- `src/main.js`：`export async function bootstrap()` → `{dispose()}`；创建 renderer/world/controller/pipeline/metrics/panel，唯一 RAF + ResizeObserver。暴露**本项目自定义**只读测试门面 `window.__CLOUDCASTLE__={snapshot(),setQuality(name),resetCamera(),pause(value)}`，`snapshot()` 至少返回 `{ready,webgl2,seed,quality,frames,fps,calls,triangles,towerCount,towerHeights,geometryVertexCount,cameraPosition,time}`；`ready` 仅成功渲染一帧后 true。

### 4.3 确定性几何和构图执行细则
**世界坐标：+Y 向上，摄像机从 +Z 看向城堡正门。**初始岛上平面 y=0，岛底约 −17，最大半径 31；城墙外边 x≈±20、z≈±16，高 10–12、厚 1.5；主堡约 14×11×19。8 塔位置：四角 (±20,±16)，正门两侧 (−4,16)/(4,16)，两侧墙中段 (±20,0)。高 18–30，顶高 5–9，种子控制高度、屋型、饰件数量。塔/墙相交处要计算实际重叠并合拢，不是一味完整墙贯穿门洞。

1. **岛基**：64 等角分段 × 7 高度环；对各环半径用固定 seed 小幅扰动、向下收锥，顶面和下端封口。每组三角通过 `dot(cross(b-a,c-a),expectedOutwardNormal)>0` 检查绕序，否则交换顶点索引；顶面法线 +Y，侧面朝外；`computeVertexNormals()` 后确认正常。浮岛有 3D 岩层、下部尖锥、顶部窄草地轮廓，不是平圆盘。
2. **塔与顶盖**：先单测正确的八角柱，再批量复制。塔身收分时上一层半径减小，`makeRingPlatform` 用同侧数的外/内环补台面；锥顶底边与塔身顶边 sides 相同且对齐相位角。不得用方形顶盖盖八角塔。屋面底边/塔上沿 y 差 <1e−4。`pow(max(base,0.0),2.35)` 防止 NaN。
3. **门/墙**：前方 z=16 的墙拆左右段和上过梁，真实开洞；做门廊暗部、拱圈/铁门、正立面三层有深浅差别的窗及窗框。不能用一整堵墙贴黑矩形冒充洞。城垛按固定间隔放在墙上，尽量实例化；旗帜细分薄片随时间顶点摆动，但 `still=1` 固定相位。
4. **材质**：主堡石材冷灰-暖金 per-face vertexColors；屋顶石板蓝黑、边缘镀金/铜色，发光窗窄小；使用程序化噪声颜色但不造巨大独立几何。大量材料或透明旗布不得使 calls 超预算。窗光首选 emissive 贴合几何而非几十个真实 PointLight。
5. **阴影**：DirectionalLight castShadow，只选堡体/屋顶等主体 castShadow，实例小装饰不必阴影；shadowMap 先 2048²，覆盖城堡 x/z≈±40、y≈−20…45，阴影相机近远与 bias/normalBias 通过阴影图调整。天空不投阴影。

### 4.4 云与合成的逐步算法
- 云密度盒初值 `min=(-180,-20,-180), max=(180,-3,180)`，云顶部低于岛顶；云不要遮塔尖。GLSL 源通过 Vite `?raw` 内联，不发网络请求。
- 从像素 uv 使用 `inverseProjectionMatrix` 与 `cameraWorldMatrix` 反投影世界射线，rayOrigin = camera.position；各轴 slab intersection 取入口 max/出口 min。`abs(direction)<1e-5` 的轴先检查点是否在 slab 内，避免 0 除；`start=max(tEntry,0),end=tExit`。
- RenderPass 后读取 `readBuffer.depthTexture`：深度 <1 时用 `clip=vec4(uv*2.0-1.0,depth*2.0-1.0,1); view=invProj*clip; view/=view.w; world=cameraWorld*view` 重建可见实体的世界点并求 `tScene=length(world-cameraPos)`；`end=min(end,tScene-0.05)`。深度≈1 天空视为无限远。若 end≤start，输出透明云；处理 near/far 和非 finite。
- 云密度用 3D value noise/fBm（初步 3 octaves）组成大尺度云团与高频撕边；高度 `h=clamp((p.y+20)/17,0,1)`，`heightMask=smoothstep(0,0.20,h)*(1-smoothstep(0.72,1.0,h))`；`d=max(0,fbm(p*0.035+windTime)-coverageThreshold)*heightMask*densityScale`。相机所见岛边云顶适当减薄，防景深层次全被盖住。
- 步进 high 28/low 12，`ds=(end-start)/steps`，固定 seed 与 frame 生成像素 jitter；Beer–Lambert：`Tnew=T*exp(-sigmaT*d*ds)`，`weight=T-Tnew`，`C+=weight*cloudLight`，`T=Tnew`；`T<0.01` 早退。输出 `vec4(C,1-T)`，其中 C 是**预乘散射贡献**；HDR 合成必须 `outRGB=C+T*sceneHDR`，不能对 C 再乘 alpha。场景/云都保持线性 HalfFloat。
- 太阳方向 5 个额外密度样本（low 2），`sunTransmittance=exp(-sigmaLight*sumDensityStep)`；混合 HG 相函数 `P(g,c)=(1-g*g)/(4*pi*pow(max(1+g*g-2*g*c,1e-3),1.5))`，g≈0.7 / −0.2，权重 0.8/0.2；范围钳制避免“整片白棉花”。最后加轻微风驱动的缓慢 domain warp；必须先实现不带光步进的清楚云，再逐项增加效果。
- half RT 像素大小 `max(1,floor(cssWidth*pixelRatio*scale))`，renderer DPR=`min(devicePixelRatio,2)`、composer 同步。full-res 云合成上采样若产生近处塔边光晕，则取 cloud taps 与对应场景线性深度，深度差>2% 逐 tap 降权；全剔除用最近 tap。**depth downsamples 的附件细节先做第 6 节 U03 探针再定，不能编一个必然可用的 API**。
- **时间历史最后再做**：两个 history RT ping-pong；静态无遮挡时根据上一帧 viewProjection 对云层中点 y≈−11 投影得 prevUV，越界/首次/resize/质量切换/相机运动过大时拒绝历史；上一帧 RGB 钳制到本帧 3×3 min/max 邻域后 `mix(current,clampedHistory,0.88)`。不能同时读写同一 RT。若转动鬼影明显，高质量默认 history=false 保持可读云，历史尝试写入报告而非隐瞒。
- 如果 scene depth attachment 在 composer swaps 后失效，按第 6 节 U03 使用**独立 opaque depth prepass**；注意额外的 draw calls 必须重新压回 ≤60，不准假装深度可用。

### 4.5 主循环数据流与异常边界
`URL options → createCastleModel/validate → buildCastle+Island → final unique geometry vertex count → Scene+Sky+Lights → WebGL2Renderer → OrbitControls → EffectComposer → RAF: metrics.beginFrame → camera.update(time) → cloud uniforms → composer.render → metrics.endFrame → panel.update + __CLOUDCASTLE__.snapshot`。

`setQuality` 等 UI 输入在一个 RAF 内串行执行，resize 时 `camera.aspect/updateProjectionMatrix`、`renderer.setSize`、`composer.setSize`、`cloudPass.setSize` 同步调用并 reset history。零宽/高暂停渲染，DPR 限到 2。页面失焦/隐藏后时间增量 clamp 到 ≤0.05s，避免风和旗帜大跳。非法 seed/quality 回退安全值、shader 编译失败报告错误/显示 DOM 提示而不是静默黑屏、无 WebGL2 时停止 RAF 并显示文字错误。`dispose` 要幂等，清理 RAF、ResizeObserver、事件监听、controls、所有 Geometry/Material/Target、composer、renderer。不得两套 RAF 或在每帧泄漏新 geometry/material。

## 5. 任务拆解（按依赖顺序）

每项都明确 **前置条件、操作步骤、相关位置、预期产物、自查方法、测试方式、完成条件** 七字段。新建文件以函数名定位，不伪造尚不存在的行号。

### T01 项目骨架及锁依赖（依赖：无）
- **前置条件**：本机进入仓库根，有 Node/npm。
- **操作步骤**：新建 `package.json`（type module/private）、`index.html`、`vite.config.js`、`src/main.js`、`src/styles.css`；安装生产 `three@0.186.1` 和 dev `vite@8.3.5`/`playwright@1.64.1`，设置 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`，生成 `package-lock.json`；先补最小 Node 测试占位，避免 glob 空匹配。脚本固定：`dev: vite --host 127.0.0.1`，`build: vite build`，`preview: vite preview`，`test:unit: node --test tests/unit/*.test.js`，`test:browser: npm run build && node --test tests/browser/*.test.js`，`test: npm run build && node --test tests/unit/*.test.js tests/browser/*.test.js`。
- **相关位置**：`package.json#scripts`，上述新建根文件。
- **预期产物**：锁文件/能 build 的 Vite 页面与测试入口。
- **自查方法**：`node --version; npm --version; npm ci; npm run build; node -p "JSON.stringify(require('./package.json').scripts)"`。
- **测试方式**：`npm run test:unit` 退出 0（占位测试须包含真实断言）。
- **完成条件**：干净 npm ci 和 npm build 均可复现，无浏览器外站依赖。

### T02 PRNG、配置与纯数据城堡（依赖：T01）
- **前置条件**：ESM 单测正常。
- **操作步骤**：新建 `src/lib/prng.js`、`src/config.js`、`src/scene/castle-model.js`；实现 mulberry32、URL 解析、8 塔与分段墙的 seed-driven 结构、有限数检验、固定 id 排序、摘要函数；建测试。
- **相关位置**：`createRng`、`parseSceneOptions`、`createCastleModel`、`validateCastleModel`、`summarizeCastleModel`。
- **预期产物**：`tests/unit/castle-model.test.js`、`config.test.js`。
- **自查方法**：`node --input-type=module -e "import {createCastleModel} from './src/scene/castle-model.js'; console.log(createCastleModel(20261024).towers.length)"` 输出至少 8。
- **测试方式**：同种子完整 deepEqual、不同种子变化、seed=0/max/非法输入、每一字段 finite；`npm run test:unit`。
- **完成条件**：纯数据全绿，无 Math.random，模型顺序固定。

### T03 单几何、绕序、接缝及合并（依赖：T02）
- **前置条件**：模型 schema 已定。
- **操作步骤**：新建 `src/scene/geometry.js`；先做一个能正确背面剔除的八角棱柱，再做有顶/底封面的多环岩岛、环台、八角屋顶、墙段；合并前 clone/applyMatrix4、attribute/index 统一；失败 throw；禁止零面积三角和负数 pow。
- **相关位置**：`makeIslandGeometry`、`makeTowerBody`、`makeMatchingRoof`、`makeRingPlatform`、`makeWallSegment`、`mergeTransformed`。
- **预期产物**：geometry 工具和 `tests/unit/geometry.test.js`。
- **自查方法**：`position.count`/index/bounds/normal 检查、塔身/屋顶端面 y/radius 对齐。
- **测试方式**：两个不同位置方体 merge 后 bbox 覆盖两个位置（防堆原点）；样本三角 outward normal dot>0；屋顶边数与塔一致；环台内外圈闭合；finite；`npm run test:unit`。
- **完成条件**：基准形体/合并/顶盖的全部回归通过。

### T04 静态城堡、岛与材质分桶（依赖：T03）
- **前置条件**：基本网格正确。
- **操作步骤**：新建 `materials.js`、`castle.js`、`island.js`、`world.js`（皆位于 `src/scene/`）；完成前墙真实门洞、主堡、至少 8 塔与屋顶、石材变色、窗洞窗框、门楣、城垛/旗帜/岩岛；同材质 merge、重复部件 InstancedMesh，最终统计唯一几何 vertices。
- **相关位置**：`createCastleMaterials`、`buildIsland`、`buildCastle`、`createWorld`。
- **预期产物**：不依赖云和 post 的完整三维剪影。
- **自查方法**：临时灰背景正/侧镜头观察，主堡/塔/门/岛底清晰；同 seed 两次实建摘要一致。
- **测试方式**：单测检查 `towerCount≥6`、最终 vertex count 两次一致、无 NaN、材质数与 batch 统计；`npm run build`。
- **完成条件**：不开 Bloom/云也“看得出城堡”，无漏顶/悬空环台。

### T05 天空、阳光与阴影（依赖：T04）
- **前置条件**：结构已能绘制。
- **操作步骤**：新建 `src/scene/sky-light.js`；Sky uniforms 与太阳向量统一、DirectionalLight/hemisphere、2048² 阴影贴图、shadow camera 包围主体、调 bias；入口主视角检查暖高光、冷阴影与屋顶轮廓。
- **相关位置**：`createSkyAndLights`、`setSun`、`createWorld`。
- **预期产物**：稳定天空、黄金时刻、清晰局部阴影。
- **自查方法**：不同太阳角度截图，城墙/塔的亮暗方向一致，无阴影痤疮或过曝。
- **测试方式**：数值测试太阳方向和光源方向同源；`npm run build`；Chrome 无 error。
- **完成条件**：无需 HDRI 即有明显立体光照与地平线大气。

### T06 运镜、控制与停止条件（依赖：T04、T05）
- **前置条件**：固定构图已确定。
- **操作步骤**：新建 `src/camera/controller.js`；OrbitControls damping + 限位/禁 pan、开场 easeOutCubic 运镜、用户交互取消 intro、R/P 键与事件注销。
- **相关位置**：`createCameraController`、`src/main.js` RAF。
- **预期产物**：鼠标可绕城/缩放、重置、暂停。
- **自查方法**：任意横/竖拖、滚轮、R/P，Camera target 不偏离中心；操作期间镜头不被 intro 抢走。
- **测试方式**：浏览器对 drag 前后 cameraPosition 差异和 reset 收敛断言；隐藏标签后 time delta 有上限。
- **完成条件**：能不穿模地从两方位观察堡体。

### T07 HDR 管线及深度探针（依赖：T05、T06）
- **前置条件**：U01/U03 可用或选择已记录后备。
- **操作步骤**：新建 `src/render/pipeline.js`/`cloud-pass.js` 和 GLSL 空壳；先 `RenderPass → CloudPass(只复制颜色) → OutputPass`，HalfFloat scene RT，独立 debug 深度可视化；resize、pass dispose；确保 composer.render 唯一渲染入口。
- **相关位置**：`createPipeline`、`CloudPass.render`、`cloud-composite.frag.glsl`。
- **预期产物**：可见颜色不变的 HDR composer 与可读取深度。
- **自查方法**：云关闭时与之前画面等价；debug depth 图中物体有层次、sky 接近 1。
- **测试方式**：Chrome WebGL2/context/console/截图；5 次 resize；`npm run build`。
- **完成条件**：不存在读错 RT/黑屏/双 ACES。

### T08 体积云密度、光与遮挡（依赖：T07）
- **前置条件**：HDR 和 depth 探针通过。
- **操作步骤**：在 `cloud.frag.glsl` 实现 4.4 的 slab 射线、密度包络、28 步积分、深度截断；再逐项加日光 shadowSamples=5 与 HG 双瓣；CloudPass 半分辨率 RT 合成；初始 history=false。
- **相关位置**：`cloud.frag.glsl`、`CloudPass.render`、`cloud-composite.frag.glsl`。
- **预期产物**：岛下有卷云/厚薄/云隙与正确穿插的 HDR 云层。
- **自查方法**：主/侧视角关闭 Bloom 逐项观察密度、云/岩岛边缘、透光和局部自阴影；无顶盖被云染白。
- **测试方式**：WebGL 编译/console=0；两角度截图人工审；各统计数 finite；`npm run build`。
- **完成条件**：云不是纯 billboards、无云层穿堡/漂白/NaN。

### T09 云性能与模式切换（依赖：T08）
- **前置条件**：无历史体积云清晰。
- **操作步骤**：high 0.5/28 步，low 0.35/12 步；先半分辨率合成，无 halo 后试历史 ping-pong/运动拒绝/邻域钳制；云合成深度边缘若灰白，通过 U03 确认下采样深度获取方式后做 2×2 深度权重。
- **相关位置**：`CloudPass.setQuality/resetHistory/setSize`、`cloud-composite.frag.glsl`。
- **预期产物**：high/low 两档，按模式重建 RT 和清空历史，质量有肉眼差别。
- **自查方法**：同机位 high/low 截图对比；绕岛后没有拖尾、逐次切换无性能持续恶化。
- **测试方式**：Browser 切 5 次 + resize 5 次、查 shader errors/画面分布；记录 FPS/calls 差异。
- **完成条件**：两种模式运行、无历史路径可交付；若历史失败，关默认并记录明确限制。

### T10 美术收尾与后处理（依赖：T08、T09）
- **前置条件**：主体与云已可读。
- **操作步骤**：完善扶壁、窗口 emissive、旗杆/布面摆动和岛层次；加入 `UnrealBloomPass`、`SMAAPass`、`OutputPass`；最后仅在色彩检查正确时加 `FilmFinishPass`。逐次关效果截 A/B，调高光不糊塔尖。
- **相关位置**：`src/scene/castle.js`、`materials.js`、`src/render/pipeline.js`、`film-pass.js`、`src/shaders/film.frag.glsl`。
- **预期产物**：完成的黄金时刻主视觉。
- **自查方法**：主图/侧图按 A03 逐项人工判，窗与屋顶细节不能被 Bloom 覆盖。
- **测试方式**：PNG 的 A04 直方图、RGB 非退化、console 0、build 0。
- **完成条件**：主视角的观感达到本轮视觉门槛而不以雾掩盖几何。

### T11 FPS/批次/面板与生命周期（依赖：T06、T10）
- **前置条件**：管线唯一 RAF 已稳定。
- **操作步骤**：新建 `src/lib/metrics.js`、`src/ui/panel.js`；render 前手动 reset renderer.info、后读全管线 metrics；创建 DOM stats、seed/quality/P/R 可用 UI；暴露 `window.__CLOUDCASTLE__.snapshot`，补 resize/visibility/dispose。
- **相关位置**：`createMetrics`、`createPanel`、`bootstrap`。
- **预期产物**：真实 FPS/calls/triangles 和测试接口。
- **自查方法**：画面可见数值，不能恒为 0、NaN 或只反映一项 pass；窗口缩放 UI 不盖住城堡。
- **测试方式**：浏览器 snapshot 字段/finite、质量切换、5 次 resize、pause/resume、销毁后不再更新。
- **完成条件**：可观察全成本、无明显事件/资源泄漏。

### T12 完整本机自动化与性能回归（依赖：T01–T11）
- **前置条件**：npm build 成功，可访问 preview。
- **操作步骤**：新建 `tests/browser/smoke.test.js`；Node `spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173','--strictPort'])` 后轮询 HTTP 200，启动 `chromium.launch({channel:'chrome',headless:true})`；收集 console/pageerror/request/response/requestfailed；打开 `?seed=20261024&quality=high&still=1&debug=1`，用 `page.waitForFunction` 等 `snapshot().ready`；warmup 120 不同 RAF，再采 60 不同已完成帧的 calls/triangles/FPS；用 `page.screenshot` 实际保存主/侧/小视口 PNG；PNG 的 Buffer 以 base64 data URL 在 browser 内创建 Image/Canvas2D `getImageData` 算 A04 灰度/ROI；做交互和外站请求断言；`finally` 关闭 browser/preview 子进程。任何性能超额先合并建筑/减少投影 mesh，再移除 SSAO/多余 fullscreen pass，最后降云采样（不得牺牲 high 的主体可读性）。
- **相关位置**：`tests/browser/smoke.test.js`、`tests/unit/*.test.js`、`package.json#scripts.test`、`reports/browser-metrics.json`。
- **预期产物**：PNG、量化 JSON、真实测试日志和每条断言。
- **自查方法**：`npm ci && npm test` 返回 0，保存错误事件与完整 stdout/stderr。
- **测试方式**：全部 Node tests + Chrome 端到端；检查 frame 采样确实是不同 frame，而非重复同一 `snapshot`；按 A01–A10 核证。
- **完成条件**：所有自动硬指标 PASS 且原始证据在仓库中有路径。

### T13 最终审图和文档提交（依赖：T12）
- **前置条件**：自动验收全绿且三张截图齐全。
- **操作步骤**：逐条人工审核 A03，视觉不达标返回 T04/T08/T10 并重跑；新建 `README.md`、`reports/round-1.md`，记源 SHA、逐文件改动、全部命令/真实退出码/完整日志、图像判读/指标/限制与最终 verdict；提交源码+证据，**不建 CI**。
- **相关位置**：`README.md`、`reports/round-1.md`、`reports/npm-*-local.txt`、`reports/screenshots/*`。
- **预期产物**：他人可复现的项目、三张真实截图和完整验收报告。
- **自查方法**：在干净安装状态重跑所有脚本与三角性能硬阈值，审对 report 指向的 SHA、图片/JSON。
- **测试方式**：`npm run build && npm test` 与手动 Chrome 主/侧/交互巡检，出现一项 FAIL 则不得 READY。
- **完成条件**：A01–A11 有完整、准确、可审查的证据；交付结论只写在仓库报告里不依赖聊天文本。

## 6. 未知信息的调查入口

每项必须实际执行本机探针，记录输出和 A/B 分支。时间盒到达时采取保守方案并在报告注明，而非编造路径/API。

| ID / 问题 | 具体入口 | 判定方法 | A/B 分支 | 耗时上限 |
|---|---|---|---|---|
| U01 无头 Chrome/WebGL2 真的可用？ | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --version`；Playwright `chromium.launch({channel:'chrome',headless:true})` 后在页面 `document.createElement('canvas').getContext('webgl2')`；参考 https://playwright.dev/docs/api/class-browsertype | context 非 null，实际 three renderer 也得到 WebGL2 且首帧渲染 | A 是：继续；B 否：查 Chrome 权限/GPU/有头模式差异；保留 blocker，不把黑屏报告成 PASS | 20 min |
| U02 HalfFloat HDR 与 depth FBO 是否完整？ | 浏览器最小附件测试 `gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE`；官方 https://threejs.org/docs/pages/DepthTexture.html | 编译成功，深度灰度图随摄像机变化且 framebuffer 完整 | A 完整：HDR + CloudPass；B 不完整：尝试低配 RGBA8 诊断并记录效果差异；核心 HDR 无法用则不可交付 | 25 min |
| U03 r186 的深度 buffer swap、SMAA 实参、色调行为？ | 安装后 `node -p "require('./node_modules/three/package.json').version"`；阅读**本机安装依赖而非仓库其他源码** `node_modules/three/examples/jsm/postprocessing/EffectComposer.js`、`SMAAPass.js`、`OutputPass.js`、`Pass.js` 和官方文档 | RenderPass 后场景深度在 `readBuffer.depthTexture` 正确，SMAA ctor 使用装入版本的真实签名，输出只做一次颜色映射 | A 连通：直接复用；B 深度有缺：加独立 opaque depth prepass RT（计入 draw calls）；C FilmFinish 二次转换：禁用它，OutputPass 做最终 pass | 35 min |
| U04 GPU 瓶颈是什么？ | 高/低模式和逐 pass（云/Bloom/阴影/可选 SSAO）切换；`window.__CLOUDCASTLE__.snapshot()`，Chrome Performance；固定 1920×1080 DPR1 | 记录各分支 max calls/max triangles/median FPS、GPU renderer 信息 | A calls >60：先合批/削减阴影；B fragment FPS 慢：减 ray steps/scale/shadow samples；C 软件 GPU：如实标记基线适用性，不造测量 | 40 min |
| U05 岩岛/顶盖/云边 halo 怎么定位？ | `?seed=20261024&still=1&debug=1` 固定机位，依次关云、关 Bloom、换深度 debug 截图，执行几何单测 | 找到拓扑、深度上采样、tonemap 三种根因之一并留对比图 | A 几何问题回 T03–04；B 云遮挡回 T08–09；C 白边/色差回 T10；一项一项修 | 40 min |
| U06 如何得到实际测试计数且不假报？ | `node -p "require('./package.json').scripts.test"` 和 `set -o pipefail; npm test 2>&1 \| tee reports/npm-test-local.txt` | 本机 stdout/stderr 有 runner 的真实 pass/fail、exit code=0 | A 完整：报告照实引用；B 不完整/测试失败：修复后重跑，不能填写预计通过项数 | 15 min |
| U07 已装 Chrome 可执行文件启动失败？ | Playwright 官方 https://playwright.dev/docs/api/class-browsertype；`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --version`；保留 launch exception | headless 成功开启本机 preview 截图 | A `channel:'chrome'`；B 指定该条命令确认存在的 `executablePath`；C 仍不可用写 V02/V03 NOT TESTED、标 blocker | 20 min |

## 7. 本机测试、启动与回归验收要求

**本机必须按序实际执行**（这里的 scripts 必须由 T01 先创建，不声称当前已存在）：
1. `node --version && npm --version`，以及 `/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --version`；记录真实版本。
2. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci`（本机使用已有 Chrome，不下载安装浏览器）；exit 0；锁文件无漂移。
3. `node -p "JSON.stringify(require('./package.json').scripts,null,2)"`；保存 `scripts.test` 的实际文本作为唯一脚本真源。
4. `npm run build`（exit 0，确有 dist）；`npm run test:unit`（全部 node:test 绿）。
5. `npm run test:browser`（脚本自身启动/退出 `vite preview` 和 Chrome，生成 PNG 与 JSON）；`npm test`（真实总验收、全部绿）。
6. 手工启动 `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`，浏览器打开 `http://127.0.0.1:4173/?seed=20261024&quality=high&debug=1`；测试鼠标水平/竖直拖转、滚轮、R、P、质量开关、reset/失焦和多次 resize。`still=1` 仅供确定性截图。

**自动 Chrome 强制断言**：在 goto 前设置 `page.on('console')`、`page.on('pageerror')`、`page.on('request')`、`page.on('requestfailed')`；使用 `viewport:{width:1920,height:1080},deviceScaleFactor:1`；`page.waitForFunction(()=>window.__CLOUDCASTLE__?.snapshot().ready === true)`，设置 page 默认超时例如 30s；`snapshot.webgl2===true,frames>0`。抓 console/error 真实记录；外站 URL 一律失败，关键本地资源失败一律失败，不把脚本错误过滤；`page.screenshot({path:'reports/screenshots/hero-1920x1080.png',scale:'css'})` 与其他截图必须源自 **build 后的 preview**。写 JSON 包含截图大小、直方图、非黑屏诊断、camera angle、max draw calls、max triangles、fps median、60 个独立帧数。长时间截图前 `still=1` 固定时间/运镜，否则视觉像素对照不稳定。

**性能流程**：high、1920×1080、DPR1，先至少 120 RAF 暖机，再以 RAF 驱动循环收取 60 个**不同帧** post-render `snapshot()`；max calls≤60、max triangles≤500k。fps 来自真实时间采样，不能把 step count 当 FPS、不能把 sky/castle-only calls 代替整条后处理链。若云 shader/阴影让调用数或三角数超标，用逐 pass 对照定位（见 U04），修改一次重跑整套。即使指标通过，A03 视觉不清楚仍失败。

**视觉与 UI 回归**：至少一次主/侧/低视口人工审图和 PNG 统计；检查八角塔配八角屋顶、收分台面封闭、前门真的留洞、云顶在岩岛下、塔尖边缘无 halo；high/low、pause/resume、resize 5 次、R 重置和视角限制；测试外站请求数=0；切质量前后不能出现控制锁死、RT 旧尺寸、持续增多的 console error；dispose 后不可有 RAF/事件继续更新。

**失败/交付判定**：构建/test 非零、无 WebGL2、无真实 PNG、console error、城堡肉眼不清楚、亮度退化、固定种子不一致、预算超 60/500k、外站请求、遮挡错误或缺失报告任一出现 => `NEEDS_IMPROVEMENT`。只有 A01–A11 全部以真实证据满足，才能写 `READY_FOR_DELIVERY`。未测项明确写 NOT TESTED，不能将探索图片当完成的平衡/性能验证。低端模式存在不等于高端视觉门槛自动合格。

## 8. 首次交付需要提交的产物

**代码/项目文件**：第 4.1 节列出的 `package.json`、`package-lock.json`、`index.html`、`vite.config.js`、`src/*` 全部存在，且入口能构建；`tests/unit/*.test.js` 和 `tests/browser/smoke.test.js` 被 `package.json.scripts.test` 实际纳入；`README.md` 有安装/运行/控制说明、seed/quality/still/debug 查询参数、非目标。`dist/` 是生成物，不强制提交，也不得替代源码。

**真实证据**：`reports/round-1.md`、`reports/npm-test-local.txt`、`reports/npm-build-local.txt`、`reports/browser-metrics.json`、`reports/screenshots/hero-1920x1080.png`、`side-1920x1080.png`、`responsive-1366x768.png`；截图来自真实 Chrome 生产预览，禁止合成图片或用程序生成示意图冒充。

**报告 `reports/round-1.md` 固定栏目**：
1. 环境：实际 macOS/Node/npm/Chrome、安装依赖确切版本；
2. SHA：分支、执行源 commit SHA、截图/测试针对的源码 SHA、提交指纹对应简报 SHA；
3. 文件清单：T01–T13 逐项完成/未完成及实改文件，偏离计划的理由；
4. 命令：`npm ci`、`npm run build`、`npm test` 等命令、退出码、原始日志文件位置；`package.json.scripts.test` 实际文本；
5. **验收矩阵** A01–A11：逐条 PASS/FAIL/NOT TESTED、证据路径/测试名称；
6. 视觉：三图、主/侧/小视口人工核对点、真实直方图数据及审查记录；
7. 性能：1920×1080/DPR1/high，warmup 120、samples 60、max calls、max triangles、median FPS、GPU/软件渲染状态及质量对照；
8. 风险、剩余缺陷、明确 NOT TESTED 和最终 `READY_FOR_DELIVERY` 或 `NEEDS_IMPROVEMENT`，下一轮最小修复任务。

**命令输出与通过/失败数**：读取 `node -p "require('./package.json').scripts.test"` 后按该脚本执行 `npm test`。建议 Mac bash/zsh 用 `set -o pipefail; npm run build 2>&1 | tee reports/npm-build-local.txt; npm test 2>&1 | tee reports/npm-test-local.txt`，检查命令真正退出码。报告的 passed/failed 只提取该次 runner 的完整 stdout/stderr（不能预填或手抄想象测试数）。`reports/browser-metrics.json` 建议包含 `{sourceCommit,viewport:{width,height,dpr},seed,quality,warmupFrames,sampleFrames,maxDrawCalls,maxTriangles,medianFps,lumaHistogram:{occupiedBins,stddev,midrangeRatio,roiStddev},consoleErrors:[],pageErrors:[],externalRequests:[],screenshots:[]}`，所有数字由浏览器实测，未得值为 null 并解释。

**限制必须诚实写明**：本轮不支持移动触摸/WebGPU/后端/存档/外部资产/CI；云是实时近似 Beer–Lambert/HG 而非完整大气多次散射；DPR 最多 2，1920×1080 DPR1 预算不等于 4K 测试；时间历史若出现鬼影需默认关闭并列“尝试但未验收”；WebGL2 不可用时仅显示错误提示；没有经实际截图、跑测验证的内容必须标 NOT TESTED。

**最后执行动作**：代码与真实证据提交 GitHub，保持两份只读简报/规格原样；在仓库报告中留下最终判定，不以聊天回复代替闭环。若任何阻断项未过，提交事实与阻断原因，但不得标记可交付。
