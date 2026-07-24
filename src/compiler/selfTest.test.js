import { describe, expect, it, vi } from "vitest";
import { runSelfTest } from "./selfTest.js";

vi.mock("./examples.js", () => ({
  EXAMPLES: {
    "throwing example": `print(missing);`,
    "non-halting example": `let i = 0; while (true) { i += 1; }`,
  },
}));

vi.mock("./selfTestCases.js", () => ({
  SELF_TEST_CASES: Object.freeze([
    {
      name: "error case that compiles cleanly",
      source: `print(1);`,
      errorIncludes: "never thrown",
    },
    {
      name: "output mismatch",
      source: `print(1);`,
      expectedOutput: "2",
    },
    {
      name: "failing custom validation",
      source: `print(1);`,
      validate() {
        return false;
      },
    },
    {
      name: "wrong error message",
      source: `print(missing);`,
      errorIncludes: "a different failure",
    },
  ]),
}));

describe("runSelfTest failure detection", () => {
  it("reports every corpus and example failure shape", () => {
    const report = runSelfTest();

    expect(report.ok).toBe(false);
    expect(report.exampleCount).toBe(2);
    expect(report.assertionCount).toBe(4);
    expect(report.failures).toHaveLength(6);

    expect(report.failures[0].name).toBe("Example: throwing example");
    expect(report.failures[0].message).toContain("Undefined variable: missing");
    expect(report.failures[1]).toEqual({
      name: "Example: non-halting example",
      message: "ended with status step_limit",
    });
    expect(report.failures[2]).toEqual({
      name: "error case that compiles cleanly",
      message: 'expected an error containing "never thrown"',
    });
    expect(report.failures[3]).toEqual({
      name: "output mismatch",
      message: 'expected "2", received "1"',
    });
    expect(report.failures[4]).toEqual({
      name: "failing custom validation",
      message: "custom validation returned false",
    });
    expect(report.failures[5].name).toBe("wrong error message");
    expect(report.failures[5].message).toContain("Undefined variable: missing");
  });
});
