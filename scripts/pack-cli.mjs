import path from "node:path";
import { pathToFileURL } from "node:url";
import { packCliPackage } from "./cli-package.mjs";

function destinationFrom(argv) {
  const index = argv.indexOf("--pack-destination");
  if (index === -1) return process.cwd();
  if (!argv[index + 1]) {
    throw new Error("--pack-destination requires a directory");
  }
  return path.resolve(argv[index + 1]);
}

const entryPoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (entryPoint === import.meta.url) {
  const report = await packCliPackage(destinationFrom(process.argv.slice(2)));
  console.log(path.basename(report.path));
}
