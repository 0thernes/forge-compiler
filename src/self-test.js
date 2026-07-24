import { runSelfTest } from "./compiler/selfTest.js";
import { SELF_TEST_CASES } from "./compiler/selfTestCases.js";

// Compatibility adapter for v13 consumers of TESTS. New code should consume
// SELF_TEST_CASES directly; this projection keeps the historical src/expect
// shape without maintaining a second conformance corpus.
export const TESTS = Object.freeze(
  SELF_TEST_CASES.map((testCase) =>
    Object.freeze({
      name: testCase.name,
      src: testCase.source,
      expect: testCase.errorIncludes
        ? Object.freeze({ throws: testCase.errorIncludes })
        : testCase.expectedOutput !== undefined
          ? testCase.expectedOutput
          : (output) => testCase.validate({ output }),
    }),
  ),
);

// Historical helper retained for callers that invoked the embedded suite.
export function runConformance() {
  const report = runSelfTest();
  return {
    failures: report.failures.map(
      (failure) => `${failure.name}: ${failure.message}`,
    ),
    exampleCount: report.exampleCount,
    testCount: report.assertionCount,
  };
}
