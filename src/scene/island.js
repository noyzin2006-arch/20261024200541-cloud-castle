import * as THREE from 'three';
import { createRng } from '../lib/prng.js';
import { makeIslandGeometry } from './geometry.js';
import { applyFaceColors, mergeColoredParts, mixColor, part } from './vertex-color.js';

const ROCK_DEEP = 0x453b33;
const ROCK_MID = 0x6b5d4e;
const ROCK_UPPER = 0x8a7a66;
const ROCK_TOP = 0x9d8b73;
const MOSS = 0x5f7a3c;
const MOSS_DRY = 0x8d9450;

/**
 * 浮岛：岩体 + 卫星碎岩 + 台地植被 + 垂落的锁链。
 *
 * 岩体的岩层、苔痕全部走 per-face 顶点色，靠法线朝上/朝下与高度分层，
 * 不需要任何贴图；合并后整座岛只占一个 draw call。
 */
export function buildIsland(model, materials) {
  const group = new THREE.Group();
  group.name = 'island';
  const geometries = [];

  const rng = createRng((model.seed ^ 0x9e3779b9) >>> 0);
  const island = model.island;

  // ---------------------------------------------------------------- 岩体
  const rockGeo = makeIslandGeometry(island, model.seed);
  const rockColored = applyFaceColors(
    rockGeo,
    ({ y, normal, index }) => {
      if (normal.y > 0.45) {
        // 台地：苔草与干草交错，按面序号做确定性扰动（不能用 Math.random，会破坏同种子可复现）
        const n = Math.sin(index * 12.9898 + 4.1) * 43758.5453;
        const jitter = n - Math.floor(n);
        const t = 0.28 + 0.46 * jitter + 0.24 * (Math.sin(y * 1.7) * 0.5 + 0.5);
        return mixColor(MOSS, MOSS_DRY, THREE.MathUtils.clamp(t, 0, 1));
      }
      // 岩层：越深越冷越暗
      const h = THREE.MathUtils.clamp((y - island.bottomY) / (island.topY - island.bottomY), 0, 1);
      let c = mixColor(ROCK_DEEP, ROCK_MID, THREE.MathUtils.smoothstep(h, 0.0, 0.55));
      c = mixColor(c.getHex(), ROCK_UPPER, THREE.MathUtils.smoothstep(h, 0.5, 0.88));
      c = mixColor(c.getHex(), ROCK_TOP, THREE.MathUtils.smoothstep(h, 0.86, 1.0));
      // 同一岩层里做±6% 的色差，读起来像自然风化
      const jitter = 0.9 + (((Math.sin(y * 12.9898 + xOf(y) * 78.233) * 43758.5453) % 1) + 1) * 0.05;
      return c.multiplyScalar(jitter);
    },
    { flat: false }
  );
  rockColored.computeVertexNormals();

  const rockMesh = new THREE.Mesh(rockColored, materials.stoneDark);
  rockMesh.name = 'island-rock';
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  group.add(rockMesh);
  geometries.push(rockColored);

  // ---------------------------------------------------------------- 卫星碎岩
  const shardParts = [];
  const shardCount = 5;
  for (let i = 0; i < shardCount; i++) {
    const r = 1.6 + rng() * 3.4;
    const angle = rng() * Math.PI * 2;
    const dist = 34 + rng() * 26;
    const y = -4 - rng() * 22;
    const geo = new THREE.IcosahedronGeometry(r, 1);
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const jitter = 0.68 + rng() * 0.5;
      pos.setXYZ(v, pos.getX(v) * jitter, pos.getY(v) * jitter * 0.8, pos.getZ(v) * jitter);
    }
    geo.computeVertexNormals();
    shardParts.push(
      part(geo, {
        x: Math.cos(angle) * dist,
        y,
        z: Math.sin(angle) * dist,
        rotY: rng() * Math.PI * 2,
        rotZ: (rng() - 0.5) * 0.5,
        colorFn: ({ normal }) => (normal.y > 0.4 ? mixColor(MOSS_DRY, ROCK_TOP, 0.45) : mixColor(ROCK_DEEP, ROCK_MID, 0.5))
      })
    );
  }
  const shardGeo = mergeColoredParts(shardParts);
  const shardMesh = new THREE.Mesh(shardGeo, materials.stoneDark);
  shardMesh.name = 'island-shards';
  shardMesh.castShadow = true;
  group.add(shardMesh);
  geometries.push(shardGeo);

  // ---------------------------------------------------------------- 垂落的锁链
  const chainParts = [];
  for (let i = 0; i < 2; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 6 + rng() * 9;
    const top = -9 - rng() * 4;
    const len = 13 + rng() * 9;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const rod = new THREE.CylinderGeometry(0.075, 0.075, len, 6);
    chainParts.push(part(rod, { x, y: top - len / 2, z }));
    const weight = new THREE.IcosahedronGeometry(0.85, 0);
    chainParts.push(part(weight, { x, y: top - len - 0.5, z }));
  }
  const chainGeo = mergeColoredParts(chainParts);
  const chainMesh = new THREE.Mesh(chainGeo, materials.metal);
  chainMesh.name = 'island-chains';
  chainMesh.castShadow = true;
  group.add(chainMesh);
  geometries.push(chainGeo);

  // ---------------------------------------------------------------- 台地植被
  const treePositions = [];
  const wallHalfX = 20.75;
  const wallHalfZ = 16.75;
  let attempts = 0;
  while (treePositions.length < 26 && attempts < 600) {
    attempts++;
    const angle = rng() * Math.PI * 2;
    const dist = 21.5 + rng() * 8.2;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (Math.abs(x) < wallHalfX + 1.4 && Math.abs(z) < wallHalfZ + 1.4) continue;
    if (Math.hypot(x, z) > island.radius - 1.2) continue;
    treePositions.push({ x, z, s: 0.72 + rng() * 0.75, rot: rng() * Math.PI * 2 });
  }
  // 内庭再补几棵，给中庭一点生气
  for (let i = 0; i < 6; i++) {
    const x = -14 + rng() * 28;
    const z = -13 + rng() * 22;
    if (Math.abs(x) < wallHalfX - 2 && Math.abs(z) < wallHalfZ - 2) {
      treePositions.push({ x, z, s: 0.62 + rng() * 0.5, rot: rng() * Math.PI * 2 });
    }
  }

  if (treePositions.length) {
    const trunkGeo = new THREE.CylinderGeometry(0.17, 0.26, 1.7, 5);
    trunkGeo.translate(0, 0.85, 0);
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, materials.bark, treePositions.length);
    trunkMesh.castShadow = true;

    const crownGeo = new THREE.ConeGeometry(1.0, 2.9, 7);
    crownGeo.translate(0, 3.05, 0);
    const crownMesh = new THREE.InstancedMesh(crownGeo, materials.foliage, treePositions.length);
    crownMesh.castShadow = true;

    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    treePositions.forEach((t, i) => {
      dummy.position.set(t.x, 0, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.set(t.s, t.s, t.s);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);
      crownMesh.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.22 + (i % 5) * 0.012, 0.3 + (i % 3) * 0.06, 0.3 + (i % 4) * 0.035);
      crownMesh.setColorAt(i, tint);
    });
    trunkMesh.instanceMatrix.needsUpdate = true;
    crownMesh.instanceMatrix.needsUpdate = true;
    if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
    trunkMesh.computeBoundingSphere();
    crownMesh.computeBoundingSphere();

    group.add(trunkMesh, crownMesh);
    geometries.push(trunkGeo, crownGeo);
  }

  return { group, geometries };
}

// 伪随机但确定的色差抖动：用 y 的哈希，避免依赖 Math.random
function xOf(y) {
  return Math.sin(y * 78.233) * 43758.5453;
}
