import { getBuiltin } from "./constants.js";
import { ForgeError, atPosition } from "./errors.js";

function semanticError(message, node, code) {
  return new ForgeError(atPosition(message, node?.position), {
    phase: "analyze",
    position: node?.position ?? null,
    code,
  });
}

function createScope(parent, body, initialVariables = []) {
  const functions = new Map();
  const variables = new Map(
    initialVariables.map((name) => [name, { initialized: true }]),
  );

  for (const statement of body) {
    if (statement.type === "FnDecl") {
      if (functions.has(statement.name)) {
        throw semanticError(
          `Function '${statement.name}' is already declared in this scope`,
          { position: statement.namePosition },
          "ANALYZE_DUPLICATE_FUNCTION",
        );
      }
      functions.set(statement.name, {
        arity: statement.params.length,
        declaration: statement,
      });
    }
    if (statement.type === "Let") {
      if (variables.has(statement.name)) {
        throw semanticError(
          `Variable '${statement.name}' is already declared in this scope`,
          { position: statement.namePosition },
          "ANALYZE_DUPLICATE_VARIABLE",
        );
      }
      variables.set(statement.name, { initialized: false });
    }
  }

  return { parent, functions, variables };
}

function resolveFunction(scope, name) {
  for (let current = scope; current; current = current.parent) {
    const declaration = current.functions.get(name);
    if (declaration) return declaration;
  }
  return null;
}

function resolveVariable(scope, name) {
  for (let current = scope; current; current = current.parent) {
    const binding = current.variables.get(name);
    if (binding) return binding;
  }
  return null;
}

export function analyze(ast) {
  const summary = {
    functions: 0,
    variables: 0,
    calls: 0,
  };

  function analyzeBlock(body, parentScope, context, initialVariables = []) {
    const scope = createScope(parentScope, body, initialVariables);
    summary.functions += scope.functions.size;
    summary.variables += body.filter(
      (statement) => statement.type === "Let",
    ).length;
    for (const statement of body) {
      analyzeStatement(statement, scope, context);
    }
    return scope;
  }

  function analyzeStatement(node, scope, context) {
    switch (node.type) {
      case "Let":
        analyzeExpression(node.value, scope);
        scope.variables.get(node.name).initialized = true;
        break;
      case "Assignment": {
        const binding = resolveVariable(scope, node.name);
        if (!binding) {
          throw semanticError(
            `Assignment to undeclared variable: ${node.name}. Use 'let ${node.name} = ...' first`,
            node,
            "ANALYZE_UNDECLARED_ASSIGNMENT",
          );
        }
        if (!binding.initialized) {
          throw semanticError(
            `Variable '${node.name}' is used before its declaration`,
            node,
            "ANALYZE_VARIABLE_BEFORE_DECLARATION",
          );
        }
        analyzeExpression(node.value, scope);
        break;
      }
      case "IndexAssignment":
        analyzeExpression(node.array, scope);
        analyzeExpression(node.index, scope);
        analyzeExpression(node.value, scope);
        break;
      case "Print":
        node.args.forEach((argument) => analyzeExpression(argument, scope));
        break;
      case "If":
        analyzeExpression(node.cond, scope);
        analyzeBlock(node.then.body, scope, context);
        if (node.else?.type === "If") {
          analyzeStatement(node.else, scope, context);
        } else if (node.else) {
          analyzeBlock(node.else.body, scope, context);
        }
        break;
      case "While":
        analyzeExpression(node.cond, scope);
        analyzeBlock(node.body.body, scope, {
          ...context,
          loopDepth: context.loopDepth + 1,
        });
        break;
      case "ExprStmt":
        analyzeExpression(node.expr, scope);
        break;
      case "Return":
        if (context.functionDepth === 0) {
          throw semanticError(
            "'return' outside of a function",
            node,
            "ANALYZE_RETURN_CONTEXT",
          );
        }
        if (node.value) analyzeExpression(node.value, scope);
        break;
      case "Break":
      case "Continue":
        if (context.loopDepth === 0) {
          throw semanticError(
            `'${node.type.toLowerCase()}' outside of a loop`,
            node,
            `ANALYZE_${node.type.toUpperCase()}_CONTEXT`,
          );
        }
        break;
      case "Block":
        analyzeBlock(node.body, scope, context);
        break;
      case "FnDecl":
        analyzeBlock(
          node.body.body,
          scope,
          {
            functionDepth: context.functionDepth + 1,
            loopDepth: 0,
          },
          node.params,
        );
        break;
      default:
        throw semanticError(
          `Unknown statement type: ${node.type}`,
          node,
          "ANALYZE_STATEMENT",
        );
    }
  }

  function analyzeExpression(node, scope) {
    switch (node.type) {
      case "Number":
      case "String":
      case "Boolean":
        break;
      case "Identifier": {
        const binding = resolveVariable(scope, node.name);
        if (!binding) {
          throw semanticError(
            `Undefined variable: ${node.name}`,
            node,
            "ANALYZE_UNDEFINED_VARIABLE",
          );
        }
        if (!binding.initialized) {
          throw semanticError(
            `Variable '${node.name}' is used before its declaration`,
            node,
            "ANALYZE_VARIABLE_BEFORE_DECLARATION",
          );
        }
        break;
      }
      case "ArrayLiteral":
        node.elements.forEach((element) => analyzeExpression(element, scope));
        break;
      case "Index":
        analyzeExpression(node.array, scope);
        analyzeExpression(node.index, scope);
        break;
      case "BinOp":
        analyzeExpression(node.left, scope);
        analyzeExpression(node.right, scope);
        break;
      case "UnaryOp":
        analyzeExpression(node.expr, scope);
        break;
      case "Call": {
        node.args.forEach((argument) => analyzeExpression(argument, scope));
        summary.calls += 1;
        const builtin = getBuiltin(node.name);
        const declaration = builtin ?? resolveFunction(scope, node.name);
        if (!declaration) {
          throw semanticError(
            `Undefined function: ${node.name}`,
            node,
            "ANALYZE_UNDEFINED_FUNCTION",
          );
        }
        const expected = builtin ? builtin.arity : declaration.arity;
        if (node.args.length !== expected) {
          throw semanticError(
            `Expected ${expected} argument(s) but got ${node.args.length}; function '${node.name}' expects ${expected} argument(s)`,
            node,
            "ANALYZE_ARITY",
          );
        }
        break;
      }
      default:
        throw semanticError(
          `Unknown expression type: ${node.type}`,
          node,
          "ANALYZE_EXPRESSION",
        );
    }
  }

  analyzeBlock(ast.body, null, { functionDepth: 0, loopDepth: 0 });
  return summary;
}
