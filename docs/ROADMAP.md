# FORGE engineering roadmap

This roadmap converts the [competitive research](COMPETITIVE-LANDSCAPE.md) into
ordered, measurable work. It is not a release-date promise. A phase advances
only when its exit gates pass on supported platforms and the resulting
capability is documented truthfully.

## North star

FORGE should become a transparent, deterministic, resource-bounded language
platform that is equally usable by a learner in the visual workbench, an
engineer in a terminal or editor, and an automated agent through stable
protocols. One versioned semantics should feed multiple interpreters, VMs, and
code-generation targets without silently changing program behavior.

The goal is not maximal syntax. The goal is unusually high confidence and
operational quality per feature:

- inspectable source-to-target transformations;
- safe embedding with explicit host capabilities;
- diagnostics that humans can act on and tools can parse;
- deterministic, reproducible commands and artifacts;
- a small coherent type/effect/module core;
- differential validation across independent implementations;
- portable WebAssembly before optional native specialization.

## Maturity and compatibility

Every externally visible feature receives one maturity label:

| Level        | Promise                                                                        |
| ------------ | ------------------------------------------------------------------------------ |
| Experimental | May change in any release; gated off or explicitly selected                    |
| Preview      | Complete enough for real trials; migration notes required for breaking changes |
| Stable       | Documented compatibility contract, conformance tests, and deprecation path     |

Before a 1.0 language specification, syntax and semantics may evolve, but each
release must state the change and provide a migration example. Machine
protocols are versioned independently (`forge.cli/v1`, future
`forge.ir/v1`, and so on); a protocol revision never reuses an old identifier
for incompatible data.

## Architecture direction

```text
UTF-8 source / editor snapshots
             │
             ▼
  lossless syntax + source map
             │
             ▼
 name resolution → typed HIR → effect/capability checks
             │
             ▼
     versioned typed FORGE IR
       │          │          │
       │          │          └─ canonical text + JSON + verifier
       │          └─ deterministic analyses / optimization passes
       ▼
 ┌─────────────┬───────────────────┬───────────────────────────┐
 │ tree oracle │ bounded stack VM  │ WebAssembly Component/WASI│
 └─────────────┴───────────────────┴───────────────────────────┘
                                  │
                                  └─ optional Cranelift / LLVM native

shared compiler service
  ├─ browser workbench
  ├─ CLI + JSON
  ├─ formatter / LSP / DAP / SARIF
  └─ MCP and other agent adapters
```

The existing VM remains a first-class readable backend and semantic oracle. It
is not discarded when a faster target appears.

The typed IR follows lessons from [MLIR's explicit language
form](https://mlir.llvm.org/docs/LangRef/), [MLIR's legality-driven
conversion](https://mlir.llvm.org/docs/DialectConversion/), and [Cranelift
IR's typed SSA and verifier](https://github.com/bytecodealliance/wasmtime/blob/main/cranelift/docs/ir.md).
WebAssembly's [validated core](https://webassembly.github.io/spec/core/), the
[Component Model](https://component-model.bytecodealliance.org/), and
[WASI's capability-oriented APIs](https://wasi.dev/) make that stack the first
external target. Native work comes later through the [LLVM code-generation
pipeline](https://llvm.org/docs/CodeGenerator.html) or Cranelift, not through
an unbounded collection of handwritten emitters.

## Measurable scorecard

Scores are evidence levels, not taste:

- **0 — absent:** no usable implementation;
- **1 — experimental:** a prototype exists but has no complete contract;
- **2 — usable:** documented, tested, and useful within a stated scope;
- **3 — dependable:** compatibility, regression, performance, and adversarial
  gates run continuously;
- **4 — independently substantiated:** multiple implementations/targets agree,
  or a machine-checked proof establishes the stated property.

The two release columns make the first measured automation improvement visible
without retroactively upgrading the v14.1 baseline.

| Dimension                   | v14.1 | v14.2 | Long-term target | Evidence needed for next level                                                                    |
| --------------------------- | ----: | ----: | ---------------: | ------------------------------------------------------------------------------------------------- |
| Language semantics          |     2 |     2 |                4 | Normative versioned spec, executable examples, compatibility suite, second implementation         |
| Compiler correctness        |     2 |     2 |                4 | Generated differential tests, shrinker, fuzz corpora, IR/pass verification, target cross-checking |
| Resource safety             |     2 |     2 |                3 | Capability model, typed effects/ownership rules, adversarial quotas, audited unsafe boundary      |
| Diagnostics                 |     2 |     2 |                3 | Full spans, related locations, suggestions/fixes, golden corpus, CLI/LSP/SARIF equivalence        |
| Automation/agent UX         |     0 |     2 |                3 | Released schema, compatibility fixtures, bounded artifacts, cancellation, MCP adapter             |
| Editor/debug tooling        |     1 |     1 |                3 | Formatter, incremental service, LSP/DAP matrices, latency and cancellation budgets                |
| Type and abstraction system |     0 |     0 |                3 | Written rules, sound implementation, inference/exhaustiveness/coherence suites                    |
| Modules and packages        |     0 |     0 |                3 | Identity/visibility/cycle specs, reproducible resolver, lockfile, offline and integrity tests     |
| Portable targets            |     2 |     2 |                3 | Wasm/Component/WASI conformance, deterministic artifacts, cross-runtime test matrix               |
| Native targets              |     0 |     0 |                2 | Stable IR, ABI/data layout, backend integration, debugger data, differential and benchmark gates  |
| Interoperability/embedding  |     0 |     0 |                3 | Versioned component/C boundary, ownership/errors, explicit capabilities, host compatibility tests |
| Performance engineering     |     1 |     1 |                3 | Public benchmark suite, fixed environments, cold/warm distributions, regression policy            |
| Release/supply chain        |     2 |     2 |                3 | Hermetic rebuild measurement, signed provenance, validated SBOM, documented SLSA properties       |
| Human workbench             |     2 |     2 |                3 | Cross-browser/accessibility matrix, visual regressions, real workload studies, latency budgets    |

The table must be revised downward if evidence regresses. A high score cannot be
earned by documentation alone.

## Phase 0 — preserve the v14.1 semantic baseline

**Status: shipped.**

The baseline consists of the documented dynamic language, observable
lex/parse/analyze/generate/link/execute pipeline, bounded iterative VM, visual
workbench, structured diagnostics, independent tree-walk oracle, 92-case
differential corpus, four mutation killers, CI, portable static release,
CycloneDX SBOM, and checksums.

Exit gates that remain permanent:

- the complete quality and production-build workflow passes;
- the VM and tree oracle agree on every differential case;
- every seeded semantic mutation is killed;
- default execution is deterministic when timings are excluded;
- no resource limit can be bypassed by a supported language construct;
- release archives, SBOM, and checksums verify from a clean checkout.

## Phase 1 — deterministic automation surface

**Status: usable surface shipped in v14.2; dependability gates continue.**

Deliver:

- `run`, `check`, `compile`, `capabilities`, `version`, and help commands;
- UTF-8 file and stdin input, with `-` behaving consistently;
- human output for terminals and exactly one versioned JSON document for
  automation;
- stable exit classes for success, compiler diagnostic, usage, input, resource
  exhaustion, and internal failure;
- selectable tokens, AST, analysis, assembly, linked code, source-address
  mapping, and optional timing artifacts;
- a truthful capability manifest containing only implemented behavior;
- stdout reserved for program or protocol output and stderr reserved for human
  diagnostics;
- Windows, Linux, and macOS command tests.

Exit gates:

- JSON output validates against a checked-in schema and is byte-stable when
  timing is disabled;
- every compiler failure produces the same phase/code/message/position through
  the API, browser, human CLI, and JSON CLI;
- malformed options, missing input, invalid UTF-8, broken pipes, and internal
  exceptions have regression tests and documented exits;
- output and artifacts remain bounded by named limits;
- the command works from a clean packed artifact, not only a repository
  checkout;
- each tagged release, documentation, capability manifest, and executable all
  report one version.

## Phase 2 — one incremental language service

**Status: planned.**

Deliver:

- immutable source snapshots and a lossless syntax representation retaining
  comments, trivia, byte offsets, line/column spans, and recovery nodes;
- parser recovery capable of reporting several useful diagnostics without
  manufacturing valid semantics;
- canonical formatter with idempotence and comment-preservation tests;
- incremental dependency invalidation and cancellable analysis;
- related diagnostic locations, suggestions, and machine-applicable edits;
- SARIF output based on the [SARIF 2.1.0
  standard](https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html);
- an LSP adapter based on [LSP
  3.17](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/)
  for synchronization, diagnostics, symbols, definitions, references, rename,
  completion, hover, semantic tokens, formatting, and workspace edits.

Exit gates:

- `format(format(source))` is byte-identical to `format(source)` across the
  corpus and generated syntax;
- parsing and formatting never alter program behavior;
- incremental results equal clean full analysis for randomized edit sequences;
- canceled/stale work can never replace newer editor results;
- CLI, browser, SARIF, and LSP diagnostics derive from one model and match in
  code and span;
- median and p95 latency are published for small, medium, and large fixtures,
  with a recorded environment and a regression threshold.

## Phase 3 — coherent typed language core

**Status: planned; design before syntax.**

Deliver in independently gated slices:

1. explicit `Bool`, integer and floating-point numeric types, `String`, arrays,
   immutable records/tuples, option, and result;
2. first-class functions and closures with written capture and lifetime rules;
3. algebraic data types and exhaustive pattern matching;
4. local type inference with explicit public signatures;
5. traits/interfaces with associated types and a documented coherence rule;
6. parametric generics with definition-time checking and bounded
   specialization;
7. explicit error/effect sets covering failure, state, I/O, time, random, and
   async;
8. ownership/mutability rules that preserve useful arrays without allowing
   untracked aliases across concurrent or host boundaries.

The design should benchmark [Rust traits and ownership](https://doc.rust-lang.org/reference/),
[Zig error unions and optionals](https://ziglang.org/documentation/master/),
[Gleam's small typed core](https://gleam.run/writing-gleam/), [OCaml's
inference and algebraic data](https://ocaml.org/manual/5.3/index.html), and
[Unison abilities](https://www.unison-lang.org/docs/language-reference/abilities-and-ability-handlers/).
It should not combine their syntax indiscriminately.

Exit gates for each slice:

- typing and dynamic semantics are written before the feature is stable;
- accepted programs never reach an “impossible” runtime state covered by the
  static guarantee;
- rejected programs have focused golden diagnostics and at least one suggested
  repair where a repair is unambiguous;
- inference is deterministic and bounded;
- pattern exhaustiveness and trait coherence have adversarial suites;
- old dynamic behavior is either preserved in an explicit compatibility mode
  or migrated with a tested tool and release note.

## Phase 4 — modules, projects, and reproducible packages

**Status: planned.**

Deliver:

- canonical module and package identities, explicit exports/imports, visibility,
  and a documented cycle policy;
- a declarative project manifest, exact lockfile, target/capability declaration,
  and compiler compatibility range;
- content-addressed cache with deterministic invalidation;
- offline and frozen resolution modes;
- dependency integrity hashes, source provenance, license metadata, and
  vulnerability-reporting hooks;
- workspaces and incremental project references;
- documentation, test, example, and benchmark targets in the standard build
  graph;
- no public package registry until the local format, resolver, and security
  policy have survived real projects.

Exit gates:

- identical locked inputs produce byte-identical semantic artifacts on all
  supported hosts;
- resolver decisions are explainable as structured data;
- lockfile creation and frozen/offline builds have cross-platform fixtures;
- malicious archives, path traversal, namespace confusion, cycles, and hash
  mismatches fail closed;
- package builds declare every host capability they require;
- at least three non-trivial multi-package applications exercise public API
  evolution before registry design begins.

## Phase 5 — versioned typed FORGE IR

**Status: planned and blocking external backends.**

Deliver:

- typed SSA values, block parameters, explicit terminators, functions, globals,
  aggregates, effects, calls, traps, and source provenance;
- canonical text and canonical JSON representations plus round-trip readers;
- a schema/version and explicit compatibility policy;
- structural, type, dominance, control-flow, effect, and resource verifier;
- deterministic pass manager with declared analysis dependencies and
  invalidation;
- constant folding, unreachable-code elimination, branch simplification, and
  dead-value elimination as the first small pass set;
- an interpreter for IR that is independent of the existing VM backend.

Exit gates:

- parse/print and JSON round trips are canonical and fuzzed;
- the verifier runs after every pass in verification builds;
- each transformation has focused equivalence tests, mutation tests, and
  generated differential coverage;
- the source oracle, stack VM, and IR interpreter agree on the complete corpus;
- invalid IR can never reach a backend;
- IR version changes include fixtures and an explicit migration/rejection path;
- no optimization is enabled by default without measured benefit and semantic
  validation.

Research such as [Alive2](https://github.com/AliveToolkit/alive2) shows the value
of validating transformations, while [CompCert](https://compcert.org/) shows
that a verification claim must name a precise semantic-preservation theorem.
FORGE may adopt translation validation or proofs incrementally, but it must not
use “verified” as an aesthetic adjective.

## Phase 6 — WebAssembly Component/WASI target

**Status: planned; first external target.**

Deliver:

- deterministic lowering from verified FORGE IR to validated WebAssembly;
- debug names and source maps;
- canonical component interfaces for strings, lists, records, variants,
  results, and resources;
- explicitly granted WASI worlds for clocks, random, files, network, process,
  and environment;
- browser and at least two standalone runtime test lanes;
- host bindings generated from interface definitions, not handwritten ABI
  guesses.

Exit gates:

- source oracle, stack VM, IR interpreter, browser Wasm, and standalone Wasm
  agree on all supported programs;
- generated modules pass an independent validator;
- the same declared component interface works with at least two host languages;
- a program without a capability cannot observe or acquire it;
- traps, panics, and result values have specified cross-boundary behavior;
- binary size, cold start, compile time, and execution distributions are
  published for representative workloads.

## Phase 7 — debugging, observability, and agent adapters

**Status: planned after stable snapshots and source maps.**

Deliver:

- VM and Wasm pause/resume, step-in/over/out, conditional breakpoints, stack and
  lexical scopes, bounded value handles, watch expressions, and deterministic
  replay where supported;
- a [Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/specification)
  adapter with capability negotiation, cancellation, progress, and source
  mapping;
- structured trace events with schema, correlation identifiers, redaction, and
  quotas;
- an [MCP](https://modelcontextprotocol.io/specification/2025-06-18/basic/index)
  adapter exposing bounded compiler operations and declared output schemas;
- project-scoped resources for specifications, diagnostics, IR, test results,
  and capability manifests;
- no protocol-specific compiler semantics.

Exit gates:

- CLI, LSP, DAP, SARIF, and MCP adapters pass contract and cancellation tests
  against one service;
- every request declares or inherits limits and can be canceled;
- protocol output is deterministic except for explicitly identified telemetry;
- source text, environment values, and host paths are redacted by policy;
- hostile clients cannot bypass compiler/VM quotas or acquire host
  capabilities;
- agents can discover the exact language/compiler/protocol versions without
  parsing prose.

## Phase 8 — optional native execution

**Status: planned only after IR and Wasm gates.**

Evaluate Cranelift first for fast development compilation, then LLVM where its
optimization and target coverage justify the operational cost. Retain the VM
and Wasm targets for transparency, portability, and cross-checking.

Deliver:

- written target triples, data layouts, calling convention, stack/unwind
  behavior, symbol visibility, object format, relocation model, and debug
  metadata;
- object generation and system-linker integration;
- debug and optimized build modes with explicit overflow and trap behavior;
- capability-scoped runtime library and foreign-function boundary;
- backend version/support matrix.

Exit gates:

- ABI fixtures interoperate with independently compiled C/component hosts;
- objects are independently inspected and link-tested;
- source, IR, VM, Wasm, and native executions agree within explicitly
  documented numeric/host boundaries;
- sanitizers, fuzzers, debuggers, and platform hardening run in CI where
  available;
- benchmark data includes compile time, peak memory, output size, startup, and
  steady-state distributions;
- a release can omit native support without changing language semantics.

No direct native assembler should be called production-ready until sections,
symbols, relocations, object formats, ABI rules, and debug metadata are covered.
The [GNU assembler manual](https://sourceware.org/binutils/docs/as/) and [NASM
manual](https://www.nasm.us/doc/) define the minimum breadth hidden by the word
“assembly.”

## Phase 9 — structured concurrency and resilient services

**Status: research track, not near-term syntax.**

Deliver only after types, effects, capabilities, and resource accounting:

- structured task lifetimes and cancellation;
- isolated state by default, typed messages/channels, and bounded mailboxes;
- actors/tasks with explicit scheduler and determinism guarantees;
- supervision and failure propagation;
- deadlines, backpressure, and quotas;
- deterministic test scheduler and race/deadlock-focused exploration;
- remote execution only through versioned component interfaces and explicit
  authority.

The design should learn from [Swift
isolation](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/),
[Go concurrency](https://go.dev/ref/spec), [Erlang
processes](https://www.erlang.org/doc/system/reference_manual.html), and
[Elixir links/supervision](https://hexdocs.pm/elixir/processes.html). It should
not expose threads first and attempt to retrofit safety later.

Exit gates:

- no task can outlive its structured owner unless explicitly detached with a
  named capability;
- shared mutable state cannot cross isolation boundaries without a checked
  synchronization type;
- cancellation and failure propagation have normative state machines;
- mailboxes, tasks, timers, traces, and remote calls have enforceable limits;
- deterministic scheduler tests reproduce every reported concurrency failure;
- distributed execution authenticates interfaces and never implies ambient
  network or filesystem access.

## Continuous verification program

The verification track runs through every phase:

1. Grow curated differential cases from 92 to at least 250 before typed IR, 500
   before the Wasm target is stable, and 1,000 before a native target is stable.
2. Add grammar-directed generation now, then type/effect-directed generation
   with shrinking and persistent seeds.
3. Establish coverage-guided fuzz targets for source parsing, syntax recovery,
   formatter, IR readers/verifier, package resolver, component decoder, and
   protocol parsers. [libFuzzer](https://llvm.org/docs/LibFuzzer.html) documents
   the expected in-process corpus model.
4. Increase seeded semantic mutations from four to at least 12 before typed IR,
   25 before stable Wasm, and one mutation family per optimization/backend rule
   thereafter.
5. Store every minimized discrepancy as a normal regression test with compiler,
   target, limits, seed, and capability manifest.
6. Add metamorphic properties: formatting and IR round trips, alpha-renaming,
   harmless parentheses, independent declaration reordering where legal, and
   optimization-level equivalence.
7. Publish zero known unexplained oracle/backend disagreements as a release
   criterion; quarantine must include an owner, reason, and expiry.

The [Csmith paper](https://users.cs.utah.edu/~regehr/papers/pldi11-preprint.pdf)
is the model for seeking wrong-code counterexamples through independently
compiled randomized programs. Corpus size alone is not a quality metric;
coverage, mutation sensitivity, shrinking quality, and defect yield are.

## Performance and scale policy

Performance claims require a checked-in benchmark suite and raw results. Each
report records compiler commit, runtime, OS, CPU, memory, power mode, command,
warmup, sample count, median, p95, and dispersion.

Benchmark groups:

- lex/parse/analyze throughput and peak memory by source size;
- incremental edit latency and invalidated work;
- compile/check cold and warm startup;
- VM, IR, Wasm, and native execution on recursion, loops, allocation, strings,
  calls, dispatch, and numeric kernels;
- formatter, LSP, DAP, SARIF, and MCP response latency;
- artifact size, load/startup time, and package resolution;
- adversarial inputs near every configured resource limit.

After a baseline is accepted, a median or p95 regression greater than 10% on a
stable benchmark blocks release unless a decision record explains the tradeoff
and the change is visible in release notes. Improvements must not weaken
correctness, determinism, diagnostics, or limits.

## Release and supply-chain gates

Retain the pinned toolchain, immutable release behavior, dependency audit,
portable archives, CycloneDX SBOM, and SHA-256 checksums. Add:

- hermetic or container-described release builds;
- signed build provenance and artifact attestations;
- SBOM schema validation and digest binding;
- documented achieved properties against [SLSA
  1.2](https://slsa.dev/spec/v1.2/), without self-awarding a level whose
  requirements are unmet;
- rebuild comparison on an independent runner;
- dependency license/vulnerability policy and response timing;
- signed package indexes only after a registry exists.

## Explicit non-goals

- **No feature-count contest.** FORGE will not add syntax solely because one of
  the 28 researched languages has it.
- **No universal-workload claim.** Kernels, browsers, safety-critical firmware,
  scientific notebooks, distributed services, and small teaching programs have
  different optima.
- **No native backend before verified IR.** A demo emitter is not an ABI,
  assembler, linker, debugger, optimizer, or support policy.
- **No ambient authority.** File, network, clock, random, process, environment,
  GPU, and FFI access must be declared and granted.
- **No unsound “gradual” shortcuts hidden as convenience.** Static guarantees
  must state their escape hatches; dynamic compatibility must remain explicit.
- **No textual macros.** Metaprogramming waits for hygienic syntax, phases,
  provenance, deterministic expansion, and resource limits.
- **No home-grown cryptography or early public registry.** Use reviewed
  standards and prove local package integrity first.
- **No protocol forks.** Browser, CLI, LSP, DAP, SARIF, and MCP share one
  compiler service and diagnostic model.
- **No benchmark theater.** Publish environments and distributions; never use
  one microbenchmark to claim general superiority.
- **No “formally verified” label without a theorem.** Tests, differential
  agreement, translation validation, and machine proofs are named accurately.
- **No premature self-hosting.** Self-hosting follows a stable specification,
  reproducible bootstrap, and diverse-double-compilation plan; it is not a
  proxy for language quality.
- **No abandonment of the educational VM or visual pipeline.** Transparency is
  a differentiator and an independent checker, not scaffolding to delete.

## Next decision queue

Work should be pulled in this order:

1. maintain the released CLI/capability contract and add compatibility fixtures;
2. design the shared source/diagnostic service and remaining canonical schemas;
3. add lossless syntax, recovery, and an idempotent formatter;
4. ship diagnostic spans/fixes, SARIF, then LSP;
5. write type/effect/module proposals with executable examples before adding
   grammar;
6. build the typed IR, verifier, interpreter, and small validated pass set;
7. add WebAssembly Component/WASI and cross-backend conformance;
8. add package reproducibility and signed provenance;
9. stabilize debug state, then DAP and MCP adapters;
10. evaluate native backends and structured concurrency only after their
    prerequisites are measured.

Each completed item must update this roadmap, the capability manifest, the
normative reference, conformance tests, and release notes together. That is how
FORGE becomes broad without becoming vague, and deep without becoming
unmaintainable.
