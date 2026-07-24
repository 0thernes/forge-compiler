// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCompilerWorker } from "./useCompilerWorker.js";

const originalWorker = globalThis.Worker;

class FakeWorker {
  static instances = [];

  constructor() {
    this.postMessage = vi.fn();
    this.terminate = vi.fn();
    FakeWorker.instances.push(this);
  }
}

afterEach(() => {
  FakeWorker.instances.length = 0;
  if (originalWorker === undefined) {
    delete globalThis.Worker;
  } else {
    globalThis.Worker = originalWorker;
  }
});

describe("useCompilerWorker", () => {
  it("lazily falls back when workers are unavailable", async () => {
    delete globalThis.Worker;
    const { result } = renderHook(() => useCompilerWorker());

    const compilation = await result.current.compile(`print("fallback");`);
    expect(compilation).toMatchObject({
      result: { output: ["fallback"] },
    });
    expect(compilation).not.toHaveProperty("linkedCode");
    await expect(result.current.verify()).resolves.toMatchObject({ ok: true });
  });

  it("resolves and rejects requests from structured worker responses", async () => {
    globalThis.Worker = FakeWorker;
    const { result, unmount } = renderHook(() => useCompilerWorker());
    const worker = FakeWorker.instances[0];

    const successful = result.current.compile(`print(1);`);
    const successMessage = worker.postMessage.mock.calls[0][0];
    act(() => {
      worker.onmessage({
        data: {
          id: successMessage.id,
          ok: true,
          value: { result: { output: ["1"] } },
        },
      });
    });
    await expect(successful).resolves.toMatchObject({
      result: { output: ["1"] },
    });

    const failed = result.current.compile(`print(missing);`);
    const failureMessage = worker.postMessage.mock.calls[1][0];
    act(() => {
      worker.onmessage({
        data: {
          id: failureMessage.id,
          ok: false,
          error: {
            message: "Undefined variable: missing",
            phase: "analyze",
          },
        },
      });
    });
    await expect(failed).rejects.toMatchObject({
      message: "Undefined variable: missing",
      phase: "analyze",
    });

    unmount();
    expect(worker.terminate).toHaveBeenCalled();
  });

  it("rejects pending work and falls back after a worker failure", async () => {
    globalThis.Worker = FakeWorker;
    const { result } = renderHook(() => useCompilerWorker());
    const worker = FakeWorker.instances[0];
    const pending = result.current.compile(`print("worker");`);
    const rejection = expect(pending).rejects.toThrow("worker crashed");

    act(() => {
      worker.onerror({
        message: "worker crashed",
        preventDefault: vi.fn(),
      });
    });
    await rejection;
    expect(worker.terminate).toHaveBeenCalled();

    await expect(
      result.current.compile(`print("fallback");`),
    ).resolves.toMatchObject({
      result: { output: ["fallback"] },
    });
  });

  it("handles constructor, cloning, and postMessage failures", async () => {
    globalThis.Worker = class {
      constructor() {
        throw new Error("blocked by policy");
      }
    };
    const constructorFailure = renderHook(() => useCompilerWorker());
    await expect(
      constructorFailure.result.current.compile(`print("fallback");`),
    ).resolves.toMatchObject({ result: { output: ["fallback"] } });
    constructorFailure.unmount();

    globalThis.Worker = FakeWorker;
    const postingFailure = renderHook(() => useCompilerWorker());
    const postingWorker = FakeWorker.instances.at(-1);
    postingWorker.postMessage.mockImplementation(() => {
      throw new Error("clone failed");
    });
    await expect(
      postingFailure.result.current.compile(`print(1);`),
    ).rejects.toThrow("clone failed");
    expect(postingWorker.terminate).toHaveBeenCalled();
    postingFailure.unmount();

    const messageFailure = renderHook(() => useCompilerWorker());
    const messageWorker = FakeWorker.instances.at(-1);
    const pending = messageFailure.result.current.compile(`print(1);`);
    const rejection = expect(pending).rejects.toThrow(
      "response could not be cloned",
    );
    act(() => {
      messageWorker.onmessageerror();
    });
    await rejection;
    expect(messageWorker.terminate).toHaveBeenCalled();
    messageFailure.unmount();
  });
});
