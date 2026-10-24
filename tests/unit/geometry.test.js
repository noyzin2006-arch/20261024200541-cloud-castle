import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  makeIslandGeometry,
  makeTowerBody,
  makeMatchingRoof,
  makeRingPlatform,
  makeWallSegment,
  mergeTransformed,
  countGeometryVertices,
} from '../../src/scene/geometry.js';

/* ── 测试夹具与工具 ─────────────────────────────────────────────── */

const TOWER = {
  id: 'tower-1',
  x: 0,
  z: 0,
  radius: 2,
  bodyHeight: 10,
  roofHeight: 4,
  sides: 8,
  style: 'cone',
};

const ISLAND_SPEC = { radius: 31, topY: 0, bottomY: -17, rings: 7, segments: 64 };

/** 取几何体的三角形顶点数组（兼容索引与非索引） */
function trianglesOf(geometry) {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  const triangles = [];
  for (let i = 0; i < count; i += 3) {
    const ids = index
      ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
      : [i, i + 1, i + 2];
    triangles.push(
      ids.map((id) => [position.getX(id), position.getY(id), position.getZ(id)]),
    );
  }
  return triangles;
}

/** 叉积 */
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function norm(v) {
  return Math.hypot(v[0], v[1], v[2]);
}

/** 某一高度上的去重水平位置（顶盖底边这类「边」是按位置算的，不是按重复顶点算） */
function ringPositionsAt(geometry, y, tolerance = 1e-6) {
  const position = geometry.getAttribute('position');
  const seen = new Map();
  for (let i = 0; i < position.count; i += 1) {
    const vy = position.getY(i);
    if (Math.abs(vy - y) > tolerance) continue;
    const x = position.getX(i);
    const z = position.getZ(i);
    if (Math.hypot(x, z) < 1e-6) continue; // 排除封口中心点
    const key = `${Math.round(x * 1e5)}:${Math.round(z * 1e5)}`;
    if (!seen.has(key)) seen.set(key, [x, z]);
  }
  return [...seen.values()];
}

function anglesOf(positions) {
  return positions
    .map(([x, z]) => Math.atan2(z, x))
    .sort((a, b) => a - b);
}

function assertFiniteAttributes(geometry, label) {
  for (const name of ['position', 'normal']) {
    const attribute = geometry.getAttribute(name);
    assert.ok(attribute, `${label}: 缺少 ${name} 属性`);
    for (let i = 0; i < attribute.count; i += 1) {
      for (let c = 0; c < attribute.itemSize; c += 1) {
        assert.ok(
          Number.isFinite(attribute.array[i * attribute.itemSize + c]),
          `${label}: ${name}[${i}] 含 NaN/Infinity`,
        );
      }
    }
  }
}

/* ── 1. 绕序 ─────────────────────────────────────────────────────── */

test('makeTowerBody 侧面绕序：三角形外法线与径向期望点积 > 0', () => {
  const body = makeTowerBody(TOWER);
  const sides = trianglesOf(body).filter((triangle) => {
    const ys = triangle.map((v) => v[1]);
    return Math.min(...ys) < 1e-6 && Math.max(...ys) > TOWER.bodyHeight - 1e-6;
  });

  assert.ok(sides.length >= TOWER.sides * 2, `侧面三角形数量异常：${sides.length}`);

  for (const triangle of sides) {
    const [a, b, c] = triangle;
    const faceNormal = cross(sub(b, a), sub(c, a));
    const centroid = [
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
      (a[2] + b[2] + c[2]) / 3,
    ];
    const radialLength = Math.hypot(centroid[0], centroid[2]);
    assert.ok(radialLength > 1e-9, '侧面三角形重心落在轴上，无法判定朝向');
    const dot =
      (faceNormal[0] * centroid[0] + faceNormal[2] * centroid[2]) / radialLength;
    assert.ok(dot > 0, `侧面三角形绕序反了，点积=${dot}`);
  }
});

test('makeTowerBody 顶盖法线朝 +Y、底盖法线朝 -Y', () => {
  const body = makeTowerBody(TOWER);
  const caps = trianglesOf(body).filter((triangle) => {
    const ys = triangle.map((v) => v[1]);
    return Math.max(...ys) - Math.min(...ys) < 1e-9;
  });
  assert.ok(caps.length >= TOWER.sides * 2);

  for (const triangle of caps) {
    const [a, b, c] = triangle;
    const faceNormal = cross(sub(b, a), sub(c, a));
    const length = norm(faceNormal);
    assert.ok(length > 1e-9, '封口面退化');
    const y = triangle[0][1];
    const expected = y > TOWER.bodyHeight / 2 ? 1 : -1;
    assert.ok(
      (faceNormal[1] / length) * expected > 0.999,
      `封口面法线方向错误：y=${y} ny=${faceNormal[1] / length}`,
    );
  }
});

/* ── 2. 八角塔配八角屋顶 ─────────────────────────────────────────── */

test('makeMatchingRoof 底边边数与塔身一致，且底边半径等于塔身顶半径', () => {
  const body = makeTowerBody(TOWER);
  const roof = makeMatchingRoof(TOWER);

  const bodyBottom = ringPositionsAt(body, 0);
  const bodyTop = ringPositionsAt(body, TOWER.bodyHeight);
  const roofBottom = ringPositionsAt(roof, 0);

  assert.equal(bodyBottom.length, TOWER.sides, '塔身底边顶点数不等于 sides');
  assert.equal(bodyTop.length, TOWER.sides, '塔身顶边顶点数不等于 sides');
  assert.equal(roofBottom.length, TOWER.sides, '顶盖底边顶点数不等于 sides');

  const bodyTopRadius = Math.max(...bodyTop.map(([x, z]) => Math.hypot(x, z)));
  const roofBottomRadius = Math.max(...roofBottom.map(([x, z]) => Math.hypot(x, z)));
  assert.ok(
    Math.abs(roofBottomRadius - bodyTopRadius) < 1e-4,
    `顶盖底边半径 ${roofBottomRadius} 与塔身顶半径 ${bodyTopRadius} 不一致`,
  );

  // 相位角必须对齐，否则顶盖底边会跟塔身上沿错开半格
  const bodyAngles = anglesOf(bodyTop);
  const roofAngles = anglesOf(roofBottom);
  for (let i = 0; i < bodyAngles.length; i += 1) {
    let delta = Math.abs(bodyAngles[i] - roofAngles[i]);
    if (delta > Math.PI) delta = Math.abs(delta - Math.PI * 2);
    assert.ok(delta < 1e-6, `顶盖与塔身相位角错开：${delta}`);
  }

  const roofTop = roof.getAttribute('position');
  let maxY = -Infinity;
  for (let i = 0; i < roofTop.count; i += 1) maxY = Math.max(maxY, roofTop.getY(i));
  assert.ok(Math.abs(maxY - TOWER.roofHeight) < 1e-4, `顶盖高度错误：${maxY}`);
});

/* ── 3. 环台封闭 ─────────────────────────────────────────────────── */

test('makeRingPlatform 内外环顶点数相同且环面有实际面积', () => {
  const lowerRadius = 3;
  const upperRadius = 2;
  const y = 5;
  const platform = makeRingPlatform(TOWER, lowerRadius, upperRadius, y);

  const positions = platform.getAttribute('position');
  assert.ok(positions.count > 0);

  const outer = [];
  const inner = [];
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const radius = Math.hypot(x, z);
    if (Math.abs(positions.getY(i) - y) > 1e-6) continue;
    if (radius > (lowerRadius + upperRadius) / 2) outer.push(radius);
    else inner.push(radius);
  }

  assert.equal(outer.length, TOWER.sides, '外环顶点数不等于 sides');
  assert.equal(inner.length, TOWER.sides, '内环顶点数不等于 sides');
  assert.ok(Math.abs(Math.max(...outer) - lowerRadius) < 1e-6, '外环半径不符');
  assert.ok(Math.abs(Math.max(...inner) - upperRadius) < 1e-6, '内环半径不符');

  // 面积必须非零，且等于同心正多边形环的理论面积
  let area = 0;
  for (const [a, b, c] of trianglesOf(platform)) {
    area += norm(cross(sub(b, a), sub(c, a))) / 2;
  }
  const expectedArea =
    (TOWER.sides / 2) *
    (lowerRadius * lowerRadius - upperRadius * upperRadius) *
    Math.sin((Math.PI * 2) / TOWER.sides);
  assert.ok(area > 1e-6, `环面退化成零面积：${area}`);
  assert.ok(
    Math.abs(area - expectedArea) < expectedArea * 1e-6,
    `环面面积 ${area} 与理论值 ${expectedArea} 不符`,
  );
});

/* ── 4. 合并不堆原点 ─────────────────────────────────────────────── */

test('mergeTransformed 把部件放到各自位置，不堆在原点', () => {
  const boxA = new THREE.BoxGeometry(2, 2, 2);
  const boxB = new THREE.BoxGeometry(2, 2, 2);
  const merged = mergeTransformed([
    { geometry: boxA, matrix: new THREE.Matrix4().makeTranslation(0, 0, 0) },
    { geometry: boxB, matrix: new THREE.Matrix4().makeTranslation(10, 0, 0) },
  ]);

  merged.computeBoundingBox();
  const box = merged.boundingBox;
  assert.equal(box.min.x, -1);
  assert.equal(box.max.x, 11);
  assert.equal(
    box.max.x - box.min.x,
    12,
    '合并后 x 跨度应等于两个位置的距离加上盒宽',
  );

  // 原始几何体不能被就地改写
  boxA.computeBoundingBox();
  assert.equal(boxA.boundingBox.max.x, 1, 'mergeTransformed 原地修改了输入几何体');
});

/* ── 5. 合并失败抛错 ─────────────────────────────────────────────── */

test('mergeTransformed 属性结构不兼容时抛错而不是返回 null', () => {
  const plain = new THREE.BoxGeometry(1, 1, 1);
  const colored = new THREE.BoxGeometry(1, 1, 1);
  colored.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(
      new Float32Array(colored.getAttribute('position').count * 3).fill(1),
      3,
    ),
  );

  assert.throws(
    () =>
      mergeTransformed([
        { geometry: plain, matrix: new THREE.Matrix4() },
        { geometry: colored, matrix: new THREE.Matrix4() },
      ]),
    /属性/,
    '属性结构不兼容时应当抛错',
  );

  // 缺少 position 也要抛错
  assert.throws(
    () => mergeTransformed([{ geometry: new THREE.BufferGeometry(), matrix: new THREE.Matrix4() }]),
    /position/,
  );
});

/* ── 6. finite ───────────────────────────────────────────────────── */

test('所有生成的几何体 position/normal 均无 NaN 与 Infinity', () => {
  const geometries = {
    岛: makeIslandGeometry(ISLAND_SPEC, 20261024),
    塔身: makeTowerBody(TOWER),
    顶盖: makeMatchingRoof(TOWER),
    环台: makeRingPlatform(TOWER, 3, 2, 5),
    墙段: makeWallSegment({
      id: 'w1',
      x: 0,
      z: 0,
      length: 8,
      height: 6,
      thickness: 1.5,
      axis: 'x',
    }),
  };

  for (const [label, geometry] of Object.entries(geometries)) {
    assertFiniteAttributes(geometry, label);
    const position = geometry.getAttribute('position');
    assert.ok(position.count > 0, `${label}: 顶点数为 0`);
  }
});

/* ── 7. 唯一计数 ─────────────────────────────────────────────────── */

test('countGeometryVertices 同一 geometry 实例只算一次', () => {
  const shared = new THREE.BoxGeometry(1, 1, 1);
  const meshA = new THREE.Mesh(shared);
  const meshB = new THREE.Mesh(shared);
  const group = new THREE.Group();
  group.add(meshA);
  group.add(meshB);

  const expected = shared.getAttribute('position').count;
  assert.equal(countGeometryVertices(group), expected, '同一实例被重复计数');
  assert.equal(countGeometryVertices([shared, shared, shared]), expected);
  assert.equal(countGeometryVertices(shared), expected);
});

test('countGeometryVertices 统计不同实例之和', () => {
  const a = new THREE.BoxGeometry(1, 1, 1);
  const b = new THREE.SphereGeometry(1, 8, 6);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(a));
  group.add(new THREE.Mesh(b));
  assert.equal(
    countGeometryVertices(group),
    a.getAttribute('position').count + b.getAttribute('position').count,
  );
});

/* ── 8. 岛与环台 ─────────────────────────────────────────────────── */

test('makeIslandGeometry 顶面法线朝 +Y，底部收窄不是平圆盘', () => {
  const island = makeIslandGeometry(ISLAND_SPEC, 20261024);
  const capTriangles = trianglesOf(island).filter((triangle) =>
    triangle.every((v) => Math.abs(v[1] - ISLAND_SPEC.topY) < 1e-6),
  );
  assert.equal(capTriangles.length, ISLAND_SPEC.segments, '顶面三角形数量不符');

  for (const [a, b, c] of capTriangles) {
    const faceNormal = cross(sub(b, a), sub(c, a));
    const length = norm(faceNormal);
    assert.ok(length > 1e-9, '顶面三角退化');
    assert.ok(faceNormal[1] / length > 0.999, '顶面法线未朝 +Y');
  }

  const position = island.getAttribute('position');
  let maxRadius = 0;
  let bottomRadius = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const radius = Math.hypot(x, z);
    maxRadius = Math.max(maxRadius, radius);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    if (Math.abs(y - ISLAND_SPEC.bottomY) < 1e-6) {
      bottomRadius = Math.max(bottomRadius, radius);
    }
  }

  assert.ok(bottomRadius < ISLAND_SPEC.radius * 0.5, `底部没收窄：${bottomRadius}`);
  assert.ok(maxRadius <= ISLAND_SPEC.radius * 1.001, `最大半径超出设定：${maxRadius}`);
  assert.ok(maxRadius > ISLAND_SPEC.radius * 0.9, `最大半径明显偏小：${maxRadius}`);
  assert.equal(Math.round(maxY * 1e6) / 1e6, ISLAND_SPEC.topY, '顶面高度不符');
  assert.equal(Math.round(minY * 1e6) / 1e6, ISLAND_SPEC.bottomY, '底端高度不符');
});

test('makeIslandGeometry 同一 seed 结果确定，不同 seed 有差异', () => {
  const a = makeIslandGeometry(ISLAND_SPEC, 20261024);
  const b = makeIslandGeometry(ISLAND_SPEC, 20261024);
  const c = makeIslandGeometry(ISLAND_SPEC, 777);
  assert.deepEqual(
    Array.from(a.getAttribute('position').array),
    Array.from(b.getAttribute('position').array),
    '同 seed 必须生成同一座岛',
  );
  assert.notDeepEqual(
    Array.from(a.getAttribute('position').array),
    Array.from(c.getAttribute('position').array),
    '不同 seed 应产生不同结果',
  );
});

/* ── 9. 负数幂不产生 NaN ─────────────────────────────────────────── */

test('roofHeight 为 0 或极小时顶盖几何体仍全部 finite', () => {
  for (const roofHeight of [0, 1e-6, -5]) {
    const tower = { ...TOWER, roofHeight };
    const roof = makeMatchingRoof(tower);
    assertFiniteAttributes(roof, `roofHeight=${roofHeight}`);
  }

  // spire / terrace 两种剖面同样不能出现 NaN
  for (const style of ['spire', 'terrace']) {
    const roof = makeMatchingRoof({ ...TOWER, style, roofHeight: 0 });
    assertFiniteAttributes(roof, style);
  }
});

/* ── 墙段 ────────────────────────────────────────────────────────── */

test('makeWallSegment 六面封闭且位于局部原点', () => {
  const wall = { id: 'w1', x: 5, z: -3, length: 8, height: 6, thickness: 1.5, axis: 'x' };
  const geometry = makeWallSegment(wall);
  const position = geometry.getAttribute('position');

  assert.equal(trianglesOf(geometry).length, 12, '封闭盒体应有 12 个三角形');

  let maxX = -Infinity;
  let minX = Infinity;
  let maxZ = -Infinity;
  let minZ = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < position.count; i += 1) {
    maxX = Math.max(maxX, position.getX(i));
    minX = Math.min(minX, position.getX(i));
    maxZ = Math.max(maxZ, position.getZ(i));
    minZ = Math.min(minZ, position.getZ(i));
    maxY = Math.max(maxY, position.getY(i));
  }

  assert.equal(maxX - minX, wall.length, '沿 axis 的长度不对');
  assert.equal(maxZ - minZ, wall.thickness, '厚度不对');
  assert.equal(maxY, wall.height, '高度不对');
  assert.ok(minX < 0 && maxX > 0, '墙段应位于局部原点，未烘焙 x');
  assert.ok(minZ < 0 && maxZ > 0, '墙段应位于局部原点，未烘焙 z');
});
