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

Node.js 24 and npm 11 are the release toolchain.

```bash
git clone https://github.com/0thernes/forge-compiler.git
cd forge-compiler
npm ci
npm run dev
```

| Command                  | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `npm run dev`            | Start the Vite development server              |
| `npm test`               | Run the complete Vitest suite once             |
| `npm run test:coverage`  | Run tests and enforce core coverage thresholds |
| `npm run lint`           | Run ESLint with zero warnings allowed          |
| `npm run format:check`   | Check Prettier formatting                      |
| `npm run build`          | Create the production bundle in `dist/`        |
| `npm run verify:quality` | Run formatting, lint, and coverage checks      |
| `npm run verify`         | Run the same quality gate used by CI           |

Pushes and pull requests run the quality gate with SHA-pinned actions. A
successful `main` build is the only artifact deployed to Pages. Version tags
also produce portable archives, a build-dependency CycloneDX SBOM, checksums,
and a draft GitHub Release. Publication makes the release tag and assets
immutable.

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
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Security and execution model](SECURITY.md)

FORGE is an educational compiler rather than a production sandbox or a
general-purpose application runtime. See the language guide for exact semantics
and enforced limits.

## License

[MIT](LICENSE)
