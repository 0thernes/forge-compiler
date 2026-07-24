import { describe, it, expect } from "vitest";
import { lex } from "../src/compiler/lexer.js";
import { T } from "../src/compiler/constants.js";

const types = (src) => lex(src).map((t) => t.type);

describe("lexer", () => {
  it("tokenizes a representative statement", () => {
    expect(types(`let x = 1 + 2.5;`)).toEqual([
      T.LET,
      T.IDENT,
      T.ASSIGN,
      T.NUM,
      T.PLUS,
      T.NUM,
      T.SEMI,
      T.EOF,
    ]);
  });

  it("distinguishes two-char operators from their prefixes", () => {
    expect(types(`a <= b == c != d >= e && f || !g += 1;`)).toEqual([
      T.IDENT,
      T.LTE,
      T.IDENT,
      T.EQ,
      T.IDENT,
      T.NEQ,
      T.IDENT,
      T.GTE,
      T.IDENT,
      T.AND,
      T.IDENT,
      T.OR,
      T.NOT,
      T.IDENT,
      T.PLUS_EQ,
      T.NUM,
      T.SEMI,
      T.EOF,
    ]);
  });

  it("tracks line/col positions across newlines", () => {
    const toks = lex(`let a = 1;\nlet b = 2;`);
    const bTok = toks.find((t) => t.value === "b");
    expect(bTok.pos).toEqual({ line: 2, col: 5 });
  });

  it("skips // comments to end of line", () => {
    expect(types(`// nothing here\nlet x = 1;`)).toEqual([
      T.LET,
      T.IDENT,
      T.ASSIGN,
      T.NUM,
      T.SEMI,
      T.EOF,
    ]);
  });

  it("decodes escape sequences in strings", () => {
    const tok = lex(`"a\\n\\t\\r\\\\\\"\\0z"`)[0];
    expect(tok.type).toBe(T.STR);
    expect(tok.value).toBe('a\n\t\r\\"\0z');
  });

  it("rejects unknown escape sequences", () => {
    expect(() => lex(`"\\q"`)).toThrow("Unknown escape sequence");
  });

  it("rejects unterminated strings", () => {
    expect(() => lex(`"abc`)).toThrow("Unterminated string");
  });

  it("rejects an escape at end of input", () => {
    expect(() => lex(`"abc\\`)).toThrow("Unterminated escape");
  });

  it("rejects numbers with multiple decimal points", () => {
    expect(() => lex(`1.2.3`)).toThrow("multiple decimal points");
  });

  it("rejects trailing decimal points", () => {
    expect(() => lex(`5.`)).toThrow("trailing decimal point");
  });

  it("rejects unexpected characters with position info", () => {
    expect(() => lex(`let x = @;`)).toThrow("Unexpected char '@' at line 1:9");
    expect(() => lex("😀")).toThrow("Unexpected char '😀' at line 1:1");
  });

  it("treats keywords case-sensitively (While is an identifier)", () => {
    expect(types(`While`)).toEqual([T.IDENT, T.EOF]);
  });

  it("lexes underscore-led identifiers", () => {
    const toks = lex(`_private_1`);
    expect(toks[0]).toMatchObject({ type: T.IDENT, value: "_private_1" });
  });
});
