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
    name: "differential call depth stops before host stack exhaustion",
    kind: "resource-policy",
    source: `fn recurse(value) {
  if (value == 0) { return 0; }
  return recurse(value - 1);
}
print(recurse(300));`,
    errorIncludes: "Call depth exceeds the 256 frame limit",
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

// ── Ported v13 differential corpus ──────────────────────────────────────────
// Provenance: the 90 v13 corpus programs (16 example programs + 34 embedded
// suite assertions + 40 extra corpus programs), audited case by case against
// v14 semantics, plus 3 v14 execution-limit-parity programs. Audit results:
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
// Entries whose source text duplicates an example, self-test pin, or
// regression case above are dropped by dedupeBySource at the bottom of this
// module. Ported entries use { throws } for error pins; the merge below maps
// that onto this corpus's { errorIncludes } contract.
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

const exampleCases = Object.entries(EXAMPLES).map(([name, source]) => ({
  name: `example · ${name}`,
  source,
  kind: "backend",
}));

const selfTestCases = SELF_TEST_CASES.map((testCase) => ({
  name: `self-test · ${testCase.name}`,
  source: testCase.source,
  kind: sharedFrontendSelfTests.has(testCase.name)
    ? "shared-frontend"
    : "backend",
  ...(testCase.expectedOutput !== undefined
    ? { expectedOutput: testCase.expectedOutput }
    : {}),
  ...(testCase.errorIncludes ? { errorIncludes: testCase.errorIncludes } : {}),
  ...(typeof testCase.validate === "function"
    ? { validate: testCase.validate }
    : {}),
}));

const portedCases = [
  ...V13_EXAMPLE_PROGRAMS.map((testCase) => ({
    ...testCase,
    name: `v13 example · ${testCase.name}`,
  })),
  ...V13_EMBEDDED_SUITE.map((testCase) => ({
    ...testCase,
    name: `v13 suite · ${testCase.name}`,
  })),
  ...V13_EXTRA_CORPUS.map((testCase) => ({
    ...testCase,
    name: `v13 corpus · ${testCase.name}`,
  })),
].map(({ throws, ...testCase }) => ({
  kind: "backend",
  ...testCase,
  ...(throws ? { errorIncludes: throws } : {}),
}));

// The interpreter's node-visit budget is the analogue of the VM's step
// budget. Visit counts and step counts are not comparable, so these programs
// are chosen so the OBSERVABLE result (output + status) is identical no
// matter where inside the loop each engine's budget expires.
const executionLimitMarker =
  /\[(EXECUTION LIMIT REACHED|OUTPUT TRUNCATED AT .+)\]/;

const limitParityCases = V14_LIMIT_PARITY.map((testCase) => ({
  ...testCase,
  name: `limit parity · ${testCase.name}`,
  kind: "resource-policy",
  expectedStatus: "step_limit",
  validate: (result) => executionLimitMarker.test(result.output.at(-1) ?? ""),
}));

function dedupeBySource(cases) {
  const seenSources = new Set();
  return cases.filter((testCase) => {
    if (seenSources.has(testCase.source)) return false;
    seenSources.add(testCase.source);
    return true;
  });
}

export const DIFFERENTIAL_CASES = Object.freeze(
  dedupeBySource([
    ...exampleCases,
    ...selfTestCases,
    ...regressionCases.map((testCase) => ({
      kind: "backend",
      ...testCase,
    })),
    ...portedCases,
    ...limitParityCases,
  ]),
);
