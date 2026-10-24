import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 程序化顶点色工具。
 *
 * 石材的色差、风化、苔痕全部靠 per-face 顶点色表达：
 * - 好处：零贴图、零外部资源，且能把成百上千个部件合进一个 draw call
 * - 代价：合并前必须保证每个几何体的顶点属性结构一致（position/normal/uv/color）
 */

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _n = new THREE.Vector3();
const _mid = new THREE.Vector3();

/**
 * 给几何体刷 per-face 顶点色。
 * @param {THREE.BufferGeometry} geometry
 * @param {(face: {y:number, normal:THREE.Vector3, index:number, center:THREE.Vector3}) => THREE.Color} colorFn
 * @param {{flat?:boolean}} [options] flat=true 时重算为逐面法线（硬边石作），默认保留原法线
 * @returns {THREE.BufferGeometry} 非索引几何体，带 color 属性
 */
export function applyFaceColors(geometry, colorFn, options = {}) {
  const flat = options.flat === true;
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();

  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();

  for (let i = 0; i < pos.count; i += 3) {
    _a.fromBufferAttribute(pos, i);
    _b.fromBufferAttribute(pos, i + 1);
    _c.fromBufferAttribute(pos, i + 2);
    _ab.subVectors(_b, _a);
    _ac.subVectors(_c, _a);
    _n.crossVectors(_ab, _ac);
    const len = _n.length();
    if (len > 1e-12) _n.multiplyScalar(1 / len);
    _mid.copy(_a).add(_b).add(_c).multiplyScalar(1 / 3);

    col.copy(colorFn({ y: _mid.y, normal: _n, index: i / 3, center: _mid }));
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3 + 0] = col.r;
      colors[(i + k) * 3 + 1] = col.g;
      colors[(i + k) * 3 + 2] = col.b;
    }
  }

  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (flat) g.computeVertexNormals();
  return g;
}

/**
 * 在 sRGB 空间插值两个十六进制颜色，返回线性空间的 THREE.Color。
 *
 * 注意：入参是 sRGB 十六进制值，插值也在 sRGB 里做，最后用 setHex(SRGBColorSpace)
 * 转成线性工作空间。若直接用 Color(r/255, g/255, b/255) 构造，会把 sRGB 数值
 * 当成线性值，整体亮约一倍，画面会发白发灰。
 */
export function mixColor(a, b, t) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const k = Math.min(1, Math.max(0, t));
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return new THREE.Color().setHex((r << 16) | (g << 8) | bl, THREE.SRGBColorSpace);
}

/** 给没有 uv 的几何体补一份零 uv，避免合并时属性结构不一致 */
function ensureUv(g) {
  if (!g.attributes.uv) {
    const count = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  return g;
}

/**
 * 合并一组部件。每个部件可以带矩阵（世界变换）、统一色、或逐面上色函数。
 * 合并前统一：非索引化、position/normal/uv/color 齐全。
 * @param {Array<{geometry:THREE.BufferGeometry, matrix?:THREE.Matrix4, color?:THREE.Color, colorFn?:Function, flat?:boolean}>} parts
 * @returns {THREE.BufferGeometry}
 */
export function mergeColoredParts(parts) {
  if (!parts.length) return new THREE.BufferGeometry();

  const prepared = [];
  for (const part of parts) {
    const src = part.geometry;
    let g = src.index ? src.toNonIndexed() : src.clone();
    if (g === src) g = src.clone();

    if (part.matrix) g.applyMatrix4(part.matrix);

    if (part.colorFn) {
      g = applyFaceColors(g, part.colorFn, { flat: part.flat === true });
    } else if (!g.attributes.color) {
      const c = part.color || new THREE.Color(1, 1, 1);
      const arr = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = c.r;
        arr[i + 1] = c.g;
        arr[i + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }

    ensureUv(g);
    if (!g.attributes.normal) g.computeVertexNormals();

    // 合并只接受一致的属性集合，多余属性会直接报错
    for (const key of Object.keys(g.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv' && key !== 'color') {
        g.deleteAttribute(key);
      }
    }
    g.clearGroups();
    prepared.push(g);
  }

  const merged = mergeGeometries(prepared, false);
  for (const g of prepared) g.dispose();

  if (!merged) {
    throw new Error('mergeColoredParts: mergeGeometries 返回 null，部件属性结构不一致');
  }
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** 便捷构造：带平移/旋转矩阵的部件描述 */
export function part(geometry, { x = 0, y = 0, z = 0, rotY = 0, rotX = 0, rotZ = 0, color, colorFn, flat } = {}) {
  const matrix = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'XYZ'));
  matrix.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
  return { geometry, matrix, color, colorFn, flat };
}
