import { T, KEYWORDS, ESCAPE_MAP } from "./constants.js";

// ── LEXER ──
export function lex(src) {
  const tokens = [];
  let i = 0, line = 1, col = 1;
  while (i < src.length) {
    if (src[i] === '\n') { line++; col = 1; i++; continue; }
    if (/\s/.test(src[i])) { col++; i++; continue; }
    if (src[i] === '/' && src[i+1] === '/') {
      while (i < src.length && src[i] !== '\n') { i++; col++; }
      continue;
    }
    const start = { line, col };
    const two = src.slice(i, i+2);
    if (["==","!=","<=",">=","&&","||","+=","-=","*=","/=","%="].includes(two)) {
      const type = two === "+=" ? T.PLUS_EQ : two === "-=" ? T.MINUS_EQ : two === "*=" ? T.STAR_EQ : two === "/=" ? T.SLASH_EQ : two === "%=" ? T.MOD_EQ : two;
      tokens.push({ type, value: two, pos: start }); i += 2; col += 2; continue;
    }
    // [F1 v13] '[' and ']' join the single-char operator set
    if ("+-*/%=()<>{},;![]".includes(src[i])) {
      const ch = src[i];
      const type = ch === '(' ? T.LPAREN : ch === ')' ? T.RPAREN : ch === '{' ? T.LBRACE : ch === '}' ? T.RBRACE : ch === '[' ? T.LBRACKET : ch === ']' ? T.RBRACKET : ch === ',' ? T.COMMA : ch === ';' ? T.SEMI : ch === '!' ? T.NOT : ch;
      tokens.push({ type, value: ch, pos: start }); i++; col++; continue;
    }
    if (/[0-9]/.test(src[i])) {
      let num = "";
      let hasDot = false;
      while (i < src.length && /[0-9.]/.test(src[i])) {
        if (src[i] === '.') {
          if (hasDot) throw new Error(`Invalid number: multiple decimal points at line ${line}:${col}`);
          hasDot = true;
        }
        num += src[i]; i++; col++;
      }
      if (num.endsWith('.')) throw new Error(`Invalid number: trailing decimal point at line ${line}:${col - 1}`);
      tokens.push({ type: T.NUM, value: parseFloat(num), pos: start }); continue;
    }
    if (src[i] === '"') {
      let s = ""; i++; col++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') {
          i++; col++;
          if (i >= src.length) throw new Error(`Unterminated escape in string at line ${line}:${col}`);
          const esc = ESCAPE_MAP[src[i]];
          if (esc === undefined) throw new Error(`Unknown escape sequence \\${src[i]} at line ${line}:${col}`);
          s += esc; i++; col++; continue;
        }
        if (src[i] === '\n') { line++; col = 1; }
        s += src[i]; i++; col++;
      }
      if (i >= src.length) throw new Error(`Unterminated string starting at line ${start.line}:${start.col}`);
      i++; col++;
      tokens.push({ type: T.STR, value: s, pos: start }); continue;
    }
    if (/[a-zA-Z_]/.test(src[i])) {
      let id = "";
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) { id += src[i]; i++; col++; }
      tokens.push({ type: KEYWORDS[id] || T.IDENT, value: id, pos: start }); continue;
    }
    throw new Error(`Unexpected char '${src[i]}' at line ${line}:${col}`);
  }
  tokens.push({ type: T.EOF, value: null, pos: { line, col } });
  return tokens;
}
