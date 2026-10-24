import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SHOTS = path.join(ROOT, 'reports', 'screenshots');
const METRICS_FILE = path.join(ROOT, 'reports', 'browser-metrics.json');

const HOST = '127.0.0.1';
const PORT = 4173;
const ORIGIN = `http://${HOST}:${PORT}`;
const SEED = 20261024;

const HERO_VIEW = { position: [66, 46, 78], target: [0, 8, 0] };
const SIDE_VIEW = { position: [-104, 34, 52], target: [0, 6, 0] };

/** 判定外站请求：只允许本地 preview 与 data:/blob: */
function isExternal(url) {
  if (!url) return false;
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return false;
  return !url.startsWith(ORIGIN) && !url.startsWith(`http://localhost:${PORT}`);
}

async function waitForServer(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* 服务还没起来，继续等 */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`preview 服务在 ${timeoutMs}ms 内没有就绪：${url}`);
}

/** 在页面里算 PNG 的亮度直方图与 ROI 统计 */
async function analyzeImage(page, buffer) {
  return page.evaluate(async (base64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const bins = new Array(256).fill(0);
    let sum = 0;
    let sumSq = 0;
    let mid = 0;
    const total = canvas.width * canvas.height;
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      bins[Math.max(0, Math.min(255, Math.round(luma)))]++;
      sum += luma;
      sumSq += luma * luma;
      if (luma >= 20 && luma <= 235) mid++;
    }
    const mean = sum / total;
    const stddev = Math.sqrt(Math.max(0, sumSq / total - mean * mean));

    // 中央 50% 宽 × 60% 高的 ROI
    const rx0 = Math.floor(canvas.width * 0.25);
    const rx1 = Math.floor(canvas.width * 0.75);
    const ry0 = Math.floor(canvas.height * 0.2);
    const ry1 = Math.floor(canvas.height * 0.8);
    let rSum = 0;
    let rSq = 0;
    let rCount = 0;
    for (let y = ry0; y < ry1; y++) {
      for (let x = rx0; x < rx1; x++) {
        const i = (y * canvas.width + x) * 4;
        const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        rSum += luma;
        rSq += luma * luma;
        rCount++;
      }
    }
    const rMean = rSum / rCount;
    const roiStddev = Math.sqrt(Math.max(0, rSq / rCount - rMean * rMean));

    return {
      width: canvas.width,
      height: canvas.height,
      occupiedBins: bins.filter((n) => n > 0).length,
      stddev,
      midrangeRatio: mid / total,
      roiStddev,
      mean
    };
  }, buffer.toString('base64'));
}

test('云上城堡：真实 Chrome 端到端验收', { timeout: 600000 }, async (t) => {
  await mkdir(SHOTS, { recursive: true });

  const preview = spawn('npm', ['run', 'preview', '--', '--host', HOST, '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  preview.stdout.on('data', () => {});
  preview.stderr.on('data', (d) => process.stderr.write(`[preview] ${d}`));

  let browser;
  const consoleErrors = [];
  const pageErrors = [];
  const externalRequests = [];
  const failedRequests = [];

  t.after(async () => {
    if (browser) await browser.close();
    preview.kill('SIGTERM');
    await Promise.race([once(preview, 'exit'), new Promise((r) => setTimeout(r, 4000))]);
    if (!preview.killed) preview.kill('SIGKILL');
  });

  try {
    await waitForServer(ORIGIN);
    await waitForServer(`${ORIGIN}/index.html`);

    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-unsafe-swiftshader']
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));
    page.on('request', (req) => {
      if (isExternal(req.url())) externalRequests.push(req.url());
    });
    page.on('requestfailed', (req) => {
      failedRequests.push({ url: req.url(), error: req.failure() && req.failure().errorText });
    });

    // ---------------------------------------------------------------- 首屏
    const url = `${ORIGIN}/?seed=${SEED}&quality=high&still=1&debug=1`;
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    assert.ok(response, '页面必须有响应');
    assert.equal(response.status(), 200, `页面状态码应为 200，实际 ${response && response.status()}`);

    await page.waitForFunction(() => window.__CLOUDCASTLE__ && window.__CLOUDCASTLE__.snapshot().ready === true, null, {
      timeout: 120000
    });

    const first = await page.evaluate(() => window.__CLOUDCASTLE__.snapshot());
    assert.equal(first.webgl2, true, '必须是 WebGL2');
    assert.ok(first.frames > 0, '必须至少渲染一帧');
    assert.equal(first.seed, SEED, '种子必须来自 URL');
    assert.equal(first.quality, 'high', '画质必须来自 URL');
    assert.ok(first.towerCount >= 6, `塔数量应 ≥6，实际 ${first.towerCount}`);
    assert.ok(first.geometryVertexCount > 0, '几何顶点总数必须为正');
    assert.ok(
      first.towerHeights.every((h) => Number.isFinite(h)),
      '塔高必须全部有限'
    );

    // ---------------------------------------------------------------- 暖机与采样
    await page.waitForFunction((min) => window.__CLOUDCASTLE__.snapshot().frames >= min, 120, { timeout: 180000 });

    const samples = await page.evaluate(async () => {
      const api = window.__CLOUDCASTLE__;
      const out = [];
      await new Promise((resolve) => {
        let last = api.snapshot().frames;
        let guard = 0;
        function tick() {
          guard += 1;
          const s = api.snapshot();
          if (s.frames !== last) {
            last = s.frames;
            out.push({ calls: s.calls, triangles: s.triangles, fps: s.fps, frames: s.frames });
          }
          if (out.length >= 60 || guard > 6000) resolve();
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
      return out;
    });

    assert.ok(samples.length >= 60, `应采到 60 个不同渲染帧，实际 ${samples.length}`);
    const distinctFrames = new Set(samples.map((s) => s.frames)).size;
    assert.ok(distinctFrames >= 60, `采样必须是 60 个不同的帧，实际 ${distinctFrames}`);

    const maxCalls = Math.max(...samples.map((s) => s.calls));
    const maxTriangles = Math.max(...samples.map((s) => s.triangles));
    const fpsValues = samples.map((s) => s.fps).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    const medianFps = fpsValues.length ? fpsValues[Math.floor(fpsValues.length / 2)] : 0;

    assert.ok(maxCalls <= 60, `draw calls 应 ≤60，实际 ${maxCalls}`);
    assert.ok(maxTriangles <= 500000, `三角形应 ≤500000，实际 ${maxTriangles}`);
    assert.ok(
      samples.every((s) => Number.isFinite(s.calls) && Number.isFinite(s.triangles)),
      'calls/triangles 不得为 NaN'
    );

    // ---------------------------------------------------------------- 截图
    const heroBuffer = await page.screenshot({ path: path.join(SHOTS, 'hero-1920x1080.png'), scale: 'css' });
    const heroStats = await analyzeImage(page, heroBuffer);

    await page.evaluate((view) => window.__CLOUDCASTLE__.setCamera(view.position, view.target), SIDE_VIEW);
    await page.waitForTimeout(600);
    const sideBuffer = await page.screenshot({ path: path.join(SHOTS, 'side-1920x1080.png'), scale: 'css' });
    const sideStats = await analyzeImage(page, sideBuffer);

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(900);
    await page.evaluate((view) => window.__CLOUDCASTLE__.setCamera(view.position, view.target), HERO_VIEW);
    await page.waitForTimeout(600);
    const responsiveBuffer = await page.screenshot({
      path: path.join(SHOTS, 'responsive-1366x768.png'),
      scale: 'css'
    });
    const responsiveStats = await analyzeImage(page, responsiveBuffer);

    for (const [name, stats] of [
      ['hero', heroStats],
      ['side', sideStats],
      ['responsive', responsiveStats]
    ]) {
      assert.ok(stats.occupiedBins >= 24, `${name}: 亮度直方图占用桶应 ≥24，实际 ${stats.occupiedBins}`);
      assert.ok(stats.stddev > 25, `${name}: 亮度标准差应 >25，实际 ${stats.stddev.toFixed(2)}`);
      assert.ok(stats.midrangeRatio > 0.35, `${name}: 中间调像素占比应 >35%，实际 ${(stats.midrangeRatio * 100).toFixed(1)}%`);
      assert.ok(stats.roiStddev > 18, `${name}: ROI 标准差应 >18，实际 ${stats.roiStddev.toFixed(2)}`);
    }

    // ---------------------------------------------------------------- 交互与生命周期
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => window.__CLOUDCASTLE__.snapshot().cameraPosition);
    await page.mouse.move(960, 540);
    await page.mouse.down();
    await page.mouse.move(1180, 500, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => window.__CLOUDCASTLE__.snapshot().cameraPosition);
    assert.notDeepEqual(before, after, '拖动必须改变相机位置');

    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(400);

    const pausedState = await page.evaluate(() => window.__CLOUDCASTLE__.pause(true));
    assert.equal(pausedState, true, '暂停必须生效');
    await page.evaluate(() => window.__CLOUDCASTLE__.pause(false));

    assert.equal(await page.evaluate(() => window.__CLOUDCASTLE__.setQuality('low')), true, '切到低画质必须成功');
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => window.__CLOUDCASTLE__.snapshot().quality), 'low', '画质必须真的切过去');
    assert.equal(await page.evaluate(() => window.__CLOUDCASTLE__.setQuality('high')), true, '切回高画质必须成功');
    await page.waitForTimeout(700);

    for (let i = 0; i < 5; i++) {
      await page.setViewportSize({ width: 1600 + i * 40, height: 900 + i * 20 });
      await page.waitForTimeout(220);
    }
    await page.waitForTimeout(500);

    const afterResize = await page.evaluate(() => window.__CLOUDCASTLE__.snapshot());
    assert.ok(afterResize.frames > samples.length, 'resize 之后必须还在继续渲染');

    // ---------------------------------------------------------------- 硬断言
    assert.deepEqual(pageErrors, [], `不允许未捕获异常：${pageErrors.join(' | ')}`);
    assert.deepEqual(consoleErrors, [], `不允许 console.error：${consoleErrors.join(' | ')}`);
    assert.deepEqual(externalRequests, [], `不允许任何外站请求：${externalRequests.join(' | ')}`);
    assert.deepEqual(failedRequests, [], `不允许资源加载失败：${JSON.stringify(failedRequests)}`);

    // ---------------------------------------------------------------- 证据落盘
    const metrics = {
      sourceCommit: process.env.SOURCE_COMMIT || null,
      viewport: { width: 1920, height: 1080, dpr: 1 },
      seed: SEED,
      quality: 'high',
      warmupFrames: 120,
      sampleFrames: samples.length,
      maxDrawCalls: maxCalls,
      maxTriangles,
      medianFps: Number(medianFps.toFixed(2)),
      webgl2: first.webgl2,
      towerCount: first.towerCount,
      towerHeights: first.towerHeights,
      geometryVertexCount: first.geometryVertexCount,
      lumaHistogram: {
        hero: heroStats,
        side: sideStats,
        responsive: responsiveStats
      },
      consoleErrors,
      pageErrors,
      externalRequests,
      failedRequests,
      screenshots: [
        'reports/screenshots/hero-1920x1080.png',
        'reports/screenshots/side-1920x1080.png',
        'reports/screenshots/responsive-1366x768.png'
      ]
    };
    await writeFile(METRICS_FILE, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');

    t.diagnostic(
      `draw calls ≤ ${maxCalls}, 三角形 ≤ ${maxTriangles}, FPS 中位 ${medianFps.toFixed(1)}, ` +
        `塔 ${first.towerCount} 座, 顶点 ${first.geometryVertexCount}`
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});
