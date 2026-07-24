// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ForgeCompiler from "./App.jsx";

describe("ForgeCompiler interface", () => {
  it("exposes the editor and compiler inspectors accessibly", () => {
    render(<ForgeCompiler />);
    expect(screen.getByRole("heading", { name: "FORGE" })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "FORGE source code" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tablist", { name: "Compiler inspectors" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(screen.getByRole("tab", { name: /source/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("runs source through the complete pipeline", async () => {
    render(<ForgeCompiler />);
    fireEvent.click(screen.getByRole("button", { name: /run program/i }));

    await screen.findByText("forge://stdout");
    expect(screen.getByText("halted")).toBeInTheDocument();
    expect(screen.getByText(/a = \[10, 20, 30\]/)).toBeInTheDocument();
    expect(screen.getByText("Final global state")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("tab", { name: /source/i }));
    const nextEditor = screen.getByRole("textbox", {
      name: "FORGE source code",
    });
    fireEvent.change(nextEditor, {
      target: { value: `print(missing);` },
    });
    fireEvent.click(screen.getByRole("button", { name: /run program/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("analyze error");
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

    const sourceTab = screen.getByRole("tab", { name: /source/i });
    sourceTab.focus();
    fireEvent.keyDown(sourceTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /tokens/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
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
    fireEvent.click(screen.getByRole("button", { name: /verify pipeline/i }));
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Self-test passed");
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Repository CI runs separately on GitHub",
    );
  });
});
