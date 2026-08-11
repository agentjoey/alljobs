import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` 由 Next 构建期保证语义；纯 node（vitest）下 import 会直接抛错，
      // 测试环境替换为空模块（仅 lib/data/read.ts 顶部的一处标记性 import 受影响）。
      "server-only": fileURLToPath(new URL("./lib/data/empty-stub.ts", import.meta.url)),
    },
  },
});
