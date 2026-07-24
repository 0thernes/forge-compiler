/* global console, process */
// Gate-sensitivity proof: deliberately injects bugs into a COPY of the v14
// stack VM and asserts the differential gate (VM vs reference interpreter)
// catches every one. A differential gate that cannot go red is decoration,
// not CI.
//
// Method: each mutation is a targeted string replacement applied to a copy
// of src/compiler/vm.js written to src/compiler/.mutation-vm.tmp.js (so its
// relative imports resolve). The replacement is VERIFIED to have applied —
// a missing pattern means the VM source drifted and the mutation must be
// updated, which fails the run loudly. The mutant is dynamically imported
// and driven through the pristine frontend (lexer → parser → analyzer →
// codegen → linker); the reference interpreter is the unmutated oracle.
//
// Exit 0 only when EVERY mutation produces at least one divergence.
//
//   node tools/mutation-test.mjs

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const compilerDirectory = join(repoRoot, "src", "compiler");
const vmPath = join(compilerDirectory, "vm.js");
const mutantPath = join(compilerDirectory, ".mutation-vm.tmp.js");

const frontend = await import(
  pathToFileURL(join(compilerDirectory, "index.js")).href
);
const { interpretSource } = await import(
  pathToFileURL(join(compilerDirectory, "interpreter.js")).href
);
const { SELF_TEST_CASES } = await import(
  pathToFileURL(join(compilerDirectory, "selfTestCases.js")).href
);

const pristine = readFileSync(vmPath, "utf8");

// The three v13 bug classes (comparison off-by-one, deleted error/zero
// check, scope-resolution corruption) plus a v14-specific fourth: corrupting
// the lexical environment captured by BIND_FUNCTION — the flagship v14
// closure semantics the gate must guard.
const MUTATIONS = [
  {
    name: "LTE off-by-one (a <= b → a < b)",
    find: "LTE: left <= right,",
    replace: "LTE: left < right,",
  },
  {
    name: "MOD zero-check removed",
    find: [
      "        if (right === 0) {",
      '          throw runtimeError("Modulo by zero", "VM_MODULO_ZERO");',
      "        }",
      "",
    ].join("\n"),
    replace: "",
  },
  {
    name: "scope entry disabled (ENTER_SCOPE nop)",
    find: [
      '      case "ENTER_SCOPE":',
      "        currentScope = createScope(currentScope);",
    ].join("\n"),
    replace: '      case "ENTER_SCOPE":',
  },
  {
    name: "lexical capture corrupted (BIND_FUNCTION captures root scope)",
    find: "          environment: currentScope,",
    replace: "          environment: rootScope,",
  },
];

// Differential corpus for the sensitivity proof: every repository self-test
// case plus sentinels aimed squarely at the mutated code paths (inclusive
// comparisons, modulo-by-zero, block scoping, lexical capture).
const SENTINEL_CASES = [
  {
    name: "comparison boundary table",
    source: `print(1 <= 1, " ", 2 <= 1, " ", 1 < 1, " ", 1 >= 1, " ", 0 >= 1);`,
  },
  {
    name: "loop to inclusive bound",
    source: `let i = 0; let total = 0; while (i <= 5) { total += i; i += 1; } print(total, " ", i);`,
  },
  {
    name: "modulo by zero is a named error",
    source: `print(5 % 0);`,
    throws: "Modulo by zero",
  },
  {
    name: "modulo of negative numbers",
    source: `print(-7 % 3, " ", 7 % -3);`,
  },
  {
    name: "block scoping with shadowing",
    source: `let x = 1; if (true) { let x = 99; x += 1; print(x); } print(x);`,
  },
  {
    name: "loop body scope is fresh per iteration",
    source: `let i = 0; while (i < 3) { let tmp = i * 10; print(tmp); i += 1; }`,
  },
  {
    name: "lexical capture of the declaring scope",
    source: `fn outer() { let x = 1; fn add() { x += 1; return x; } add(); return add(); } print(outer());`,
  },
  {
    name: "nested sibling functions mutually recurse",
    source: `fn outer(n) { fn even(x) { if (x == 0) { return true; } return odd(x - 1); } fn odd(x) { if (x == 0) { return false; } return even(x - 1); } return even(n); } print(outer(10), " ", outer(9));`,
  },
];

const CORPUS = [
  ...SENTINEL_CASES,
  ...SELF_TEST_CASES.map((testCase) => ({
    name: testCase.name,
    source: testCase.source,
    throws: testCase.errorIncludes,
  })),
];

function runMutantVm(mutantModule, source) {
  const limits = {};
  const tokens = frontend.lex(source, limits);
  const ast = frontend.parse(tokens, limits);
  frontend.analyze(ast);
  const assembly = frontend.codegen(ast, limits);
  const code = frontend.link(assembly);
  return mutantModule.executeLinked(code, limits);
}

// Mirrors the differential suite's parity contract: a case diverges when the
// engines disagree on clean-vs-throw, on the pinned error substring, on
// status, or on any output line.
function diverges(mutantModule, testCase) {
  let vmResult = null;
  let vmError = null;
  let refResult = null;
  let refError = null;
  try {
    vmResult = runMutantVm(mutantModule, testCase.source);
  } catch (error) {
    vmError = error;
  }
  try {
    refResult = interpretSource(testCase.source);
  } catch (error) {
    refError = error;
  }

  if (testCase.throws) {
    if (!vmError || !refError) return true;
    return !(
      vmError.message.includes(testCase.throws) &&
      refError.message.includes(testCase.throws)
    );
  }
  if (vmError || refError) return true;
  if (vmResult.status !== refResult.status) return true;
  if (vmResult.output.length !== refResult.output.length) return true;
  return vmResult.output.some(
    (line, index) => line !== refResult.output[index],
  );
}

let allSensitive = true;

try {
  for (const [index, mutation] of MUTATIONS.entries()) {
    if (!pristine.includes(mutation.find)) {
      console.log(
        `FAIL mutation "${mutation.name}": pattern not found — vm.js drifted, update the mutation`,
      );
      allSensitive = false;
      continue;
    }
    const mutated = pristine.replace(mutation.find, mutation.replace);
    if (mutated === pristine) {
      console.log(
        `FAIL mutation "${mutation.name}": replacement was a no-op — update the mutation`,
      );
      allSensitive = false;
      continue;
    }

    writeFileSync(mutantPath, mutated);
    // Cache-bust so each mutation gets a fresh module instance.
    const mutantModule = await import(
      `${pathToFileURL(mutantPath).href}?mutation=${index}`
    );

    let divergences = 0;
    const divergingCases = [];
    for (const testCase of CORPUS) {
      if (diverges(mutantModule, testCase)) {
        divergences += 1;
        if (divergingCases.length < 3) divergingCases.push(testCase.name);
      }
    }

    const caught = divergences > 0;
    console.log(
      caught
        ? `PASS mutation "${mutation.name}" CAUGHT — ${divergences}/${CORPUS.length} corpus programs diverged` +
            ` (e.g. ${divergingCases.join("; ")})`
        : `FAIL mutation "${mutation.name}" NOT CAUGHT — the gate is blind to this bug class`,
    );
    if (!caught) allSensitive = false;
  }
} finally {
  rmSync(mutantPath, { force: true });
}

console.log(
  allSensitive
    ? "\nGATE SENSITIVITY: PROVEN — every injected bug produced differential divergence"
    : "\nGATE SENSITIVITY: FAILED — the gate has blind spots",
);
process.exit(allSensitive ? 0 : 1);
