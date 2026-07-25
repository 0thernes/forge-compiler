# CLI and automation contract

FORGE v14.2 exposes the same compiler used by the browser through a
zero-dependency Node.js command line. The human interface favors normal
terminal conventions; the JSON interface is a versioned automation boundary
for CI systems, editor adapters, scripts, and coding agents.

## Invocation

From a source checkout:

```bash
node ./bin/forge.mjs <command> [source.forge|-] [options]
npm run --silent forge -- <command> [source.forge|-] [options]
```

Installing or linking the package exposes the equivalent `forge` executable.
The supported runtime is Node.js 24 LTS; release work uses the exact versions
recorded in `package.json`.

An explicit `run`, `check`, or `compile` command reads standard input when its
source argument is absent or `-`. Passing a source path without a command is a
convenience alias for `run`. The `-h`/`--help` and `-V`/`--version` meta flags
take precedence over an explicit command and any source positionals.

## Commands

| Command        | Execution | Default human result                         |
| -------------- | --------- | -------------------------------------------- |
| `run`          | Yes       | Program output on stdout                     |
| `check`        | No        | One validation summary                       |
| `compile`      | No        | Labelled stack assembly                      |
| `capabilities` | No        | Shipped features, schemas, limits, and tools |
| `version`      | No        | Compiler version                             |
| `help`         | No        | Command reference                            |

Examples:

```bash
forge run examples/demo.forge
forge check - --stdin-filename generated.forge < generated-source.txt
forge compile demo.forge --emit=tokens,ast,analysis,assembly
forge capabilities --json --pretty
```

The compile command accepts a repeatable, comma-separated `--emit` option:

- `tokens`
- `ast`
- `analysis`
- `assembly`
- `linked`
- `instruction-addresses`
- `timings`
- `all`

`--limit NAME=INTEGER` tightens one documented compiler or VM limit and can be
repeated. A CLI caller cannot raise a limit above the shipped maximum until the
affected compiler passes are independently stack- and memory-safe. Unknown
names, increases, negative values, fractions, and unsafe integers are caller
errors. `--trace` adds the bounded historical trace to JSON `run` results.
`--timings` opts into nondeterministic phase measurements.

File and standard-input reads are bounded before UTF-8 decoding from the
effective `maxSourceLength` limit. Crossing that pre-decode safety bound is a
resource failure rather than an input or internal failure.

## Human stream contract

Human `run` mode reserves stdout for the FORGE program's output records.
Diagnostics and optional run timings go to stderr. A successful program with
no output writes nothing to stdout.

Human `check` and `compile` are compiler-reporting commands, so their requested
reports use stdout and their failures use stderr. The CLI never prompts.
Operational labels and diagnostics escape terminal controls and bidirectional
formatting characters. Program output remains program-controlled data and is
written verbatim in human `run` mode.

## JSON stream contract

Select JSON with `--json` or `--format=json`; add `--pretty` only for
indented output. The process writes exactly one `forge.cli/v1` document to
stdout on success or failure. Program output is carried inside
`data.result.output`, and stderr remains available for host-level logging.

```json
{
  "schema": "forge.cli/v1",
  "ok": true,
  "command": "run",
  "version": "14.2.0",
  "exitCode": 0,
  "source": {
    "kind": "stdin",
    "displayName": "generated.forge",
    "sha256": "…",
    "bytes": 12,
    "characters": 12,
    "characterEncoding": "utf-16-code-unit",
    "lines": 1
  },
  "diagnostics": [],
  "data": {
    "summary": {},
    "result": {
      "schema": "forge.result/v1",
      "status": "halted",
      "output": ["42"]
    }
  }
}
```

The source record intentionally omits source contents, resolved host paths,
timestamps, and random request identifiers. Unless timings are requested by
`--timings`, `--emit=timings`, or `--emit=all`, repeated invocations with the
same source, command, options, compiler version, and limits produce
byte-identical compact JSON.

`bytes` and `sha256` cover the raw UTF-8 payload, including an optional byte
order mark. `characters` covers decoded source and diagnostic columns count
UTF-16 code units, matching the current browser editor and future direct LSP
conversion; both encodings are named rather than implied.

The normative envelope shape is
[`docs/schemas/forge-cli-v1.schema.json`](schemas/forge-cli-v1.schema.json).
The capability manifest closes its top-level categories while intentionally
allowing additive fields inside named subsections for forward capability
negotiation. Consumers must ignore unknown subsection properties and continue
to validate the documented properties they use.
Artifact records identify their own schema:

| Projection             | Schema                           |
| ---------------------- | -------------------------------- |
| tokens                 | `forge.tokens/v1`                |
| AST                    | `forge.ast/v1`                   |
| analysis               | `forge.analysis/v1`              |
| assembly / linked code | `forge.assembly/v1`              |
| instruction addresses  | `forge.instruction-addresses/v1` |
| result                 | `forge.result/v1`                |
| runtime values         | `forge.values/v1`                |
| trace                  | `forge.trace/v1`                 |
| timings                | `forge.timings/v1`               |
| diagnostic             | `forge.diagnostic/v1`            |

Public AST and assembly projections are intentional mappings, not serialized
internal JavaScript objects. This lets internal representations evolve without
silently changing the wire contract.

The complete encoded response is capped at 16 MiB. If an artifact or runtime
value graph would cross that boundary, the CLI emits a small
`CLI_PROTOCOL_OUTPUT_LIMIT` diagnostic and exits with resource status `4`.
This protects automation hosts from result amplification independently of the
compiler and VM limits.

## Diagnostics and exits

Each JSON diagnostic has a schema, severity, compiler phase, stable code,
message, and optional one-based source location. Current positions identify a
start point rather than a complete range; capability discovery reports that
honestly.

| Exit | Class        | Meaning                                                |
| ---- | ------------ | ------------------------------------------------------ |
| `0`  | `success`    | Command completed without diagnostics                  |
| `1`  | `diagnostic` | Valid invocation; source or runtime diagnostic         |
| `2`  | `usage`      | Invalid option, combination, artifact, or limit value  |
| `3`  | `input`      | Missing, unreadable, or invalid UTF-8 source           |
| `4`  | `resource`   | An input, compiler, VM, or protocol budget was reached |
| `70` | `internal`   | Compiler or protocol implementation defect             |

JSON failures still use stdout so a caller can always decode one response.
Callers should inspect both the process exit and the envelope's `exitCode`;
they should use diagnostic `code`, not English message text, for control flow.

For the convenience source alias, an unknown bare positional is interpreted as
a source path rather than an unknown command. A missing path therefore exits
with input status `3`; use explicit commands in automation when that distinction
matters. Named pipes and other special files are rejected as inputs—streaming
source is supported through stdin.

## Cyclic, shared, and deeply nested values

FORGE arrays are mutable and may contain themselves, share nested arrays, or
form a chain deeper than a host JSON parser's recursion limit. Plain nested
JSON cannot represent all of those graphs portably. `forge.values/v1` therefore
uses a flat array-node table: global roots and node items refer to arrays by
numeric ID.

```json
{
  "schema": "forge.values/v1",
  "roots": {
    "value": { "$forge": "array-reference", "id": 0 }
  },
  "arrays": [
    {
      "id": 0,
      "items": [1, { "$forge": "array-reference", "id": 0 }]
    }
  ]
}
```

Array IDs equal their node's zero-based position in `arrays`. Each runtime
array is emitted exactly once, so aliases, cycles, and deep chains remain
bounded-depth JSON without losing identity. Generic public protocol values may
also use a path-based reference marker when a future compiler artifact contains
a shared host-side structure. These are semantic graph references, not display
ellipses or lost values.

## Compatibility policy

`forge.cli/v1` envelopes and concrete artifact projections are intentionally
closed contracts: unknown fields, commands, statuses, and exit codes do not
validate. Capability subsection objects are the deliberate exception: their
known fields are typed, while new optional discovery keys may be added for
negotiation within v1. Removing a field or changing an existing field's
semantics or type requires a new schema major. Compiler patch and feature
releases may continue emitting an older schema unchanged.

Consumers should discover the exact schema identifiers and shipped features
through `forge capabilities --json`; they must not derive protocol versions
from the compiler version. Planned targets and protocols do not appear until
implemented.
