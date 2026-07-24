import { escapeForDisplay } from "./format.js";

export function renderAst(node, indentation = 0) {
  const pad = "  ".repeat(indentation);
  if (!node || typeof node !== "object") {
    return `${pad}${JSON.stringify(node)}`;
  }

  const lines = [];
  switch (node.type) {
    case "Program":
      lines.push(`${pad}Program`);
      node.body.forEach((child) =>
        lines.push(renderAst(child, indentation + 1)),
      );
      break;
    case "Let":
      lines.push(`${pad}Let ${node.name} =`);
      lines.push(renderAst(node.value, indentation + 1));
      break;
    case "Assignment":
      lines.push(`${pad}Assign ${node.name} =`);
      lines.push(renderAst(node.value, indentation + 1));
      break;
    case "IndexAssignment":
      lines.push(`${pad}IndexAssign${node.op ? ` [${node.op}=]` : ""}`);
      lines.push(`${pad}  array:`);
      lines.push(renderAst(node.array, indentation + 2));
      lines.push(`${pad}  index:`);
      lines.push(renderAst(node.index, indentation + 2));
      lines.push(`${pad}  value:`);
      lines.push(renderAst(node.value, indentation + 2));
      break;
    case "Print":
      lines.push(`${pad}Print`);
      node.args.forEach((argument) =>
        lines.push(renderAst(argument, indentation + 1)),
      );
      break;
    case "If":
      lines.push(`${pad}If`);
      lines.push(`${pad}  condition:`);
      lines.push(renderAst(node.cond, indentation + 2));
      lines.push(`${pad}  then:`);
      lines.push(renderAst(node.then, indentation + 2));
      if (node.else) {
        lines.push(`${pad}  else:`);
        lines.push(renderAst(node.else, indentation + 2));
      }
      break;
    case "While":
      lines.push(`${pad}While`);
      lines.push(`${pad}  condition:`);
      lines.push(renderAst(node.cond, indentation + 2));
      lines.push(`${pad}  body:`);
      lines.push(renderAst(node.body, indentation + 2));
      break;
    case "FnDecl":
      lines.push(`${pad}Function ${node.name}(${node.params.join(", ")})`);
      lines.push(renderAst(node.body, indentation + 1));
      break;
    case "Return":
      lines.push(`${pad}Return`);
      if (node.value) lines.push(renderAst(node.value, indentation + 1));
      break;
    case "Break":
    case "Continue":
      lines.push(`${pad}${node.type}`);
      break;
    case "Block":
      lines.push(`${pad}Block`);
      node.body.forEach((child) =>
        lines.push(renderAst(child, indentation + 1)),
      );
      break;
    case "BinOp":
      lines.push(`${pad}Binary [${node.op}]`);
      lines.push(renderAst(node.left, indentation + 1));
      lines.push(renderAst(node.right, indentation + 1));
      break;
    case "UnaryOp":
      lines.push(`${pad}Unary [${node.op}]`);
      lines.push(renderAst(node.expr, indentation + 1));
      break;
    case "Call":
      lines.push(`${pad}Call ${node.name}`);
      node.args.forEach((argument) =>
        lines.push(renderAst(argument, indentation + 1)),
      );
      break;
    case "ArrayLiteral":
      lines.push(`${pad}Array[${node.elements.length}]`);
      node.elements.forEach((element) =>
        lines.push(renderAst(element, indentation + 1)),
      );
      break;
    case "Index":
      lines.push(`${pad}Index`);
      lines.push(renderAst(node.array, indentation + 1));
      lines.push(renderAst(node.index, indentation + 1));
      break;
    case "Number":
      lines.push(`${pad}Number(${node.value})`);
      break;
    case "String":
      lines.push(`${pad}String("${escapeForDisplay(node.value)}")`);
      break;
    case "Boolean":
      lines.push(`${pad}Boolean(${node.value})`);
      break;
    case "Identifier":
      lines.push(`${pad}Identifier(${node.name})`);
      break;
    case "ExprStmt":
      lines.push(`${pad}ExpressionStatement`);
      lines.push(renderAst(node.expr, indentation + 1));
      break;
    default:
      lines.push(`${pad}${JSON.stringify(node)}`);
  }
  return lines.join("\n");
}
