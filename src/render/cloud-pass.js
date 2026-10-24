import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import cloudVert from '../shaders/cloud.vert.glsl?raw';
import cloudFrag from '../shaders/cloud.frag.glsl?raw';
import compositeFrag from '../shaders/cloud-composite.frag.glsl?raw';

/**
 * 体积云 Pass。
 *
 * 两步：
 *   1) 半分辨率 raymarch，把云写进独立的 HalfFloat RT（预乘散射）
 *   2) 全分辨率合成：out = 云散射 + 透射率 * 场景 HDR
 *
 * 场景深度来自 composer 的 readBuffer.depthTexture，用来截断步进，
 * 保证云不会穿到塔和岩石的前面。
 */
export class CloudPass extends Pass {
  constructor(scene, camera, options = {}) {
    super();

    const {
      scale = 0.5,
      steps = 28,
      shadowSamples = 5,
      history = false,
      noiseTexture = null
    } = options;

    this.needsSwap = true;
    this.clear = false;

    this.scene = scene;
    this.camera = camera;
    this.scale = scale;
    this.steps = steps;
    this.shadowSamples = shadowSamples;
    this.history = history;

    this.cloudRT = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false
    });
    this.cloudRT.texture.name = 'cloud-pass.cloud';

    this.cloudMaterial = new THREE.ShaderMaterial({
      name: 'cloud-raymarch',
      vertexShader: cloudVert,
      fragmentShader: cloudFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uNoise: { value: noiseTexture },
        uDepth: { value: null },
        uInvProjection: { value: new THREE.Matrix4() },
        uCameraWorld: { value: new THREE.Matrix4() },
        uCameraPos: { value: new THREE.Vector3() },
        uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(1.0, 0.86, 0.68) },
        uAmbientColor: { value: new THREE.Color(0.34, 0.42, 0.58) },
        uTime: { value: 0 },
        uFrame: { value: 0 },
        uSteps: { value: steps },
        uShadowSamples: { value: shadowSamples },
        uBoxMin: { value: new THREE.Vector3(-190, -30, -190) },
        uBoxMax: { value: new THREE.Vector3(190, -10, 190) },
        uCoverage: { value: 0.66 },
        uDensityScale: { value: 1.0 },
        uSigmaT: { value: 0.16 },
        uSigmaLight: { value: 0.115 },
        uWind: { value: new THREE.Vector2(0.62, 0.28) },
        uDetailStrength: { value: 0.48 }
      }
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      name: 'cloud-composite',
      vertexShader: cloudVert,
      fragmentShader: compositeFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uCloud: { value: this.cloudRT.texture },
        uScene: { value: null },
        uDepth: { value: null },
        uInvProjection: { value: new THREE.Matrix4() },
        uCameraWorld: { value: new THREE.Matrix4() },
        uCameraPos: { value: new THREE.Vector3() },
        uCloudTexel: { value: new THREE.Vector2(1, 1) },
        uDebug: { value: 0 }
      }
    });

    this.quad = new FullScreenQuad(this.cloudMaterial);
    this.frame = 0;
  }

  setSize(width, height) {
    const w = Math.max(1, Math.floor(width * this.scale));
    const h = Math.max(1, Math.floor(height * this.scale));
    this.cloudRT.setSize(w, h);
    this.compositeMaterial.uniforms.uCloudTexel.value.set(1 / w, 1 / h);
  }

  setQuality(preset) {
    if (!preset) return;
    if (preset.cloudSteps !== undefined) {
      this.steps = preset.cloudSteps;
      this.cloudMaterial.uniforms.uSteps.value = preset.cloudSteps;
    }
    if (preset.shadowSamples !== undefined) {
      this.shadowSamples = preset.shadowSamples;
      this.cloudMaterial.uniforms.uShadowSamples.value = preset.shadowSamples;
    }
    if (preset.cloudScale !== undefined) this.scale = preset.cloudScale;
    this.history = preset.history === true;
  }

  /** 云层几何范围（盒）需要随构图调整时用 */
  setBox(min, max) {
    this.cloudMaterial.uniforms.uBoxMin.value.copy(min);
    this.cloudMaterial.uniforms.uBoxMax.value.copy(max);
  }

  setSun(direction, color, ambient) {
    this.cloudMaterial.uniforms.uSunDirection.value.copy(direction).normalize();
    this.cloudMaterial.uniforms.uSunColor.value.copy(color);
    if (ambient) this.cloudMaterial.uniforms.uAmbientColor.value.copy(ambient);
  }

  resetHistory() {
    // 当前实现未启用时间历史（拖影风险高），保留接口以便后续启用
    this.frame = 0;
  }

  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera;
    const cu = this.cloudMaterial.uniforms;
    const xu = this.compositeMaterial.uniforms;

    cu.uInvProjection.value.copy(cam.projectionMatrixInverse);
    cu.uCameraWorld.value.copy(cam.matrixWorld);
    cu.uCameraPos.value.copy(cam.position);
    cu.uDepth.value = readBuffer.depthTexture;
    cu.uFrame.value = this.frame % 64;

    xu.uInvProjection.value.copy(cam.projectionMatrixInverse);
    xu.uCameraWorld.value.copy(cam.matrixWorld);
    xu.uCameraPos.value.copy(cam.position);
    xu.uScene.value = readBuffer.texture;
    xu.uDepth.value = readBuffer.depthTexture;

    const previousTarget = renderer.getRenderTarget();

    // 1) 半分辨率 raymarch
    renderer.setRenderTarget(this.cloudRT);
    renderer.clear(true, false, false);
    this.quad.material = this.cloudMaterial;
    this.quad.render(renderer);

    // 2) 全分辨率合成进 writeBuffer
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.material = this.compositeMaterial;
    this.quad.render(renderer);

    renderer.setRenderTarget(previousTarget);
    this.frame++;
  }

  dispose() {
    this.cloudRT.dispose();
    this.cloudMaterial.dispose();
    this.compositeMaterial.dispose();
    this.quad.dispose();
  }
}
