import { useCallback, useEffect, useRef } from "react";
import { compileSource } from "./compiler/index.js";
import { runSelfTest } from "./compiler/selfTest.js";

function createFallbackRequest(type, payload) {
  return Promise.resolve().then(() => {
    if (type === "compile") return compileSource(payload.source);
    if (type === "verify") return runSelfTest();
    throw new Error(`Unknown compiler request: ${type}`);
  });
}

export function useCompilerWorker() {
  const workerRef = useRef(null);
  const nextRequestId = useRef(1);
  const pendingRequests = useRef(new Map());

  useEffect(() => {
    if (typeof Worker === "undefined") return undefined;

    const requests = pendingRequests.current;
    const worker = new Worker(
      new URL("./compiler/compiler.worker.js", import.meta.url),
      { type: "module", name: "forge-compiler" },
    );
    workerRef.current = worker;
    worker.onmessage = ({ data }) => {
      const pending = requests.get(data.id);
      if (!pending) return;
      requests.delete(data.id);
      if (data.ok) {
        pending.resolve(data.value);
      } else {
        const error = new Error(data.error.message);
        Object.assign(error, data.error);
        pending.reject(error);
      }
    };
    worker.onerror = (event) => {
      for (const pending of requests.values()) {
        pending.reject(new Error(event.message || "Compiler worker failed"));
      }
      requests.clear();
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
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
      worker.postMessage({ id, type, payload });
    });
  }, []);

  return {
    compile: useCallback((source) => request("compile", { source }), [request]),
    verify: useCallback(() => request("verify"), [request]),
  };
}
