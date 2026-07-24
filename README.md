# FORGE Compiler

[![CI](https://github.com/0thernes/forge-compiler/actions/workflows/ci.yml/badge.svg)](https://github.com/0thernes/forge-compiler/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-cyan.svg)](LICENSE)

FORGE is a small educational language, compiler pipeline, and deterministic
stack virtual machine that runs in the browser. The interface exposes each
stage—tokens, AST, assembly, program output, globals, and an execution trace—so
the implementation can be explored instead of treated as a black box.

**[Open the live compiler](https://0thernes.github.io/forge-compiler/)**

## What changed in v14

Version 14 turns the original v13 single-file experiment into a tested,
maintainable project:

- a real lex → parse → analyze → generate → link → execute pipeline;
- lexical scoping for functions, including nested functions that capture active
  outer variables;
- compile-time checks for duplicate declarations, undefined names, invalid
  control flow, and function arity;
- collision-proof internal labels and `Map`-backed symbol tables;
- explicit limits for source, parser depth, generated code, execution, stacks,
  arrays, strings, output, traces, and value formatting;
- structured, phase-aware diagnostics;
- immutable trace snapshots and retained final globals;
- compilation in a Web Worker to keep the interface responsive;
- versioned local draft persistence and stale-request protection;
- 200+ automated tests, coverage thresholds, linting, formatting, production
  builds, dependency updates, and GitHub Pages deployment.

The original v13 import paths remain as compatibility adapters to one canonical
example and conformance corpus. The unrelated graphics and creature-simulation
material in the provided planning notes is intentionally outside this compiler
repository.

## Try the language

```forge
let greeting = "FORGE";

fn fibonacci(n) {
  if (n <= 1) { return n; }
  return fibonacci(n - 1) + fibonacci(n - 2);
}

let values = [];
let index = 0;
while (index < 8) {
  push(values, fibonacci(index));
  index += 1;
}

print(greeting, " says ", values);
```

## Run locally

Node.js 24.18.0 LTS and npm 11.18.0 are the pinned development and release
toolchain; the supported Node line is Node.js 24 LTS. The deployed compiler is a
static browser application and does not require Node.js at runtime.

```bash
git clone https://github.com/0thernes/forge-compiler.git
cd forge-compiler
npm ci
npm run dev
```

The production bundle targets ES2022. A supported browser must provide
JavaScript modules, ES2022 runtime features, structured cloning, and local
storage. Module Web Workers are used when available; if Worker construction or
transport fails, compilation falls back to the main thread. CI exercises the
interface in jsdom rather than a cross-browser end-to-end matrix, so older and
embedded browsers outside this baseline are best effort.

| Command                   | Purpose                                                 |
| ------------------------- | ------------------------------------------------------- |
| `npm run dev`             | Start the Vite development server                       |
| `npm test`                | Run the complete Vitest suite once                      |
| `npm run test:coverage`   | Run tests and enforce core coverage thresholds          |
| `npm run lint`            | Run environment-specific ESLint checks                  |
| `npm run format:check`    | Check Prettier formatting                               |
| `npm run check:docs`      | Validate local Markdown links                           |
| `npm run verify:metadata` | Check package, lockfile, and compiler version agreement |
| `npm run build`           | Create the production bundle in `dist/`                 |
| `npm run check:artifact`  | Validate the existing production bundle                 |
| `npm run verify:quality`  | Run formatting, lint, docs, metadata, and coverage      |
| `npm run verify`          | Run the local quality gate, build, and artifact check   |

Pushes to `main` and pull requests targeting `main` run the quality gate and
dependency audit with SHA-pinned actions; pull requests also receive dependency
review. A successful `main` build is the only artifact deployed to Pages. Pull
requests exercise portable release packaging and the read-only artifact
handoff. Version tags additionally verify release metadata and `main` ancestry,
then a separate minimal-write job creates or updates the draft GitHub Release.
The static-site archives include a root README with portable hosting
instructions, alongside a build-dependency CycloneDX SBOM and checksums.
Publication makes the release tag and assets immutable.

## Pipeline

```text
FORGE source
    │
    ├─ lexer ─────── tokens + source positions
    ├─ parser ────── abstract syntax tree
    ├─ analyzer ──── names, scopes, arity, control-flow validity
    ├─ codegen ───── labelled stack-machine assembly
    ├─ linker ────── immutable label resolution
    └─ VM ────────── bounded execution, output, globals, trace
```

The public compiler API lives in
[`src/compiler/index.js`](src/compiler/index.js). A minimal programmatic use is:

```js
import { compileSource } from "./src/compiler/index.js";

const compilation = compileSource('print("hello");');
console.log(compilation.result.output); // ["hello"]
```

`compileSource` returns both labelled assembly and resolved linked code. Browser
workers use `{ includeLinkedCode: false }` because the interface only displays
assembly, avoiding an unnecessary second program copy across the worker
boundary.

## Documentation

- [Language reference](docs/LANGUAGE.md)
- [Compiler and VM architecture](docs/ARCHITECTURE.md)
- [Maintainer release runbook](docs/RELEASING.md)
- [Using a portable release archive](docs/PORTABLE-RELEASE.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Security and execution model](SECURITY.md)

FORGE is an educational compiler rather than a production sandbox or a
general-purpose application runtime. See the language guide for exact semantics
and enforced limits.

## License

[MIT](LICENSE)
