/**
 * 渲染指标。
 *
 * 关键点：EffectComposer 一帧里会跑十几次 render()，而 renderer.info 默认在
 * 每次 render() 结束时自动重置——直接读 info.render.calls 只会拿到最后一个 pass
 * 的数字。必须关掉自动重置（pipeline 里做），每帧开始手动 reset，
 * 渲染结束后再读，才是整条管线的真实成本。
 */
export function createMetrics(renderer, { windowSize = 60 } = {}) {
  const calls = [];
  const triangles = [];
  const deltas = [];

  let totalFrames = 0;
  let fps = 0;
  let lastCalls = 0;
  let lastTriangles = 0;

  return {
    /** 每帧渲染前调用 */
    beginFrame() {
      renderer.info.reset();
    },

    /** 每帧渲染后调用（必须在 composer.render 之后） */
    endFrame(deltaSeconds) {
      const render = renderer.info.render;
      lastCalls = render.calls;
      lastTriangles = render.triangles;

      calls.push(lastCalls);
      triangles.push(lastTriangles);
      if (deltaSeconds > 0 && Number.isFinite(deltaSeconds)) deltas.push(deltaSeconds);
      if (calls.length > windowSize) calls.shift();
      if (triangles.length > windowSize) triangles.shift();
      if (deltas.length > windowSize) deltas.shift();

      totalFrames++;

      const recent = deltas.slice(-Math.min(30, deltas.length));
      if (recent.length) {
        const sum = recent.reduce((a, b) => a + b, 0);
        fps = sum > 0 ? recent.length / sum : 0;
      }
    },

    snapshot() {
      return {
        fps,
        calls: lastCalls,
        triangles: lastTriangles,
        maxCalls: calls.length ? Math.max(...calls) : 0,
        maxTriangles: triangles.length ? Math.max(...triangles) : 0,
        frames: totalFrames
      };
    }
  };
}
