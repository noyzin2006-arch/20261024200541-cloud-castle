import * as THREE from 'three';
import { createCastleModel, validateCastleModel, summarizeCastleModel } from './castle-model.js';
import { buildIsland } from './island.js';
import { buildCastle } from './castle.js';
import { createCastleMaterials } from './materials.js';
import { createSkyAndLights } from './sky-light.js';
import { createCloudNoiseTexture } from './cloud-noise.js';
import { countGeometryVertices } from './geometry.js';

/**
 * 世界装配：数据模型 → 几何 → 材质 → 光照 → 体积云噪声。
 *
 * 本模块不碰 DOM，也不创建 RAF，只负责把一个可渲染的场景交出去。
 */
export function createWorld({ seed = 20261024, elevation = 15, azimuth = 318 } = {}) {
  const scene = new THREE.Scene();
  scene.name = 'cloud-castle-world';

  const model = createCastleModel(seed);
  validateCastleModel(model);

  const materials = createCastleMaterials();

  const island = buildIsland(model, materials);
  const castle = buildCastle(model, materials);
  scene.add(island.group, castle.group);

  // 统计「最终构建产物」里各唯一几何的顶点总数（Sky 还没进场，不计入）
  const geometryVertexCount = countGeometryVertices(scene);
  const summary = summarizeCastleModel(model, geometryVertexCount);

  const lighting = createSkyAndLights(scene, { elevation, azimuth });

  // 体积云噪声纹理：启动时烘一次，之后完全离线
  const noiseTexture = createCloudNoiseTexture(seed);

  let disposed = false;

  return {
    scene,
    model,
    summary,
    materials,
    island,
    castle,
    lighting,
    noiseTexture,
    dispose() {
      if (disposed) return;
      disposed = true;
      lighting.dispose();
      noiseTexture.dispose();
      materials.dispose();
      for (const geo of [...island.geometries, ...castle.geometries]) {
        if (geo && typeof geo.dispose === 'function') geo.dispose();
      }
      scene.clear();
    }
  };
}
