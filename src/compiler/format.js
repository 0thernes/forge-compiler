import { DEFAULT_LIMITS } from "./constants.js";

export function escapeForDisplay(value) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\0", "\\0")
    .replaceAll("\n", "\\n")
    .replaceAll("\t", "\\t")
    .replaceAll("\r", "\\r")
    .replaceAll('"', '\\"');
}

export function typeName(value) {
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function truncate(value, limit) {
  if (value.length <= limit) return value;
  if (limit <= 1) return "…".slice(0, limit);
  return `${value.slice(0, limit - 1)}…`;
}

export function formatValue(value, options = {}) {
  const maxDepth = options.maxDepth ?? DEFAULT_LIMITS.maxFormatDepth;
  const maxItems = options.maxItems ?? DEFAULT_LIMITS.maxFormatItems;
  const maxCharacters =
    options.maxCharacters ?? DEFAULT_LIMITS.maxFormatCharacters;
  const ancestors = new Set();
  let remainingItems = maxItems;

  function visit(current, depth) {
    if (typeof current === "number") return String(current);
    if (typeof current === "string") {
      return `"${escapeForDisplay(truncate(current, maxCharacters))}"`;
    }
    if (!Array.isArray(current)) return String(current);
    if (ancestors.has(current)) return "[...]";
    if (depth >= maxDepth) return "[…]";
    if (remainingItems <= 0) return "[…]";

    ancestors.add(current);
    const parts = [];
    for (const item of current) {
      if (remainingItems <= 0) {
        parts.push("…");
        break;
      }
      remainingItems -= 1;
      parts.push(visit(item, depth + 1));
    }
    ancestors.delete(current);
    return `[${parts.join(", ")}]`;
  }

  return truncate(visit(value, 0), maxCharacters);
}

export function formatForPrint(value, options = {}) {
  if (typeof value === "string") {
    return truncate(
      value,
      options.maxCharacters ?? DEFAULT_LIMITS.maxFormatCharacters,
    );
  }
  return formatValue(value, options);
}
