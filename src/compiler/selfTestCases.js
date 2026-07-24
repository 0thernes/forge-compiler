export const SELF_TEST_CASES = Object.freeze([
  {
    name: "substr rejects a negative start",
    source: `print(substr("hello", -1, 1));`,
    errorIncludes: "substr start out of range",
  },
  {
    name: "substr clamps at the end of the string",
    source: `print(substr("hello", 2, 999));`,
    expectedOutput: "llo",
  },
  {
    name: "char_at requires an integer index",
    source: `print(char_at("hi", 0.9));`,
    errorIncludes: "must be an integer",
  },
  {
    name: "array indexes must be integers",
    source: `let a = [1, 2]; print(a[0.5]);`,
    errorIncludes: "must be an integer",
  },
  {
    name: "arrays print in bracket notation",
    source: `print([1, 2, 3]);`,
    expectedOutput: "[1, 2, 3]",
  },
  {
    name: "nested arrays quote string members",
    source: `print([1, "x", [2]]);`,
    expectedOutput: `[1, "x", [2]]`,
  },
  {
    name: "quotes are escaped inside formatted arrays",
    source: `print(["a\\"b"]);`,
    expectedOutput: `["a\\"b"]`,
  },
  {
    name: "cyclic arrays format without recursion failure",
    source: `let a = [1]; push(a, a); print(a);`,
    expectedOutput: "[1, [...]]",
  },
  {
    name: "undefined functions fail semantic analysis in dead code",
    source: `if (false) { ghost(); } print("x");`,
    errorIncludes: "Undefined function: ghost",
  },
  {
    name: "array index read",
    source: `let a = [10, 20, 30]; print(a[1]);`,
    expectedOutput: "20",
  },
  {
    name: "array index write",
    source: `let a = [1, 2, 3]; a[1] = 99; print(a);`,
    expectedOutput: "[1, 99, 3]",
  },
  {
    name: "compound array assignment",
    source: `let a = [5]; a[0] += 3; print(a[0]);`,
    expectedOutput: "8",
  },
  {
    name: "compound array assignment evaluates its index once",
    source: `let calls = 0; fn index() { calls += 1; return 0; } let a = [10]; a[index()] += 5; print(a[0], " ", calls);`,
    expectedOutput: "15 1",
  },
  {
    name: "push returns the new length",
    source: `let a = [1]; print(push(a, 2));`,
    expectedOutput: "2",
  },
  {
    name: "pop returns and removes the last element",
    source: `let a = [1, 2, 3]; print(pop(a), " ", a);`,
    expectedOutput: "3 [1, 2]",
  },
  {
    name: "pop rejects an empty array",
    source: `let a = []; pop(a);`,
    errorIncludes: "pop from empty array",
  },
  {
    name: "arrays use reference semantics",
    source: `let a = [1]; let b = a; push(b, 2); print(a);`,
    expectedOutput: "[1, 2]",
  },
  {
    name: "array equality is reference equality",
    source: `let a = [1, 2]; let b = [1, 2]; let c = a; print(a == b, " ", a == c);`,
    expectedOutput: "0 1",
  },
  {
    name: "strings support indexing",
    source: `let value = "FORGE"; print(value[0], value[4]);`,
    expectedOutput: "FE",
  },
  {
    name: "strings are immutable",
    source: `let value = "ab"; value[0] = "z";`,
    errorIncludes: "strings are immutable",
  },
  {
    name: "index operations can be chained",
    source: `let matrix = [[1, 2], [3, 4]]; print(matrix[1][0]);`,
    expectedOutput: "3",
  },
  {
    name: "function results can be indexed",
    source: `fn make() { return [7, 8]; } print(make()[1]);`,
    expectedOutput: "8",
  },
  {
    name: "out-of-bounds reads fail",
    source: `let a = [1]; print(a[5]);`,
    errorIncludes: "Index out of bounds",
  },
  {
    name: "out-of-bounds writes suggest push",
    source: `let a = [1]; a[1] = 2;`,
    errorIncludes: "use push to append",
  },
  {
    name: "len accepts arrays",
    source: `print(len([1, 2, 3, 4]));`,
    expectedOutput: "4",
  },
  {
    name: "type_of recognizes arrays",
    source: `print(type_of([]));`,
    expectedOutput: "array",
  },
  {
    name: "invalid assignment targets have a direct diagnostic",
    source: `5 = 3;`,
    errorIncludes: "Invalid assignment target",
  },
  {
    name: "break exits only the innermost loop",
    source: `let result = 0; let i = 0; while (i < 3) { let j = 0; while (j < 10) { if (j == 2) { break; } j += 1; } result += j; i += 1; } print(result);`,
    expectedOutput: "6",
  },
  {
    name: "continue skips the remainder of an iteration",
    source: `let sum = 0; let i = 0; while (i < 10) { i += 1; if (i % 2 == 0) { continue; } sum += i; } print(sum);`,
    expectedOutput: "25",
  },
  {
    name: "duplicate let declarations fail statically",
    source: `let x = 1; let x = 2;`,
    errorIncludes: "already declared",
  },
  {
    name: "duplicate declarations fail even in dead code",
    source: `if (false) { let x = 1; let x = 2; }`,
    errorIncludes: "already declared",
  },
  {
    name: "nested blocks can shadow variables",
    source: `let x = 1; if (true) { let x = 99; print(x); } print(x);`,
    expectedOutput: "99\n1",
  },
  {
    name: "function arity is checked statically",
    source: `fn identity(value) { return value; } identity(1, 2);`,
    errorIncludes: "expects 1 argument",
  },
  {
    name: "arity errors are found in dead code",
    source: `fn identity(value) { return value; } if (false) { identity(); }`,
    errorIncludes: "expects 1 argument",
  },
  {
    name: "string subtraction is rejected",
    source: `print("abc" - 1);`,
    errorIncludes: "requires numbers",
  },
  {
    name: "division by zero is rejected",
    source: `print(1 / 0);`,
    errorIncludes: "Division by zero",
  },
  {
    name: "recursive factorial",
    source: `fn factorial(n) { if (n <= 1) { return 1; } return n * factorial(n - 1); } print(factorial(8));`,
    expectedOutput: "40320",
  },
  {
    name: "large output is bounded",
    source: `let i = 0; while (i < 5100) { print(i); i += 1; }`,
    validate(result) {
      return (
        result.output.length === 5001 &&
        result.output.at(-1) === "[OUTPUT TRUNCATED AT 5000 LINES]" &&
        result.output[0] === "0"
      );
    },
  },
  {
    name: "function lookup is lexical rather than dynamic",
    source: `let x = 1; fn read() { return x; } fn caller() { let x = 2; return read(); } print(caller());`,
    expectedOutput: "1",
  },
  {
    name: "nested functions capture and update outer variables",
    source: `fn outer() { let x = 1; fn add() { x += 1; return x; } add(); return add(); } print(outer());`,
    expectedOutput: "3",
  },
  {
    name: "nested sibling functions support mutual recursion",
    source: `fn outer(n) { fn even(x) { if (x == 0) { return true; } return odd(x - 1); } fn odd(x) { if (x == 0) { return false; } return even(x - 1); } return even(n); } print(outer(10), " ", outer(9));`,
    expectedOutput: "1 0",
  },
  {
    name: "Object prototype names are valid identifiers",
    source: `let constructor = 1; let toString = 2; let __proto__ = 3; print(constructor + toString + __proto__);`,
    expectedOutput: "6",
  },
  {
    name: "generated labels cannot collide with user functions",
    source: `fn while_0() { return 42; } fn else_0() { return 7; } let i = 0; while (i < 1) { i += 1; } if (i == 1) { print(while_0() + else_0()); }`,
    expectedOutput: "49",
  },
  {
    name: "duplicate functions are rejected",
    source: `fn same() { return 1; } fn same() { return 2; }`,
    errorIncludes: "already declared",
  },
  {
    name: "top-level return is rejected",
    source: `return 1;`,
    errorIncludes: "outside of a function",
  },
  {
    name: "top-level globals survive normal termination",
    source: `let constructor = 7; print(constructor);`,
    expectedOutput: "7",
    validate(result) {
      return result.globals.constructor === 7;
    },
  },
  {
    name: "variables cannot be read before declaration",
    source: `print(value); let value = 1;`,
    errorIncludes: "used before its declaration",
  },
  {
    name: "let initializers cannot reference their own binding",
    source: `let value = value;`,
    errorIncludes: "used before its declaration",
  },
  {
    name: "dead branches still enforce declaration order",
    source: `if (false) { print(value); let value = 1; }`,
    errorIncludes: "used before its declaration",
  },
  {
    name: "Unicode string operations are explicit UTF-16 code-unit operations",
    source: `print(len("😀"));`,
    expectedOutput: "2",
  },
  {
    name: "comparison type errors name the surface operator",
    source: `print(1 < "2");`,
    errorIncludes: "'<' requires numbers",
  },
  {
    name: "char_at returns the code unit at a valid index",
    source: `print(char_at("hi", 1));`,
    expectedOutput: "i",
  },
  {
    name: "char_at rejects an out-of-bounds index",
    source: `print(char_at("hi", 2));`,
    errorIncludes: "Index out of bounds",
  },
  {
    name: "runtime arithmetic overflow is rejected",
    source: `let x = 999999999; let i = 0; while (i < 12) { x = x * x; i += 1; }`,
    errorIncludes: "Numeric overflow during '*'",
  },
  {
    name: "control characters are escaped inside formatted arrays",
    source: `print(["a\\nb", "c\\td", "e\\rf", "g\\0h"]);`,
    expectedOutput: `["a\\nb", "c\\td", "e\\rf", "g\\0h"]`,
  },
  {
    name: "'+' rejects two arrays",
    source: `let x = [1] + [2];`,
    errorIncludes: "requires numbers or strings",
  },
  {
    name: "len rejects numbers",
    source: `len(5);`,
    errorIncludes: "len() requires string or array",
  },
  {
    name: "string reads are bounds-checked",
    source: `let s = "ab"; print(s[5]);`,
    errorIncludes: "string length 2",
  },
  {
    name: "indexing a number fails",
    source: `let n = 5; print(n[0]);`,
    errorIncludes: "cannot index number",
  },
  {
    name: "index-assigning a number fails",
    source: `let n = 5; n[0] = 1;`,
    errorIncludes: "cannot index-assign",
  },
  {
    name: "substr rejects a negative count",
    source: `print(substr("abc", 0, -1));`,
    errorIncludes: "substr count must be non-negative",
  },
  {
    name: "push requires an array",
    source: `push(1, 2);`,
    errorIncludes: "push() requires array",
  },
  {
    name: "pop requires an array",
    source: `pop(5);`,
    errorIncludes: "pop() requires array",
  },
  {
    name: "function bodies may read variables declared later in the block",
    source: `fn f() { return x; } let x = 5; print(f());`,
    expectedOutput: "5",
  },
  {
    name: "nested functions may read later declarations in enclosing scopes",
    source: `fn outer() { fn inner() { return y; } return inner(); } let y = 9; print(outer());`,
    expectedOutput: "9",
  },
  {
    name: "function bodies may assign variables declared later in the block",
    source: `fn bump() { total += 1; return total; } let total = 10; print(bump());`,
    expectedOutput: "11",
  },
  {
    name: "calling before the captured declaration runs still fails at runtime",
    source: `fn f() { return x; } print(f()); let x = 5;`,
    errorIncludes: "Undefined variable: x",
  },
  {
    name: "a parenthesized identifier remains callable",
    source: `fn f(n) { return n + 1; } print((f)(1));`,
    expectedOutput: "2",
  },
  {
    name: "unexpected astral characters keep their full code point in diagnostics",
    source: `let 𝑥 = 1;`,
    errorIncludes: "Unexpected char '𝑥'",
  },
  {
    name: "string concatenation is lossless up to the string limit",
    source: `let s = "aaaaaaaaaa"; let i = 0; while (i < 12) { s = s + s; i += 1; } print(len(s + "!"));`,
    expectedOutput: "40961",
  },
  {
    name: "array concatenation renders every element",
    source: `let a = []; let i = 0; while (i < 1200) { push(a, 1); i += 1; } print(len("" + a));`,
    expectedOutput: "3600",
  },
  {
    name: "concatenating a self-referential array fails loudly",
    source: `let a = [1]; push(a, a); let s = "" + a;`,
    errorIncludes: "contains itself",
  },
  {
    name: "concatenating an over-deep array fails loudly",
    source: `let a = []; let i = 0; while (i < 40) { a = [a]; i += 1; } let s = "" + a;`,
    errorIncludes: "nested deeper",
  },
  {
    name: "numeric overflow is rejected",
    source: `print(9999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999);`,
    errorIncludes: "outside the finite number range",
  },
]);
