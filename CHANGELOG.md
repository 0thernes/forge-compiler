# Changelog

All notable changes to FORGE are documented here.

## Unreleased

## [14.1.0] - 2026-07-24

### Added

- A complete mid-century workbench redesign: an atomic-age "Workshop" day
  theme and an amber-phosphor "Night" terminal theme with a persistent
  DAY/NITE switch, vendored IBM Plex typography, CRT-styled editor and output
  screens, a run-status lamp cluster, and a responsive layout with
  reduced-motion support.
- A tree-walk reference interpreter that shares the compiler frontend but no
  backend code, a differential gate of 167 corpus programs that must agree
  across both engines, and a mutation-sensitivity proof that injects four bug
  classes into a VM copy and requires the gate to catch every one
  (`npm run test:mutation`, part of `verify:quality`).
- Call-frame isolation for complete, re-entrant output records, including empty
  records and left-to-right argument evaluation and formatting.
- Local checks for Markdown links, synchronized release metadata, production
  build contents, and portable archive contents.
- A portable-release guide that becomes the root `README.md` in static release
  archives.

### Changed

- The development and release toolchain is pinned to Node.js 24.18.0 LTS and
  npm 11.18.0.
- ESLint globals are scoped to browser UI, Worker, Node.js, and test
  environments instead of being enabled repository-wide.
- Release verification and packaging run with read-only repository access.
  Pull requests exercise the packaging and artifact-transfer path; checksummed
  assets pass through an independent validation job before the separate
  publishing job receives the minimal `contents: write` permission.
- The language reference documents parenthesized call targets, the separate
  function and variable namespaces, and the parse/analyze phase split for
  control-flow diagnostics.

### Fixed

- Nested and re-entrant `print` calls no longer share a partial outer record;
  each call emits one isolated record after its own arguments finish.
- String concatenation with `+` is lossless: operands render completely up to
  the string-length limit, and arrays nested deeper than the format depth or
  containing themselves raise a runtime error instead of silently truncating
  program-visible values. Printing still uses the bounded display formatter.
- Function bodies may reference sibling `let` declarations that appear later
  in the same block, restoring v13-legal forward references; calling such a
  function before its captured declaration has run still fails at runtime.
- Multi-line Tab indentation no longer indents the line following a selection
  that ends at column 0.
- Verification and stale-source notices are announced reliably by screen
  readers through pre-mounted live regions.
- Trace character accounting includes retained metadata aliases, stack
  truncation markers, and zero-character budgets.
- Step-limit diagnostics pass through output quota handling and report
  truncation status and reasons consistently.
- Ctrl/Cmd+Enter works repeatedly from any in-app focus target, prevents
  duplicate browser activation, and focuses the Output tab after a successful
  run.
- Retrying the tag workflow updates an existing draft release while continuing
  to refuse changes to an immutable published release.
- Release archive verification no longer fails from SIGPIPE during tar/unzip
  content checks.
- Unexpected-character diagnostics preserve complete astral Unicode symbols
  instead of exposing one UTF-16 surrogate.
- Comparison type errors name the surface operator (`<`, `>=`) instead of
  internal opcode names.

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
- Immutable published releases with GitHub-generated attestations.
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

[14.1.0]: https://github.com/0thernes/forge-compiler/compare/v14.0.0...v14.1.0
[14.0.0]: https://github.com/0thernes/forge-compiler/releases/tag/v14.0.0
