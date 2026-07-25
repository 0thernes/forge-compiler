import { spawnSync } from "node:child_process";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { npmInvocation } from "./npm-invocation.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));

export const CLI_PACKAGE_FILES = Object.freeze([
  ["bin/forge.mjs", "bin/forge.mjs"],
  ["src/cli", "src/cli"],
  ["src/compiler/analyze.js", "src/compiler/analyze.js"],
  ["src/compiler/ast.js", "src/compiler/ast.js"],
  ["src/compiler/capabilities.js", "src/compiler/capabilities.js"],
  ["src/compiler/codegen.js", "src/compiler/codegen.js"],
  ["src/compiler/constants.js", "src/compiler/constants.js"],
  ["src/compiler/errors.js", "src/compiler/errors.js"],
  ["src/compiler/format.js", "src/compiler/format.js"],
  ["src/compiler/index.js", "src/compiler/index.js"],
  ["src/compiler/lexer.js", "src/compiler/lexer.js"],
  ["src/compiler/parser.js", "src/compiler/parser.js"],
  ["src/compiler/vm.js", "src/compiler/vm.js"],
  ["docs/ARCHITECTURE.md", "docs/ARCHITECTURE.md"],
  ["docs/CLI.md", "docs/CLI.md"],
  ["docs/LANGUAGE.md", "docs/LANGUAGE.md"],
  [
    "docs/schemas/forge-cli-v1.schema.json",
    "docs/schemas/forge-cli-v1.schema.json",
  ],
  ["CLI-PACKAGE.md", "README.md"],
  ["CHANGELOG.md", "CHANGELOG.md"],
  ["LICENSE", "LICENSE"],
  ["SECURITY.md", "SECURITY.md"],
]);

function cliManifest(repositoryManifest) {
  return {
    name: repositoryManifest.name,
    version: repositoryManifest.version,
    description:
      "The dependency-free FORGE compiler, deterministic VM, and agent-grade CLI.",
    license: repositoryManifest.license,
    homepage: repositoryManifest.homepage,
    repository: repositoryManifest.repository,
    bugs: repositoryManifest.bugs,
    keywords: ["compiler", "language", "cli", "virtual-machine", "automation"],
    type: "module",
    bin: {
      forge: "bin/forge.mjs",
    },
    exports: {
      ".": "./src/compiler/index.js",
      "./cli": "./src/cli/main.js",
      "./capabilities": "./src/compiler/capabilities.js",
    },
    engines: {
      node: repositoryManifest.engines.node,
    },
  };
}

export async function stageCliPackage() {
  const stagingRoot = await mkdtemp(
    path.join(tmpdir(), "forge-cli-package-stage-"),
  );
  const repositoryManifest = JSON.parse(
    await readFile(path.join(REPOSITORY_ROOT, "package.json"), "utf8"),
  );

  try {
    for (const [source, destination] of CLI_PACKAGE_FILES) {
      const sourcePath = path.join(REPOSITORY_ROOT, source);
      const destinationPath = path.join(stagingRoot, destination);
      await mkdir(path.dirname(destinationPath), { recursive: true });
      await cp(sourcePath, destinationPath, {
        force: false,
        recursive: true,
      });
    }
    await chmod(path.join(stagingRoot, "bin", "forge.mjs"), 0o755);
    await writeFile(
      path.join(stagingRoot, "package.json"),
      `${JSON.stringify(cliManifest(repositoryManifest), null, 2)}\n`,
      "utf8",
    );
    return stagingRoot;
  } catch (error) {
    await rm(stagingRoot, { force: true, recursive: true });
    throw error;
  }
}

export async function packCliPackage(destination = REPOSITORY_ROOT) {
  const stagingRoot = await stageCliPackage();
  const outputDirectory = path.resolve(destination);

  try {
    await mkdir(outputDirectory, { recursive: true });
    const invocation = npmInvocation();
    const packed = spawnSync(
      invocation.command,
      [
        ...invocation.arguments,
        "pack",
        stagingRoot,
        "--ignore-scripts",
        "--json",
        "--pack-destination",
        outputDirectory,
      ],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        windowsHide: true,
      },
    );
    if (packed.status !== 0) {
      throw new Error(
        `npm package creation failed:\n${packed.stderr || packed.stdout}`,
      );
    }

    let report;
    try {
      [report] = JSON.parse(packed.stdout);
    } catch (error) {
      throw new Error(`Unable to parse npm package report: ${error.message}`);
    }
    if (!report?.filename || !Array.isArray(report.files)) {
      throw new Error(
        "npm package report is missing its filename or inventory",
      );
    }
    return {
      ...report,
      path: path.join(outputDirectory, report.filename),
    };
  } finally {
    await rm(stagingRoot, { force: true, recursive: true });
  }
}
