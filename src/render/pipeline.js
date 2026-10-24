import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CloudPass } from './cloud-pass.js';
import { createFilmFinishPass } from './film-pass.js';

/**
 * HDR 渲染管线。
 *
 * 顺序：RenderPass → CloudPass(HDR 合成) → UnrealBloom → SMAA → OutputPass → FilmFinish
 *
 * 关键点：
 * - 场景与云都渲进 half-float 线性 HDR 缓冲，反射/散射/辉光才能能量一致
 * - tone mapping 只在 OutputPass 做一次；本管线不自写 ACES
 * - SMAAPass 在 r186 是无参构造，且官方明确要求排在 OutputPass 之前
 * - composer 是唯一的渲染入口，主循环里绝不能再调 renderer.render(scene, camera)
 */
export function createPipeline(renderer, scene, camera, options = {}) {
  const { quality = 'high', preset = null, noiseTexture = null } = options;

  const size = renderer.getDrawingBufferSize(new THREE.Vector2());

  const depthTexture = new THREE.DepthTexture(size.x, size.y);
  depthTexture.type = THREE.UnsignedIntType;
  depthTexture.format = THREE.DepthFormat;
  depthTexture.minFilter = THREE.NearestFilter;
  depthTexture.magFilter = THREE.NearestFilter;

  const renderTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
    samples: 0,
    depthTexture
  });

  const composer = new EffectComposer(renderer, renderTarget);
  composer.setPixelRatio(renderer.getPixelRatio());

  // EffectComposer 构造时会把 renderTarget clone 一份，而 clone 会共享同一个
  // depthTexture 对象。于是「写 writeBuffer」和「采样 readBuffer.depthTexture」
  // 落在同一个深度附件上 —— 构成反馈回路，采样结果不可预期。
  // 这里给第二块 buffer 单独配一张深度纹理，把回路彻底切断。
  const secondDepthTexture = new THREE.DepthTexture(size.x, size.y);
  secondDepthTexture.type = THREE.UnsignedIntType;
  secondDepthTexture.format = THREE.DepthFormat;
  secondDepthTexture.minFilter = THREE.NearestFilter;
  secondDepthTexture.magFilter = THREE.NearestFilter;
  composer.renderTarget2.depthTexture = secondDepthTexture;

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const cloudPass = new CloudPass(scene, camera, {
    scale: preset?.cloudScale ?? 0.5,
    steps: preset?.cloudSteps ?? 28,
    shadowSamples: preset?.shadowSamples ?? 5,
    history: preset?.history === true,
    noiseTexture
  });
  composer.addPass(cloudPass);

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.32, 0.62, 1.05);
  composer.addPass(bloomPass);

  const smaaPass = new SMAAPass();
  composer.addPass(smaaPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  const filmPass = createFilmFinishPass();
  composer.addPass(filmPass);

  // 多 pass 渲染时 renderer.info 会在每个 pass 结束时自动重置，
  // 必须关掉自动重置、由主循环每帧手动 reset，否则读到的只是最后一个 pass 的数字。
  renderer.info.autoReset = false;

  let currentQuality = quality;

  function resize(width, height, pixelRatio) {
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    cloudPass.setSize(width * pixelRatio, height * pixelRatio);
    bloomPass.setSize(width * pixelRatio, height * pixelRatio);
  }

  function setQuality(name, nextPreset) {
    if (!nextPreset) return;
    currentQuality = name;
    cloudPass.setQuality(nextPreset);
    bloomPass.enabled = nextPreset.bloom !== false;
    const sizeNow = renderer.getDrawingBufferSize(new THREE.Vector2());
    cloudPass.setSize(sizeNow.x, sizeNow.y);
    cloudPass.resetHistory();
  }

  return {
    composer,
    renderPass,
    cloudPass,
    bloomPass,
    smaaPass,
    outputPass,
    filmPass,
    get quality() {
      return currentQuality;
    },
    render(deltaSeconds) {
      composer.render(deltaSeconds);
    },
    resize,
    setQuality,
    dispose() {
      composer.dispose();
      cloudPass.dispose();
      filmPass.material.dispose();
      renderTarget.dispose();
    }
  };
}
