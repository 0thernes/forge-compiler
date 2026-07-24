# Architecture

FORGE is deliberately small enough to read end-to-end while preserving the
boundaries of a conventional compiler.

## Data flow

```text
source
  │
  ▼
lexer ── Token[]
  │
  ▼
parser ── Program AST
  │
  ▼
semantic analyzer ── declaration/call summary
  │
  ▼
code generator ── labelled assembly
  │
  ▼
linker ── executable instructions with numeric targets
  │
  ▼
iterative VM ── status + output + globals + bounded trace
```

`compileSource` coordinates these stages and records independent timings. A
failure is normalized to a `ForgeError` with a phase, stable code, message, and
position when available.

## Module map

| Module               | Responsibility                                                 |
| -------------------- | -------------------------------------------------------------- |
| `constants.js`       | Tokens, built-ins, opcodes, version, and default limits        |
| `lexer.js`           | Tokenization and source positions                              |
| `parser.js`          | Recursive-descent parsing and AST construction                 |
| `analyze.js`         | Lexical scopes, declaration checks, call resolution, and arity |
| `codegen.js`         | Assembly generation, internal labels, and immutable linking    |
| `vm.js`              | Iterative stack-machine execution and resource enforcement     |
| `format.js`          | Bounded, cycle-aware value rendering                           |
| `ast.js`             | Human-readable AST rendering                                   |
| `index.js`           | Stable public API and pipeline orchestration                   |
| `compiler.worker.js` | Browser worker request boundary                                |
| `selfTest.js`        | Browser-visible compatibility verification                     |

The files in `src/examples.js`, `src/self-test.js`, and the older helper module
names remain compatibility fixtures for the v13 test corpus. The v14
application uses the modules under `src/compiler/`.

## Lexical function environments

Each runtime scope has a parent pointer, a variable map, and a function-binding
map. `BIND_FUNCTION` stores the declaration environment before statements in a
block execute. A call switches variable resolution to that stored environment,
which prevents caller-local variables from leaking into the callee.

```text
declaration scope ◄──── function binding
       ▲                       │ CALL
       │ parent                ▼
outer activation ◄──── new function-local scope
```

Nested functions therefore capture an active outer scope. Since functions are
not first-class values, captured activations cannot outlive the call that
created them.

Every call frame stores:

- the return program counter;
- the caller scope;
- the operand-stack base;
- the received argument count;
- the internal function label.

On return, the VM truncates the operand stack to the saved base, pushes exactly
one result, restores the caller scope, and resumes at the saved address. The VM
is iterative, so FORGE recursion does not consume the JavaScript call stack.

## Label safety

User identifiers cannot contain `$`. Generated control-flow and function labels
use a `$$forge:` namespace plus monotonically increasing IDs. The linker uses a
`Map`, rejects duplicate labels, rejects unresolved targets, and returns new
instruction objects instead of mutating assembly.

## Resource model

Compilation and execution accept one merged limits object. Checks exist at the
boundary closest to the resource: the lexer checks source and token counts, the
parser checks nesting, code generation checks instruction count, and the VM
checks execution, call/operand stacks, arrays, strings, output, and traces.
Numeric operations reject non-finite values.

Trace snapshots deep-copy arrays within explicit depth and item limits. This
keeps historical rows stable after later mutation without allowing the
inspector itself to grow without bound. Per-string and whole-trace character
budgets also prevent repeated stack snapshots from amplifying a large literal
across the Worker boundary.

## Browser boundary

The React interface sends compile and self-test requests to a module Web Worker.
The worker returns structured-cloneable compiler artifacts and diagnostics. A
synchronous promise-based fallback exists for test environments and browsers
without Worker support.

The interface treats results as stale when their source no longer matches the
editor and clears previous artifacts after a failed compilation. Token and
assembly inspectors cap rendered entries, and the AST view declines oversized
inspector payloads while compilation still uses the complete program.

## Verification and delivery

Vitest exercises:

- the retained v13 examples and conformance table;
- v14 correctness and adversarial regressions;
- compiler stage contracts, limits, and trace behavior;
- accessible React interactions.

The CI workflow checks formatting, ESLint, coverage thresholds, and a production
build on every main-branch push and pull request. The Pages workflow repeats the
release gate, builds with the repository base path, and deploys only that
artifact. Dependabot covers both npm and GitHub Actions dependencies.
