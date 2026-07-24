import { describe, it, expect } from "vitest";
import { TESTS } from "../src/self-test.js";
import { compileAndRun } from "../src/compiler/index.js";

// The embedded SELF-TEST table is the single source of truth for language
// conformance — the in-app button and this suite run the same assertions.
describe("conformance (embedded SELF-TEST table)", () => {
  for (const t of TESTS) {
    it(t.name, () => {
      if (t.expect && t.expect.throws) {
        expect(() => compileAndRun(t.src)).toThrow(t.expect.throws);
      } else if (typeof t.expect === "function") {
        expect(t.expect(compileAndRun(t.src).output)).toBe(true);
      } else {
        expect(compileAndRun(t.src).output.join("\n")).toBe(t.expect);
      }
    });
  }
});
