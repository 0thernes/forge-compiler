import { describe, expect, it } from "vitest";
import { compileSource } from "../src/compiler/index.js";
import { interpretSource } from "../src/compiler/interpreter.js";
import { SELF_TEST_CASES } from "../src/compiler/selfTestCases.js";

// Differential corpus: every program runs through BOTH engines — the full
// compiler pipeline (lexer → parser → analyzer → codegen → linker → stack VM)
// and the tree-walk reference interpreter, which shares the frontend but zero
// backend code. For clean programs the output arrays and statuses must be
// identical; for error programs BOTH engines must throw and both messages
// must contain the pinned substring.
//
// Provenance: the 90 v13 corpus programs (16 examples + 34 embedded suite
// assertions + 40 extra corpus programs), audited case by case against v14
// semantics. Audit results:
//   · "top-level return halts remaining statements" — v13 ran clean; v14
//     rejects top-level return at parse time. Re-pinned as an error.
//   · "function writes caller-scope variable through dynamic chain" — the
//     v13 dynamic-scope pin. v14 is lexical: the function captures its
//     DECLARING scope. The program still prints "2", but because bump()
//     captured the root scope where n lives — not because frames stack
//     dynamically. Renamed and re-commented; a companion case pins the
//     behavior that actually distinguishes lexical from dynamic scope.
//   · Static-analysis promotions (no pin text changed, but the phase moved
//     from runtime/link to analyze): undefined variable, assignment to
//     undeclared variable, arity mismatch, undefined function.
//   · All other v13 expected outputs verified unchanged under v14.
// Entries: { name, source }                        → both run clean, equal
//          { name, source, expectedOutput }        → same, plus an exact pin
//          { name, source, throws: "substring" }   → both throw; both
//                                                    messages contain it

// ── v13 example programs (16) ───────────────────────────────────────────────
const V13_EXAMPLE_PROGRAMS = [
  { name: "Hello World", source: `print("Hello, World!");` },
  {
    name: "Arrays",
    source: `// Array fundamentals: literals, indexing, mutation, push/pop
let a = [10, 20, 30];
print("a = ", a);
print("a[0] = ", a[0], "  a[2] = ", a[2]);
print("len(a) = ", len(a));

a[1] = 99;
print("after a[1]=99: ", a);

a[1] += 1;
print("after a[1]+=1: ", a);

let n = push(a, 40);
print("push(a, 40) → length ", n, ": ", a);

let last = pop(a);
print("pop(a) → ", last, ": ", a);

// Reference semantics: b and a are the SAME array
let b = a;
push(b, 777);
print("push(b, 777) → a is ", a);

// Strings index too
let s = "FORGE";
print("s[0] = ", s[0], "  s[4] = ", s[4]);`,
  },
  {
    name: "Bubble Sort",
    source: `let a = [64, 25, 12, 90, 11, 42, 7, 38];
print("unsorted: ", a);

let n = len(a);
let i = 0;
while (i < n - 1) {
  let j = 0;
  while (j < n - 1 - i) {
    if (a[j] > a[j + 1]) {
      let temp = a[j];
      a[j] = a[j + 1];
      a[j + 1] = temp;
    }
    j += 1;
  }
  i += 1;
}
print("sorted:   ", a);`,
  },
  {
    name: "Sieve",
    source: `// Sieve of Eratosthenes — all primes up to 100
let limit = 100;
let sieve = [];
let i = 0;
while (i <= limit) {
  push(sieve, true);
  i += 1;
}
sieve[0] = false;
sieve[1] = false;

let p = 2;
while (p * p <= limit) {
  if (sieve[p]) {
    let m = p * p;
    while (m <= limit) {
      sieve[m] = false;
      m += p;
    }
  }
  p += 1;
}

let primes = [];
let n = 2;
while (n <= limit) {
  if (sieve[n]) { push(primes, n); }
  n += 1;
}
print(len(primes), " primes up to ", limit, ":");
print(primes);`,
  },
  {
    name: "Binary Search",
    source: `fn binary_search(arr, target) {
  let lo = 0;
  let hi = len(arr) - 1;
  while (lo <= hi) {
    let mid = floor((lo + hi) / 2);
    if (arr[mid] == target) { return mid; }
    if (arr[mid] < target) { lo = mid + 1; }
    else { hi = mid - 1; }
  }
  return -1;
}

let sorted = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];
print("array: ", sorted);
print("find 23 → index ", binary_search(sorted, 23));
print("find 2  → index ", binary_search(sorted, 2));
print("find 91 → index ", binary_search(sorted, 91));
print("find 40 → index ", binary_search(sorted, 40));`,
  },
  {
    name: "Fibonacci",
    source: `let a = 0;
let b = 1;
let i = 0;
while (i < 15) {
  print("fib(", i, ") = ", a);
  let temp = b;
  b = a + b;
  a = temp;
  i += 1;
}`,
  },
  {
    name: "FizzBuzz",
    source: `let i = 1;
while (i <= 30) {
  if (i % 15 == 0) { print("FizzBuzz"); }
  else if (i % 3 == 0) { print("Fizz"); }
  else if (i % 5 == 0) { print("Buzz"); }
  else { print(i); }
  i += 1;
}`,
  },
  {
    name: "Primes",
    source: `fn is_prime(n) {
  if (n < 2) { return false; }
  let d = 2;
  while (d * d <= n) {
    if (n % d == 0) { return false; }
    d += 1;
  }
  return true;
}

let n = 2;
let count = 0;
while (n <= 50) {
  if (is_prime(n)) {
    print(n);
    count += 1;
  }
  n += 1;
}
print(count, " primes found");`,
  },
  {
    name: "String Reverse",
    source: `fn reverse(s) {
  let result = "";
  let i = len(s) - 1;
  while (i >= 0) {
    result = result + s[i];
    i -= 1;
  }
  return result;
}

print(reverse("Hello, World!"));
print(reverse("FORGE"));
print(reverse("racecar"));`,
  },
  {
    name: "Palindrome",
    source: `fn is_palindrome(s) {
  let lo = 0;
  let hi = len(s) - 1;
  while (lo < hi) {
    if (s[lo] != s[hi]) {
      return false;
    }
    lo += 1;
    hi -= 1;
  }
  return true;
}

print("racecar: ", is_palindrome("racecar"));
print("madam: ", is_palindrome("madam"));
print("hello: ", is_palindrome("hello"));
print("civic: ", is_palindrome("civic"));
print("forge: ", is_palindrome("forge"));
print("a: ", is_palindrome("a"));`,
  },
  {
    name: "GCD + LCM",
    source: `fn gcd(a, b) {
  while (b != 0) {
    let temp = b;
    b = a % b;
    a = temp;
  }
  return a;
}

fn lcm(a, b) {
  return floor(a * b / gcd(a, b));
}

print("gcd(48, 18) = ", gcd(48, 18));
print("gcd(100, 75) = ", gcd(100, 75));
print("lcm(12, 8) = ", lcm(12, 8));
print("lcm(7, 5) = ", lcm(7, 5));`,
  },
  {
    name: "Tower of Hanoi",
    source: `fn hanoi(n, from, to, aux) {
  if (n == 1) {
    print("Move disk 1: ", from, " → ", to);
    return 0;
  }
  hanoi(n - 1, from, aux, to);
  print("Move disk ", n, ": ", from, " → ", to);
  hanoi(n - 1, aux, to, from);
  return 0;
}

hanoi(4, "A", "C", "B");`,
  },
  {
    name: "Collatz",
    source: `fn collatz(n) {
  let steps = 0;
  while (n != 1) {
    if (n % 2 == 0) { n = floor(n / 2); }
    else { n = n * 3 + 1; }
    steps += 1;
  }
  return steps;
}

let n = 1;
while (n <= 20) {
  print("collatz(", n, ") = ", collatz(n), " steps");
  n += 1;
}`,
  },
  {
    name: "Type Safety",
    source: `print("type_of(42) = ", type_of(42));
print("type_of(\\"hi\\") = ", type_of("hi"));
print("type_of(true) = ", type_of(true));
print("type_of([1,2]) = ", type_of([1, 2]));
print();
let x = "score: " + 42;
print(x);
print("1 == 1: ", 1 == 1);
print("1 == \\"1\\": ", 1 == "1");
print("true == 1: ", true == 1);
print();
// Arrays compare by REFERENCE
let a = [1, 2];
let b = [1, 2];
let c = a;
print("[1,2] == [1,2]: ", a == b);
print("a == c (same ref): ", a == c);`,
  },
  {
    name: "Escapes",
    source: `print("line1\\nline2");
print("tab:\\there");
print("quote: \\"hi\\"");`,
  },
  {
    name: "Closures (v13) / Nested Functions (v14)",
    source: `fn make_counter() {
  fn count_up(n) {
    return n + 1;
  }
  fn count_down(n) {
    return n - 1;
  }
  fn bounce(n, times) {
    if (times == 0) { return n; }
    if (times % 2 == 0) { return bounce(count_up(n), times - 1); }
    return bounce(count_down(n), times - 1);
  }
  return bounce(0, 10);
}

print("bounce(0, 10) = ", make_counter());`,
  },
];

// ── v13 embedded suite (34 — the 35th, the output-cap predicate, arrives via
//    the auto-appended self-test corpus below) ──────────────────────────────
const V13_EMBEDDED_SUITE = [
  {
    name: "substr(-1) rejects negative start",
    source: `print(substr("hello", -1, 1));`,
    throws: "substr start out of range",
  },
  {
    name: "substr clamps rest-of-string",
    source: `print(substr("hello", 2, 999));`,
    expectedOutput: "llo",
  },
  {
    name: "char_at requires integer index",
    source: `print(char_at("hi", 0.9));`,
    throws: "must be an integer",
  },
  {
    name: "array index requires integer",
    source: `let a = [1, 2]; print(a[0.5]);`,
    throws: "must be an integer",
  },
  {
    name: "arrays print bracketed",
    source: `print([1, 2, 3]);`,
    expectedOutput: "[1, 2, 3]",
  },
  {
    name: "nested arrays, strings quoted inside",
    source: `print([1, "x", [2]]);`,
    expectedOutput: `[1, "x", [2]]`,
  },
  {
    name: "cyclic array prints [...] (no crash)",
    source: `let a = [1]; push(a, a); print(a);`,
    expectedOutput: "[1, [...]]",
  },
  {
    // v13 caught this at link time; v14 catches it earlier, in semantic
    // analysis. Same message, earlier phase.
    name: "undefined fn caught statically (dead branch)",
    source: `if (false) { ghost(); } print("x");`,
    throws: "Undefined function: ghost",
  },
  {
    name: "index read",
    source: `let a = [10, 20, 30]; print(a[1]);`,
    expectedOutput: "20",
  },
  {
    name: "index write",
    source: `let a = [1, 2, 3]; a[1] = 99; print(a);`,
    expectedOutput: "[1, 99, 3]",
  },
  {
    name: "compound index +=",
    source: `let a = [5]; a[0] += 3; print(a[0]);`,
    expectedOutput: "8",
  },
  {
    name: "compound index single-evaluates a[f()]",
    source: `let calls = 0; fn idx() { calls += 1; return 0; } let a = [10]; a[idx()] += 5; print(a[0], " ", calls);`,
    expectedOutput: "15 1",
  },
  {
    name: "push returns new length",
    source: `let a = [1]; print(push(a, 2));`,
    expectedOutput: "2",
  },
  {
    name: "pop returns element",
    source: `let a = [1, 2, 3]; print(pop(a), " ", a);`,
    expectedOutput: "3 [1, 2]",
  },
  {
    name: "pop empty errors",
    source: `let a = []; pop(a);`,
    throws: "pop from empty array",
  },
  {
    name: "reference semantics",
    source: `let a = [1]; let b = a; push(b, 2); print(a);`,
    expectedOutput: "[1, 2]",
  },
  {
    name: "reference equality",
    source: `let a = [1, 2]; let b = [1, 2]; let c = a; print(a == b, " ", a == c);`,
    expectedOutput: "0 1",
  },
  {
    name: "string indexing s[i]",
    source: `let s = "FORGE"; print(s[0], s[4]);`,
    expectedOutput: "FE",
  },
  {
    name: "strings are immutable",
    source: `let s = "ab"; s[0] = "z";`,
    throws: "strings are immutable",
  },
  {
    name: "chained indexing m[i][j]",
    source: `let m = [[1, 2], [3, 4]]; print(m[1][0]);`,
    expectedOutput: "3",
  },
  {
    name: "postfix chain f(x)[i]",
    source: `fn make() { return [7, 8]; } print(make()[1]);`,
    expectedOutput: "8",
  },
  {
    name: "out-of-bounds read errors",
    source: `let a = [1]; print(a[5]);`,
    throws: "Index out of bounds",
  },
  {
    name: "out-of-bounds write suggests push",
    source: `let a = [1]; a[1] = 2;`,
    throws: "use push to append",
  },
  {
    name: "len on arrays",
    source: `print(len([1, 2, 3, 4]));`,
    expectedOutput: "4",
  },
  {
    name: "type_of array",
    source: `print(type_of([]));`,
    expectedOutput: "array",
  },
  {
    name: "invalid assignment target diagnostic",
    source: `5 = 3;`,
    throws: "Invalid assignment target",
  },
  {
    name: "break exits inner loop only",
    source: `let r = 0; let i = 0; while (i < 3) { let j = 0; while (j < 10) { if (j == 2) { break; } j += 1; } r += j; i += 1; } print(r);`,
    expectedOutput: "6",
  },
  {
    name: "continue skips",
    source: `let s = 0; let i = 0; while (i < 10) { i += 1; if (i % 2 == 0) { continue; } s += i; } print(s);`,
    expectedOutput: "25",
  },
  {
    name: "let re-declaration errors",
    source: `let x = 1; let x = 2;`,
    throws: "already declared",
  },
  {
    name: "shadowing across scopes works",
    source: `let x = 1; if (true) { let x = 99; print(x); } print(x);`,
    expectedOutput: "99\n1",
  },
  {
    // v13 threw at runtime via CHECK_ARGC; v14 rejects arity statically.
    // The v13 pin substring still matches the richer analyzer message.
    name: "arity mismatch errors",
    source: `fn f(a) { return a; } f(1, 2);`,
    throws: "Expected 1 argument",
  },
  {
    name: "type error: string minus number",
    source: `print("abc" - 1);`,
    throws: "requires numbers",
  },
  {
    name: "division by zero errors",
    source: `print(1 / 0);`,
    throws: "Division by zero",
  },
  {
    name: "recursion: factorial(8)",
    source: `fn f(n) { if (n <= 1) { return 1; } return n * f(n - 1); } print(f(8));`,
    expectedOutput: "40320",
  },
];

// ── v13 extra corpus (40) ───────────────────────────────────────────────────
const V13_EXTRA_CORPUS = [
  // ── Semantics pins: control flow ─────────────────────────────────────────
  {
    // v13 allowed a top-level return to halt the program (output ["a"]).
    // v14 rejects top-level return at parse time. Pin CHANGED clean → error.
    name: "top-level return is rejected (v13: halted remaining statements)",
    source: `print("a"); return 5; print("dead");`,
    throws: "'return' outside of a function",
  },
  {
    name: "bare return yields 0",
    source: `fn f() { return; } print(f());`,
    expectedOutput: "0",
  },
  {
    name: "fall off function end yields 0",
    source: `fn f() { let x = 1; } print(f());`,
    expectedOutput: "0",
  },
  {
    name: "else-if chain, middle branch",
    source: `let x = 5; if (x < 3) { print("low"); } else if (x < 10) { print("mid"); } else { print("high"); }`,
    expectedOutput: "mid",
  },
  {
    name: "break inside else-if inside nested loops",
    source: `let hits = 0; let i = 0; while (i < 4) { let j = 0; while (j < 4) { if (j == 1) { j += 1; continue; } else if (j == 3) { break; } hits += 1; j += 1; } i += 1; } print(hits);`,
    expectedOutput: "8",
  },
  {
    name: "while condition with function call side effect",
    source: `let n = 0; fn next() { n += 1; return n; } while (next() < 4) { print(n); } print("end ", n);`,
    expectedOutput: "1\n2\n3\nend 4",
  },

  // ── Semantics pins: scope model (v14 LEXICAL — audited from the v13
  //    dynamic-chain pins) ──────────────────────────────────────────────────
  {
    // v13 name: "function writes caller-scope variable through dynamic
    // chain". Same source, same output "2" — but in v14 it works because
    // bump() lexically captured the root scope that later declares n, not
    // because callee frames stack on the caller's.
    name: "function assigns a sibling global via its captured (lexical) scope",
    source: `fn bump() { n += 1; } let n = 0; bump(); bump(); print(n);`,
    expectedOutput: "2",
  },
  {
    // New v14 companion pin: the case where lexical and dynamic scope
    // actually disagree. Under v13 dynamic scope read() would have seen the
    // caller's x = 2; under v14 it must see the global x = 1.
    name: "lexical capture ignores the caller's shadowing local",
    source: `let x = 1; fn read() { return x; } fn caller() { let x = 2; return read(); } print(caller());`,
    expectedOutput: "1",
  },
  {
    name: "same-name functions in sibling branch scopes",
    source: `if (true) { fn f() { return 1; } print(f()); } if (true) { fn f() { return 2; } print(f()); }`,
    expectedOutput: "1\n2",
  },
  {
    name: "shadowing: inner let does not leak",
    source: `let x = 1; if (true) { let x = 99; x += 1; print(x); } print(x);`,
    expectedOutput: "100\n1",
  },
  {
    name: "loop iteration gets a fresh scope frame",
    source: `let i = 0; while (i < 3) { let tmp = i * 10; print(tmp); i += 1; }`,
    expectedOutput: "0\n10\n20",
  },
  {
    name: "forward reference between hoisted functions",
    source: `fn a() { return b() + 1; } fn b() { return 10; } print(a());`,
    expectedOutput: "11",
  },

  // ── Semantics pins: values & operators ───────────────────────────────────
  {
    name: "booleans are 1/0",
    source: `print(true, " ", false, " ", type_of(true));`,
    expectedOutput: "1 0 number",
  },
  {
    name: "logical ops normalize to 1/0",
    source: `print(2 && 3, " ", 0 || 7, " ", !5, " ", !0);`,
    expectedOutput: "1 1 0 1",
  },
  {
    name: "short-circuit skips side effects",
    source: `let c = 0; fn se() { c += 1; return 1; } let x = 0 && se(); let y = 1 || se(); print(c, " ", x, " ", y);`,
    expectedOutput: "0 0 1",
  },
  {
    name: "string + array concatenation formatting",
    source: `print("x" + [1, 2]);`,
    expectedOutput: "x[1, 2]",
  },
  {
    name: "number + string coercion",
    source: `print(1 + "a", " ", "a" + 1.5);`,
    expectedOutput: "1a a1.5",
  },
  {
    name: "modulo of negative numbers (JS semantics)",
    source: `print(-7 % 3, " ", 7 % -3);`,
    expectedOutput: "-1 1",
  },
  {
    name: "float division",
    source: `print(7 / 2, " ", floor(7 / 2));`,
    expectedOutput: "3.5 3",
  },
  {
    name: "unary minus binds tighter than index chain result",
    source: `let a = [5, 9]; print(-a[0], " ", -a[1] + 1);`,
    expectedOutput: "-5 -8",
  },

  // ── Semantics pins: arrays ───────────────────────────────────────────────
  {
    name: "nested array deep write",
    source: `let m = [[1, 2], [3, 4]]; m[0][1] = 9; print(m);`,
    expectedOutput: "[[1, 9], [3, 4]]",
  },
  {
    name: "computed compound index target",
    source: `let a = [1, 2, 3]; let i = 0; a[i + 1] += a[i]; print(a);`,
    expectedOutput: "[1, 3, 3]",
  },
  {
    name: "push/pop interleave with aliasing",
    source: `let a = [1]; let b = a; push(a, 2); push(b, 3); print(pop(a), " ", b);`,
    expectedOutput: "3 [1, 2]",
  },
  {
    name: "array of strings prints with quotes inside",
    source: `let words = ["hi", "yo"]; print(words, " ", words[1]);`,
    expectedOutput: `["hi", "yo"] yo`,
  },
  {
    name: "empty array literal and len",
    source: `let e = []; print(len(e), " ", e);`,
    expectedOutput: "0 []",
  },

  // ── Semantics pins: strings & builtins ───────────────────────────────────
  {
    name: "string index + concat building",
    source: `let s = "FORGE"; let r = ""; let i = len(s) - 1; while (i >= 0) { r = r + s[i]; i -= 1; } print(r);`,
    expectedOutput: "EGROF",
  },
  {
    name: "substr rest-of-string clamp",
    source: `print(substr("hello world", 6, 999));`,
    expectedOutput: "world",
  },
  {
    name: "lone print emits empty line",
    source: `print("a"); print(); print("b");`,
    expectedOutput: "a\n\nb",
  },
  {
    name: "string building 100 iterations",
    source: `let s = ""; let i = 0; while (i < 100) { s = s + "x"; i += 1; } print(len(s));`,
    expectedOutput: "100",
  },

  // ── Recursion depth ──────────────────────────────────────────────────────
  {
    name: "fib(15) recursion",
    source: `fn fib(n) { if (n < 2) { return n; } return fib(n - 1) + fib(n - 2); } print(fib(15));`,
    expectedOutput: "610",
  },
  {
    name: "mutual recursion even/odd",
    source: `fn is_even(n) { if (n == 0) { return 1; } return is_odd(n - 1); } fn is_odd(n) { if (n == 0) { return 0; } return is_even(n - 1); } print(is_even(10), " ", is_odd(7));`,
    expectedOutput: "1 1",
  },

  // ── Error programs: both engines must throw ──────────────────────────────
  {
    // v13: runtime error. v14: rejected by the analyzer before execution.
    name: "undefined variable read",
    source: `print(ghost);`,
    throws: "Undefined variable: ghost",
  },
  {
    // v13: runtime error. v14: rejected by the analyzer before execution.
    name: "assignment before declaration",
    source: `x = 5;`,
    throws: "Assignment to undeclared variable",
  },
  {
    name: "string comparison rejected",
    source: `print("a" < "b");`,
    throws: "requires numbers",
  },
  {
    name: "array arithmetic rejected",
    source: `print([1] + 1);`,
    throws: "requires numbers or strings",
  },
  {
    name: "index into number rejected",
    source: `let n = 5; print(n[0]);`,
    throws: "cannot index number",
  },
  {
    name: "modulo by zero",
    source: `print(5 % 0);`,
    throws: "Modulo by zero",
  },
  {
    name: "compound index OOB fires before RHS matters",
    source: `let a = [1]; a[9] += 1;`,
    throws: "Index out of bounds",
  },
  {
    name: "negative index read",
    source: `let a = [1]; print(a[-1]);`,
    throws: "Index out of bounds",
  },
  {
    name: "char_at on number",
    source: `print(char_at(5, 0));`,
    throws: "char_at() requires string",
  },
  {
    name: "len on number",
    source: `print(len(42));`,
    throws: "len() requires string or array",
  },
];

// ── v14 additions: execution-limit parity ───────────────────────────────────
// The interpreter's node-visit budget is the analogue of the VM's step
// budget. Visit counts and step counts are not comparable, so these programs
// are chosen so the OBSERVABLE result (output + status) is identical no
// matter where inside the loop each engine's budget expires.
const V14_LIMIT_PARITY = [
  {
    name: "silent infinite loop ends with status step_limit on both engines",
    source: `while (true) {}`,
  },
  {
    name: "printing infinite loop hits the output cap, then the step limit",
    source: `while (true) { print(1); }`,
  },
  {
    name: "step-limit override is honored by both engines",
    source: `let i = 0; while (true) { i += 1; }`,
    options: { limits: { maxSteps: 500 } },
  },
];

function runBothEngines(source, options) {
  let vm = null;
  let vmError = null;
  let ref = null;
  let refError = null;
  try {
    vm = compileSource(source, options).result;
  } catch (error) {
    vmError = error;
  }
  try {
    ref = interpretSource(source, options ?? {});
  } catch (error) {
    refError = error;
  }
  return { vm, vmError, ref, refError };
}

function expectParity({ source, throws, expectedOutput, validate, options }) {
  const { vm, vmError, ref, refError } = runBothEngines(source, options);

  if (throws) {
    expect(
      vmError && vmError.message,
      "VM must throw an error containing the pinned substring",
    ).toBeTruthy();
    expect(
      refError && refError.message,
      "interpreter must throw an error containing the pinned substring",
    ).toBeTruthy();
    expect(vmError.message).toContain(throws);
    expect(refError.message).toContain(throws);
    return;
  }

  expect(vmError && vmError.message, "VM threw unexpectedly").toBeNull();
  expect(
    refError && refError.message,
    "interpreter threw unexpectedly",
  ).toBeNull();
  expect(ref.output).toEqual(vm.output);
  expect(ref.status).toBe(vm.status);
  if (expectedOutput !== undefined) {
    expect(vm.output.join("\n")).toBe(expectedOutput);
  }
  if (validate) {
    expect(validate(vm), "VM result failed the case validator").toBe(true);
    expect(validate(ref), "interpreter result failed the case validator").toBe(
      true,
    );
  }
}

describe("differential: v13 example programs (16)", () => {
  for (const testCase of V13_EXAMPLE_PROGRAMS) {
    it(testCase.name, () => expectParity(testCase));
  }
});

describe("differential: v13 embedded suite (34)", () => {
  for (const testCase of V13_EMBEDDED_SUITE) {
    it(testCase.name, () => expectParity(testCase));
  }
});

describe("differential: v13 extra corpus (40)", () => {
  for (const testCase of V13_EXTRA_CORPUS) {
    it(testCase.name, () => expectParity(testCase));
  }
});

describe("differential: v14 execution-limit parity", () => {
  for (const testCase of V14_LIMIT_PARITY) {
    it(testCase.name, () => {
      const { vm, vmError, ref, refError } = runBothEngines(
        testCase.source,
        testCase.options,
      );
      expect(vmError && vmError.message).toBeNull();
      expect(refError && refError.message).toBeNull();
      expect(vm.status).toBe("step_limit");
      expect(ref.status).toBe("step_limit");
      expect(ref.output).toEqual(vm.output);
      expect(vm.output.at(-1)).toMatch(
        /\[(EXECUTION LIMIT REACHED|OUTPUT TRUNCATED AT .+)\]/,
      );
    });
  }
});

// Every self-test case doubles as a differential case: the VM and the
// interpreter must agree on output and status, or both must throw with the
// pinned substring. This keeps the oracle in lockstep with every semantics
// pin the repo adds to selfTestCases.js.
describe("differential: v14 self-test corpus (auto-appended)", () => {
  for (const testCase of SELF_TEST_CASES) {
    it(testCase.name, () =>
      expectParity({
        source: testCase.source,
        throws: testCase.errorIncludes,
        expectedOutput: testCase.expectedOutput,
        validate: testCase.validate,
      }),
    );
  }
});
