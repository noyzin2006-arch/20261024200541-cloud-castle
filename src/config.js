/**
 * 场景配置：URL 参数解析与画质预设。
 *
 * 所有解析必须是纯函数：同一串查询串在任何时候都解析出同样的结果，
 * 不依赖时间或随机源，方便浏览器自动化测试复现。
 */

export const DEFAULT_SEED = 20261024;

export const QUALITY_PRESETS = Object.freeze({
  high: { cloudSteps: 28, cloudScale: 0.5, shadowSamples: 5, history: false, bloom: true },
  low: { cloudSteps: 12, cloudScale: 0.35, shadowSamples: 2, history: false, bloom: true }
});

const UINT32_MAX = 4294967295;
const DEFAULT_QUALITY = 'high';
const QUALITY_NAMES = ['high', 'low'];
// 只接受十进制数字串：负号、小数点、指数、十六进制前缀都不是合法 seed 写法。
const SEED_PATTERN = /^[0-9]+$/;

function parseSeed(value) {
  if (typeof value !== 'string' || !SEED_PATTERN.test(value)) {
    return DEFAULT_SEED;
  }
  const numeric = Number(value);
  // 0 是合法种子，只有越界或非整数才回退。
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > UINT32_MAX) {
    return DEFAULT_SEED;
  }
  return numeric >>> 0;
}

function parseQuality(value) {
  // 画质名大小写敏感：URL 里写 'HIGH' 视为无效并回退默认。
  return QUALITY_NAMES.includes(value) ? value : DEFAULT_QUALITY;
}

function parseBoolean(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.toLowerCase();
  return normalized === '1' || normalized === 'true';
}

/**
 * 解析场景参数。支持带 '?' 前缀的标准查询串，也支持裸串 'seed=1&quality=low'。
 *
 * @param {string} search 查询串
 * @returns {{seed: number, quality: 'high'|'low', still: boolean, debug: boolean}}
 */
export function parseSceneOptions(search = '') {
  const raw = typeof search === 'string' ? search : '';
  // URLSearchParams 会自动去掉前导 '?'，且 get() 对同名参数只返回第一个。
  const params = new URLSearchParams(raw);

  return {
    seed: parseSeed(params.get('seed')),
    quality: parseQuality(params.get('quality')),
    still: parseBoolean(params.get('still')),
    debug: parseBoolean(params.get('debug'))
  };
}
