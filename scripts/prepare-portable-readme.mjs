import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RELOCATED_LINKS = new Map([
  ["](../SECURITY.md)", "](SECURITY.md)"],
  ["](LANGUAGE.md)", "](docs/LANGUAGE.md)"],
  ["](ARCHITECTURE.md)", "](docs/ARCHITECTURE.md)"],
]);

export function renderPortableReadme(template) {
  let readme = template;
  for (const [sourceTarget, archiveTarget] of RELOCATED_LINKS) {
    if (!readme.includes(sourceTarget)) {
      throw new Error(
        `Portable README template is missing expected link target ${sourceTarget.slice(2, -1)}`,
      );
    }
    readme = readme.replaceAll(sourceTarget, archiveTarget);
  }
  return readme;
}

export async function preparePortableReadme(
  destination = "dist/README.md",
  template = "docs/PORTABLE-RELEASE.md",
) {
  const source = await readFile(path.resolve(template), "utf8");
  await writeFile(path.resolve(destination), renderPortableReadme(source));
}

async function main() {
  await preparePortableReadme(
    process.argv[2] ?? "dist/README.md",
    process.argv[3] ?? "docs/PORTABLE-RELEASE.md",
  );
}

const entryPoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (entryPoint === import.meta.url) {
  await main();
}
