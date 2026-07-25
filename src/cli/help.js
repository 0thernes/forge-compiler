export const CLI_HELP = `FORGE Compiler

Usage:
  forge <command> [source.forge|-] [options]
  forge source.forge [options]

Commands:
  run           Compile and execute a UTF-8 source file or stdin
  check         Validate source without executing it
  compile       Emit compiler artifacts without executing
  capabilities  Print the truthful machine capability manifest
  version       Print the compiler version
  help          Show this help

Automation:
  --json                 Emit one forge.cli/v1 JSON document to stdout
  --pretty               Pretty-print JSON output
  --timings              Include nondeterministic phase timings
  --limit NAME=INTEGER   Tighten a compiler/VM limit; repeatable
  --stdin-filename NAME  Label stdin diagnostics without reading another file

Execution:
  --trace                Include the bounded historical trace in JSON run data

Compilation:
  --emit LIST            Comma-separated artifacts; repeatable
                         tokens, ast, analysis, assembly, linked,
                         instruction-addresses, timings, or all

General:
  --format human|json    Select output format
  -h, --help             Show help
  -V, --version          Show version
  --                     Stop option parsing

Input defaults to stdin for an explicit run, check, or compile command.
Human run mode reserves stdout for program output. JSON mode always writes a
single protocol document to stdout, including diagnostics on failure.
`;
