import * as THREE from 'three';

/**
 * 可平铺的 3D 值噪声纹理。
 *
 * 体积云的密度场用 3D 纹理采样，比逐像素算 hash 噪声快一个量级，
 * 而且可以把 Perlin-Worley 的多频段一次性烘进 RGBA 四个通道：
 *   R = 低频 fBm（云团主体）
 *   G = 中频 fBm（翻卷起伏）
 *   B = 高频 fBm（边缘碎化）
 *   A = 最高频（侵蚀细节）
 *
 * 噪声在格点层按 period 取模，保证纹理在三个方向都能无缝平铺，
 * 云层随风漂移时不会看到接缝。
 */

function hash3(x, y, z, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + Math.imul(seed, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function pvalueNoise(x, y, z, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);

  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const z0 = ((zi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const z1 = (z0 + 1) % period;

  const c000 = hash3(x0, y0, z0, seed);
  const c100 = hash3(x1, y0, z0, seed);
  const c010 = hash3(x0, y1, z0, seed);
  const c110 = hash3(x1, y1, z0, seed);
  const c001 = hash3(x0, y0, z1, seed);
  const c101 = hash3(x1, y0, z1, seed);
  const c011 = hash3(x0, y1, z1, seed);
  const c111 = hash3(x1, y1, z1, seed);

  const x00 = c000 + (c100 - c000) * u;
  const x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u;
  const x11 = c011 + (c111 - c011) * u;
  const y0v = x00 + (x10 - x00) * v;
  const y1v = x01 + (x11 - x01) * v;
  return y0v + (y1v - y0v) * w;
}

/**
 * 周期性 fBm。basePeriod 必须整除 size，否则纹理边界会出现接缝。
 */
function fbm(u, v, w, basePeriod, octaves, seed) {
  let sum = 0;
  let norm = 0;
  let amp = 1;
  let freq = 1;
  let period = basePeriod;
  for (let o = 0; o < octaves; o++) {
    sum += amp * pvalueNoise(u * freq, v * freq, w * freq, period, seed + o * 7919);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
    period *= 2;
  }
  return sum / norm;
}

/**
 * 生成体积云用的 3D 噪声纹理。
 * @param {number} seed
 * @param {number} size 必须是 2 的倍数，且能被 8 整除
 */
export function createCloudNoiseTexture(seed = 20261024, size = 64) {
  const data = new Uint8Array(size * size * size * 4);
  const inv = 1 / size;
  const base = seed >>> 0;

  // 每个通道用不同的基准周期与倍频数，保证三个方向都可平铺
  const channels = [
    { period: 8, octaves: 4, seed: base },
    { period: 16, octaves: 3, seed: base ^ 0x9e3779b9 },
    { period: 32, octaves: 2, seed: base ^ 0x85ebca6b },
    { period: 64, octaves: 1, seed: base ^ 0xc2b2ae35 }
  ];

  let i = 0;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        const v = y * inv;
        const w = z * inv;
        for (let c = 0; c < 4; c++) {
          const ch = channels[c];
          const n = fbm(u * ch.period, v * ch.period, w * ch.period, ch.period, ch.octaves, ch.seed);
          data[i++] = Math.max(0, Math.min(255, Math.round(n * 255)));
        }
      }
    }
  }

  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.wrapR = THREE.RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  texture.name = 'cloud-noise-3d';
  return texture;
}
