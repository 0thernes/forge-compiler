import { describe, expect, it } from "vitest";
import {
  ProtocolOutputLimitError,
  encodeProtocolValue,
  isProtocolOutputLimitError,
  stringifyProtocolValue,
} from "../src/cli/contract.js";
import { projectAssembly } from "../src/cli/projections.js";

describe("CLI protocol output budget", () => {
  it("keeps required unlinked instruction addresses explicit", () => {
    expect(projectAssembly([{ opcode: "HALT" }], [])).toEqual({
      schema: "forge.assembly/v1",
      linked: false,
      instructions: [{ index: 0, address: null, opcode: "HALT" }],
    });
  });

  it("keeps deeply nested values stack-safe within the default budget", () => {
    const root = [];
    let cursor = root;
    for (let depth = 0; depth < 20_000; depth += 1) {
      const child = [];
      cursor.push(child);
      cursor = child;
    }

    const output = stringifyProtocolValue(encodeProtocolValue(root));
    let decoded = JSON.parse(output);
    let depth = 0;
    while (decoded.length > 0) {
      decoded = decoded[0];
      depth += 1;
    }
    expect(depth).toBe(20_000);
  });

  it("retains explicit cyclic and shared reference paths", () => {
    const shared = [1];
    const root = { first: shared, again: shared };
    shared.push(root);

    const encoded = encodeProtocolValue(root);

    expect(encoded.first[1]).toEqual({
      $forge: "reference",
      path: "#",
    });
    expect(encoded.again).toEqual({
      $forge: "reference",
      path: "#/first",
    });
  });

  it("bounds aggregate amplification from repeated deep references", () => {
    const shared = { value: 1 };
    let deep = shared;
    for (let depth = 0; depth < 100; depth += 1) deep = [deep];
    const graph = {
      deep,
      repeated: Array.from({ length: 100 }, () => shared),
    };

    expect(() =>
      encodeProtocolValue(graph, "#", new WeakMap(), 1_024),
    ).toThrowError(ProtocolOutputLimitError);

    try {
      encodeProtocolValue(graph, "#", new WeakMap(), 1_024);
    } catch (error) {
      expect(isProtocolOutputLimitError(error)).toBe(true);
      expect(error).toMatchObject({
        code: "CLI_PROTOCOL_OUTPUT_LIMIT",
        phase: "cli",
        limitBytes: 1_024,
        stage: "encoding",
      });
    }
  });

  it("charges final pretty-print whitespace against the same ceiling", () => {
    const value = { one: { two: { three: [1, 2, 3] } } };
    const compact = stringifyProtocolValue(value);
    const pretty = stringifyProtocolValue(value, true);

    expect(compact.length).toBeLessThan(pretty.length);
    expect(() =>
      stringifyProtocolValue(value, true, compact.length),
    ).toThrowError(
      expect.objectContaining({
        code: "CLI_PROTOCOL_OUTPUT_LIMIT",
        stage: "serialization",
      }),
    );
  });

  it("charges escaped and multibyte strings by emitted UTF-8 bytes", () => {
    const value = '"é\n'.repeat(20);
    const output = stringifyProtocolValue(value);
    const exactBytes = Buffer.byteLength(output, "utf8");

    expect(() =>
      stringifyProtocolValue(value, false, exactBytes - 1),
    ).toThrowError(ProtocolOutputLimitError);
    expect(stringifyProtocolValue(value, false, exactBytes)).toBe(output);
  });
});
