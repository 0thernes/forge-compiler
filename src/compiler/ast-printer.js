import { escapeForDisplay } from "./format.js";

// ── AST PRETTY PRINTER ──
export function renderAST(node, indent = 0) {
  const pad = "  ".repeat(indent);
  if (!node || typeof node !== 'object') return `${pad}${JSON.stringify(node)}`;
  const lines = [];
  switch (node.type) {
    case "Program": lines.push(`${pad}Program`); node.body.forEach(n => lines.push(renderAST(n, indent + 1))); break;
    case "Let": lines.push(`${pad}Let ${node.name} =`); lines.push(renderAST(node.value, indent + 1)); break;
    case "Assignment": lines.push(`${pad}Assign ${node.name} =`); lines.push(renderAST(node.value, indent + 1)); break;
    case "IndexAssignment":
      lines.push(`${pad}IndexAssign${node.op ? ` [${node.op}=]` : ""}`);
      lines.push(`${pad}  array:`); lines.push(renderAST(node.array, indent + 2));
      lines.push(`${pad}  index:`); lines.push(renderAST(node.index, indent + 2));
      lines.push(`${pad}  value:`); lines.push(renderAST(node.value, indent + 2));
      break;
    case "Print": lines.push(`${pad}Print`); node.args.forEach(a => lines.push(renderAST(a, indent + 1))); break;
    case "If":
      lines.push(`${pad}If`); lines.push(`${pad}  cond:`); lines.push(renderAST(node.cond, indent + 2));
      lines.push(`${pad}  then:`); lines.push(renderAST(node.then, indent + 2));
      if (node.else) { lines.push(`${pad}  else:`); lines.push(renderAST(node.else, indent + 2)); } break;
    case "While":
      lines.push(`${pad}While`); lines.push(`${pad}  cond:`); lines.push(renderAST(node.cond, indent + 2));
      lines.push(`${pad}  body:`); lines.push(renderAST(node.body, indent + 2)); break;
    case "FnDecl": lines.push(`${pad}FnDecl ${node.name}(${node.params.join(", ")})`); lines.push(renderAST(node.body, indent + 1)); break;
    case "Return": lines.push(`${pad}Return`); if (node.value) lines.push(renderAST(node.value, indent + 1)); break;
    case "Break": lines.push(`${pad}Break`); break;
    case "Continue": lines.push(`${pad}Continue`); break;
    case "Block": lines.push(`${pad}Block`); node.body.forEach(n => lines.push(renderAST(n, indent + 1))); break;
    case "BinOp": lines.push(`${pad}BinOp [${node.op}]`); lines.push(renderAST(node.left, indent + 1)); lines.push(renderAST(node.right, indent + 1)); break;
    case "UnaryOp": lines.push(`${pad}Unary [${node.op}]`); lines.push(renderAST(node.expr, indent + 1)); break;
    case "Call": lines.push(`${pad}Call ${node.name}`); node.args.forEach(a => lines.push(renderAST(a, indent + 1))); break;
    case "ArrayLiteral": lines.push(`${pad}Array[${node.elements.length}]`); node.elements.forEach(e => lines.push(renderAST(e, indent + 1))); break;
    case "Index":
      lines.push(`${pad}Index`);
      lines.push(renderAST(node.array, indent + 1));
      lines.push(renderAST(node.index, indent + 1));
      break;
    case "Number": lines.push(`${pad}Num(${node.value})`); break;
    case "String": lines.push(`${pad}Str("${escapeForDisplay(node.value)}")`); break;
    case "Boolean": lines.push(`${pad}Bool(${node.value})`); break;
    case "Identifier": lines.push(`${pad}Ident(${node.name})`); break;
    case "ExprStmt": lines.push(`${pad}ExprStmt`); lines.push(renderAST(node.expr, indent + 1)); break;
    default: lines.push(`${pad}${JSON.stringify(node)}`);
  }
  return lines.join("\n");
}

export function computeAsmPCs(asm) {
  const pcs = []; let realPC = 0;
  for (const inst of asm) { if (inst.op === "LABEL") pcs.push(null); else { pcs.push(realPC); realPC++; } }
  return pcs;
}
