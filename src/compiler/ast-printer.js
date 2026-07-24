// Compatibility entry points. Canonical implementations live in ast.js and
// codegen.js so older deep imports cannot drift from the v14 pipeline.
export { renderAst as renderAST } from "./ast.js";
export { computeInstructionAddresses as computeAsmPCs } from "./codegen.js";
