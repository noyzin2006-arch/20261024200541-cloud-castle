// 云与场景的 HDR 合成（全分辨率）
//
// 云纹理是半分辨率的预乘散射：rgb = C，a = 1 - T。
// 合成公式：out = C + T * scene。不能再乘一次 alpha，否则云会整体变暗。
//
// 半分辨率上采样会带来「云在塔边糊出一圈光晕」的问题，
// 这里的做法是：每个 tap 用全分辨率深度重建它自己的表面距离，
// 与当前像素的表面距离差异过大就降权，塔的轮廓就不会被云染白。

precision highp float;

uniform sampler2D uCloud;
uniform sampler2D uScene;
uniform sampler2D uDepth;

uniform mat4 uInvProjection;
uniform mat4 uCameraWorld;
uniform vec3 uCameraPos;
uniform vec2 uCloudTexel;
uniform float uDebug; // 0=正常 1=显示深度 2=显示云 RT 原值

varying vec2 vUv;

float sceneDistance(vec2 uv) {
  float d = texture2D(uDepth, uv).x;
  if (d >= 1.0) return 1.0e9;
  vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 viewPos = uInvProjection * clip;
  viewPos /= viewPos.w;
  vec3 worldPos = (uCameraWorld * viewPos).xyz;
  return length(worldPos - uCameraPos);
}

void main() {
  vec2 uv = clamp(vUv, 0.0, 1.0);
  vec3 scene = texture2D(uScene, uv).rgb;

  if (uDebug > 0.5) {
    if (uDebug < 1.5) {
      float d = texture2D(uDepth, uv).x;
      gl_FragColor = vec4(vec3(pow(d, 40.0)), 1.0);
    } else {
      gl_FragColor = vec4(texture2D(uCloud, uv).rgb, 1.0);
    }
    return;
  }

  float dCur = sceneDistance(uv);

  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 offset = vec2(float(i - (i / 2) * 2) - 0.5, float(i / 2) - 0.5);
    vec2 tapUv = clamp(uv + offset * uCloudTexel, 0.0, 1.0);
    vec4 c = texture2D(uCloud, tapUv);

    float w = 1.0;
    float dTap = sceneDistance(tapUv);
    if (dCur < 1.0e8 && dTap < 1.0e8) {
      float rel = abs(dTap - dCur) / max(dCur, 1.0);
      w = 1.0 - smoothstep(0.015, 0.09, rel);
    }
    acc += c * w;
    wsum += w;
  }

  vec4 cloud = wsum > 0.0001 ? acc / wsum : texture2D(uCloud, uv);

  vec3 outColor = cloud.rgb + (1.0 - cloud.a) * scene;
  gl_FragColor = vec4(outColor, 1.0);
}
