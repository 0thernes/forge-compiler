import { compileAndRun } from "./compiler/index.js";
import { EXAMPLES } from "./examples.js";

// ── EMBEDDED V13 COMPATIBILITY SUITE ──
// Retained alongside the original examples. Each case is either an
// exact-output assertion (expect: string, lines joined with \n), a must-throw
// assertion (expect: {throws}), or a custom predicate on the output lines.
// The same table drives the Vitest conformance suite in tests/.
export const TESTS = [
  {
    name: "substr(-1) rejects negative start",
    src: `print(substr("hello", -1, 1));`,
    expect: { throws: "substr start out of range" },
  },
  {
    name: "substr clamps rest-of-string",
    src: `print(substr("hello", 2, 999));`,
    expect: "llo",
  },
  {
    name: "char_at requires integer index",
    src: `print(char_at("hi", 0.9));`,
    expect: { throws: "must be an integer" },
  },
  {
    name: "array index requires integer",
    src: `let a = [1, 2]; print(a[0.5]);`,
    expect: { throws: "must be an integer" },
  },
  {
    name: "arrays print bracketed",
    src: `print([1, 2, 3]);`,
    expect: "[1, 2, 3]",
  },
  {
    name: "nested arrays, strings quoted inside",
    src: `print([1, "x", [2]]);`,
    expect: `[1, "x", [2]]`,
  },
  {
    name: "cyclic array prints [...] (no crash)",
    src: `let a = [1]; push(a, a); print(a);`,
    expect: "[1, [...]]",
  },
  {
    name: "undefined fn caught at link time (dead branch)",
    src: `if (false) { ghost(); } print("x");`,
    expect: { throws: "Undefined function: ghost" },
  },
  {
    name: "index read",
    src: `let a = [10, 20, 30]; print(a[1]);`,
    expect: "20",
  },
  {
    name: "index write",
    src: `let a = [1, 2, 3]; a[1] = 99; print(a);`,
    expect: "[1, 99, 3]",
  },
  {
    name: "compound index +=",
    src: `let a = [5]; a[0] += 3; print(a[0]);`,
    expect: "8",
  },
  {
    name: "compound index single-evaluates a[f()]",
    src: `let calls = 0; fn idx() { calls += 1; return 0; } let a = [10]; a[idx()] += 5; print(a[0], " ", calls);`,
    expect: "15 1",
  },
  {
    name: "push returns new length",
    src: `let a = [1]; print(push(a, 2));`,
    expect: "2",
  },
  {
    name: "pop returns element",
    src: `let a = [1, 2, 3]; print(pop(a), " ", a);`,
    expect: "3 [1, 2]",
  },
  {
    name: "pop empty errors",
    src: `let a = []; pop(a);`,
    expect: { throws: "pop from empty array" },
  },
  {
    name: "reference semantics",
    src: `let a = [1]; let b = a; push(b, 2); print(a);`,
    expect: "[1, 2]",
  },
  {
    name: "reference equality",
    src: `let a = [1, 2]; let b = [1, 2]; let c = a; print(a == b, " ", a == c);`,
    expect: "0 1",
  },
  {
    name: "string indexing s[i]",
    src: `let s = "FORGE"; print(s[0], s[4]);`,
    expect: "FE",
  },
  {
    name: "strings are immutable",
    src: `let s = "ab"; s[0] = "z";`,
    expect: { throws: "strings are immutable" },
  },
  {
    name: "chained indexing m[i][j]",
    src: `let m = [[1, 2], [3, 4]]; print(m[1][0]);`,
    expect: "3",
  },
  {
    name: "postfix chain f(x)[i]",
    src: `fn make() { return [7, 8]; } print(make()[1]);`,
    expect: "8",
  },
  {
    name: "out-of-bounds read errors",
    src: `let a = [1]; print(a[5]);`,
    expect: { throws: "Index out of bounds" },
  },
  {
    name: "out-of-bounds write suggests push",
    src: `let a = [1]; a[1] = 2;`,
    expect: { throws: "use push to append" },
  },
  { name: "len on arrays", src: `print(len([1, 2, 3, 4]));`, expect: "4" },
  { name: "type_of array", src: `print(type_of([]));`, expect: "array" },
  {
    name: "invalid assignment target diagnostic",
    src: `5 = 3;`,
    expect: { throws: "Invalid assignment target" },
  },
  {
    name: "break exits inner loop only",
    src: `let r = 0; let i = 0; while (i < 3) { let j = 0; while (j < 10) { if (j == 2) { break; } j += 1; } r += j; i += 1; } print(r);`,
    expect: "6",
  },
  {
    name: "continue skips",
    src: `let s = 0; let i = 0; while (i < 10) { i += 1; if (i % 2 == 0) { continue; } s += i; } print(s);`,
    expect: "25",
  },
  {
    name: "let re-declaration errors",
    src: `let x = 1; let x = 2;`,
    expect: { throws: "already declared" },
  },
  {
    name: "shadowing across scopes works",
    src: `let x = 1; if (true) { let x = 99; print(x); } print(x);`,
    expect: "99\n1",
  },
  {
    name: "arity mismatch errors",
    src: `fn f(a) { return a; } f(1, 2);`,
    expect: { throws: "Expected 1 argument" },
  },
  {
    name: "type error: string minus number",
    src: `print("abc" - 1);`,
    expect: { throws: "requires numbers" },
  },
  {
    name: "division by zero errors",
    src: `print(1 / 0);`,
    expect: { throws: "Division by zero" },
  },
  {
    name: "recursion: factorial(8)",
    src: `fn f(n) { if (n <= 1) { return 1; } return n * f(n - 1); } print(f(8));`,
    expect: "40320",
  },
  {
    name: "output truncates at 5000 lines (no crash)",
    src: `let i = 0; while (i < 5100) { print(i); i += 1; }`,
    expect: (out) =>
      out.length === 5001 &&
      out[5000] === "[OUTPUT TRUNCATED AT 5000 LINES]" &&
      out[0] === "0",
  },
];

// Legacy compatibility helper. Repository CI and the v14 browser verifier run
// additional suites; this export remains for the original Vitest corpus.
export function runConformance() {
  const failures = [];
  const names = Object.keys(EXAMPLES);
  for (const name of names) {
    try {
      const r = compileAndRun(EXAMPLES[name]);
      if (r.output.some((l) => l.includes("[EXECUTION LIMIT REACHED]")))
        failures.push(`example ${name}: step limit`);
    } catch (e) {
      failures.push(`example ${name}: ${e.message}`);
    }
  }
  for (const t of TESTS) {
    try {
      const r = compileAndRun(t.src);
      if (t.expect && t.expect.throws)
        failures.push(
          `${t.name}: expected error containing "${t.expect.throws}" but ran clean`,
        );
      else if (typeof t.expect === "function") {
        if (!t.expect(r.output)) failures.push(`${t.name}: predicate failed`);
      } else if (r.output.join("\n") !== t.expect)
        failures.push(
          `${t.name}: expected ${JSON.stringify(t.expect)}, got ${JSON.stringify(r.output.join("\n"))}`,
        );
    } catch (e) {
      if (t.expect && t.expect.throws) {
        if (!e.message.includes(t.expect.throws))
          failures.push(`${t.name}: wrong error — ${e.message}`);
      } else failures.push(`${t.name}: threw — ${e.message}`);
    }
  }
  return { failures, exampleCount: names.length, testCount: TESTS.length };
}
