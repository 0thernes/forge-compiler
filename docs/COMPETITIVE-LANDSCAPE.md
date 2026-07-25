# FORGE competitive landscape

This document turns “be better than other languages” into testable engineering
work. It is a research map, not a claim that FORGE already replaces the systems
below. A language can be excellent for one workload and deliberately poor for
another; raw feature count is not a useful ranking.

The comparison date is 2026-07-24. Links point to language specifications,
project manuals, standards, or original research rather than comparison blogs.

## Status vocabulary

| Mark  | Meaning                                                                                |
| ----- | -------------------------------------------------------------------------------------- |
| **S** | Shipped in the current FORGE v14.2.0 release                                           |
| **D** | Implemented on an unreleased branch or explicitly experimental; not a released promise |
| **P** | Planned and gated by the [roadmap](ROADMAP.md)                                         |
| **N** | Explicitly not a current goal                                                          |

Only **S** describes a released user capability. A plan, prototype, design
note, or source file does not silently become a compatibility guarantee.

## Truthful FORGE baseline

The shipped language has finite numbers, immutable strings, mutable arrays,
numeric truth values, lexical fixed-arity functions, and structured control
flow. Its implementation is a lexer, recursive-descent parser, semantic
analyzer, labelled stack-assembly generator, linker, and bounded iterative VM.
The exact semantics are in the [language reference](LANGUAGE.md), and the
pipeline and resource model are in [the architecture](ARCHITECTURE.md).

What is genuinely strong today:

- **S — observable compilation:** tokens, AST, assembly, linked instructions,
  output, globals, trace, and phase timings are inspectable in the browser;
- **S — deterministic bounded execution:** explicit limits cover source,
  parsing, generated code, instructions, call/operand stacks, arrays, strings,
  output, traces, and formatting;
- **S — structured failures:** compiler errors carry a phase, stable code,
  message, and source position;
- **S — independent checking:** 92 curated programs run against both the VM and
  a separate tree-walk interpreter, while four seeded mutations prove that the
  differential corpus detects meaningful semantic drift;
- **S — operational delivery:** CI verifies formatting, lint, coverage,
  mutation sensitivity, documentation, release metadata, production output,
  and dependency audit; releases include portable archives, a CycloneDX SBOM,
  and SHA-256 checksums;
- **S — automation contract:** file/stdin commands provide `run`, `check`,
  `compile`, `capabilities`, and `version`; the `forge.cli/v1` JSON envelope,
  public artifact projections, stable exit classes, cycle-safe values, and
  stdout/stderr discipline have process-level contract coverage.

FORGE does **not** currently ship static types, algebraic data types, generics,
modules, packages, first-class function values, a stable foreign-function
interface, source-level effects, structured concurrency, a formatter, LSP,
DAP, SARIF, MCP, object files, a native backend, a WebAssembly backend, a
package registry, or self-hosting. Those gaps are not hidden behind broad words
such as “compiler” or “AI-ready.”

## Language reference set

These are not all direct substitutes for FORGE. Together they cover the
language-design surface that a practical general-purpose system must confront.
The final column says what FORGE should learn, not what it should copy.

| Reference                                                                                             | Capability worth benchmarking                                                                                                                  | FORGE status and required lesson                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [C (WG14 draft N3220)](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n3220.pdf)                    | Explicit object representation, translation model, hosted/freestanding environments, and a durable ABI ecosystem                               | **P:** define data layout and a freestanding profile before claiming systems use; do not inherit unchecked memory behavior by accident                                                                                                            |
| [C++ (WG21 draft N4950)](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2023/n4950.pdf)          | Zero-overhead abstraction, templates, constant evaluation, RAII, and deep native interoperability                                              | **P:** pursue predictable abstraction cost and deterministic destruction only after a coherent type/ownership model; **N:** reproduce C++ complexity for compatibility alone                                                                      |
| [Rust](https://doc.rust-lang.org/reference/)                                                          | Ownership, borrowing, traits, explicit unsafe boundaries, and strong compile-time concurrency constraints                                      | **P:** make aliasing, mutation, lifetime, and host capability rules explicit; unsafe operations must be syntactically and diagnostically visible                                                                                                  |
| [Swift](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)  | Async tasks, actors, isolation, `Sendable`, and compile-time data-race checking                                                                | **P:** structured concurrency and isolation belong in semantics and types, not as untracked VM helpers                                                                                                                                            |
| [Go](https://go.dev/ref/spec)                                                                         | A compact specification, interfaces, packages, straightforward cross-compilation, and concurrency primitives                                   | **P:** keep the common path readable and the toolchain cohesive; its [native coverage-guided fuzzing](https://go.dev/doc/security/fuzz/) is also a verification benchmark                                                                         |
| [Zig](https://ziglang.org/documentation/master/)                                                      | Explicit errors and optionals, allocator choice, compile-time execution, cross-target builds, C interop, and executable documentation examples | **P:** explicit failure and allocation are higher priority than syntactic breadth; every reference example should become a test                                                                                                                   |
| [Carbon](https://docs.carbon-lang.dev/docs/design/interoperability/philosophy_and_goals.html)         | A stated interoperability philosophy and incremental migration strategy                                                                        | **P:** write an FFI safety/compatibility contract before building bridges; Carbon's [checked-generics goals](https://docs.carbon-lang.dev/docs/design/generics/goals.html) are a useful coherence checklist                                       |
| [Mojo](https://docs.modular.com/mojo/manual/)                                                         | MLIR-based lowering, ownership conventions, compile-time parameters, traits, and CPU/GPU-oriented programming                                  | **P:** preserve high-level types through IR and leave accelerator specialization to explicit later stages; benchmark its [ownership model](https://docs.modular.com/mojo/manual/values/ownership/) rather than promising “AI speed”               |
| [Java](https://docs.oracle.com/en/java/javase/26/docs/specs/jls/index.html)                           | Long-lived binary/source evolution, modules, generics, records, sealed classes, and a managed runtime contract                                 | **P:** attach compatibility levels and deprecation rules to releases; modules need identities and visibility, not filename conventions                                                                                                            |
| [C#](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-specification/types) | Reified runtime types, nullable analysis, value/reference distinctions, generics, async, and a broad tooling ecosystem                         | **P:** nullable flow and value/reference semantics must be explained by diagnostics and represented in typed IR                                                                                                                                   |
| [Kotlin](https://kotlinlang.org/docs/multiplatform/multiplatform-discover-project.html)               | Shared source sets across JVM, JavaScript, and native targets, plus pragmatic host interoperability                                            | **P:** one front end may serve several targets only when target-specific effects and availability remain visible; its [coroutine model](https://kotlinlang.org/docs/coroutines-basics.html) separates language suspension from library scheduling |
| [TypeScript](https://www.typescriptlang.org/docs/handbook/project-references)                         | Structural typing, gradual adoption, editor feedback, and scalable project references                                                          | **P:** incremental project graphs and machine-readable diagnostics matter to agents; **N:** erase types before FORGE has a verified typed IR                                                                                                      |
| [Python](https://docs.python.org/3/reference/)                                                        | Readable dynamic semantics, modules, introspection, generators, context management, and an enormous extension ecosystem                        | **S:** FORGE shares an approachable dynamic core; **P:** add principled modules/protocols without making runtime introspection nondeterministic                                                                                                   |
| [ECMAScript](https://tc39.es/ecma262/)                                                                | Precisely specified dynamic coercion, objects, iteration, promises, modules, and host-defined integration points                               | **S:** FORGE already tests its smaller coercion surface carefully; **P:** specify every new conversion and host hook before implementation                                                                                                        |
| [Haskell 2010](https://www.haskell.org/onlinereport/haskell2010/)                                     | Algebraic data types, type classes, purity, laziness, and effects represented at type boundaries                                               | **P:** algebraic data and explicit effects offer more leverage than adding many unrelated built-ins; laziness is not planned without a workload case                                                                                              |
| [OCaml](https://ocaml.org/manual/5.3/index.html)                                                      | Hindley–Milner inference, algebraic data, pattern matching, modules, native/bytecode execution, and effect handlers                            | **P:** stage inference, exhaustiveness, and module signatures independently so errors remain understandable                                                                                                                                       |
| [Gleam](https://gleam.run/writing-gleam/)                                                             | A small sound type system, immutable data, exhaustive patterns, and compilation to BEAM or JavaScript                                          | **P:** a friendly language can make invalid states unrepresentable without adopting an enormous type system                                                                                                                                       |
| [Erlang](https://www.erlang.org/doc/system/reference_manual.html)                                     | Isolated processes, message passing, selective receive, distribution, hot evolution, and failure-oriented design                               | **P:** concurrency needs isolation and mailbox/resource limits; do not expose shared mutable arrays across tasks                                                                                                                                  |
| [Elixir](https://hexdocs.pm/elixir/processes.html)                                                    | Lightweight linked processes and supervision-oriented fault handling on the BEAM                                                               | **P:** cancellation, failure propagation, and supervision are part of a useful concurrency design, not deployment afterthoughts                                                                                                                   |
| [Unison](https://www.unison-lang.org/docs/language-reference/abilities-and-ability-handlers/)         | Abilities and handlers place effects in function types; content-addressed definitions support distributed code                                 | **P:** a small capability/effect vocabulary can unify I/O, state, failure, async, and host access without ambient authority                                                                                                                       |
| [Julia](https://docs.julialang.org/en/v1/manual/)                                                     | Multiple dispatch, generic numeric programming, metaprogramming, and specialization for scientific workloads                                   | **P:** representative dispatch and numeric benchmarks should guide design; **N:** claim scientific performance while FORGE has only one numeric representation                                                                                    |
| [Lua 5.4](https://www.lua.org/manual/5.4/manual.html)                                                 | A compact embeddable runtime, tables, coroutines, lexical closures, and a clearly documented C API                                             | **P:** embedding should use a small capability-scoped API; FORGE's bounded VM is a good base but not yet an embedding contract                                                                                                                    |
| [Racket](https://docs.racket-lang.org/reference/)                                                     | Language-oriented programming, hygienic macros, modules, contracts, and programmable tooling                                                   | **P:** macros require hygiene, phase separation, expansion limits, and inspectable expanded output; textual substitution is a non-starter                                                                                                         |
| [D](https://dlang.org/spec/spec.html)                                                                 | Native compilation, compile-time execution, contracts, templates, modules, garbage collection, and `@safe` boundaries                          | **P:** safety modes and contracts need enforceable semantics; avoid a matrix of partially interacting feature modes                                                                                                                               |
| [Nim](https://nim-lang.org/docs/manual.html)                                                          | Native/JavaScript targets, hygienic AST macros, generics, effects, and several memory-management strategies                                    | **P:** metaprogramming should manipulate typed syntax through a bounded API, while target and memory choices stay explicit                                                                                                                        |
| [Dart](https://dart.dev/resources/language/spec)                                                      | Sound null safety, async streams, isolates, packages, and ahead-of-time or just-in-time execution                                              | **P:** preserve a single source model across interactive and ahead-of-time modes; isolate boundaries are preferable to shared mutable concurrency                                                                                                 |
| [Scala 3](https://docs.scala-lang.org/scala3/reference/)                                              | Algebraic data, pattern matching, higher-kinded abstractions, contextual parameters, metaprogramming, and JVM interop                          | **P:** test whether each abstraction improves real libraries and diagnostics; expressive power without teachable errors is not a win                                                                                                              |
| [F#](https://fsharp.org/specs/language-spec/)                                                         | Inferred functional types, discriminated unions, units of measure, computation expressions, and .NET interop                                   | **P:** domain types and dimensional checking are high-value library/compiler cooperation points after the core type system stabilizes                                                                                                             |

This set contains 28 named language references. “Beating” them means closing a
specific workflow gap with evidence—for example, a more reproducible diagnostic
contract or safer embedding boundary—not declaring FORGE globally superior to
systems serving different users.

## Compiler, IR, assembler, and target reference set

| Reference                                                                                   | Architectural evidence                                                                                                                       | Consequence for FORGE                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [LLVM code generator](https://llvm.org/docs/CodeGenerator.html)                             | Reusable target-independent lowering feeds target descriptions, instruction selection, register allocation, scheduling, and the MC layer     | **P:** a native backend is a multi-stage product, not “translate opcodes to assembly”; adopt it only behind a verified portable IR                         |
| [LLVM new pass manager](https://llvm.org/docs/NewPassManager.html)                          | Analyses, transformations, invalidation, and pipelines are explicit concepts                                                                 | **P:** every pass declares inputs, preserved analyses, deterministic output, verification, and differential tests                                          |
| [MLIR language reference](https://mlir.llvm.org/docs/LangRef/)                              | Multi-level, extensible SSA-like IR has textual, in-memory, and serializable forms                                                           | **P:** introduce a versioned typed FORGE IR with canonical text and JSON before binding the language to LLVM                                               |
| [MLIR dialect conversion](https://mlir.llvm.org/docs/DialectConversion/)                    | Conversion targets declare operation legality while patterns and type converters perform staged lowering                                     | **P:** each lowering stage must define legal input/output and reject partially converted programs                                                          |
| [Cranelift IR](https://github.com/bytecodealliance/wasmtime/blob/main/cranelift/docs/ir.md) | Typed SSA values, block parameters, explicit terminators, textual form, and a verifier support function-at-a-time compilation                | **P:** Cranelift is the first native-backend candidate after FORGE IR and WebAssembly, especially for fast development builds                              |
| [WebAssembly core specification](https://webassembly.github.io/spec/core/)                  | A portable, validated stack machine with precise binary/text formats                                                                         | **P:** WebAssembly is the first external execution target; compare it differentially with the existing VM                                                  |
| [WebAssembly Component Model](https://component-model.bytecodealliance.org/)                | Components expose typed interfaces and compose across source languages                                                                       | **P:** publish interface types and worlds rather than inventing a FORGE-only plugin ABI                                                                    |
| [WASI](https://wasi.dev/)                                                                   | Host APIs use capability-oriented interfaces without ambient authority                                                                       | **P:** file, network, clock, random, process, and environment access must be granted explicitly and remain testable                                        |
| [GCC internals](https://gcc.gnu.org/onlinedocs/gccint/)                                     | A production compiler spans language front ends, intermediate forms, optimization passes, machine descriptions, debug data, and target hooks | **P:** keep front-end semantics independent of backend mechanics; **N:** build every backend subsystem in-house                                            |
| [GNU assembler](https://sourceware.org/binutils/docs/as/)                                   | Real assembly includes sections, symbols, expressions, directives, relocations, object formats, and target-specific syntax                   | **S:** FORGE has inspectable labelled VM assembly; **P:** call future native text “assembly” only when its ABI, relocations, and object format are defined |
| [NASM](https://www.nasm.us/doc/)                                                            | A mature assembler separates source preprocessing, instruction encoding, output formats, symbols, and relocation behavior                    | **P:** generated native assembly needs round-trip fixtures and independent assembler/linker validation                                                     |
| [RISC-V unprivileged ISA](https://docs.riscv.org/reference/isa/unpriv/unpriv-index.html)    | A modular open ISA specifies base instructions, extensions, memory behavior, and encodings                                                   | **P:** if a direct educational backend is added, RV64 is a better documented teaching target than an invented pseudo-CPU                                   |

The immediate conclusion is intentionally conservative: FORGE should preserve
its transparent stack VM, add a verified typed IR, target WebAssembly
Component/WASI first, and only then evaluate Cranelift or LLVM for native code.
Direct machine-code emission before those boundaries would increase surface
area faster than confidence.

## Human, IDE, and agent protocol reference set

| Standard                                                                                                                     | What it standardizes                                                                                                                       | FORGE implication                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| [Language Server Protocol 3.17](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/) | JSON-RPC document synchronization, diagnostics, navigation, completion, edits, and workspace operations                                    | **P:** one incremental language service should feed the browser, CLI, editor, and agents; never implement four semantic front ends |
| [Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/specification)                                   | Capability-negotiated debug requests for breakpoints, stepping, stacks, scopes, variables, disassembly, memory, progress, and cancellation | **P:** stabilize source maps, VM pause/resume, and value handles before offering DAP                                               |
| [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html)                                        | A JSON standard for static-analysis results, rules, locations, fixes, and provenance                                                       | **P:** emit SARIF from the same diagnostic model used by CLI JSON and LSP                                                          |
| [Model Context Protocol](https://modelcontextprotocol.io/specification/2025-06-18/basic/index)                               | JSON-RPC lifecycle and capability negotiation for resources, prompts, and tools                                                            | **P:** expose bounded `check`, `compile`, `run`, and explain operations only after their CLI/service schemas stabilize             |
| [MCP tool result schema](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)                              | Tools may return structured content against declared output schemas, with text compatibility                                               | **S:** the versioned CLI JSON envelope is the proving ground; **P:** MCP should adapt it rather than scrape terminal prose         |

An “agent-friendly language” therefore needs deterministic commands,
discoverable capabilities, bounded output, stable schemas and exit classes,
structured diagnostics, source spans, cancellation, and reproducible artifacts.
Natural-language cleverness cannot compensate for missing contracts.

## Correctness and security reference set

| Reference                                                                | Evidence to adopt                                                                                                                | FORGE status and gate                                                                                                                                                 |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Csmith](https://users.cs.utah.edu/~regehr/papers/pldi11-preprint.pdf)   | The original randomized differential-testing work found wrong-code defects by generating programs and comparing mature compilers | **S:** independent differential execution exists; **P:** add grammar/type-directed generation, shrinking, seeds, and reproducible failure bundles                     |
| [LLVM libFuzzer](https://llvm.org/docs/LibFuzzer.html)                   | Coverage-guided in-process fuzzing evolves inputs around observed execution paths                                                | **P:** fuzz lexer, parser, IR reader/verifier, formatter, and binary decoder with persistent corpora                                                                  |
| [Alive2](https://github.com/AliveToolkit/alive2)                         | Symbolic translation validation checks whether LLVM transformations preserve behavior, within documented limitations             | **P:** validate or exhaustively test each FORGE IR optimization instead of trusting a green end-to-end suite                                                          |
| [CompCert](https://compcert.org/)                                        | A mechanically verified compiler proves semantic preservation for supported C subsets and targets                                | **P:** proof-friendly semantics and small verified components are strategic; **N:** claim a verified compiler without a stated theorem and machine-checked artifact   |
| [SLSA 1.2](https://slsa.dev/spec/v1.2/)                                  | Supply-chain levels describe provenance and build integrity properties                                                           | **S:** pinned CI actions, audits, SBOM, checksums, and immutable releases provide a base; **P:** generate signed provenance and document the achieved SLSA properties |
| [CycloneDX specification](https://cyclonedx.org/specification/overview/) | A standard bill of materials can describe components, dependencies, services, and vulnerabilities                                | **S:** releases publish a CycloneDX SBOM; **P:** validate it and bind it to signed provenance and archive digests                                                     |

## Cross-peer capability matrix

This compact matrix prevents individual peer lessons from becoming a
feature-shopping list.

| Capability                  | Strong reference systems           | FORGE now                                                                 | Evidence required before “complete”                                                                                                   |
| --------------------------- | ---------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Precise semantics           | ECMAScript, Java, C, C++           | **S:** small reference and conformance tests                              | Versioned normative specification, executable examples, compatibility policy, and at least two agreeing implementations               |
| Safety and resource control | Rust, Swift, Zig, WASI             | **S:** deterministic limits; **P:** ownership/effects/capabilities        | Static and dynamic guarantees stated separately, adversarial tests, no ambient host authority, and audited unsafe boundary            |
| Types and abstraction       | Haskell, OCaml, Gleam, Scala, Rust | **P**                                                                     | Soundness argument, inference/annotation rules, coherent traits, exhaustiveness tests, and diagnostic-quality gates                   |
| Errors and effects          | Zig, Haskell, OCaml, Unison        | **S:** structured compiler errors; **P:** source-language results/effects | Typed failure/effect sets, handler semantics, cancellation rules, and no hidden control transfer                                      |
| Concurrency and resilience  | Swift, Go, Erlang, Elixir, Dart    | **P**                                                                     | Structured lifetimes, isolation, deterministic testing, cancellation/failure propagation, quotas, and race-focused verification       |
| Metaprogramming             | Zig, Racket, Nim, C++              | **P**                                                                     | Hygienic typed syntax, phase separation, expansion limits, provenance, deterministic builds, and inspectable expansion                |
| Modules and packages        | Java, Go, Kotlin, TypeScript       | **P**                                                                     | Canonical identities, visibility, cycle policy, lockfile, offline mode, content integrity, and reproducible resolution                |
| Portable execution          | Java, Kotlin, Dart, WebAssembly    | **S:** browser VM; **P:** Wasm/WASI                                       | Same conformance corpus across VM and target, reproducible builds, target capability manifest, and ABI tests                          |
| Native execution            | C, C++, Rust, Zig, LLVM, Cranelift | **P**                                                                     | Verified IR, ABI/data-layout spec, object/link tests, debug metadata, differential execution, and published benchmarks                |
| Embedding and interop       | Lua, Python, C#, Carbon            | **P**                                                                     | Versioned C/component ABI, ownership and error rules, capability-scoped host API, and compatibility fixtures                          |
| Human tooling               | TypeScript, Rust, Go, C#           | **S:** visual workbench; **P:** formatter/LSP/DAP                         | Incremental correctness, golden diagnostics, editor matrix, cancellation, accessibility, and latency budgets                          |
| Agent tooling               | LSP, SARIF, MCP                    | **S:** CLI JSON/capability contract                                       | Deterministic snapshots, bounded artifacts, schema compatibility fixtures, cancellation, and protocol adapters with no semantic forks |
| Correctness assurance       | Csmith, Alive2, CompCert, Go       | **S:** oracle/differential/mutation base                                  | Generated corpus, coverage-guided fuzzing, shrinking, per-pass validation, reproducible failures, and proof artifacts where claimed   |
| Supply chain                | SLSA, CycloneDX                    | **S:** CI/SBOM/checksums                                                  | Hermetic rebuild evidence, signed provenance, dependency policy, vulnerability response, and reproducibility measurements             |

## Product thesis

FORGE can occupy a useful intersection rather than pretending to dominate
every niche:

1. **Transparent:** every compilation and lowering stage is inspectable in
   canonical human and machine forms.
2. **Deterministic and bounded:** the same source, compiler version,
   capabilities, and limits produce the same semantic result; all expensive
   operations have explicit budgets.
3. **Safe to embed:** host authority is capability-based, effects are visible,
   and unsafe interop is narrow.
4. **One service for humans and agents:** browser, CLI, LSP, DAP, SARIF, and MCP
   adapt a shared compiler service and stable schemas.
5. **Verified by disagreement:** interpreter, VM, WebAssembly, and later native
   backends cross-check one semantics, while fuzzing, mutation, shrinking, and
   pass verification seek counterexamples.
6. **Portable before platform-specific:** a versioned typed IR and
   WebAssembly Component/WASI target precede native specialization.

That thesis is narrower, more defensible, and more useful than “the language
with every feature.” The [roadmap](ROADMAP.md) defines the measurable sequence.
