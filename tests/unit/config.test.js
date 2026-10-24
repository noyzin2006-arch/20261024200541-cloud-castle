import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SEED, QUALITY_PRESETS, parseSceneOptions } from '../../src/config.js';

test('配置：空串返回全默认值', () => {
  assert.deepEqual(parseSceneOptions(''), {
    seed: DEFAULT_SEED,
    quality: 'high',
    still: false,
    debug: false
  });
});

test('配置：默认种子与预设常量', () => {
  assert.equal(DEFAULT_SEED, 20261024);
  assert.equal(QUALITY_PRESETS.high.cloudSteps, 28);
  assert.equal(QUALITY_PRESETS.high.cloudScale, 0.5);
  assert.equal(QUALITY_PRESETS.high.shadowSamples, 5);
  assert.equal(QUALITY_PRESETS.high.history, false);
  assert.equal(QUALITY_PRESETS.high.bloom, true);
  assert.equal(QUALITY_PRESETS.low.cloudSteps, 12);
  assert.equal(QUALITY_PRESETS.low.cloudScale, 0.35);
  assert.equal(QUALITY_PRESETS.low.shadowSamples, 2);
  assert.equal(QUALITY_PRESETS.low.history, false);
  assert.equal(QUALITY_PRESETS.low.bloom, true);
});

test('配置：完整查询串正常解析', () => {
  assert.deepEqual(parseSceneOptions('?seed=20261024&quality=high&still=1&debug=1'), {
    seed: 20261024,
    quality: 'high',
    still: true,
    debug: true
  });
});

test('配置：合法 seed 被接受', () => {
  assert.equal(parseSceneOptions('?seed=1').seed, 1);
  assert.equal(parseSceneOptions('?seed=123456').seed, 123456);
  assert.equal(parseSceneOptions('?seed=007').seed, 7);
});

test('配置：非法 seed 回退默认种子', () => {
  const invalid = ['', '-1', 'abc', '1.5', '1e3', 'NaN', '0x10', '+5', ' 1', '4294967296', '99999999999999999999'];
  for (const value of invalid) {
    assert.equal(parseSceneOptions(`?seed=${value}`).seed, DEFAULT_SEED, `seed=${value} 应回退默认`);
  }
  assert.equal(parseSceneOptions('?seed=').seed, DEFAULT_SEED);
});

test('配置：seed = 0 是合法种子', () => {
  assert.equal(parseSceneOptions('?seed=0').seed, 0);
});

test('配置：seed 上界 4294967295 合法，4294967296 回退', () => {
  assert.equal(parseSceneOptions('?seed=4294967295').seed, 4294967295);
  assert.equal(parseSceneOptions('?seed=4294967296').seed, DEFAULT_SEED);
});

test('配置：quality 合法值被接受', () => {
  assert.equal(parseSceneOptions('?quality=high').quality, 'high');
  assert.equal(parseSceneOptions('?quality=low').quality, 'low');
});

test('配置：非法 quality 回退 high 且大小写敏感', () => {
  assert.equal(parseSceneOptions('?quality=medium').quality, 'high');
  assert.equal(parseSceneOptions('?quality=LOW').quality, 'high');
  assert.equal(parseSceneOptions('?quality=High').quality, 'high');
  assert.equal(parseSceneOptions('?quality=').quality, 'high');
});

test('配置：still 与 debug 的布尔取值', () => {
  assert.equal(parseSceneOptions('?still=1').still, true);
  assert.equal(parseSceneOptions('?still=true').still, true);
  assert.equal(parseSceneOptions('?still=TRUE').still, true);
  assert.equal(parseSceneOptions('?still=True').still, true);
  assert.equal(parseSceneOptions('?still=0').still, false);
  assert.equal(parseSceneOptions('?still=false').still, false);
  assert.equal(parseSceneOptions('?still=FALSE').still, false);
  assert.equal(parseSceneOptions('?still=yes').still, false);
  assert.equal(parseSceneOptions('?still=').still, false);
  assert.equal(parseSceneOptions('').still, false);

  assert.equal(parseSceneOptions('?debug=1').debug, true);
  assert.equal(parseSceneOptions('?debug=true').debug, true);
  assert.equal(parseSceneOptions('?debug=TRUE').debug, true);
  assert.equal(parseSceneOptions('?debug=0').debug, false);
  assert.equal(parseSceneOptions('?debug=false').debug, false);
  assert.equal(parseSceneOptions('?debug=maybe').debug, false);
  assert.equal(parseSceneOptions('').debug, false);
});

test('配置：不带 ? 前缀的裸查询串也能解析', () => {
  assert.deepEqual(parseSceneOptions('seed=20261024&quality=low&still=1&debug=1'), {
    seed: 20261024,
    quality: 'low',
    still: true,
    debug: true
  });
  assert.deepEqual(parseSceneOptions('seed=42'), {
    seed: 42,
    quality: 'high',
    still: false,
    debug: false
  });
});

test('配置：重复参数取第一个', () => {
  assert.equal(parseSceneOptions('?seed=1&seed=2').seed, 1);
  assert.equal(parseSceneOptions('?quality=low&quality=high').quality, 'low');
  assert.equal(parseSceneOptions('?still=1&still=0').still, true);
  assert.equal(parseSceneOptions('?debug=0&debug=1').debug, false);
});

test('配置：解析是纯函数，重复调用结果一致', () => {
  const query = '?seed=99&quality=low&still=true&debug=1';
  assert.deepEqual(parseSceneOptions(query), parseSceneOptions(query));
});
