#!/usr/bin/env node

import { runCli } from "../src/cli/main.js";

for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error) => {
    if (error?.code === "EPIPE") process.exit(0);
    throw error;
  });
}

const exitCode = await runCli(process.argv.slice(2));
process.exitCode = exitCode;
