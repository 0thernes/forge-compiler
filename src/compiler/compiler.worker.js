import { compileSource } from "./index.js";
import { normalizeError } from "./errors.js";
import { runSelfTest } from "./selfTest.js";

export function handleCompilerRequest(data) {
  const { id, type, payload } = data;
  try {
    let value;
    if (type === "compile") {
      value = compileSource(payload.source, { includeLinkedCode: false });
    } else if (type === "verify") {
      value = runSelfTest();
    } else {
      throw new Error(`Unknown compiler request: ${type}`);
    }
    return { id, ok: true, value };
  } catch (error) {
    return {
      id,
      ok: false,
      error: normalizeError(error).toJSON(),
    };
  }
}

if (typeof self !== "undefined") {
  self.onmessage = ({ data }) => {
    self.postMessage(handleCompilerRequest(data));
  };
}
