// 收尾胶片效果：暗角 + 径向色差 + 颗粒
//
// 这个 pass 排在 OutputPass 之后，只作用在已经映射到 sRGB 的 LDR 画面上，
// 不做任何色彩空间转换。

precision highp float;

uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uGrain;
uniform float uVignette;
uniform float uAberration;
uniform float uSaturation;
uniform float uContrast;

varying vec2 vUv;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = clamp(vUv, 0.0, 1.0);
  vec2 center = uv - 0.5;
  float r2 = dot(center, center);

  // 径向色差：只在画面边缘可见
  vec2 shift = center * uAberration * r2 * 0.02;
  vec3 color;
  color.r = texture2D(tDiffuse, clamp(uv + shift, 0.0, 1.0)).r;
  color.g = texture2D(tDiffuse, uv).g;
  color.b = texture2D(tDiffuse, clamp(uv - shift, 0.0, 1.0)).b;

  // 暗角
  float vig = smoothstep(1.05, 0.12, r2 * uVignette);
  color *= mix(1.0, vig, 0.9);

  // 轻微 S 曲线对比 + 饱和度
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, uSaturation);
  color = clamp((color - 0.5) * uContrast + 0.5, 0.0, 1.0);

  // 胶片颗粒
  float n = hash12(uv * vec2(1920.0, 1080.0) + fract(uTime) * 91.7);
  color += (n - 0.5) * uGrain;

  gl_FragColor = vec4(color, 1.0);
}
