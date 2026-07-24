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

function normalizeLimit(value, fallback) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function truncate(value, limit) {
  if (value.length <= limit) return value;
  if (limit <= 1) return "…".slice(0, limit);
  return `${value.slice(0, limit - 1)}…`;
}

function escapeCharacter(character) {
  switch (character) {
    case "\\":
      return "\\\\";
    case "\0":
      return "\\0";
    case "\n":
      return "\\n";
    case "\t":
      return "\\t";
    case "\r":
      return "\\r";
    case '"':
      return '\\"';
    default:
      return character;
  }
}

function hasTruncationMarker(text) {
  return text.includes("…") || text.includes("...");
}

export function formatValue(value, options = {}) {
  const maxDepth = normalizeLimit(
    options.maxDepth,
    DEFAULT_LIMITS.maxFormatDepth,
  );
  const maxItems = normalizeLimit(
    options.maxItems,
    DEFAULT_LIMITS.maxFormatItems,
  );
  const maxCharacters = normalizeLimit(
    options.maxCharacters,
    DEFAULT_LIMITS.maxFormatCharacters,
  );
  const ancestors = new Set();
  let remainingItems = maxItems;

  function quotedString(current, budget) {
    if (current.length === 0 && budget >= 2) {
      return { text: '""', complete: true };
    }
    if (budget === 0) return { text: "", complete: false };
    if (budget <= 2) return { text: "…", complete: false };

    const contentBudget = budget - 2;
    const parts = [];
    let contentLength = 0;
    for (const character of current) {
      const escaped = escapeCharacter(character);
      if (contentLength + escaped.length > contentBudget) {
        while (parts.length > 0 && contentLength + 1 > contentBudget) {
          contentLength -= parts.pop().length;
        }
        if (contentBudget > 0) parts.push("…");
        return { text: `"${parts.join("")}"`, complete: false };
      }
      parts.push(escaped);
      contentLength += escaped.length;
    }
    return { text: `"${parts.join("")}"`, complete: true };
  }

  function boundedArrayMarker(marker, budget) {
    if (marker.length <= budget) return marker;
    if (budget >= 3) return "[…]";
    return "…".slice(0, budget);
  }

  function addArrayTruncation(parts, contentBudget, contentLength) {
    while (parts.length > 0) {
      const markerLength = (parts.length > 0 ? 2 : 0) + 1;
      if (contentLength + markerLength <= contentBudget) break;
      const removed = parts.pop();
      contentLength -= removed.length;
      if (parts.length > 0) contentLength -= 2;
    }

    const separatorLength = parts.length > 0 ? 2 : 0;
    if (contentLength + separatorLength + 1 <= contentBudget) {
      parts.push("…");
    } else if (contentBudget > 0) {
      parts.splice(0, parts.length, "…".slice(0, contentBudget));
    }
  }

  function visit(current, depth, budget) {
    if (typeof current === "number") {
      const text = String(current);
      return {
        text: truncate(text, budget),
        complete: text.length <= budget,
      };
    }
    if (typeof current === "string") {
      return quotedString(current, budget);
    }
    if (!Array.isArray(current)) {
      const text = String(current);
      return {
        text: truncate(text, budget),
        complete: text.length <= budget,
      };
    }
    if (current.length === 0) {
      return budget >= 2
        ? { text: "[]", complete: true }
        : { text: "…".slice(0, budget), complete: false };
    }
    if (ancestors.has(current)) {
      return {
        text: boundedArrayMarker("[...]", budget),
        complete: false,
      };
    }
    if (depth >= maxDepth || remainingItems <= 0) {
      return {
        text: boundedArrayMarker("[…]", budget),
        complete: false,
      };
    }
    if (budget < 3) {
      return {
        text: "…".slice(0, budget),
        complete: false,
      };
    }

    ancestors.add(current);
    const parts = [];
    const contentBudget = budget - 2;
    let contentLength = 0;
    let complete = true;

    for (let itemIndex = 0; itemIndex < current.length; itemIndex += 1) {
      const item = current[itemIndex];
      if (remainingItems <= 0) {
        addArrayTruncation(parts, contentBudget, contentLength);
        complete = false;
        break;
      }

      const separatorLength = parts.length > 0 ? 2 : 0;
      const available = contentBudget - contentLength - separatorLength;
      const hasRemainingSiblings = itemIndex < current.length - 1;
      // When another element follows, reserve room for `, …` so a truncated
      // child cannot hide the fact that sibling values were also omitted.
      const childBudget = available - (hasRemainingSiblings ? 3 : 0);
      if (childBudget <= 0) {
        addArrayTruncation(parts, contentBudget, contentLength);
        complete = false;
        break;
      }

      remainingItems -= 1;
      const rendered = visit(item, depth + 1, childBudget);
      if (rendered.text.length === 0) {
        addArrayTruncation(parts, contentBudget, contentLength);
        complete = false;
        break;
      }

      parts.push(rendered.text);
      contentLength += separatorLength + rendered.text.length;
      if (!rendered.complete) {
        if (hasRemainingSiblings || !hasTruncationMarker(rendered.text)) {
          addArrayTruncation(parts, contentBudget, contentLength);
        }
        complete = false;
        break;
      }
    }

    ancestors.delete(current);
    return {
      text: `[${parts.join(", ")}]`,
      complete,
    };
  }

  const rendered = visit(value, 0, maxCharacters);
  if (
    !rendered.complete &&
    maxCharacters > 0 &&
    !hasTruncationMarker(rendered.text)
  ) {
    return "…";
  }
  return rendered.text;
}

export function formatForPrint(value, options = {}) {
  if (typeof value === "string") {
    return truncate(
      value,
      normalizeLimit(options.maxCharacters, DEFAULT_LIMITS.maxFormatCharacters),
    );
  }
  return formatValue(value, options);
}
