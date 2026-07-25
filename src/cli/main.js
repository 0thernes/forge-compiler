import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { open, stat } from "node:fs/promises";
import path from "node:path";
import {
  CLI_COMMANDS,
  CLI_EXIT_CODES,
  FORGE_CLI_SCHEMA,
  getForgeCapabilities,
} from "../compiler/capabilities.js";
import { compileSource, renderAst } from "../compiler/index.js";
import { DEFAULT_LIMITS, FORGE_VERSION } from "../compiler/constants.js";
import { escapeTerminalText, formatValue } from "../compiler/format.js";
import {
  CliUsageError,
  inferCliRequest,
  parseCliArguments,
} from "./arguments.js";
import {
  createDiagnostic,
  createEnvelope,
  createErrorEnvelope,
  isProtocolOutputLimitError,
  stringifyEnvelope,
} from "./contract.js";
import { CLI_HELP } from "./help.js";
import {
  projectAnalysis,
  projectAssembly,
  projectAst,
  projectInstructionAddresses,
  projectResult,
  projectTimings,
  projectTokens,
} from "./projections.js";

class CliInputError extends Error {
  constructor(message, code = "CLI_INPUT") {
    super(message);
    this.name = "CliInputError";
    this.phase = "cli";
    this.code = code;
  }
}

function writeLine(stream, value = "") {
  stream.write(value.endsWith("\n") ? value : `${value}\n`);
}

function escapeHumanText(value) {
  return escapeTerminalText(value);
}

function encodedSourceByteLimit(maxSourceLength) {
  // A UTF-8 scalar uses at most four bytes. The extra three bytes admit an
  // optional UTF-8 BOM while the decoded compiler limit remains authoritative.
  return Math.min(Number.MAX_SAFE_INTEGER, maxSourceLength * 4 + 3);
}

function inputLimitError(displayName, maxSourceLength, maxBytes) {
  return new CliInputError(
    `Source input exceeds the bounded UTF-8 read for maxSourceLength=${maxSourceLength} (${maxBytes} bytes): ${displayName}`,
    "CLI_INPUT_LIMIT",
  );
}

async function collectBoundedBytes(
  iterable,
  { displayName, maxSourceLength, maxBytes },
) {
  const chunks = [];
  let total = 0;
  for await (const value of iterable) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    if (chunk.length > maxBytes - total) {
      throw inputLimitError(displayName, maxSourceLength, maxBytes);
    }
    chunks.push(chunk);
    total += chunk.length;
  }
  return Buffer.concat(chunks, total);
}

async function readBoundedFile(
  filename,
  { displayName, maxSourceLength, maxBytes },
) {
  const initialInfo = await stat(filename);
  if (!initialInfo.isFile()) {
    throw new CliInputError(
      `Source path is not a regular file: ${displayName}`,
      "CLI_INPUT_NOT_REGULAR_FILE",
    );
  }

  let handle;
  try {
    handle = await open(
      filename,
      fsConstants.O_RDONLY | fsConstants.O_NONBLOCK,
    );
    const openedInfo = await handle.stat();
    if (!openedInfo.isFile()) {
      throw new CliInputError(
        `Source path is not a regular file: ${displayName}`,
        "CLI_INPUT_NOT_REGULAR_FILE",
      );
    }

    const chunks = [];
    let total = 0;
    const buffer = Buffer.allocUnsafe(64 * 1024);
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      if (bytesRead > maxBytes - total) {
        throw inputLimitError(displayName, maxSourceLength, maxBytes);
      }
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
      total += bytesRead;
    }
    return Buffer.concat(chunks, total);
  } finally {
    await handle?.close();
  }
}

function sourceMetadata(source, descriptor, bytes) {
  return {
    kind: descriptor.kind,
    displayName: descriptor.displayName,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    characters: source.length,
    characterEncoding: "utf-16-code-unit",
    lines: source.length === 0 ? 1 : source.split("\n").length,
  };
}

async function readUtf8Source(input, stdinFilename, maxSourceLength, io) {
  let descriptor;
  if (input === null || input === "-") {
    descriptor = { kind: "stdin", displayName: stdinFilename ?? "<stdin>" };
  } else {
    if (!path.isAbsolute(input) && typeof io.cwd !== "string") {
      throw new CliInputError(
        `Unable to resolve a relative source path because the host working directory is unavailable: ${input}`,
        "CLI_INPUT_CWD",
      );
    }
    descriptor = {
      kind: "file",
      displayName: input,
      resolvedPath: path.isAbsolute(input)
        ? input
        : path.resolve(io.cwd, input),
    };
  }
  const maxBytes = encodedSourceByteLimit(maxSourceLength);
  let bytes;
  try {
    bytes =
      descriptor.kind === "stdin"
        ? await io.readStdin(maxBytes, {
            displayName: descriptor.displayName,
            maxSourceLength,
          })
        : await readBoundedFile(descriptor.resolvedPath, {
            displayName: descriptor.displayName,
            maxSourceLength,
            maxBytes,
          });
    const observedBytes =
      typeof bytes === "string"
        ? Buffer.byteLength(bytes, "utf8")
        : bytes.length;
    if (observedBytes > maxBytes) {
      throw inputLimitError(descriptor.displayName, maxSourceLength, maxBytes);
    }
  } catch (error) {
    if (error instanceof CliInputError) throw error;
    const reason =
      {
        EACCES: "Permission denied while reading source",
        EISDIR: "Source path is not a readable file",
        ENOENT: "Source file does not exist",
        EPERM: "Permission denied while reading source",
      }[error?.code] ?? "Unable to read source";
    throw new CliInputError(
      `${reason}: ${descriptor.displayName}`,
      error?.code === "ENOENT" ? "CLI_INPUT_NOT_FOUND" : "CLI_INPUT_READ",
    );
  }

  try {
    const encoded =
      typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes;
    const source = new TextDecoder("utf-8", { fatal: true }).decode(encoded);
    return {
      source,
      metadata: sourceMetadata(source, descriptor, encoded),
    };
  } catch {
    throw new CliInputError(
      `Source is not valid UTF-8: ${descriptor.displayName}`,
      "CLI_INPUT_ENCODING",
    );
  }
}

function compilationSummary(compilation) {
  const labels = compilation.assembly.filter(
    (instruction) => instruction.opcode === "LABEL",
  ).length;
  return {
    tokens: Math.max(0, compilation.tokens.length - 1),
    topLevelStatements: compilation.ast.body.length,
    variables: compilation.analysis.variables,
    functions: compilation.analysis.functions,
    calls: compilation.analysis.calls,
    assemblyRows: compilation.assembly.length,
    instructions: compilation.assembly.length - labels,
    labels,
    executed: compilation.result !== null,
    ...(compilation.result
      ? {
          status: compilation.result.status,
          steps: compilation.result.steps,
          outputRecords: compilation.result.output.length,
        }
      : {}),
  };
}

function selectArtifacts(compilation, emit) {
  const artifacts = {};
  for (const name of emit) {
    switch (name) {
      case "tokens":
        artifacts.tokens = projectTokens(compilation.tokens);
        break;
      case "ast":
        artifacts.ast = projectAst(compilation.ast);
        break;
      case "analysis":
        artifacts.analysis = projectAnalysis(compilation.analysis);
        break;
      case "assembly":
        artifacts.assembly = projectAssembly(
          compilation.assembly,
          compilation.instructionAddresses,
        );
        break;
      case "linked":
        artifacts.linkedCode = projectAssembly(
          compilation.linkedCode,
          compilation.linkedCode.map((_, index) => index),
          { linked: true },
        );
        break;
      case "instruction-addresses":
        artifacts.instructionAddresses = projectInstructionAddresses(
          compilation.instructionAddresses,
        );
        break;
      case "timings":
        artifacts.timings = projectTimings(compilation.timings);
        break;
      default:
        break;
    }
  }
  return artifacts;
}

function formatInstruction(instruction, address) {
  if (instruction.opcode === "LABEL") return `${instruction.argument}:`;
  const addressText = String(address).padStart(6, "0");
  const opcode = instruction.opcode.padEnd(24);
  const argument =
    instruction.argument === undefined ? "" : formatValue(instruction.argument);
  return `${addressText}  ${opcode}${argument}`;
}

function renderHumanArtifact(name, value, compilation) {
  switch (name) {
    case "tokens":
      return compilation.tokens
        .map(
          (token) =>
            `${token.position.line}:${token.position.column}\t${token.type}\t${formatValue(token.value)}`,
        )
        .join("\n");
    case "ast":
      return renderAst(compilation.ast);
    case "assembly":
      return compilation.assembly
        .map((instruction, index) =>
          formatInstruction(
            instruction,
            compilation.instructionAddresses[index],
          ),
        )
        .join("\n");
    case "linked":
      return compilation.linkedCode
        .map((instruction, index) => formatInstruction(instruction, index))
        .join("\n");
    default:
      return JSON.stringify(value, null, 2);
  }
}

function humanDiagnostic(diagnostic) {
  const location = diagnostic.location
    ? `${escapeHumanText(diagnostic.location.source)}:${diagnostic.location.line}:${diagnostic.location.column}: `
    : "";
  return `${location}${escapeHumanText(diagnostic.severity)} ${escapeHumanText(diagnostic.phase)}[${escapeHumanText(diagnostic.code)}]: ${escapeHumanText(diagnostic.message)}`;
}

function renderCapabilitiesHuman(capabilities) {
  const cli = capabilities.interfaces.cli;
  return [
    `FORGE ${capabilities.identity.version}`,
    `Capability contract: ${capabilities.schema}`,
    `Pipeline: ${capabilities.compiler.pipeline.join(" -> ")}`,
    `Backend: ${capabilities.compiler.backend}`,
    `Values: ${capabilities.language.values.join(", ")}`,
    `Builtins: ${capabilities.language.builtins
      .map(({ name, arity }) => `${name}/${arity}`)
      .join(", ")}`,
    `CLI commands: ${cli.commands.join(", ")}`,
    `Machine protocol: ${cli.schema}`,
    `Artifacts: ${capabilities.compiler.artifacts.join(", ")}`,
    `Default limits: ${Object.entries(capabilities.limits)
      .map(([name, value]) => `${name}=${value}`)
      .join(", ")}`,
  ].join("\n");
}

function timingsText(timings) {
  return Object.entries(timings)
    .map(([phase, milliseconds]) => `${phase}=${milliseconds.toFixed(3)}ms`)
    .join(" ");
}

async function defaultReadStdin(maxBytes, { displayName, maxSourceLength }) {
  return collectBoundedBytes(process.stdin, {
    displayName,
    maxSourceLength,
    maxBytes,
  });
}

function defaultIo() {
  let cwd = null;
  try {
    cwd = process.cwd();
  } catch {
    // Meta commands do not need a working directory. Relative source paths
    // fail inside the guarded CLI boundary with a sanitized internal error.
  }
  return {
    cwd,
    stdout: process.stdout,
    stderr: process.stderr,
    readStdin: defaultReadStdin,
  };
}

function emitEnvelope(io, envelope, pretty) {
  writeLine(io.stdout, stringifyEnvelope(envelope, pretty));
}

function emitEnvelopeWithResourceFallback(
  io,
  envelope,
  pretty,
  { command, source },
) {
  try {
    emitEnvelope(io, envelope, pretty);
    return null;
  } catch (error) {
    if (!isProtocolOutputLimitError(error)) throw error;
    emitEnvelope(
      io,
      createErrorEnvelope({
        command,
        error,
        source,
        exitCode: CLI_EXIT_CODES.resource,
      }),
      pretty,
    );
    return CLI_EXIT_CODES.resource;
  }
}

function executionLimitDiagnostic(source) {
  return createDiagnostic(
    {
      phase: "execute",
      code: "VM_STEP_LIMIT",
      message: "Execution stopped after reaching the configured step limit",
    },
    { source },
  );
}

function outputLimitDiagnostic(source, reason) {
  return createDiagnostic(
    {
      phase: "execute",
      code: "VM_OUTPUT_LIMIT",
      message: `Program output was truncated after reaching the configured ${reason ?? "output"} limit`,
    },
    { source },
  );
}

function traceLimitDiagnostic(source) {
  return createDiagnostic(
    {
      phase: "execute",
      code: "VM_TRACE_LIMIT",
      message:
        "Execution trace was truncated after reaching a configured trace limit",
    },
    { source },
  );
}

const INTERNAL_VM_CODES = new Set([
  "VM_ASSEMBLY",
  "VM_ASSEMBLY_INPUT",
  "VM_ASSEMBLY_INSTRUCTION",
  "VM_ASSEMBLY_OPERAND",
  "VM_ASSEMBLY_TARGET",
  "VM_CALL_FRAME_MISSING",
  "VM_CALL_STACK_UNDERFLOW",
  "VM_DUPLICATE_FUNCTION_BINDING",
  "VM_FUNCTION_BINDING",
  "VM_OPCODE_UNKNOWN",
  "VM_RUNTIME",
  "VM_SCOPE_UNDERFLOW",
  "VM_STACK_UNDERFLOW",
]);

function exitCodeForCompilerError(error) {
  if (typeof error?.code !== "string" || error.code.length === 0) {
    return CLI_EXIT_CODES.internal;
  }
  if (
    error.code.endsWith("_LIMIT") ||
    error.code === "VM_FORMAT_DEPTH" ||
    error.code === "VM_FORMAT_ITEMS"
  ) {
    return CLI_EXIT_CODES.resource;
  }
  if (
    error.code === "ANALYZE_EXPRESSION" ||
    error.code === "ANALYZE_STATEMENT" ||
    error.code === "LEX_SOURCE_TYPE" ||
    error.code === "PARSE_INPUT" ||
    error.code === "VM_ARITY" ||
    error.code === "VM_DUPLICATE_VARIABLE" ||
    error.code.startsWith("LIMITS_") ||
    error.phase === "codegen" ||
    error.phase === "link" ||
    INTERNAL_VM_CODES.has(error.code)
  ) {
    return CLI_EXIT_CODES.internal;
  }
  return CLI_EXIT_CODES.diagnostic;
}

function commandHint(argv) {
  const command = inferCliRequest(argv).command;
  return CLI_COMMANDS.includes(command) ? command : "help";
}

async function runCliWithIo(argv, io) {
  const fallbackRequest = inferCliRequest(argv);
  const fallbackJson = fallbackRequest.format === "json";
  let options;

  try {
    options = parseCliArguments(argv);
  } catch (error) {
    const envelope = createErrorEnvelope({
      command: commandHint(argv),
      error,
      exitCode: CLI_EXIT_CODES.usage,
    });
    if (fallbackJson) emitEnvelope(io, envelope, fallbackRequest.pretty);
    else {
      writeLine(io.stderr, humanDiagnostic(envelope.diagnostics[0]));
      writeLine(io.stderr, "Run 'forge help' for usage.");
    }
    return CLI_EXIT_CODES.usage;
  }

  if (options.command === "help") {
    if (options.format === "json") {
      emitEnvelope(
        io,
        createEnvelope({
          ok: true,
          command: "help",
          exitCode: CLI_EXIT_CODES.success,
          data: { help: CLI_HELP, protocol: FORGE_CLI_SCHEMA },
        }),
        options.pretty,
      );
    } else {
      io.stdout.write(CLI_HELP);
    }
    return CLI_EXIT_CODES.success;
  }

  if (options.command === "version") {
    if (options.format === "json") {
      emitEnvelope(
        io,
        createEnvelope({
          ok: true,
          command: "version",
          exitCode: CLI_EXIT_CODES.success,
          data: { version: FORGE_VERSION },
        }),
        options.pretty,
      );
    } else {
      writeLine(io.stdout, FORGE_VERSION);
    }
    return CLI_EXIT_CODES.success;
  }

  if (options.command === "capabilities") {
    const capabilities = getForgeCapabilities();
    if (options.format === "json") {
      emitEnvelope(
        io,
        createEnvelope({
          ok: true,
          command: "capabilities",
          exitCode: CLI_EXIT_CODES.success,
          data: { capabilities },
        }),
        options.pretty,
      );
    } else {
      writeLine(io.stdout, renderCapabilitiesHuman(capabilities));
    }
    return CLI_EXIT_CODES.success;
  }

  let input;
  try {
    input = await readUtf8Source(
      options.input,
      options.stdinFilename,
      options.limits.maxSourceLength ?? DEFAULT_LIMITS.maxSourceLength,
      io,
    );
  } catch (error) {
    const exitCode =
      typeof error?.code === "string" && error.code.endsWith("_LIMIT")
        ? CLI_EXIT_CODES.resource
        : CLI_EXIT_CODES.input;
    const envelope = createErrorEnvelope({
      command: options.command,
      error,
      exitCode,
    });
    if (options.format === "json") {
      emitEnvelope(io, envelope, options.pretty);
    } else {
      writeLine(io.stderr, humanDiagnostic(envelope.diagnostics[0]));
    }
    return exitCode;
  }

  let compilation;
  try {
    compilation = compileSource(input.source, {
      run: options.command === "run",
      includeLinkedCode:
        options.command === "compile" && options.emit.has("linked"),
      limits: options.limits,
    });
  } catch (error) {
    const exitCode = exitCodeForCompilerError(error);
    const reportedError =
      exitCode === CLI_EXIT_CODES.internal
        ? {
            phase: "internal",
            code: "CLI_INTERNAL",
            message: `Internal compiler failure: ${error.message}`,
          }
        : error;
    const envelope = createErrorEnvelope({
      command: options.command,
      error: reportedError,
      source: input.metadata,
      exitCode,
    });
    if (options.format === "json") {
      emitEnvelope(io, envelope, options.pretty);
    } else {
      writeLine(io.stderr, humanDiagnostic(envelope.diagnostics[0]));
    }
    return exitCode;
  }

  const summary = compilationSummary(compilation);
  const reachedStepLimit = compilation.result?.status === "step_limit";
  const reachedOutputLimit = compilation.result?.outputTruncated === true;
  const reachedTraceLimit =
    options.trace && compilation.result?.traceOverflow === true;
  const reachedResourceLimit =
    reachedStepLimit || reachedOutputLimit || reachedTraceLimit;
  const exitCode = reachedResourceLimit
    ? CLI_EXIT_CODES.resource
    : CLI_EXIT_CODES.success;
  const diagnostics = [];
  if (reachedStepLimit) {
    diagnostics.push(executionLimitDiagnostic(input.metadata));
  }
  if (reachedOutputLimit) {
    diagnostics.push(
      outputLimitDiagnostic(
        input.metadata,
        compilation.result.outputTruncationReason,
      ),
    );
  }
  if (reachedTraceLimit) {
    diagnostics.push(traceLimitDiagnostic(input.metadata));
  }

  if (options.format === "json") {
    let data;
    if (options.command === "run") {
      data = {
        summary,
        result: projectResult(compilation.result, {
          includeTrace: options.trace,
        }),
        ...(options.timings
          ? { timings: projectTimings(compilation.timings) }
          : {}),
      };
    } else if (options.command === "check") {
      data = {
        summary,
        analysis: projectAnalysis(compilation.analysis),
        ...(options.timings
          ? { timings: projectTimings(compilation.timings) }
          : {}),
      };
    } else {
      const emit = new Set(options.emit);
      if (options.timings) emit.add("timings");
      data = {
        summary,
        artifacts: selectArtifacts(compilation, emit),
      };
    }
    const protocolExitCode = emitEnvelopeWithResourceFallback(
      io,
      createEnvelope({
        ok: !reachedResourceLimit,
        command: options.command,
        exitCode,
        source: input.metadata,
        diagnostics,
        data,
      }),
      options.pretty,
      { command: options.command, source: input.metadata },
    );
    return protocolExitCode ?? exitCode;
  }

  if (options.command === "run") {
    if (compilation.result.output.length > 0) {
      io.stdout.write(`${compilation.result.output.join("\n")}\n`);
    }
    if (options.timings) writeLine(io.stderr, timingsText(compilation.timings));
    for (const diagnostic of diagnostics) {
      writeLine(io.stderr, humanDiagnostic(diagnostic));
    }
    return exitCode;
  }

  if (options.command === "check") {
    writeLine(
      io.stdout,
      `OK ${escapeHumanText(input.metadata.displayName)} (${summary.tokens} tokens, ${summary.instructions} instructions)`,
    );
    if (options.timings) writeLine(io.stdout, timingsText(compilation.timings));
    return CLI_EXIT_CODES.success;
  }

  const emit = new Set(options.emit);
  if (options.timings) emit.add("timings");
  const artifacts = selectArtifacts(compilation, emit);
  const entries = Object.entries(artifacts);
  entries.forEach(([name, value], index) => {
    if (entries.length > 1) {
      if (index > 0) writeLine(io.stdout);
      writeLine(io.stdout, `== ${name.toUpperCase()} ==`);
    }
    writeLine(io.stdout, renderHumanArtifact(name, value, compilation));
  });
  return CLI_EXIT_CODES.success;
}

export async function runCli(argv, providedIo = {}) {
  const io = { ...defaultIo(), ...providedIo };
  try {
    return await runCliWithIo(argv, io);
  } catch (error) {
    const fallbackRequest = inferCliRequest(argv);
    const protocolLimit = isProtocolOutputLimitError(error);
    const exitCode = protocolLimit
      ? CLI_EXIT_CODES.resource
      : CLI_EXIT_CODES.internal;
    const internalError = protocolLimit
      ? error
      : {
          phase: "internal",
          code: "CLI_INTERNAL",
          message: "Internal compiler failure",
        };
    const envelope = createErrorEnvelope({
      command: commandHint(argv),
      error: internalError,
      exitCode,
    });
    if (fallbackRequest.format === "json") {
      emitEnvelope(io, envelope, fallbackRequest.pretty);
    } else {
      writeLine(io.stderr, humanDiagnostic(envelope.diagnostics[0]));
    }
    return exitCode;
  }
}

export { CliInputError, CliUsageError };
