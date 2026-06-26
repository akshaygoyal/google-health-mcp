import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"], // routing entry point tested via integration
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
      reporter: ["text", "lcov"],
    },
  },
  resolve: {
    // Allow importing ./foo.js to resolve to ./foo.ts in tests
    extensions: [".ts", ".js"],
  },
});
