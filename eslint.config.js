import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default defineConfig([
  globalIgnores(["dist", "coverage"]),
  {
    files: ["**/*.{js,jsx}"],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: "latest",
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/{App,main,useCompilerWorker}.{js,jsx}"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ["src/compiler/compiler.worker.js"],
    languageOptions: {
      globals: globals.worker,
    },
  },
  {
    files: [
      "*.config.js",
      "scripts/**/*.{js,mjs,cjs}",
      "tests/**/*.{js,jsx}",
      "src/**/*.test.{js,jsx}",
      "src/test/**/*.{js,jsx}",
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["{src,tests}/**/*.test.jsx"],
    languageOptions: {
      globals: globals.browser,
    },
  },
]);
