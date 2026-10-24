# 策展调研笔记 — CLOUDCASTLE-01 云上城堡

> 采集时间：2026-10-24。本机 Agent 采集，供网页规划顾问参考。
> 用途：把「已经核实过的事实」交给网页，避免它重复调研或编造 API。

## 1. 环境事实（本机实测）

| 项 | 值 |
|---|---|
| 平台 | macOS arm64 (darwin 25.4.0) |
| Node | v26.0.0 |
| npm | 11.12.1 |
| Python | 3.9.6（仅供脚本用） |
| 浏览器 | `/Applications/Google Chrome.app` 已安装；无 playwright/puppeteer 全局包 |
| npm registry | 可达 |
| 可用版本 | `three@0.186.1`、`vite@8.3.5`、`playwright@1.64.1` |
| 无 TTY | 是（CI 风格命令） |
| 无付费 API | 是 |
| 网络出口 | 仅 npm registry + GitHub；**运行时不得依赖外部 CDN / 外部素材站** |

## 2. 已核实的 Three.js API（写规划案时可直接引用）

### 2.1 大气天穹（Preetham）

- `import { Sky } from 'three/addons/objects/Sky.js'` —— 构造函数无参，`sky.scale.setScalar(10000)`，`scene.add(sky)`。
- uniforms：`turbidity`(默认 2)、`rayleigh`(1)、`mieCoefficient`(0.005)、`mieDirectionalG`(0.8)、`sunPosition`(Vector3)、`up`(0,1,0)、`showSunDisc`(0/1)。
- 着色器内部：`vBetaM = totalMie(turbidity) * mieCoefficient`；`vSunfade = 1.0 - clamp(1.0 - exp(sunPosition.y/450000.0), 0.0, 1.0)`；
  `rayleighCoefficient = rayleigh - (1.0 * (1.0 - vSunfade))`（太阳落山时天空自动变暗的来源）。
- 物理常量：`rayleighZenithLength = 8.4E3`、`mieZenithLength = 1.25E3`、`lambda = vec3(680E-9, 550E-9, 450E-9)`。
- 太阳光盘：`sundisc = clamp((cosTheta - sunAngularDiameterCos) * 50000.0, 0.0, 1.0)`（硬边抠盘）。
- 太阳位置：官方示例 `webgl_shaders_sky.html` 用球坐标 —— `phi = degToRad(90 - elevation)`、`theta = degToRad(azimuth)`、`sun.setFromSphericalCoords(1, phi, theta)`。

### 2.2 后处理链

```js
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass }        from 'three/addons/postprocessing/SMAAPass.js';
import { SSAOPass }        from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';
```

- `UnrealBloomPass(resolution: Vector2, strength, radius, threshold)` —— 例：`(vec2(w,h), 0.5, 0.4, 0.85)`。
- `SMAAPass(w * renderer.getPixelRatio(), h * renderer.getPixelRatio())`。
- `SSAOPass(scene, camera, w, h)`，`kernelRadius`(16)、`minDistance`(0.005)、`maxDistance`(0.1)；`ssaoPass.output = SSAOPass.OUTPUT.Default`。
- 循环里必须 `composer.render()`，不是 `renderer.render()`。
- resize 三件套：`camera.updateProjectionMatrix(); renderer.setSize(w,h); composer.setSize(w,h);`
- HDR 中间缓冲：`new THREE.WebGLRenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, samples: 0 })`。
- 官方建议：**用 `OutputPass` 取代多个独立调色 pass**（一次 tone-map + sRGB 编码）。
- `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` —— 3 倍屏不封顶会砍半帧率。
- SSAO 与后处理混排时注意 pass 顺序：`RenderPass → SSAO → Bloom → SMAA → OutputPass`。

### 2.3 几何合并 / 实例化

- `import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'`。
- **合并前每个几何体必须 `applyMatrix4` 应用世界变换**，否则全部堆在原点。
- 所有待合并几何体必须**顶点属性结构一致**（position/normal/uv 齐全），否则 merge 直接报错
  —— `ExtrudeGeometry` 与 `PlaneGeometry` 的 uv 通道可能不同。
- `mergeGeometries(geos, false)` = 不按材质分组（要求单一材质）；`mergeGeometries(geos, true)` = 建 group，
  可配材质数组，但内部仍是每组一个 draw call。
- 实测基准（1000 个随机立方体，GTX 1080 Ti）：不合并 150ms / 1000 draw calls → 合并后 20ms / 1 draw call。
- `InstancedMesh(geometry, material, count)`：10000 个立方体，普通 Mesh 约 5fps，实例化 1 draw call 稳定 60fps。

### 2.4 程序化建筑几何的已知坑（threejs-towers 技能总结）

1. **绕序（winding）是最常见的 bug**：侧面顶点顺序反了 → 背面剔除 → 看见墙的内侧。先把一个棱柱做对，再照抄顶点顺序。
2. **`Math.pow(negative, 2.35)` 是 NaN**：屋顶/檐口参数越界会让整个屋顶静默消失。`tc = Math.min(1, t)`，越界部分单独线性处理。
3. **台阶之间要「补台」**：上一层轮廓比下一层内收时，两条轮廓之间的空隙是敞开的——用平面上的环形（annulus）补上，否则塔楼读起来像一摞悬空搁板。
4. **顶盖必须匹配它封的平面**：八角塔上盖一个方顶盖会留下四块楔形朝天口。每种体量要声明自己的平面（4/8/16 边）。
5. **比例比几何更容易出错**：门洞/窗洞的尺寸要和所在墙面尺度匹配。
6. 顶点绕序要能同时支持「远墙内表面可见」。

## 3. 体积云（raymarch）已知技术栈

- 基础形态：视线与「云层板片」求交 → 步进采样密度 → Beer–Lambert 透射率累积 → 前向散射。
- 关键增强项（按性价比排序）：
  - **自阴影**：每个采样点向太阳方向再走 5 步（指数光步进），浓云挡光 → 云顶亮、云底暗。
  - **Henyey–Greenstein 相函数**（双瓣 g≈0.7 / −0.2）→ 边缘银边（silver lining）。
  - **Beer–Powder**：薄边变暗、厚芯变亮，避免云看起来像棉花球。
  - **多次散射近似**（3 octave）：厚云内部发光而不是死黑。
  - **高度衰减覆盖**（height-falling coverage）：云顶呈圆润翻卷状，而不是平切。
  - **域扭曲（domain warping）**：形状缓慢翻折，不只是平移。
  - **早退**：透射率 < 0.01 直接结束步进。
- **Nubis, Evolved**（Guerrilla）Envelope Model：3D Perlin–Worley 噪声纹理 + 侵蚀（erosion）+ 自适应步进 + 各向异性相函数。
- **半分辨率渲染 + 时间重投影**：每帧抖动采样，与「邻域钳制后的历史帧」按 ~0.88 混合，约 44 步即可收敛干净。
- 步数参考：轻量浏览器场景 28 步；电影级 100–200 步 + 多次散射。

## 4. 一条经过验证的 HDR 管线顺序（WaterThreeJS 公开项目的做法）

```
RenderPass(场景) → [体积云半分辨率 raymarch 合成进 HDR] → [阈值 Bloom] → [ACES Filmic tone-map + sRGB 输出]
```

要点：
- 场景与云都渲进 **half-float 线性 HDR** 缓冲，反射/折射/辉光才能能量一致。
- **tone-map 只做一次**，在最后一个合成 pass 里做（`renderer.toneMapping` 与 composer 混用时注意只映射一次）。
- 色彩分级（饱和度/对比度 S 曲线、胶片颗粒、径向色差、暗角）放在 tone-map 之后的同一个 ShaderPass 里。

## 5. 性能预算参考

| 项 | 建议上限 |
|---|---|
| draw calls | ≤ 60（静态几何合并后） |
| 三角形 | ≤ 500k |
| 云层步进 | 44–64（配合半分辨率 + 时间重投影） |
| 阴影贴图 | 1024–2048，`PCFSoftShadowMap` |
| pixelRatio | `min(devicePixelRatio, 2)` |
| 目标帧率 | 桌面 60fps（1920×1080） |

## 6. 竞品参照

用户在 X 上见过同类项目（由其它模型驱动的「云上城堡」演示），评价「做的特好」。
本轮目标明确高于普通 demo：**世界最精致 / 最好 / 效果最炫**。
因此本轮不接受「能跑就算完成」；观感验收靠截图人工判读 + 可量化指标兜底。
