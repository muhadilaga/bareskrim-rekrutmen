/**
 * Konfigurasi TERPISAH untuk integration test PostgreSQL.
 *
 * Sengaja TIDAK memakai `vitest.config.ts` (yang itu untuk unit test `src/`).
 * Konvensi:
 *   npx vitest run --config harness/vitest.integration.config.ts
 *
 * Tidak ada Opt-in check di dalam config; fail-closed dilakukan di dalam
 * file test lewat `requireIntegrationOptIn()`.
 */
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["harness/**/*.integration.test.ts"],
    // Anti-hang global: setiap test punya batas waktu.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Tidak boleh test paralel: beberapa skenario rely pada interleaving
    // lock yang sengaja dikendalikan.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "..", "src"),
    },
  },
});