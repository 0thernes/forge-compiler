import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderPortableReadme } from "../scripts/prepare-portable-readme.mjs";
import { verifyArtifact } from "../scripts/verify-artifact.mjs";
import { verifyDocs } from "../scripts/verify-docs.mjs";

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

async function temporaryRoot(prefix) {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

describe("repository verification tools", () => {
  it("relocates portable guide links for the archive root", () => {
    const readme = renderPortableReadme(
      [
        "[Security](../SECURITY.md)",
        "[Language](LANGUAGE.md)",
        "[Architecture](ARCHITECTURE.md)",
      ].join("\n"),
    );

    expect(readme).toContain("[Security](SECURITY.md)");
    expect(readme).toContain("[Language](docs/LANGUAGE.md)");
    expect(readme).toContain("[Architecture](docs/ARCHITECTURE.md)");
  });

  it("preserves inline-code text when validating heading anchors", async () => {
    const root = await temporaryRoot("forge-docs-");
    await writeFile(
      path.join(root, "reference.md"),
      "# Reference\n\n## The `maxStringLength` limit\n",
    );
    await writeFile(
      path.join(root, "guide.md"),
      "[String policy](reference.md#the-maxstringlength-limit)\n",
    );

    await expect(verifyDocs(root)).resolves.toMatchObject({
      files: 2,
      links: 1,
    });
  });

  it("aggregates a missing portable README with artifact failures", async () => {
    const root = await temporaryRoot("forge-artifact-");
    await mkdir(path.join(root, "assets"));
    await writeFile(path.join(root, "index.html"), "<!doctype html>");
    await writeFile(path.join(root, "forge-mark.svg"), "<svg></svg>");

    await expect(verifyArtifact(root, { portable: true })).rejects.toThrow(
      /Artifact verification failed:[\s\S]*missing required artifact path: README\.md/,
    );
  });
});
