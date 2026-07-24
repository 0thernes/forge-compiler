import { BINOP_MAP, ENTRY_LABEL, BUILTINS } from "./constants.js";

// ── CODE GENERATOR → Stack ASM ──
export function codegen(ast) {
  const asm = [];
  const pendingFns = [];
  let labelCount = 0;
  const label = (prefix) => `${prefix}_${labelCount++}`;
  let fnId = 0;
  const fnNameScopes = [{}];
  function pushFnNameScope() { fnNameScopes.push({}); }
  function popFnNameScope() { fnNameScopes.pop(); }
  function registerFn(name, nested) {
    const current = fnNameScopes[fnNameScopes.length - 1];
    if (current[name]) return current[name];
    const mangled = nested ? `${name}$$${fnId++}` : name;
    current[name] = mangled;
    return mangled;
  }
  function resolveFn(name) { for (let i = fnNameScopes.length - 1; i >= 0; i--) { if (fnNameScopes[i][name]) return fnNameScopes[i][name]; } return name; }
  function snapshotFnScopes() { return fnNameScopes.map(s => ({ ...s })); }
  function restoreFnScopes(snapshot) { fnNameScopes.length = 0; snapshot.forEach(s => fnNameScopes.push(s)); }

  let blockDepth = 0;
  const loopStack = [];

  function emit(op, arg) { if (arg !== undefined) asm.push({ op, arg }); else asm.push({ op }); }

  function genNode(node) {
    if (node.type === "Program") {
      node.body.forEach(n => { if (n.type === "FnDecl") registerFn(n.name, false); });
      emit("CALL", ENTRY_LABEL); emit("HALT");
      // [FIX v13 #7] Top-level code runs directly in the VM's base (global)
      // frame — no ENTER_SCOPE/EXIT_SCOPE pair around the entry. The old pair
      // popped the entry frame before HALT, so top-level variables never
      // survived into the final-state report (FINAL STATE was always empty).
      // Top-level `return` stays safe: EXIT_SCOPE never pops the base frame.
      emit("LABEL", ENTRY_LABEL);
      const saved = blockDepth; blockDepth = 0;
      node.body.forEach(n => { if (n.type !== "FnDecl") genStmt(n); });
      blockDepth = saved;
      emit("PUSH", 0); emit("RET");
      node.body.forEach(n => { if (n.type === "FnDecl") genFn(n); });
      while (pendingFns.length > 0) genFn(pendingFns.shift());
    }
  }

  function genFn(node) {
    const fnLabel = node._mangledName || node.name;
    const savedBD = blockDepth, savedLS = [...loopStack];
    loopStack.length = 0; blockDepth = 0;
    const savedScopes = snapshotFnScopes();
    if (node._fnScopeSnapshot) restoreFnScopes(node._fnScopeSnapshot);
    pushFnNameScope();
    emit("LABEL", fnLabel); emit("ENTER_SCOPE"); emit("CHECK_ARGC", node.params.length);
    for (let i = node.params.length - 1; i >= 0; i--) emit("STORE_LOCAL", node.params[i]);
    genBlock(node.body);
    emit("EXIT_SCOPE"); emit("PUSH", 0); emit("RET");
    popFnNameScope(); restoreFnScopes(savedScopes);
    blockDepth = savedBD; loopStack.length = 0; savedLS.forEach(l => loopStack.push(l));
  }

  function genBlock(node) {
    node.body.forEach(n => { if (n.type === "FnDecl") registerFn(n.name, true); });
    node.body.forEach(genStmt);
  }
  function genScopedBlock(node) {
    emit("ENTER_SCOPE"); blockDepth++; pushFnNameScope();
    genBlock(node);
    popFnNameScope(); blockDepth--; emit("EXIT_SCOPE");
  }

  function genStmt(node) {
    switch (node.type) {
      case "Let": genExpr(node.value); emit("DECL_STORE", node.name); break;
      case "Assignment": genExpr(node.value); emit("STORE", node.name); break;
      // [F1 v13] Index assignment. Plain: arr idx val INDEX_SET.
      // Compound: DUP2 keeps arr+idx on the stack so both are evaluated exactly ONCE —
      // a[f()] += 1 calls f a single time, matching C lvalue semantics.
      case "IndexAssignment": {
        genExpr(node.array);
        genExpr(node.index);
        if (node.op) {
          emit("DUP2");
          emit("INDEX_GET");
          genExpr(node.value);
          emit(BINOP_MAP[node.op]);
        } else {
          genExpr(node.value);
        }
        emit("INDEX_SET");
        break;
      }
      case "Print": node.args.forEach(a => { genExpr(a); emit("PRINT"); }); emit("PRINTLN"); break;
      case "If": {
        const elseL = label("else"), endL = label("endif");
        genExpr(node.cond); emit("JZ", node.else ? elseL : endL);
        genScopedBlock(node.then);
        if (node.else) { emit("JMP", endL); emit("LABEL", elseL); if (node.else.type === "If") genStmt(node.else); else genScopedBlock(node.else); }
        emit("LABEL", endL); break;
      }
      case "While": {
        const startL = label("while"), endL = label("endwhile"), loopDepth = blockDepth;
        loopStack.push({ startLabel: startL, endLabel: endL, depth: loopDepth });
        emit("LABEL", startL); genExpr(node.cond); emit("JZ", endL);
        genScopedBlock(node.body); emit("JMP", startL); emit("LABEL", endL);
        loopStack.pop(); break;
      }
      case "ExprStmt": genExpr(node.expr); emit("POP"); break;
      case "Return":
        if (node.value) genExpr(node.value); else emit("PUSH", 0);
        for (let d = 0; d < blockDepth; d++) emit("EXIT_SCOPE");
        emit("EXIT_SCOPE"); emit("RET"); break;
      case "Break": {
        if (loopStack.length === 0) throw new Error("'break' outside of a loop");
        const loop = loopStack[loopStack.length - 1];
        for (let d = blockDepth; d > loop.depth; d--) emit("EXIT_SCOPE");
        emit("JMP", loop.endLabel); break;
      }
      case "Continue": {
        if (loopStack.length === 0) throw new Error("'continue' outside of a loop");
        const loop = loopStack[loopStack.length - 1];
        for (let d = blockDepth; d > loop.depth; d--) emit("EXIT_SCOPE");
        emit("JMP", loop.startLabel); break;
      }
      case "Block": genScopedBlock(node); break;
      case "FnDecl": {
        const mangled = registerFn(node.name, true);
        pendingFns.push({ ...node, _mangledName: mangled, _fnScopeSnapshot: snapshotFnScopes() }); break;
      }
      default: throw new Error(`Unknown statement type: ${node.type}`);
    }
  }

  function genExpr(node) {
    switch (node.type) {
      case "Number": emit("PUSH", node.value); break;
      case "String": emit("PUSH_STR", node.value); break;
      case "Boolean": emit("PUSH", node.value ? 1 : 0); break;
      case "Identifier": emit("LOAD", node.name); break;
      // [F1 v13] Array literal — elements left-to-right, then bundled
      case "ArrayLiteral":
        node.elements.forEach(e => genExpr(e));
        emit("MAKE_ARRAY", node.elements.length);
        break;
      // [F1 v13] Index read — works on arrays and strings
      case "Index":
        genExpr(node.array);
        genExpr(node.index);
        emit("INDEX_GET");
        break;
      case "BinOp":
        if (node.op === "&&") {
          const fL = label("and_f"), eL = label("and_e");
          genExpr(node.left); emit("JZ", fL); genExpr(node.right); emit("JZ", fL);
          emit("PUSH", 1); emit("JMP", eL); emit("LABEL", fL); emit("PUSH", 0); emit("LABEL", eL);
        } else if (node.op === "||") {
          const tL = label("or_t"), eL = label("or_e");
          genExpr(node.left); emit("JNZ", tL); genExpr(node.right); emit("JNZ", tL);
          emit("PUSH", 0); emit("JMP", eL); emit("LABEL", tL); emit("PUSH", 1); emit("LABEL", eL);
        } else { genExpr(node.left); genExpr(node.right); emit(BINOP_MAP[node.op] || node.op); }
        break;
      case "UnaryOp":
        genExpr(node.expr);
        if (node.op === "-") emit("NEG");
        if (node.op === "!") emit("NOT");
        break;
      case "Call": {
        const bi = BUILTINS[node.name];
        if (bi) {
          if (node.args.length !== bi.argc) throw new Error(`Built-in '${node.name}' expects ${bi.argc} argument(s), got ${node.args.length}`);
          node.args.forEach(a => genExpr(a));
          emit(bi.op);
        } else {
          node.args.forEach(a => genExpr(a));
          emit("ARGC", node.args.length);
          emit("CALL", resolveFn(node.name));
        }
        break;
      }
      default: throw new Error(`Unknown expression type: ${node.type}`);
    }
  }

  genNode(ast);
  return asm;
}
