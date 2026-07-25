// @vitest-environment jsdom

import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import ForgeCompiler from "./App.jsx";
import { compileSource } from "./compiler/index.js";

const originalStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "localStorage",
);
const draftStorage = new Map();
const testStorage = {
  clear: () => draftStorage.clear(),
  getItem: (key) => draftStorage.get(key) ?? null,
  removeItem: (key) => draftStorage.delete(key),
  setItem: (key, value) => draftStorage.set(key, String(value)),
};

function stubCompactViewport() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media) => ({
      matches: true,
      media,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

beforeAll(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: testStorage,
  });
});

beforeEach(() => {
  testStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  if (originalStorageDescriptor) {
    Object.defineProperty(window, "localStorage", originalStorageDescriptor);
  } else {
    delete window.localStorage;
  }
});

describe("ForgeCompiler interface", () => {
  it("exposes the editor and compiler inspectors accessibly", () => {
    render(<ForgeCompiler />);
    expect(screen.getByRole("heading", { name: "FORGE" })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "FORGE source code" }),
    ).toHaveAttribute("maxlength", "250000");
    expect(
      screen.getByRole("tablist", { name: "Compiler inspectors" }),
    ).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(5);
    expect(screen.getByRole("tab", { name: "Output" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    for (const tab of tabs) {
      expect(
        document.getElementById(tab.getAttribute("aria-controls")),
      ).not.toBeNull();
    }
    expect(screen.getByRole("tabpanel")).not.toHaveAttribute("tabindex");
    expect(
      screen.getByRole("region", { name: "Source program" }),
    ).toContainElement(
      screen.getByRole("textbox", { name: "FORGE source code" }),
    );
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(
      screen.getByRole("link", { name: "Skip to source editor" }),
    ).toHaveAttribute("href", "#forge-source");
  });

  it("discovers the shipped machine contract from the interface deck", () => {
    render(<ForgeCompiler />);
    const summary = screen.getByText("Interface deck").closest("summary");
    const deck = summary.closest("details");

    expect(deck).not.toHaveAttribute("open");
    fireEvent.click(summary);

    expect(deck).toHaveAttribute("open");
    expect(within(deck).getAllByText("forge.cli/v1")).toHaveLength(2);
    expect(within(deck).getByText(/resource 4/)).toBeInTheDocument();
    expect(within(deck).getByText(/public schemas/)).toBeInTheDocument();
  });

  it("runs source through the complete pipeline", async () => {
    render(<ForgeCompiler />);
    fireEvent.click(screen.getByRole("button", { name: /run program/i }));

    await screen.findByText("forge://stdout");
    expect(screen.getByText("halted")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Program output" }),
    ).toHaveTextContent("a = [10, 20, 30]");
    expect(screen.getByText("Final global state")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "FORGE source code" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Program output" }),
    ).toHaveAttribute("tabindex", "0");

    fireEvent.click(screen.getByRole("tab", { name: "AST" }));
    expect(
      screen.getByRole("region", { name: "Abstract syntax tree" }),
    ).toHaveAttribute("tabindex", "0");

    fireEvent.click(screen.getByRole("tab", { name: "Assembly" }));
    expect(
      screen.getByRole("table", { name: "Generated assembly" }),
    ).toHaveAttribute("tabindex", "0");

    fireEvent.click(screen.getByRole("tab", { name: "Trace" }));
    expect(
      screen.getByRole("region", { name: "Execution trace" }),
    ).toHaveAttribute("tabindex", "0");
  });

  it("clears stale results and reports a structured compiler error", async () => {
    render(<ForgeCompiler />);
    const editor = screen.getByRole("textbox", {
      name: "FORGE source code",
    });

    fireEvent.change(editor, { target: { value: `print("ok");` } });
    fireEvent.click(screen.getByRole("button", { name: /run program/i }));
    await screen.findByText("forge://stdout");
    expect(screen.getByText("ok")).toBeInTheDocument();

    fireEvent.change(editor, {
      target: { value: `print(missing);` },
    });
    fireEvent.click(screen.getByRole("button", { name: /run program/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("analyze fault");
    expect(alert).toHaveTextContent("Undefined variable: missing");
    expect(screen.queryByText("forge://stdout")).not.toBeInTheDocument();
  });

  it("supports keyboard indentation and keyboard tab navigation", () => {
    render(<ForgeCompiler />);
    const editor = screen.getByRole("textbox", {
      name: "FORGE source code",
    });
    fireEvent.change(editor, { target: { value: "x" } });
    editor.setSelectionRange(1, 1);
    fireEvent.keyDown(editor, { key: "Tab" });
    expect(editor).toHaveValue("x  ");
    expect(fireEvent.keyDown(editor, { key: "Tab", shiftKey: true })).toBe(
      true,
    );

    const outputTab = screen.getByRole("tab", { name: /output/i });
    outputTab.focus();
    fireEvent.keyDown(outputTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /trace/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("indents only the selected lines when the selection ends at column 0", () => {
    render(<ForgeCompiler />);
    const editor = screen.getByRole("textbox", {
      name: "FORGE source code",
    });
    fireEvent.change(editor, { target: { value: "alpha\nbeta" } });
    editor.setSelectionRange(0, 6);
    fireEvent.keyDown(editor, { key: "Tab" });
    expect(editor).toHaveValue("  alpha\nbeta");
    expect(editor.selectionStart).toBe(2);
    expect(editor.selectionEnd).toBe(8);
  });

  it("runs consecutive keyboard compilations after switching to Output", async () => {
    class ControlledWorker {
      constructor() {
        this.messages = [];
        this.terminate = () => {};
        ControlledWorker.instance = this;
      }

      postMessage(message) {
        this.messages.push(message);
      }
    }
    vi.stubGlobal("Worker", ControlledWorker);

    render(<ForgeCompiler />);
    const editor = screen.getByRole("textbox", {
      name: "FORGE source code",
    });
    fireEvent.change(editor, { target: { value: `print("shortcut");` } });
    editor.focus();

    expect(fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true })).toBe(
      false,
    );
    expect(ControlledWorker.instance.messages).toHaveLength(1);

    const firstRequest = ControlledWorker.instance.messages[0];
    await act(async () => {
      ControlledWorker.instance.onmessage({
        data: {
          id: firstRequest.id,
          ok: true,
          value: compileSource(firstRequest.payload.source),
        },
      });
    });

    const outputTab = screen.getByRole("tab", { name: "Output" });
    await waitFor(() => {
      expect(outputTab).toHaveAttribute("aria-selected", "true");
      expect(editor).toHaveFocus();
      expect(
        screen.getByRole("button", { name: /run program/i }),
      ).toBeEnabled();
    });

    expect(fireEvent.keyDown(editor, { key: "Enter", metaKey: true })).toBe(
      false,
    );
    expect(ControlledWorker.instance.messages).toHaveLength(2);

    const secondRequest = ControlledWorker.instance.messages[1];
    await act(async () => {
      ControlledWorker.instance.onmessage({
        data: {
          id: secondRequest.id,
          ok: true,
          value: compileSource(secondRequest.payload.source),
        },
      });
    });

    await waitFor(() => {
      expect(editor).toHaveFocus();
      expect(
        screen.getByRole("button", { name: /run program/i }),
      ).toBeEnabled();
    });
    expect(screen.getByText("shortcut")).toBeInTheDocument();
  });

  it("moves focus into the visible compact inspector after compiling", async () => {
    class ControlledWorker {
      constructor() {
        this.messages = [];
        this.terminate = () => {};
        ControlledWorker.instance = this;
      }

      postMessage(message) {
        this.messages.push(message);
      }
    }
    vi.stubGlobal("Worker", ControlledWorker);
    stubCompactViewport();

    render(<ForgeCompiler />);
    const app = screen.getByRole("main");
    const workbench = app.querySelector(".workbench");
    const editor = screen.getByRole("textbox", {
      name: "FORGE source code",
    });
    fireEvent.change(editor, { target: { value: `print("compact");` } });
    editor.focus();
    fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true });

    expect(app).not.toHaveAttribute("aria-busy");
    expect(workbench).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("status", { name: "Lab status" }),
    ).toHaveTextContent("Processing program");

    const request = ControlledWorker.instance.messages[0];
    await act(async () => {
      ControlledWorker.instance.onmessage({
        data: {
          id: request.id,
          ok: true,
          value: compileSource(request.payload.source),
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Output" })).toHaveFocus();
      expect(screen.getByRole("button", { name: "Inspector" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(workbench).toHaveAttribute("aria-busy", "false");
    });
  });

  it("makes the skip link reveal and focus source on compact screens", async () => {
    stubCompactViewport();
    render(<ForgeCompiler />);
    fireEvent.click(screen.getByRole("button", { name: "Inspector" }));
    fireEvent.click(
      screen.getByRole("link", { name: "Skip to source editor" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: "FORGE source code" }),
      ).toHaveFocus();
      expect(screen.getByRole("button", { name: "Source" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
  });

  it("shows Object prototype names as identifiers", async () => {
    render(<ForgeCompiler />);
    const editor = screen.getByRole("textbox", {
      name: "FORGE source code",
    });
    fireEvent.change(editor, {
      target: {
        value: `let constructor = 1; print(constructor);`,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /run program/i }));
    await screen.findByText("forge://stdout");
    fireEvent.click(screen.getByRole("tab", { name: /tokens/i }));

    const constructorTokens = screen
      .getAllByText("constructor")
      .map((element) => element.closest(".token-chip"))
      .filter(Boolean);
    expect(constructorTokens).toHaveLength(2);
    for (const token of constructorTokens) {
      expect(token).toHaveAttribute("data-tone", "identifier");
    }
  });

  it("labels the browser verifier as a self-test rather than CI", async () => {
    render(<ForgeCompiler />);
    fireEvent.click(screen.getByRole("button", { name: /run self-test/i }));
    const status = screen.getByRole("status", { name: "Lab status" });
    await waitFor(() => {
      expect(status).toHaveTextContent("Self-test passed");
    });
    expect(status).toHaveTextContent(
      "CI runs the differential and release gates",
    );
  });

  it("mounts a concise live status before any run", () => {
    render(<ForgeCompiler />);
    const status = screen.getByRole("status", { name: "Lab status" });
    expect(status).toHaveTextContent("Console standing by");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
  });

  it("serializes verification and keyboard compilation requests", async () => {
    class ControlledWorker {
      constructor() {
        this.messages = [];
        this.terminate = () => {};
        ControlledWorker.instance = this;
      }

      postMessage(message) {
        this.messages.push(message);
      }
    }
    vi.stubGlobal("Worker", ControlledWorker);

    render(<ForgeCompiler />);
    fireEvent.click(screen.getByRole("button", { name: /run self-test/i }));
    const editor = screen.getByRole("textbox", {
      name: "FORGE source code",
    });
    fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true });

    expect(ControlledWorker.instance.messages).toHaveLength(1);
    const request = ControlledWorker.instance.messages[0];
    expect(request.type).toBe("verify");

    act(() => {
      ControlledWorker.instance.onmessage({
        data: {
          id: request.id,
          ok: true,
          value: {
            ok: true,
            exampleCount: 1,
            assertionCount: 1,
            durationMilliseconds: 1,
          },
        },
      });
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /run program/i }),
      ).toBeEnabled();
    });
  });

  it("restores a versioned source draft", () => {
    window.localStorage.setItem(
      "forge-compiler:draft",
      JSON.stringify({
        version: 1,
        source: `print("saved draft");`,
      }),
    );
    render(<ForgeCompiler />);
    expect(
      screen.getByRole("textbox", { name: "FORGE source code" }),
    ).toHaveValue(`print("saved draft");`);
  });

  it("persists the selected console era", () => {
    render(<ForgeCompiler />);
    const app = screen.getByRole("main");
    expect(app).toHaveAttribute("data-era", "analog");

    fireEvent.click(screen.getByRole("radio", { name: /Neon.*1984/i }));

    expect(app).toHaveAttribute("data-era", "neon");
    expect(window.localStorage.getItem("forge-compiler:era")).toBe("neon");
  });

  it("offers one-step undo after loading an example", () => {
    render(<ForgeCompiler />);
    const editor = screen.getByRole("textbox", {
      name: "FORGE source code",
    });
    fireEvent.change(editor, {
      target: { value: `print("my draft");` },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Load example program" }),
      { target: { value: "Hello World" } },
    );

    expect(editor).toHaveValue(`print("Hello, World!");`);
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    expect(editor).toHaveValue(`print("my draft");`);
  });

  it("jumps from a structured diagnostic to its source position", async () => {
    render(<ForgeCompiler />);
    const editor = screen.getByRole("textbox", {
      name: "FORGE source code",
    });
    const source = `print("ok");\nprint(missing);`;
    fireEvent.change(editor, { target: { value: source } });
    fireEvent.click(screen.getByRole("button", { name: /run program/i }));

    const alert = await screen.findByRole("alert");
    const jump = within(alert).getByRole("button", { name: /Go to 2:/ });
    fireEvent.click(jump);

    expect(editor).toHaveFocus();
    expect(editor.selectionStart).toBe(source.indexOf("missing"));
    expect(screen.getByRole("button", { name: "Source" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("pages large inspectors instead of mounting every row", async () => {
    render(<ForgeCompiler />);
    const declarations = Array.from(
      { length: 45 },
      (_, index) => `let value_${index} = ${index};`,
    ).join("\n");
    fireEvent.change(
      screen.getByRole("textbox", { name: "FORGE source code" }),
      { target: { value: `${declarations}\nprint(value_44);` } },
    );
    fireEvent.click(screen.getByRole("button", { name: /run program/i }));
    await screen.findByText("forge://stdout");
    fireEvent.click(screen.getByRole("tab", { name: "Tokens" }));

    const pager = screen.getByRole("navigation", {
      name: "tokens pagination",
    });
    expect(pager).toHaveTextContent("1–120");
    fireEvent.click(within(pager).getByRole("button", { name: "Next page" }));
    expect(pager).toHaveTextContent("121–");
  });

  it("ignores an in-flight result after the source changes", async () => {
    class ControlledWorker {
      constructor() {
        this.messages = [];
        this.terminate = () => {};
        ControlledWorker.instance = this;
      }

      postMessage(message) {
        this.messages.push(message);
      }
    }
    vi.stubGlobal("Worker", ControlledWorker);

    const view = render(<ForgeCompiler />);
    const editor = screen.getByRole("textbox", {
      name: "FORGE source code",
    });
    fireEvent.change(editor, { target: { value: `print("old");` } });
    fireEvent.click(screen.getByRole("button", { name: /run program/i }));
    fireEvent.change(editor, { target: { value: `print("new");` } });

    const request = ControlledWorker.instance.messages[0];
    act(() => {
      ControlledWorker.instance.onmessage({
        data: {
          id: request.id,
          ok: true,
          value: compileSource(request.payload.source),
        },
      });
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /run program/i }),
      ).toBeEnabled();
    });
    expect(editor).toHaveValue(`print("new");`);
    expect(screen.queryByText("forge://stdout")).not.toBeInTheDocument();

    view.unmount();
  });
});
