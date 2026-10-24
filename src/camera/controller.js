import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const HOME_POSITION = new THREE.Vector3(66, 24, 78);
const HOME_TARGET = new THREE.Vector3(0, 13, 0);
const INTRO_POSITION = new THREE.Vector3(118, 62, 142);
const INTRO_TARGET = new THREE.Vector3(0, 9, 0);
const INTRO_DURATION = 2.5;

/**
 * 相机控制：OrbitControls + 开场运镜 + 键盘。
 *
 * 开场运镜会被用户的任何鼠标操作立刻打断，绝不和手动操作抢镜头。
 */
export function createCameraController(camera, canvas, hooks = {}) {
  const { onPauseChange = null, onReset = null, immediate = false } = hooks;

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.enablePan = false;
  controls.minDistance = 48;
  controls.maxDistance = 165;
  controls.minPolarAngle = 0.3;
  controls.maxPolarAngle = 1.46;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.target.copy(HOME_TARGET);

  const intro = { active: !immediate, elapsed: 0 };

  if (immediate) {
    camera.position.copy(HOME_POSITION);
    controls.target.copy(HOME_TARGET);
    controls.update();
  } else {
    camera.position.copy(INTRO_POSITION);
    controls.target.copy(INTRO_TARGET);
  }

  function cancelIntro() {
    intro.active = false;
  }

  controls.addEventListener('start', cancelIntro);
  canvas.addEventListener('pointerdown', cancelIntro);
  canvas.addEventListener('wheel', cancelIntro, { passive: true });
  canvas.addEventListener('touchstart', cancelIntro, { passive: true });

  let paused = false;

  function setPaused(value) {
    paused = value === true;
    if (onPauseChange) onPauseChange(paused);
  }

  function reset() {
    intro.active = false;
    camera.position.copy(HOME_POSITION);
    controls.target.copy(HOME_TARGET);
    controls.update();
    if (onReset) onReset();
  }

  function onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const key = event.key.toLowerCase();
    if (key === 'r') {
      reset();
    } else if (key === 'p') {
      setPaused(!paused);
    }
  }

  window.addEventListener('keydown', onKeyDown);

  function update(deltaSeconds) {
    if (intro.active) {
      intro.elapsed += Math.min(deltaSeconds, 0.05);
      const k = Math.min(1, intro.elapsed / INTRO_DURATION);
      const eased = 1 - Math.pow(1 - k, 3);
      camera.position.lerpVectors(INTRO_POSITION, HOME_POSITION, eased);
      controls.target.lerpVectors(INTRO_TARGET, HOME_TARGET, eased);
      if (k >= 1) intro.active = false;
    }
    controls.update();
  }

  return {
    controls,
    update,
    reset,
    setPaused,
    get paused() {
      return paused;
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      controls.removeEventListener('start', cancelIntro);
      canvas.removeEventListener('pointerdown', cancelIntro);
      canvas.removeEventListener('wheel', cancelIntro);
      canvas.removeEventListener('touchstart', cancelIntro);
      controls.dispose();
    }
  };
}
