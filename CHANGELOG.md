# Changelog

All notable changes to FORGE are documented here.

## Unreleased

## [14.0.0] - 2026-07-23

### Added

- Modular Vite and React project structure.
- Dedicated semantic-analysis phase.
- Lexical nested-function environments and explicit VM call frames.
- Structured compiler errors with stable phases and codes.
- Bounded source, tokens, parser nesting, instructions, steps, calls, operand
  stack, arrays, strings, output, traces, and formatting.
- Worker-based browser compilation.
- Accessible source editor and inspectors for tokens, AST, assembly, output,
  globals, and trace.
- External Vitest compatibility, regression, and UI suites with coverage.
- ESLint, Prettier, CI, Dependabot, and GitHub Pages deployment.
- Language, architecture, security, and contribution documentation.

### Fixed

- User function names can no longer collide with generated labels.
- Duplicate functions and linker labels are rejected.
- Identifiers such as `constructor`, `toString`, and `__proto__` are safe.
- Function resolution is lexical rather than caller-dynamic.
- Nested functions correctly capture and update outer variables.
- Final global values survive normal termination.
- Top-level `return`, invalid loop control, dead-code arity mistakes, and
  duplicate declarations are diagnosed before execution.
- Exact step budgets no longer report a false limit when the final permitted
  instruction is `HALT`.
- Linker input and historical trace snapshots are no longer mutated.
- Quoted strings and cyclic/deep arrays format safely.
- Non-finite numeric literals and results are rejected.
- Multiline string positions no longer have an off-by-one error.
- Failed compilations no longer leave old successful output looking current.
- Declaration-order violations are rejected before execution.
- Output character truncation retains the permitted prefix and counts record
  separators accurately.
- Trace character budgets prevent repeated large-string amplification.
- Invalid or unknown limit overrides are rejected deterministically.
- Deep unary and binary expressions stop at the parser limit instead of
  overflowing the host call stack.
- The in-browser verification is accurately labelled a self-test, not CI.

### Compatibility

- The original 16 v13 examples and 35 embedded conformance assertions remain
  covered.
- Legacy public names and instruction aliases remain available where the v13
  tests rely on them.

## [13.x] - Historical baseline

The original project was a single JSX compiler laboratory with an embedded
example suite and browser-only self-test. Version 14 preserves that observable
language behavior while replacing the monolithic delivery model.

[14.0.0]: https://github.com/0thernes/forge-compiler/releases/tag/v14.0.0
