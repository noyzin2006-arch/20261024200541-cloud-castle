import * as THREE from 'three';
import skyVert from '../shaders/sky.vert.glsl?raw';
import skyFrag from '../shaders/sky.frag.glsl?raw';

/**
 * 天空 + 黄金时刻光照。
 *
 * 天穹是自己写的线性 HDR 解析模型（src/shaders/sky.frag.glsl），
 * 不是 three 自带的 Sky 插件——原因见该着色器顶部注释。
 *
 * 三层光：
 *   key  —— 暖色平行光，方向与天穹太阳同源，负责投影与轮廓高光
 *   fill —— 冷色补光，把背光面的暗部提回可读范围
 *   hemi —— 天空蓝自上 + 云海暖色自下，模拟云海把阳光反射回城堡底面
 */
export function createSkyAndLights(scene, { elevation = 15, azimuth = 318 } = {}) {
  const sunDirection = new THREE.Vector3();

  const skyMaterial = new THREE.ShaderMaterial({
    name: 'sky-hdr',
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
      uZenithColor: { value: new THREE.Color(0.03, 0.085, 0.235) },
      uHorizonWarm: { value: new THREE.Color(0.92, 0.44, 0.19) },
      uHorizonCool: { value: new THREE.Color(0.2, 0.32, 0.55) },
      uGroundColor: { value: new THREE.Color(0.1, 0.095, 0.11) },
      uSunColor: { value: new THREE.Color(1.0, 0.72, 0.45) },
      uSunIntensity: { value: 1.0 },
      uDiscIntensity: { value: 26.0 }
    }
  });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(8000, 48, 24), skyMaterial);
  sky.name = 'sky';
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  scene.add(sky);

  const key = new THREE.DirectionalLight(0xffd2a0, 2.15);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -48;
  key.shadow.camera.right = 48;
  key.shadow.camera.top = 48;
  key.shadow.camera.bottom = -48;
  key.shadow.camera.near = 20;
  key.shadow.camera.far = 520;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.32;
  key.target.position.set(0, 6, 0);
  scene.add(key);
  scene.add(key.target);

  // 冷色补光：从相机侧偏左，专门把背光面的暗部提回可读范围
  const fill = new THREE.DirectionalLight(0x9dbcff, 0.5);
  fill.position.set(-80, 46, 60);
  scene.add(fill);

  // 云海把暖光反射回城堡底面，这是「云上」最重要的一条光
  const hemi = new THREE.HemisphereLight(0x9dc4ff, 0xffc98f, 0.78);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0x35405a, 0.16);
  scene.add(ambient);

  function setSun(nextElevation, nextAzimuth) {
    const phi = THREE.MathUtils.degToRad(90 - nextElevation);
    const theta = THREE.MathUtils.degToRad(nextAzimuth);
    sunDirection.setFromSphericalCoords(1, phi, theta).normalize();
    skyMaterial.uniforms.uSunDirection.value.copy(sunDirection);
    key.position.copy(sunDirection).multiplyScalar(260);
    return sunDirection;
  }

  setSun(elevation, azimuth);

  return {
    sky,
    skyMaterial,
    key,
    fill,
    hemi,
    ambient,
    sunDirection,
    setSun,
    dispose() {
      scene.remove(sky, key, key.target, fill, hemi, ambient);
      sky.geometry.dispose();
      skyMaterial.dispose();
      key.shadow.dispose();
      fill.dispose();
      hemi.dispose();
      ambient.dispose();
    }
  };
}
