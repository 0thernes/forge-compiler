import { EXAMPLES } from "../src/compiler/examples.js";
import { SELF_TEST_CASES } from "../src/compiler/selfTestCases.js";

const sharedFrontendSelfTests = new Set([
  "undefined functions fail semantic analysis in dead code",
  "invalid assignment targets have a direct diagnostic",
  "duplicate let declarations fail statically",
  "duplicate declarations fail even in dead code",
  "function arity is checked statically",
  "arity errors are found in dead code",
  "duplicate functions are rejected",
  "top-level return is rejected",
  "variables cannot be read before declaration",
  "let initializers cannot reference their own binding",
  "dead branches still enforce declaration order",
  "numeric overflow is rejected",
]);

const regressionCases = [
  {
    name: "lexical lookup ignores a caller-local shadow",
    source: `let value = 10;
fn read() { return value; }
fn caller() { let value = 99; return read(); }
print(caller());`,
  },
  {
    name: "nested functions update their declaration environment",
    source: `fn outer() {
  let value = 1;
  fn increment() { value += 1; return value; }
  increment();
  return increment();
}
print(outer());`,
  },
  {
    name: "same-name functions stay isolated in sibling blocks",
    source: `if (true) { fn value() { return 1; } print(value()); }
if (true) { fn value() { return 2; } print(value()); }`,
  },
  {
    name: "forward references and mutual recursion are lexically hoisted",
    source: `fn even(value) {
  if (value == 0) { return true; }
  return odd(value - 1);
}
fn odd(value) {
  if (value == 0) { return false; }
  return even(value - 1);
}
print(even(12), " ", odd(9));`,
  },
  {
    name: "nested print records complete before their caller",
    source: `fn announce() { print("inner"); return 7; }
print("outer:", announce(), ":done");`,
  },
  {
    name: "print formats mutable arguments at evaluation time",
    source: `let values = [1];
fn mutate() { push(values, 2); return 9; }
print(values, " / ", mutate(), " / ", values);`,
  },
  {
    name: "empty print records are preserved",
    source: `print("before"); print(); print("after");`,
  },
  {
    name: "break and continue unwind only the current loop iteration",
    source: `let total = 0;
let outer = 0;
while (outer < 3) {
  let inner = 0;
  while (inner < 5) {
    inner += 1;
    if (inner == 2) { continue; }
    if (inner == 4) { break; }
    total += outer + inner;
  }
  outer += 1;
}
print(total);`,
  },
  {
    name: "compound indexes evaluate their target and index once",
    source: `let calls = 0;
fn index() { calls += 1; return 1; }
let values = [2, 4, 8];
values[index()] += values[0];
print(values, " calls=", calls);`,
  },
  {
    name: "array aliasing and identity equality remain distinct",
    source: `let first = [1];
let alias = first;
let copy = [1];
push(alias, 2);
print(first, " ", first == alias, " ", first == copy);`,
  },
  {
    name: "cyclic arrays format without swallowing later records",
    source: `let cycle = [1];
push(cycle, cycle);
print(cycle);
print("alive");`,
  },
  {
    name: "short-circuiting skips the right-hand side",
    source: `let calls = 0;
fn touch() { calls += 1; return 1; }
let first = 0 && touch();
let second = 1 || touch();
print(first, " ", second, " ", calls);`,
  },
  {
    name: "less-than-or-equal includes the equality boundary",
    source: `print(3 <= 3, " ", 4 <= 3, " ", 2 <= 3);`,
  },
  {
    name: "UTF-16 string operations stay code-unit based",
    source: `let face = "😀";
print(len(face), " ", char_at(face, 0) == face[0], " ", substr(face, 0, 2));`,
  },
  {
    name: "negative modulo follows JavaScript remainder semantics",
    source: `print(-7 % 3, " ", 7 % -3);`,
  },
  {
    name: "falling off a function returns zero",
    source: `fn nothing() { let value = 1; }
print(nothing());`,
  },
  {
    name: "string concatenation remains complete beyond display budgets",
    kind: "resource-policy",
    source: `let value = "aaaaaaaaaa";
let count = 0;
while (count < 12) { value = value + value; count += 1; }
print(len(value + "!"));`,
  },
  {
    name: "array concatenation renders every element",
    kind: "resource-policy",
    source: `let values = [];
let count = 0;
while (count < 1200) { push(values, 1); count += 1; }
print(len("" + values));`,
  },
  {
    name: "cyclic array concatenation fails instead of truncating",
    kind: "resource-policy",
    source: `let value = [1]; push(value, value); print("" + value);`,
    errorIncludes: "contains itself",
  },
  {
    name: "over-deep array concatenation fails instead of truncating",
    kind: "resource-policy",
    source: `let value = [];
let depth = 0;
while (depth < 40) { value = [value]; depth += 1; }
print("" + value);`,
    errorIncludes: "nested deeper",
  },
  {
    name: "call depth policy agrees at a small explicit boundary",
    kind: "resource-policy",
    limits: { maxCallDepth: 4 },
    source: `fn recurse(value) {
  if (value == 0) { return 0; }
  return recurse(value - 1);
}
print(recurse(8));`,
    errorIncludes: "Call depth exceeds the 4 frame limit",
  },
  {
    name: "call depth is restored after each completed call",
    kind: "resource-policy",
    limits: { maxCallDepth: 1 },
    source: `fn identity(value) { return value; }
print(identity(1), identity(2));`,
    expectedOutput: "12",
  },
  {
    name: "modulo by zero has error parity",
    source: `print(8 % 0);`,
    errorIncludes: "Modulo by zero",
  },
  {
    name: "non-numeric ordered comparison has error parity",
    source: `print("a" <= "b");`,
    errorIncludes: "requires numbers",
  },
  {
    name: "indirect initializer self-reference fails deterministically",
    source: `fn read() { return value; }
let value = read();`,
    errorIncludes: "Undefined variable: value",
  },
];

const exampleCases = Object.entries(EXAMPLES).map(([name, source]) => ({
  name: `example · ${name}`,
  source,
  kind: "backend",
}));

const selfTestCases = SELF_TEST_CASES.filter(
  (testCase) => typeof testCase.validate !== "function",
).map((testCase) => ({
  name: `self-test · ${testCase.name}`,
  source: testCase.source,
  kind: sharedFrontendSelfTests.has(testCase.name)
    ? "shared-frontend"
    : "backend",
  ...(testCase.expectedOutput !== undefined
    ? { expectedOutput: testCase.expectedOutput }
    : {}),
  ...(testCase.errorIncludes ? { errorIncludes: testCase.errorIncludes } : {}),
}));

export const DIFFERENTIAL_CASES = Object.freeze([
  ...exampleCases,
  ...selfTestCases,
  ...regressionCases.map((testCase) => ({
    kind: "backend",
    ...testCase,
  })),
]);
