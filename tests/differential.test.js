import { describe, expect, it } from "vitest";
import { runSource } from "../src/compiler/index.js";
import { DIFFERENTIAL_CASES } from "./differential-corpus.js";
import { compareDifferentialCase } from "./differential-harness.js";

describe("differential VM and tree-walk reference interpreter", () => {
  it.each(DIFFERENTIAL_CASES)("$name", (testCase) => {
    expect(
      compareDifferentialCase(testCase, (source, options) =>
        runSource(source, options),
      ),
    ).toBeNull();
  });
});
