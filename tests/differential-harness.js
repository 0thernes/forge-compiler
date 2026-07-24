import { interpretSource } from "../src/compiler/interpreter.js";
import { DIFFERENTIAL_CASES } from "./differential-corpus.js";

// Oracle boundary: the reference interpreter takes (source, options) where
// options may carry { limits } overrides, and returns the same result shape
// as the VM ({ status, output, globals, ... }). Runners passed to
// compareDifferentialCase must accept the same (source, options) pair.
function runReference(source, options) {
  return interpretSource(source, options ?? {});
}

function capture(runner, source, options) {
  try {
    return { result: runner(source, options), error: null };
  } catch (error) {
    return { result: null, error };
  }
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function valuesMatch(left, right, leftToRight, rightToLeft) {
  if (Object.is(left, right)) return true;
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;

  if (leftToRight.has(left) || rightToLeft.has(right)) {
    return leftToRight.get(left) === right && rightToLeft.get(right) === left;
  }
  leftToRight.set(left, right);
  rightToLeft.set(right, left);
  return left.every((value, index) =>
    valuesMatch(value, right[index], leftToRight, rightToLeft),
  );
}

function globalsMatch(left, right) {
  if (
    !left ||
    !right ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (JSON.stringify(leftKeys) !== JSON.stringify(rightKeys)) return false;

  const leftToRight = new WeakMap();
  const rightToLeft = new WeakMap();
  return leftKeys.every((key) =>
    valuesMatch(left[key], right[key], leftToRight, rightToLeft),
  );
}

export function compareDifferentialCase(
  testCase,
  vmRunner,
  referenceRunner = runReference,
) {
  const vm = capture(vmRunner, testCase.source, testCase.options);
  const reference = capture(referenceRunner, testCase.source, testCase.options);

  if (testCase.errorIncludes) {
    if (!vm.error || !reference.error) {
      return `expected both engines to fail; VM=${vm.error ? "error" : "clean"}, reference=${reference.error ? "error" : "clean"}`;
    }
    const vmMessage = messageOf(vm.error);
    const referenceMessage = messageOf(reference.error);
    if (!vmMessage.includes(testCase.errorIncludes)) {
      return `VM error did not include ${JSON.stringify(testCase.errorIncludes)}: ${vmMessage}`;
    }
    if (!referenceMessage.includes(testCase.errorIncludes)) {
      return `reference error did not include ${JSON.stringify(testCase.errorIncludes)}: ${referenceMessage}`;
    }
    return null;
  }

  if (vm.error || reference.error) {
    return `unexpected failure; VM=${vm.error ? messageOf(vm.error) : "clean"}, reference=${reference.error ? messageOf(reference.error) : "clean"}`;
  }

  const vmOutput = vm.result?.output;
  const referenceOutput = reference.result?.output;
  if (!Array.isArray(vmOutput) || !Array.isArray(referenceOutput)) {
    return "an engine did not return an output array";
  }

  if (JSON.stringify(vmOutput) !== JSON.stringify(referenceOutput)) {
    return `output mismatch; VM=${JSON.stringify(vmOutput)}, reference=${JSON.stringify(referenceOutput)}`;
  }
  const vmStatus = vm.result?.status;
  const referenceStatus = reference.result?.status;
  if (vmStatus !== referenceStatus) {
    return `status mismatch; VM=${vmStatus}, reference=${referenceStatus}`;
  }
  if (
    testCase.expectedStatus !== undefined &&
    vmStatus !== testCase.expectedStatus
  ) {
    return `status mismatch; expected=${testCase.expectedStatus}, actual=${vmStatus}`;
  }
  if (
    testCase.expectedOutput !== undefined &&
    vmOutput.join("\n") !== testCase.expectedOutput
  ) {
    return `both engines disagreed with the golden output; expected=${JSON.stringify(testCase.expectedOutput)}, actual=${JSON.stringify(vmOutput.join("\n"))}`;
  }
  // A step-limit cut lands at an arbitrary point inside the loop for each
  // engine (VM steps and interpreter node visits are not comparable), so
  // partially-mutated globals are only comparable for halted programs.
  if (
    vmStatus !== "step_limit" &&
    !globalsMatch(vm.result?.globals, reference.result?.globals)
  ) {
    return "final globals differ in names, values, aliases, or cycles";
  }
  if (typeof testCase.validate === "function") {
    if (!testCase.validate(vm.result)) {
      return "VM result failed the case validator";
    }
    if (!testCase.validate(reference.result)) {
      return "reference result failed the case validator";
    }
  }
  return null;
}

export function findDifferentialMismatches(
  vmRunner,
  cases = DIFFERENTIAL_CASES,
) {
  return cases.flatMap((testCase) => {
    const detail = compareDifferentialCase(testCase, vmRunner);
    return detail ? [{ name: testCase.name, detail }] : [];
  });
}
