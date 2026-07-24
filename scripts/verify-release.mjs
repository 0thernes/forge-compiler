import { readFileSync } from "node:fs";
import { FORGE_VERSION } from "../src/compiler/constants.js";

const packageMetadata = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const lockMetadata = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
);
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
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
if (tag !== expectedTag) {
  throw new Error(`Release tag must be ${expectedTag}; received ${tag}`);
}

console.log(`Release metadata verified for ${expectedTag}`);
