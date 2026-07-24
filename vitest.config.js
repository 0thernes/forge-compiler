import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.{js,jsx}", "src/**/*.test.{js,jsx}"],
    setupFiles: ["./src/test/setup.js"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "src/compiler/analyze.js",
        "src/compiler/ast.js",
        "src/compiler/constants.js",
        "src/compiler/errors.js",
        "src/compiler/format.js",
        "src/compiler/lexer.js",
        "src/compiler/parser.js",
        "src/compiler/codegen.js",
        "src/compiler/compiler.worker.js",
        "src/compiler/selfTest.js",
        "src/compiler/vm.js",
        "src/compiler/index.js",
        "src/useCompilerWorker.js",
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 75,
        statements: 85,
      },
    },
  },
});
