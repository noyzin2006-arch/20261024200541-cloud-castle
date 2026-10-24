import * as THREE from 'three';
import { parseSceneOptions, QUALITY_PRESETS } from './config.js';
import { createWorld } from './scene/world.js';
import { createCameraController } from './camera/controller.js';
import { createPipeline } from './render/pipeline.js';
import { createMetrics } from './lib/metrics.js';
import { createPanel } from './ui/panel.js';

const CLOUD_SUN = new THREE.Color(0xffd2a0).multiplyScalar(1.35);
const CLOUD_AMBIENT = new THREE.Color(0x8fa8cc).multiplyScalar(0.72);

/**
 * 应用入口。
 *
 * 唯一的一帧渲染循环在��里，composer 是唯一渲染入口；
 * 对外暴露 window.__CLOUDCASTLE__ 作为自动化测试的只读门面。
 */
export async function bootstrap() {
  const options = parseSceneOptions(window.location.search);
  const debugParam = new URLSearchParams(window.location.search).get('debug') || '';
  const debugFlags = new Set(debugParam.split(/[,\s]+/).filter(Boolean));
  const canvas = document.getElementById('stage');
  const hud = document.getElementById('hud');
  const boot = document.getElementById('boot');
  const fatal = document.getElementById('fatal');
  const fatalMsg = document.getElementById('fatal-msg');

  function fail(error) {
    if (boot) boot.classList.add('done');
    if (fatal && fatalMsg) {
      fatal.hidden = false;
      fatalMsg.textContent = `${error && error.message ? error.message : String(error)}\n\n${
        error && error.stack ? error.stack : ''
      }`;
    }
    throw error;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance'
    });
  } catch (error) {
    fail(new Error(`无法创建 WebGL 上下文：${error && error.message ? error.message : error}`));
  }

  if (!renderer.capabilities.isWebGL2) {
    fail(new Error('当前浏览器不支持 WebGL2，本场景需要 WebGL2 才能运行。'));
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 12000);
  camera.position.set(66, 24, 78);

  const world = createWorld({ seed: options.seed });
  const controller = createCameraController(camera, canvas, { immediate: options.still === true });
  const pipeline = createPipeline(renderer, world.scene, camera, {
    quality: options.quality,
    preset: QUALITY_PRESETS[options.quality] || QUALITY_PRESETS.high,
    noiseTexture: world.noiseTexture
  });
  pipeline.cloudPass.setSun(world.lighting.sunDirection, CLOUD_SUN, CLOUD_AMBIENT);

  // 调试开关：逐项关掉某个环节，用 A/B 截图定位问题
  if (debugFlags.has('nocloud')) pipeline.cloudPass.enabled = false;
  if (debugFlags.has('nosky')) world.lighting.sky.visible = false;
  if (debugFlags.has('nofilm')) pipeline.filmPass.enabled = false;
  if (debugFlags.has('nobloom')) pipeline.bloomPass.enabled = false;
  if (debugFlags.has('nosmaa')) pipeline.smaaPass.enabled = false;
  if (debugFlags.has('debugdepth')) pipeline.cloudPass.compositeMaterial.uniforms.uDebug.value = 1;
  if (debugFlags.has('debugcloud')) pipeline.cloudPass.compositeMaterial.uniforms.uDebug.value = 2;
  if (debugFlags.has('nooutput')) pipeline.outputPass.enabled = false;
  if (debugFlags.has('noflatshade')) world.lighting.sky.material.flatShading = false;
  const bypassPost = debugFlags.has('nopost');
  if (debugFlags.has('onlysky')) {
    world.island.group.visible = false;
    world.castle.group.visible = false;
  }

  const metrics = createMetrics(renderer);

  let paused = false;
  let elapsed = 0;
  let ready = false;
  let sunStep = 0;

  const panel = createPanel(hud, {
    onPause: () => {
      paused = !paused;
      controller.setPaused(paused);
      panel.setPaused(paused);
    },
    onReset: () => controller.reset(),
    onQuality: (name) => {
      if (!QUALITY_PRESETS[name]) return;
      pipeline.setQuality(name, QUALITY_PRESETS[name]);
      panel.setQuality(name);
    },
    onSun: () => {
      sunStep = (sunStep + 1) % 4;
      const presets = [
        { elevation: 15, azimuth: 318 },
        { elevation: 7, azimuth: 296 },
        { elevation: 28, azimuth: 340 },
        { elevation: 11, azimuth: 268 }
      ];
      const next = presets[sunStep];
      world.lighting.setSun(next.elevation, next.azimuth);
      pipeline.cloudPass.setSun(world.lighting.sunDirection, CLOUD_SUN, CLOUD_AMBIENT);
    }
  });
  panel.update({ fps: 0, calls: 0, triangles: 0, seed: options.seed, quality: options.quality });

  // ---------------------------------------------------------------- 尺寸
  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    if (!width || !height) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    pipeline.resize(width, height, pixelRatio);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- 主循环
  let rafId = 0;
  let lastTime = performance.now();
  let disposed = false;

  function frame(now) {
    if (disposed) return;
    rafId = requestAnimationFrame(frame);

    // 页面失焦时 delta 会很大，钳住避免云和旗帜瞬移
    let delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    if (!Number.isFinite(delta) || delta < 0) delta = 0;

    const step = paused ? 0 : delta;
    if (!options.still) elapsed += step;

    metrics.beginFrame();
    controller.update(step);
    pipeline.cloudPass.cloudMaterial.uniforms.uTime.value = elapsed;
    pipeline.filmPass.uniforms.uTime.value = elapsed;
    world.castle.updateFlags(elapsed);
    if (bypassPost) {
      renderer.setRenderTarget(null);
      renderer.render(world.scene, camera);
    } else {
      pipeline.render(delta);
    }
    metrics.endFrame(delta);

    const stats = metrics.snapshot();
    panel.update({
      fps: stats.fps,
      calls: stats.calls,
      triangles: stats.triangles,
      seed: options.seed,
      quality: pipeline.quality
    });

    if (!ready) {
      ready = true;
      if (boot) {
        boot.classList.add('done');
        window.setTimeout(() => boot.remove && boot.remove(), 1000);
      }
    }
  }

  rafId = requestAnimationFrame(frame);

  // ---------------------------------------------------------------- 测试门面
  window.__CLOUDCASTLE__ = {
    snapshot() {
      const stats = metrics.snapshot();
      return {
        ready,
        webgl2: renderer.capabilities.isWebGL2,
        seed: options.seed,
        quality: pipeline.quality,
        frames: stats.frames,
        fps: stats.fps,
        calls: stats.calls,
        triangles: stats.triangles,
        maxCalls: stats.maxCalls,
        maxTriangles: stats.maxTriangles,
        towerCount: world.summary.towerCount,
        towerHeights: world.summary.towerHeights,
        geometryVertexCount: world.summary.geometryVertexCount,
        cameraPosition: camera.position.toArray(),
        paused,
        time: elapsed,
        hasDepthTexture: !!(pipeline.composer.readBuffer && pipeline.composer.readBuffer.depthTexture)
      };
    },
    setQuality(name) {
      if (!QUALITY_PRESETS[name]) return false;
      pipeline.setQuality(name, QUALITY_PRESETS[name]);
      panel.setQuality(name);
      return true;
    },
    resetCamera() {
      controller.reset();
    },
    setCamera(position, target) {
      if (Array.isArray(position) && position.length === 3) {
        camera.position.set(position[0], position[1], position[2]);
      }
      if (Array.isArray(target) && target.length === 3) {
        controller.controls.target.set(target[0], target[1], target[2]);
      }
      controller.controls.update();
      return camera.position.toArray();
    },
    pause(value) {
      paused = value === true;
      controller.setPaused(paused);
      panel.setPaused(paused);
      return paused;
    }
  };

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
      controller.dispose();
      pipeline.dispose();
      world.dispose();
      panel.dispose();
      renderer.dispose();
      delete window.__CLOUDCASTLE__;
    }
  };
}

// 启动
bootstrap().catch((error) => {
  const fatal = document.getElementById('fatal');
  const fatalMsg = document.getElementById('fatal-msg');
  const boot = document.getElementById('boot');
  if (boot) boot.classList.add('done');
  if (fatal && fatalMsg) {
    fatal.hidden = false;
    fatalMsg.textContent = `${error && error.message ? error.message : String(error)}\n\n${
      error && error.stack ? error.stack : ''
    }`;
  }
  // eslint-disable-next-line no-console
  console.error(error);
});
