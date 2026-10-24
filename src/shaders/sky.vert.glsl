varying vec3 vWorldDirection;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  // 用世界坐标减去相机位置得到视线方向，相机移动时天空不会「跟着飘」
  vWorldDirection = worldPosition.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
