import { DEFAULT_LIMITS, mergeLimits } from "./constants.js";
import { link } from "./codegen.js";
import { ForgeError } from "./errors.js";
import { formatForPrint, renderValue, typeName } from "./format.js";

const EXECUTABLE_OPCODES = new Set([
  "ADD",
  "ARGUMENT_COUNT",
  "BIND_FUNCTION",
  "BUILTIN_CHAR_AT",
  "BUILTIN_FLOOR",
  "BUILTIN_LEN",
  "BUILTIN_POP",
  "BUILTIN_PUSH",
  "BUILTIN_SUBSTR",
  "BUILTIN_TYPE_OF",
  "CALL",
  "CHECK_ARGUMENT_COUNT",
  "DECLARE",
  "DIV",
  "DIVIDE",
  "DUPLICATE_PAIR",
  "ENTER_SCOPE",
  "EQ",
  "EXIT_SCOPE",
  "GT",
  "GTE",
  "HALT",
  "INDEX_GET",
  "INDEX_SET",
  "JUMP",
  "JUMP_IF_NONZERO",
  "JUMP_IF_ZERO",
  "LOAD",
  "LT",
  "LTE",
  "MAKE_ARRAY",
  "MOD",
  "MUL",
  "MULTIPLY",
  "NEGATE",
  "NEQ",
  "NOT",
  "POP",
  "PRINT",
  "PRINT_LINE",
  "PUSH",
  "PUSH_STRING",
  "RETURN",
  "STORE",
  "STORE_LOCAL",
  "SUB",
  "SUBTRACT",
]);

const NAMED_OPERAND_OPCODES = new Set([
  "BIND_FUNCTION",
  "CALL",
  "DECLARE",
  "JUMP",
  "JUMP_IF_NONZERO",
  "JUMP_IF_ZERO",
  "LABEL",
  "LOAD",
  "STORE",
  "STORE_LOCAL",
]);

const COUNT_OPERAND_OPCODES = new Set([
  "ARGUMENT_COUNT",
  "CHECK_ARGUMENT_COUNT",
  "MAKE_ARRAY",
]);

function assemblyError(message, code = "VM_ASSEMBLY") {
  return new ForgeError(message, {
    phase: "execute",
    code,
  });
}

function executionLimits(options) {
  const normalized =
    typeof options === "number" ? { maxSteps: options } : options;
  const overrides =
    normalized !== null &&
    typeof normalized === "object" &&
    !Array.isArray(normalized) &&
    Object.hasOwn(normalized, "limits")
      ? normalized.limits
      : normalized;
  return mergeLimits(overrides);
}

function validateAssembly(assembly, limits, linked = false) {
  if (!Array.isArray(assembly)) {
    throw assemblyError(
      "VM assembly must be an instruction array",
      "VM_ASSEMBLY_INPUT",
    );
  }
  if (assembly.length > limits.maxInstructions) {
    throw assemblyError(
      `Instruction count exceeds the ${limits.maxInstructions} instruction limit`,
      "VM_INSTRUCTION_LIMIT",
    );
  }

  for (let index = 0; index < assembly.length; index += 1) {
    const instruction = assembly[index];
    if (
      instruction === null ||
      typeof instruction !== "object" ||
      Array.isArray(instruction)
    ) {
      throw assemblyError(
        `Invalid instruction at assembly index ${index}`,
        "VM_ASSEMBLY_INSTRUCTION",
      );
    }

    // Linked code is an internal, canonical representation. Unlinked assembly
    // keeps accepting the v13 `op`/`arg` aliases and is normalized by link().
    const opcode = linked
      ? instruction.opcode
      : (instruction.opcode ?? instruction.op);
    const argument = linked
      ? instruction.argument
      : (instruction.argument ?? instruction.arg);
    if (
      typeof opcode !== "string" ||
      (!EXECUTABLE_OPCODES.has(opcode) && !(!linked && opcode === "LABEL"))
    ) {
      throw assemblyError(
        `Unknown opcode at assembly index ${index}: ${String(opcode)}`,
        "VM_OPCODE_UNKNOWN",
      );
    }
    if (NAMED_OPERAND_OPCODES.has(opcode)) {
      if (typeof argument !== "string" || argument.length === 0) {
        throw assemblyError(
          `${opcode} at assembly index ${index} requires a name`,
          "VM_ASSEMBLY_OPERAND",
        );
      }
    } else if (COUNT_OPERAND_OPCODES.has(opcode)) {
      if (!Number.isSafeInteger(argument) || argument < 0) {
        throw assemblyError(
          `${opcode} at assembly index ${index} requires a non-negative safe integer`,
          "VM_ASSEMBLY_OPERAND",
        );
      }
      if (opcode === "MAKE_ARRAY" && argument > limits.maxArrayLength) {
        throw assemblyError(
          `Array length exceeds the ${limits.maxArrayLength} element limit`,
          "VM_ARRAY_LIMIT",
        );
      }
    } else if (opcode === "PUSH") {
      if (typeof argument !== "number" || !Number.isFinite(argument)) {
        throw assemblyError(
          `PUSH at assembly index ${index} requires a finite number`,
          "VM_ASSEMBLY_OPERAND",
        );
      }
    } else if (opcode === "PUSH_STRING") {
      if (typeof argument !== "string") {
        throw assemblyError(
          `PUSH_STRING at assembly index ${index} requires a string`,
          "VM_ASSEMBLY_OPERAND",
        );
      }
      if (argument.length > limits.maxStringLength) {
        throw assemblyError(
          `String length exceeds the ${limits.maxStringLength} character limit`,
          "VM_STRING_LIMIT",
        );
      }
    }

    if (linked) {
      const isJump =
        opcode === "JUMP" ||
        opcode === "JUMP_IF_ZERO" ||
        opcode === "JUMP_IF_NONZERO";
      if (isJump || opcode === "CALL") {
        const target = instruction.target;
        const targetIsPastBoundary =
          opcode === "CALL"
            ? target >= assembly.length
            : target > assembly.length;
        if (
          !Number.isSafeInteger(target) ||
          target < 0 ||
          targetIsPastBoundary
        ) {
          throw assemblyError(
            `${opcode} at instruction ${index} has an invalid target`,
            "VM_ASSEMBLY_TARGET",
          );
        }
      }
    }
  }
}

function createScope(parent = null) {
  return {
    parent,
    variables: new Map(),
    functions: new Map(),
  };
}

function countNewlines(value) {
  let count = 0;
  for (const character of value) {
    if (character === "\n") count += 1;
  }
  return count;
}

export function execute(assembly, options = {}) {
  const limits = executionLimits(options);
  validateAssembly(assembly, limits);
  const code = link(assembly);
  validateAssembly(code, limits, true);
  return runLinkedCode(code, limits);
}

export function executeLinked(code, options = {}) {
  const limits = executionLimits(options);
  validateAssembly(code, limits, true);
  return runLinkedCode(code, limits);
}

function runLinkedCode(code, limits) {
  const stack = [];
  const callStack = [];
  const rootScope = createScope();
  let currentScope = rootScope;
  const output = [];
  const trace = [];
  let programCounter = 0;
  let steps = 0;
  let pendingArgumentCount = 0;
  let printLine = "";
  let outputCharacters = 0;
  let outputLines = 0;
  let outputTruncated = false;
  let outputTruncationReason = null;
  let pendingOutputTruncation = null;
  let traceOverflow = false;
  let traceCharacters = 0;
  let status = "running";

  function runtimeError(message, codeName = "VM_RUNTIME") {
    return new ForgeError(`${message} at PC ${programCounter}`, {
      phase: "execute",
      code: codeName,
    });
  }

  function resolveVariable(name) {
    for (let scope = currentScope; scope; scope = scope.parent) {
      if (scope.variables.has(name)) return scope;
    }
    return null;
  }

  function resolveFunction(label) {
    for (let scope = currentScope; scope; scope = scope.parent) {
      const binding = scope.functions.get(label);
      if (binding) return binding;
    }
    return null;
  }

  function push(value, context = "PUSH") {
    if (stack.length >= limits.maxStackDepth) {
      throw runtimeError(
        `Operand stack exceeds the ${limits.maxStackDepth} value limit during ${context}`,
        "VM_STACK_LIMIT",
      );
    }
    stack.push(value);
  }

  function pop(context) {
    if (stack.length === 0) {
      throw runtimeError(
        `Stack underflow during ${context}`,
        "VM_STACK_UNDERFLOW",
      );
    }
    return stack.pop();
  }

  function requireNumber(value, operation) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw runtimeError(
        `Type error: '${operation}' requires number, got ${typeName(value)}`,
        "VM_TYPE_NUMBER",
      );
    }
  }

  function requireNumbers(left, right, operation) {
    if (
      typeof left !== "number" ||
      !Number.isFinite(left) ||
      typeof right !== "number" ||
      !Number.isFinite(right)
    ) {
      throw runtimeError(
        `Type error: '${operation}' requires numbers, got ${typeName(left)} and ${typeName(right)}`,
        "VM_TYPE_NUMBER",
      );
    }
  }

  function pushNumberResult(value, operation) {
    if (!Number.isFinite(value)) {
      throw runtimeError(
        `Numeric overflow during '${operation}'`,
        "VM_NUMBER_RANGE",
      );
    }
    push(value, operation);
  }

  function requireInteger(value, context) {
    requireNumber(value, context);
    if (!Number.isInteger(value)) {
      throw runtimeError(
        `Type error: ${context} must be an integer, got ${value}`,
        "VM_TYPE_INTEGER",
      );
    }
  }

  // In-program string coercion must be lossless: unlike the bounded display
  // formatter, a truncated rendering here would silently corrupt
  // program-visible values, so an unrepresentable operand throws instead.
  function coerceForConcatenation(value) {
    if (typeof value === "string") return value;
    const rendered = renderValue(value, {
      maxCharacters: limits.maxStringLength + 1,
      maxItems: Number.MAX_SAFE_INTEGER,
      maxDepth: limits.maxFormatDepth,
    });
    if (!rendered.complete) {
      if (rendered.text.length > limits.maxStringLength) {
        throw runtimeError(
          `String length exceeds the ${limits.maxStringLength} character limit`,
          "VM_STRING_LIMIT",
        );
      }
      throw runtimeError(
        `'+' cannot convert an array nested deeper than ${limits.maxFormatDepth} levels or an array that contains itself`,
        "VM_FORMAT_DEPTH",
      );
    }
    return rendered.text;
  }

  function captureTraceString(value, copies = 1) {
    const remainingTotal = Math.max(
      0,
      limits.maxTraceCharacters - traceCharacters,
    );
    const allowed = Math.min(
      limits.maxTraceValueCharacters,
      Math.floor(remainingTotal / copies),
    );
    if (value.length <= allowed) {
      traceCharacters += value.length * copies;
      return value;
    }

    traceOverflow = true;
    if (allowed === 0) return "";
    if (allowed === 1) {
      traceCharacters += copies;
      return "…";
    }
    const captured = `${value.slice(0, allowed - 1)}…`;
    traceCharacters += captured.length * copies;
    return captured;
  }

  function captureStack() {
    const omitted = Math.max(0, stack.length - limits.maxTraceStackItems);
    const seen = new WeakMap();
    let remainingItems = limits.maxFormatItems;

    function snapshot(value, depth = 0) {
      if (typeof value === "string") return captureTraceString(value);
      if (!Array.isArray(value)) return value;
      if (seen.has(value)) return seen.get(value);
      if (depth >= limits.maxFormatDepth || remainingItems <= 0) {
        return [captureTraceString("…")];
      }
      const clone = [];
      seen.set(value, clone);
      for (const item of value) {
        if (remainingItems <= 0) {
          clone.push(captureTraceString("…"));
          break;
        }
        remainingItems -= 1;
        clone.push(snapshot(item, depth + 1));
      }
      return clone;
    }

    const captured = stack.slice(omitted).map((value) => snapshot(value));
    if (omitted > 0) {
      captured.unshift(captureTraceString(`… ${omitted} earlier value(s)`));
    }
    return captured;
  }

  function addTruncationMarker(reason) {
    if (!outputTruncated) {
      let marker;
      if (reason === "characters") {
        marker = `[OUTPUT TRUNCATED AT ${limits.maxOutputCharacters} CHARACTERS]`;
      } else if (reason === "lines_and_characters") {
        marker = `[OUTPUT TRUNCATED AT ${limits.maxOutputLines} LINES / ${limits.maxOutputCharacters} CHARACTERS]`;
      } else {
        marker = `[OUTPUT TRUNCATED AT ${limits.maxOutputLines} LINES]`;
      }
      output.push(marker);
      outputTruncated = true;
      outputTruncationReason = reason;
    }
  }

  function finishPrintLine() {
    if (outputTruncated) {
      printLine = "";
      return;
    }

    const lineCount = countNewlines(printLine) + 1;
    const separatorCharacters = output.length > 0 ? 1 : 0;
    const nextCharacterCount =
      outputCharacters + printLine.length + separatorCharacters;
    const exceedsLines = outputLines + lineCount > limits.maxOutputLines;
    const exceedsCharacters =
      pendingOutputTruncation === "characters" ||
      nextCharacterCount > limits.maxOutputCharacters;
    if (exceedsLines || exceedsCharacters) {
      const remainingLines = Math.max(0, limits.maxOutputLines - outputLines);
      const remainingCharacters = Math.max(
        0,
        limits.maxOutputCharacters - outputCharacters - separatorCharacters,
      );
      if (remainingLines > 0 && remainingCharacters > 0) {
        const pieces = printLine.split("\n").slice(0, remainingLines);
        const partial = pieces.join("\n").slice(0, remainingCharacters);
        if (partial.length > 0) output.push(partial);
      }
      addTruncationMarker(
        exceedsLines && exceedsCharacters
          ? "lines_and_characters"
          : exceedsCharacters
            ? "characters"
            : "lines",
      );
      pendingOutputTruncation = null;
      printLine = "";
      return;
    }

    output.push(printLine);
    outputLines += lineCount;
    outputCharacters = nextCharacterCount;
    pendingOutputTruncation = null;
    printLine = "";
  }

  function appendPrintText(value) {
    if (!outputTruncated && pendingOutputTruncation === null) {
      const separatorCharacters = output.length > 0 ? 1 : 0;
      const remainingCharacters = Math.max(
        0,
        limits.maxOutputCharacters -
          outputCharacters -
          separatorCharacters -
          printLine.length,
      );
      if (value.length > remainingCharacters) {
        printLine += value.slice(0, remainingCharacters);
        pendingOutputTruncation = "characters";
      } else {
        printLine += value;
      }
    } else if (!outputTruncated) {
      // A previous value already filled the current output budget.
      pendingOutputTruncation = "characters";
    }
  }

  function appendPrintValue(value) {
    appendPrintText(
      formatForPrint(value, {
        maxDepth: limits.maxFormatDepth,
        maxItems: limits.maxFormatItems,
        maxCharacters: limits.maxFormatCharacters,
      }),
    );
  }

  while (programCounter < code.length && status === "running") {
    if (steps >= limits.maxSteps) {
      status = "step_limit";
      break;
    }

    const instruction = code[programCounter];
    const shouldCaptureTrace = trace.length < limits.maxTraceEntries;
    const capturedOpcode = shouldCaptureTrace
      ? captureTraceString(instruction.opcode, 2)
      : null;
    const capturedArgument =
      shouldCaptureTrace && typeof instruction.argument === "string"
        ? captureTraceString(instruction.argument, 2)
        : instruction.argument;
    const traceEntry = shouldCaptureTrace
      ? {
          programCounter,
          pc: programCounter,
          opcode: capturedOpcode,
          op: capturedOpcode,
          argument: capturedArgument,
          arg: capturedArgument,
          stackBefore: captureStack(),
        }
      : null;
    if (!traceEntry) traceOverflow = true;
    steps += 1;

    switch (instruction.opcode) {
      case "PUSH":
      case "PUSH_STRING":
        push(instruction.argument, instruction.opcode);
        programCounter += 1;
        break;
      case "POP":
        pop("POP");
        programCounter += 1;
        break;
      case "STORE_LOCAL":
        currentScope.variables.set(instruction.argument, pop("STORE_LOCAL"));
        programCounter += 1;
        break;
      case "DECLARE": {
        const value = pop("DECLARE");
        if (currentScope.variables.has(instruction.argument)) {
          throw runtimeError(
            `Variable '${instruction.argument}' is already declared in this scope`,
            "VM_DUPLICATE_VARIABLE",
          );
        }
        currentScope.variables.set(instruction.argument, value);
        programCounter += 1;
        break;
      }
      case "STORE": {
        const value = pop("STORE");
        const scope = resolveVariable(instruction.argument);
        if (!scope) {
          throw runtimeError(
            `Assignment to undeclared variable: ${instruction.argument}. Use 'let ${instruction.argument} = ...' first`,
            "VM_UNDECLARED_ASSIGNMENT",
          );
        }
        scope.variables.set(instruction.argument, value);
        programCounter += 1;
        break;
      }
      case "LOAD": {
        const scope = resolveVariable(instruction.argument);
        if (!scope) {
          throw runtimeError(
            `Undefined variable: ${instruction.argument}`,
            "VM_UNDEFINED_VARIABLE",
          );
        }
        push(scope.variables.get(instruction.argument), "LOAD");
        programCounter += 1;
        break;
      }
      case "ENTER_SCOPE":
        currentScope = createScope(currentScope);
        programCounter += 1;
        break;
      case "EXIT_SCOPE":
        if (!currentScope.parent) {
          throw runtimeError(
            "Scope underflow during EXIT_SCOPE",
            "VM_SCOPE_UNDERFLOW",
          );
        }
        currentScope = currentScope.parent;
        programCounter += 1;
        break;
      case "BIND_FUNCTION":
        if (currentScope.functions.has(instruction.argument)) {
          throw runtimeError(
            `Function binding '${instruction.argument}' already exists`,
            "VM_DUPLICATE_FUNCTION_BINDING",
          );
        }
        currentScope.functions.set(instruction.argument, {
          environment: currentScope,
        });
        programCounter += 1;
        break;
      case "ARGUMENT_COUNT":
        pendingArgumentCount = instruction.argument;
        programCounter += 1;
        break;
      case "CHECK_ARGUMENT_COUNT": {
        const frame = callStack.at(-1);
        if (!frame) {
          throw runtimeError(
            "Function entered without a call frame",
            "VM_CALL_FRAME_MISSING",
          );
        }
        if (frame.argumentCount !== instruction.argument) {
          throw runtimeError(
            `Expected ${instruction.argument} argument(s) but got ${frame.argumentCount}`,
            "VM_ARITY",
          );
        }
        programCounter += 1;
        break;
      }
      case "MAKE_ARRAY": {
        const length = instruction.argument;
        if (length > limits.maxArrayLength) {
          throw runtimeError(
            `Array length exceeds the ${limits.maxArrayLength} element limit`,
            "VM_ARRAY_LIMIT",
          );
        }
        if (stack.length < length) {
          throw runtimeError(
            "Stack underflow during MAKE_ARRAY",
            "VM_STACK_UNDERFLOW",
          );
        }
        const values = stack.splice(stack.length - length, length);
        push(values, "MAKE_ARRAY");
        programCounter += 1;
        break;
      }
      case "INDEX_GET": {
        const index = pop("INDEX_GET");
        const target = pop("INDEX_GET");
        requireInteger(index, "index");
        if (Array.isArray(target)) {
          if (index < 0 || index >= target.length) {
            throw runtimeError(
              `Index out of bounds: index ${index}, array length ${target.length}`,
              "VM_INDEX_BOUNDS",
            );
          }
          push(target[index], "INDEX_GET");
        } else if (typeof target === "string") {
          if (index < 0 || index >= target.length) {
            throw runtimeError(
              `Index out of bounds: index ${index}, string length ${target.length}`,
              "VM_INDEX_BOUNDS",
            );
          }
          push(target[index], "INDEX_GET");
        } else {
          throw runtimeError(
            `Type error: cannot index ${typeName(target)}`,
            "VM_INDEX_TYPE",
          );
        }
        programCounter += 1;
        break;
      }
      case "INDEX_SET": {
        const value = pop("INDEX_SET");
        const index = pop("INDEX_SET");
        const target = pop("INDEX_SET");
        if (typeof target === "string") {
          throw runtimeError(
            "Type error: strings are immutable — build a new string instead",
            "VM_STRING_IMMUTABLE",
          );
        }
        if (!Array.isArray(target)) {
          throw runtimeError(
            `Type error: cannot index-assign ${typeName(target)}`,
            "VM_INDEX_TYPE",
          );
        }
        requireInteger(index, "index");
        if (index < 0 || index >= target.length) {
          throw runtimeError(
            `Index out of bounds: index ${index}, array length ${target.length} (use push to append)`,
            "VM_INDEX_BOUNDS",
          );
        }
        target[index] = value;
        programCounter += 1;
        break;
      }
      case "DUPLICATE_PAIR":
        if (stack.length < 2) {
          throw runtimeError(
            "Stack underflow during DUPLICATE_PAIR",
            "VM_STACK_UNDERFLOW",
          );
        }
        push(stack.at(-2), "DUPLICATE_PAIR");
        push(stack.at(-2), "DUPLICATE_PAIR");
        programCounter += 1;
        break;
      case "ADD": {
        const right = pop("ADD");
        const left = pop("ADD");
        if (typeof left === "number" && typeof right === "number") {
          requireNumbers(left, right, "+");
          pushNumberResult(left + right, "+");
        } else if (typeof left === "string" || typeof right === "string") {
          const value =
            coerceForConcatenation(left) + coerceForConcatenation(right);
          if (value.length > limits.maxStringLength) {
            throw runtimeError(
              `String length exceeds the ${limits.maxStringLength} character limit`,
              "VM_STRING_LIMIT",
            );
          }
          push(value, "ADD");
        } else {
          throw runtimeError(
            `Type error: '+' requires numbers or strings, got ${typeName(left)} and ${typeName(right)}`,
            "VM_TYPE_ADD",
          );
        }
        programCounter += 1;
        break;
      }
      case "SUBTRACT":
      case "SUB": {
        const right = pop("SUB");
        const left = pop("SUB");
        requireNumbers(left, right, "-");
        pushNumberResult(left - right, "-");
        programCounter += 1;
        break;
      }
      case "MULTIPLY":
      case "MUL": {
        const right = pop("MUL");
        const left = pop("MUL");
        requireNumbers(left, right, "*");
        pushNumberResult(left * right, "*");
        programCounter += 1;
        break;
      }
      case "DIVIDE":
      case "DIV": {
        const right = pop("DIV");
        const left = pop("DIV");
        requireNumbers(left, right, "/");
        if (right === 0) {
          throw runtimeError("Division by zero", "VM_DIVISION_ZERO");
        }
        pushNumberResult(left / right, "/");
        programCounter += 1;
        break;
      }
      case "MOD": {
        const right = pop("MOD");
        const left = pop("MOD");
        requireNumbers(left, right, "%");
        if (right === 0) {
          throw runtimeError("Modulo by zero", "VM_MODULO_ZERO");
        }
        pushNumberResult(left % right, "%");
        programCounter += 1;
        break;
      }
      case "NEGATE": {
        const value = pop("NEGATE");
        requireNumber(value, "-");
        pushNumberResult(-value, "-");
        programCounter += 1;
        break;
      }
      case "NOT":
        push(pop("NOT") ? 0 : 1, "NOT");
        programCounter += 1;
        break;
      case "EQ": {
        const right = pop("EQ");
        const left = pop("EQ");
        push(left === right ? 1 : 0, "EQ");
        programCounter += 1;
        break;
      }
      case "NEQ": {
        const right = pop("NEQ");
        const left = pop("NEQ");
        push(left !== right ? 1 : 0, "NEQ");
        programCounter += 1;
        break;
      }
      case "LT":
      case "GT":
      case "LTE":
      case "GTE": {
        const right = pop(instruction.opcode);
        const left = pop(instruction.opcode);
        const comparisonOperators = { LT: "<", GT: ">", LTE: "<=", GTE: ">=" };
        requireNumbers(left, right, comparisonOperators[instruction.opcode]);
        const comparisons = {
          LT: left < right,
          GT: left > right,
          LTE: left <= right,
          GTE: left >= right,
        };
        push(comparisons[instruction.opcode] ? 1 : 0, instruction.opcode);
        programCounter += 1;
        break;
      }
      case "JUMP":
        programCounter = instruction.target;
        break;
      case "JUMP_IF_ZERO":
        programCounter = pop("JUMP_IF_ZERO")
          ? programCounter + 1
          : instruction.target;
        break;
      case "JUMP_IF_NONZERO":
        programCounter = pop("JUMP_IF_NONZERO")
          ? instruction.target
          : programCounter + 1;
        break;
      case "CALL": {
        if (callStack.length >= limits.maxCallDepth) {
          throw runtimeError(
            `Call depth exceeds the ${limits.maxCallDepth} frame limit`,
            "VM_CALL_DEPTH_LIMIT",
          );
        }
        if (stack.length < pendingArgumentCount) {
          throw runtimeError(
            "Stack underflow while binding function arguments",
            "VM_STACK_UNDERFLOW",
          );
        }
        const binding = resolveFunction(instruction.argument);
        if (!binding) {
          throw runtimeError(
            `Function '${instruction.argument}' is not bound in the current lexical environment`,
            "VM_FUNCTION_BINDING",
          );
        }
        callStack.push({
          returnProgramCounter: programCounter + 1,
          callerScope: currentScope,
          stackBase: stack.length - pendingArgumentCount,
          argumentCount: pendingArgumentCount,
          functionLabel: instruction.argument,
          callerPrintLine: printLine,
          callerPendingOutputTruncation: pendingOutputTruncation,
        });
        pendingArgumentCount = 0;
        printLine = "";
        pendingOutputTruncation = null;
        currentScope = binding.environment;
        programCounter = instruction.target;
        break;
      }
      case "RETURN": {
        const result = pop("RETURN");
        const frame = callStack.pop();
        if (!frame) {
          throw runtimeError(
            "Return with empty call stack",
            "VM_CALL_STACK_UNDERFLOW",
          );
        }
        stack.length = frame.stackBase;
        push(result, "RETURN");
        printLine = frame.callerPrintLine;
        pendingOutputTruncation = frame.callerPendingOutputTruncation;
        currentScope = frame.callerScope;
        programCounter = frame.returnProgramCounter;
        break;
      }
      case "PRINT": {
        appendPrintValue(pop("PRINT"));
        programCounter += 1;
        break;
      }
      case "PRINT_LINE":
        finishPrintLine();
        programCounter += 1;
        break;
      case "HALT":
        status = "halted";
        programCounter = code.length;
        break;
      case "BUILTIN_LEN": {
        const value = pop("len");
        if (typeof value === "string" || Array.isArray(value)) {
          push(value.length, "len");
        } else {
          throw runtimeError(
            `Type error: len() requires string or array, got ${typeName(value)}`,
            "VM_BUILTIN_TYPE",
          );
        }
        programCounter += 1;
        break;
      }
      case "BUILTIN_CHAR_AT": {
        const index = pop("char_at");
        const value = pop("char_at");
        if (typeof value !== "string") {
          throw runtimeError(
            `Type error: char_at() requires string as first argument, got ${typeName(value)}`,
            "VM_BUILTIN_TYPE",
          );
        }
        requireInteger(index, "char_at index");
        if (index < 0 || index >= value.length) {
          throw runtimeError(
            `Index out of bounds: char_at(${value.length} code units, ${index})`,
            "VM_INDEX_BOUNDS",
          );
        }
        push(value[index], "char_at");
        programCounter += 1;
        break;
      }
      case "BUILTIN_SUBSTR": {
        const count = pop("substr");
        const start = pop("substr");
        const value = pop("substr");
        if (typeof value !== "string") {
          throw runtimeError(
            `Type error: substr() requires string as first argument, got ${typeName(value)}`,
            "VM_BUILTIN_TYPE",
          );
        }
        requireInteger(start, "substr start");
        requireInteger(count, "substr count");
        if (start < 0 || start > value.length) {
          throw runtimeError(
            `substr start out of range: start ${start}, string length ${value.length}`,
            "VM_SUBSTR_BOUNDS",
          );
        }
        if (count < 0) {
          throw runtimeError(
            `substr count must be non-negative, got ${count}`,
            "VM_SUBSTR_BOUNDS",
          );
        }
        push(value.slice(start, start + count), "substr");
        programCounter += 1;
        break;
      }
      case "BUILTIN_FLOOR": {
        const value = pop("floor");
        requireNumber(value, "floor");
        push(Math.floor(value), "floor");
        programCounter += 1;
        break;
      }
      case "BUILTIN_TYPE_OF":
        push(typeName(pop("type_of")), "type_of");
        programCounter += 1;
        break;
      case "BUILTIN_PUSH": {
        const value = pop("push");
        const array = pop("push");
        if (!Array.isArray(array)) {
          throw runtimeError(
            `Type error: push() requires array as first argument, got ${typeName(array)}`,
            "VM_BUILTIN_TYPE",
          );
        }
        if (array.length >= limits.maxArrayLength) {
          throw runtimeError(
            `Array length exceeds the ${limits.maxArrayLength} element limit`,
            "VM_ARRAY_LIMIT",
          );
        }
        array.push(value);
        push(array.length, "push");
        programCounter += 1;
        break;
      }
      case "BUILTIN_POP": {
        const array = pop("pop");
        if (!Array.isArray(array)) {
          throw runtimeError(
            `Type error: pop() requires array, got ${typeName(array)}`,
            "VM_BUILTIN_TYPE",
          );
        }
        if (array.length === 0) {
          throw runtimeError("pop from empty array", "VM_POP_EMPTY");
        }
        push(array.pop(), "pop");
        programCounter += 1;
        break;
      }
      default:
        throw runtimeError(
          `Unknown opcode: ${instruction.opcode}`,
          "VM_OPCODE_UNKNOWN",
        );
    }

    if (traceEntry) {
      traceEntry.stackAfter = captureStack();
      trace.push(traceEntry);
    }
  }

  if (status === "running" && programCounter >= code.length) {
    status = "halted";
  }
  if (status === "step_limit") {
    // Discard any incomplete compatibility PRINT sequence, then account for
    // the execution-limit marker like any other output record.
    printLine = "";
    pendingOutputTruncation = null;
    appendPrintText("[EXECUTION LIMIT REACHED]");
    finishPrintLine();
  }

  const globals = Object.create(null);
  for (const [name, value] of rootScope.variables) globals[name] = value;

  return {
    status,
    output,
    trace,
    globals,
    steps,
    traceOverflow,
    traceCharacters,
    outputTruncated,
    outputTruncationReason,
    stackDepth: stack.length,
    callDepth: callStack.length,
  };
}

export { DEFAULT_LIMITS };
