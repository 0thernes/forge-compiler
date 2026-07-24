import { T, BUILTINS, COMPOUND_OPS, COMPOUND_TOKENS } from "./constants.js";

// ── PARSER → AST ──
export function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (type) => {
    const tok = tokens[pos];
    if (tok.type !== type) throw new Error(`Expected ${type}, got ${tok.type} ('${tok.value}') at line ${tok.pos.line}:${tok.pos.col}`);
    return tokens[pos++];
  };
  const match = (type) => { if (tokens[pos].type === type) return tokens[pos++]; return null; };

  function program() {
    const body = [];
    while (peek().type !== T.EOF) body.push(statement());
    return { type: "Program", body };
  }
  function statement() {
    if (peek().type === T.LET) return letStmt();
    if (peek().type === T.PRINT) return printStmt();
    if (peek().type === T.IF) return ifStmt();
    if (peek().type === T.WHILE) return whileStmt();
    if (peek().type === T.FN) return fnDecl();
    if (peek().type === T.RETURN) return returnStmt();
    if (peek().type === T.BREAK) return breakStmt();
    if (peek().type === T.CONTINUE) return continueStmt();
    if (peek().type === T.LBRACE) return block();
    const stmtPos = peek().pos;
    const expr = expression();
    // [F1 v13] Unified assignment-target handling: Identifier and Index are lvalues.
    // Anything else followed by '=' gets a real diagnostic instead of "Expected ;".
    const nextT = peek().type;
    if (nextT === T.ASSIGN || COMPOUND_TOKENS.includes(nextT)) {
      const isCompound = nextT !== T.ASSIGN;
      const op = isCompound ? COMPOUND_OPS[tokens[pos].value] : null;
      pos++; // consume '=' or compound token
      const val = expression(); eat(T.SEMI);
      if (expr.type === "Identifier") {
        const value = isCompound
          ? { type: "BinOp", op, left: { type: "Identifier", name: expr.name }, right: val }
          : val;
        return { type: "Assignment", name: expr.name, value };
      }
      if (expr.type === "Index") {
        // Compound index assignment keeps op so codegen can single-evaluate array+index via DUP2
        return { type: "IndexAssignment", array: expr.array, index: expr.index, value: val, op };
      }
      throw new Error(`Invalid assignment target at line ${stmtPos.line}:${stmtPos.col}`);
    }
    eat(T.SEMI);
    return { type: "ExprStmt", expr };
  }
  function letStmt() {
    eat(T.LET); const name = eat(T.IDENT).value; eat(T.ASSIGN);
    const value = expression(); eat(T.SEMI);
    return { type: "Let", name, value };
  }
  function printStmt() {
    eat(T.PRINT); eat(T.LPAREN);
    const args = [];
    if (peek().type !== T.RPAREN) {
      args.push(expression());
      while (match(T.COMMA)) args.push(expression());
    }
    eat(T.RPAREN); eat(T.SEMI);
    return { type: "Print", args };
  }
  function ifStmt() {
    eat(T.IF); eat(T.LPAREN); const cond = expression(); eat(T.RPAREN);
    const then = block();
    let els = null;
    if (match(T.ELSE)) els = peek().type === T.IF ? ifStmt() : block();
    return { type: "If", cond, then, else: els };
  }
  function whileStmt() {
    eat(T.WHILE); eat(T.LPAREN); const cond = expression(); eat(T.RPAREN);
    return { type: "While", cond, body: block() };
  }
  function fnDecl() {
    eat(T.FN);
    const nameTok = eat(T.IDENT);
    if (BUILTINS[nameTok.value]) throw new Error(`Cannot redefine built-in function '${nameTok.value}' at line ${nameTok.pos.line}:${nameTok.pos.col}`);
    eat(T.LPAREN);
    const params = [];
    const seen = new Set();
    if (peek().type !== T.RPAREN) {
      const p = eat(T.IDENT);
      if (seen.has(p.value)) throw new Error(`Duplicate parameter '${p.value}' in function '${nameTok.value}' at line ${p.pos.line}:${p.pos.col}`);
      seen.add(p.value);
      params.push(p.value);
      while (match(T.COMMA)) {
        const p2 = eat(T.IDENT);
        if (seen.has(p2.value)) throw new Error(`Duplicate parameter '${p2.value}' in function '${nameTok.value}' at line ${p2.pos.line}:${p2.pos.col}`);
        seen.add(p2.value);
        params.push(p2.value);
      }
    }
    eat(T.RPAREN);
    return { type: "FnDecl", name: nameTok.value, params, body: block() };
  }
  function returnStmt() { eat(T.RETURN); const value = peek().type !== T.SEMI ? expression() : null; eat(T.SEMI); return { type: "Return", value }; }
  function breakStmt() { eat(T.BREAK); eat(T.SEMI); return { type: "Break" }; }
  function continueStmt() { eat(T.CONTINUE); eat(T.SEMI); return { type: "Continue" }; }
  function block() { eat(T.LBRACE); const body = []; while (peek().type !== T.RBRACE) body.push(statement()); eat(T.RBRACE); return { type: "Block", body }; }

  function expression() { return or_expr(); }
  function or_expr() { let l = and_expr(); while (match(T.OR)) l = { type: "BinOp", op: "||", left: l, right: and_expr() }; return l; }
  function and_expr() { let l = equality(); while (match(T.AND)) l = { type: "BinOp", op: "&&", left: l, right: equality() }; return l; }
  function equality() {
    let l = comparison();
    while (true) { if (match(T.EQ)) l = { type: "BinOp", op: "==", left: l, right: comparison() }; else if (match(T.NEQ)) l = { type: "BinOp", op: "!=", left: l, right: comparison() }; else break; }
    return l;
  }
  function comparison() {
    let l = additive();
    while (true) { if (match(T.LT)) l = { type: "BinOp", op: "<", left: l, right: additive() }; else if (match(T.GT)) l = { type: "BinOp", op: ">", left: l, right: additive() }; else if (match(T.LTE)) l = { type: "BinOp", op: "<=", left: l, right: additive() }; else if (match(T.GTE)) l = { type: "BinOp", op: ">=", left: l, right: additive() }; else break; }
    return l;
  }
  function additive() {
    let l = multiplicative();
    while (true) { if (match(T.PLUS)) l = { type: "BinOp", op: "+", left: l, right: multiplicative() }; else if (match(T.MINUS)) l = { type: "BinOp", op: "-", left: l, right: multiplicative() }; else break; }
    return l;
  }
  function multiplicative() {
    let l = unary();
    while (true) { if (match(T.STAR)) l = { type: "BinOp", op: "*", left: l, right: unary() }; else if (match(T.SLASH)) l = { type: "BinOp", op: "/", left: l, right: unary() }; else if (match(T.MOD)) l = { type: "BinOp", op: "%", left: l, right: unary() }; else break; }
    return l;
  }
  function unary() {
    if (match(T.MINUS)) return { type: "UnaryOp", op: "-", expr: unary() };
    if (match(T.NOT)) return { type: "UnaryOp", op: "!", expr: unary() };
    return call();
  }
  // [F1 v13] Postfix chain: one call form (fns are labels, not values), then
  // unlimited indexing — a[0], a[i][j], f(x)[0], [1,2,3][1] all parse.
  function call() {
    let expr = primary();
    if (expr.type === "Identifier" && peek().type === T.LPAREN) {
      eat(T.LPAREN);
      const args = [];
      if (peek().type !== T.RPAREN) { args.push(expression()); while (match(T.COMMA)) args.push(expression()); }
      eat(T.RPAREN);
      expr = { type: "Call", name: expr.name, args };
    }
    while (peek().type === T.LBRACKET) {
      eat(T.LBRACKET);
      const index = expression();
      eat(T.RBRACKET);
      expr = { type: "Index", array: expr, index };
    }
    return expr;
  }
  function primary() {
    if (peek().type === T.NUM) return { type: "Number", value: eat(T.NUM).value };
    if (peek().type === T.STR) return { type: "String", value: eat(T.STR).value };
    if (peek().type === T.TRUE) { eat(T.TRUE); return { type: "Boolean", value: true }; }
    if (peek().type === T.FALSE) { eat(T.FALSE); return { type: "Boolean", value: false }; }
    if (peek().type === T.IDENT) return { type: "Identifier", name: eat(T.IDENT).value };
    // [F1 v13] Array literal: [expr, expr, ...] or []
    if (peek().type === T.LBRACKET) {
      eat(T.LBRACKET);
      const elements = [];
      if (peek().type !== T.RBRACKET) {
        elements.push(expression());
        while (match(T.COMMA)) elements.push(expression());
      }
      eat(T.RBRACKET);
      return { type: "ArrayLiteral", elements };
    }
    if (match(T.LPAREN)) { const e = expression(); eat(T.RPAREN); return e; }
    throw new Error(`Unexpected token ${peek().type} at line ${peek().pos.line}:${peek().pos.col}`);
  }
  return program();
}
