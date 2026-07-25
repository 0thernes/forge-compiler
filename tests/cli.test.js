import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { afterEach, describe, expect, it } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const CLI_PATH = path.join(REPOSITORY_ROOT, "bin", "forge.mjs");
const SCHEMA_PATH = path.join(
  REPOSITORY_ROOT,
  "docs",
  "schemas",
  "forge-cli-v1.schema.json",
);
const PACKAGE_VERSION = JSON.parse(
  await readFile(path.join(REPOSITORY_ROOT, "package.json"), "utf8"),
).version;
const validateEnvelope = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
  strictRequired: false,
}).compile(JSON.parse(await readFile(SCHEMA_PATH, "utf8")));
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

async function temporaryRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "forge-cli-"));
  temporaryRoots.push(root);
  return root;
}

function invokeForge(args, { input = Buffer.alloc(0), cwd, timeout } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: cwd ?? REPOSITORY_ROOT,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
      timeout,
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", reject);
    child.once("close", (exitCode, signal) => {
      resolve({
        exitCode,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

function invokeForgeWithClosedStdout(args, { input = Buffer.alloc(0) } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: REPOSITORY_ROOT,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const stderr = [];

    child.stdout.destroy();
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", reject);
    child.once("close", (exitCode, signal) => {
      resolve({
        exitCode,
        signal,
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

function parseCompactEnvelope(processResult) {
  expect(processResult.signal).toBeNull();
  expect(processResult.stderr).toBe("");
  expect(processResult.stdout.endsWith("\n")).toBe(true);
  expect(processResult.stdout.trimEnd().split(/\r?\n/)).toHaveLength(1);
  const envelope = JSON.parse(processResult.stdout);
  expect(
    validateEnvelope(envelope),
    JSON.stringify(validateEnvelope.errors, null, 2),
  ).toBe(true);
  return envelope;
}

function expectEnvelope(envelope, expected) {
  expect(envelope).toMatchObject({
    schema: "forge.cli/v1",
    version: PACKAGE_VERSION,
    ...expected,
  });
  expect(envelope).toHaveProperty("source");
  expect(envelope).toHaveProperty("diagnostics");
  expect(envelope).toHaveProperty("data");
}

describe("FORGE CLI process contract", () => {
  it("gives stdin and UTF-8 files equivalent compilation semantics", async () => {
    const root = await temporaryRoot();
    const sourcePath = path.join(root, "equivalent.forge");
    const source = [
      "fn add(left, right) { return left + right; }",
      'print("answer=", add(20, 22));',
      "",
    ].join("\n");
    await writeFile(sourcePath, source, "utf8");

    const [stdinResult, fileResult] = await Promise.all([
      invokeForge(["run", "-", "--json"], { input: source }),
      invokeForge(["run", sourcePath, "--json"]),
    ]);
    const stdinEnvelope = parseCompactEnvelope(stdinResult);
    const fileEnvelope = parseCompactEnvelope(fileResult);

    expect(stdinResult.exitCode).toBe(0);
    expect(fileResult.exitCode).toBe(0);
    expect(stdinEnvelope.data).toEqual(fileEnvelope.data);
    expect(stdinEnvelope.diagnostics).toEqual(fileEnvelope.diagnostics);
    expect(stdinEnvelope.source).toMatchObject({
      kind: "stdin",
      displayName: "<stdin>",
      characterEncoding: "utf-16-code-unit",
    });
    expect(fileEnvelope.source).toMatchObject({
      kind: "file",
      displayName: sourcePath,
      characterEncoding: "utf-16-code-unit",
    });
    expect(fileEnvelope.source).not.toHaveProperty("path");
    expect(fileEnvelope.source).not.toHaveProperty("resolvedPath");
    expect(stdinEnvelope.source.sha256).toBe(fileEnvelope.source.sha256);
    expect(stdinEnvelope.source.bytes).toBe(fileEnvelope.source.bytes);
    expect(stdinEnvelope.source.characters).toBe(
      fileEnvelope.source.characters,
    );
    expect(stdinEnvelope.source.lines).toBe(fileEnvelope.source.lines);
    expect(stdinEnvelope.data.result.output).toEqual(["answer=42"]);
  });

  it("keeps human program output on stdout and operational text on stderr", async () => {
    const success = await invokeForge(["run", "-", "--timings"], {
      input: 'print("alpha"); print(2 + 3);',
    });

    expect(success).toMatchObject({
      exitCode: 0,
      signal: null,
      stdout: "alpha\n5\n",
    });
    expect(success.stderr).toMatch(
      /^lex=\d+\.\d{3}ms parse=\d+\.\d{3}ms analyze=\d+\.\d{3}ms codegen=\d+\.\d{3}ms link=\d+\.\d{3}ms execute=\d+\.\d{3}ms total=\d+\.\d{3}ms\r?\n$/,
    );

    const diagnostic = await invokeForge(["run", "-"], {
      input: "print(missing);",
    });
    expect(diagnostic.exitCode).toBe(1);
    expect(diagnostic.stdout).toBe("");
    expect(diagnostic.stderr).toMatch(
      /^<stdin>:1:7: error analyze\[ANALYZE_UNDEFINED_VARIABLE\]: /,
    );

    const usage = await invokeForge(["--definitely-unknown"]);
    expect(usage.exitCode).toBe(2);
    expect(usage.stdout).toBe("");
    expect(usage.stderr).toContain(
      "error cli[CLI_USAGE]: Unknown option: --definitely-unknown",
    );
    expect(usage.stderr).toContain("Run 'forge help' for usage.");

    const embeddedNewline = await invokeForge(["run", "-"], {
      input: 'print("alpha\\n");',
    });
    expect(embeddedNewline).toMatchObject({
      exitCode: 0,
      signal: null,
      stdout: "alpha\n\n",
      stderr: "",
    });

    const hostileLabel = "trusted.forge\n\u001b[31mFAKE success\u001b[0m";
    const labelledCheck = await invokeForge(
      ["check", "-", "--stdin-filename", hostileLabel],
      { input: "let answer = 42;" },
    );
    expect(labelledCheck).toMatchObject({
      exitCode: 0,
      stderr: "",
      stdout:
        "OK trusted.forge\\n\\x1b[31mFAKE success\\x1b[0m (5 tokens, 3 instructions)\n",
    });

    const labelledDiagnostic = await invokeForge(
      ["check", "-", "--stdin-filename", hostileLabel],
      { input: "print(missing);" },
    );
    expect(labelledDiagnostic.exitCode).toBe(1);
    expect(labelledDiagnostic.stdout).toBe("");
    expect(labelledDiagnostic.stderr).not.toContain("\u001b");
    expect(labelledDiagnostic.stderr.split(/\r?\n/)).toHaveLength(2);
    expect(labelledDiagnostic.stderr).toContain(
      "trusted.forge\\n\\x1b[31mFAKE success\\x1b[0m:1:7:",
    );
  });

  it("emits one structured JSON document for success and diagnostics", async () => {
    const successResult = await invokeForge(
      ["run", "-", "--json", "--stdin-filename", "agent-input.forge"],
      { input: "let answer = 40 + 2; print(answer);" },
    );
    const success = parseCompactEnvelope(successResult);

    expect(successResult.exitCode).toBe(0);
    expectEnvelope(success, {
      ok: true,
      command: "run",
      exitCode: 0,
    });
    expect(success.source).toMatchObject({
      kind: "stdin",
      displayName: "agent-input.forge",
    });
    expect(success.diagnostics).toEqual([]);
    expect(success.data).toMatchObject({
      summary: {
        executed: true,
        status: "halted",
        outputRecords: 1,
      },
      result: {
        schema: "forge.result/v1",
        status: "halted",
        output: ["42"],
        globals: {
          schema: "forge.values/v1",
        },
      },
    });
    expect(success.data).not.toHaveProperty("timings");
    expect(success.data.result).not.toHaveProperty("trace");

    const failureResult = await invokeForge(
      ["run", "-", "--json", "--stdin-filename", "broken-agent-input.forge"],
      {
        input: "let = 1;",
      },
    );
    const failure = parseCompactEnvelope(failureResult);

    expect(failureResult.exitCode).toBe(1);
    expectEnvelope(failure, {
      ok: false,
      command: "run",
      exitCode: 1,
      data: null,
    });
    expect(failure.source.displayName).toBe("broken-agent-input.forge");
    expect(failure.diagnostics).toEqual([
      expect.objectContaining({
        schema: "forge.diagnostic/v1",
        severity: "error",
        phase: "parse",
        code: "PARSE_UNEXPECTED_TOKEN",
        location: {
          source: "broken-agent-input.forge",
          line: 1,
          column: 5,
        },
      }),
    ]);
  });

  it("projects successful JSON traces through the public contract", async () => {
    const result = await invokeForge(["run", "-", "--json", "--trace"], {
      input: "let answer = 40 + 2; print(answer);",
    });
    const envelope = parseCompactEnvelope(result);

    expect(result.exitCode).toBe(0);
    expect(envelope.data.result.trace).toMatchObject({
      schema: "forge.trace/v1",
      entries: expect.any(Array),
    });
    expect(envelope.data.result.trace.entries.length).toBeGreaterThan(0);
    for (const entry of envelope.data.result.trace.entries) {
      expect(entry).toMatchObject({
        index: expect.any(Number),
        programCounter: expect.any(Number),
        opcode: expect.any(String),
        stackBefore: expect.any(Array),
        stackAfter: expect.any(Array),
      });
      expect(entry).not.toHaveProperty("pc");
      expect(entry).not.toHaveProperty("op");
      expect(entry).not.toHaveProperty("arg");
    }
    expect(
      envelope.data.result.trace.entries.some((entry) =>
        Object.hasOwn(entry, "operand"),
      ),
    ).toBe(true);
  });

  it("keeps usage failures structured and command-aware in pretty JSON", async () => {
    const result = await invokeForge([
      "check",
      "--definitely-unknown",
      "--json",
      "--pretty",
    ]);
    const envelope = JSON.parse(result.stdout);

    expect(result).toMatchObject({
      exitCode: 2,
      signal: null,
      stderr: "",
    });
    expect(result.stdout).toMatch(/^\{\r?\n {2}"schema": "forge\.cli\/v1",/);
    expectEnvelope(envelope, {
      ok: false,
      command: "check",
      exitCode: 2,
      source: null,
      data: null,
    });
    expect(envelope.diagnostics).toEqual([
      expect.objectContaining({
        schema: "forge.diagnostic/v1",
        phase: "cli",
        code: "CLI_USAGE",
        message: "Unknown option: --definitely-unknown",
        location: null,
      }),
    ]);

    const overriddenFormat = await invokeForge([
      "--json",
      "--format",
      "human",
      "--definitely-unknown",
    ]);
    expect(overriddenFormat).toMatchObject({
      exitCode: 2,
      stdout: "",
    });
    expect(overriddenFormat.stderr).toContain("CLI_USAGE");

    const afterSeparator = await invokeForge(["run", "--", "-", "--json"]);
    expect(afterSeparator).toMatchObject({
      exitCode: 2,
      stdout: "",
    });
    expect(afterSeparator.stderr).toContain("CLI_USAGE");

    const misplacedPretty = await invokeForge([
      "--json",
      "run",
      "--",
      "-",
      "--pretty",
    ]);
    const misplacedPrettyEnvelope = parseCompactEnvelope(misplacedPretty);
    expect(misplacedPretty).toMatchObject({
      exitCode: 2,
      stderr: "",
    });
    expect(misplacedPrettyEnvelope).toMatchObject({
      ok: false,
      command: "run",
      exitCode: 2,
    });

    const invalidFormatAfterJson = await invokeForge([
      "--json",
      "--format=bogus",
    ]);
    const invalidFormatEnvelope = parseCompactEnvelope(invalidFormatAfterJson);
    expect(invalidFormatAfterJson).toMatchObject({
      exitCode: 2,
      stderr: "",
    });
    expect(invalidFormatEnvelope.diagnostics[0]).toMatchObject({
      code: "CLI_USAGE",
      message: "--format must be either 'human' or 'json'",
    });

    const emptyStdinLabel = await invokeForge([
      "check",
      "-",
      "--stdin-filename",
      "",
      "--json",
    ]);
    const emptyLabelEnvelope = parseCompactEnvelope(emptyStdinLabel);
    expect(emptyStdinLabel.exitCode).toBe(2);
    expect(emptyLabelEnvelope.diagnostics[0]).toMatchObject({
      code: "CLI_USAGE",
      message: "--stdin-filename requires a value",
    });
  });

  it("emits only explicitly selected, versioned compile artifacts", async () => {
    const result = await invokeForge(
      [
        "compile",
        "-",
        "--json",
        "--emit",
        "tokens,ast,analysis,assembly,linked,instruction-addresses",
      ],
      {
        input: [
          "fn double(value) { return value * 2; }",
          "let values = [20, 21];",
          "print(double(values[1]));",
        ].join("\n"),
      },
    );
    const envelope = parseCompactEnvelope(result);

    expect(result.exitCode).toBe(0);
    expectEnvelope(envelope, {
      ok: true,
      command: "compile",
      exitCode: 0,
    });
    expect(envelope.data.summary).toMatchObject({
      executed: false,
      functions: 1,
      variables: 1,
      calls: 1,
    });
    expect(Object.keys(envelope.data.artifacts)).toEqual([
      "tokens",
      "ast",
      "analysis",
      "assembly",
      "linkedCode",
      "instructionAddresses",
    ]);
    expect(envelope.data.artifacts.tokens).toMatchObject({
      schema: "forge.tokens/v1",
      items: expect.any(Array),
    });
    expect(envelope.data.artifacts.tokens.items.at(-1).kind).toBe("EOF");
    expect(envelope.data.artifacts.ast).toMatchObject({
      schema: "forge.ast/v1",
      root: { kind: "Program" },
    });
    expect(envelope.data.artifacts.analysis).toEqual({
      schema: "forge.analysis/v1",
      variables: 1,
      functions: 1,
      calls: 1,
    });
    expect(envelope.data.artifacts.assembly).toMatchObject({
      schema: "forge.assembly/v1",
      linked: false,
      instructions: expect.any(Array),
    });
    expect(envelope.data.artifacts.linkedCode).toMatchObject({
      schema: "forge.assembly/v1",
      linked: true,
      instructions: expect.any(Array),
    });
    expect(envelope.data.artifacts.instructionAddresses).toMatchObject({
      schema: "forge.instruction-addresses/v1",
      items: expect.any(Array),
    });
    expect(envelope.data.artifacts).not.toHaveProperty("timings");
  });

  it("advertises the truthful CLI, artifacts, limits, and exit codes", async () => {
    const jsonResult = await invokeForge(["capabilities", "--json"]);
    const envelope = parseCompactEnvelope(jsonResult);

    expect(jsonResult.exitCode).toBe(0);
    expectEnvelope(envelope, {
      ok: true,
      command: "capabilities",
      exitCode: 0,
      source: null,
      diagnostics: [],
    });
    expect(envelope.data.capabilities).toMatchObject({
      schema: "forge.capabilities/v1",
      identity: {
        language: "FORGE",
        compiler: "forge-compiler",
        version: PACKAGE_VERSION,
        sourceExtensions: [".forge"],
      },
      compiler: {
        backend: "deterministic-stack-vm",
        diagnostics: {
          columnEncoding: "utf-16-code-unit",
        },
        artifactSchemas: {
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
        },
      },
      interfaces: {
        browserWorkbench: true,
        cli: {
          schema: "forge.cli/v1",
          commands: [
            "run",
            "check",
            "compile",
            "capabilities",
            "version",
            "help",
          ],
          input: ["utf-8-file", "stdin"],
          sourceMetadataCharacterEncoding: "utf-16-code-unit",
          output: ["human", "json"],
          stdinFilename: true,
          deterministicByDefault: true,
          timingsOptIn: true,
          protocolOutputLimitBytes: 16 * 1024 * 1024,
          limitOverrides: "tightening-only",
          exitCodes: {
            success: 0,
            diagnostic: 1,
            usage: 2,
            input: 3,
            resource: 4,
            internal: 70,
          },
        },
      },
    });
    expect(envelope.data.capabilities.compiler.artifacts).toEqual([
      "tokens",
      "ast",
      "analysis",
      "assembly",
      "linked",
      "instruction-addresses",
      "timings",
    ]);
    expect(envelope.data.capabilities.limits).toMatchObject({
      maxSourceLength: expect.any(Number),
      maxSteps: expect.any(Number),
      maxOutputCharacters: expect.any(Number),
    });

    const wrongIdentityType = structuredClone(envelope);
    wrongIdentityType.data.capabilities.identity.version = 14.2;
    expect(validateEnvelope(wrongIdentityType)).toBe(false);

    const unknownTopLevelCapability = structuredClone(envelope);
    unknownTopLevelCapability.data.capabilities.forged = true;
    expect(validateEnvelope(unknownTopLevelCapability)).toBe(false);

    const negotiatedExtension = structuredClone(envelope);
    negotiatedExtension.data.capabilities.interfaces.cli.futureTransport = true;
    expect(validateEnvelope(negotiatedExtension)).toBe(true);

    const humanResult = await invokeForge(["capabilities"]);
    expect(humanResult).toMatchObject({
      exitCode: 0,
      signal: null,
      stderr: "",
    });
    expect(humanResult.stdout).toContain(`FORGE ${PACKAGE_VERSION}\n`);
    expect(humanResult.stdout).toContain("Machine protocol: forge.cli/v1\n");
    expect(humanResult.stdout).toContain("Backend: deterministic-stack-vm\n");
  });

  it("reports bounded execution as a resource failure in both formats", async () => {
    const source = "let value = 0; while (true) { value += 1; }";
    const jsonResult = await invokeForge(
      ["run", "-", "--json", "--limit", "maxSteps=8"],
      { input: source },
    );
    const envelope = parseCompactEnvelope(jsonResult);

    expect(jsonResult.exitCode).toBe(4);
    expectEnvelope(envelope, {
      ok: false,
      command: "run",
      exitCode: 4,
    });
    expect(envelope.diagnostics).toEqual([
      {
        schema: "forge.diagnostic/v1",
        severity: "error",
        phase: "execute",
        code: "VM_STEP_LIMIT",
        message: "Execution stopped after reaching the configured step limit",
        location: null,
      },
    ]);
    expect(envelope.data).toMatchObject({
      summary: {
        executed: true,
        status: "step_limit",
        steps: 8,
      },
      result: {
        schema: "forge.result/v1",
        status: "step_limit",
        output: ["[EXECUTION LIMIT REACHED]"],
        steps: 8,
      },
    });

    const humanResult = await invokeForge(
      ["run", "-", "--limit", "maxSteps=8"],
      { input: source },
    );
    expect(humanResult).toMatchObject({
      exitCode: 4,
      signal: null,
      stdout: "[EXECUTION LIMIT REACHED]\n",
    });
    expect(humanResult.stderr).toBe(
      "error execute[VM_STEP_LIMIT]: Execution stopped after reaching the configured step limit\n",
    );

    const outputResult = await invokeForge(
      ["run", "-", "--json", "--limit=maxOutputLines=1"],
      { input: 'print("first"); print("second");' },
    );
    const outputEnvelope = parseCompactEnvelope(outputResult);
    expect(outputResult.exitCode).toBe(4);
    expect(outputEnvelope).toMatchObject({
      ok: false,
      exitCode: 4,
      diagnostics: [
        {
          code: "VM_OUTPUT_LIMIT",
          phase: "execute",
        },
      ],
      data: {
        result: {
          outputTruncated: true,
          outputTruncationReason: "lines",
        },
      },
    });
  });

  it("rejects unsafe limit increases and human trace requests as usage errors", async () => {
    const increasedLimit = await invokeForge([
      "check",
      "-",
      "--json",
      "--limit=maxParserNesting=257",
    ]);
    const increasedEnvelope = parseCompactEnvelope(increasedLimit);
    expect(increasedLimit.exitCode).toBe(2);
    expect(increasedEnvelope.diagnostics[0]).toMatchObject({
      code: "CLI_USAGE",
      phase: "cli",
    });
    expect(increasedEnvelope.diagnostics[0].message).toContain(
      "may only be tightened",
    );

    const humanTrace = await invokeForge(["run", "-", "--trace"], {
      input: "print(1);",
    });
    expect(humanTrace).toMatchObject({
      exitCode: 2,
      stdout: "",
    });
    expect(humanTrace.stderr).toContain("--trace requires JSON output");
  });

  it("reports human compile timings when requested", async () => {
    const result = await invokeForge(["compile", "-", "--timings"], {
      input: "let answer = 40 + 2;",
    });

    expect(result).toMatchObject({
      exitCode: 0,
      signal: null,
      stderr: "",
    });
    expect(result.stdout).toContain("== ASSEMBLY ==\n");
    expect(result.stdout).toContain("== TIMINGS ==\n");
    expect(result.stdout).toContain('"schema": "forge.timings/v1"');
  });

  it("escapes terminal controls in human compiler artifacts", async () => {
    const result = await invokeForge(
      ["compile", "-", "--emit=tokens,ast,assembly"],
      {
        input: 'print("\u001b]0;FORGED\u0007\u200b\u2060\ufeff");',
      },
    );

    expect(result).toMatchObject({
      exitCode: 0,
      signal: null,
      stderr: "",
    });
    expect(result.stdout).not.toContain("\u001b");
    expect(result.stdout).not.toContain("\u0007");
    expect(result.stdout).not.toContain("\u200b");
    expect(result.stdout).not.toContain("\u2060");
    expect(result.stdout).not.toContain("\ufeff");
    expect(result.stdout).toContain("\\x1b]0;FORGED\\x07\\u200b\\u2060\\ufeff");
  });

  it("rejects invalid UTF-8 and missing inputs with the stable input exit", async () => {
    const invalidStdinResult = await invokeForge(["run", "-", "--json"], {
      input: Buffer.from([0x66, 0x6f, 0x80]),
    });
    const invalidStdin = parseCompactEnvelope(invalidStdinResult);

    expect(invalidStdinResult.exitCode).toBe(3);
    expectEnvelope(invalidStdin, {
      ok: false,
      command: "run",
      exitCode: 3,
      source: null,
      data: null,
    });
    expect(invalidStdin.diagnostics[0]).toMatchObject({
      schema: "forge.diagnostic/v1",
      phase: "cli",
      code: "CLI_INPUT_ENCODING",
      location: null,
    });

    const root = await temporaryRoot();
    const invalidPath = path.join(root, "invalid.forge");
    await writeFile(invalidPath, Buffer.from([0xc3, 0x28]));
    const invalidFileResult = await invokeForge([
      "check",
      invalidPath,
      "--json",
    ]);
    const invalidFile = parseCompactEnvelope(invalidFileResult);

    expect(invalidFileResult.exitCode).toBe(3);
    expect(invalidFile.diagnostics[0]).toMatchObject({
      schema: "forge.diagnostic/v1",
      phase: "cli",
      code: "CLI_INPUT_ENCODING",
    });

    const missingPath = path.join(root, "missing.forge");
    const missingResult = await invokeForge(["compile", missingPath, "--json"]);
    const missing = parseCompactEnvelope(missingResult);

    expect(missingResult.exitCode).toBe(3);
    expectEnvelope(missing, {
      ok: false,
      command: "compile",
      exitCode: 3,
      source: null,
      data: null,
    });
    expect(missing.diagnostics[0]).toMatchObject({
      schema: "forge.diagnostic/v1",
      phase: "cli",
      code: "CLI_INPUT_NOT_FOUND",
    });

    const directoryResult = await invokeForge(["check", root, "--json"]);
    const directoryEnvelope = parseCompactEnvelope(directoryResult);
    expect(directoryResult.exitCode).toBe(3);
    expect(directoryEnvelope.diagnostics[0]).toMatchObject({
      schema: "forge.diagnostic/v1",
      phase: "cli",
      code: "CLI_INPUT_NOT_REGULAR_FILE",
    });
  });

  it.runIf(process.platform !== "win32")(
    "rejects named pipes without waiting for a writer",
    async () => {
      const root = await temporaryRoot();
      const fifoPath = path.join(root, "source.forge");
      const created = spawnSync("mkfifo", [fifoPath], {
        encoding: "utf8",
        windowsHide: true,
      });
      expect(created.status, created.stderr).toBe(0);

      const result = await invokeForge(["check", fifoPath, "--json"], {
        timeout: 2_000,
      });
      const envelope = parseCompactEnvelope(result);
      expect(result.exitCode).toBe(3);
      expect(envelope.diagnostics[0]).toMatchObject({
        phase: "cli",
        code: "CLI_INPUT_NOT_REGULAR_FILE",
      });
    },
  );

  it("bounds files and stdin before UTF-8 decoding as resource failures", async () => {
    const oversized = Buffer.alloc(36, 0x61);
    const stdinResult = await invokeForge(
      ["run", "-", "--json", "--limit=maxSourceLength=8"],
      { input: oversized },
    );
    const stdinEnvelope = parseCompactEnvelope(stdinResult);

    expect(stdinResult.exitCode).toBe(4);
    expectEnvelope(stdinEnvelope, {
      ok: false,
      command: "run",
      exitCode: 4,
      source: null,
      data: null,
    });
    expect(stdinEnvelope.diagnostics[0]).toMatchObject({
      phase: "cli",
      code: "CLI_INPUT_LIMIT",
      location: null,
    });

    const root = await temporaryRoot();
    const sourcePath = path.join(root, "oversized.forge");
    await writeFile(sourcePath, oversized);
    const fileResult = await invokeForge([
      "check",
      sourcePath,
      "--json",
      "--limit=maxSourceLength=8",
    ]);
    const fileEnvelope = parseCompactEnvelope(fileResult);

    expect(fileResult.exitCode).toBe(4);
    expect(fileEnvelope).toMatchObject({
      ok: false,
      command: "check",
      exitCode: 4,
      source: null,
      data: null,
      diagnostics: [
        {
          code: "CLI_INPUT_LIMIT",
        },
      ],
    });
  });

  it("handles a closed stdout pipe without a stack trace", async () => {
    const result = await invokeForgeWithClosedStdout(["run", "-", "--json"], {
      input:
        "let values = []; let i = 0; while (i < 20000) { push(values, i); i += 1; }",
    });

    expect(result).toEqual({
      exitCode: 0,
      signal: null,
      stderr: "",
    });

    const diagnostic = await invokeForgeWithClosedStdout(
      ["run", "-", "--json"],
      {
        input: "print(missing);",
      },
    );
    expect(diagnostic).toEqual({
      exitCode: 1,
      signal: null,
      stderr: "",
    });
  });

  it("is byte-for-byte deterministic until timings are requested", async () => {
    const source = [
      "let values = [1, 2];",
      "push(values, 3);",
      'print("values=", values);',
    ].join("\n");
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        invokeForge(["run", "-", "--json"], { input: source }),
      ),
    );

    for (const result of results) {
      expect(result).toMatchObject({
        exitCode: 0,
        signal: null,
        stderr: "",
      });
      expect(JSON.parse(result.stdout).data).not.toHaveProperty("timings");
    }
    expect(new Set(results.map(({ stdout }) => stdout))).toHaveProperty(
      "size",
      1,
    );
  });

  it("preserves cyclic and shared runtime arrays with reference markers", async () => {
    const result = await invokeForge(["run", "-", "--json"], {
      input: [
        "let inner = [1];",
        "let outer = [inner, inner];",
        "let alias = inner;",
        "let cycle = [];",
        "push(cycle, cycle);",
        "let __proto__ = [9];",
      ].join("\n"),
    });
    const envelope = parseCompactEnvelope(result);

    expect(result.exitCode).toBe(0);
    expect(envelope.data.result.globals).toMatchObject({
      schema: "forge.values/v1",
      roots: {
        inner: { $forge: "array-reference", id: 0 },
        outer: { $forge: "array-reference", id: 1 },
        alias: { $forge: "array-reference", id: 0 },
        cycle: { $forge: "array-reference", id: 2 },
      },
      arrays: [
        { id: 0, items: [1] },
        {
          id: 1,
          items: [
            { $forge: "array-reference", id: 0 },
            { $forge: "array-reference", id: 0 },
          ],
        },
        {
          id: 2,
          items: [{ $forge: "array-reference", id: 2 }],
        },
        { id: 3, items: [9] },
      ],
    });
    expect(Object.keys(envelope.data.result.globals.roots)).toContain(
      "__proto__",
    );
    expect(envelope.data.result.globals.roots.__proto__).toEqual({
      $forge: "array-reference",
      id: 3,
    });
  });

  it("serializes deeply nested valid values without using the host stack", async () => {
    const result = await invokeForge(
      ["run", "-", "--json", "--limit=maxSteps=500000"],
      {
        input:
          "let value = []; let i = 0; while (i < 20000) { value = [value]; i += 1; }",
      },
    );
    const envelope = parseCompactEnvelope(result);

    expect(result.exitCode).toBe(0);
    expect(envelope).toMatchObject({
      ok: true,
      exitCode: 0,
      data: {
        result: {
          status: "halted",
        },
      },
    });

    const graph = envelope.data.result.globals;
    let reference = graph.roots.value;
    let observedDepth = 0;
    while (reference?.$forge === "array-reference") {
      const node = graph.arrays[reference.id];
      expect(node.id).toBe(reference.id);
      if (node.items.length === 0) break;
      [reference] = node.items;
      observedDepth += 1;
    }
    expect(observedDepth).toBe(20_000);
    expect(graph.arrays[reference.id].items).toEqual([]);
  });

  it("turns protocol amplification into a bounded resource envelope", async () => {
    const result = await invokeForge(["run", "-", "--json"], {
      input: [
        'let value = "x";',
        "let i = 0;",
        "while (i < 19) { value = value + value; i += 1; }",
        "let repeated = [];",
        "i = 0;",
        "while (i < 40) { push(repeated, value); i += 1; }",
      ].join("\n"),
    });
    const envelope = parseCompactEnvelope(result);

    expect(result.exitCode).toBe(4);
    expect(envelope).toMatchObject({
      ok: false,
      command: "run",
      exitCode: 4,
      source: {
        kind: "stdin",
      },
      diagnostics: [
        {
          schema: "forge.diagnostic/v1",
          phase: "cli",
          code: "CLI_PROTOCOL_OUTPUT_LIMIT",
        },
      ],
      data: null,
    });
  });

  it("ships a parseable JSON Schema that models reference markers", async () => {
    const schema = JSON.parse(await readFile(SCHEMA_PATH, "utf8"));

    expect(schema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "FORGE CLI v1 envelope",
      type: "object",
      properties: {
        schema: { const: "forge.cli/v1" },
      },
    });
    expect(schema.required).toEqual([
      "schema",
      "ok",
      "command",
      "version",
      "exitCode",
      "source",
      "diagnostics",
      "data",
    ]);
    expect(schema.$defs.referenceMarker).toMatchObject({
      type: "object",
      properties: {
        $forge: { const: "reference" },
      },
      required: ["$forge", "path"],
      additionalProperties: false,
    });
    expect(schema.$defs.arrayReferenceMarker).toMatchObject({
      type: "object",
      properties: {
        $forge: { const: "array-reference" },
        id: { $ref: "#/$defs/nonNegativeInteger" },
      },
      required: ["$forge", "id"],
      additionalProperties: false,
    });
  });
});
