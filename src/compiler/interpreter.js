// FORGE reference interpreter — the differential-testing oracle.
//
// Design: shares the FRONTEND with the compiler pipeline (lexer, parser, and
// the semantic analyzer, so compile-time diagnostics fire identically), plus
// the pure utility modules (constants, errors, format) so limits and error
// strings match the VM exactly. Execution, however, is a direct tree walk
// that shares ZERO code with the stack backend: it must not import vm.js,
// codegen.js, or the linker. If the VM and this interpreter disagree on any
// program's observable behavior, one of them has a bug.
//
// Semantics contract (v14) — kept in lockstep with vm.js:
//   · Values: number (finite), string (immutable), array (reference
//     semantics). Boolean literals evaluate to 1/0.
//   · Scope: LEXICAL. A function binding captures the environment of the
//     block that declares it; calls run in a fresh child of that captured
//     environment, never the caller's. Blocks and each loop iteration get a
//     fresh child environment. Functions and variables live in separate
//     namespaces.
//   · Forward references: function bindings are installed at block entry, so
//     a body may read a sibling `let` declared later in the block — but only
//     once the declaration has actually executed; calling earlier throws
//     "Undefined variable: x" at runtime, exactly like the VM.
//   · Arithmetic: division/modulo by zero throw; any non-finite numeric
//     result throws "Numeric overflow during '<op>'".
//   · '+' string coercion is lossless: string operands pass through
//     unchanged, other operands render via renderValue and throw when the
//     rendering cannot be complete (over-length, over-deep, or cyclic).
//   · Output: print builds a line from formatted fragments; the same
//     line/character caps and truncation markers as the VM apply.
//   · Budget: an explicit node-visit budget (limits.maxSteps) ends
//     non-terminating programs with status "step_limit" and the
//     "[EXECUTION LIMIT REACHED]" marker, mirroring the VM's step budget.
//     Node visits are not VM steps, so only the status — not the visit
//     count — is comparable across engines.

import { analyze } from "./analyze.js";
import { mergeLimits } from "./constants.js";
import { ForgeError, normalizeError } from "./errors.js";
import { formatForPrint, renderValue, typeName } from "./format.js";
import { lex } from "./lexer.js";
import { parse } from "./parser.js";

class ReturnSignal {
  constructor(value) {
    this.value = value;
  }
}
class BreakSignal {}
class ContinueSignal {}
class StepLimitSignal {}

function interpreterLimits(options) {
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

function createEnvironment(parent = null) {
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

export function interpretSource(source, options = {}) {
  const limits = interpreterLimits(options);
  try {
    const tokens = lex(source, limits);
    const ast = parse(tokens, limits);
    analyze(ast);
    return interpret(ast, limits);
  } catch (error) {
    throw normalizeError(error, "execute");
  }
}

function interpret(ast, limits) {
  const output = [];
  const rootEnvironment = createEnvironment();
  let steps = 0;
  let callDepth = 0;
  let printLine = "";
  let outputCharacters = 0;
  let outputLines = 0;
  let outputTruncated = false;
  let outputTruncationReason = null;
  let pendingOutputTruncation = null;
  let status = "halted";

  function runtimeError(message, code = "REF_RUNTIME") {
    return new ForgeError(message, {
      phase: "execute",
      code,
    });
  }

  function tick() {
    if (steps >= limits.maxSteps) throw new StepLimitSignal();
    steps += 1;
  }

  function requireNumber(value, operation) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw runtimeError(
        `Type error: '${operation}' requires number, got ${typeName(value)}`,
        "REF_TYPE_NUMBER",
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
        "REF_TYPE_NUMBER",
      );
    }
  }

  function checkedNumberResult(value, operation) {
    if (!Number.isFinite(value)) {
      throw runtimeError(
        `Numeric overflow during '${operation}'`,
        "REF_NUMBER_RANGE",
      );
    }
    return value;
  }

  function requireInteger(value, context) {
    requireNumber(value, context);
    if (!Number.isInteger(value)) {
      throw runtimeError(
        `Type error: ${context} must be an integer, got ${value}`,
        "REF_TYPE_INTEGER",
      );
    }
  }

  // In-program string coercion must be lossless — identical contract to the
  // VM's coerceForConcatenation, including its reason-based classification.
  function coerceForConcatenation(value) {
    if (typeof value === "string") return value;
    const coercionBudget =
      limits.maxStringLength === Number.MAX_SAFE_INTEGER
        ? limits.maxStringLength
        : limits.maxStringLength + 1;
    const rendered = renderValue(value, {
      maxCharacters: coercionBudget,
      maxItems: Number.MAX_SAFE_INTEGER,
      maxDepth: limits.maxFormatDepth,
    });
    if (!rendered.complete) {
      if (rendered.reason === "characters") {
        throw runtimeError(
          `String length exceeds the ${limits.maxStringLength} character limit`,
          "REF_STRING_LIMIT",
        );
      }
      if (rendered.reason === "cycle") {
        throw runtimeError(
          "'+' cannot convert an array that contains itself",
          "REF_FORMAT_CYCLE",
        );
      }
      if (rendered.reason === "depth") {
        throw runtimeError(
          `'+' cannot convert an array nested deeper than ${limits.maxFormatDepth} levels`,
          "REF_FORMAT_DEPTH",
        );
      }
      throw runtimeError(
        "'+' cannot convert an array that exceeds the formatting item limit",
        "REF_FORMAT_ITEMS",
      );
    }
    return rendered.text;
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

  function resolveVariableEnvironment(environment, name) {
    for (let scope = environment; scope; scope = scope.parent) {
      if (scope.variables.has(name)) return scope;
    }
    return null;
  }

  function resolveFunctionBinding(environment, name) {
    for (let scope = environment; scope; scope = scope.parent) {
      const binding = scope.functions.get(name);
      if (binding) return binding;
    }
    return null;
  }

  function indexGet(target, index) {
    requireInteger(index, "index");
    if (Array.isArray(target)) {
      if (index < 0 || index >= target.length) {
        throw runtimeError(
          `Index out of bounds: index ${index}, array length ${target.length}`,
          "REF_INDEX_BOUNDS",
        );
      }
      return target[index];
    }
    if (typeof target === "string") {
      if (index < 0 || index >= target.length) {
        throw runtimeError(
          `Index out of bounds: index ${index}, string length ${target.length}`,
          "REF_INDEX_BOUNDS",
        );
      }
      return target[index];
    }
    throw runtimeError(
      `Type error: cannot index ${typeName(target)}`,
      "REF_INDEX_TYPE",
    );
  }

  function indexSet(target, index, value) {
    if (typeof target === "string") {
      throw runtimeError(
        "Type error: strings are immutable — build a new string instead",
        "REF_STRING_IMMUTABLE",
      );
    }
    if (!Array.isArray(target)) {
      throw runtimeError(
        `Type error: cannot index-assign ${typeName(target)}`,
        "REF_INDEX_TYPE",
      );
    }
    requireInteger(index, "index");
    if (index < 0 || index >= target.length) {
      throw runtimeError(
        `Index out of bounds: index ${index}, array length ${target.length} (use push to append)`,
        "REF_INDEX_BOUNDS",
      );
    }
    target[index] = value;
  }

  function binaryOperation(operator, left, right) {
    switch (operator) {
      case "+": {
        if (typeof left === "number" && typeof right === "number") {
          requireNumbers(left, right, "+");
          return checkedNumberResult(left + right, "+");
        }
        if (typeof left === "string" || typeof right === "string") {
          const value =
            coerceForConcatenation(left) + coerceForConcatenation(right);
          if (value.length > limits.maxStringLength) {
            throw runtimeError(
              `String length exceeds the ${limits.maxStringLength} character limit`,
              "REF_STRING_LIMIT",
            );
          }
          return value;
        }
        throw runtimeError(
          `Type error: '+' requires numbers or strings, got ${typeName(left)} and ${typeName(right)}`,
          "REF_TYPE_ADD",
        );
      }
      case "-":
        requireNumbers(left, right, "-");
        return checkedNumberResult(left - right, "-");
      case "*":
        requireNumbers(left, right, "*");
        return checkedNumberResult(left * right, "*");
      case "/":
        requireNumbers(left, right, "/");
        if (right === 0) {
          throw runtimeError("Division by zero", "REF_DIVISION_ZERO");
        }
        return checkedNumberResult(left / right, "/");
      case "%":
        requireNumbers(left, right, "%");
        if (right === 0) {
          throw runtimeError("Modulo by zero", "REF_MODULO_ZERO");
        }
        return checkedNumberResult(left % right, "%");
      case "==":
        return left === right ? 1 : 0;
      case "!=":
        return left !== right ? 1 : 0;
      case "<":
      case ">":
      case "<=":
      case ">=": {
        requireNumbers(left, right, operator);
        if (operator === "<") return left < right ? 1 : 0;
        if (operator === ">") return left > right ? 1 : 0;
        if (operator === "<=") return left <= right ? 1 : 0;
        return left >= right ? 1 : 0;
      }
      default:
        throw runtimeError(
          `Unknown operator: ${operator}`,
          "REF_OPERATOR_UNKNOWN",
        );
    }
  }

  const builtinImplementations = {
    len(value) {
      if (typeof value === "string" || Array.isArray(value)) {
        return value.length;
      }
      throw runtimeError(
        `Type error: len() requires string or array, got ${typeName(value)}`,
        "REF_BUILTIN_TYPE",
      );
    },
    char_at(value, index) {
      if (typeof value !== "string") {
        throw runtimeError(
          `Type error: char_at() requires string as first argument, got ${typeName(value)}`,
          "REF_BUILTIN_TYPE",
        );
      }
      requireInteger(index, "char_at index");
      if (index < 0 || index >= value.length) {
        throw runtimeError(
          `Index out of bounds: char_at(${value.length} code units, ${index})`,
          "REF_INDEX_BOUNDS",
        );
      }
      return value[index];
    },
    substr(value, start, count) {
      if (typeof value !== "string") {
        throw runtimeError(
          `Type error: substr() requires string as first argument, got ${typeName(value)}`,
          "REF_BUILTIN_TYPE",
        );
      }
      requireInteger(start, "substr start");
      requireInteger(count, "substr count");
      if (start < 0 || start > value.length) {
        throw runtimeError(
          `substr start out of range: start ${start}, string length ${value.length}`,
          "REF_SUBSTR_BOUNDS",
        );
      }
      if (count < 0) {
        throw runtimeError(
          `substr count must be non-negative, got ${count}`,
          "REF_SUBSTR_BOUNDS",
        );
      }
      return value.slice(start, start + count);
    },
    floor(value) {
      requireNumber(value, "floor");
      return Math.floor(value);
    },
    type_of(value) {
      return typeName(value);
    },
    push(array, value) {
      if (!Array.isArray(array)) {
        throw runtimeError(
          `Type error: push() requires array as first argument, got ${typeName(array)}`,
          "REF_BUILTIN_TYPE",
        );
      }
      if (array.length >= limits.maxArrayLength) {
        throw runtimeError(
          `Array length exceeds the ${limits.maxArrayLength} element limit`,
          "REF_ARRAY_LIMIT",
        );
      }
      array.push(value);
      return array.length;
    },
    pop(array) {
      if (!Array.isArray(array)) {
        throw runtimeError(
          `Type error: pop() requires array, got ${typeName(array)}`,
          "REF_BUILTIN_TYPE",
        );
      }
      if (array.length === 0) {
        throw runtimeError("pop from empty array", "REF_POP_EMPTY");
      }
      return array.pop();
    },
  };

  function callFunction(binding, argumentValues) {
    if (callDepth >= limits.maxCallDepth) {
      throw runtimeError(
        `Call depth exceeds the ${limits.maxCallDepth} frame limit`,
        "REF_CALL_DEPTH_LIMIT",
      );
    }
    const declaration = binding.declaration;
    if (argumentValues.length !== declaration.params.length) {
      // Unreachable through interpretSource — the analyzer checks arity
      // statically — but kept so direct callers get the VM's message.
      throw runtimeError(
        `Expected ${declaration.params.length} argument(s) but got ${argumentValues.length}`,
        "REF_ARITY",
      );
    }
    const environment = createEnvironment(binding.environment);
    declaration.params.forEach((parameter, index) => {
      environment.variables.set(parameter, argumentValues[index]);
    });
    // Mirror the VM's call frame: a callee starts with a clean print line and
    // the caller's partial line is restored afterwards.
    const savedPrintLine = printLine;
    const savedPendingOutputTruncation = pendingOutputTruncation;
    printLine = "";
    pendingOutputTruncation = null;
    callDepth += 1;
    try {
      runBlockBody(declaration.body.body, environment);
      return 0; // fell off the end — the VM pushes 0
    } catch (signal) {
      if (signal instanceof ReturnSignal) return signal.value;
      throw signal;
    } finally {
      callDepth -= 1;
      printLine = savedPrintLine;
      pendingOutputTruncation = savedPendingOutputTruncation;
    }
  }

  function evaluateCall(node, environment) {
    const argumentValues = node.args.map((argument) =>
      evaluateExpression(argument, environment),
    );
    const builtin = builtinImplementations[node.name];
    // Builtins dispatch by name before user functions, mirroring codegen;
    // the parser rejects user functions that shadow builtin names.
    if (Object.hasOwn(builtinImplementations, node.name)) {
      return builtin(...argumentValues);
    }
    const binding = resolveFunctionBinding(environment, node.name);
    if (!binding) {
      throw runtimeError(
        `Function '${node.name}' is not bound in the current lexical environment`,
        "REF_FUNCTION_BINDING",
      );
    }
    return callFunction(binding, argumentValues);
  }

  function evaluateExpression(node, environment) {
    tick();
    switch (node.type) {
      case "Number":
        return node.value;
      case "String":
        return node.value;
      case "Boolean":
        return node.value ? 1 : 0;
      case "Identifier": {
        const scope = resolveVariableEnvironment(environment, node.name);
        if (!scope) {
          throw runtimeError(
            `Undefined variable: ${node.name}`,
            "REF_UNDEFINED_VARIABLE",
          );
        }
        return scope.variables.get(node.name);
      }
      case "ArrayLiteral": {
        if (node.elements.length > limits.maxArrayLength) {
          throw runtimeError(
            `Array length exceeds the ${limits.maxArrayLength} element limit`,
            "REF_ARRAY_LIMIT",
          );
        }
        return node.elements.map((element) =>
          evaluateExpression(element, environment),
        );
      }
      case "Index":
        return indexGet(
          evaluateExpression(node.array, environment),
          evaluateExpression(node.index, environment),
        );
      case "UnaryOp": {
        const value = evaluateExpression(node.expr, environment);
        if (node.op === "-") {
          requireNumber(value, "-");
          return checkedNumberResult(-value, "-");
        }
        return value ? 0 : 1;
      }
      case "BinOp": {
        if (node.op === "&&") {
          if (!evaluateExpression(node.left, environment)) return 0;
          return evaluateExpression(node.right, environment) ? 1 : 0;
        }
        if (node.op === "||") {
          if (evaluateExpression(node.left, environment)) return 1;
          return evaluateExpression(node.right, environment) ? 1 : 0;
        }
        return binaryOperation(
          node.op,
          evaluateExpression(node.left, environment),
          evaluateExpression(node.right, environment),
        );
      }
      case "Call":
        return evaluateCall(node, environment);
      default:
        throw runtimeError(
          `Unknown expression type: ${node.type}`,
          "REF_EXPRESSION",
        );
    }
  }

  function executeStatement(node, environment) {
    tick();
    switch (node.type) {
      case "Let": {
        const value = evaluateExpression(node.value, environment);
        if (environment.variables.has(node.name)) {
          throw runtimeError(
            `Variable '${node.name}' is already declared in this scope`,
            "REF_DUPLICATE_VARIABLE",
          );
        }
        environment.variables.set(node.name, value);
        return;
      }
      case "Assignment": {
        const value = evaluateExpression(node.value, environment);
        const scope = resolveVariableEnvironment(environment, node.name);
        if (!scope) {
          throw runtimeError(
            `Assignment to undeclared variable: ${node.name}. Use 'let ${node.name} = ...' first`,
            "REF_UNDECLARED_ASSIGNMENT",
          );
        }
        scope.variables.set(node.name, value);
        return;
      }
      case "IndexAssignment": {
        // Mirror the VM's evaluation order exactly: target and index first;
        // for compound assignment the current value is read (bounds check
        // fires) BEFORE the right-hand side is evaluated; for plain
        // assignment the right-hand side is evaluated before any check.
        const target = evaluateExpression(node.array, environment);
        const index = evaluateExpression(node.index, environment);
        let value;
        if (node.op) {
          const current = indexGet(target, index);
          value = binaryOperation(
            node.op,
            current,
            evaluateExpression(node.value, environment),
          );
        } else {
          value = evaluateExpression(node.value, environment);
        }
        indexSet(target, index, value);
        return;
      }
      case "Print": {
        for (const argument of node.args) {
          appendPrintValue(evaluateExpression(argument, environment));
        }
        finishPrintLine();
        return;
      }
      case "If": {
        if (evaluateExpression(node.cond, environment)) {
          executeScopedBlock(node.then, environment);
        } else if (node.else) {
          if (node.else.type === "If") {
            // else-if chains add no scope frame — mirrors codegen
            executeStatement(node.else, environment);
          } else {
            executeScopedBlock(node.else, environment);
          }
        }
        return;
      }
      case "While": {
        while (evaluateExpression(node.cond, environment)) {
          try {
            // fresh environment per iteration — mirrors ENTER_SCOPE placement
            executeScopedBlock(node.body, environment);
          } catch (signal) {
            if (signal instanceof BreakSignal) break;
            if (signal instanceof ContinueSignal) continue;
            throw signal;
          }
        }
        return;
      }
      case "ExprStmt":
        evaluateExpression(node.expr, environment);
        return;
      case "Return":
        throw new ReturnSignal(
          node.value ? evaluateExpression(node.value, environment) : 0,
        );
      case "Break":
        throw new BreakSignal();
      case "Continue":
        throw new ContinueSignal();
      case "Block":
        executeScopedBlock(node, environment);
        return;
      case "FnDecl":
        return; // bound at block entry by runBlockBody
      default:
        throw runtimeError(
          `Unknown statement type: ${node.type}`,
          "REF_STATEMENT",
        );
    }
  }

  function runBlockBody(statements, environment) {
    // Function bindings are installed at block entry — before any statement
    // runs — capturing THIS environment. That is what makes sibling forward
    // references legal while keeping resolution lexical.
    for (const statement of statements) {
      if (statement.type !== "FnDecl") continue;
      if (environment.functions.has(statement.name)) {
        throw runtimeError(
          `Function binding '${statement.name}' already exists`,
          "REF_DUPLICATE_FUNCTION_BINDING",
        );
      }
      environment.functions.set(statement.name, {
        declaration: statement,
        environment,
      });
    }
    for (const statement of statements) {
      if (statement.type !== "FnDecl") executeStatement(statement, environment);
    }
  }

  function executeScopedBlock(blockNode, parentEnvironment) {
    runBlockBody(blockNode.body, createEnvironment(parentEnvironment));
  }

  try {
    runBlockBody(ast.body, rootEnvironment);
  } catch (signal) {
    if (signal instanceof StepLimitSignal) {
      status = "step_limit";
    } else if (signal instanceof ReturnSignal) {
      // Unreachable through interpretSource: the parser rejects top-level
      // return. Mirrors the VM's guard for direct AST callers.
      throw runtimeError(
        "Return with empty call stack",
        "REF_CALL_STACK_UNDERFLOW",
      );
    } else {
      throw signal;
    }
  }

  if (status === "step_limit") {
    // Discard any incomplete print line, then account for the
    // execution-limit marker like any other output record — as the VM does.
    printLine = "";
    pendingOutputTruncation = null;
    appendPrintText("[EXECUTION LIMIT REACHED]");
    finishPrintLine();
  }

  const globals = Object.create(null);
  for (const [name, value] of rootEnvironment.variables) globals[name] = value;

  return {
    status,
    output,
    globals,
    steps,
    outputTruncated,
    outputTruncationReason,
    callDepth,
  };
}
