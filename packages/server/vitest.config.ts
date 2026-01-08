import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["source"],
  },
  test: {
    exclude: ["node_modules/**", "dist/**"],
    passWithNoTests: true,
    maxWorkers: 4,
    minWorkers: 1,
  },
});
