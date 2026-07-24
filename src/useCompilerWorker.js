import { useCallback, useEffect, useRef } from "react";

async function createFallbackRequest(type, payload) {
  if (type === "compile") {
    const { compileSource } = await import("./compiler/index.js");
    return compileSource(payload.source, { includeLinkedCode: false });
  }
  if (type === "verify") {
    const { runSelfTest } = await import("./compiler/selfTest.js");
    return runSelfTest();
  }
  throw new Error(`Unknown compiler request: ${type}`);
}

function normalizeWorkerError(value, fallback) {
  if (value instanceof Error) return value;
  const error = new Error(value?.message || fallback);
  if (value && typeof value === "object") Object.assign(error, value);
  return error;
}

export function useCompilerWorker() {
  const workerRef = useRef(null);
  const failWorkerRef = useRef(null);
  const nextRequestId = useRef(1);
  const pendingRequests = useRef(new Map());

  useEffect(() => {
    if (typeof Worker === "undefined") return undefined;

    const requests = pendingRequests.current;
    let worker;
    try {
      worker = new Worker(
        new URL("./compiler/compiler.worker.js", import.meta.url),
        { type: "module", name: "forge-compiler" },
      );
    } catch {
      workerRef.current = null;
      return undefined;
    }

    const failWorker = (reason) => {
      const error = normalizeWorkerError(reason, "Compiler worker failed");
      for (const pending of requests.values()) pending.reject(error);
      requests.clear();
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      if (failWorkerRef.current === failWorker) {
        failWorkerRef.current = null;
      }
    };

    workerRef.current = worker;
    failWorkerRef.current = failWorker;
    worker.onmessage = ({ data }) => {
      if (!data || typeof data !== "object" || !Number.isSafeInteger(data.id)) {
        failWorker(new Error("Compiler worker returned a malformed response"));
        return;
      }
      const pending = requests.get(data.id);
      if (!pending) return;
      requests.delete(data.id);
      if (data.ok === true) {
        pending.resolve(data.value);
      } else if (data.ok === false) {
        pending.reject(
          normalizeWorkerError(data.error, "Compiler worker request failed"),
        );
      } else {
        pending.reject(
          new Error("Compiler worker returned a malformed response"),
        );
      }
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      failWorker(new Error(event.message || "Compiler worker failed"));
    };
    worker.onmessageerror = () => {
      failWorker(new Error("Compiler worker response could not be cloned"));
    };

    return () => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      if (failWorkerRef.current === failWorker) {
        failWorkerRef.current = null;
      }
      for (const pending of requests.values()) {
        pending.reject(new Error("Compiler worker stopped"));
      }
      requests.clear();
    };
  }, []);

  const request = useCallback((type, payload = {}) => {
    const worker = workerRef.current;
    if (!worker) return createFallbackRequest(type, payload);

    const id = nextRequestId.current;
    nextRequestId.current += 1;
    return new Promise((resolve, reject) => {
      pendingRequests.current.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, type, payload });
      } catch (error) {
        const failWorker = failWorkerRef.current;
        if (failWorker) {
          failWorker(error);
        } else {
          pendingRequests.current.delete(id);
          reject(normalizeWorkerError(error, "Compiler worker failed"));
        }
      }
    });
  }, []);

  return {
    compile: useCallback((source) => request("compile", { source }), [request]),
    verify: useCallback(() => request("verify"), [request]),
  };
}
