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
- SHA-pinned CI/Pages delivery with a single verified build artifact.
- Tag-driven release archives, build-dependency CycloneDX SBOM generation, and
  checksums.
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
- Function-heavy code generation is linear instead of repeatedly cloning
  lexical symbol tables.
- Formatting uses one aggregate character budget and preserves balanced quotes
  and brackets when truncated.
- Compilation-only mode performs and times linking, and exposes linked code.
- Direct VM assembly is validated before execution.
- Linked code rejects pseudo-instructions, legacy-only field aliases, and calls
  that target the end of the program.
- Worker startup, transport, and stale-result races no longer overwrite current
  editor state.
- Browser workers omit the unused linked-code copy from transferred results.
- Inspector rendering is bounded and source drafts survive page reloads.

### Compatibility

- The original v13 language behavior remains covered by the expanded canonical
  example and conformance corpora.
- Legacy public names and instruction aliases remain available where the v13
  tests rely on them; old fixture paths now adapt to the canonical data,
  including the historical `Closures` example alias and output predicates.

## [13.x] - Historical baseline

The original project was a single JSX compiler laboratory with an embedded
example suite and browser-only self-test. Version 14 preserves that observable
language behavior while replacing the monolithic delivery model.

[14.0.0]: https://github.com/0thernes/forge-compiler/releases/tag/v14.0.0
