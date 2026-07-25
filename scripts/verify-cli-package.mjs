import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { packCliPackage } from "./cli-package.mjs";
import { verifyDocs } from "./verify-docs.mjs";

const REQUIRED_FILES = new Set([
  "CHANGELOG.md",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "bin/forge.mjs",
  "docs/ARCHITECTURE.md",
  "docs/CLI.md",
  "docs/LANGUAGE.md",
  "docs/schemas/forge-cli-v1.schema.json",
  "package.json",
  "src/cli/main.js",
  "src/compiler/capabilities.js",
  "src/compiler/index.js",
]);

function npmInvocation() {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      arguments: [process.env.npm_execpath],
    };
  }
  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    arguments: [],
  };
}

function runInstalledForge(shim, args, options = {}) {
  if (process.platform === "win32") {
    return spawnSync(`"${shim}" ${args.join(" ")}`, {
      ...options,
      shell: true,
    });
  }
  return spawnSync(shim, args, options);
}

export async function verifyCliPackage() {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "forge-cli-package-verify-"),
  );
  try {
    const packageDirectory = path.join(temporaryRoot, "package-output");
    const installDirectory = path.join(temporaryRoot, "install");
    const report = await packCliPackage(packageDirectory);
    const files = new Map(report.files.map((entry) => [entry.path, entry]));
    const failures = [];

    for (const required of REQUIRED_FILES) {
      const entry = files.get(required);
      if (!entry) failures.push(`missing ${required}`);
      else if (!Number.isFinite(entry.size) || entry.size <= 0) {
        failures.push(`empty ${required}`);
      }
    }

    const prohibited = [...files.keys()].filter(
      (file) =>
        /\.test\.[cm]?[jt]sx?$/i.test(file) ||
        file.startsWith("tests/") ||
        file.startsWith("scripts/") ||
        file.startsWith("src/components/") ||
        /^src\/App\./.test(file),
    );
    if (prohibited.length > 0) {
      failures.push(
        `development-only files included: ${prohibited.join(", ")}`,
      );
    }
    if (failures.length > 0) {
      throw new Error(
        `CLI package inventory failed:\n- ${failures.join("\n- ")}`,
      );
    }

    const invocation = npmInvocation();
    const installed = spawnSync(
      invocation.command,
      [
        ...invocation.arguments,
        "install",
        "--prefix",
        installDirectory,
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--offline",
        "--package-lock=false",
        report.path,
      ],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );
    if (installed.status !== 0) {
      throw new Error(
        `Clean CLI installation failed:\n${installed.stderr || installed.stdout}`,
      );
    }

    const installedRoot = path.join(
      installDirectory,
      "node_modules",
      "forge-compiler",
    );
    const manifest = JSON.parse(
      await readFile(path.join(installedRoot, "package.json"), "utf8"),
    );
    if (manifest.bin?.forge !== "bin/forge.mjs") {
      throw new Error("Installed manifest has an invalid forge bin mapping");
    }
    for (const field of [
      "dependencies",
      "devDependencies",
      "devEngines",
      "scripts",
      "packageManager",
      "private",
    ]) {
      if (Object.hasOwn(manifest, field)) {
        throw new Error(`CLI-only manifest must not contain '${field}'`);
      }
    }
    if (Object.keys(manifest.engines ?? {}).join(",") !== "node") {
      throw new Error("CLI-only manifest must declare only its Node.js engine");
    }

    await verifyDocs(installedRoot);
    const shim = path.join(
      installDirectory,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "forge.cmd" : "forge",
    );
    const smoke = runInstalledForge(shim, ["run", "-", "--json"], {
      encoding: "utf8",
      input: "print(40 + 2);",
      windowsHide: true,
    });
    if (smoke.status !== 0 || smoke.stderr !== "") {
      throw new Error(
        `Installed forge shim failed:\n${smoke.stderr || smoke.stdout}`,
      );
    }
    const envelope = JSON.parse(smoke.stdout);
    if (!envelope.ok || envelope.data?.result?.output?.[0] !== "42") {
      throw new Error("Installed forge shim returned an invalid smoke result");
    }

    return {
      filename: path.basename(report.path),
      files: files.size,
      bytes: report.size,
      unpackedBytes: report.unpackedSize,
    };
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

const entryPoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (entryPoint === import.meta.url) {
  const report = await verifyCliPackage();
  console.log(
    `CLI package verified: ${report.files} files, ${report.bytes} packed bytes, ${report.unpackedBytes} unpacked bytes`,
  );
}
