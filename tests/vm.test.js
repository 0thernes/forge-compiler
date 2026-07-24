import { describe, it, expect } from "vitest";
import { compileAndRun, lex, parse, codegen, link } from "../src/compiler/index.js";

const run = (src, maxSteps) => compileAndRun(src, maxSteps).output;

describe("VM semantics", () => {
  it("short-circuits && (right side never evaluated)", () => {
    expect(run(`let hit = 0; fn f() { hit = 1; return 1; } let x = false && f(); print(hit);`)).toEqual(["0"]);
  });

  it("short-circuits || (right side never evaluated)", () => {
    expect(run(`let hit = 0; fn f() { hit = 1; return 1; } let x = true || f(); print(hit);`)).toEqual(["0"]);
  });

  it("normalizes logical results to 1/0", () => {
    expect(run(`print(5 && 7, " ", 0 || 3, " ", !0, " ", !9);`)).toEqual(["1 1 1 0"]);
  });

  it("supports forward references between functions", () => {
    expect(run(`fn a(n) { return b(n) + 1; } fn b(n) { return n * 2; } print(a(5));`)).toEqual(["11"]);
  });

  it("supports mutual recursion (is_even/is_odd)", () => {
    expect(run(`
      fn is_even(n) { if (n == 0) { return true; } return is_odd(n - 1); }
      fn is_odd(n) { if (n == 0) { return false; } return is_even(n - 1); }
      print(is_even(10), " ", is_odd(7));
    `)).toEqual(["1 1"]);
  });

  it("nested fns shadow outer fns of the same name", () => {
    expect(run(`
      fn who() { return "outer"; }
      fn caller() {
        fn who() { return "inner"; }
        return who();
      }
      print(caller(), " ", who());
    `)).toEqual(["inner outer"]);
  });

  it("functions without explicit return produce 0", () => {
    expect(run(`fn f() { } print(f());`)).toEqual(["0"]);
  });

  it("return deep inside nested blocks unwinds scopes correctly", () => {
    expect(run(`
      fn f(n) {
        let acc = 100;
        while (true) {
          if (n > 0) {
            let inner = 1;
            return acc + inner + n;
          }
          return acc;
        }
      }
      print(f(5), " ", f(0));
    `)).toEqual(["106 100"]);
  });

  it("break from a nested block inside a loop exits cleanly", () => {
    expect(run(`
      let i = 0; let out = 0;
      while (i < 10) {
        i += 1;
        if (i == 3) { { let x = 1; break; } }
        out = i;
      }
      print(i, " ", out);
    `)).toEqual(["3 2"]);
  });

  it("string concatenation formats arrays inside strings", () => {
    expect(run(`print("arr: " + [1, "x"]);`)).toEqual([`arr: [1, "x"]`]);
  });

  it("unary minus rejects strings", () => {
    expect(() => run(`print(-"abc");`)).toThrow("'-' requires number");
  });

  it("modulo by zero errors", () => {
    expect(() => run(`print(5 % 0);`)).toThrow("Modulo by zero");
  });

  it("comparison operators reject mixed types", () => {
    expect(() => run(`print(1 < "2");`)).toThrow("requires numbers");
  });

  it("calling with wrong arity in a nested call reports correctly", () => {
    expect(() => run(`fn g(a, b) { return a + b; } print(g(1));`)).toThrow("Expected 2 argument(s) but got 1");
  });

  it("undefined variables error at runtime with the name", () => {
    expect(() => run(`print(missing);`)).toThrow("Undefined variable: missing");
  });

  it("assignment to undeclared variables suggests let", () => {
    expect(() => run(`ghost = 1;`)).toThrow("Use 'let ghost = ...' first");
  });

  it("respects an explicit step budget", () => {
    const out = run(`let i = 0; while (true) { i += 1; }`, 1000);
    expect(out[out.length - 1]).toBe("[EXECUTION LIMIT REACHED]");
  });

  it("deep recursion works without host-stack overflow (iterative VM)", () => {
    expect(run(`fn down(n) { if (n == 0) { return 0; } return down(n - 1); } print(down(20000));`)).toEqual(["0"]);
  });

  it("exposes final globals for the inspector", () => {
    const r = compileAndRun(`let a = 1; let s = "x"; let arr = [1, 2];`);
    expect(r.globals).toMatchObject({ a: 1, s: "x", arr: [1, 2] });
  });

  it("trace records pc/op and stack snapshots", () => {
    const r = compileAndRun(`print(1 + 2);`);
    const add = r.trace.find(t => t.op === "ADD");
    expect(add.stackBefore).toEqual([1, 2]);
    expect(add.stackAfter).toEqual([3]);
  });
});

describe("linker", () => {
  it("resolves every jump/call to a numeric target", () => {
    const code = link(codegen(parse(lex(`fn f() { return 1; } if (f()) { print("y"); }`))));
    for (const inst of code) {
      if (["JMP", "JZ", "JNZ", "CALL"].includes(inst.op)) {
        expect(typeof inst.target).toBe("number");
      }
    }
  });

  it("strips LABEL pseudo-instructions from linked code", () => {
    const code = link(codegen(parse(lex(`if (1) { print("a"); }`))));
    expect(code.some(i => i.op === "LABEL")).toBe(false);
  });

  it("catches undefined functions statically, even in dead code", () => {
    expect(() => link(codegen(parse(lex(`if (false) { nope(); }`))))).toThrow("Undefined function: nope");
  });
});
