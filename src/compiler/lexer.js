import {
  DEFAULT_LIMITS,
  TOKEN,
  keywordToken,
  mergeLimits,
} from "./constants.js";
import { ForgeError, atPosition } from "./errors.js";

const ESCAPES = new Map([
  ["n", "\n"],
  ["t", "\t"],
  ["r", "\r"],
  ["\\", "\\"],
  ['"', '"'],
  ["0", "\0"],
]);

const TWO_CHARACTER_TOKENS = new Set([
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
]);

const SINGLE_CHARACTER_TOKENS = new Map([
  ["+", TOKEN.PLUS],
  ["-", TOKEN.MINUS],
  ["*", TOKEN.STAR],
  ["/", TOKEN.SLASH],
  ["%", TOKEN.MODULO],
  ["=", TOKEN.ASSIGN],
  ["(", TOKEN.LEFT_PAREN],
  [")", TOKEN.RIGHT_PAREN],
  ["{", TOKEN.LEFT_BRACE],
  ["}", TOKEN.RIGHT_BRACE],
  ["[", TOKEN.LEFT_BRACKET],
  ["]", TOKEN.RIGHT_BRACKET],
  [",", TOKEN.COMMA],
  [";", TOKEN.SEMICOLON],
  ["!", TOKEN.NOT],
  ["<", TOKEN.LESS],
  [">", TOKEN.GREATER],
]);

function lexError(message, position, code) {
  return new ForgeError(atPosition(message, position), {
    phase: "lex",
    position,
    code,
  });
}

export function lex(source, limitOverrides = {}) {
  if (typeof source !== "string") {
    throw new ForgeError("Source must be a string", {
      phase: "lex",
      code: "LEX_SOURCE_TYPE",
    });
  }

  const limits = mergeLimits(limitOverrides);
  if (source.length > limits.maxSourceLength) {
    throw new ForgeError(
      `Source exceeds the ${limits.maxSourceLength} character limit`,
      { phase: "lex", code: "LEX_SOURCE_LIMIT" },
    );
  }

  const tokens = [];
  let index = 0;
  let line = 1;
  let column = 1;

  function position() {
    return { line, column };
  }

  function push(type, value, start) {
    if (tokens.length >= limits.maxTokens) {
      throw lexError(
        `Token count exceeds the ${limits.maxTokens} token limit`,
        start,
        "LEX_TOKEN_LIMIT",
      );
    }
    tokens.push({
      type,
      value,
      position: start,
      pos: { line: start.line, col: start.column },
    });
  }

  while (index < source.length) {
    const character = source[index];

    if (character === "\n") {
      line += 1;
      column = 1;
      index += 1;
      continue;
    }
    if (/\s/u.test(character)) {
      column += 1;
      index += 1;
      continue;
    }
    if (character === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") {
        index += 1;
        column += 1;
      }
      continue;
    }

    const start = position();
    const pair = source.slice(index, index + 2);
    if (TWO_CHARACTER_TOKENS.has(pair)) {
      push(pair, pair, start);
      index += 2;
      column += 2;
      continue;
    }

    const singleType = SINGLE_CHARACTER_TOKENS.get(character);
    if (singleType) {
      push(singleType, character, start);
      index += 1;
      column += 1;
      continue;
    }

    if (/[0-9]/u.test(character)) {
      let raw = "";
      let hasDecimal = false;
      while (index < source.length && /[0-9.]/u.test(source[index])) {
        if (source[index] === ".") {
          if (hasDecimal) {
            throw lexError(
              "Invalid number: multiple decimal points",
              position(),
              "LEX_NUMBER_DECIMAL",
            );
          }
          hasDecimal = true;
        }
        raw += source[index];
        index += 1;
        column += 1;
      }
      if (raw.endsWith(".")) {
        throw lexError(
          "Invalid number: trailing decimal point",
          { line, column: column - 1 },
          "LEX_NUMBER_TRAILING_DECIMAL",
        );
      }
      const value = Number.parseFloat(raw);
      if (!Number.isFinite(value)) {
        throw lexError(
          "Numeric literal is outside the finite number range",
          start,
          "LEX_NUMBER_RANGE",
        );
      }
      push(TOKEN.NUMBER, value, start);
      continue;
    }

    if (character === '"') {
      let value = "";
      index += 1;
      column += 1;
      while (index < source.length && source[index] !== '"') {
        if (source[index] === "\\") {
          index += 1;
          column += 1;
          if (index >= source.length) {
            throw lexError(
              "Unterminated escape in string",
              position(),
              "LEX_STRING_ESCAPE",
            );
          }
          const escaped = ESCAPES.get(source[index]);
          if (escaped === undefined) {
            throw lexError(
              `Unknown escape sequence \\${source[index]}`,
              position(),
              "LEX_STRING_ESCAPE_UNKNOWN",
            );
          }
          value += escaped;
          index += 1;
          column += 1;
        } else {
          if (source[index] === "\n") {
            line += 1;
            column = 1;
            index += 1;
            value += "\n";
          } else {
            value += source[index];
            index += 1;
            column += 1;
          }
        }
        if (value.length > limits.maxStringLength) {
          throw lexError(
            `String literal exceeds the ${limits.maxStringLength} character limit`,
            start,
            "LEX_STRING_LIMIT",
          );
        }
      }
      if (index >= source.length) {
        throw lexError("Unterminated string", start, "LEX_STRING_UNTERMINATED");
      }
      index += 1;
      column += 1;
      push(TOKEN.STRING, value, start);
      continue;
    }

    if (/[a-zA-Z_]/u.test(character)) {
      let identifier = "";
      while (index < source.length && /[a-zA-Z0-9_]/u.test(source[index])) {
        identifier += source[index];
        index += 1;
        column += 1;
      }
      push(keywordToken(identifier), identifier, start);
      continue;
    }

    // source[index] is a single UTF-16 code unit; astral-plane characters
    // would surface as a lone surrogate in the diagnostic without this.
    const unexpected = String.fromCodePoint(source.codePointAt(index));
    throw lexError(
      `Unexpected char '${unexpected}'`,
      start,
      "LEX_UNEXPECTED_CHARACTER",
    );
  }

  if (tokens.length >= (limits.maxTokens ?? DEFAULT_LIMITS.maxTokens)) {
    throw lexError(
      `Token count exceeds the ${limits.maxTokens} token limit`,
      position(),
      "LEX_TOKEN_LIMIT",
    );
  }
  const endPosition = position();
  tokens.push({
    type: TOKEN.EOF,
    value: null,
    position: endPosition,
    pos: { line: endPosition.line, col: endPosition.column },
  });
  return tokens;
}
