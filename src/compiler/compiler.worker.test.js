import { describe, expect, it } from "vitest";
import { handleCompilerRequest } from "./compiler.worker.js";

describe("compiler worker message contract", () => {
  it("returns a structured-cloneable successful compilation", () => {
    const response = handleCompilerRequest({
      id: 7,
      type: "compile",
      payload: { source: `let value = 42; print(value);` },
    });
    const transferred = structuredClone(response);

    expect(transferred).toMatchObject({
      id: 7,
      ok: true,
      value: {
        result: {
          status: "halted",
          output: ["42"],
        },
      },
    });
    expect(transferred.value).not.toHaveProperty("linkedCode");
  });

  it("preserves structured diagnostics across cloning", () => {
    const response = structuredClone(
      handleCompilerRequest({
        id: 8,
        type: "compile",
        payload: { source: `print(missing);` },
      }),
    );

    expect(response).toMatchObject({
      id: 8,
      ok: false,
      error: {
        phase: "analyze",
        code: "ANALYZE_UNDEFINED_VARIABLE",
        position: { line: 1, column: 7 },
      },
    });
  });

  it("rejects unknown request types without throwing through the worker", () => {
    expect(
      handleCompilerRequest({
        id: 9,
        type: "teleport",
        payload: {},
      }),
    ).toMatchObject({
      id: 9,
      ok: false,
      error: {
        phase: "compile",
        message: "Unknown compiler request: teleport",
      },
    });
  });

  it("returns a structured-cloneable self-test report for verify requests", () => {
    const response = handleCompilerRequest({
      id: 10,
      type: "verify",
      payload: {},
    });
    const transferred = structuredClone(response);

    expect(transferred).toMatchObject({
      id: 10,
      ok: true,
      value: {
        ok: true,
        failures: [],
      },
    });
    expect(transferred.value.exampleCount).toBeGreaterThan(0);
    expect(transferred.value.assertionCount).toBeGreaterThan(0);
  });
});
