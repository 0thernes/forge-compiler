import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules",
]);

function stripCode(markdown) {
  return markdown
    .replace(
      /(^|\n)( {0,3})(`{3,}|~{3,}).*?\n[\s\S]*?\n\2\3[^\n]*(?=\n|$)/g,
      "\n",
    )
    .replace(/`[^`\n]*`/g, "");
}

function githubSlug(heading) {
  return heading
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_~]/g, "")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function markdownAnchors(markdown) {
  const anchors = new Set();
  const occurrences = new Map();
  const source = stripCode(markdown);

  for (const line of source.split(/\r?\n/)) {
    const match = /^(?: {0,3})#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const base = githubSlug(match[1]);
    if (!base) continue;
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    anchors.add(occurrence === 0 ? base : `${base}-${occurrence}`);
  }

  for (const match of source.matchAll(/\bid=["']([^"']+)["']/gi)) {
    anchors.add(match[1]);
  }
  return anchors;
}

async function markdownFiles(rootDirectory) {
  const files = [];

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(entryPath);
      }
    }
  }

  await visit(rootDirectory);
  return files.sort();
}

function linkTargets(markdown) {
  const source = stripCode(markdown);
  const targets = [];

  for (const match of source.matchAll(
    /!?\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g,
  )) {
    targets.push(match[1]);
  }
  for (const match of source.matchAll(/^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm)) {
    targets.push(match[1]);
  }
  return targets;
}

function isExternal(target) {
  return target.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(target);
}

async function exists(target) {
  try {
    return await stat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function verifyDocs(root = ".") {
  const rootDirectory = path.resolve(root);
  const rootInfo = await exists(rootDirectory);
  if (!rootInfo?.isDirectory()) {
    throw new Error(`Documentation root is not a directory: ${rootDirectory}`);
  }

  const files = await markdownFiles(rootDirectory);
  if (files.length === 0) {
    throw new Error(`No Markdown files found beneath ${rootDirectory}`);
  }

  const contents = new Map();
  const anchors = new Map();
  const failures = [];
  let checkedLinks = 0;

  for (const file of files) {
    const markdown = await readFile(file, "utf8");
    contents.set(file, markdown);

    for (const rawTarget of linkTargets(markdown)) {
      const unwrapped = rawTarget.replace(/^<|>$/g, "");
      if (!unwrapped || isExternal(unwrapped)) continue;

      let decoded;
      try {
        decoded = decodeURIComponent(unwrapped);
      } catch {
        failures.push(
          `${path.relative(rootDirectory, file)}: invalid URL encoding in ${rawTarget}`,
        );
        continue;
      }

      const hashIndex = decoded.indexOf("#");
      const filePart = (hashIndex >= 0 ? decoded.slice(0, hashIndex) : decoded)
        .split("?")[0]
        .replaceAll("/", path.sep);
      const fragment = hashIndex >= 0 ? decoded.slice(hashIndex + 1) : "";
      const targetPath = path.resolve(
        path.dirname(file),
        filePart || path.basename(file),
      );
      const relativeTarget = path.relative(rootDirectory, targetPath);
      checkedLinks += 1;

      if (
        relativeTarget === ".." ||
        relativeTarget.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativeTarget)
      ) {
        failures.push(
          `${path.relative(rootDirectory, file)}: local link escapes the documentation root: ${rawTarget}`,
        );
        continue;
      }

      const targetInfo = await exists(targetPath);
      if (!targetInfo) {
        failures.push(
          `${path.relative(rootDirectory, file)}: missing local target ${rawTarget}`,
        );
        continue;
      }

      if (
        fragment &&
        targetInfo.isFile() &&
        targetPath.toLowerCase().endsWith(".md")
      ) {
        if (!anchors.has(targetPath)) {
          const targetMarkdown =
            contents.get(targetPath) ?? (await readFile(targetPath, "utf8"));
          anchors.set(targetPath, markdownAnchors(targetMarkdown));
        }
        if (!anchors.get(targetPath).has(fragment)) {
          failures.push(
            `${path.relative(rootDirectory, file)}: missing anchor #${fragment} in ${path.relative(rootDirectory, targetPath)}`,
          );
        }
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Documentation verification failed:\n- ${failures.join("\n- ")}`,
    );
  }

  return { files: files.length, links: checkedLinks, root: rootDirectory };
}

async function main() {
  const result = await verifyDocs(process.argv[2] ?? ".");
  console.log(
    `Documentation verified: ${result.files} Markdown files, ${result.links} local links`,
  );
}

const entryPoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (entryPoint === import.meta.url) {
  await main();
}
