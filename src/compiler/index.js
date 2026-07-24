// Public surface of the FORGE compiler core. Every stage is a pure function:
//   lex(src) → tokens → parse(tokens) → ast → codegen(ast) → asm → execute(asm) → result
// (execute links internally; link() is exported for direct/static use.)
export { T, KEYWORDS, BUILTINS, ENTRY_LABEL } from "./constants.js";
export { escapeForDisplay, typeName, formatValue, formatForPrint } from "./format.js";
export { lex } from "./lexer.js";
export { parse } from "./parser.js";
export { codegen } from "./codegen.js";
export { link } from "./linker.js";
export { execute, TRACE_LIMIT, MAX_STEPS, OUTPUT_LIMIT } from "./vm.js";
export { renderAST, computeAsmPCs } from "./ast-printer.js";

import { lex } from "./lexer.js";
import { parse } from "./parser.js";
import { codegen } from "./codegen.js";
import { execute } from "./vm.js";

// Convenience: run the full pipeline on source text and return the VM result.
export function compileAndRun(src, maxSteps) {
  return execute(codegen(parse(lex(src))), maxSteps);
}
