import {
  CLI_EXIT_CODES,
  DEFAULT_PROTOCOL_OUTPUT_LIMIT_BYTES,
  FORGE_CLI_SCHEMA,
  PUBLIC_SCHEMA_VERSIONS,
} from "../compiler/capabilities.js";
import { FORGE_VERSION } from "../compiler/constants.js";

// A machine-readable CLI response is deliberately bounded independently of
// the JavaScript heap. Sixteen MiB accommodates normal compiler artifacts for
// the supported source limit while preventing a single pathological result
// graph from amplifying into an unbounded protocol response.
export { DEFAULT_PROTOCOL_OUTPUT_LIMIT_BYTES };

const OUTPUT_CHUNK_CODE_UNITS = 64 * 1024;

export class ProtocolOutputLimitError extends Error {
  constructor(limitBytes, attemptedBytes, stage) {
    super(`Protocol JSON exceeds the ${limitBytes}-byte output limit`);
    this.name = "ProtocolOutputLimitError";
    this.phase = "cli";
    this.code = "CLI_PROTOCOL_OUTPUT_LIMIT";
    this.limitBytes = limitBytes;
    this.attemptedBytes = attemptedBytes;
    this.stage = stage;
  }
}

export function isProtocolOutputLimitError(error) {
  return (
    error instanceof ProtocolOutputLimitError ||
    error?.code === "CLI_PROTOCOL_OUTPUT_LIMIT"
  );
}

class ProtocolOutputBudget {
  constructor(limitBytes, stage) {
    if (!Number.isSafeInteger(limitBytes) || limitBytes <= 0) {
      throw new RangeError(
        "Protocol output limit must be a positive safe integer",
      );
    }
    this.limitBytes = limitBytes;
    this.usedBytes = 0;
    this.stage = stage;
  }

  ensure(additionalBytes) {
    if (additionalBytes > this.limitBytes - this.usedBytes) {
      throw new ProtocolOutputLimitError(
        this.limitBytes,
        this.usedBytes + additionalBytes,
        this.stage,
      );
    }
  }

  consume(additionalBytes) {
    this.ensure(additionalBytes);
    this.usedBytes += additionalBytes;
  }
}

function pointerSegment(value) {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function protocolRecord(entries) {
  return Object.assign(Object.create(null), entries);
}

function jsonStringContentByteLength(value, escapePointer = false) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (escapePointer && (code === 0x2f || code === 0x7e)) {
      bytes += 2;
    } else if (code === 0x22 || code === 0x5c || code === 0x08) {
      bytes += 2;
    } else if (
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0c ||
      code === 0x0d
    ) {
      bytes += 2;
    } else if (code <= 0x1f) {
      bytes += 6;
    } else if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 6;
      }
    } else if (code >= 0xd800 && code <= 0xdfff) {
      bytes += 6;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function jsonStringByteLength(value) {
  return jsonStringContentByteLength(value) + 2;
}

function stringRecordByteLength(entries) {
  let bytes = 2;
  let index = 0;
  for (const [key, value] of Object.entries(entries)) {
    if (index > 0) bytes += 1;
    bytes +=
      jsonStringByteLength(key) + 1 + jsonStringByteLength(String(value));
    index += 1;
  }
  return bytes;
}

function encodedScalar(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return {
      terminal: true,
      value,
      compactBytes:
        value === null
          ? 4
          : typeof value === "string"
            ? jsonStringByteLength(value)
            : String(value).length,
    };
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return {
        terminal: true,
        value,
        compactBytes: String(value).length,
      };
    }
    const entries = { $forge: "number", value: String(value) };
    return {
      terminal: true,
      value: protocolRecord(entries),
      compactBytes: stringRecordByteLength(entries),
    };
  }
  if (typeof value !== "object") {
    const entries = {
      $forge: typeof value,
      value: String(value),
    };
    return {
      terminal: true,
      value: protocolRecord(entries),
      compactBytes: stringRecordByteLength(entries),
    };
  }
  return { terminal: false, value: null, compactBytes: 0 };
}

function childPath(parent, segment) {
  return { parent, segment };
}

function renderPath(path) {
  if (typeof path === "string") return path;
  const segments = [];
  let current = path;
  while (current.parent) {
    segments.push(pointerSegment(current.segment));
    current = current.parent;
  }
  let rendered = current.base;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    rendered += `/${segments[index]}`;
  }
  return rendered;
}

function renderedPathJsonByteLength(path) {
  if (typeof path === "string") return jsonStringByteLength(path);
  let bytes = 2;
  let current = path;
  while (current.parent) {
    bytes += 1 + jsonStringContentByteLength(String(current.segment), true);
    current = current.parent;
  }
  return bytes + jsonStringContentByteLength(String(current.base));
}

function referenceRecordByteLength(pathJsonBytes) {
  return (
    2 +
    jsonStringByteLength("$forge") +
    1 +
    jsonStringByteLength("reference") +
    1 +
    jsonStringByteLength("path") +
    1 +
    pathJsonBytes
  );
}

function* enumerableOwnKeys(value) {
  for (const key in value) {
    if (Object.hasOwn(value, key)) yield key;
  }
}

function prepareProtocolValue(value, path, seen, budget) {
  const scalar = encodedScalar(value);
  if (scalar.terminal) {
    budget.consume(scalar.compactBytes);
    return { encoded: scalar.value, frame: null };
  }

  const previousPath = seen.get(value);
  if (previousPath !== undefined) {
    const pathJsonBytes = renderedPathJsonByteLength(previousPath);
    budget.consume(referenceRecordByteLength(pathJsonBytes));
    return {
      encoded: protocolRecord({
        $forge: "reference",
        path: renderPath(previousPath),
      }),
      frame: null,
    };
  }

  seen.set(value, path);
  const array = Array.isArray(value);
  budget.consume(2);
  if (array && value.length > 0) {
    // Even the smallest possible JSON array element occupies one byte. This
    // preflight rejects enormous sparse arrays before walking every hole.
    budget.ensure(value.length * 2 - 1);
  }
  const encoded = array ? [] : Object.create(null);
  return {
    encoded,
    frame: {
      source: value,
      target: encoded,
      path,
      array,
      keyIterator: array ? null : enumerableOwnKeys(value),
      index: 0,
      emitted: 0,
    },
  };
}

/**
 * Converts compiler results into JSON without losing cyclic/shared FORGE array
 * information. The first occurrence remains an ordinary array; subsequent
 * occurrences become an explicit, JSON-Pointer-like reference marker. The
 * traversal is iterative so valid deeply nested FORGE values cannot consume
 * the JavaScript call stack.
 */
export function encodeProtocolValue(
  value,
  path = "#",
  seen = new WeakMap(),
  maxBytes = DEFAULT_PROTOCOL_OUTPUT_LIMIT_BYTES,
) {
  const budget = new ProtocolOutputBudget(maxBytes, "encoding");
  const rootPath = { base: path, parent: null };
  const root = prepareProtocolValue(value, rootPath, seen, budget);
  if (!root.frame) return root.encoded;

  const stack = [root.frame];
  while (stack.length > 0) {
    const frame = stack.at(-1);
    let key;
    if (frame.array) {
      if (frame.index >= frame.source.length) {
        stack.pop();
        continue;
      }
      key = frame.index;
      frame.index += 1;
      if (key > 0) budget.consume(1);
      if (!Object.hasOwn(frame.source, key)) {
        budget.consume(4);
        continue;
      }
    } else {
      const next = frame.keyIterator.next();
      if (next.done) {
        stack.pop();
        continue;
      }
      key = next.value;
    }

    const item = frame.source[key];
    if (!frame.array && item === undefined) continue;
    if (!frame.array) {
      budget.consume(
        (frame.emitted > 0 ? 1 : 0) + jsonStringByteLength(key) + 1,
      );
      frame.emitted += 1;
    }

    const prepared = prepareProtocolValue(
      item,
      childPath(frame.path, key),
      seen,
      budget,
    );
    frame.target[key] = prepared.encoded;
    if (prepared.frame) stack.push(prepared.frame);
  }
  return root.encoded;
}

function indentation(depth) {
  // Pretty output remains readable without allowing adversarial nesting to
  // amplify indentation quadratically.
  return " ".repeat(Math.min(depth * 2, 40));
}

function protocolWriter(maxBytes) {
  const budget = new ProtocolOutputBudget(maxBytes, "serialization");
  const chunks = [];
  let pending = "";

  function flush() {
    if (pending.length > 0) {
      chunks.push(pending);
      pending = "";
    }
  }

  function writeReserved(value) {
    if (value.length >= OUTPUT_CHUNK_CODE_UNITS) {
      flush();
      chunks.push(value);
    } else {
      if (pending.length + value.length > OUTPUT_CHUNK_CODE_UNITS) flush();
      pending += value;
    }
  }

  return {
    ascii(value) {
      budget.consume(value.length);
      writeReserved(value);
    },
    jsonString(value) {
      const bytes = jsonStringByteLength(value);
      // Charge before JSON.stringify so a single highly escaped string cannot
      // allocate beyond the response ceiling before the guard runs.
      budget.consume(bytes);
      writeReserved(JSON.stringify(value));
    },
    finish() {
      flush();
      return chunks.join("");
    },
  };
}

function writePrettyPrefix(writer, depth) {
  writer.ascii("\n");
  writer.ascii(indentation(depth));
}

export function stringifyProtocolValue(
  value,
  pretty = false,
  maxBytes = DEFAULT_PROTOCOL_OUTPUT_LIMIT_BYTES,
) {
  const writer = protocolWriter(maxBytes);
  const stack = [{ type: "value", value, depth: 0 }];

  while (stack.length > 0) {
    const event = stack.pop();

    if (event.type === "array") {
      if (event.index >= event.value.length) {
        if (pretty) writePrettyPrefix(writer, event.depth);
        writer.ascii("]");
        continue;
      }
      if (event.index > 0) writer.ascii(",");
      if (pretty) writePrettyPrefix(writer, event.depth + 1);
      const index = event.index;
      event.index += 1;
      stack.push(event);
      stack.push({
        type: "value",
        value: Object.hasOwn(event.value, index) ? event.value[index] : null,
        depth: event.depth + 1,
      });
      continue;
    }

    if (event.type === "object") {
      const next = event.keyIterator.next();
      if (next.done) {
        if (event.emitted > 0 && pretty) {
          writePrettyPrefix(writer, event.depth);
        }
        writer.ascii("}");
        continue;
      }
      if (event.emitted > 0) writer.ascii(",");
      if (pretty) writePrettyPrefix(writer, event.depth + 1);
      writer.jsonString(next.value);
      writer.ascii(pretty ? ": " : ":");
      event.emitted += 1;
      stack.push(event);
      stack.push({
        type: "value",
        value: event.value[next.value],
        depth: event.depth + 1,
      });
      continue;
    }

    const current = event.value;
    if (current === null) {
      writer.ascii("null");
      continue;
    }
    if (typeof current === "string") {
      writer.jsonString(current);
      continue;
    }
    if (typeof current === "number" || typeof current === "boolean") {
      writer.ascii(String(current));
      continue;
    }
    if (typeof current !== "object") {
      writer.ascii("null");
      continue;
    }

    if (Array.isArray(current)) {
      writer.ascii("[");
      if (current.length === 0) {
        writer.ascii("]");
      } else {
        stack.push({
          type: "array",
          value: current,
          depth: event.depth,
          index: 0,
        });
      }
      continue;
    }

    writer.ascii("{");
    stack.push({
      type: "object",
      value: current,
      depth: event.depth,
      keyIterator: enumerableOwnKeys(current),
      emitted: 0,
    });
  }

  return writer.finish();
}

export function createDiagnostic(
  error,
  { source = null, severity = "error" } = {},
) {
  const position =
    error?.position &&
    Number.isSafeInteger(error.position.line) &&
    error.position.line > 0 &&
    Number.isSafeInteger(error.position.column) &&
    error.position.column > 0
      ? {
          line: error.position.line,
          column: error.position.column,
        }
      : null;

  return {
    schema: PUBLIC_SCHEMA_VERSIONS.diagnostic,
    severity,
    phase: typeof error?.phase === "string" ? error.phase : "internal",
    code:
      typeof error?.code === "string" && error.code.length > 0
        ? error.code
        : "FORGE_UNCLASSIFIED",
    message: typeof error?.message === "string" ? error.message : String(error),
    location: position
      ? {
          source: source?.displayName ?? "<unknown>",
          ...position,
        }
      : null,
  };
}

export function createEnvelope({
  ok,
  command,
  exitCode,
  source = null,
  diagnostics = [],
  data = null,
}) {
  return {
    schema: FORGE_CLI_SCHEMA,
    ok,
    command,
    version: FORGE_VERSION,
    exitCode,
    source,
    diagnostics,
    data,
  };
}

export function createErrorEnvelope({
  command,
  error,
  exitCode = CLI_EXIT_CODES.diagnostic,
  source = null,
}) {
  return createEnvelope({
    ok: false,
    command,
    exitCode,
    source,
    diagnostics: [createDiagnostic(error, { source })],
  });
}

export function stringifyEnvelope(
  envelope,
  pretty = false,
  maxBytes = DEFAULT_PROTOCOL_OUTPUT_LIMIT_BYTES,
) {
  // Encoding preflights the compact graph and serialization independently
  // verifies the actual (possibly pretty-printed) response against the same
  // semantic output ceiling. The ceiling is not double-charged across phases.
  return stringifyProtocolValue(
    encodeProtocolValue(envelope, "#", new WeakMap(), maxBytes),
    pretty,
    maxBytes,
  );
}
