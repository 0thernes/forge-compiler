#!/usr/bin/env node

import { runCli } from "../src/cli/main.js";
import { CLI_EXIT_CODES } from "../src/compiler/capabilities.js";

let outputStreamFailed = false;

for (const [name, stream] of [
  ["stdout", process.stdout],
  ["stderr", process.stderr],
]) {
  stream.on("error", (error) => {
    // A downstream reader may close either pipe before FORGE finishes. Let the
    // command complete so its diagnostic/resource exit class is preserved.
    if (error?.code === "EPIPE") return;

    outputStreamFailed = true;
    process.exitCode = CLI_EXIT_CODES.internal;
    if (name === "stdout" && process.stderr.writable) {
      process.stderr.write("forge: output stream failure\n");
    }
  });
}

const exitCode = await runCli(process.argv.slice(2));
process.exitCode = outputStreamFailed ? CLI_EXIT_CODES.internal : exitCode;
