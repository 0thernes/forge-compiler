// Compatibility entry point. The canonical, non-mutating linker lives beside
// code generation so modern and legacy imports share one implementation.
export { link } from "./codegen.js";
