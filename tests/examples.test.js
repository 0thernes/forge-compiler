import { describe, it, expect } from "vitest";
import { EXAMPLES } from "../src/examples.js";
import { compileAndRun } from "../src/compiler/index.js";

// Every bundled example must run the full pipeline cleanly, stay inside the
// step budget, and produce byte-identical output (golden snapshots).
describe("bundled examples", () => {
  for (const [name, src] of Object.entries(EXAMPLES)) {
    it(`${name} runs clean and matches golden output`, () => {
      const r = compileAndRun(src);
      expect(
        r.output.some((l) => l.includes("[EXECUTION LIMIT REACHED]")),
      ).toBe(false);
      expect(r.output.join("\n")).toMatchSnapshot();
    });
  }
});
