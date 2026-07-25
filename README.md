# FORGE Compiler

[![CI](https://github.com/0thernes/forge-compiler/actions/workflows/ci.yml/badge.svg)](https://github.com/0thernes/forge-compiler/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-cyan.svg)](LICENSE)

FORGE is an educational language, explainable compiler pipeline, deterministic
stack virtual machine, retro browser workbench, and automation-ready CLI. Both
interfaces expose the real stages—tokens, AST, analysis, assembly, output,
globals, and bounded execution trace—so the implementation can be inspected
instead of treated as a black box.

**[Open the live compiler](https://0thernes.github.io/forge-compiler/)**

## What changed in v14.2

Version 14.2 establishes the first stable interface shared by people, scripts,
CI systems, and coding agents:

- `forge run`, `check`, and `compile` accept a UTF-8 file or standard input;
- `forge.cli/v1` JSON keeps protocol data on stdout, returns structured
  diagnostics on failure, and uses documented exit classes;
- public compiler artifacts use explicit versioned projections instead of
  leaking mutable implementation objects;
- cyclic, shared, and deeply nested runtime arrays remain portable through a
  deterministic flat value graph;
- `forge capabilities --json` reports only features, limits, artifacts, and
  interfaces that the current compiler actually ships;
- a responsive machine-interface deck brings that contract into all four
  retro workbench eras; and
- a primary-source [competitive landscape](docs/COMPETITIVE-LANDSCAPE.md) and
  [architecture roadmap](docs/ROADMAP.md) turn “challenge the best” into
  measurable correctness, safety, determinism, portability, tooling, and
  performance gates.

See the complete [CLI and automation contract](docs/CLI.md) for stream
discipline, artifact schemas, exit classes, deterministic output, and cyclic
value encoding.

Release assets include a focused, dependency-free
`forge-compiler-cli-v*.tgz`. Install a downloaded archive globally with
`npm install --global ./forge-compiler-cli-v14.2.0.tgz`, or add it to a project
with `npm install ./forge-compiler-cli-v14.2.0.tgz`.

## What changed in v14.1

Version 14.1 adds a backend-independent execution oracle and turns the
interface into an adaptive retro-future compiler laboratory:

- a backend-independent AST tree-walk interpreter cross-checks the production
  stack-machine backend across 92 curated differential cases;
- a mutation-sensitivity gate proves that the corpus detects relational,
  arithmetic, scope, and short-circuit code-generation defects;
- string concatenation preserves complete program-visible values up to the
  string limit instead of silently reusing display truncation;
- Atomic 1958, Orbit 1966, Analog 1977, and Neon 1984 console themes provide
  identifiable palettes without external font or asset dependencies;
- a persistent source/inspector workbench becomes an explicit one-pane switch
  on compact screens, with paginated large artifacts, clearer pipeline timing,
  one-step example undo, and source-position error navigation;
- expanded keyboard, focus, forced-color, reduced-motion, responsive, and live
  status behavior keeps the physical-console presentation accessible.

## Version 14 foundation

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
- 380+ automated tests, coverage thresholds, linting, formatting, production
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

Run the same compiler from a terminal or automation harness:

```bash
node ./bin/forge.mjs run program.forge
printf 'print(40 + 2);' | node ./bin/forge.mjs check --json
node ./bin/forge.mjs compile program.forge --emit=ast,assembly --json --pretty
node ./bin/forge.mjs capabilities --json --pretty
```

`npm run --silent forge -- …` is the machine-clean package-script equivalent.
An explicit `run`, `check`, or `compile` command reads stdin when the source
argument is omitted or `-`. Human run mode reserves stdout for program output.
JSON mode always emits one `forge.cli/v1` document, including diagnostics on
failure; timings are excluded unless requested by `--timings`,
`--emit=timings`, or `--emit=all`.

The production bundle targets ES2022. A supported browser must provide
JavaScript modules, ES2022 runtime features, structured cloning, and local
storage. Module Web Workers are used when available; if Worker construction or
transport fails, compilation falls back to the main thread. CI exercises the
interface in jsdom rather than a cross-browser end-to-end matrix, so older and
embedded browsers outside this baseline are best effort.

| Command                       | Purpose                                                     |
| ----------------------------- | ----------------------------------------------------------- |
| `npm run dev`                 | Start the Vite development server                           |
| `npm run --silent forge -- …` | Run the human or machine-clean JSON compiler CLI            |
| `npm test`                    | Run the complete Vitest suite once                          |
| `npm run test:coverage`       | Run tests and enforce core coverage thresholds              |
| `npm run verify:mutation`     | Prove the differential corpus kills four targeted mutants   |
| `npm run lint`                | Run environment-specific ESLint checks                      |
| `npm run format:check`        | Check Prettier formatting                                   |
| `npm run check:docs`          | Validate local Markdown links                               |
| `npm run verify:metadata`     | Check release versions and required changelog agreement     |
| `npm run build`               | Create the production bundle in `dist/`                     |
| `npm run check:artifact`      | Validate the existing production bundle                     |
| `npm run verify:quality`      | Run formatting, lint, docs, metadata, coverage, and mutants |
| `npm run verify`              | Run the local quality gate, build, and artifact check       |

The CLI exit contract is `0` success, `1` source/runtime diagnostic, `2`
invalid invocation, `3` input failure, `4` resource exhaustion, and `70`
internal compiler failure. Use `forge capabilities --json` rather than parsing
help text to discover commands, artifact schemas, and current defaults.

The tree-walk oracle uses a conservative 256-frame operational cap, applied to
both differential engines, so host recursion cannot mask a FORGE limit result.
The production VM remains iterative with its 50,000-frame default and has
separate coverage proving 20,000 recursive calls do not consume the host stack.

Pushes to `main` and pull requests targeting `main` run the quality gate and
dependency audit with SHA-pinned actions; pull requests also receive dependency
review. A successful `main` build is the only artifact deployed to Pages. Pull
requests exercise portable release packaging and the read-only artifact
handoff. Version tags additionally verify release metadata and `main` ancestry,
then a separate minimal-write job creates or updates the draft GitHub Release.
The static-site archives include a root README with portable hosting
instructions. A separate minimal `.tgz` carries the executable compiler core
and machine schemas and is smoke-tested after clean extraction. Releases also
include a build-dependency CycloneDX SBOM and checksums. The publisher refuses
to replace assets on an existing published release; when the
repository's release-immutability setting is enabled, publication also locks
the release and its tag.

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
