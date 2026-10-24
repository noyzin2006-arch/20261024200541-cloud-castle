import { defineConfig } from 'vite';

// 相对 base：产物可以直接从任意静态目录打开，也方便本机 preview 与线上部署共用同一份 dist
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // three 与着色器体积较大，提高内联阈值上限反而拖慢构建；这里保持资源为独立文件
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 1200,
    sourcemap: false
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  },
  preview: {
    host: '127.0.0.1',
    port: 4173
  }
});
