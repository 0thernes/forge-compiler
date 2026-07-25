import {
  BUILTINS,
  DEFAULT_LIMITS,
  FORGE_VERSION,
  KEYWORDS,
} from "./constants.js";

export const FORGE_CAPABILITIES_SCHEMA = "forge.capabilities/v1";
export const FORGE_CLI_SCHEMA = "forge.cli/v1";
export const DEFAULT_PROTOCOL_OUTPUT_LIMIT_BYTES = 16 * 1024 * 1024;
export const PUBLIC_SCHEMA_VERSIONS = Object.freeze({
  tokens: "forge.tokens/v1",
  ast: "forge.ast/v1",
  analysis: "forge.analysis/v1",
  assembly: "forge.assembly/v1",
  "instruction-addresses": "forge.instruction-addresses/v1",
  timings: "forge.timings/v1",
  result: "forge.result/v1",
  values: "forge.values/v1",
  trace: "forge.trace/v1",
  diagnostic: "forge.diagnostic/v1",
});

export const CLI_EXIT_CODES = Object.freeze({
  success: 0,
  diagnostic: 1,
  usage: 2,
  input: 3,
  resource: 4,
  internal: 70,
});

export const CLI_COMMANDS = Object.freeze([
  "run",
  "check",
  "compile",
  "capabilities",
  "version",
  "help",
]);

export const COMPILER_ARTIFACTS = Object.freeze([
  "tokens",
  "ast",
  "analysis",
  "assembly",
  "linked",
  "instruction-addresses",
  "timings",
]);

/**
 * Returns a JSON-safe, capability-only manifest. Planned features deliberately
 * do not appear here: consumers can treat this document as a truthful contract
 * for the compiler they are currently invoking.
 */
export function getForgeCapabilities() {
  return {
    schema: FORGE_CAPABILITIES_SCHEMA,
    identity: {
      language: "FORGE",
      compiler: "forge-compiler",
      version: FORGE_VERSION,
      sourceExtensions: [".forge"],
    },
    language: {
      values: ["finite-number", "string", "mutable-array"],
      truthModel: "numeric",
      declarations: ["let", "fn"],
      controlFlow: ["if", "else", "while", "break", "continue", "return"],
      functions: {
        lexicalClosures: true,
        fixedArity: true,
        firstClassValues: false,
      },
      keywords: Object.keys(KEYWORDS),
      builtins: Object.entries(BUILTINS).map(([name, definition]) => ({
        name,
        arity: definition.arity,
      })),
    },
    compiler: {
      pipeline: ["lex", "parse", "analyze", "codegen", "link", "execute"],
      backend: "deterministic-stack-vm",
      artifacts: [...COMPILER_ARTIFACTS],
      artifactSchemas: { ...PUBLIC_SCHEMA_VERSIONS },
      diagnostics: {
        structured: true,
        schema: PUBLIC_SCHEMA_VERSIONS.diagnostic,
        fields: ["schema", "severity", "phase", "code", "message", "location"],
        sourcePositions: "one-based-line-and-column",
        columnEncoding: "utf-16-code-unit",
      },
      execution: {
        deterministic: true,
        bounded: true,
        historicalTrace: true,
      },
    },
    interfaces: {
      browserWorkbench: true,
      cli: {
        schema: FORGE_CLI_SCHEMA,
        commands: [...CLI_COMMANDS],
        input: ["utf-8-file", "stdin"],
        sourceMetadataCharacterEncoding: "utf-16-code-unit",
        output: ["human", "json"],
        protocolOutputLimitBytes: DEFAULT_PROTOCOL_OUTPUT_LIMIT_BYTES,
        limitOverrides: "tightening-only",
        stdinFilename: true,
        deterministicByDefault: true,
        timingsOptIn: true,
        exitCodes: { ...CLI_EXIT_CODES },
      },
    },
    verification: {
      unitAndConformanceSuites: true,
      independentTreeWalkOracle: true,
      differentialTesting: true,
      mutationSensitivityGate: true,
    },
    limits: { ...DEFAULT_LIMITS },
  };
}
