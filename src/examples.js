import { EXAMPLES as CANONICAL_EXAMPLES } from "./compiler/examples.js";

// Compatibility entry point retained for v13-era deep imports. Keep the old
// `Closures` property without enumerating the same program twice in runners.
const legacyExamples = { ...CANONICAL_EXAMPLES };
Object.defineProperty(legacyExamples, "Closures", {
  value: CANONICAL_EXAMPLES["Nested Functions"],
  enumerable: false,
});

export const EXAMPLES = Object.freeze(legacyExamples);
