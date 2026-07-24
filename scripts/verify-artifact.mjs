import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { verifyDocs } from "./verify-docs.mjs";

const PORTABLE_FILES = [
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "docs/ARCHITECTURE.md",
  "docs/LANGUAGE.md",
  "docs/PORTABLE-RELEASE.md",
  "docs/RELEASING.md",
];

async function fileInfo(target) {
  try {
    return await stat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function filesBelow(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesBelow(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function isExternal(reference) {
  return (
    !reference ||
    reference.startsWith("#") ||
    reference.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(reference)
  );
}

async function resolveArtifactReference(root, sourceFile, reference) {
  const cleaned = decodeURIComponent(reference.split(/[?#]/)[0]);
  if (!cleaned) return sourceFile;

  if (!cleaned.startsWith("/")) {
    return path.resolve(
      path.dirname(sourceFile),
      cleaned.replaceAll("/", path.sep),
    );
  }

  const segments = cleaned.replace(/^\/+/, "").split("/");
  for (let index = 0; index < segments.length; index += 1) {
    const candidate = path.resolve(root, ...segments.slice(index));
    if (await fileInfo(candidate)) return candidate;
  }
  return path.resolve(root, ...segments);
}

function referencesIn(file, source) {
  const extension = path.extname(file).toLowerCase();
  const references = [];
  if (extension === ".html") {
    for (const match of source.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
      references.push(match[1]);
    }
  } else if (extension === ".css") {
    for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      references.push(match[1]);
    }
  } else if (extension === ".js") {
    for (const match of source.matchAll(
      /(?:new\s+URL|import)\(\s*(["'])([^"']+)\1/g,
    )) {
      references.push(match[2]);
    }
  }
  for (const match of source.matchAll(/[#@]\s*sourceMappingURL=([^\s*]+)/g)) {
    references.push(match[1]);
  }
  return references;
}

export async function verifyArtifact(root = "dist", { portable = false } = {}) {
  const rootDirectory = path.resolve(root);
  const rootInfo = await fileInfo(rootDirectory);
  if (!rootInfo?.isDirectory()) {
    throw new Error(`Artifact root is not a directory: ${rootDirectory}`);
  }

  const required = ["index.html", "forge-mark.svg", "assets"];
  if (portable) required.push(...PORTABLE_FILES);
  const failures = [];

  for (const relativePath of required) {
    const target = path.join(rootDirectory, relativePath);
    const info = await fileInfo(target);
    if (!info) failures.push(`missing required artifact path: ${relativePath}`);
  }

  const files = await filesBelow(rootDirectory);
  const assetFiles = files.filter((file) =>
    path.relative(rootDirectory, file).startsWith(`assets${path.sep}`),
  );
  if (!assetFiles.some((file) => file.endsWith(".js"))) {
    failures.push("assets directory contains no JavaScript bundle");
  }
  if (!assetFiles.some((file) => file.endsWith(".css"))) {
    failures.push("assets directory contains no CSS bundle");
  }

  let checkedReferences = 0;
  for (const file of files) {
    const info = await fileInfo(file);
    if (!info || info.size === 0) {
      failures.push(
        `empty artifact file: ${path.relative(rootDirectory, file)}`,
      );
      continue;
    }

    if (file.endsWith(".map")) {
      try {
        const map = JSON.parse(await readFile(file, "utf8"));
        if (map.version !== 3 || !Array.isArray(map.sources)) {
          failures.push(
            `invalid source map: ${path.relative(rootDirectory, file)}`,
          );
        }
      } catch {
        failures.push(
          `unparseable source map: ${path.relative(rootDirectory, file)}`,
        );
      }
      continue;
    }

    if (!/\.(?:css|html|js)$/i.test(file)) continue;
    const source = await readFile(file, "utf8");
    for (const reference of referencesIn(file, source)) {
      if (isExternal(reference)) continue;
      checkedReferences += 1;
      let target;
      try {
        target = await resolveArtifactReference(rootDirectory, file, reference);
      } catch {
        failures.push(
          `${path.relative(rootDirectory, file)}: invalid reference ${reference}`,
        );
        continue;
      }
      const relativeTarget = path.relative(rootDirectory, target);
      const targetInfo = await fileInfo(target);
      if (
        relativeTarget === ".." ||
        relativeTarget.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativeTarget) ||
        !targetInfo?.isFile()
      ) {
        failures.push(
          `${path.relative(rootDirectory, file)}: missing local asset ${reference}`,
        );
      }
    }
  }

  if (portable) {
    const readme = await readFile(
      path.join(rootDirectory, "README.md"),
      "utf8",
    );
    if (!/prebuilt static/i.test(readme)) {
      failures.push(
        "portable README does not identify the prebuilt static archive",
      );
    }
    if (/\]\(\s*src\//i.test(readme)) {
      failures.push("portable README contains a source-only relative link");
    }
    try {
      await verifyDocs(rootDirectory);
    } catch (error) {
      failures.push(error.message);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Artifact verification failed:\n- ${failures.join("\n- ")}`,
    );
  }

  return {
    files: files.length,
    references: checkedReferences,
    root: rootDirectory,
  };
}

async function main() {
  const arguments_ = process.argv.slice(2);
  const portable = arguments_.includes("--portable");
  const root =
    arguments_.find((argument) => !argument.startsWith("--")) ?? "dist";
  const result = await verifyArtifact(root, { portable });
  console.log(
    `Artifact verified: ${result.files} files, ${result.references} local asset references`,
  );
}

const entryPoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (entryPoint === import.meta.url) {
  await main();
}
