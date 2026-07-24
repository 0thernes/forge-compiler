import { analyze } from "../src/compiler/analyze.js";
import { lex } from "../src/compiler/lexer.js";
import { parse } from "../src/compiler/parser.js";

class ReturnSignal {
  constructor(value) {
    this.value = value;
  }
}

class BreakSignal {}
class ContinueSignal {}

function typeName(value) {
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function escapeString(value) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\0", "\\0")
    .replaceAll("\n", "\\n")
    .replaceAll("\t", "\\t")
    .replaceAll("\r", "\\r")
    .replaceAll('"', '\\"');
}

function formatValue(value, ancestors = new Set()) {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return `"${escapeString(value)}"`;
  if (!Array.isArray(value)) return String(value);
  if (ancestors.has(value)) return "[...]";

  ancestors.add(value);
  const formatted = `[${value
    .map((entry) => formatValue(entry, ancestors))
    .join(", ")}]`;
  ancestors.delete(value);
  return formatted;
}

function formatForPrint(value) {
  return typeof value === "string" ? value : formatValue(value);
}

function formatForConcatenation(value, ancestors = new Set(), depth = 0) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (!Array.isArray(value)) return String(value);
  if (value.length === 0) return "[]";
  if (ancestors.has(value)) {
    throw new Error("'+' cannot convert an array that contains itself");
  }
  if (depth >= 32) {
    throw new Error("'+' cannot convert an array nested deeper than 32 levels");
  }

  ancestors.add(value);
  const formatted = `[${value
    .map((entry) =>
      typeof entry === "string"
        ? `"${escapeString(entry)}"`
        : formatForConcatenation(entry, ancestors, depth + 1),
    )
    .join(", ")}]`;
  ancestors.delete(value);
  return formatted;
}

function createEnvironment(parent = null) {
  return {
    parent,
    variables: new Map(),
    functions: new Map(),
  };
}

function resolveVariable(environment, name) {
  for (let current = environment; current; current = current.parent) {
    if (current.variables.has(name)) return current;
  }
  return null;
}

function resolveFunction(environment, name) {
  for (let current = environment; current; current = current.parent) {
    const binding = current.functions.get(name);
    if (binding) return binding;
  }
  return null;
}

function requireNumber(value, operation) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `Type error: '${operation}' requires number, got ${typeName(value)}`,
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
    throw new Error(
      `Type error: '${operation}' requires numbers, got ${typeName(left)} and ${typeName(right)}`,
    );
  }
}

function requireInteger(value, context) {
  requireNumber(value, context);
  if (!Number.isInteger(value)) {
    throw new Error(`Type error: ${context} must be an integer, got ${value}`);
  }
}

function finiteResult(value, operation) {
  if (!Number.isFinite(value)) {
    throw new Error(`Numeric overflow during '${operation}'`);
  }
  return value;
}

function readIndex(target, index) {
  requireInteger(index, "index");
  if (Array.isArray(target)) {
    if (index < 0 || index >= target.length) {
      throw new Error(
        `Index out of bounds: index ${index}, array length ${target.length}`,
      );
    }
    return target[index];
  }
  if (typeof target === "string") {
    if (index < 0 || index >= target.length) {
      throw new Error(
        `Index out of bounds: index ${index}, string length ${target.length}`,
      );
    }
    return target[index];
  }
  throw new Error(`Type error: cannot index ${typeName(target)}`);
}

function writeIndex(target, index, value) {
  if (typeof target === "string") {
    throw new Error(
      "Type error: strings are immutable — build a new string instead",
    );
  }
  if (!Array.isArray(target)) {
    throw new Error(`Type error: cannot index-assign ${typeName(target)}`);
  }
  requireInteger(index, "index");
  if (index < 0 || index >= target.length) {
    throw new Error(
      `Index out of bounds: index ${index}, array length ${target.length} (use push to append)`,
    );
  }
  target[index] = value;
}

function evaluateBinary(operation, left, right) {
  switch (operation) {
    case "+":
      if (typeof left === "number" && typeof right === "number") {
        requireNumbers(left, right, "+");
        return finiteResult(left + right, "+");
      }
      if (typeof left === "string" || typeof right === "string") {
        return formatForConcatenation(left) + formatForConcatenation(right);
      }
      throw new Error(
        `Type error: '+' requires numbers or strings, got ${typeName(left)} and ${typeName(right)}`,
      );
    case "-":
      requireNumbers(left, right, "-");
      return finiteResult(left - right, "-");
    case "*":
      requireNumbers(left, right, "*");
      return finiteResult(left * right, "*");
    case "/":
      requireNumbers(left, right, "/");
      if (right === 0) throw new Error("Division by zero");
      return finiteResult(left / right, "/");
    case "%":
      requireNumbers(left, right, "%");
      if (right === 0) throw new Error("Modulo by zero");
      return finiteResult(left % right, "%");
    case "==":
      return left === right ? 1 : 0;
    case "!=":
      return left !== right ? 1 : 0;
    case "<":
      requireNumbers(left, right, "<");
      return left < right ? 1 : 0;
    case ">":
      requireNumbers(left, right, ">");
      return left > right ? 1 : 0;
    case "<=":
      requireNumbers(left, right, "<=");
      return left <= right ? 1 : 0;
    case ">=":
      requireNumbers(left, right, ">=");
      return left >= right ? 1 : 0;
    default:
      throw new Error(`Unknown binary operator: ${operation}`);
  }
}

export function runReference(source, { maxNodes = 5_000_000 } = {}) {
  const ast = parse(lex(source));
  analyze(ast);

  const output = [];
  const globalEnvironment = createEnvironment();
  let remainingNodes = maxNodes;

  function tick() {
    remainingNodes -= 1;
    if (remainingNodes < 0) {
      throw new Error(
        `Reference interpreter exhausted its ${maxNodes} node budget`,
      );
    }
  }

  function hoistFunctions(statements, environment) {
    for (const statement of statements) {
      if (statement.type !== "FnDecl") continue;
      environment.functions.set(statement.name, {
        declaration: statement,
        environment,
      });
    }
  }

  function executeStatements(statements, environment) {
    hoistFunctions(statements, environment);
    for (const statement of statements) {
      if (statement.type !== "FnDecl") {
        executeStatement(statement, environment);
      }
    }
  }

  function executeScopedBlock(block, parentEnvironment) {
    executeStatements(block.body, createEnvironment(parentEnvironment));
  }

  function callBuiltin(name, arguments_) {
    switch (name) {
      case "len": {
        const [value] = arguments_;
        if (typeof value === "string" || Array.isArray(value)) {
          return value.length;
        }
        throw new Error(
          `Type error: len() requires string or array, got ${typeName(value)}`,
        );
      }
      case "char_at": {
        const [value, index] = arguments_;
        if (typeof value !== "string") {
          throw new Error(
            `Type error: char_at() requires string as first argument, got ${typeName(value)}`,
          );
        }
        requireInteger(index, "char_at index");
        if (index < 0 || index >= value.length) {
          throw new Error(
            `Index out of bounds: char_at(${value.length} code units, ${index})`,
          );
        }
        return value[index];
      }
      case "substr": {
        const [value, start, count] = arguments_;
        if (typeof value !== "string") {
          throw new Error(
            `Type error: substr() requires string as first argument, got ${typeName(value)}`,
          );
        }
        requireInteger(start, "substr start");
        requireInteger(count, "substr count");
        if (start < 0 || start > value.length) {
          throw new Error(
            `substr start out of range: start ${start}, string length ${value.length}`,
          );
        }
        if (count < 0) {
          throw new Error(`substr count must be non-negative, got ${count}`);
        }
        return value.slice(start, start + count);
      }
      case "floor": {
        const [value] = arguments_;
        requireNumber(value, "floor");
        return Math.floor(value);
      }
      case "type_of":
        return typeName(arguments_[0]);
      case "push": {
        const [array, value] = arguments_;
        if (!Array.isArray(array)) {
          throw new Error(
            `Type error: push() requires array as first argument, got ${typeName(array)}`,
          );
        }
        array.push(value);
        return array.length;
      }
      case "pop": {
        const [array] = arguments_;
        if (!Array.isArray(array)) {
          throw new Error(
            `Type error: pop() requires array, got ${typeName(array)}`,
          );
        }
        if (array.length === 0) throw new Error("pop from empty array");
        return array.pop();
      }
      default:
        return undefined;
    }
  }

  function callFunction(name, arguments_, callerEnvironment) {
    const builtin = callBuiltin(name, arguments_);
    if (builtin !== undefined || name === "type_of") return builtin;

    const binding = resolveFunction(callerEnvironment, name);
    if (!binding) throw new Error(`Undefined function: ${name}`);

    const { declaration, environment } = binding;
    if (arguments_.length !== declaration.params.length) {
      throw new Error(
        `Expected ${declaration.params.length} argument(s) but got ${arguments_.length}`,
      );
    }

    const callEnvironment = createEnvironment(environment);
    declaration.params.forEach((parameter, index) => {
      callEnvironment.variables.set(parameter, arguments_[index]);
    });

    try {
      executeStatements(declaration.body.body, callEnvironment);
      return 0;
    } catch (signal) {
      if (signal instanceof ReturnSignal) return signal.value;
      throw signal;
    }
  }

  function evaluateExpression(node, environment) {
    tick();
    switch (node.type) {
      case "Number":
      case "String":
        return node.value;
      case "Boolean":
        return node.value ? 1 : 0;
      case "Identifier": {
        const variableEnvironment = resolveVariable(environment, node.name);
        if (!variableEnvironment) {
          throw new Error(`Undefined variable: ${node.name}`);
        }
        return variableEnvironment.variables.get(node.name);
      }
      case "ArrayLiteral":
        return node.elements.map((element) =>
          evaluateExpression(element, environment),
        );
      case "Index":
        return readIndex(
          evaluateExpression(node.array, environment),
          evaluateExpression(node.index, environment),
        );
      case "UnaryOp": {
        const value = evaluateExpression(node.expr, environment);
        if (node.op === "-") {
          requireNumber(value, "-");
          return finiteResult(-value, "-");
        }
        if (node.op === "!") return value ? 0 : 1;
        throw new Error(`Unknown unary operator: ${node.op}`);
      }
      case "BinOp":
        if (node.op === "&&") {
          if (!evaluateExpression(node.left, environment)) return 0;
          return evaluateExpression(node.right, environment) ? 1 : 0;
        }
        if (node.op === "||") {
          if (evaluateExpression(node.left, environment)) return 1;
          return evaluateExpression(node.right, environment) ? 1 : 0;
        }
        return evaluateBinary(
          node.op,
          evaluateExpression(node.left, environment),
          evaluateExpression(node.right, environment),
        );
      case "Call":
        return callFunction(
          node.name,
          node.args.map((argument) =>
            evaluateExpression(argument, environment),
          ),
          environment,
        );
      default:
        throw new Error(`Unknown expression type: ${node.type}`);
    }
  }

  function executeStatement(node, environment) {
    tick();
    switch (node.type) {
      case "Let": {
        const value = evaluateExpression(node.value, environment);
        environment.variables.set(node.name, value);
        return;
      }
      case "Assignment": {
        const value = evaluateExpression(node.value, environment);
        const variableEnvironment = resolveVariable(environment, node.name);
        if (!variableEnvironment) {
          throw new Error(
            `Assignment to undeclared variable: ${node.name}. Use 'let ${node.name} = ...' first`,
          );
        }
        variableEnvironment.variables.set(node.name, value);
        return;
      }
      case "IndexAssignment": {
        const target = evaluateExpression(node.array, environment);
        const index = evaluateExpression(node.index, environment);
        const value = node.op
          ? evaluateBinary(
              node.op,
              readIndex(target, index),
              evaluateExpression(node.value, environment),
            )
          : evaluateExpression(node.value, environment);
        writeIndex(target, index, value);
        return;
      }
      case "Print": {
        let line = "";
        for (const argument of node.args) {
          line += formatForPrint(evaluateExpression(argument, environment));
        }
        output.push(line);
        return;
      }
      case "If":
        if (evaluateExpression(node.cond, environment)) {
          executeScopedBlock(node.then, environment);
        } else if (node.else?.type === "If") {
          executeStatement(node.else, environment);
        } else if (node.else) {
          executeScopedBlock(node.else, environment);
        }
        return;
      case "While":
        while (evaluateExpression(node.cond, environment)) {
          try {
            executeScopedBlock(node.body, environment);
          } catch (signal) {
            if (signal instanceof BreakSignal) break;
            if (signal instanceof ContinueSignal) continue;
            throw signal;
          }
        }
        return;
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
        return;
      default:
        throw new Error(`Unknown statement type: ${node.type}`);
    }
  }

  executeStatements(ast.body, globalEnvironment);
  return {
    output,
    globals: Object.fromEntries(globalEnvironment.variables),
  };
}
