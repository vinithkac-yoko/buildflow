import { defineConfig, loadEnv } from "vite";
import type { UserConfig } from "vite";
import path from "node:path";

export default defineConfig(({ mode }): UserConfig & { test: object } => ({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Integration tests share one database, so run test files one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    // Pick up TEST_DATABASE_URL from .env (Vitest does not put .env values in process.env by itself).
    env: { TEST_DATABASE_URL: loadEnv(mode, process.cwd(), "").TEST_DATABASE_URL ?? "" },
  },
}));
