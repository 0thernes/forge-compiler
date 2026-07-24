import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { BUILTINS, KEYWORDS } from "./constants.js";
import {
  compileSource,
  execute,
  formatValue,
  lex,
  link,
  parse,
  renderAst,
  runSource,
  TOKEN,
} from "./index.js";
import { EXAMPLES } from "./examples.js";
import { runSelfTest } from "./selfTest.js";
import { SELF_TEST_CASES } from "./selfTestCases.js";
import { link as compatibilityLink } from "./linker.js";

describe("FORGE v14 compatibility corpus", () => {
  for (const testCase of SELF_TEST_CASES) {
    it(testCase.name, () => {
      if (testCase.errorIncludes) {
        expect(() => compileSource(testCase.source)).toThrow(
          testCase.errorIncludes,
        );
        return;
      }

      const compilation = compileSource(testCase.source);
      expect(compilation.result.status).toBe("halted");
      if (testCase.expectedOutput !== undefined) {
        expect(compilation.result.output.join("\n")).toBe(
          testCase.expectedOutput,
        );
      }
      if (testCase.validate) {
        expect(testCase.validate(compilation.result, compilation)).toBe(true);
      }
    });
  }
});

describe("example programs", () => {
  for (const [name, source] of Object.entries(EXAMPLES)) {
    it(`${name} completes with balanced VM stacks`, () => {
      const result = runSource(source);
      expect(result.status).toBe("halted");
      expect(result.callDepth).toBe(0);
      expect(result.stackDepth).toBe(0);
    });
  }

  it("keeps representative example output stable", () => {
    expect(runSource(EXAMPLES["Hello World"]).output).toEqual([
      "Hello, World!",
    ]);
    expect(runSource(EXAMPLES["Bubble Sort"]).output.at(-1)).toBe(
      "sorted:   [7, 11, 12, 25, 38, 42, 64, 90]",
    );
    expect(runSource(EXAMPLES["Lexical Scope"]).output).toEqual([
      "global from caller = 10",
      "captured counter = 42",
    ]);
  });
});

describe("pipeline contracts", () => {
  it("returns every compiler stage and timing", () => {
    const compilation = compileSource(`let answer = 42; print(answer);`);
    expect(compilation.tokens.at(-1).type).toBe(TOKEN.EOF);
    expect(compilation.ast.type).toBe("Program");
    expect(compilation.analysis).toMatchObject({
      variables: 1,
      functions: 0,
      calls: 0,
    });
    expect(compilation.assembly.length).toBeGreaterThan(0);
    expect(compilation.instructionAddresses).toHaveLength(
      compilation.assembly.length,
    );
    expect(compilation.result.output).toEqual(["42"]);
    expect(compilation.timings.total).toBeGreaterThanOrEqual(0);
  });

  it("can stop after compilation without executing", () => {
    const compilation = compileSource(`print("compiled");`, { run: false });
    expect(compilation.result).toBeNull();
    expect(compilation.assembly.length).toBeGreaterThan(0);
  });

  it("renders a readable AST", () => {
    const tokens = lex(`let value = [1, "x"];`);
    const ast = parse(tokens);
    analyze(ast);
    expect(renderAst(ast)).toContain("Let value");
    expect(renderAst(ast)).toContain('String("x")');
  });

  it("renders every statement and expression family without host objects", () => {
    const compilation = compileSource(
      `let values = [1, "x", true];
fn reduce(value) {
  while (value > 0) {
    if (!false) { value -= 1; continue; }
    else { break; }
  }
  return -value;
}
values[0] += reduce(values[0]);
reduce(0);
print(values[0]);`,
      { run: false },
    );
    const rendered = renderAst(compilation.ast);
    for (const fragment of [
      "Program",
      "Let values",
      "Array[3]",
      "Function reduce",
      "While",
      "If",
      "Unary [!]",
      "Continue",
      "Break",
      "Return",
      "Unary [-]",
      "IndexAssign [+=]",
      "Call reduce",
      "ExpressionStatement",
      "Print",
    ]) {
      expect(rendered).toContain(fragment);
    }
    expect(renderAst(null)).toBe("null");
    expect(renderAst({ type: "FutureNode", value: 1 })).toContain("FutureNode");
  });

  it("preserves structured phase diagnostics", () => {
    try {
      compileSource(`print(missing);`);
      throw new Error("Expected compilation to fail");
    } catch (error) {
      expect(error.phase).toBe("analyze");
      expect(error.position).toEqual({ line: 1, column: 7 });
      expect(error.code).toBe("ANALYZE_UNDEFINED_VARIABLE");
    }
  });
});

describe("linker integrity", () => {
  it("does not mutate assembly while resolving targets", () => {
    const assembly = [
      { opcode: "LABEL", argument: "$$start" },
      { opcode: "JUMP", argument: "$$start" },
    ];
    const before = structuredClone(assembly);
    const linked = link(assembly);
    expect(assembly).toEqual(before);
    expect(linked[0]).toMatchObject({
      opcode: "JUMP",
      argument: "$$start",
      target: 0,
    });
  });

  it("keeps the legacy linker import on the canonical implementation", () => {
    const assembly = [
      { opcode: "LABEL", argument: "$$start" },
      { opcode: "JUMP", argument: "$$start" },
    ];
    const before = structuredClone(assembly);
    expect(compatibilityLink(assembly)).toEqual(link(assembly));
    expect(assembly).toEqual(before);
  });

  it("rejects duplicate labels", () => {
    expect(() =>
      link([
        { opcode: "LABEL", argument: "$$same" },
        { opcode: "LABEL", argument: "$$same" },
      ]),
    ).toThrow("Duplicate label");
  });

  it("rejects unresolved branches and calls", () => {
    expect(() => link([{ opcode: "JUMP", argument: "$$missing" }])).toThrow(
      "unresolved label",
    );
    expect(() => link([{ opcode: "CALL", argument: "missing" }])).toThrow(
      "Undefined function",
    );
  });
});

describe("execution budgets and historical trace", () => {
  it("does not report a limit when HALT is the final permitted step", () => {
    const baseline = compileSource(`print("done");`);
    const exact = compileSource(`print("done");`, {
      limits: { maxSteps: baseline.result.steps },
    });
    expect(exact.result.status).toBe("halted");
    expect(exact.result.output).toEqual(["done"]);

    const limited = compileSource(`print("done");`, {
      limits: { maxSteps: baseline.result.steps - 1 },
    });
    expect(limited.result.status).toBe("step_limit");
    expect(limited.result.output.at(-1)).toBe("[EXECUTION LIMIT REACHED]");
  });

  it("keeps trace snapshots stable after array mutation", () => {
    const result = runSource(`let a = [1]; print(a); a[0] = 2; print(a);`);
    const creation = result.trace.find(
      (entry) => entry.opcode === "MAKE_ARRAY",
    );
    expect(creation.stackAfter).toEqual([[1]]);
    expect(result.output).toEqual(["[1]", "[2]"]);
    expect(creation.stackAfter).toEqual([[1]]);
  });

  it("caps trace stack snapshots", () => {
    const result = execute(
      [
        { opcode: "PUSH", argument: 1 },
        { opcode: "PUSH", argument: 2 },
        { opcode: "PUSH", argument: 3 },
        { opcode: "HALT" },
      ],
      { maxTraceStackItems: 2 },
    );
    expect(result.trace.at(-1).stackBefore[0]).toContain("earlier");
  });

  it("enforces call depth, source, token, parser, and array limits", () => {
    expect(() =>
      compileSource(`fn recurse(n) { return recurse(n + 1); } recurse(0);`, {
        limits: { maxCallDepth: 4 },
      }),
    ).toThrow("Call depth exceeds");
    expect(() =>
      compileSource(`print("too long");`, {
        limits: { maxSourceLength: 5 },
      }),
    ).toThrow("Source exceeds");
    expect(() =>
      compileSource(`let a = 1; let b = 2;`, {
        limits: { maxTokens: 4 },
      }),
    ).toThrow("Token count exceeds");
    expect(() =>
      compileSource(`print((((((1))))));`, {
        limits: { maxParserNesting: 3 },
      }),
    ).toThrow("Parser nesting exceeds");
    expect(() =>
      compileSource(`print([1, 2, 3]);`, {
        limits: { maxArrayLength: 2 },
      }),
    ).toThrow("Array length exceeds");
  });

  it("enforces stack and output-character limits", () => {
    expect(() =>
      execute(
        [
          { opcode: "PUSH", argument: 1 },
          { opcode: "PUSH", argument: 2 },
          { opcode: "HALT" },
        ],
        { maxStackDepth: 1 },
      ),
    ).toThrow("Operand stack exceeds");

    const result = compileSource(`print("abcdefghij");`, {
      limits: { maxOutputCharacters: 5 },
    }).result;
    expect(result.output).toEqual([
      "abcde",
      "[OUTPUT TRUNCATED AT 5 CHARACTERS]",
    ]);
    expect(result.outputTruncated).toBe(true);
    expect(result.outputTruncationReason).toBe("characters");
  });

  it("counts separators inside the output-character budget", () => {
    const result = compileSource(`print("a"); print("bc");`, {
      limits: { maxOutputCharacters: 3 },
    }).result;
    const payload = result.output.slice(0, -1).join("\n");
    expect(payload).toBe("a\nb");
    expect(payload).toHaveLength(3);
    expect(result.output.at(-1)).toBe("[OUTPUT TRUNCATED AT 3 CHARACTERS]");
  });

  it("bounds strings across the entire trace snapshot", () => {
    const literal = "x".repeat(200);
    const result = compileSource(
      `let value = "${literal}"; print(len(value));`,
      {
        limits: {
          maxTraceCharacters: 80,
          maxTraceValueCharacters: 12,
        },
      },
    ).result;

    const capturedStrings = [];
    const visit = (value) => {
      if (typeof value === "string") {
        capturedStrings.push(value);
      } else if (Array.isArray(value)) {
        value.forEach(visit);
      }
    };
    for (const entry of result.trace) {
      visit(entry.argument);
      visit(entry.stackBefore);
      visit(entry.stackAfter);
    }

    expect(result.traceCharacters).toBeLessThanOrEqual(80);
    expect(result.traceOverflow).toBe(true);
    expect(
      capturedStrings
        .filter((value) => value.includes("x"))
        .every((value) => value.length <= 12),
    ).toBe(true);
  });
});

describe("lexer and formatter hardening", () => {
  it("tracks multiline string positions without an off-by-one error", () => {
    expect(() => lex(`"a\nb"@`)).toThrow("line 2:3");
  });

  it("classifies inherited Object names as ordinary identifiers", () => {
    const tokens = lex(`constructor toString __proto__`);
    expect(tokens.slice(0, 3).map((token) => token.type)).toEqual([
      TOKEN.IDENTIFIER,
      TOKEN.IDENTIFIER,
      TOKEN.IDENTIFIER,
    ]);
    expect(KEYWORDS.constructor).toBeUndefined();
    expect(KEYWORDS.toString).toBeUndefined();
    expect(KEYWORDS.__proto__).toBeUndefined();
    expect(BUILTINS.constructor).toBeUndefined();
  });

  it("bounds formatting depth and element count", () => {
    let nested = 1;
    for (let index = 0; index < 100; index += 1) nested = [nested];
    expect(formatValue(nested, { maxDepth: 4 })).toContain("…");
    expect(formatValue([1, 2, 3], { maxItems: 1 })).toBe("[1, …]");
  });

  it("handles shared references without treating them as cycles", () => {
    const shared = [1];
    expect(formatValue([shared, shared])).toBe("[[1], [1]]");
  });
});

describe("static depth, declaration, and configuration guards", () => {
  it("rejects reads before declaration, including self-reference and dead code", () => {
    for (const source of [
      `print(value); let value = 1;`,
      `let value = value;`,
      `if (false) { print(value); let value = 1; }`,
    ]) {
      expect(() => compileSource(source)).toThrow(
        "used before its declaration",
      );
    }
  });

  it("turns adversarial unary and binary depth into parser diagnostics", () => {
    expect(() =>
      compileSource(`let value = ${"!".repeat(20_000)}true;`, {
        run: false,
      }),
    ).toThrow("Parser nesting exceeds");

    const addition = Array.from({ length: 20_000 }, () => "1").join(" + ");
    expect(() =>
      compileSource(`let value = ${addition};`, { run: false }),
    ).toThrow("Parser nesting exceeds");
  });

  it("rejects invalid and unknown limit overrides", () => {
    for (const value of [Number.NaN, Infinity, -1, 1.5, "10"]) {
      expect(() =>
        compileSource(`print(1);`, {
          limits: { maxSteps: value },
        }),
      ).toThrow("non-negative safe integer");
    }
    expect(() =>
      compileSource(`print(1);`, {
        limits: { maxTeleportation: 1 },
      }),
    ).toThrow("Unknown compiler limit");
    expect(() => compileSource(`print(1);`, { limits: null })).toThrow(
      "provided as an object",
    );
  });
});

describe("browser self-test", () => {
  it("runs the same compatibility corpus exposed by the UI", () => {
    const report = runSelfTest();
    expect(report.ok, JSON.stringify(report.failures, null, 2)).toBe(true);
    expect(report.exampleCount).toBe(Object.keys(EXAMPLES).length);
    expect(report.assertionCount).toBe(SELF_TEST_CASES.length);
  });
});
