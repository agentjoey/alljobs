import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["**/node_modules/**", "**/tests/e2e/**", "**/.worktrees/**"],
    // Real-boundary suites each own a temporary PostgreSQL cluster. Keep their
    // aggregate System V IPC use below the macOS SHMMNI default of 32.
    maxWorkers: 4,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./lib/server-only-stub.ts", import.meta.url)),
    },
  },
});
