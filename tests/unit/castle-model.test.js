import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../../src/lib/prng.js';
import {
  createCastleModel,
  summarizeCastleModel,
  validateCastleModel
} from '../../src/scene/castle-model.js';

const TOWER_STYLES = ['cone', 'spire', 'terrace'];
const TOWER_SIDES = [8, 12];

/** 只取会随 seed 变化的字段，用来比较两个种子的结构差异。 */
function mutableSignature(model) {
  return JSON.stringify({
    towers: model.towers.map((tower) => [tower.bodyHeight, tower.roofHeight, tower.style, tower.sides]),
    details: model.details
  });
}

test('prng：同 seed 产生完全相同的序列', () => {
  const a = createRng(20261024);
  const b = createRng(20261024);
  const first = Array.from({ length: 32 }, () => a());
  const second = Array.from({ length: 32 }, () => b());
  assert.deepEqual(first, second);
});

test('prng：输出落在 [0,1) 且状态互不干扰', () => {
  const rng = createRng(7);
  for (let i = 0; i < 512; i += 1) {
    const value = rng();
    assert.ok(Number.isFinite(value), 'rng 必须返回有限数');
    assert.ok(value >= 0 && value < 1, `rng 越界: ${value}`);
  }
  // 独立状态：新建同 seed 的 rng 不受已有 rng 消耗影响。
  const fresh = createRng(7);
  const consumed = createRng(7);
  consumed();
  consumed();
  assert.equal(fresh(), createRng(7)());
});

test('模型：同一 seed 两次生成结果 deepEqual', () => {
  const first = createCastleModel(20261024);
  const second = createCastleModel(20261024);
  assert.deepEqual(first, second);
});

test('模型：连续三次同 seed 仍然 deepEqual（不存在 Math.random 差异）', () => {
  const a = createCastleModel(4242);
  const b = createCastleModel(4242);
  const c = createCastleModel(4242);
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
  assert.equal(mutableSignature(a), mutableSignature(c));
});

test('模型：不同 seed 至少有一个可变字段不同', () => {
  const a = createCastleModel(1);
  const b = createCastleModel(2);
  assert.notEqual(mutableSignature(a), mutableSignature(b));
});

test('模型：seed = 0 与 seed = 4294967295 都是合法种子', () => {
  const zero = createCastleModel(0);
  const max = createCastleModel(4294967295);
  assert.equal(zero.seed, 0);
  assert.equal(max.seed, 4294967295);
  assert.equal(zero.towers.length, 8);
  assert.equal(max.towers.length, 8);
  assert.doesNotThrow(() => validateCastleModel(zero));
  assert.doesNotThrow(() => validateCastleModel(max));
  assert.notEqual(mutableSignature(zero), mutableSignature(max));
});

test('模型：恰好 8 座塔，字段合法且全部为正有限数', () => {
  const model = createCastleModel(20261024);
  assert.equal(model.towers.length, 8);
  assert.equal(model.seed, 20261024);

  for (const tower of model.towers) {
    assert.ok(TOWER_SIDES.includes(tower.sides), `非法 sides: ${tower.sides}`);
    assert.ok(TOWER_STYLES.includes(tower.style), `非法 style: ${tower.style}`);
    for (const key of ['x', 'z', 'radius', 'bodyHeight', 'roofHeight']) {
      const value = tower[key];
      assert.equal(typeof value, 'number', `${tower.id}.${key} 必须是数字`);
      assert.ok(Number.isFinite(value), `${tower.id}.${key} 必须 finite`);
    }
    assert.ok(tower.radius > 0, `${tower.id}.radius 必须大于 0`);
    assert.ok(tower.bodyHeight > 0, `${tower.id}.bodyHeight 必须大于 0`);
    assert.ok(tower.roofHeight > 0, `${tower.id}.roofHeight 必须大于 0`);
    assert.ok(tower.bodyHeight >= 18 && tower.bodyHeight <= 30, `${tower.id}.bodyHeight 超出 18~30`);
    assert.ok(tower.roofHeight >= 5 && tower.roofHeight <= 9, `${tower.id}.roofHeight 超出 5~9`);
  }
});

test('模型：塔的站位固定为四角 + 正门两侧 + 两侧墙中段', () => {
  const model = createCastleModel(20261024);
  const positions = model.towers.map((tower) => [tower.x, tower.z]);
  assert.deepEqual(positions, [
    [-20, -16],
    [20, -16],
    [20, 0],
    [20, 16],
    [4, 16],
    [-4, 16],
    [-20, 0],
    [-20, 16]
  ]);
});

test('模型：城墙分段 axis 合法且尺寸为正', () => {
  const model = createCastleModel(20261024);
  assert.ok(model.walls.length > 0);
  for (const wall of model.walls) {
    assert.ok(wall.axis === 'x' || wall.axis === 'z', `非法 axis: ${wall.axis}`);
    assert.ok(Number.isFinite(wall.x) && Number.isFinite(wall.z));
    assert.ok(wall.length > 0, `${wall.id}.length 必须大于 0`);
    assert.ok(wall.height > 0, `${wall.id}.height 必须大于 0`);
    assert.ok(wall.thickness > 0, `${wall.id}.thickness 必须大于 0`);
    assert.ok(wall.height >= 10 && wall.height <= 12, `${wall.id}.height 超出 10~12`);
  }
});

test('模型：details 是数量而非数组', () => {
  const model = createCastleModel(20261024);
  for (const key of ['battlements', 'windows', 'flags']) {
    const value = model.details[key];
    assert.equal(typeof value, 'number', `details.${key} 必须是数字`);
    assert.ok(Number.isInteger(value), `details.${key} 必须是整数`);
    assert.ok(Number.isFinite(value) && value > 0, `details.${key} 必须为正`);
    assert.ok(!Array.isArray(value), `details.${key} 不能是数组`);
  }
});

test('模型：自带模型能通过校验', () => {
  const model = createCastleModel(20261024);
  assert.equal(validateCastleModel(model), model);
});

test('摘要：towerCount 与 towerHeights 符合契约', () => {
  const model = createCastleModel(20261024);
  const summary = summarizeCastleModel(model, 12345);
  assert.equal(summary.towerCount, 8);
  assert.equal(summary.towerHeights.length, 8);
  assert.equal(summary.geometryVertexCount, 12345);
  for (let i = 0; i < 8; i += 1) {
    assert.equal(summary.towerHeights[i], Math.round(model.towers[i].bodyHeight * 1e4) / 1e4);
  }
});

test('摘要：geometryVertexCount 原样透传', () => {
  const model = createCastleModel(20261024);
  assert.equal(summarizeCastleModel(model, 0).geometryVertexCount, 0);
  assert.equal(summarizeCastleModel(model, 987654).geometryVertexCount, 987654);
});

test('校验：缺字段抛 TypeError', () => {
  const model = createCastleModel(20261024);
  const broken = { ...model };
  delete broken.island;
  assert.throws(() => validateCastleModel(broken), TypeError);

  const noTowers = { ...model, towers: undefined };
  assert.throws(() => validateCastleModel(noTowers), TypeError);

  const noDetails = { ...model, details: undefined };
  assert.throws(() => validateCastleModel(noDetails), TypeError);
});

test('校验：NaN / Infinity 抛 TypeError', () => {
  const model = createCastleModel(20261024);
  const nanTower = {
    ...model,
    towers: model.towers.map((tower, index) => (index === 0 ? { ...tower, bodyHeight: NaN } : tower))
  };
  assert.throws(() => validateCastleModel(nanTower), TypeError);

  const infiniteWall = {
    ...model,
    walls: model.walls.map((wall, index) => (index === 0 ? { ...wall, length: Infinity } : wall))
  };
  assert.throws(() => validateCastleModel(infiniteWall), TypeError);

  const nanKeep = { ...model, keep: { ...model.keep, height: NaN } };
  assert.throws(() => validateCastleModel(nanKeep), TypeError);
});

test('校验：0 长度 / 0 高度抛 TypeError', () => {
  const model = createCastleModel(20261024);
  const zeroLength = {
    ...model,
    walls: model.walls.map((wall, index) => (index === 0 ? { ...wall, length: 0 } : wall))
  };
  assert.throws(() => validateCastleModel(zeroLength), TypeError);

  const zeroThickness = {
    ...model,
    walls: model.walls.map((wall, index) => (index === 0 ? { ...wall, thickness: 0 } : wall))
  };
  assert.throws(() => validateCastleModel(zeroThickness), TypeError);

  const zeroDepth = { ...model, keep: { ...model.keep, depth: 0 } };
  assert.throws(() => validateCastleModel(zeroDepth), TypeError);
});

test('校验：非法 sides / style / axis 抛 TypeError', () => {
  const model = createCastleModel(20261024);
  const badSides = {
    ...model,
    towers: model.towers.map((tower, index) => (index === 0 ? { ...tower, sides: 6 } : tower))
  };
  assert.throws(() => validateCastleModel(badSides), TypeError);

  const badStyle = {
    ...model,
    towers: model.towers.map((tower, index) => (index === 0 ? { ...tower, style: 'dome' } : tower))
  };
  assert.throws(() => validateCastleModel(badStyle), TypeError);

  const badAxis = {
    ...model,
    walls: model.walls.map((wall, index) => (index === 0 ? { ...wall, axis: 'y' } : wall))
  };
  assert.throws(() => validateCastleModel(badAxis), TypeError);
});

test('校验：错误消息里指明出错的字段', () => {
  const model = createCastleModel(20261024);
  const broken = {
    ...model,
    towers: model.towers.map((tower, index) => (index === 2 ? { ...tower, bodyHeight: 0 } : tower))
  };
  assert.throws(() => validateCastleModel(broken), (error) => {
    assert.ok(error instanceof TypeError);
    assert.match(error.message, /towers\[2\]\.bodyHeight/);
    return true;
  });
});
