import { analyze } from "./analyze.js";
import { renderAst } from "./ast.js";
import { codegen, computeInstructionAddresses, link } from "./codegen.js";
import {
  DEFAULT_LIMITS,
  FORGE_VERSION,
  KEYWORDS,
  T,
  TOKEN,
  TRACE_LIMIT,
  mergeLimits,
} from "./constants.js";
import { normalizeError } from "./errors.js";
import {
  escapeForDisplay,
  formatForPrint,
  formatValue,
  typeName,
} from "./format.js";
import { lex } from "./lexer.js";
import { parse } from "./parser.js";
import { execute } from "./vm.js";

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function measure(callback) {
  const startedAt = now();
  const value = callback();
  return { value, milliseconds: now() - startedAt };
}

export function compileSource(
  source,
  { run = true, limits: limitOverrides = {} } = {},
) {
  const limits = mergeLimits(limitOverrides);
  try {
    const tokenStage = measure(() => lex(source, limits));
    const parseStage = measure(() => parse(tokenStage.value, limits));
    const analysisStage = measure(() => analyze(parseStage.value));
    const codegenStage = measure(() => codegen(parseStage.value, limits));
    const instructionAddresses = computeInstructionAddresses(
      codegenStage.value,
    );
    const executionStage = run
      ? measure(() => execute(codegenStage.value, limits))
      : { value: null, milliseconds: 0 };

    return {
      source,
      tokens: tokenStage.value,
      ast: parseStage.value,
      analysis: analysisStage.value,
      assembly: codegenStage.value,
      instructionAddresses,
      result: executionStage.value,
      timings: {
        lex: tokenStage.milliseconds,
        parse: parseStage.milliseconds,
        analyze: analysisStage.milliseconds,
        codegen: codegenStage.milliseconds,
        execute: executionStage.milliseconds,
        total:
          tokenStage.milliseconds +
          parseStage.milliseconds +
          analysisStage.milliseconds +
          codegenStage.milliseconds +
          executionStage.milliseconds,
      },
    };
  } catch (error) {
    throw normalizeError(error);
  }
}

export function runSource(source, options = {}) {
  return compileSource(source, options).result;
}

export function compileAndRun(source, maxStepsOrOptions) {
  const options =
    typeof maxStepsOrOptions === "number"
      ? { limits: { maxSteps: maxStepsOrOptions } }
      : (maxStepsOrOptions ?? {});
  return compileSource(source, options).result;
}

export const renderAST = renderAst;
export const computeAsmPCs = computeInstructionAddresses;

export {
  DEFAULT_LIMITS,
  FORGE_VERSION,
  KEYWORDS,
  T,
  TOKEN,
  TRACE_LIMIT,
  analyze,
  codegen,
  computeInstructionAddresses,
  escapeForDisplay,
  execute,
  formatForPrint,
  formatValue,
  lex,
  link,
  parse,
  renderAst,
  typeName,
};
