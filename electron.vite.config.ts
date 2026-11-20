import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
      },
    },
  },
  // renderer 用函数形式：仅 build 时关闭 esbuild 内部 sourcemap。
  // 根因：本机装有 Esafenet 文档透明加密，会加密 esbuild 子进程经 stdio 管道返回的
  // 大体积 sourcemap 响应（renderer 主 chunk 约 5MB），父进程 JSON.parse 读到密文报
  // "Unexpected token ... in JSON at position 0"，构建必挂；小响应（main/preload、单模块）
  // 不触发加密阈值故正常。构建产物本不需要 sourcemap；dev 不在函数返回的分支内，
  // devtools 调试 TS 的 sourcemap 行为不受影响。勿移除此配置，否则本机构建必失败。
  renderer: ({ command }) => ({
    resolve: {
      alias: {
        "@": resolve("src/renderer/src"),
        "@shared": resolve("src/shared"),
      },
    },
    plugins: [vue()],
    ...(command === "build"
      ? { esbuild: { sourcemap: false }, build: { sourcemap: false } }
      : {}),
  }),
});
