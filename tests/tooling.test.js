import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { npmInvocation } from "../scripts/npm-invocation.mjs";
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
  it("reuses npm's CLI entry point", () => {
    expect(
      npmInvocation({
        npmExecPath: "C:\\tools\\npm\\bin\\npm-cli.js",
        nodeExecutable: "node.exe",
        platform: "win32",
      }),
    ).toEqual({
      command: "node.exe",
      arguments: ["C:\\tools\\npm\\bin\\npm-cli.js"],
    });
  });

  it.each([
    [
      "C:\\tools\\pnpm\\pnpm.cjs",
      "win32",
      {
        command: "cmd.exe",
        arguments: ["/d", "/s", "/c", "npm.cmd"],
      },
    ],
    ["/tools/yarn/bin/yarn.js", "linux", { command: "npm", arguments: [] }],
    [null, "darwin", { command: "npm", arguments: [] }],
  ])(
    "falls back from non-npm exec path %s on %s",
    (npmExecPath, platform, expected) => {
      expect(
        npmInvocation({
          commandInterpreter: "cmd.exe",
          npmExecPath,
          nodeExecutable: "node",
          platform,
        }),
      ).toEqual(expected);
    },
  );

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

  it.each([
    { relativePath: "index.html", expectedType: "file", portable: false },
    { relativePath: "forge-mark.svg", expectedType: "file", portable: false },
    { relativePath: "assets", expectedType: "directory", portable: false },
    { relativePath: "README.md", expectedType: "file", portable: true },
  ])(
    "rejects $relativePath when it is not a $expectedType",
    async ({ relativePath, expectedType, portable }) => {
      const root = await temporaryRoot("forge-artifact-");
      const requiredPaths = new Map([
        ["index.html", "file"],
        ["forge-mark.svg", "file"],
        ["assets", "directory"],
      ]);
      if (portable) requiredPaths.set("README.md", "file");
      requiredPaths.set(
        relativePath,
        expectedType === "file" ? "directory" : "file",
      );

      for (const [requiredPath, actualType] of requiredPaths) {
        const target = path.join(root, requiredPath);
        if (actualType === "directory") {
          await mkdir(target);
        } else {
          await writeFile(target, requiredPath);
        }
      }

      await expect(verifyArtifact(root, { portable })).rejects.toThrow(
        new RegExp(
          `Artifact verification failed:[\\s\\S]*required artifact path is not a ${expectedType}: ${relativePath.replaceAll(".", "\\.")}`,
        ),
      );
    },
  );
});
