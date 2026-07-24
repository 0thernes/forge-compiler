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

| Module               | Responsibility                                                  |
| -------------------- | --------------------------------------------------------------- |
| `constants.js`       | Tokens, built-ins, opcodes, version, and default limits         |
| `errors.js`          | `ForgeError` type, position formatting, and error normalization |
| `lexer.js`           | Tokenization and source positions                               |
| `parser.js`          | Recursive-descent parsing and AST construction                  |
| `analyze.js`         | Lexical scopes, declaration checks, call resolution, and arity  |
| `codegen.js`         | Assembly generation, internal labels, and immutable linking     |
| `vm.js`              | Iterative stack-machine execution and resource enforcement      |
| `format.js`          | Cycle-aware display and concatenation value rendering           |
| `ast.js`             | Human-readable AST rendering                                    |
| `index.js`           | Stable public API and pipeline orchestration                    |
| `compiler.worker.js` | Browser worker request boundary                                 |
| `selfTest.js`        | Browser-visible compatibility verification                      |
| `selfTestCases.js`   | Canonical self-test corpus consumed by `selfTest.js`            |
| `examples.js`        | Canonical examples re-exported by the `src/examples.js` adapter |

The files in `src/examples.js`, `src/self-test.js`, and the older helper module
names are compatibility adapters. They project the canonical corpora and
implementations under `src/compiler/` instead of maintaining divergent copies.

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

Code generation models function-name scopes as persistent parent-linked frames.
Queued nested functions retain a scope reference, avoiding whole-symbol-table
copies and keeping function-heavy compilation linear.

Every call frame stores:

- the return program counter;
- the caller scope;
- the operand-stack base;
- the received argument count;
- the internal function label;
- any incomplete caller output record and its quota state.

On return, the VM truncates the operand stack to the saved base, pushes exactly
one result, restores the caller scope, and resumes at the saved address. The VM
is iterative, so FORGE recursion does not consume the JavaScript call stack.

## Atomic output records

Code generation evaluates and formats every `print` argument from left to right
with the compatibility `PRINT` instruction, then completes the record with
`PRINT_LINE`. When a call begins, its VM frame isolates any incomplete caller
record; returning restores that exact record and quota state. A function called
from an argument can therefore emit its own complete record without sharing or
corrupting the pending outer record. This preserves v13 mutation and operand
stack behavior, and a zero-argument `PRINT_LINE` preserves the `print();`
empty-record behavior.

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

The public `execute` boundary validates instruction count, instruction shape,
operands, string/array sizes, opcodes, and linked targets before the VM mutates
state. Value formatting emits incrementally into one aggregate character
budget, so truncated strings and arrays retain balanced delimiters without
constructing an oversized intermediate value.

Display rendering and language coercion deliberately have different policies.
Output, trace, and inspector presentation use bounded character and item
budgets. When `+` has a string operand, the VM requests a complete rendering of
the other operand within `maxStringLength`, disables the display item cap, and
rejects cycles or arrays beyond the formatting-depth boundary. An ellipsis can
therefore describe a bounded display, but never silently becomes part of a
program-visible concatenated string.

Trace snapshots deep-copy arrays within explicit depth and item limits. This
keeps historical rows stable after later mutation without allowing the
inspector itself to grow without bound. Per-string and whole-trace character
budgets count retained opcode and argument aliases, stack truncation markers,
and captured values, preventing repeated snapshots from amplifying strings
across the Worker boundary. Output status markers use the same bounded
accounting path as program output and expose explicit truncation flags and
reasons.

## Browser boundary

The React interface sends compile and self-test requests to a module Web Worker.
The worker returns structured-cloneable compiler artifacts and diagnostics. A
promise-based main-thread fallback loads the compiler on demand in test
environments and browsers without Worker support. The programmatic API returns
linked code by default; the browser requests `{ includeLinkedCode: false }`
because its assembly inspector does not need that duplicate payload.

The interface associates each result with its source revision, ignores obsolete
in-flight completions, and clears previous artifacts after a current-source
failure. Worker startup failure falls back immediately. A later cloning or
transport failure rejects pending work, terminates the worker, and routes
subsequent requests through the fallback. A versioned source draft is stored
locally. The desktop workbench keeps the editor and selected inspector mounted
side by side, while compact layouts expose an explicit source/inspector switch.
Four system-font console palettes are selected through an accessible radio
group and persisted separately from the draft.

Token, assembly, and trace inspectors paginate complete result collections.
AST, output, and global-state presentation retains explicit rendering limits
while compilation still uses the complete program. The active inspector follows
the WAI-ARIA tab interaction model, diagnostics can focus their source
position, and live status uses one atomic announcement region.

## Verification and delivery

Vitest exercises:

- the canonical examples and conformance table through v13 compatibility
  adapters;
- v14 correctness and adversarial regressions;
- compiler stage contracts, limits, and trace behavior;
- 89 differential cases comparing VM output and cycle-safe final globals with
  an independent tree-walk execution backend;
- accessible React interactions.

The local quality gate checks formatting, environment-specific ESLint rules,
local Markdown links, synchronized package/lock/compiler/language versions,
matching changelog metadata, coverage thresholds, a pristine differential
baseline, four targeted mutation killers, a production build, and its expected
artifact contents. The differential interpreter independently implements
environments, control flow, built-ins, coercion, and formatting while
intentionally sharing the lexer, parser, and semantic analyzer. Shared-front-end
and resource-policy cases are tagged so their scope is not overstated.

One CI workflow runs that gate plus the dependency audit on every main-branch
push and pull request. Only the verified `main` artifact can flow to the
serialized Pages deployment job.

The Release workflow separates validation from mutation. Pull requests exercise
its read-only portable build, archive/SBOM/checksum creation, and artifact
handoff without receiving a write token. On a version tag or protected manual
retry, the `Verify and package` job also confirms the tag, versions, and `main`
ancestry. It builds with relative asset paths, validates the portable bundle and
its Markdown links, installs the portable guide as the archive `README.md`, and
produces the release assets.

Those assets cross an Actions artifact boundary to a permissionless
`Validate packaged assets` job, which downloads them and checks every recorded
SHA-256 digest. The dependent publishing job downloads and checks them once
more; it is skipped on pull requests and alone receives `contents: write`.

The publishing job may create a draft or replace assets on an existing draft,
making a workflow retry safe. It refuses to modify an already-published release;
repository release immutability then locks both the tag and assets. Dependabot
covers both npm and GitHub Actions dependencies.
