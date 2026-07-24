import { describe, it, expect } from "vitest";
import { EXAMPLES } from "../src/examples.js";
import { runConformance, TESTS } from "../src/self-test.js";
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

describe("v13 compatibility adapters", () => {
  it("keeps the Closures example alias without duplicating the corpus", () => {
    expect(EXAMPLES.Closures).toBe(EXAMPLES["Nested Functions"]);
    expect(Object.keys(EXAMPLES)).not.toContain("Closures");
  });

  it("keeps custom predicates dependent on the supplied output", () => {
    const testCase = TESTS.find(
      (entry) => entry.name === "large output is bounded",
    );
    expect(testCase.expect(["definitely wrong output"])).toBe(false);
    expect(testCase.expect(compileAndRun(testCase.src).output)).toBe(true);
  });

  it("retains the runConformance report contract", () => {
    expect(runConformance()).toMatchObject({
      failures: [],
      exampleCount: Object.keys(EXAMPLES).length,
      testCount: TESTS.length,
    });
  });
});
