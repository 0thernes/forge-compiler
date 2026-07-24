import { compileSource } from "./index.js";
import { EXAMPLES } from "./examples.js";
import { SELF_TEST_CASES } from "./selfTestCases.js";

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function runSelfTest() {
  const startedAt = now();
  const failures = [];
  const exampleNames = Object.keys(EXAMPLES);

  for (const name of exampleNames) {
    try {
      const compilation = compileSource(EXAMPLES[name]);
      if (compilation.result.status !== "halted") {
        failures.push({
          name: `Example: ${name}`,
          message: `ended with status ${compilation.result.status}`,
        });
      }
    } catch (error) {
      failures.push({
        name: `Example: ${name}`,
        message: error.message,
      });
    }
  }

  for (const testCase of SELF_TEST_CASES) {
    try {
      const compilation = compileSource(testCase.source);
      if (testCase.errorIncludes) {
        failures.push({
          name: testCase.name,
          message: `expected an error containing ${JSON.stringify(testCase.errorIncludes)}`,
        });
      } else if (
        testCase.expectedOutput !== undefined &&
        compilation.result.output.join("\n") !== testCase.expectedOutput
      ) {
        failures.push({
          name: testCase.name,
          message: `expected ${JSON.stringify(testCase.expectedOutput)}, received ${JSON.stringify(compilation.result.output.join("\n"))}`,
        });
      } else if (
        testCase.validate &&
        !testCase.validate(compilation.result, compilation)
      ) {
        failures.push({
          name: testCase.name,
          message: "custom validation returned false",
        });
      }
    } catch (error) {
      if (
        !testCase.errorIncludes ||
        !error.message.includes(testCase.errorIncludes)
      ) {
        failures.push({
          name: testCase.name,
          message: error.message,
        });
      }
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    exampleCount: exampleNames.length,
    assertionCount: SELF_TEST_CASES.length,
    durationMilliseconds: now() - startedAt,
  };
}
