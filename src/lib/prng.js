/**
 * 确定性伪随机数发生器。
 *
 * 场景几何必须可复现：验收要求「固定 seed 的两次结构摘要完全一致」，
 * 因此这里禁用 Math.random()，只提供可重放的伪随机序列。
 */

/**
 * mulberry32：32 位整数状态 + Math.imul 乘法。
 * 选它是因为状态只有 32 位、跨平台结果一致，且不需要引入依赖。
 *
 * @param {number} seed 0..4294967295 的无符号整数种子
 * @returns {() => number} 返回 [0,1) 区间数值的独立序列
 */
export function createRng(seed) {
  // 每次调用都新建闭包状态：同 seed 的多次调用互不干扰，但序列完全相同。
  let state = (Number.isFinite(seed) ? Math.trunc(seed) : 0) >>> 0;

  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    // 末位再 >>> 0 再除以 2^32，保证落在 [0,1) 而不是 [0,1]。
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
