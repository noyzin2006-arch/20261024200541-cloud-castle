/**
 * 城堡纯数据模型。
 *
 * 本模块只产出数据，不引入 THREE、不触碰 DOM：
 * 几何层（src/scene/geometry.js、castle.js）消费这些数值搭建网格，
 * 这样「同 seed 结构一致」可以在没有渲染环境的单元测试里被判定。
 */

import { createRng } from '../lib/prng.js';

const UINT32_MAX = 4294967295;

const TOWER_STYLES = ['cone', 'spire', 'terrace'];
const TOWER_SIDES = [8, 12];

/**
 * 8 座塔的固定站位：四角、正门两侧、两侧墙中段。
 * 顺序即 id 顺序，摘要函数依赖它保持稳定。
 */
const TOWER_LAYOUT = [
  { id: 'tower-0', x: -20, z: -16, role: 'corner' },
  { id: 'tower-1', x: 20, z: -16, role: 'corner' },
  { id: 'tower-2', x: 20, z: 0, role: 'mid' },
  { id: 'tower-3', x: 20, z: 16, role: 'corner' },
  { id: 'tower-4', x: 4, z: 16, role: 'gate' },
  { id: 'tower-5', x: -4, z: 16, role: 'gate' },
  { id: 'tower-6', x: -20, z: 0, role: 'mid' },
  { id: 'tower-7', x: -20, z: 16, role: 'corner' }
];

/** 各站位的体量档位，保证塔高落在 18~30、半径落在合理区间。 */
const TOWER_PROFILES = {
  corner: { bodyBase: 24, bodySpread: 4, radiusBase: 2.6, radiusSpread: 0.8 },
  mid: { bodyBase: 20, bodySpread: 6, radiusBase: 2.2, radiusSpread: 0.8 },
  gate: { bodyBase: 18, bodySpread: 3, radiusBase: 2.4, radiusSpread: 0.6 }
};

/**
 * 城墙分段。正门在 z=16 断开（x∈(-4,4)），留给门洞与过梁；
 * 两侧墙在 z=0 断开，给中段塔让位。
 * x/z 表示墙段中心线，几何层据此居中放样。
 */
const WALL_LAYOUT = [
  { id: 'wall-0', axis: 'x', x: 0, z: -16, length: 40 },
  { id: 'wall-1', axis: 'z', x: -20, z: -8, length: 16 },
  { id: 'wall-2', axis: 'z', x: -20, z: 8, length: 16 },
  { id: 'wall-3', axis: 'z', x: 20, z: -8, length: 16 },
  { id: 'wall-4', axis: 'z', x: 20, z: 8, length: 16 },
  { id: 'wall-5', axis: 'x', x: -12, z: 16, length: 16 },
  { id: 'wall-6', axis: 'x', x: 12, z: 16, length: 16 }
];

function toUint32(seed) {
  if (typeof seed !== 'number' || !Number.isFinite(seed)) {
    return 0;
  }
  return Math.trunc(seed) >>> 0;
}

/** 量化到 1e-4：摘要需要跨机器稳定的小数位，避免浮点尾差被当成结构差异。 */
function quantize(value) {
  return Math.round(value * 1e4) / 1e4;
}

function pickStyle(value) {
  if (value < 0.45) {
    return 'cone';
  }
  if (value < 0.8) {
    return 'spire';
  }
  return 'terrace';
}

/**
 * 生成城堡的纯数据模型。
 *
 * @param {number} seed 0..4294967295 的无符号整数种子
 * @returns {object} 城堡结构数据
 */
export function createCastleModel(seed) {
  const normalizedSeed = toUint32(seed);
  const rng = createRng(normalizedSeed);

  const wallHeight = quantize(10 + rng() * 2);
  const wallThickness = 1.5;

  const walls = WALL_LAYOUT.map((segment) => ({
    id: segment.id,
    x: segment.x,
    z: segment.z,
    length: segment.length,
    height: wallHeight,
    thickness: wallThickness,
    axis: segment.axis
  }));

  const towers = TOWER_LAYOUT.map((slot) => {
    const profile = TOWER_PROFILES[slot.role];
    return {
      id: slot.id,
      x: slot.x,
      z: slot.z,
      radius: quantize(profile.radiusBase + rng() * profile.radiusSpread),
      bodyHeight: quantize(profile.bodyBase + rng() * profile.bodySpread),
      roofHeight: quantize(5 + rng() * 4),
      sides: rng() < 0.35 ? 12 : 8,
      style: pickStyle(rng())
    };
  });

  return {
    seed: normalizedSeed,
    island: {
      radius: 31,
      topY: 0,
      bottomY: -17,
      rings: 7,
      segments: 64
    },
    keep: {
      x: 0,
      y: 0,
      z: -2,
      width: 14,
      height: 19,
      depth: 11
    },
    walls,
    towers,
    details: {
      battlements: 120 + Math.floor(rng() * 100),
      windows: 40 + Math.floor(rng() * 50),
      flags: 3 + Math.floor(rng() * 7)
    }
  };
}

function requireObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} 必须是对象`);
  }
  return value;
}

function requireFinite(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${path} 必须是有限数字`);
  }
  return value;
}

function requirePositive(value, path) {
  requireFinite(value, path);
  if (value <= 0) {
    throw new TypeError(`${path} 必须大于 0`);
  }
  return value;
}

function requirePositiveInteger(value, path) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${path} 必须是正整数`);
  }
  return value;
}

function requireUint32(value, path) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new TypeError(`${path} 必须是 0~${UINT32_MAX} 的无符号整数`);
  }
  return value;
}

function requireId(value, path) {
  const valid = typeof value === 'number' ? Number.isFinite(value) : typeof value === 'string' && value.length > 0;
  if (!valid) {
    throw new TypeError(`${path} 必须是非空 id`);
  }
  return value;
}

/** 饰件是「个数」，允许为 0，但必须是非负整数。 */
function requireCount(value, path) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`${path} 必须是非负整数计数`);
  }
  return value;
}

/**
 * 校验模型的所有数值字段。
 *
 * @param {object} model 待校验模型
 * @returns {object} 校验通过时原样返回 model
 * @throws {TypeError} 任一字段非法时抛出，消息里带字段路径
 */
export function validateCastleModel(model) {
  requireObject(model, 'castle model');
  requireUint32(model.seed, 'seed');

  const island = requireObject(model.island, 'island');
  requirePositive(island.radius, 'island.radius');
  // topY 是岛面高度，设计上就是 0，因此只要求有限而不要求为正。
  requireFinite(island.topY, 'island.topY');
  requireFinite(island.bottomY, 'island.bottomY');
  if (island.bottomY >= island.topY) {
    throw new TypeError('island.bottomY 必须小于 island.topY');
  }
  requirePositiveInteger(island.rings, 'island.rings');
  requirePositiveInteger(island.segments, 'island.segments');

  const keep = requireObject(model.keep, 'keep');
  requireFinite(keep.x, 'keep.x');
  requireFinite(keep.y, 'keep.y');
  requireFinite(keep.z, 'keep.z');
  requirePositive(keep.width, 'keep.width');
  requirePositive(keep.height, 'keep.height');
  requirePositive(keep.depth, 'keep.depth');

  if (!Array.isArray(model.walls) || model.walls.length === 0) {
    throw new TypeError('walls 必须是非空数组');
  }
  model.walls.forEach((wall, index) => {
    const path = `walls[${index}]`;
    requireObject(wall, path);
    requireId(wall.id, `${path}.id`);
    requireFinite(wall.x, `${path}.x`);
    requireFinite(wall.z, `${path}.z`);
    requirePositive(wall.length, `${path}.length`);
    requirePositive(wall.height, `${path}.height`);
    requirePositive(wall.thickness, `${path}.thickness`);
    if (wall.axis !== 'x' && wall.axis !== 'z') {
      throw new TypeError(`${path}.axis 必须是 'x' 或 'z'`);
    }
  });

  if (!Array.isArray(model.towers) || model.towers.length === 0) {
    throw new TypeError('towers 必须是非空数组');
  }
  model.towers.forEach((tower, index) => {
    const path = `towers[${index}]`;
    requireObject(tower, path);
    requireId(tower.id, `${path}.id`);
    requireFinite(tower.x, `${path}.x`);
    requireFinite(tower.z, `${path}.z`);
    requirePositive(tower.radius, `${path}.radius`);
    requirePositive(tower.bodyHeight, `${path}.bodyHeight`);
    requirePositive(tower.roofHeight, `${path}.roofHeight`);
    if (!TOWER_SIDES.includes(tower.sides)) {
      throw new TypeError(`${path}.sides 必须是 8 或 12`);
    }
    if (!TOWER_STYLES.includes(tower.style)) {
      throw new TypeError(`${path}.style 必须是 'cone' | 'spire' | 'terrace'`);
    }
  });

  const details = requireObject(model.details, 'details');
  requireCount(details.battlements, 'details.battlements');
  requireCount(details.windows, 'details.windows');
  requireCount(details.flags, 'details.flags');

  return model;
}

/** id 里的数字后缀按数值比较，避免 'tower-10' 排在 'tower-2' 前面。 */
function compareIds(left, right) {
  const a = String(left);
  const b = String(right);
  const leftDigits = /(\d+)$/.exec(a);
  const rightDigits = /(\d+)$/.exec(b);
  if (leftDigits && rightDigits) {
    const diff = Number(leftDigits[1]) - Number(rightDigits[1]);
    if (diff !== 0) {
      return diff;
    }
  }
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/**
 * 汇总模型的结构摘要，用于确定性验收。
 *
 * @param {object} model 城堡模型
 * @param {number} geometryVertexCount 最终几何顶点总数，原样透传
 * @returns {{towerCount: number, towerHeights: number[], geometryVertexCount: number}}
 */
export function summarizeCastleModel(model, geometryVertexCount) {
  requireObject(model, 'castle model');
  if (!Array.isArray(model.towers)) {
    throw new TypeError('castle model.towers 必须是数组');
  }

  const ordered = [...model.towers].sort((left, right) => compareIds(left.id, right.id));

  return {
    towerCount: model.towers.length,
    towerHeights: ordered.map((tower) => quantize(tower.bodyHeight)),
    geometryVertexCount
  };
}
