import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng } from '../lib/prng.js';

/**
 * 几何体内核：只负责形体与合并，不管材质、灯光与渲染。
 * 全部函数返回 THREE.BufferGeometry，坐标以自身局部原点为准，
 * 世界位置（塔的 x/z、墙的 x/z）由装配层用矩阵平移，避免烘焙进顶点。
 */

/* ── 常量 ────────────────────────────────────────────────────────── */

/** 塔身收分系数：塔顶半径 = 塔底半径 × 该值。塔身与顶盖共用同一定义才能严丝合缝 */
const TOWER_TAPER = 0.9;

/** 顶盖剖面分段数：段数越多锥面越细腻 */
const ROOF_STEPS = 4;

/* ── 内部工具 ────────────────────────────────────────────────────── */

/**
 * 多边形相位：让一条边正对 +Z。
 * 塔身与顶盖必须用同一个相位，否则顶盖底边会跟塔身上沿错开半格
 */
function polygonPhase(sides) {
  return Math.PI / 2 - Math.PI / sides;
}

/** 塔顶半径：顶盖底边半径必须等于它，否则八角塔会被方形/错位顶盖盖住 */
function towerTopRadius(tower) {
  return tower.radius * TOWER_TAPER;
}

/**
 * 几何构建器：统一收集 position / uv / index。
 * 三角形写入时按「期望外法线」校正绕序——背面剔除的正确性完全由这一步保证，
 * 手推顶点顺序很容易在某一面对上反向，所以逐面检查而不是靠约定。
 */
function createBuilder() {
  const positions = [];
  const uvs = [];
  const indices = [];

  function addVertex(x, y, z, u, v) {
    positions.push(x, y, z);
    uvs.push(u, v);
    return positions.length / 3 - 1;
  }

  /** 按期望外法线写入三角形；点乘为负说明绕序反了，交换后两个索引 */
  function addTriangleIndices(ia, ib, ic, expected) {
    const ax = positions[ia * 3], ay = positions[ia * 3 + 1], az = positions[ia * 3 + 2];
    const bx = positions[ib * 3], by = positions[ib * 3 + 1], bz = positions[ib * 3 + 2];
    const cx = positions[ic * 3], cy = positions[ic * 3 + 1], cz = positions[ic * 3 + 2];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const dot = nx * expected[0] + ny * expected[1] + nz * expected[2];
    if (dot < 0) {
      indices.push(ia, ic, ib);
    } else {
      indices.push(ia, ib, ic);
    }
  }

  /** 顶点描述为 [x, y, z, u, v]，每个三角形独占顶点，硬边着色 */
  function addTriangle(a, b, c, expected) {
    const ia = addVertex(a[0], a[1], a[2], a[3], a[4]);
    const ib = addVertex(b[0], b[1], b[2], b[3], b[4]);
    const ic = addVertex(c[0], c[1], c[2], c[3], c[4]);
    addTriangleIndices(ia, ib, ic, expected);
  }

  /** 四边形拆成两个三角形，共用角点 */
  function addQuad(a, b, c, d, expected) {
    const ia = addVertex(a[0], a[1], a[2], a[3], a[4]);
    const ib = addVertex(b[0], b[1], b[2], b[3], b[4]);
    const ic = addVertex(c[0], c[1], c[2], c[3], c[4]);
    const id = addVertex(d[0], d[1], d[2], d[3], d[4]);
    addTriangleIndices(ia, ib, ic, expected);
    addTriangleIndices(ia, ic, id, expected);
  }

  /** 四边形拆成两个三角形，复用已有顶点（环台这类整圈面必须共用环上的点） */
  function addQuadIndexed(ia, ib, ic, id, expected) {
    addTriangleIndices(ia, ib, ic, expected);
    addTriangleIndices(ia, ic, id, expected);
  }

  /** 三角形复用已有顶点 */
  function addTriangleIndexed(ia, ib, ic, expected) {
    addTriangleIndices(ia, ib, ic, expected);
  }

  /** 以中心点封口的一圈三角面：环上顶点与中心点只建一次 */
  function addCap(ring, center, expected) {
    const centerId = addVertex(center[0], center[1], center[2], center[3], center[4]);
    const ids = ring.map((v) => addVertex(v[0], v[1], v[2], v[3], v[4]));
    for (let i = 0; i < ids.length; i += 1) {
      const j = (i + 1) % ids.length;
      addTriangleIndices(ids[i], ids[j], centerId, expected);
    }
  }

  function build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  return { addVertex, addTriangle, addTriangleIndexed, addQuad, addQuadIndexed, addCap, build };
}

/* ── 浮岛岩体 ────────────────────────────────────────────────────── */

/**
 * 岩体轮廓：上沿平台略收，鼓到最大半径后再向下收锥成尖底（不是平圆盘）
 */
function islandProfile(t) {
  const PLATEAU = 0.9;
  const BULGE_T = 0.2;
  const TIP = 0.06;
  if (t <= BULGE_T) {
    const u = t / BULGE_T;
    return PLATEAU + (1 - PLATEAU) * Math.sin(u * Math.PI * 0.5);
  }
  const u = (t - BULGE_T) / (1 - BULGE_T);
  return 1 - (1 - TIP) * Math.pow(Math.max(u, 0.0), 1.2);
}

/**
 * 角向起伏系数：两个低频正弦叠加，得到连贯的岩体轮廓而不是白噪声锯齿
 */
function wobbleAt(warp, theta) {
  return (
    1 +
    warp.radialAmp * Math.sin(3 * theta + warp.radial[0]) +
    warp.radialAmp * 0.6 * Math.sin(7 * theta + warp.radial[1])
  );
}

/**
 * 浮岛岩体：等角分段 × 高度环，顶面在 topY，底端收尖到 bottomY。
 * 环半径与起伏由 seed 决定，同一 seed 必然得到同一座岛。
 */
export function makeIslandGeometry(islandSpec, seed) {
  const { radius, topY, bottomY } = islandSpec;
  const ringCount = Math.max(2, Math.round(islandSpec.rings));
  const segCount = Math.max(3, Math.round(islandSpec.segments));
  const rng = createRng(seed);
  const builder = createBuilder();

  const totalHeight = topY - bottomY;
  const tipRise = totalHeight * 0.16;
  const ringBottomY = bottomY + tipRise;
  const bandHeight = Math.abs(ringBottomY - topY) / Math.max(1, ringCount - 1);

  // 每环的基准半径、纵向位置与角向起伏参数（同一 seed 完全复现）
  const ringRadius = [];
  const ringY = [];
  const ringWarp = [];
  for (let k = 0; k < ringCount; k += 1) {
    const t = ringCount === 1 ? 0 : k / (ringCount - 1);
    const base = radius * islandProfile(t) * (0.97 + rng() * 0.03);
    const warp = {
      radial: [rng() * Math.PI * 2, rng() * Math.PI * 2],
      vertical: [rng() * Math.PI * 2, rng() * Math.PI * 2],
      radialAmp: 0.02 + rng() * 0.02,
      verticalAmp: bandHeight * (0.08 + rng() * 0.08),
    };
    // 角向起伏会让实际半径超过名义值，所以先取起伏峰值再反推基准半径，
    // 保证「最大半径 = radius」这条约束不会被起伏破坏
    let maxWobble = 0;
    for (let i = 0; i < segCount; i += 1) {
      maxWobble = Math.max(maxWobble, wobbleAt(warp, (i / segCount) * Math.PI * 2));
    }
    ringRadius.push(Math.min(base, radius / maxWobble));
    ringY.push(topY + (ringBottomY - topY) * t);
    ringWarp.push(warp);
  }

  /** 第 k 环第 i 段的顶点位置；顶环严格水平，保证顶盖法线是 +Y */
  function ringPoint(k, i) {
    const warp = ringWarp[k];
    const theta = (i / segCount) * Math.PI * 2;
    const r = ringRadius[k] * wobbleAt(warp, theta);
    const y =
      k === 0
        ? ringY[k]
        : ringY[k] +
          warp.verticalAmp *
            (Math.sin(2 * theta + warp.vertical[0]) + 0.5 * Math.sin(5 * theta + warp.vertical[1]));
    return [Math.cos(theta) * r, y, Math.sin(theta) * r];
  }

  const step = (Math.PI * 2) / segCount;
  const vOf = (y) => (y - bottomY) / (totalHeight === 0 ? 1 : totalHeight);

  // 侧带：逐段独立顶点，形成岩层分层，顶沿与底沿是硬边
  for (let k = 0; k < ringCount - 1; k += 1) {
    for (let i = 0; i < segCount; i += 1) {
      const j = (i + 1) % segCount;
      const mid = (i + 0.5) * step;
      const expected = [Math.cos(mid), 0, Math.sin(mid)];
      const lo = ringPoint(k, i);
      const loNext = ringPoint(k, j);
      const hiNext = ringPoint(k + 1, j);
      const hi = ringPoint(k + 1, i);
      builder.addQuad(
        [lo[0], lo[1], lo[2], i / segCount, vOf(lo[1])],
        [loNext[0], loNext[1], loNext[2], (i + 1) / segCount, vOf(loNext[1])],
        [hiNext[0], hiNext[1], hiNext[2], (i + 1) / segCount, vOf(hiNext[1])],
        [hi[0], hi[1], hi[2], i / segCount, vOf(hi[1])],
        expected,
      );
    }
  }

  // 顶面封口，法线 +Y
  const topRing = [];
  for (let i = 0; i < segCount; i += 1) {
    const p = ringPoint(0, i);
    topRing.push([p[0], p[1], p[2], i / segCount, 1]);
  }
  builder.addCap(topRing, [0, topY, 0, 0.5, 1], [0, 1, 0]);

  // 底端收尖封口，法线朝下外侧
  const bottomIds = [];
  for (let i = 0; i < segCount; i += 1) {
    const p = ringPoint(ringCount - 1, i);
    bottomIds.push(builder.addVertex(p[0], p[1], p[2], i / segCount, 0));
  }
  const tipId = builder.addVertex(0, bottomY, 0, 0.5, 0);
  for (let i = 0; i < segCount; i += 1) {
    const j = (i + 1) % segCount;
    const mid = (i + 0.5) * step;
    builder.addTriangleIndexed(bottomIds[i], bottomIds[j], tipId, [
      Math.cos(mid),
      0,
      Math.sin(mid),
    ]);
  }

  return builder.build();
}

/* ── 塔身与顶盖 ──────────────────────────────────────────────────── */

/**
 * 塔身：sides 边棱柱，从 y=0 到 bodyHeight，底面半径 radius，上端收分。
 * 顶面必须封口，否则从上方看进去是个空壳。
 */
export function makeTowerBody(tower) {
  const sides = Math.max(3, Math.round(tower.sides));
  const phase = polygonPhase(sides);
  const rBottom = tower.radius;
  const rTop = towerTopRadius(tower);
  const height = tower.bodyHeight;
  const step = (Math.PI * 2) / sides;
  const builder = createBuilder();

  // 侧面：每个棱面独立顶点 → 硬边着色，八角塔才不会被平滑成圆柱
  for (let i = 0; i < sides; i += 1) {
    const a0 = phase + i * step;
    const a1 = phase + (i + 1) * step;
    const mid = phase + (i + 0.5) * step;
    const expected = [Math.cos(mid), 0, Math.sin(mid)];
    builder.addQuad(
      [Math.cos(a0) * rBottom, 0, Math.sin(a0) * rBottom, i / sides, 0],
      [Math.cos(a1) * rBottom, 0, Math.sin(a1) * rBottom, (i + 1) / sides, 0],
      [Math.cos(a1) * rTop, height, Math.sin(a1) * rTop, (i + 1) / sides, 1],
      [Math.cos(a0) * rTop, height, Math.sin(a0) * rTop, i / sides, 1],
      expected,
    );
  }

  // 顶盖与底盖各自复制一圈顶点，让上下沿是硬边而不是被平均掉的软棱
  const topRing = [];
  const bottomRing = [];
  for (let i = 0; i < sides; i += 1) {
    const a = phase + i * step;
    topRing.push([Math.cos(a) * rTop, height, Math.sin(a) * rTop, i / sides, 1]);
    bottomRing.push([Math.cos(a) * rBottom, 0, Math.sin(a) * rBottom, i / sides, 0]);
  }
  builder.addCap(topRing, [0, height, 0, 0.5, 1], [0, 1, 0]);
  builder.addCap(bottomRing, [0, 0, 0, 0.5, 0], [0, -1, 0]);

  return builder.build();
}

/** 顶盖剖面收缩系数：cone 直锥、spire 收得更急成针状、terrace 更平缓 */
function roofShrink(style, t) {
  const c = Math.min(Math.max(t, 0), 1);
  if (style === 'spire') {
    return Math.pow(Math.max(1 - c, 0.0), 1.7);
  }
  if (style === 'terrace') {
    return Math.max(1 - Math.pow(Math.max(c, 0.0), 0.7), 0.0);
  }
  return Math.max(1 - c, 0.0);
}

/**
 * 配套顶盖：底边边数与相位必须和塔身完全一致，否则八角塔上会留四块楔形口。
 * 底边半径取塔顶半径，高度取 roofHeight；底边位于 y=0，由装配层抬到塔身上沿。
 */
export function makeMatchingRoof(tower) {
  const sides = Math.max(3, Math.round(tower.sides));
  const phase = polygonPhase(sides);
  const baseRadius = towerTopRadius(tower);
  const height = Math.max(Number.isFinite(tower.roofHeight) ? tower.roofHeight : 0, 0);
  const style = tower.style === 'spire' || tower.style === 'terrace' ? tower.style : 'cone';
  const step = (Math.PI * 2) / sides;
  const builder = createBuilder();

  for (let i = 0; i < sides; i += 1) {
    const a0 = phase + i * step;
    const a1 = phase + (i + 1) * step;
    const mid = phase + (i + 0.5) * step;
    const expected = [Math.cos(mid), 0, Math.sin(mid)];
    const u0 = i / sides;
    const u1 = (i + 1) / sides;

    for (let j = 0; j < ROOF_STEPS; j += 1) {
      const t0 = j / ROOF_STEPS;
      const t1 = (j + 1) / ROOF_STEPS;
      const r0 = baseRadius * roofShrink(style, t0);
      const r1 = baseRadius * roofShrink(style, t1);
      const y0 = height * t0;
      const y1 = height * t1;

      if (j < ROOF_STEPS - 1) {
        builder.addQuad(
          [Math.cos(a0) * r0, y0, Math.sin(a0) * r0, u0, t0],
          [Math.cos(a1) * r0, y0, Math.sin(a1) * r0, u1, t0],
          [Math.cos(a1) * r1, y1, Math.sin(a1) * r1, u1, t1],
          [Math.cos(a0) * r1, y1, Math.sin(a0) * r1, u0, t1],
          expected,
        );
      } else {
        // 最后一段收到顶点，形成尖顶
        const apex = [0, height, 0, (u0 + u1) / 2, 1];
        builder.addTriangle(
          [Math.cos(a0) * r0, y0, Math.sin(a0) * r0, u0, t0],
          [Math.cos(a1) * r0, y0, Math.sin(a1) * r0, u1, t0],
          apex,
          expected,
        );
      }
    }
  }

  return builder.build();
}

/**
 * 收分补台面：内外两个同边数环，中间用环形面连起来。
 * 用来填「上一层比下一层窄」时两条轮廓之间的空隙，不然读起来像一摞悬空搁板。
 */
export function makeRingPlatform(tower, lowerRadius, upperRadius, y) {
  const sides = Math.max(3, Math.round(tower.sides));
  const phase = polygonPhase(sides);
  if (!Number.isFinite(lowerRadius) || !Number.isFinite(upperRadius)) {
    throw new TypeError('makeRingPlatform: 内外半径必须是有限数');
  }
  if (lowerRadius <= 0 || upperRadius <= 0) {
    throw new TypeError('makeRingPlatform: 内外半径必须大于 0');
  }
  if (Math.abs(lowerRadius - upperRadius) < 1e-6) {
    throw new TypeError('makeRingPlatform: 内外半径相同会产生零面积退化面');
  }

  const step = (Math.PI * 2) / sides;
  const builder = createBuilder();

  // 内外环各只建一圈顶点并互相共用：环面是平的，共用顶点既省顶点又让法线整齐
  const outerIds = [];
  const innerIds = [];
  for (let i = 0; i < sides; i += 1) {
    const a = phase + i * step;
    outerIds.push(
      builder.addVertex(
        Math.cos(a) * lowerRadius,
        y,
        Math.sin(a) * lowerRadius,
        i / sides,
        0,
      ),
    );
    innerIds.push(
      builder.addVertex(
        Math.cos(a) * upperRadius,
        y,
        Math.sin(a) * upperRadius,
        i / sides,
        1,
      ),
    );
  }

  for (let i = 0; i < sides; i += 1) {
    const j = (i + 1) % sides;
    builder.addQuadIndexed(outerIds[i], outerIds[j], innerIds[j], innerIds[i], [0, 1, 0]);
  }

  return builder.build();
}

/* ── 墙段 ────────────────────────────────────────────────────────── */

/**
 * 一段矩形墙：沿 axis 方向长 length，高 height，厚 thickness。
 * 六面封闭（只有四个侧面的话从下方/斜看会穿帮），几何体位于局部原点。
 */
export function makeWallSegment(wall) {
  const length = wall.length;
  const height = wall.height;
  const thickness = wall.thickness;
  const alongZ = wall.axis === 'z';
  const hx = alongZ ? thickness / 2 : length / 2;
  const hz = alongZ ? length / 2 : thickness / 2;
  const builder = createBuilder();

  const uX = (x) => (x + hx) / (2 * hx);
  const uZ = (z) => (z + hz) / (2 * hz);
  const vY = (y) => y / (height === 0 ? 1 : height);

  // 底面（法线 -Y）与顶面（+Y）
  builder.addQuad(
    [-hx, 0, hz, uX(-hx), uZ(hz)],
    [hx, 0, hz, uX(hx), uZ(hz)],
    [hx, 0, -hz, uX(hx), uZ(-hz)],
    [-hx, 0, -hz, uX(-hx), uZ(-hz)],
    [0, -1, 0],
  );
  builder.addQuad(
    [-hx, height, -hz, uX(-hx), uZ(-hz)],
    [hx, height, -hz, uX(hx), uZ(-hz)],
    [hx, height, hz, uX(hx), uZ(hz)],
    [-hx, height, hz, uX(-hx), uZ(hz)],
    [0, 1, 0],
  );
  // 两端（-X / +X）
  builder.addQuad(
    [-hx, 0, -hz, uZ(-hz), vY(0)],
    [-hx, 0, hz, uZ(hz), vY(0)],
    [-hx, height, hz, uZ(hz), vY(height)],
    [-hx, height, -hz, uZ(-hz), vY(height)],
    [-1, 0, 0],
  );
  builder.addQuad(
    [hx, 0, hz, uZ(hz), vY(0)],
    [hx, 0, -hz, uZ(-hz), vY(0)],
    [hx, height, -hz, uZ(-hz), vY(height)],
    [hx, height, hz, uZ(hz), vY(height)],
    [1, 0, 0],
  );
  // 两个长侧面（-Z / +Z）
  builder.addQuad(
    [-hx, 0, -hz, uX(-hx), vY(0)],
    [hx, 0, -hz, uX(hx), vY(0)],
    [hx, height, -hz, uX(hx), vY(height)],
    [-hx, height, -hz, uX(-hx), vY(height)],
    [0, 0, -1],
  );
  builder.addQuad(
    [hx, 0, hz, uX(hx), vY(0)],
    [-hx, 0, hz, uX(-hx), vY(0)],
    [-hx, height, hz, uX(-hx), vY(height)],
    [hx, height, hz, uX(hx), vY(height)],
    [0, 0, 1],
  );

  return builder.build();
}

/* ── 合并与统计 ──────────────────────────────────────────────────── */

/**
 * 合并一批带矩阵的几何体。
 * 关键点：必须先 clone + applyMatrix4 再合并，否则所有部件会堆在原点。
 */
export function mergeTransformed(parts) {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new TypeError('mergeTransformed: parts 必须是非空数组');
  }

  const temporaries = [];
  try {
    // 属性结构必须一致，否则 mergeGeometries 会直接返回 null
    let extraSignature = null;
    for (const part of parts) {
      if (!part || !part.geometry || typeof part.geometry.getAttribute !== 'function') {
        throw new TypeError('mergeTransformed: 每个 part 必须包含 BufferGeometry');
      }
      const extra = Object.keys(part.geometry.attributes)
        .filter((name) => name !== 'position' && name !== 'normal' && name !== 'uv')
        .sort()
        .join(',');
      if (extraSignature === null) {
        extraSignature = extra;
      } else if (extra !== extraSignature) {
        throw new Error(`mergeTransformed: 属性结构不兼容（"${extraSignature}" vs "${extra}"）`);
      }
    }

    const prepared = [];
    for (const part of parts) {
      const cloned = part.geometry.clone();
      temporaries.push(cloned);
      cloned.applyMatrix4(part.matrix instanceof THREE.Matrix4 ? part.matrix : new THREE.Matrix4());

      // index / 非 index 统一为非索引，合并时不需要再处理索引偏移
      const geometry = cloned.getIndex() ? cloned.toNonIndexed() : cloned;
      if (geometry !== cloned) temporaries.push(geometry);

      if (!geometry.getAttribute('position')) {
        throw new Error('mergeTransformed: 几何体缺少 position 属性');
      }
      if (!geometry.getAttribute('normal')) {
        geometry.computeVertexNormals();
      }
      if (!geometry.getAttribute('uv')) {
        const count = geometry.getAttribute('position').count;
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
      }
      prepared.push(geometry);
    }

    const merged = mergeGeometries(prepared, false);
    if (!merged) {
      throw new Error('mergeTransformed: mergeGeometries 返回 null（属性或索引结构不兼容）');
    }

    // 合并结果含 NaN/Infinity 会让整个模型静默消失，必须当场抛错
    for (const name of ['position', 'normal', 'uv']) {
      const attribute = merged.getAttribute(name);
      if (!attribute) continue;
      for (let i = 0; i < attribute.count; i += 1) {
        for (let c = 0; c < attribute.itemSize; c += 1) {
          if (!Number.isFinite(attribute.array[i * attribute.itemSize + c])) {
            throw new Error(`mergeTransformed: 合并结果的 ${name} 属性含 NaN/Infinity`);
          }
        }
      }
    }

    return merged;
  } finally {
    // 临时 clone 用完即释放
    for (const temporary of temporaries) {
      if (temporary && typeof temporary.dispose === 'function') temporary.dispose();
    }
  }
}

/**
 * 统计唯一几何体的顶点总数。
 * 同一个 geometry 实例被多个 Mesh 引用时只算一次（原型复用是常见做法）。
 */
export function countGeometryVertices(root) {
  const seen = new Set();
  let total = 0;

  const take = (geometry) => {
    if (!geometry || typeof geometry.getAttribute !== 'function') return;
    if (seen.has(geometry)) return;
    seen.add(geometry);
    const position = geometry.getAttribute('position');
    if (position) total += position.count;
  };

  if (Array.isArray(root)) {
    root.forEach(take);
  } else if (root && typeof root.traverse === 'function') {
    root.traverse((object) => {
      if (object.geometry) take(object.geometry);
    });
  } else {
    take(root);
  }

  return total;
}
