import { describe, expect, it } from "vitest";
import { runSource } from "../src/compiler/index.js";
import { DIFFERENTIAL_CASES } from "./differential-corpus.js";
import {
  compareDifferentialCase,
  REFERENCE_CALL_DEPTH_CAP,
  runReference,
} from "./differential-harness.js";

describe("differential VM and tree-walk reference interpreter", () => {
  it.each(DIFFERENTIAL_CASES)("$name", (testCase) => {
    expect(
      compareDifferentialCase(testCase, (source, options) =>
        runSource(source, options),
      ),
    ).toBeNull();
  });

  it("rejects corpus limits above the reference interpreter cap", () => {
    expect(() =>
      compareDifferentialCase(
        {
          name: "unsafe oracle depth",
          source: "print(1);",
          limits: { maxCallDepth: REFERENCE_CALL_DEPTH_CAP + 1 },
        },
        (source, options) => runSource(source, options),
      ),
    ).toThrow(
      `above the ${REFERENCE_CALL_DEPTH_CAP}-frame reference-interpreter cap`,
    );
  });

  it("rejects direct reference runs above the host-safe cap", () => {
    expect(() =>
      runReference("print(1);", {
        limits: { maxCallDepth: REFERENCE_CALL_DEPTH_CAP + 1 },
      }),
    ).toThrow(
      `cannot exceed its ${REFERENCE_CALL_DEPTH_CAP}-frame operational cap`,
    );
  });
});
