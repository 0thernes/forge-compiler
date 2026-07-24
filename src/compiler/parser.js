import {
  COMPOUND_OPERATOR,
  COMPOUND_TOKENS,
  TOKEN,
  isBuiltin,
  mergeLimits,
} from "./constants.js";
import { ForgeError, atPosition } from "./errors.js";

function parserError(message, token, code = "PARSE_UNEXPECTED_TOKEN") {
  const position = token?.position ?? null;
  return new ForgeError(atPosition(message, position), {
    phase: "parse",
    position,
    code,
  });
}

function located(node, position, hidden = {}) {
  Object.defineProperty(node, "position", {
    value: position,
    enumerable: false,
  });
  for (const [name, value] of Object.entries(hidden)) {
    Object.defineProperty(node, name, {
      value,
      enumerable: false,
    });
  }
  return node;
}

function validateAstDepth(ast, maxDepth) {
  const pending = [{ node: ast, depth: 0 }];

  while (pending.length > 0) {
    const { node, depth } = pending.pop();
    if (!node || typeof node !== "object") continue;
    if (depth > maxDepth) {
      throw parserError(
        `Parser nesting exceeds the ${maxDepth} level limit`,
        node,
        "PARSE_NESTING_LIMIT",
      );
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (let index = value.length - 1; index >= 0; index -= 1) {
          if (value[index] && typeof value[index] === "object") {
            pending.push({ node: value[index], depth: depth + 1 });
          }
        }
      } else if (value && typeof value === "object") {
        pending.push({ node: value, depth: depth + 1 });
      }
    }
  }
}

class Parser {
  constructor(tokens, limitOverrides) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
      throw new ForgeError("Parser requires a non-empty token array", {
        phase: "parse",
        code: "PARSE_INPUT",
      });
    }
    this.tokens = tokens;
    this.position = 0;
    this.functionDepth = 0;
    this.nesting = 0;
    this.limits = mergeLimits(limitOverrides);
  }

  current() {
    return this.tokens[this.position] ?? this.tokens.at(-1);
  }

  consume(type) {
    const token = this.current();
    if (token.type !== type) {
      throw parserError(
        `Expected ${type}, got ${token.type} ('${token.value}')`,
        token,
      );
    }
    this.position += 1;
    return token;
  }

  match(type) {
    if (this.current().type !== type) return null;
    const token = this.current();
    this.position += 1;
    return token;
  }

  withNesting(token, callback) {
    this.nesting += 1;
    if (this.nesting > this.limits.maxParserNesting) {
      this.nesting -= 1;
      throw parserError(
        `Parser nesting exceeds the ${this.limits.maxParserNesting} level limit`,
        token,
        "PARSE_NESTING_LIMIT",
      );
    }
    try {
      return callback();
    } finally {
      this.nesting -= 1;
    }
  }

  program() {
    const body = [];
    while (this.current().type !== TOKEN.EOF) {
      body.push(this.statement());
    }
    return located(
      {
        type: "Program",
        body,
      },
      body[0]?.position ?? this.current().position,
    );
  }

  statement() {
    switch (this.current().type) {
      case TOKEN.LET:
        return this.letStatement();
      case TOKEN.PRINT:
        return this.printStatement();
      case TOKEN.IF:
        return this.ifStatement();
      case TOKEN.WHILE:
        return this.whileStatement();
      case TOKEN.FUNCTION:
        return this.functionDeclaration();
      case TOKEN.RETURN:
        return this.returnStatement();
      case TOKEN.BREAK:
        return this.simpleStatement("Break", TOKEN.BREAK);
      case TOKEN.CONTINUE:
        return this.simpleStatement("Continue", TOKEN.CONTINUE);
      case TOKEN.LEFT_BRACE:
        return this.block();
      default:
        return this.expressionStatement();
    }
  }

  expressionStatement() {
    const start = this.current();
    const expression = this.expression();
    const nextType = this.current().type;
    if (nextType === TOKEN.ASSIGN || COMPOUND_TOKENS.has(nextType)) {
      const operatorToken = this.current();
      this.position += 1;
      const value = this.expression();
      this.consume(TOKEN.SEMICOLON);
      const operator =
        nextType === TOKEN.ASSIGN
          ? null
          : COMPOUND_OPERATOR.get(operatorToken.value);

      if (expression.type === "Identifier") {
        return located(
          {
            type: "Assignment",
            name: expression.name,
            value: operator
              ? {
                  type: "BinOp",
                  op: operator,
                  left: {
                    type: "Identifier",
                    name: expression.name,
                  },
                  right: value,
                }
              : value,
          },
          start.position,
        );
      }
      if (expression.type === "Index") {
        return located(
          {
            type: "IndexAssignment",
            array: expression.array,
            index: expression.index,
            value,
            op: operator,
          },
          start.position,
        );
      }
      throw parserError(
        "Invalid assignment target",
        start,
        "PARSE_ASSIGNMENT_TARGET",
      );
    }

    this.consume(TOKEN.SEMICOLON);
    return located(
      {
        type: "ExprStmt",
        expr: expression,
      },
      start.position,
    );
  }

  letStatement() {
    const start = this.consume(TOKEN.LET);
    const name = this.consume(TOKEN.IDENTIFIER);
    this.consume(TOKEN.ASSIGN);
    const value = this.expression();
    this.consume(TOKEN.SEMICOLON);
    return located(
      {
        type: "Let",
        name: name.value,
        value,
      },
      start.position,
      { namePosition: name.position },
    );
  }

  printStatement() {
    const start = this.consume(TOKEN.PRINT);
    this.consume(TOKEN.LEFT_PAREN);
    const argumentsList = [];
    if (this.current().type !== TOKEN.RIGHT_PAREN) {
      argumentsList.push(this.expression());
      while (this.match(TOKEN.COMMA)) {
        argumentsList.push(this.expression());
      }
    }
    this.consume(TOKEN.RIGHT_PAREN);
    this.consume(TOKEN.SEMICOLON);
    return located(
      {
        type: "Print",
        args: argumentsList,
      },
      start.position,
    );
  }

  ifStatement() {
    const start = this.consume(TOKEN.IF);
    return this.withNesting(start, () => {
      this.consume(TOKEN.LEFT_PAREN);
      const condition = this.expression();
      this.consume(TOKEN.RIGHT_PAREN);
      const consequent = this.block();
      let alternate = null;
      if (this.match(TOKEN.ELSE)) {
        alternate =
          this.current().type === TOKEN.IF ? this.ifStatement() : this.block();
      }
      return located(
        {
          type: "If",
          cond: condition,
          then: consequent,
          else: alternate,
        },
        start.position,
      );
    });
  }

  whileStatement() {
    const start = this.consume(TOKEN.WHILE);
    this.consume(TOKEN.LEFT_PAREN);
    const condition = this.expression();
    this.consume(TOKEN.RIGHT_PAREN);
    return located(
      {
        type: "While",
        cond: condition,
        body: this.block(),
      },
      start.position,
    );
  }

  functionDeclaration() {
    const start = this.consume(TOKEN.FUNCTION);
    const name = this.consume(TOKEN.IDENTIFIER);
    if (isBuiltin(name.value)) {
      throw parserError(
        `Cannot redefine built-in function '${name.value}'`,
        name,
        "PARSE_BUILTIN_REDEFINITION",
      );
    }
    this.consume(TOKEN.LEFT_PAREN);
    const parameters = [];
    const seen = new Set();
    if (this.current().type !== TOKEN.RIGHT_PAREN) {
      do {
        const parameter = this.consume(TOKEN.IDENTIFIER);
        if (seen.has(parameter.value)) {
          throw parserError(
            `Duplicate parameter '${parameter.value}' in function '${name.value}'`,
            parameter,
            "PARSE_DUPLICATE_PARAMETER",
          );
        }
        seen.add(parameter.value);
        parameters.push(parameter.value);
      } while (this.match(TOKEN.COMMA));
    }
    this.consume(TOKEN.RIGHT_PAREN);

    this.functionDepth += 1;
    let body;
    try {
      body = this.block();
    } finally {
      this.functionDepth -= 1;
    }

    return located(
      {
        type: "FnDecl",
        name: name.value,
        params: parameters,
        body,
      },
      start.position,
      { namePosition: name.position },
    );
  }

  returnStatement() {
    const start = this.consume(TOKEN.RETURN);
    if (this.functionDepth === 0) {
      throw parserError(
        "'return' outside of a function",
        start,
        "PARSE_RETURN_CONTEXT",
      );
    }
    const value =
      this.current().type === TOKEN.SEMICOLON ? null : this.expression();
    this.consume(TOKEN.SEMICOLON);
    return located(
      {
        type: "Return",
        value,
      },
      start.position,
    );
  }

  simpleStatement(type, tokenType) {
    const start = this.consume(tokenType);
    this.consume(TOKEN.SEMICOLON);
    return located({ type }, start.position);
  }

  block() {
    const start = this.consume(TOKEN.LEFT_BRACE);
    return this.withNesting(start, () => {
      const body = [];
      while (
        this.current().type !== TOKEN.RIGHT_BRACE &&
        this.current().type !== TOKEN.EOF
      ) {
        body.push(this.statement());
      }
      if (this.current().type === TOKEN.EOF) {
        throw parserError(
          "Unterminated block; expected '}'",
          start,
          "PARSE_UNTERMINATED_BLOCK",
        );
      }
      this.consume(TOKEN.RIGHT_BRACE);
      return located({ type: "Block", body }, start.position);
    });
  }

  expression() {
    const start = this.current();
    return this.withNesting(start, () => this.orExpression());
  }

  orExpression() {
    let left = this.andExpression();
    while (this.match(TOKEN.OR)) {
      left = located(
        {
          type: "BinOp",
          op: "||",
          left,
          right: this.andExpression(),
        },
        left.position,
      );
    }
    return left;
  }

  andExpression() {
    let left = this.equalityExpression();
    while (this.match(TOKEN.AND)) {
      left = located(
        {
          type: "BinOp",
          op: "&&",
          left,
          right: this.equalityExpression(),
        },
        left.position,
      );
    }
    return left;
  }

  equalityExpression() {
    let left = this.comparisonExpression();
    while (
      this.current().type === TOKEN.EQUAL ||
      this.current().type === TOKEN.NOT_EQUAL
    ) {
      const operator = this.current().value;
      this.position += 1;
      left = located(
        {
          type: "BinOp",
          op: operator,
          left,
          right: this.comparisonExpression(),
        },
        left.position,
      );
    }
    return left;
  }

  comparisonExpression() {
    let left = this.additiveExpression();
    const comparisonTypes = new Set([
      TOKEN.LESS,
      TOKEN.GREATER,
      TOKEN.LESS_EQUAL,
      TOKEN.GREATER_EQUAL,
    ]);
    while (comparisonTypes.has(this.current().type)) {
      const operator = this.current().value;
      this.position += 1;
      left = located(
        {
          type: "BinOp",
          op: operator,
          left,
          right: this.additiveExpression(),
        },
        left.position,
      );
    }
    return left;
  }

  additiveExpression() {
    let left = this.multiplicativeExpression();
    while (
      this.current().type === TOKEN.PLUS ||
      this.current().type === TOKEN.MINUS
    ) {
      const operator = this.current().value;
      this.position += 1;
      left = located(
        {
          type: "BinOp",
          op: operator,
          left,
          right: this.multiplicativeExpression(),
        },
        left.position,
      );
    }
    return left;
  }

  multiplicativeExpression() {
    let left = this.unaryExpression();
    while (
      this.current().type === TOKEN.STAR ||
      this.current().type === TOKEN.SLASH ||
      this.current().type === TOKEN.MODULO
    ) {
      const operator = this.current().value;
      this.position += 1;
      left = located(
        {
          type: "BinOp",
          op: operator,
          left,
          right: this.unaryExpression(),
        },
        left.position,
      );
    }
    return left;
  }

  unaryExpression() {
    const operators = [];
    while (
      this.current().type === TOKEN.MINUS ||
      this.current().type === TOKEN.NOT
    ) {
      const token = this.current();
      this.position += 1;
      operators.push({
        op: token.type === TOKEN.MINUS ? "-" : "!",
        position: token.position,
      });
      if (operators.length > this.limits.maxParserNesting) {
        throw parserError(
          `Parser nesting exceeds the ${this.limits.maxParserNesting} level limit`,
          token,
          "PARSE_NESTING_LIMIT",
        );
      }
    }

    let expression = this.postfixExpression();
    for (let index = operators.length - 1; index >= 0; index -= 1) {
      expression = located(
        {
          type: "UnaryOp",
          op: operators[index].op,
          expr: expression,
        },
        operators[index].position,
      );
    }
    return expression;
  }

  postfixExpression() {
    let expression = this.primaryExpression();
    if (
      expression.type === "Identifier" &&
      this.current().type === TOKEN.LEFT_PAREN
    ) {
      this.consume(TOKEN.LEFT_PAREN);
      const argumentsList = [];
      if (this.current().type !== TOKEN.RIGHT_PAREN) {
        argumentsList.push(this.expression());
        while (this.match(TOKEN.COMMA)) {
          argumentsList.push(this.expression());
        }
      }
      this.consume(TOKEN.RIGHT_PAREN);
      expression = located(
        {
          type: "Call",
          name: expression.name,
          args: argumentsList,
        },
        expression.position,
      );
    }
    while (this.current().type === TOKEN.LEFT_BRACKET) {
      const start = this.consume(TOKEN.LEFT_BRACKET);
      const index = this.expression();
      this.consume(TOKEN.RIGHT_BRACKET);
      expression = located(
        {
          type: "Index",
          array: expression,
          index,
        },
        start.position,
      );
    }
    return expression;
  }

  primaryExpression() {
    const token = this.current();
    switch (token.type) {
      case TOKEN.NUMBER:
        this.position += 1;
        return located(
          {
            type: "Number",
            value: token.value,
          },
          token.position,
        );
      case TOKEN.STRING:
        this.position += 1;
        return located(
          {
            type: "String",
            value: token.value,
          },
          token.position,
        );
      case TOKEN.TRUE:
      case TOKEN.FALSE:
        this.position += 1;
        return located(
          {
            type: "Boolean",
            value: token.type === TOKEN.TRUE,
          },
          token.position,
        );
      case TOKEN.IDENTIFIER:
        this.position += 1;
        return located(
          {
            type: "Identifier",
            name: token.value,
          },
          token.position,
        );
      case TOKEN.LEFT_BRACKET:
        return this.arrayLiteral();
      case TOKEN.LEFT_PAREN: {
        this.position += 1;
        const expression = this.expression();
        this.consume(TOKEN.RIGHT_PAREN);
        return expression;
      }
      default:
        throw parserError(`Unexpected token ${token.type}`, token);
    }
  }

  arrayLiteral() {
    const start = this.consume(TOKEN.LEFT_BRACKET);
    const elements = [];
    if (this.current().type !== TOKEN.RIGHT_BRACKET) {
      elements.push(this.expression());
      while (this.match(TOKEN.COMMA)) {
        elements.push(this.expression());
      }
    }
    this.consume(TOKEN.RIGHT_BRACKET);
    return located(
      {
        type: "ArrayLiteral",
        elements,
      },
      start.position,
    );
  }
}

export function parse(tokens, limitOverrides = {}) {
  const parser = new Parser(tokens, limitOverrides);
  const ast = parser.program();
  validateAstDepth(ast, parser.limits.maxParserNesting);
  return ast;
}
