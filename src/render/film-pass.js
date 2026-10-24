import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import cloudVert from '../shaders/cloud.vert.glsl?raw';
import filmFrag from '../shaders/film.frag.glsl?raw';

/**
 * 收尾胶片 pass：暗角 + 径向色差 + 颗粒。
 *
 * 排在 OutputPass 之后，只对已经映射到 sRGB 的 LDR 画面生效，
 * 不参与任何 HDR 运算，也不再做色彩空间转换。
 */
export function createFilmFinishPass() {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uGrain: { value: 0.028 },
      uVignette: { value: 1.15 },
      uAberration: { value: 0.42 },
      uSaturation: { value: 1.14 },
      uContrast: { value: 1.07 }
    },
    vertexShader: cloudVert,
    fragmentShader: filmFrag
  });

  // 全屏 pass 必须不吃深度，否则会读到上一帧残留的深度缓冲
  pass.material.depthTest = false;
  pass.material.depthWrite = false;
  pass.material.needsUpdate = true;

  return pass;
}
