import { CLI_COMMANDS, COMPILER_ARTIFACTS } from "../compiler/capabilities.js";
import { DEFAULT_LIMITS } from "../compiler/constants.js";

const COMMANDS = new Set(CLI_COMMANDS);
const SOURCE_COMMANDS = new Set(["run", "check", "compile"]);
const EMIT_ARTIFACTS = new Set(COMPILER_ARTIFACTS);

export class CliUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "CliUsageError";
    this.phase = "cli";
    this.code = "CLI_USAGE";
  }
}

function takeOptionValue(argv, index, option) {
  const argument = argv[index];
  const equalsAt = argument.indexOf("=");
  if (equalsAt >= 0) {
    const value = argument.slice(equalsAt + 1);
    if (value.length === 0) {
      throw new CliUsageError(`${option} requires a value`);
    }
    return { value, nextIndex: index };
  }
  const value = argv[index + 1];
  if (value === undefined || value.length === 0) {
    throw new CliUsageError(`${option} requires a value`);
  }
  return { value, nextIndex: index + 1 };
}

function parseLimit(raw, limits) {
  const separator = raw.indexOf("=");
  if (separator <= 0 || separator === raw.length - 1) {
    throw new CliUsageError(
      "--limit must use the form <compiler-limit>=<non-negative-integer>",
    );
  }
  const name = raw.slice(0, separator);
  const valueText = raw.slice(separator + 1);
  if (!Object.hasOwn(DEFAULT_LIMITS, name)) {
    throw new CliUsageError(
      `Unknown compiler limit '${name}'. Run 'forge capabilities --json' to discover supported limits`,
    );
  }
  if (!/^(0|[1-9]\d*)$/.test(valueText)) {
    throw new CliUsageError(
      `Compiler limit '${name}' must be a non-negative safe integer`,
    );
  }
  const value = Number(valueText);
  if (!Number.isSafeInteger(value)) {
    throw new CliUsageError(
      `Compiler limit '${name}' must be a non-negative safe integer`,
    );
  }
  if (value > DEFAULT_LIMITS[name]) {
    throw new CliUsageError(
      `Compiler limit '${name}' may only be tightened from its shipped maximum of ${DEFAULT_LIMITS[name]}`,
    );
  }
  limits[name] = value;
}

function parseEmit(raw, emit) {
  const names = raw.split(",").filter(Boolean);
  if (names.length === 0) {
    throw new CliUsageError("--emit requires at least one artifact");
  }
  for (const name of names) {
    if (name === "all") {
      for (const artifact of COMPILER_ARTIFACTS) emit.add(artifact);
      continue;
    }
    if (!EMIT_ARTIFACTS.has(name)) {
      throw new CliUsageError(
        `Unknown compiler artifact '${name}'. Expected one of: ${COMPILER_ARTIFACTS.join(", ")}, all`,
      );
    }
    emit.add(name);
  }
}

export function inferCliRequest(argv) {
  let format = "human";
  let pretty = false;
  let command = null;
  const positionals = [];
  let acceptOptions = true;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (acceptOptions && argument === "--") {
      acceptOptions = false;
      continue;
    }
    if (!acceptOptions || !argument.startsWith("-") || argument === "-") {
      positionals.push(argument);
      continue;
    }
    if (argument === "--json") {
      format = "json";
      continue;
    }
    if (argument === "--pretty") {
      pretty = true;
      continue;
    }
    if (argument.startsWith("--format=")) {
      const candidate = argument.slice("--format=".length);
      if (candidate === "human" || candidate === "json") format = candidate;
      continue;
    }
    if (argument === "--format") {
      const candidate = argv[index + 1];
      if (candidate === "human" || candidate === "json") format = candidate;
      index += candidate === undefined ? 0 : 1;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      command = "help";
      continue;
    }
    if (argument === "--version" || argument === "-V") {
      command = "version";
      continue;
    }
    if (
      argument === "--stdin-filename" ||
      argument === "--emit" ||
      argument === "--limit"
    ) {
      index += argv[index + 1] === undefined ? 0 : 1;
    }
  }

  if (command === null) {
    const first = positionals[0];
    command =
      first && COMMANDS.has(first)
        ? first
        : first !== undefined
          ? "run"
          : "help";
  }
  return { command, format, pretty };
}

export function wantsJsonOutput(argv) {
  return inferCliRequest(argv).format === "json";
}

export function parseCliArguments(argv) {
  const options = {
    command: null,
    input: null,
    format: "human",
    pretty: false,
    timings: false,
    trace: false,
    stdinFilename: null,
    emit: new Set(),
    limits: {},
  };
  const positionals = [];
  let acceptOptions = true;
  let metaCommandRequested = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (acceptOptions && argument === "--") {
      acceptOptions = false;
      continue;
    }
    if (!acceptOptions || !argument.startsWith("-") || argument === "-") {
      positionals.push(argument);
      continue;
    }

    if (argument === "--help" || argument === "-h") {
      options.command = "help";
      metaCommandRequested = true;
      continue;
    }
    if (argument === "--version" || argument === "-V") {
      options.command = "version";
      metaCommandRequested = true;
      continue;
    }
    if (argument === "--json") {
      options.format = "json";
      continue;
    }
    if (argument === "--pretty") {
      options.pretty = true;
      continue;
    }
    if (argument === "--timings") {
      options.timings = true;
      continue;
    }
    if (argument === "--trace") {
      options.trace = true;
      continue;
    }
    if (
      argument === "--stdin-filename" ||
      argument.startsWith("--stdin-filename=")
    ) {
      const taken = takeOptionValue(argv, index, "--stdin-filename");
      index = taken.nextIndex;
      options.stdinFilename = taken.value;
      continue;
    }
    if (argument === "--format" || argument.startsWith("--format=")) {
      const taken = takeOptionValue(argv, index, "--format");
      index = taken.nextIndex;
      if (taken.value !== "human" && taken.value !== "json") {
        throw new CliUsageError("--format must be either 'human' or 'json'");
      }
      options.format = taken.value;
      continue;
    }
    if (argument === "--emit" || argument.startsWith("--emit=")) {
      const taken = takeOptionValue(argv, index, "--emit");
      index = taken.nextIndex;
      parseEmit(taken.value, options.emit);
      continue;
    }
    if (argument === "--limit" || argument.startsWith("--limit=")) {
      const taken = takeOptionValue(argv, index, "--limit");
      index = taken.nextIndex;
      parseLimit(taken.value, options.limits);
      continue;
    }
    throw new CliUsageError(`Unknown option: ${argument}`);
  }

  if (metaCommandRequested) {
    positionals.length = 0;
  } else {
    const first = positionals.shift();
    if (first && COMMANDS.has(first)) {
      options.command = first;
    } else if (first !== undefined) {
      options.command = "run";
      options.input = first;
    }
  }

  options.command ??= "help";
  if (options.input === null && positionals.length > 0) {
    options.input = positionals.shift();
  }
  if (positionals.length > 0) {
    throw new CliUsageError(
      `Expected at most one source file, received ${positionals.length + 1}`,
    );
  }

  if (!SOURCE_COMMANDS.has(options.command) && options.input !== null) {
    throw new CliUsageError(
      `The '${options.command}' command does not accept a source file`,
    );
  }
  if (options.pretty && options.format !== "json") {
    throw new CliUsageError("--pretty requires JSON output");
  }
  if (options.trace && options.command !== "run") {
    throw new CliUsageError("--trace is only valid with the 'run' command");
  }
  if (options.trace && options.format !== "json") {
    throw new CliUsageError("--trace requires JSON output");
  }
  if (
    options.stdinFilename !== null &&
    options.input !== null &&
    options.input !== "-"
  ) {
    throw new CliUsageError(
      "--stdin-filename is only valid when source is read from stdin",
    );
  }
  if (options.emit.size > 0 && options.command !== "compile") {
    throw new CliUsageError("--emit is only valid with the 'compile' command");
  }
  if (
    !SOURCE_COMMANDS.has(options.command) &&
    (options.timings ||
      options.stdinFilename !== null ||
      Object.keys(options.limits).length > 0)
  ) {
    throw new CliUsageError(
      `Compiler options are not valid with the '${options.command}' command`,
    );
  }
  if (options.command === "compile" && options.emit.size === 0) {
    options.emit.add("assembly");
  }

  return options;
}
