import { PUBLIC_SCHEMA_VERSIONS } from "../compiler/capabilities.js";

function positionOf(node) {
  return node?.position
    ? {
        line: node.position.line,
        column: node.position.column,
      }
    : null;
}

function projectNode(node) {
  if (node === null) return null;
  const position = positionOf(node);
  const located = (projected) => ({
    ...projected,
    position,
  });

  switch (node.type) {
    case "Program":
      return located({
        kind: "Program",
        statements: node.body.map(projectNode),
      });
    case "Let":
      return located({
        kind: "LetDeclaration",
        name: node.name,
        initializer: projectNode(node.value),
      });
    case "Assignment":
      return located({
        kind: "Assignment",
        name: node.name,
        value: projectNode(node.value),
      });
    case "IndexAssignment":
      return located({
        kind: "IndexAssignment",
        target: projectNode(node.array),
        index: projectNode(node.index),
        operator: node.op,
        value: projectNode(node.value),
      });
    case "Print":
      return located({
        kind: "PrintStatement",
        arguments: node.args.map(projectNode),
      });
    case "If":
      return located({
        kind: "IfStatement",
        condition: projectNode(node.cond),
        consequent: projectNode(node.then),
        alternate: projectNode(node.else),
      });
    case "While":
      return located({
        kind: "WhileStatement",
        condition: projectNode(node.cond),
        body: projectNode(node.body),
      });
    case "FnDecl":
      return located({
        kind: "FunctionDeclaration",
        name: node.name,
        parameters: [...node.params],
        body: projectNode(node.body),
      });
    case "Return":
      return located({
        kind: "ReturnStatement",
        value: projectNode(node.value),
      });
    case "Break":
      return located({ kind: "BreakStatement" });
    case "Continue":
      return located({ kind: "ContinueStatement" });
    case "Block":
      return located({
        kind: "Block",
        statements: node.body.map(projectNode),
      });
    case "BinOp":
      return located({
        kind: "BinaryExpression",
        operator: node.op,
        left: projectNode(node.left),
        right: projectNode(node.right),
      });
    case "UnaryOp":
      return located({
        kind: "UnaryExpression",
        operator: node.op,
        operand: projectNode(node.expr),
      });
    case "Call":
      return located({
        kind: "CallExpression",
        callee: node.name,
        arguments: node.args.map(projectNode),
      });
    case "ArrayLiteral":
      return located({
        kind: "ArrayExpression",
        elements: node.elements.map(projectNode),
      });
    case "Index":
      return located({
        kind: "IndexExpression",
        target: projectNode(node.array),
        index: projectNode(node.index),
      });
    case "Number":
      return located({
        kind: "NumberLiteral",
        value: node.value,
      });
    case "String":
      return located({
        kind: "StringLiteral",
        value: node.value,
      });
    case "Boolean":
      return located({
        kind: "BooleanLiteral",
        value: node.value,
      });
    case "Identifier":
      return located({
        kind: "Identifier",
        name: node.name,
      });
    case "ExprStmt":
      return located({
        kind: "ExpressionStatement",
        expression: projectNode(node.expr),
      });
    default:
      throw new Error(`Cannot project unknown AST node type: ${node.type}`);
  }
}

export function projectTokens(tokens) {
  return {
    schema: PUBLIC_SCHEMA_VERSIONS.tokens,
    items: tokens.map((token, index) => ({
      index,
      kind: token.type,
      value: token.value,
      position: {
        line: token.position.line,
        column: token.position.column,
      },
    })),
  };
}

export function projectAst(ast) {
  return {
    schema: PUBLIC_SCHEMA_VERSIONS.ast,
    root: projectNode(ast),
  };
}

export function projectAnalysis(analysis) {
  return {
    schema: PUBLIC_SCHEMA_VERSIONS.analysis,
    variables: analysis.variables,
    functions: analysis.functions,
    calls: analysis.calls,
  };
}

export function projectInstructionAddresses(addresses) {
  return {
    schema: PUBLIC_SCHEMA_VERSIONS["instruction-addresses"],
    items: [...addresses],
  };
}

export function projectTimings(timings) {
  return {
    schema: PUBLIC_SCHEMA_VERSIONS.timings,
    unit: "milliseconds",
    phases: { ...timings },
  };
}

function projectInstruction(instruction, index, address) {
  return {
    index,
    address,
    opcode: instruction.opcode,
    ...(instruction.argument === undefined
      ? {}
      : { operand: instruction.argument }),
    ...(instruction.target === undefined ? {} : { target: instruction.target }),
  };
}

export function projectAssembly(
  instructions,
  addresses,
  { linked = false } = {},
) {
  return {
    schema: PUBLIC_SCHEMA_VERSIONS.assembly,
    linked,
    instructions: instructions.map((instruction, index) =>
      projectInstruction(instruction, index, linked ? index : addresses[index]),
    ),
  };
}

function projectTrace(trace) {
  return {
    schema: PUBLIC_SCHEMA_VERSIONS.trace,
    entries: trace.map((entry, index) => ({
      index,
      programCounter: entry.programCounter,
      opcode: entry.opcode,
      ...(entry.argument === undefined ? {} : { operand: entry.argument }),
      stackBefore: entry.stackBefore,
      stackAfter: entry.stackAfter,
    })),
  };
}

function projectRuntimeValues(globals) {
  const roots = Object.create(null);
  const arrays = [];
  const pending = [];
  const seen = new WeakMap();

  function projectValue(value) {
    if (!Array.isArray(value)) return value;
    let id = seen.get(value);
    if (id === undefined) {
      id = arrays.length;
      seen.set(value, id);
      arrays.push(null);
      pending.push(value);
    }
    return {
      $forge: "array-reference",
      id,
    };
  }

  for (const [name, value] of Object.entries(globals)) {
    roots[name] = projectValue(value);
  }
  for (let id = 0; id < pending.length; id += 1) {
    const source = pending[id];
    const items = [];
    for (let index = 0; index < source.length; index += 1) {
      items.push(
        Object.hasOwn(source, index) ? projectValue(source[index]) : null,
      );
    }
    arrays[id] = { id, items };
  }

  return {
    schema: PUBLIC_SCHEMA_VERSIONS.values,
    roots,
    arrays,
  };
}

export function projectResult(result, { includeTrace = false } = {}) {
  return {
    schema: PUBLIC_SCHEMA_VERSIONS.result,
    status: result.status,
    output: result.output,
    globals: projectRuntimeValues(result.globals),
    steps: result.steps,
    traceOverflow: result.traceOverflow,
    traceCharacters: result.traceCharacters,
    outputTruncated: result.outputTruncated,
    outputTruncationReason: result.outputTruncationReason,
    stackDepth: result.stackDepth,
    callDepth: result.callDepth,
    ...(includeTrace ? { trace: projectTrace(result.trace) } : {}),
  };
}

export { PUBLIC_SCHEMA_VERSIONS };
