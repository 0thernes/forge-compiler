import {
  BINARY_OPCODE,
  ENTRY_LABEL,
  INTERNAL_LABEL_PREFIX,
  getBuiltin,
  mergeLimits,
} from "./constants.js";
import { ForgeError, atPosition } from "./errors.js";

function codegenError(message, node, code = "CODEGEN_ERROR") {
  return new ForgeError(atPosition(message, node?.position), {
    phase: "codegen",
    position: node?.position ?? null,
    code,
  });
}

export function codegen(ast, limitOverrides = {}) {
  const limits = mergeLimits(limitOverrides);
  const instructions = [];
  const pendingFunctions = [];
  const queuedFunctions = new WeakSet();
  const functionLabels = new WeakMap();
  let generatedLabelId = 0;
  let functionId = 0;
  let blockDepth = 0;
  const loopStack = [];
  let functionNameScopes = [new Map()];

  function emit(opcode, argument) {
    if (instructions.length >= limits.maxInstructions) {
      throw new ForgeError(
        `Generated instruction count exceeds the ${limits.maxInstructions} instruction limit`,
        { phase: "codegen", code: "CODEGEN_INSTRUCTION_LIMIT" },
      );
    }
    instructions.push(
      argument === undefined
        ? { opcode, op: opcode }
        : { opcode, op: opcode, argument, arg: argument },
    );
  }

  function generatedLabel(prefix) {
    const label = `${INTERNAL_LABEL_PREFIX}label:${prefix}:${generatedLabelId}`;
    generatedLabelId += 1;
    return label;
  }

  function newFunctionLabel(name) {
    const label = `${INTERNAL_LABEL_PREFIX}function:${functionId}:${name}`;
    functionId += 1;
    return label;
  }

  function snapshotFunctionScopes() {
    return functionNameScopes.map((scope) => new Map(scope));
  }

  function resolveFunction(name) {
    for (let index = functionNameScopes.length - 1; index >= 0; index -= 1) {
      const label = functionNameScopes[index].get(name);
      if (label) return label;
    }
    return name;
  }

  function predeclareFunctions(body) {
    const scope = functionNameScopes.at(-1);
    for (const node of body) {
      if (node.type !== "FnDecl") continue;
      if (scope.has(node.name)) {
        throw codegenError(
          `Function '${node.name}' is already declared in this scope`,
          { position: node.namePosition },
          "CODEGEN_DUPLICATE_FUNCTION",
        );
      }
      const label = newFunctionLabel(node.name);
      scope.set(node.name, label);
      functionLabels.set(node, label);
    }
  }

  function queueFunctions(body) {
    const scopeSnapshot = snapshotFunctionScopes();
    for (const node of body) {
      if (node.type !== "FnDecl" || queuedFunctions.has(node)) {
        continue;
      }
      queuedFunctions.add(node);
      pendingFunctions.push({
        node,
        label: functionLabels.get(node),
        scopeSnapshot,
      });
    }
  }

  function emitFunctionBindings(body) {
    for (const node of body) {
      if (node.type === "FnDecl") {
        emit("BIND_FUNCTION", functionLabels.get(node));
      }
    }
  }

  function generateBlockContents(body) {
    predeclareFunctions(body);
    emitFunctionBindings(body);
    queueFunctions(body);
    for (const node of body) {
      if (node.type !== "FnDecl") generateStatement(node);
    }
  }

  function generateScopedBlock(node) {
    emit("ENTER_SCOPE");
    blockDepth += 1;
    functionNameScopes.push(new Map());
    generateBlockContents(node.body);
    functionNameScopes.pop();
    blockDepth -= 1;
    emit("EXIT_SCOPE");
  }

  function generateStatement(node) {
    switch (node.type) {
      case "Let":
        generateExpression(node.value);
        emit("DECLARE", node.name);
        break;
      case "Assignment":
        generateExpression(node.value);
        emit("STORE", node.name);
        break;
      case "IndexAssignment":
        generateExpression(node.array);
        generateExpression(node.index);
        if (node.op) {
          emit("DUPLICATE_PAIR");
          emit("INDEX_GET");
          generateExpression(node.value);
          emit(BINARY_OPCODE.get(node.op));
        } else {
          generateExpression(node.value);
        }
        emit("INDEX_SET");
        break;
      case "Print":
        node.args.forEach((argument) => {
          generateExpression(argument);
          emit("PRINT");
        });
        emit("PRINT_LINE");
        break;
      case "If": {
        const alternateLabel = generatedLabel("else");
        const endLabel = generatedLabel("endif");
        generateExpression(node.cond);
        emit("JUMP_IF_ZERO", node.else ? alternateLabel : endLabel);
        generateScopedBlock(node.then);
        if (node.else) {
          emit("JUMP", endLabel);
          emit("LABEL", alternateLabel);
          if (node.else.type === "If") {
            generateStatement(node.else);
          } else {
            generateScopedBlock(node.else);
          }
        }
        emit("LABEL", endLabel);
        break;
      }
      case "While": {
        const startLabel = generatedLabel("while");
        const endLabel = generatedLabel("endwhile");
        const loopDepth = blockDepth;
        loopStack.push({ startLabel, endLabel, depth: loopDepth });
        emit("LABEL", startLabel);
        generateExpression(node.cond);
        emit("JUMP_IF_ZERO", endLabel);
        generateScopedBlock(node.body);
        emit("JUMP", startLabel);
        emit("LABEL", endLabel);
        loopStack.pop();
        break;
      }
      case "ExprStmt":
        generateExpression(node.expr);
        emit("POP");
        break;
      case "Return":
        if (node.value) generateExpression(node.value);
        else emit("PUSH", 0);
        for (let depth = 0; depth < blockDepth; depth += 1) {
          emit("EXIT_SCOPE");
        }
        emit("EXIT_SCOPE");
        emit("RETURN");
        break;
      case "Break": {
        const loop = loopStack.at(-1);
        if (!loop) {
          throw codegenError(
            "'break' outside of a loop",
            node,
            "CODEGEN_BREAK_CONTEXT",
          );
        }
        for (let depth = blockDepth; depth > loop.depth; depth -= 1) {
          emit("EXIT_SCOPE");
        }
        emit("JUMP", loop.endLabel);
        break;
      }
      case "Continue": {
        const loop = loopStack.at(-1);
        if (!loop) {
          throw codegenError(
            "'continue' outside of a loop",
            node,
            "CODEGEN_CONTINUE_CONTEXT",
          );
        }
        for (let depth = blockDepth; depth > loop.depth; depth -= 1) {
          emit("EXIT_SCOPE");
        }
        emit("JUMP", loop.startLabel);
        break;
      }
      case "Block":
        generateScopedBlock(node);
        break;
      default:
        throw codegenError(
          `Unknown statement type: ${node.type}`,
          node,
          "CODEGEN_STATEMENT",
        );
    }
  }

  function generateExpression(node) {
    switch (node.type) {
      case "Number":
        emit("PUSH", node.value);
        break;
      case "String":
        emit("PUSH_STRING", node.value);
        break;
      case "Boolean":
        emit("PUSH", node.value ? 1 : 0);
        break;
      case "Identifier":
        emit("LOAD", node.name);
        break;
      case "ArrayLiteral":
        node.elements.forEach(generateExpression);
        emit("MAKE_ARRAY", node.elements.length);
        break;
      case "Index":
        generateExpression(node.array);
        generateExpression(node.index);
        emit("INDEX_GET");
        break;
      case "BinOp":
        if (node.op === "&&") {
          const falseLabel = generatedLabel("and_false");
          const endLabel = generatedLabel("and_end");
          generateExpression(node.left);
          emit("JUMP_IF_ZERO", falseLabel);
          generateExpression(node.right);
          emit("JUMP_IF_ZERO", falseLabel);
          emit("PUSH", 1);
          emit("JUMP", endLabel);
          emit("LABEL", falseLabel);
          emit("PUSH", 0);
          emit("LABEL", endLabel);
        } else if (node.op === "||") {
          const trueLabel = generatedLabel("or_true");
          const endLabel = generatedLabel("or_end");
          generateExpression(node.left);
          emit("JUMP_IF_NONZERO", trueLabel);
          generateExpression(node.right);
          emit("JUMP_IF_NONZERO", trueLabel);
          emit("PUSH", 0);
          emit("JUMP", endLabel);
          emit("LABEL", trueLabel);
          emit("PUSH", 1);
          emit("LABEL", endLabel);
        } else {
          generateExpression(node.left);
          generateExpression(node.right);
          emit(BINARY_OPCODE.get(node.op));
        }
        break;
      case "UnaryOp":
        generateExpression(node.expr);
        emit(node.op === "-" ? "NEGATE" : "NOT");
        break;
      case "Call": {
        const builtin = getBuiltin(node.name);
        node.args.forEach(generateExpression);
        if (builtin) {
          emit(builtin.opcode);
        } else {
          emit("ARGUMENT_COUNT", node.args.length);
          emit("CALL", resolveFunction(node.name));
        }
        break;
      }
      default:
        throw codegenError(
          `Unknown expression type: ${node.type}`,
          node,
          "CODEGEN_EXPRESSION",
        );
    }
  }

  function generateFunction({ node, label, scopeSnapshot }) {
    const savedScopes = functionNameScopes;
    const savedBlockDepth = blockDepth;
    const savedLoops = [...loopStack];
    functionNameScopes = scopeSnapshot.map((scope) => new Map(scope));
    functionNameScopes.push(new Map());
    blockDepth = 0;
    loopStack.length = 0;

    emit("LABEL", label);
    emit("ENTER_SCOPE");
    emit("CHECK_ARGUMENT_COUNT", node.params.length);
    for (let index = node.params.length - 1; index >= 0; index -= 1) {
      emit("STORE_LOCAL", node.params[index]);
    }
    generateBlockContents(node.body.body);
    emit("EXIT_SCOPE");
    emit("PUSH", 0);
    emit("RETURN");

    functionNameScopes = savedScopes;
    blockDepth = savedBlockDepth;
    loopStack.length = 0;
    loopStack.push(...savedLoops);
  }

  emit("LABEL", ENTRY_LABEL);
  generateBlockContents(ast.body);
  emit("HALT");
  while (pendingFunctions.length > 0) {
    generateFunction(pendingFunctions.shift());
  }
  return instructions;
}

export function link(instructions) {
  const labels = new Map();
  const code = [];

  for (const instruction of instructions) {
    const opcode = instruction.opcode ?? instruction.op;
    const argument = instruction.argument ?? instruction.arg;
    if (opcode === "LABEL") {
      if (labels.has(argument)) {
        throw new ForgeError(`Duplicate label: ${argument}`, {
          phase: "link",
          code: "LINK_DUPLICATE_LABEL",
        });
      }
      labels.set(argument, code.length);
    } else {
      code.push(
        argument === undefined
          ? { ...instruction, opcode, op: opcode }
          : {
              ...instruction,
              opcode,
              op: opcode,
              argument,
              arg: argument,
            },
      );
    }
  }

  return code.map((instruction) => {
    if (
      instruction.opcode !== "JUMP" &&
      instruction.opcode !== "JUMP_IF_ZERO" &&
      instruction.opcode !== "JUMP_IF_NONZERO" &&
      instruction.opcode !== "CALL"
    ) {
      return instruction;
    }
    const target = labels.get(instruction.argument);
    if (target === undefined) {
      const message =
        instruction.opcode === "CALL"
          ? `Undefined function: ${instruction.argument}`
          : `Internal link error: unresolved label '${instruction.argument}'`;
      throw new ForgeError(message, {
        phase: "link",
        code:
          instruction.opcode === "CALL"
            ? "LINK_UNDEFINED_FUNCTION"
            : "LINK_UNRESOLVED_LABEL",
      });
    }
    return { ...instruction, target };
  });
}

export function computeInstructionAddresses(instructions) {
  const addresses = [];
  let programCounter = 0;
  for (const instruction of instructions) {
    if (instruction.opcode === "LABEL") {
      addresses.push(null);
    } else {
      addresses.push(programCounter);
      programCounter += 1;
    }
  }
  return addresses;
}
