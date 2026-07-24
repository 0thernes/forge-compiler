import { link } from "./linker.js";
import { typeName, formatForPrint } from "./format.js";

// ── STACK VM ──
export const TRACE_LIMIT = 500;
// [FIX v13 #6] 10k → 1M step budget. Calibration: one source-level loop
// iteration ≈ 15 VM steps, so 1M steps ≈ 65k iterations — real workloads.
// Deterministic (unlike wall-clock limits), ~0.8µs/step measured. Trace stays
// capped at 500 and output at 5000 lines so the UI never chokes.
export const MAX_STEPS = 1000000;
export const OUTPUT_LIMIT = 5000;

export function execute(asm, maxSteps = MAX_STEPS) {
  const code = link(asm);

  const stack = [], callStack = [], scopeStack = [{ vars: {} }], output = [];
  let pc = 0, steps = 0, printLine = "", lastArgc = 0, outputTruncated = false;
  const trace = []; let traceOverflow = false;

  const currentScope = () => scopeStack[scopeStack.length - 1];
  const resolveVar = (name) => { for (let i = scopeStack.length - 1; i >= 0; i--) { if (name in scopeStack[i].vars) return scopeStack[i]; } return null; };
  const safePop = (ctx) => { if (stack.length === 0) throw new Error(`Stack underflow during ${ctx} at PC ${pc}`); return stack.pop(); };
  const requireNum = (v, op) => { if (typeof v !== 'number') throw new Error(`Type error: '${op}' requires number, got ${typeName(v)}`); };
  const requireNums = (a, b, op) => { if (typeof a !== 'number' || typeof b !== 'number') throw new Error(`Type error: '${op}' requires numbers, got ${typeName(a)} and ${typeName(b)}`); };
  // [FIX v13 #3] Strict integer indices — 0.9 is not a valid index anywhere.
  const requireInt = (v, ctx) => {
    if (typeof v !== 'number') throw new Error(`Type error: ${ctx} must be a number, got ${typeName(v)}`);
    if (!Number.isInteger(v)) throw new Error(`Type error: ${ctx} must be an integer, got ${v}`);
  };

  while (pc < code.length && steps < maxSteps) {
    const inst = code[pc];
    const doTrace = trace.length < TRACE_LIMIT;
    const snap = doTrace ? { pc, op: inst.op, arg: inst.arg, stackBefore: [...stack] } : null;
    if (!doTrace && !traceOverflow) traceOverflow = true;
    steps++;

    switch (inst.op) {
      case "PUSH": stack.push(inst.arg); pc++; break;
      case "PUSH_STR": stack.push(inst.arg); pc++; break;
      case "POP": safePop("POP"); pc++; break;
      case "STORE_LOCAL": currentScope().vars[inst.arg] = safePop("STORE_LOCAL"); pc++; break;
      case "DECL_STORE": {
        const val = safePop("DECL_STORE");
        const scope = currentScope();
        if (inst.arg in scope.vars) throw new Error(`Variable '${inst.arg}' already declared in this scope`);
        scope.vars[inst.arg] = val; pc++; break;
      }
      case "STORE": {
        const val = safePop("STORE"), scope = resolveVar(inst.arg);
        if (!scope) throw new Error(`Assignment to undeclared variable: ${inst.arg}. Use 'let ${inst.arg} = ...' first`);
        scope.vars[inst.arg] = val; pc++; break;
      }
      case "LOAD": { const scope = resolveVar(inst.arg); if (!scope) throw new Error(`Undefined variable: ${inst.arg}`); stack.push(scope.vars[inst.arg]); pc++; break; }
      case "ENTER_SCOPE": scopeStack.push({ vars: {} }); pc++; break;
      case "EXIT_SCOPE": { if (scopeStack.length > 1) scopeStack.pop(); pc++; break; }
      case "ARGC": lastArgc = inst.arg; pc++; break;
      case "CHECK_ARGC": { if (lastArgc !== inst.arg) throw new Error(`Expected ${inst.arg} argument(s) but got ${lastArgc}`); pc++; break; }

      // ── Arrays ──
      // [F1 v13] MAKE_ARRAY n: splice preserves push order — [1,2,3] means [1,2,3]
      case "MAKE_ARRAY": {
        const n = inst.arg;
        if (stack.length < n) throw new Error(`Stack underflow during MAKE_ARRAY at PC ${pc}`);
        stack.push(stack.splice(stack.length - n, n));
        pc++; break;
      }
      // [F1 v13] Indexing reads arrays AND strings (s[i] like every peer language)
      case "INDEX_GET": {
        const idx = safePop("INDEX_GET"), target = safePop("INDEX_GET");
        requireInt(idx, "index");
        if (Array.isArray(target)) {
          if (idx < 0 || idx >= target.length) throw new Error(`Index out of bounds: index ${idx}, array length ${target.length}`);
          stack.push(target[idx]);
        } else if (typeof target === 'string') {
          if (idx < 0 || idx >= target.length) throw new Error(`Index out of bounds: index ${idx}, string length ${target.length}`);
          stack.push(target[idx]);
        } else {
          throw new Error(`Type error: cannot index ${typeName(target)}`);
        }
        pc++; break;
      }
      // [F1 v13] Writes are array-only — FORGE strings are immutable
      case "INDEX_SET": {
        const val = safePop("INDEX_SET"), idx = safePop("INDEX_SET"), target = safePop("INDEX_SET");
        if (typeof target === 'string') throw new Error(`Type error: strings are immutable — build a new string instead`);
        if (!Array.isArray(target)) throw new Error(`Type error: cannot index-assign ${typeName(target)}`);
        requireInt(idx, "index");
        if (idx < 0 || idx >= target.length) throw new Error(`Index out of bounds: index ${idx}, array length ${target.length} (use push to append)`);
        target[idx] = val;
        pc++; break;
      }
      // [F1 v13] DUP2 duplicates top two stack refs — enables single-eval compound index assignment
      case "DUP2": {
        if (stack.length < 2) throw new Error(`Stack underflow during DUP2 at PC ${pc}`);
        stack.push(stack[stack.length - 2], stack[stack.length - 1]);
        pc++; break;
      }

      // Arithmetic with type safety
      case "ADD": {
        const b = safePop("ADD"), a = safePop("ADD");
        if (typeof a === 'number' && typeof b === 'number') stack.push(a + b);
        else if (typeof a === 'string' || typeof b === 'string') stack.push(formatForPrint(a) + formatForPrint(b));
        else throw new Error(`Type error: '+' requires numbers or strings, got ${typeName(a)} and ${typeName(b)}`);
        pc++; break;
      }
      case "SUB": { const b = safePop("SUB"), a = safePop("SUB"); requireNums(a, b, "-"); stack.push(a - b); pc++; break; }
      case "MUL": { const b = safePop("MUL"), a = safePop("MUL"); requireNums(a, b, "*"); stack.push(a * b); pc++; break; }
      case "DIV": { const b = safePop("DIV"), a = safePop("DIV"); requireNums(a, b, "/"); if (b === 0) throw new Error("Division by zero"); stack.push(a / b); pc++; break; }
      case "MOD": { const b = safePop("MOD"), a = safePop("MOD"); requireNums(a, b, "%"); if (b === 0) throw new Error("Modulo by zero"); stack.push(a % b); pc++; break; }
      case "NEG": { const v = safePop("NEG"); requireNum(v, "-"); stack.push(-v); pc++; break; }
      case "NOT": stack.push(safePop("NOT") ? 0 : 1); pc++; break;
      // EQ/NEQ: strict equality; arrays compare by reference (peer-standard)
      case "EQ": { const b = safePop("EQ"), a = safePop("EQ"); stack.push(a === b ? 1 : 0); pc++; break; }
      case "NEQ": { const b = safePop("NEQ"), a = safePop("NEQ"); stack.push(a !== b ? 1 : 0); pc++; break; }
      case "LT": { const b = safePop("LT"), a = safePop("LT"); requireNums(a, b, "<"); stack.push(a < b ? 1 : 0); pc++; break; }
      case "GT": { const b = safePop("GT"), a = safePop("GT"); requireNums(a, b, ">"); stack.push(a > b ? 1 : 0); pc++; break; }
      case "LTE": { const b = safePop("LTE"), a = safePop("LTE"); requireNums(a, b, "<="); stack.push(a <= b ? 1 : 0); pc++; break; }
      case "GTE": { const b = safePop("GTE"), a = safePop("GTE"); requireNums(a, b, ">="); stack.push(a >= b ? 1 : 0); pc++; break; }

      // Control flow — [FIX v13 #2] pre-linked numeric targets, zero hash lookups
      case "JMP": pc = inst.target; break;
      case "JZ": pc = safePop("JZ") ? pc + 1 : inst.target; break;
      case "JNZ": pc = safePop("JNZ") ? inst.target : pc + 1; break;
      case "CALL": { callStack.push(pc + 1); pc = inst.target; break; }
      case "RET": { if (callStack.length === 0) throw new Error(`Return with empty call stack at PC ${pc}`); pc = callStack.pop(); break; }
      // [FIX v13 #4] PRINT formats arrays properly: [1, 2, "x"] — cycle-safe
      case "PRINT": printLine += formatForPrint(safePop("PRINT")); pc++; break;
      case "PRINTLN": {
        if (output.length < OUTPUT_LIMIT) output.push(printLine);
        else if (!outputTruncated) { output.push(`[OUTPUT TRUNCATED AT ${OUTPUT_LIMIT} LINES]`); outputTruncated = true; }
        printLine = ""; pc++; break;
      }
      case "HALT": pc = code.length; break;

      // ── Built-ins ──
      // [F1 v13] len works on strings AND arrays
      case "BUILTIN_LEN": {
        const v = safePop("len");
        if (typeof v === 'string' || Array.isArray(v)) stack.push(v.length);
        else throw new Error(`Type error: len() requires string or array, got ${typeName(v)}`);
        pc++; break;
      }
      // [FIX v13 #3] char_at demands an integer index — no silent flooring
      case "BUILTIN_CHAR_AT": {
        const idx = safePop("char_at"), s = safePop("char_at");
        if (typeof s !== 'string') throw new Error(`Type error: char_at() requires string as first argument, got ${typeName(s)}`);
        requireInt(idx, "char_at index");
        if (idx < 0 || idx >= s.length) throw new Error(`Index out of bounds: char_at(${s.length} chars, ${idx})`);
        stack.push(s[idx]); pc++; break;
      }
      // [FIX v13 #1] substr: strict bounds. Negative start no longer silently reads
      // from the end (JS substr leak). start ∈ [0, len], count ≥ 0, end clamped.
      case "BUILTIN_SUBSTR": {
        const count = safePop("substr"), start = safePop("substr"), s = safePop("substr");
        if (typeof s !== 'string') throw new Error(`Type error: substr() requires string as first argument, got ${typeName(s)}`);
        requireInt(start, "substr start"); requireInt(count, "substr count");
        if (start < 0 || start > s.length) throw new Error(`substr start out of range: start ${start}, string length ${s.length}`);
        if (count < 0) throw new Error(`substr count must be non-negative, got ${count}`);
        stack.push(s.slice(start, start + count)); pc++; break;
      }
      case "BUILTIN_FLOOR": {
        const v = safePop("floor"); requireNum(v, "floor");
        stack.push(Math.floor(v)); pc++; break;
      }
      case "BUILTIN_TYPE_OF": {
        const v = safePop("type_of");
        stack.push(typeName(v)); pc++; break;
      }
      // [F1 v13] push(arr, v) appends, returns new length. pop(arr) removes+returns last.
      case "BUILTIN_PUSH": {
        const v = safePop("push"), arr = safePop("push");
        if (!Array.isArray(arr)) throw new Error(`Type error: push() requires array as first argument, got ${typeName(arr)}`);
        arr.push(v);
        stack.push(arr.length); pc++; break;
      }
      case "BUILTIN_POP": {
        const arr = safePop("pop");
        if (!Array.isArray(arr)) throw new Error(`Type error: pop() requires array, got ${typeName(arr)}`);
        if (arr.length === 0) throw new Error(`pop from empty array`);
        stack.push(arr.pop()); pc++; break;
      }

      default: throw new Error(`Unknown opcode: ${inst.op}`);
    }
    if (snap) { snap.stackAfter = [...stack]; trace.push(snap); }
  }
  if (steps >= maxSteps) output.push("[EXECUTION LIMIT REACHED]");

  const allVars = {};
  for (const frame of scopeStack) for (const [k, v] of Object.entries(frame.vars)) allVars[k] = v;
  return { output, trace, globals: allVars, steps, traceOverflow };
}
