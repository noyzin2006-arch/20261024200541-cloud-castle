import * as THREE from 'three';
import { createRng } from '../lib/prng.js';
import { makeTowerBody, makeMatchingRoof, makeRingPlatform, makeWallSegment } from './geometry.js';
import { mergeColoredParts, mixColor, part } from './vertex-color.js';

const STONE_BASE = 0x9c8e7b;
const STONE_LIGHT = 0xc6baa4;
const STONE_DARK = 0x746a5d;
const STONE_WARM = 0xb59d7e;
const SLATE = 0x2b3242;
const GOLD = 0xc9963f;

/** 石材逐面色差：按世界坐标做低频扰动，朝下的面压暗 */
function stoneColorFn({ center, normal }) {
  const h = Math.abs(Math.sin(center.x * 3.17 + center.z * 2.71 + center.y * 1.33));
  let c = mixColor(STONE_BASE, STONE_LIGHT, h * 0.85);
  const w = Math.abs(Math.sin(center.x * 0.83 - center.z * 1.11));
  c = mixColor(c.getHex(), STONE_WARM, w * 0.28);
  if (normal.y < -0.45) c = mixColor(c.getHex(), STONE_DARK, 0.5);
  return c;
}

/** 深色石材（基座、门洞内壁、窗套） */
function darkColorFn({ center }) {
  const h = Math.abs(Math.sin(center.x * 5.1 + center.z * 4.3 + center.y * 2.1));
  return mixColor(0x6a6156, 0x93877a, h * 0.6);
}

/** 从区间集合里挖掉一段 */
function subtractInterval(pieces, lo, hi) {
  const out = [];
  for (const p of pieces) {
    if (hi <= p.min || lo >= p.max) {
      out.push(p);
      continue;
    }
    if (lo > p.min) out.push({ min: p.min, max: lo });
    if (hi < p.max) out.push({ min: hi, max: p.max });
  }
  return out;
}

/**
 * 把一段墙按塔身裁掉重叠部分。
 * 裁完以后：角塔与墙相接处自然合拢，正门两侧的塔之间留下真实门洞。
 */
function trimWallAgainstTowers(wall, towers) {
  let pieces = [{ min: -wall.length / 2, max: wall.length / 2 }];
  for (const t of towers) {
    if (wall.axis === 'x') {
      if (Math.abs(t.z - wall.z) >= t.radius + wall.thickness * 0.5 + 0.05) continue;
      const c = t.x - wall.x;
      pieces = subtractInterval(pieces, c - t.radius, c + t.radius);
    } else {
      if (Math.abs(t.x - wall.x) >= t.radius + wall.thickness * 0.5 + 0.05) continue;
      const c = t.z - wall.z;
      pieces = subtractInterval(pieces, c - t.radius, c + t.radius);
    }
  }
  return pieces.filter((p) => p.max - p.min > 0.6);
}

/**
 * 城堡装配：主堡 + 8 塔 + 连续城墙 + 真实门洞 + 城垛 + 窗光 + 旗帜。
 *
 * 所有静态构件按材质合并，draw call 控制在个位数；
 * 旗帜用一次 InstancedMesh + 顶点着色器波动实现。
 */
export function buildCastle(model, materials) {
  const group = new THREE.Group();
  group.name = 'castle';
  const geometries = [];

  const rng = createRng((model.seed ^ 0x85ebca6b) >>> 0);
  const { towers, walls, keep } = model;

  const stoneParts = [];
  const darkParts = [];
  const roofParts = [];
  const trimParts = [];
  const metalParts = [];
  const glowParts = [];

  // ---------------------------------------------------------------- 主堡
  const keepBaseH = keep.height * 0.72;
  const keepTopH = keep.height - keepBaseH;
  const keepTopW = keep.width * 0.84;
  const keepTopD = keep.depth * 0.84;

  stoneParts.push(
    part(new THREE.BoxGeometry(keep.width, keepBaseH, keep.depth), {
      x: keep.x,
      y: keepBaseH / 2,
      z: keep.z,
      colorFn: stoneColorFn
    })
  );
  stoneParts.push(
    part(new THREE.BoxGeometry(keepTopW, keepTopH, keepTopD), {
      x: keep.x,
      y: keepBaseH + keepTopH / 2,
      z: keep.z,
      colorFn: stoneColorFn
    })
  );
  // 主堡檐口：一圈略挑出的石板
  const eavesR = (keepTopW + 1.3) / Math.SQRT2;
  roofParts.push(
    part(new THREE.CylinderGeometry(eavesR, eavesR, 0.42, 4), {
      x: keep.x,
      y: keepBaseH + keepTopH + 0.2,
      z: keep.z,
      rotY: Math.PI / 4
    })
  );
  const keepRoofH = 7.2;
  roofParts.push(
    part(new THREE.CylinderGeometry(0, eavesR * 0.98, keepRoofH, 4), {
      x: keep.x,
      y: keepBaseH + keepTopH + 0.4 + keepRoofH / 2,
      z: keep.z,
      rotY: Math.PI / 4
    })
  );
  // 屋脊金饰
  trimParts.push(
    part(new THREE.SphereGeometry(0.55, 10, 8), {
      x: keep.x,
      y: keepBaseH + keepTopH + 0.4 + keepRoofH + 0.3,
      z: keep.z
    })
  );
  // 主堡四角小塔
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = keep.x + sx * (keep.width / 2 - 0.55);
      const cz = keep.z + sz * (keep.depth / 2 - 0.55);
      stoneParts.push(
        part(new THREE.CylinderGeometry(0.78, 0.92, keepBaseH + 2.6, 8), {
          x: cx,
          y: (keepBaseH + 2.6) / 2,
          z: cz,
          colorFn: stoneColorFn
        })
      );
      roofParts.push(
        part(new THREE.ConeGeometry(1.22, 3.1, 8), {
          x: cx,
          y: keepBaseH + 2.6 + 1.55,
          z: cz
        })
      );
    }
  }

  // 主堡正立面：门洞 + 三层窗
  const keepFrontZ = keep.z + keep.depth / 2;
  darkParts.push(
    part(new THREE.BoxGeometry(3.4, 4.8, 1.0), {
      x: keep.x,
      y: 2.4,
      z: keepFrontZ + 0.28,
      colorFn: darkColorFn
    })
  );
  trimParts.push(
    part(new THREE.TorusGeometry(1.72, 0.2, 6, 18, Math.PI), {
      x: keep.x,
      y: 4.8,
      z: keepFrontZ + 0.62
    })
  );
  for (let row = 0; row < 3; row++) {
    const y = 8.2 + row * 3.3;
    for (const dx of [-4.4, -1.6, 1.6, 4.4]) {
      const isSide = Math.abs(dx) > 3;
      const w = isSide ? 0.5 : 0.72;
      darkParts.push(
        part(new THREE.BoxGeometry(w + 0.3, 1.5, 0.32), {
          x: keep.x + dx,
          y,
          z: keepFrontZ + 0.1,
          colorFn: darkColorFn
        })
      );
      glowParts.push(
        part(new THREE.BoxGeometry(w, 1.16, 0.2), {
          x: keep.x + dx,
          y,
          z: keepFrontZ + 0.2
        })
      );
    }
  }

  // ---------------------------------------------------------------- 塔楼
  for (const tower of towers) {
    const body = makeTowerBody(tower);
    stoneParts.push(part(body, { x: tower.x, y: 0, z: tower.z, colorFn: stoneColorFn }));

    // 塔基鼓座：加粗一圈，视觉上把塔压进地面
    stoneParts.push(
      part(new THREE.CylinderGeometry(tower.radius * 1.16, tower.radius * 1.24, 1.5, tower.sides), {
        x: tower.x,
        y: 0.75,
        z: tower.z,
        colorFn: stoneColorFn
      })
    );

    if (tower.style === 'terrace') {
      // 平顶塔楼：塔顶走道环 + 一圈垛口（不用锥顶）
      const parapet = makeRingPlatform(tower, tower.radius * 1.02, tower.radius * 0.9, tower.bodyHeight);
      stoneParts.push(part(parapet, { x: tower.x, y: 0, z: tower.z, colorFn: stoneColorFn }));
      const merlons = tower.sides;
      const step = (Math.PI * 2) / merlons;
      const phase = Math.PI / 2 - Math.PI / merlons;
      for (let i = 0; i < merlons; i++) {
        const a = phase + i * step;
        const rr = tower.radius * 0.96;
        stoneParts.push(
          part(new THREE.BoxGeometry(0.86, 1.05, 0.44), {
            x: tower.x + Math.cos(a) * rr,
            y: tower.bodyHeight + 0.52,
            z: tower.z + Math.sin(a) * rr,
            rotY: -a,
            colorFn: stoneColorFn
          })
        );
      }
    } else {
      const roofSpec =
        tower.style === 'spire'
          ? { ...tower, roofHeight: tower.roofHeight * 1.45 }
          : tower;
      const roof = makeMatchingRoof(roofSpec);
      roofParts.push(part(roof, { x: tower.x, y: tower.bodyHeight, z: tower.z }));
      if (tower.style === 'spire') {
        trimParts.push(
          part(new THREE.SphereGeometry(0.42, 10, 8), {
            x: tower.x,
            y: tower.bodyHeight + roofSpec.roofHeight + 0.2,
            z: tower.z
          })
        );
      }
    }

    // 塔身窗：三面各开一扇，窄而高
    for (let level = 0; level < 3; level++) {
      const y = tower.bodyHeight * (0.42 + level * 0.19);
      if (y > tower.bodyHeight - 2.2) break;
      const count = tower.sides >= 12 ? 4 : 3;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + tower.id.length * 0.37 + level * 0.5;
        const rr = tower.radius * 0.99;
        const px = tower.x + Math.cos(a) * rr;
        const pz = tower.z + Math.sin(a) * rr;
        darkParts.push(
          part(new THREE.BoxGeometry(0.62, 1.24, 0.3), {
            x: px,
            y,
            z: pz,
            rotY: -a,
            colorFn: darkColorFn
          })
        );
        glowParts.push(
          part(new THREE.BoxGeometry(0.4, 0.94, 0.18), {
            x: px,
            y,
            z: pz,
            rotY: -a
          })
        );
      }
    }
  }

  // ---------------------------------------------------------------- 城墙
  const frontZ = Math.max(...walls.filter((w) => w.axis === 'x').map((w) => w.z));
  const wallPieces = [];
  for (const wall of walls) {
    const pieces = trimWallAgainstTowers(wall, towers);
    for (const p of pieces) {
      const center = wall.axis === 'x' ? wall.x + (p.min + p.max) / 2 : wall.x;
      const centerZ = wall.axis === 'z' ? wall.z + (p.min + p.max) / 2 : wall.z;
      const length = p.max - p.min;
      wallPieces.push({
        wall,
        center,
        centerZ,
        length,
        height: wall.height,
        thickness: wall.thickness,
        axis: wall.axis
      });
    }
  }

  for (const piece of wallPieces) {
    const spec = {
      id: piece.wall.id,
      x: piece.center,
      z: piece.centerZ,
      length: piece.length,
      height: piece.height,
      thickness: piece.thickness,
      axis: piece.axis
    };
    const seg = makeWallSegment(spec);
    stoneParts.push(part(seg, { x: piece.center, y: 0, z: piece.centerZ, colorFn: stoneColorFn }));

    // 墙基放脚：略宽的一圈
    const plinth = makeWallSegment({ ...spec, height: 1.35, thickness: piece.thickness * 1.45 });
    stoneParts.push(part(plinth, { x: piece.center, y: 0, z: piece.centerZ, colorFn: stoneColorFn }));

    // 城垛：沿墙顶等距排布
    const spacing = 1.78;
    const count = Math.max(2, Math.round(piece.length / spacing));
    const step = piece.length / count;
    for (let i = 0; i < count; i++) {
      const offset = -piece.length / 2 + step * (i + 0.5);
      const x = piece.axis === 'x' ? piece.center + offset : piece.center;
      const z = piece.axis === 'x' ? piece.centerZ : piece.centerZ + offset;
      stoneParts.push(
        part(new THREE.BoxGeometry(piece.axis === 'x' ? step * 0.56 : piece.thickness, 0.95, piece.axis === 'x' ? piece.thickness : step * 0.56), {
          x,
          y: piece.height + 0.47,
          z,
          colorFn: stoneColorFn
        })
      );
    }
  }

  // ---------------------------------------------------------------- 正门
  const gateTowers = towers.filter((t) => t.z > frontZ - 6 && Math.abs(t.x) < 12);
  let gateHalf = 1.6;
  for (const t of gateTowers) {
    const edge = Math.abs(t.x) - t.radius;
    if (edge > 0.25 && edge < gateHalf) gateHalf = edge;
  }
  const gateWidth = gateHalf * 2;
  const gateTop = 6.4;
  const gateWall = walls.find((w) => w.axis === 'x' && Math.abs(w.z - frontZ) < 0.01);
  const wallHeight = gateWall ? gateWall.height : 10.5;

  // 门洞内壁：往里掏一段，让门有进深
  darkParts.push(
    part(new THREE.BoxGeometry(gateWidth + 0.2, gateTop, 2.6), {
      x: 0,
      y: gateTop / 2,
      z: frontZ - 1.1,
      colorFn: darkColorFn
    })
  );
  // 门楣：横跨门洞上方
  stoneParts.push(
    part(new THREE.BoxGeometry(gateWidth + 0.5, wallHeight - gateTop, 1.5), {
      x: 0,
      y: gateTop + (wallHeight - gateTop) / 2,
      z: frontZ,
      colorFn: stoneColorFn
    })
  );
  // 拱圈
  trimParts.push(
    part(new THREE.TorusGeometry(gateHalf * 0.94, 0.22, 6, 20, Math.PI), {
      x: 0,
      y: gateTop,
      z: frontZ + 0.72
    })
  );
  // 闸门铁栏
  const bars = 7;
  for (let i = 0; i < bars; i++) {
    const bx = -gateHalf * 0.82 + (i / (bars - 1)) * gateHalf * 1.64;
    metalParts.push(part(new THREE.BoxGeometry(0.1, gateTop - 0.3, 0.1), { x: bx, y: (gateTop - 0.3) / 2, z: frontZ + 0.45 }));
  }
  for (let i = 0; i < 3; i++) {
    metalParts.push(
      part(new THREE.BoxGeometry(gateWidth * 0.9, 0.1, 0.1), { x: 0, y: 1.4 + i * 2.1, z: frontZ + 0.45 })
    );
  }
  // 门前石阶
  for (let i = 0; i < 5; i++) {
    stoneParts.push(
      part(new THREE.BoxGeometry(gateWidth + 1.2 - i * 0.16, 0.34, 0.72), {
        x: 0,
        y: 0.17 + i * 0.3,
        z: frontZ + 0.9 + i * 0.66,
        colorFn: stoneColorFn
      })
    );
  }

  // ---------------------------------------------------------------- 合并出图
  const stoneGeo = mergeColoredParts(stoneParts);
  const darkGeo = mergeColoredParts(darkParts);
  const roofGeo = mergeColoredParts(roofParts);
  const trimGeo = mergeColoredParts(trimParts);
  const metalGeo = mergeColoredParts(metalParts);
  const glowGeo = mergeColoredParts(glowParts);

  const meshes = [
    [stoneGeo, materials.stone, 'castle-stone'],
    [darkGeo, materials.stoneDark, 'castle-stone-dark'],
    [roofGeo, materials.roof, 'castle-roof'],
    [trimGeo, materials.trim, 'castle-trim'],
    [metalGeo, materials.metal, 'castle-metal'],
    [glowGeo, materials.windowGlow, 'castle-window-glow']
  ];
  for (const [geo, mat, name] of meshes) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.castShadow = name !== 'castle-window-glow';
    mesh.receiveShadow = true;
    group.add(mesh);
    geometries.push(geo);
  }

  // ---------------------------------------------------------------- 旗帜
  const flagCount = Math.min(model.details.flags || 0, towers.length);
  const flagTowers = towers.slice(0, flagCount);
  const flagGeo = new THREE.PlaneGeometry(1.95, 1.15, 14, 6);
  // 自定义属性：0 = 贴杆端，1 = 自由端，用来驱动顶点波动
  const flagU = new Float32Array(flagGeo.attributes.position.count);
  const flagPos = flagGeo.attributes.position;
  for (let i = 0; i < flagPos.count; i++) {
    flagU[i] = (flagPos.getX(i) + 0.975) / 1.95;
  }
  flagGeo.setAttribute('aFlagU', new THREE.BufferAttribute(flagU, 1));
  flagGeo.translate(0.975, 0, 0);

  const flagMesh = new THREE.InstancedMesh(flagGeo, materials.flag, flagTowers.length);
  flagMesh.name = 'castle-flags';
  flagMesh.castShadow = true;
  const dummy = new THREE.Object3D();
  flagTowers.forEach((t, i) => {
    dummy.position.set(t.x, t.bodyHeight + 1.9, t.z);
    dummy.rotation.set(0, Math.atan2(t.x, t.z) + Math.PI / 2, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    flagMesh.setMatrixAt(i, dummy.matrix);
  });
  flagMesh.instanceMatrix.needsUpdate = true;
  flagMesh.computeBoundingSphere();

  // 旗杆并入金属批次
  for (const t of flagTowers) {
    metalParts.push(
      part(new THREE.CylinderGeometry(0.075, 0.075, 4.0, 6), {
        x: t.x,
        y: t.bodyHeight + 1.9,
        z: t.z
      })
    );
  }
  const metalGeo2 = mergeColoredParts(metalParts);
  const metalMesh = new THREE.Mesh(metalGeo2, materials.metal);
  metalMesh.name = 'castle-metal';
  metalMesh.castShadow = true;
  metalMesh.receiveShadow = true;
  group.add(metalMesh);
  geometries.push(metalGeo2, flagGeo);

  group.add(flagMesh);

  // 旗帜波动：改顶点着色器，7 面旗仍然只有 1 个 draw call
  const flagTime = { value: 0 };
  const flagMaterial = materials.flag;
  const prevOnBeforeCompile = flagMaterial.onBeforeCompile;
  flagMaterial.onBeforeCompile = (shader, renderer) => {
    if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer);
    shader.uniforms.uFlagTime = flagTime;
    shader.vertexShader = `attribute float aFlagU;\nuniform float uFlagTime;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float flagPhase = instanceMatrix[3].x * 0.63 + instanceMatrix[3].z * 0.37;
       transformed.z += sin(uFlagTime * 3.1 + aFlagU * 5.4 + flagPhase) * 0.32 * aFlagU;
       transformed.y += sin(uFlagTime * 2.3 + aFlagU * 3.7 + flagPhase) * 0.11 * aFlagU;`
    );
  };
  flagMaterial.customProgramCacheKey = () => 'cloud-castle-flag-wave';

  return {
    group,
    geometries,
    updateFlags(time) {
      flagTime.value = time;
    }
  };
}
