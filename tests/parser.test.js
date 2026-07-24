import { describe, it, expect } from "vitest";
import { lex } from "../src/compiler/lexer.js";
import { parse } from "../src/compiler/parser.js";

const ast = (src) => parse(lex(src));

describe("parser", () => {
  it("respects arithmetic precedence: 1 + 2 * 3", () => {
    const p = ast(`let x = 1 + 2 * 3;`);
    const v = p.body[0].value;
    expect(v.op).toBe("+");
    expect(v.right.op).toBe("*");
  });

  it("parses comparison below equality: a == b < c", () => {
    const v = ast(`let x = a == b < c;`).body[0].value;
    expect(v.op).toBe("==");
    expect(v.right.op).toBe("<");
  });

  it("parses && above ||: a || b && c", () => {
    const v = ast(`let x = a || b && c;`).body[0].value;
    expect(v.op).toBe("||");
    expect(v.right.op).toBe("&&");
  });

  it("parses chained unary: !!x and --x", () => {
    const notNot = ast(`let a = !!x;`).body[0].value;
    expect(notNot.op).toBe("!");
    expect(notNot.expr.op).toBe("!");
    const negNeg = ast(`let b = --x;`).body[0].value;
    expect(negNeg.op).toBe("-");
    expect(negNeg.expr.op).toBe("-");
  });

  it("parses else-if chains as nested If nodes", () => {
    const p = ast(`if (a) { } else if (b) { } else { }`);
    expect(p.body[0].type).toBe("If");
    expect(p.body[0].else.type).toBe("If");
    expect(p.body[0].else.else.type).toBe("Block");
  });

  it("desugars compound assignment into BinOp", () => {
    const p = ast(`x += 2;`).body[0];
    expect(p.type).toBe("Assignment");
    expect(p.value).toMatchObject({
      type: "BinOp",
      op: "+",
      left: { name: "x" },
    });
  });

  it("keeps op on IndexAssignment for single-evaluation codegen", () => {
    const p = ast(`a[0] *= 3;`).body[0];
    expect(p.type).toBe("IndexAssignment");
    expect(p.op).toBe("*");
  });

  it("parses postfix chains: f(x)[0][1]", () => {
    const v = ast(`let y = f(x)[0][1];`).body[0].value;
    expect(v.type).toBe("Index");
    expect(v.array.type).toBe("Index");
    expect(v.array.array.type).toBe("Call");
  });

  it("parses empty and nested array literals", () => {
    const v = ast(`let a = [[], [1, [2]]];`).body[0].value;
    expect(v.type).toBe("ArrayLiteral");
    expect(v.elements[0].elements).toHaveLength(0);
    expect(v.elements[1].elements[1].type).toBe("ArrayLiteral");
  });

  it("rejects assignment to a call result", () => {
    expect(() => ast(`f() = 3;`)).toThrow("Invalid assignment target");
  });

  it("rejects duplicate function parameters", () => {
    expect(() => ast(`fn f(a, a) { }`)).toThrow("Duplicate parameter 'a'");
  });

  it("rejects redefining built-ins", () => {
    expect(() => ast(`fn len(x) { }`)).toThrow("Cannot redefine built-in");
  });

  it("reports expected-token errors with position", () => {
    expect(() => ast(`let = 3;`)).toThrow(/Expected IDENT.*line 1/);
  });

  it("parses return without a value", () => {
    const p = ast(`fn f() { return; }`);
    expect(p.body[0].body.body[0]).toEqual({ type: "Return", value: null });
  });
});
