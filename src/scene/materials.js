import * as THREE from 'three';

/**
 * 城堡材质库。
 *
 * 全部程序化，不依赖任何外部贴图：
 * - 石材靠 per-face 顶点色做色差与风化（vertexColors: true）
 * - 屋顶石板靠低粗糙 + 弱金属度出冷蓝反光
 * - 金饰与窗光靠 emissive / metalness 在黄金时刻形成高光层次
 */
export function createCastleMaterials() {
  const stone = new THREE.MeshStandardMaterial({
    name: 'castle-stone',
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.87,
    metalness: 0.0
  });

  // 深色石材：基座、桥墩、台阶，用于把体量的底部压住
  const stoneDark = new THREE.MeshStandardMaterial({
    name: 'castle-stone-dark',
    color: 0x8e8579,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.0
  });

  // 石板屋顶：偏冷的蓝黑，和暖色云海拉开
  const roof = new THREE.MeshStandardMaterial({
    name: 'castle-roof',
    color: 0x2b3242,
    roughness: 0.52,
    metalness: 0.24
  });

  // 金饰：塔尖、窗框、拱圈
  const trim = new THREE.MeshStandardMaterial({
    name: 'castle-trim',
    color: 0xc9963f,
    roughness: 0.3,
    metalness: 0.88
  });

  // 铁件：旗杆、闸门、栏杆
  const metal = new THREE.MeshStandardMaterial({
    name: 'castle-metal',
    color: 0x3c414d,
    roughness: 0.44,
    metalness: 0.92
  });

  // 窗光：窄小但高强度，靠 emissive 而不是几十盏真实点光源
  const windowGlow = new THREE.MeshStandardMaterial({
    name: 'castle-window-glow',
    color: 0x1a1108,
    emissive: 0xffb765,
    emissiveIntensity: 2.4,
    roughness: 0.38,
    metalness: 0.0
  });

  // 旗布：双面，薄片
  const flag = new THREE.MeshStandardMaterial({
    name: 'castle-flag',
    color: 0xa33a44,
    roughness: 0.82,
    metalness: 0.0,
    side: THREE.DoubleSide
  });

  // 树干：台地植被的枝干
  const bark = new THREE.MeshStandardMaterial({
    name: 'castle-bark',
    color: 0x4a3a2c,
    roughness: 0.95,
    metalness: 0.0
  });

  // 树冠：低饱和冷绿，和暖色云海互补
  const foliage = new THREE.MeshStandardMaterial({
    name: 'castle-foliage',
    color: 0x4c6b33,
    roughness: 0.88,
    metalness: 0.0
  });

  const all = [stone, stoneDark, roof, trim, metal, windowGlow, flag, bark, foliage];

  return {
    stone,
    stoneDark,
    roof,
    trim,
    metal,
    windowGlow,
    flag,
    bark,
    foliage,
    dispose() {
      for (const m of all) m.dispose();
    }
  };
}
