import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,jsx}"],
    setupFiles: ["./src/test/setup.js"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "src/compiler/format.js",
        "src/compiler/lexer.js",
        "src/compiler/parser.js",
        "src/compiler/codegen.js",
        "src/compiler/vm.js",
        "src/compiler/index.js",
        "src/compiler/selfTest.js"
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 75,
        statements: 85
      }
    },
  },
});
