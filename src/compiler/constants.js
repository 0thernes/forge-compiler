import { ForgeError } from "./errors.js";

export const FORGE_VERSION = "14.2.0";

export const TOKEN = Object.freeze({
  NUMBER: "NUMBER",
  STRING: "STRING",
  IDENTIFIER: "IDENTIFIER",
  LET: "LET",
  PRINT: "PRINT",
  IF: "IF",
  ELSE: "ELSE",
  WHILE: "WHILE",
  FUNCTION: "FUNCTION",
  RETURN: "RETURN",
  BREAK: "BREAK",
  CONTINUE: "CONTINUE",
  TRUE: "TRUE",
  FALSE: "FALSE",
  PLUS: "+",
  MINUS: "-",
  STAR: "*",
  SLASH: "/",
  MODULO: "%",
  EQUAL: "==",
  NOT_EQUAL: "!=",
  LESS: "<",
  GREATER: ">",
  LESS_EQUAL: "<=",
  GREATER_EQUAL: ">=",
  ASSIGN: "=",
  PLUS_ASSIGN: "+=",
  MINUS_ASSIGN: "-=",
  STAR_ASSIGN: "*=",
  SLASH_ASSIGN: "/=",
  MODULO_ASSIGN: "%=",
  LEFT_PAREN: "(",
  RIGHT_PAREN: ")",
  LEFT_BRACE: "{",
  RIGHT_BRACE: "}",
  LEFT_BRACKET: "[",
  RIGHT_BRACKET: "]",
  COMMA: ",",
  SEMICOLON: ";",
  AND: "&&",
  OR: "||",
  NOT: "!",
  EOF: "EOF",
});

export const DEFAULT_LIMITS = Object.freeze({
  maxSourceLength: 250_000,
  maxTokens: 75_000,
  maxParserNesting: 256,
  maxInstructions: 250_000,
  maxSteps: 1_000_000,
  maxCallDepth: 50_000,
  maxStackDepth: 100_000,
  maxArrayLength: 100_000,
  maxStringLength: 1_000_000,
  maxOutputLines: 5_000,
  maxOutputCharacters: 1_000_000,
  maxTraceEntries: 500,
  maxTraceStackItems: 64,
  maxTraceCharacters: 1_000_000,
  maxTraceValueCharacters: 512,
  maxFormatDepth: 32,
  maxFormatItems: 1_000,
  maxFormatCharacters: 20_000,
});

const LIMIT_NAMES = new Set(Object.keys(DEFAULT_LIMITS));

export const ENTRY_LABEL = "$$forge:entry";
export const INTERNAL_LABEL_PREFIX = "$$forge:";

const KEYWORD_ENTRIES = [
  ["let", TOKEN.LET],
  ["print", TOKEN.PRINT],
  ["if", TOKEN.IF],
  ["else", TOKEN.ELSE],
  ["while", TOKEN.WHILE],
  ["fn", TOKEN.FUNCTION],
  ["return", TOKEN.RETURN],
  ["break", TOKEN.BREAK],
  ["continue", TOKEN.CONTINUE],
  ["true", TOKEN.TRUE],
  ["false", TOKEN.FALSE],
];

const BUILTIN_ENTRIES = [
  ["len", { arity: 1, opcode: "BUILTIN_LEN" }],
  ["char_at", { arity: 2, opcode: "BUILTIN_CHAR_AT" }],
  ["substr", { arity: 3, opcode: "BUILTIN_SUBSTR" }],
  ["floor", { arity: 1, opcode: "BUILTIN_FLOOR" }],
  ["type_of", { arity: 1, opcode: "BUILTIN_TYPE_OF" }],
  ["push", { arity: 2, opcode: "BUILTIN_PUSH" }],
  ["pop", { arity: 1, opcode: "BUILTIN_POP" }],
];

const KEYWORD_MAP = new Map(KEYWORD_ENTRIES);
const BUILTIN_MAP = new Map(BUILTIN_ENTRIES);

export const T = Object.freeze({
  NUM: TOKEN.NUMBER,
  STR: TOKEN.STRING,
  IDENT: TOKEN.IDENTIFIER,
  LET: TOKEN.LET,
  PRINT: TOKEN.PRINT,
  IF: TOKEN.IF,
  ELSE: TOKEN.ELSE,
  WHILE: TOKEN.WHILE,
  FN: TOKEN.FUNCTION,
  RETURN: TOKEN.RETURN,
  BREAK: TOKEN.BREAK,
  CONTINUE: TOKEN.CONTINUE,
  TRUE: TOKEN.TRUE,
  FALSE: TOKEN.FALSE,
  PLUS: TOKEN.PLUS,
  MINUS: TOKEN.MINUS,
  STAR: TOKEN.STAR,
  SLASH: TOKEN.SLASH,
  MOD: TOKEN.MODULO,
  EQ: TOKEN.EQUAL,
  NEQ: TOKEN.NOT_EQUAL,
  LT: TOKEN.LESS,
  GT: TOKEN.GREATER,
  LTE: TOKEN.LESS_EQUAL,
  GTE: TOKEN.GREATER_EQUAL,
  ASSIGN: TOKEN.ASSIGN,
  PLUS_EQ: TOKEN.PLUS_ASSIGN,
  MINUS_EQ: TOKEN.MINUS_ASSIGN,
  STAR_EQ: TOKEN.STAR_ASSIGN,
  SLASH_EQ: TOKEN.SLASH_ASSIGN,
  MOD_EQ: TOKEN.MODULO_ASSIGN,
  LPAREN: TOKEN.LEFT_PAREN,
  RPAREN: TOKEN.RIGHT_PAREN,
  LBRACE: TOKEN.LEFT_BRACE,
  RBRACE: TOKEN.RIGHT_BRACE,
  LBRACKET: TOKEN.LEFT_BRACKET,
  RBRACKET: TOKEN.RIGHT_BRACKET,
  COMMA: TOKEN.COMMA,
  SEMI: TOKEN.SEMICOLON,
  AND: TOKEN.AND,
  OR: TOKEN.OR,
  NOT: TOKEN.NOT,
  EOF: TOKEN.EOF,
});

export const KEYWORDS = Object.freeze(
  Object.assign(Object.create(null), Object.fromEntries(KEYWORD_ENTRIES)),
);

export const BUILTINS = Object.freeze(
  Object.assign(Object.create(null), Object.fromEntries(BUILTIN_ENTRIES)),
);

export const TRACE_LIMIT = DEFAULT_LIMITS.maxTraceEntries;

export function keywordToken(identifier) {
  return KEYWORD_MAP.get(identifier) ?? TOKEN.IDENTIFIER;
}

export function isKeyword(identifier) {
  return KEYWORD_MAP.has(identifier);
}

export function getBuiltin(name) {
  return BUILTIN_MAP.get(name);
}

export function isBuiltin(name) {
  return BUILTIN_MAP.has(name);
}

export const BINARY_OPCODE = new Map([
  ["+", "ADD"],
  ["-", "SUB"],
  ["*", "MUL"],
  ["/", "DIV"],
  ["%", "MOD"],
  ["==", "EQ"],
  ["!=", "NEQ"],
  ["<", "LT"],
  [">", "GT"],
  ["<=", "LTE"],
  [">=", "GTE"],
]);

export const COMPOUND_OPERATOR = new Map([
  ["+=", "+"],
  ["-=", "-"],
  ["*=", "*"],
  ["/=", "/"],
  ["%=", "%"],
]);

export const COMPOUND_TOKENS = new Set([
  TOKEN.PLUS_ASSIGN,
  TOKEN.MINUS_ASSIGN,
  TOKEN.STAR_ASSIGN,
  TOKEN.SLASH_ASSIGN,
  TOKEN.MODULO_ASSIGN,
]);

export function mergeLimits(overrides = {}) {
  if (
    overrides === null ||
    typeof overrides !== "object" ||
    Array.isArray(overrides)
  ) {
    throw new ForgeError("Compiler limits must be provided as an object", {
      phase: "compile",
      code: "LIMITS_TYPE",
    });
  }

  for (const [name, value] of Object.entries(overrides)) {
    if (!LIMIT_NAMES.has(name)) {
      throw new ForgeError(`Unknown compiler limit: ${name}`, {
        phase: "compile",
        code: "LIMITS_UNKNOWN",
      });
    }
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ForgeError(
        `Compiler limit '${name}' must be a non-negative safe integer`,
        { phase: "compile", code: "LIMITS_VALUE" },
      );
    }
  }

  return { ...DEFAULT_LIMITS, ...overrides };
}
