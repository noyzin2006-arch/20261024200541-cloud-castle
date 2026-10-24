// 体积云 raymarch（半分辨率）
//
// 视线与云层板片求交 → 步进采样密度 → Beer–Lambert 透射率累积 → 前向散射。
// 输出为预乘散射：rgb = 已散射的光，C；a = 1 - 透射率 T。
// 合成时必须用 out = C + T * scene，不能再乘一次 alpha。

precision highp float;
precision highp sampler3D;

uniform sampler3D uNoise;
uniform sampler2D uDepth;

uniform mat4 uInvProjection;
uniform mat4 uCameraWorld;
uniform vec3 uCameraPos;

uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uAmbientColor;

uniform float uTime;
uniform float uFrame;
uniform float uSteps;
uniform float uShadowSamples;

uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform float uCoverage;
uniform float uDensityScale;
uniform float uSigmaT;
uniform float uSigmaLight;
uniform vec2 uWind;
uniform float uDetailStrength;

varying vec2 vUv;

const int MAX_STEPS = 64;
const float PI = 3.14159265359;

// Henyey–Greenstein 相函数
float hg(float c, float g) {
  float g2 = g * g;
  float d = 1.0 + g2 - 2.0 * g * c;
  return (1.0 - g2) / (4.0 * PI * pow(max(d, 1e-4), 1.5));
}

// 双瓣相函数：强前向散射（银边）+ 弱后向散射（体积感）
float phase(float c) {
  return mix(hg(c, 0.74), hg(c, -0.28), 0.26);
}

// 高度包络：云顶圆润翻卷，底部平缓收口
float heightMask(float h) {
  return smoothstep(0.0, 0.16, h) * (1.0 - smoothstep(0.58, 1.0, h));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// 云密度：低频云团 × 高度包络 − 高频侵蚀
float cloudDensity(vec3 p) {
  float h = clamp((p.y - uBoxMin.y) / max(0.001, uBoxMax.y - uBoxMin.y), 0.0, 1.0);

  vec3 drift = vec3(uWind.x, 0.0, uWind.y) * uTime;
  vec3 q = (p + drift) * 0.00165;

  float base = texture(uNoise, q).r;
  float mid = texture(uNoise, q * 3.7 + vec3(0.31, 0.17, 0.53)).g;
  float fine = texture(uNoise, q * 11.3).b;

  // 低频决定云团，高频在中频基础上做侵蚀
  float shape = base * 0.72 + mid * 0.28;
  float d = shape - (1.0 - uCoverage);
  d = max(d, 0.0);
  float erode = fine * uDetailStrength * smoothstep(0.0, 0.38, d);
  d = max(d - erode, 0.0);

  return d * heightMask(h) * uDensityScale;
}

// 朝太阳方向的光步进：云顶亮、云底暗
float lightTransmittance(vec3 p) {
  float sum = 0.0;
  const float stepLen = 7.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= uShadowSamples) break;
    vec3 sp = p + uSunDirection * (stepLen * float(i + 1));
    if (sp.y > uBoxMax.y || sp.y < uBoxMin.y) break;
    sum += cloudDensity(sp) * stepLen;
  }
  return exp(-uSigmaLight * sum);
}

void main() {
  vec2 uv = clamp(vUv, 0.0, 1.0);

  // 从场景深度重建世界射线与可见表面距离
  float depth = texture2D(uDepth, uv).x;
  vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 viewPos = uInvProjection * clip;
  viewPos /= viewPos.w;
  vec3 worldPos = (uCameraWorld * viewPos).xyz;
  vec3 rayDir = normalize(worldPos - uCameraPos);

  float sceneDist = 1.0e9;
  if (depth < 1.0) {
    sceneDist = length(worldPos - uCameraPos);
  }

  // 与云层板片求交（各轴分别求，避免 0 除）
  vec3 safeDir = vec3(
    rayDir.x >= 0.0 ? max(rayDir.x, 1e-6) : min(rayDir.x, -1e-6),
    rayDir.y >= 0.0 ? max(rayDir.y, 1e-6) : min(rayDir.y, -1e-6),
    rayDir.z >= 0.0 ? max(rayDir.z, 1e-6) : min(rayDir.z, -1e-6)
  );
  vec3 invDir = 1.0 / safeDir;
  vec3 t0 = (uBoxMin - uCameraPos) * invDir;
  vec3 t1 = (uBoxMax - uCameraPos) * invDir;
  vec3 tSmall = min(t0, t1);
  vec3 tBig = max(t0, t1);
  float tEnter = max(max(tSmall.x, tSmall.y), tSmall.z);
  float tExit = min(min(tBig.x, tBig.y), tBig.z);
  tEnter = max(tEnter, 0.0);
  tExit = min(tExit, sceneDist - 0.05);

  if (tExit <= tEnter) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  float steps = uSteps;
  float ds = (tExit - tEnter) / steps;
  float jitter = hash12(gl_FragCoord.xy + vec2(uFrame * 17.13, uFrame * 7.71));
  vec3 pos = uCameraPos + rayDir * (tEnter + ds * jitter);

  float transmittance = 1.0;
  vec3 scattered = vec3(0.0);
  float cosSun = dot(rayDir, uSunDirection);
  float ph = phase(cosSun);

  for (int i = 0; i < MAX_STEPS; i++) {
    if (float(i) >= steps) break;

    float d = cloudDensity(pos);
    if (d > 0.0025) {
      float dT = exp(-uSigmaT * d * ds);
      float weight = transmittance * (1.0 - dT);

      float lt = lightTransmittance(pos);
      // Beer–Powder：薄边偏暗、厚芯偏亮，避免棉花感
      float powder = 1.0 - exp(-d * ds * 0.6);
      float h = clamp((pos.y - uBoxMin.y) / max(0.001, uBoxMax.y - uBoxMin.y), 0.0, 1.0);
      float hm = heightMask(h);

      vec3 sunLit = uSunColor * lt * mix(1.0, powder, 0.42);
      vec3 ambient = uAmbientColor * (0.22 + 0.78 * hm);

      // 相函数加各向同性底：单次散射在「太阳在镜头后方」时几乎为零，
      // 这一项相当于多次散射近似，让正面受光的云顶也能亮起来。
      const float ISOTROPIC = 0.0795775;
      float phaseMix = ph * 0.9 + ISOTROPIC * 0.55;

      scattered += weight * (sunLit * phaseMix * 3.6 + ambient);
      transmittance *= dT;

      if (transmittance < 0.012) break;
    }
    pos += rayDir * ds;
  }

  gl_FragColor = vec4(scattered, 1.0 - transmittance);
}
