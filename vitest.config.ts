import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Vitest does not put .env values into process.env, so read TEST_DATABASE_URL ourselves.
function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  try {
    const line = readFileSync(path.resolve(__dirname, ".env"), "utf8").split("\n").find((l) => l.startsWith("TEST_DATABASE_URL="));
    return line ? line.slice("TEST_DATABASE_URL=".length).replace(/^"|"$/g, "").trim() : "";
  } catch {
    return "";
  }
}

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Integration tests share one database, so run test files one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    env: { TEST_DATABASE_URL: testDatabaseUrl() },
  },
});
