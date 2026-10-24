// 线性 HDR 大气天穹。
//
// 为什么不用 three 自带的 Sky（Preetham）：那个着色器输出的是已经映射到显示域的
// 曲线值，落进线性 HDR 缓冲后会被 ACES 再映射一次，整个天空会糊成一片近白，
// 而且亮度远超 Bloom 阈值，导致全屏泛光。
//
// 这里自己写一份解析天穹，输出真正的线性辐射度：天顶与地平线在 0.05~0.9 之间，
// 只有太阳本体和它的辉光高于 1，Bloom 阈值因此只咬住真正的光源。

precision highp float;

uniform vec3 uSunDirection;
uniform vec3 uZenithColor;
uniform vec3 uHorizonWarm;
uniform vec3 uHorizonCool;
uniform vec3 uGroundColor;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform float uDiscIntensity;

varying vec3 vWorldDirection;

void main() {
  vec3 dir = normalize(vWorldDirection);
  float h = dir.y;
  float cosSun = dot(dir, uSunDirection);

  // 天顶 ↔ 地平线：靠近地平线时权重快速上升
  float t = pow(clamp(1.0 - abs(h) * 3.2, 0.0, 1.0), 2.0);

  // 太阳一侧的地平线更暖，背离太阳的一侧偏冷蓝
  float warm = pow(clamp(cosSun * 0.5 + 0.5, 0.0, 1.0), 3.0);
  vec3 horizon = mix(uHorizonCool, uHorizonWarm, warm);

  vec3 color = mix(uZenithColor, horizon, t);

  // 大气辉光：近太阳强、远太阳弱
  float glow = pow(max(cosSun, 0.0), 6.0);
  float wide = pow(max(cosSun, 0.0), 1.6);
  color += uSunColor * (glow * 0.85 + wide * 0.10) * uSunIntensity;

  // 太阳圆盘：唯一远超 1 的部分，交给 Bloom 去咬
  float disc = smoothstep(0.99972, 0.99991, cosSun);
  color += uSunColor * disc * uDiscIntensity;

  // 地平线以下：云海把阳光反射回来的暖色
  float below = smoothstep(0.03, -0.12, h);
  color = mix(color, uGroundColor, below);

  gl_FragColor = vec4(color, 1.0);
}
