import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findDifferentialMismatches } from "../tests/differential-harness.js";
import { runSource } from "../src/compiler/index.js";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const mutations = [
  {
    name: "less-than-or-equal loses its equality boundary",
    file: "vm.js",
    find: "LTE: left <= right,",
    replacement: "LTE: left < right,",
    expectedCases: ["less-than-or-equal includes the equality boundary"],
  },
  {
    name: "modulo-by-zero guard is disabled",
    file: "vm.js",
    find: `if (right === 0) {
          throw runtimeError("Modulo by zero", "VM_MODULO_ZERO");
        }`,
    replacement: `if (false && right === 0) {
          throw runtimeError("Modulo by zero", "VM_MODULO_ZERO");
        }`,
    expectedCases: ["modulo by zero has error parity"],
  },
  {
    name: "function calls resolve through the caller environment",
    file: "vm.js",
    find: "currentScope = binding.environment;",
    replacement: "currentScope = callStack.at(-1).callerScope;",
    expectedCases: ["lexical lookup ignores a caller-local shadow"],
  },
  {
    name: "logical AND branches on truth instead of falsity",
    file: "codegen.js",
    find: `generateExpression(node.left);
          emit("JUMP_IF_ZERO", falseLabel);
          generateExpression(node.right);`,
    replacement: `generateExpression(node.left);
          emit("JUMP_IF_NONZERO", falseLabel);
          generateExpression(node.right);`,
    expectedCases: ["short-circuiting skips the right-hand side"],
  },
];

let failed = false;
const baselineMismatches = findDifferentialMismatches((source) =>
  runSource(source),
);
if (baselineMismatches.length > 0) {
  console.error(
    `✕ pristine compiler has ${baselineMismatches.length} differential mismatch(es)`,
  );
  for (const mismatch of baselineMismatches.slice(0, 5)) {
    console.error(`  ${mismatch.name}: ${mismatch.detail}`);
  }
  failed = true;
} else {
  console.log("✓ pristine compiler: zero differential mismatches");
}

const temporaryRoot = await mkdtemp(
  join(tmpdir(), "forge-mutation-sensitivity-"),
);

try {
  await writeFile(
    join(temporaryRoot, "package.json"),
    `${JSON.stringify({ type: "module" }, null, 2)}\n`,
  );

  for (const [index, mutation] of mutations.entries()) {
    const mutantRoot = join(temporaryRoot, `mutant-${index}`);
    const mutantCompiler = join(mutantRoot, "compiler");
    await cp(join(repositoryRoot, "src", "compiler"), mutantCompiler, {
      recursive: true,
    });

    const mutationPath = join(mutantCompiler, mutation.file);
    const pristine = await readFile(mutationPath, "utf8");
    const occurrences = pristine.split(mutation.find).length - 1;
    if (occurrences !== 1) {
      console.error(
        `✕ ${mutation.name}: expected one mutation target, found ${occurrences}`,
      );
      failed = true;
      continue;
    }
    await writeFile(
      mutationPath,
      pristine.replace(mutation.find, mutation.replacement),
    );

    const mutant = await import(
      `${pathToFileURL(join(mutantCompiler, "index.js")).href}?mutation=${index}`
    );
    const mismatches = findDifferentialMismatches((source) =>
      mutant.runSource(source),
    );
    const mismatchNames = new Set(mismatches.map((mismatch) => mismatch.name));
    const missingExpectedCases = mutation.expectedCases.filter(
      (name) => !mismatchNames.has(name),
    );
    if (mismatches.length === 0 || missingExpectedCases.length > 0) {
      console.error(`✕ ${mutation.name}: differential gate stayed green`);
      if (missingExpectedCases.length > 0) {
        console.error(
          `  expected killer(s) missing: ${missingExpectedCases.join(", ")}`,
        );
      }
      failed = true;
      continue;
    }

    console.log(
      `✓ ${mutation.name}: caught by ${mismatches.length} differential case(s)`,
    );
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(
    `Mutation sensitivity proven: all ${mutations.length} injected compiler defects were detected.`,
  );
}
