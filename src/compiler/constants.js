// ============================================================
// FORGE LANGUAGE COMPILER — v13
// Lexer → Parser → AST → Code Gen (ASM) → Link → Stack VM
//
// Types: number, string, boolean (true/false → 1/0), array
// Control: if/else, while, break, continue, return
// Functions: fn, nested, forward refs, arity checked
// Scoping: block-scoped let, strict declaration
// Operators: + - * / % == != < > <= >= && || ! += -= *= /= %=
// Arrays: [1,2,3] literals, a[i] read/write, reference semantics
// Built-ins: len, char_at, substr, floor, type_of, push, pop
// Linker: labels resolved once; undefined fns caught statically
// ============================================================

export const T = {
  NUM: "NUM", STR: "STR", IDENT: "IDENT",
  LET: "LET", PRINT: "PRINT", IF: "IF", ELSE: "ELSE",
  WHILE: "WHILE", FN: "FN", RETURN: "RETURN",
  BREAK: "BREAK", CONTINUE: "CONTINUE", TRUE: "TRUE", FALSE: "FALSE",
  PLUS: "+", MINUS: "-", STAR: "*", SLASH: "/", MOD: "%",
  EQ: "==", NEQ: "!=", LT: "<", GT: ">", LTE: "<=", GTE: ">=",
  ASSIGN: "=",
  PLUS_EQ: "+=", MINUS_EQ: "-=", STAR_EQ: "*=", SLASH_EQ: "/=", MOD_EQ: "%=",
  LPAREN: "(", RPAREN: ")", LBRACE: "{", RBRACE: "}",
  LBRACKET: "[", RBRACKET: "]",
  COMMA: ",", SEMI: ";", AND: "&&", OR: "||", NOT: "!",
  EOF: "EOF"
};

export const KEYWORDS = {
  let: T.LET, print: T.PRINT, if: T.IF, else: T.ELSE, while: T.WHILE,
  fn: T.FN, return: T.RETURN, break: T.BREAK, continue: T.CONTINUE,
  true: T.TRUE, false: T.FALSE
};

export const BINOP_MAP = { "+":"ADD","-":"SUB","*":"MUL","/":"DIV","%":"MOD","==":"EQ","!=":"NEQ","<":"LT",">":"GT","<=":"LTE",">=":"GTE" };
export const ESCAPE_MAP = { 'n': '\n', 't': '\t', 'r': '\r', '\\': '\\', '"': '"', '0': '\0' };
export const ENTRY_LABEL = "$$entry";
export const COMPOUND_OPS = { "+=": "+", "-=": "-", "*=": "*", "/=": "/", "%=": "%" };
export const COMPOUND_TOKENS = [T.PLUS_EQ, T.MINUS_EQ, T.STAR_EQ, T.SLASH_EQ, T.MOD_EQ];

export const BUILTINS = {
  len:     { argc: 1, op: "BUILTIN_LEN" },
  char_at: { argc: 2, op: "BUILTIN_CHAR_AT" },
  substr:  { argc: 3, op: "BUILTIN_SUBSTR" },
  floor:   { argc: 1, op: "BUILTIN_FLOOR" },
  type_of: { argc: 1, op: "BUILTIN_TYPE_OF" },
  push:    { argc: 2, op: "BUILTIN_PUSH" },
  pop:     { argc: 1, op: "BUILTIN_POP" },
};
