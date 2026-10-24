<!-- sflipmloop-handoff
kind: brief
task: CLOUDCASTLE-01
round: 1
nonce: 0de9bd32613fa5cb
-->

# 简报 CLOUDCASTLE-01：云上城堡实时 Three.js 场景（精品级）

## 任务

做一个**完整的实时 Three.js 场景**：一座城堡漂浮在云层之上，实时渲染、可交互。
用户原话：「做个一个完整的实时 Three.js 场景，城堡漂浮在云层之上……目标就是做个世界最精致的、最好的、效果最炫的云上城堡。」
用户参考了 X（推特）上别人用别的模型做的同类项目，评价「做的特好」，因此本轮不接受「能跑就算完成」。

## 验收

1. **构建与启动**：`npm ci && npm run build` 成功；`npm run preview` 起服务后，用无头 Chrome 打开页面，
   **无 console error**、WebGL2 上下文创建成功、页面非黑屏。
2. **视觉**：无头 Chrome 截图中能辨认出「云层之上的城堡」——塔楼/城墙/主体的轮廓清晰可读，
   画面不是纯色、不是黑屏、不是糊成一片。（截图人工判读 + 亮度直方图非退化双重判定。）
3. **确定性**：程序化几何由固定种子驱动，同一种子两次生成的结构摘要（塔数量、塔高序列、顶点总数）完全一致；
   有一条单测断言这一点。
4. **性能预算**：页面内可读出 `renderer.info`（draw calls / 三角形数）并显示在调试面板上；
   桌面 1920×1080 下 draw calls ≤ 60、三角形 ≤ 500k。
5. **测试**：`npm test` 全绿。**通过/失败数量必须从 `package.json` 的 scripts 这一个真源读出来，不要手抄。**

## 背景与约束

- **本机**：macOS arm64（darwin 25.4.0）、Node v26.0.0、npm 11.12.1、Python 3.9.6、无 TTY、无付费 API。
  `/Applications/Google Chrome.app` 已装；**无**全局 playwright/puppeteer（可作为 devDependency 安装）。
  npm registry 可达：`three@0.186.1`、`vite@8.3.5`、`playwright@1.64.1`。
- **运行时零外部依赖**：页面运行时**不得**从 CDN 或任何外部站点拉 three.js / 素材 / 字体。
  所有资源要么打包进产物，要么程序化生成。（这也是「精品」的可复现性要求。）
- **素材策略**：不下载、不购买 3D 模型与贴图。城堡必须**程序化生成**（几何 + 程序化材质）。
- **技术底座**：three.js 0.186.x + Vite（ES module，`three/addons/...` 引入官方 addon）。
- **既有约定**：项目当前是**空仓库**（除交接目录外无任何代码），本轮从零搭建。
  代码风格：ES module，一个模块一件事，着色器与场景逻辑分离，渲染管线用 EffectComposer 串起来。
- **已知的坑，别重走**（调研已确认，不必再验证）：
  - `mergeGeometries` 前每个几何体**必须** `applyMatrix4` 应用世界变换，否则全堆在原点；
    待合并几何体的顶点属性结构必须一致（position/normal/uv 齐全），否则合并直接报错。
  - 程序化建筑最常见的 bug 是**顶点绕序反了**导致背面剔除、看见墙的内侧；先做对一个棱柱再照抄顺序。
  - `Math.pow(negative, 2.35)` 会产生 NaN，让屋顶**静默消失**——参数要 clamp。
  - 塔身收分（上一层比下一层窄）时，两条轮廓之间要补环形台面，否则读起来像一摞悬空搁板。
  - 顶盖必须匹配它封的平面（八角塔配方顶盖会留四块楔形口）。
  - `composer.render()` 取代 `renderer.render()`；`renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`。
  - tone-map **只做一次**，放在最后一个合成 pass；不要让 `renderer.toneMapping` 和 composer 重复映射。
- **本轮明确不做**：后端/数据库/登录；WebGPU（只做 WebGL2）；移动端手势；购买或引入外部模型/贴图/HDRI；
  多语言 i18n 框架；数据持久化。

## 已核实的 API 事实（可直接用，不必重新查证）

**大气天穹**：`import { Sky } from 'three/addons/objects/Sky.js'`，无参构造，`sky.scale.setScalar(10000)`。
uniforms：`turbidity`(2)、`rayleigh`(1)、`mieCoefficient`(0.005)、`mieDirectionalG`(0.8)、`sunPosition`(Vector3)、
`up`(0,1,0)、`showSunDisc`(0/1)。内部：`vBetaM = totalMie(turbidity) * mieCoefficient`；
`vSunfade = 1.0 - clamp(1.0 - exp(sunPosition.y/450000.0), 0.0, 1.0)`；
`rayleighCoefficient = rayleigh - (1.0*(1.0-vSunfade))`。常量 `rayleighZenithLength=8.4E3`、`mieZenithLength=1.25E3`。
太阳位置：`phi=degToRad(90-elevation)`、`theta=degToRad(azimuth)`、`sun.setFromSphericalCoords(1, phi, theta)`。

**后处理**：`EffectComposer` / `RenderPass` / `UnrealBloomPass(resolution, strength, radius, threshold)` /
`SMAAPass(w*pixelRatio, h*pixelRatio)` / `SSAOPass(scene, camera, w, h)`（`kernelRadius`16、`minDistance`0.005、
`maxDistance`0.1、`OUTPUT.Default`）/ `OutputPass`，全部来自 `three/addons/postprocessing/*.js`。
resize：`camera.updateProjectionMatrix(); renderer.setSize(w,h); composer.setSize(w,h);`。
HDR 中间缓冲：`new THREE.WebGLRenderTarget(w,h,{ type: HalfFloatType, format: RGBAFormat, samples: 0 })`。

**几何**：`import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'`；
`mergeGeometries(geos, false)` 不分组（单材质）、`true` 建 group（多材质，内部仍每组一次 draw call）。
`InstancedMesh(geo, mat, count)` 一次 draw call 画全部实例。实测基准：1000 立方体 150ms/1000 draw calls →
合并后 20ms/1 draw call。

**体积云**（可选路线，见下）：视线与云层板片求交 → 步进采样密度 → Beer–Lambert 透射率累积 → 前向散射。
性价比最高的增强项依次是：向太阳方向 5 步指数光步进做自阴影；双瓣 Henyey–Greenstein 相函数（g≈0.7/−0.2）做边缘银边；
Beer–Powder 让薄边变暗厚芯变亮；3 octave 多次散射近似让厚云内部发光；高度衰减覆盖让云顶圆润翻卷；
域扭曲让云形缓慢翻折而非平移；透射率 < 0.01 早退。
**半分辨率渲染 + 时间重投影**（每帧抖动，与邻域钳制后的历史帧按 ~0.88 混合）能让 ~44 步收敛干净。
步数参考：轻量场景 28 步，电影级 100–200 步。

**已验证的 HDR 管线顺序**：`RenderPass(场景) → [体积云半分辨率合成进 HDR] → [阈值 Bloom] → [ACES Filmic tone-map + sRGB 输出]`。
场景与云都渲进 half-float 线性 HDR，色调分级（饱和度/对比 S 曲线、胶片颗粒、径向色差、暗角）放在 tone-map 之后的同一个 ShaderPass。

## 当前实现要点

**无。** 本轮从零开始，仓库里除了交接目录和本简报没有任何代码。

## 测试现状

尚未有测试（本轮是第一个版本）。
**没有已知失败输出可摘录。**
唯一真源将是 `package.json` 的 `scripts.test`；报告里写的通过/失败数量必须从它读出来，不要手抄。

## 本轮范围

做：
- 程序化生成的云上城堡（岛基/岩体、主楼、塔楼、城墙、塔楼锥顶、旗帜等你认为该有的构件），材质程序化。
- 云层（体积 raymarch 或你认为更优的等价方案）与云层之上的天穹/大气。
- 光照与阴影、昼夜或黄金时刻的观感、相机运镜与交互控制。
- 后处理链（辉光 / 色调映射 / 抗锯齿 / 必要的景深或暗角等）。
- 调试信息面板（显示 FPS、draw calls、三角形数）与最少必要的 UI。
- 构建脚本 + 自动化测试（至少覆盖「同种子结构一致」这条）。

不做：见「背景与约束 → 本轮明确不做」。

## 不用管

- `handoff/` 下的交接目录与规格文件（除 `handoff/spec/plan-spec.md` 外，与本轮无关）。
- `research/notes.md` 是本机的调研底稿，**可选查阅**，不必通读；上面「已核实的 API 事实」已摘出要点。
- CI / GitHub Actions / PR 流程（本轮不配置 CI，验收全在本机）。
- 仓库的 `.gitignore`、提交规范。

## 请你输出

见 `handoff/spec/plan-spec.md`。按那 8 节写**完整规划案**：需求与非目标、已读材料与现状、调研来源与技术选型、
模块结构与接口数据流、按依赖顺序的任务拆解（每项含前置条件/步骤/位置/产物/自查/测试/完成条件）、
未知信息的调查入口与分支、本机测试与回归验收要求、首次交付要提交的产物与已知限制。

**特别注意**：
- 这是一个**从零开始的精品项目**，观感是首要目标，但每一步都必须有可判定的自查方式。
- 模块划分与接口签名请**写精确**，我会照着写。
- 体积云有多种做法（半分辨率 raymarch + 时间重投影 / 纯 billboard 层 / 体素 3D 纹理 / 混合），
  请给出**候选对比 + 选定理由 + 放弃方案的代价**，别只给一个方案。
- 城堡的程序化生成策略（参数化体量 vs 拼装零件 vs 混合）同样要给出对比。
- 不要用「自行实现」「完善功能」「按需优化」略过难点；不确定的走第 6 节的调查入口并给分支，**不要编造路径或 API**。
