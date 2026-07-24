import { readFileSync } from "node:fs";
import { FORGE_VERSION } from "../src/compiler/constants.js";

const packageMetadata = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const lockMetadata = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
);
const languageReference = readFileSync(
  new URL("../docs/LANGUAGE.md", import.meta.url),
  "utf8",
);
const changelog = readFileSync(
  new URL("../CHANGELOG.md", import.meta.url),
  "utf8",
);
const requestedTag = process.argv[2];
const metadataOnly = requestedTag === "--metadata-only";
const tag = metadataOnly ? null : (requestedTag ?? process.env.GITHUB_REF_NAME);
const expectedTag = `v${packageMetadata.version}`;

if (packageMetadata.version !== FORGE_VERSION) {
  throw new Error(
    `Version mismatch: package.json is ${packageMetadata.version}, compiler is ${FORGE_VERSION}`,
  );
}
if (
  lockMetadata.version !== packageMetadata.version ||
  lockMetadata.packages?.[""]?.version !== packageMetadata.version
) {
  throw new Error(
    `Version mismatch: package-lock.json must use ${packageMetadata.version} at the document and root-package levels`,
  );
}
if (
  !languageReference.includes(
    `This document describes the behavior implemented by FORGE v${packageMetadata.version}.`,
  )
) {
  throw new Error(
    `Version mismatch: docs/LANGUAGE.md must describe FORGE v${packageMetadata.version}`,
  );
}
if (!changelog.includes(`## [${packageMetadata.version}]`)) {
  throw new Error(
    `Missing changelog entry for FORGE v${packageMetadata.version}`,
  );
}
if (!metadataOnly && tag !== expectedTag) {
  throw new Error(`Release tag must be ${expectedTag}; received ${tag}`);
}

console.log(
  metadataOnly
    ? `Project metadata verified for ${expectedTag}`
    : `Release metadata verified for ${expectedTag}`,
);
