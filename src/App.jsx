import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FORGE_VERSION,
  KEYWORDS,
  T,
  escapeForDisplay,
  formatValue,
  renderAst,
} from "./compiler/index.js";
import { EXAMPLES } from "./compiler/examples.js";
import { useCompilerWorker } from "./useCompilerWorker.js";
import "./App.css";

const TABS = [
  { id: "source", label: "Source", marker: "01" },
  { id: "tokens", label: "Tokens", marker: "02" },
  { id: "ast", label: "AST", marker: "03" },
  { id: "assembly", label: "Assembly", marker: "04" },
  { id: "output", label: "Output", marker: "05" },
  { id: "trace", label: "Trace", marker: "06" },
];

const MAX_VISIBLE_TOKENS = 2_000;
const MAX_VISIBLE_ASSEMBLY_ENTRIES = 5_000;

function tokenTone(token) {
  if (token.type === T.NUM) return "number";
  if (token.type === T.STR) return "string";
  if (token.type === T.IDENT) return "identifier";
  if (KEYWORDS[token.value]) return "keyword";
  return "operator";
}

function displayInstructionArgument(instruction) {
  if (instruction.argument === undefined) return "";
  if (instruction.opcode === "PUSH_STRING") {
    return `"${escapeForDisplay(instruction.argument)}"`;
  }
  return String(instruction.argument);
}

function formatMilliseconds(value) {
  if (value < 0.01) return "<0.01 ms";
  return `${value.toFixed(value < 10 ? 2 : 1)} ms`;
}

function TabPlaceholder() {
  return (
    <div className="empty-state">
      <span className="empty-state__glyph" aria-hidden="true">
        ⌁
      </span>
      <p>Run the program to inspect this compiler stage.</p>
      <span>Ctrl/⌘ + Enter</span>
    </div>
  );
}

function InspectorLimit({ artifact, count, limit, skipped = false }) {
  return (
    <div className="inspector-limit" role="status">
      <strong>{artifact} display capped</strong>
      <p>
        {skipped
          ? `Rendering was skipped because the program has ${count.toLocaleString("en-US")} tokens; the inspector limit is ${limit.toLocaleString("en-US")}.`
          : `Showing the first ${limit.toLocaleString("en-US")} of ${count.toLocaleString("en-US")} entries to keep the interface responsive.`}{" "}
        Compilation used the complete program.
      </p>
    </div>
  );
}

export default function ForgeCompiler() {
  const [source, setSource] = useState(EXAMPLES.Arrays);
  const [activeTab, setActiveTab] = useState("source");
  const [compilation, setCompilation] = useState(null);
  const [error, setError] = useState(null);
  const [verification, setVerification] = useState(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const textareaRef = useRef(null);
  const pendingCursor = useRef(null);
  const tabRefs = useRef(new Map());
  const { compile, verify } = useCompilerWorker();

  const isStale = Boolean(compilation && compilation.source !== source);
  const tokens = useMemo(
    () =>
      compilation
        ? compilation.tokens.filter((token) => token.type !== T.EOF)
        : [],
    [compilation],
  );
  const visibleTokens = useMemo(
    () => tokens.slice(0, MAX_VISIBLE_TOKENS),
    [tokens],
  );
  const visibleAssembly = useMemo(
    () =>
      compilation
        ? compilation.assembly
            .slice(0, MAX_VISIBLE_ASSEMBLY_ENTRIES)
            .map((instruction, index) => ({ instruction, index }))
        : [],
    [compilation],
  );
  const instructionCount = useMemo(
    () =>
      compilation
        ? compilation.assembly.filter(
            (instruction) => instruction.opcode !== "LABEL",
          ).length
        : 0,
    [compilation],
  );
  const sourceStats = useMemo(
    () => ({
      lines: source.length === 0 ? 1 : source.split("\n").length,
      characters: source.length,
    }),
    [source],
  );

  const runCompilation = useCallback(async () => {
    setIsCompiling(true);
    setError(null);
    setVerification(null);
    try {
      const nextCompilation = await compile(source);
      setCompilation(nextCompilation);
      setActiveTab("output");
    } catch (nextError) {
      setCompilation(null);
      setError(nextError);
      setActiveTab("source");
    } finally {
      setIsCompiling(false);
    }
  }, [compile, source]);

  const runVerification = useCallback(async () => {
    setIsVerifying(true);
    setVerification(null);
    try {
      setVerification(await verify());
    } catch (nextError) {
      setVerification({
        ok: false,
        failures: [{ name: "Verifier", message: nextError.message }],
      });
    } finally {
      setIsVerifying(false);
    }
  }, [verify]);

  useEffect(() => {
    if (textareaRef.current && pendingCursor.current !== null) {
      const cursor = pendingCursor.current;
      pendingCursor.current = null;
      textareaRef.current.setSelectionRange(cursor, cursor);
    }
  }, [source]);

  const handleEditorKeyDown = useCallback(
    (event) => {
      if (event.key === "Tab") {
        event.preventDefault();
        const editor = event.currentTarget;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        pendingCursor.current = start + 2;
        setSource(
          `${editor.value.slice(0, start)}  ${editor.value.slice(end)}`,
        );
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void runCompilation();
      }
    },
    [runCompilation],
  );

  const loadExample = useCallback((event) => {
    const selected = event.currentTarget.value;
    if (!EXAMPLES[selected]) return;
    setSource(EXAMPLES[selected]);
    setCompilation(null);
    setError(null);
    setVerification(null);
    setActiveTab("source");
  }, []);

  const handleTabKeyDown = useCallback(
    (event) => {
      const currentIndex = TABS.findIndex((tab) => tab.id === activeTab);
      let nextIndex;
      if (event.key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % TABS.length;
      } else if (event.key === "ArrowLeft") {
        nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = TABS.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      const nextTab = TABS[nextIndex].id;
      setActiveTab(nextTab);
      tabRefs.current.get(nextTab)?.focus();
    },
    [activeTab],
  );

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            F
          </span>
          <div>
            <div className="brand-row">
              <h1>FORGE</h1>
              <span className="version-badge">v{FORGE_VERSION}</span>
            </div>
            <p>Source-to-stack language laboratory</p>
          </div>
        </div>

        <div className="header-actions">
          <label className="select-field">
            <span>Example</span>
            <select
              value=""
              onChange={loadExample}
              aria-label="Load example program"
            >
              <option value="" disabled>
                Load an example…
              </option>
              {Object.keys(EXAMPLES).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => void runVerification()}
            disabled={isVerifying || isCompiling}
          >
            {isVerifying ? "Verifying…" : "Verify pipeline"}
          </button>
          <button
            className="button button--primary"
            type="button"
            onClick={() => void runCompilation()}
            disabled={isCompiling || isVerifying}
          >
            {isCompiling ? "Running…" : "Run program"}
            <kbd>⌘↵</kbd>
          </button>
        </div>
      </header>

      <section className="pipeline-strip" aria-label="Compiler pipeline">
        <span className="pipeline-strip__label">Pipeline</span>
        <ol>
          {["Lex", "Parse", "Analyze", "Generate", "Link", "Execute"].map(
            (stage, index) => (
              <li key={stage}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {stage}
              </li>
            ),
          )}
        </ol>
        <span className="pipeline-strip__mode">deterministic VM</span>
      </section>

      {verification && (
        <div
          className={`notice ${verification.ok ? "notice--success" : "notice--error"}`}
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true">{verification.ok ? "✓" : "×"}</span>
          {verification.ok ? (
            <p>
              Self-test passed: {verification.exampleCount} examples and{" "}
              {verification.assertionCount} assertions in{" "}
              {formatMilliseconds(verification.durationMilliseconds)}.
              Repository CI runs separately on GitHub.
            </p>
          ) : (
            <p>
              {verification.failures?.length ?? 1} self-test failure(s):{" "}
              {verification.failures
                ?.slice(0, 3)
                .map((failure) => `${failure.name}: ${failure.message}`)
                .join(" · ")}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="notice notice--error" role="alert">
          <span aria-hidden="true">×</span>
          <div>
            <strong>{error.phase ?? "compile"} error</strong>
            <p>{error.message}</p>
          </div>
        </div>
      )}

      {isStale && (
        <div className="notice notice--warning" role="status">
          <span aria-hidden="true">!</span>
          <p>Source changed after the last run. Inspector data is stale.</p>
        </div>
      )}

      <nav
        className="tab-bar"
        role="tablist"
        aria-label="Compiler inspectors"
        onKeyDown={handleTabKeyDown}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            ref={(element) => {
              if (element) tabRefs.current.set(tab.id, element);
            }}
            id={`tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.marker}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      <section
        className="workspace"
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === "source" && (
          <div className="editor-panel">
            <div className="panel-toolbar">
              <span>main.forge</span>
              <div>
                <span>{sourceStats.lines} lines</span>
                <span>{sourceStats.characters} chars</span>
                <span>UTF-16</span>
              </div>
            </div>
            <label className="sr-only" htmlFor="forge-source">
              FORGE source code
            </label>
            <textarea
              id="forge-source"
              ref={textareaRef}
              value={source}
              onChange={(event) => setSource(event.target.value)}
              onKeyDown={handleEditorKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="// Write FORGE code here…"
            />
            <div className="editor-hint">
              <span>Tab inserts two spaces</span>
              <span>Ctrl/⌘ + Enter runs</span>
            </div>
          </div>
        )}

        {activeTab === "tokens" &&
          (compilation ? (
            <div className="inspector-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Lexical stream</span>
                  <h2>{tokens.length} tokens</h2>
                </div>
                <span>{formatMilliseconds(compilation.timings.lex)}</span>
              </div>
              <div className="token-grid">
                {visibleTokens.map((token, index) => (
                  <div
                    className="token-chip"
                    data-tone={tokenTone(token)}
                    key={`${token.position.line}:${token.position.column}:${index}`}
                  >
                    <code>
                      {token.type === T.STR
                        ? `"${escapeForDisplay(token.value)}"`
                        : String(token.value)}
                    </code>
                    <span>{token.type}</span>
                    <small>
                      {token.position.line}:{token.position.column}
                    </small>
                  </div>
                ))}
              </div>
              {tokens.length > MAX_VISIBLE_TOKENS && (
                <InspectorLimit
                  artifact="Token"
                  count={tokens.length}
                  limit={MAX_VISIBLE_TOKENS}
                />
              )}
            </div>
          ) : (
            <TabPlaceholder />
          ))}

        {activeTab === "ast" &&
          (compilation ? (
            <div className="inspector-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Semantic tree</span>
                  <h2>Abstract syntax tree</h2>
                </div>
                <span>
                  {compilation.analysis.variables} vars ·{" "}
                  {compilation.analysis.functions} functions ·{" "}
                  {compilation.analysis.calls} calls
                </span>
              </div>
              {tokens.length > MAX_VISIBLE_TOKENS ? (
                <InspectorLimit
                  artifact="AST"
                  count={tokens.length}
                  limit={MAX_VISIBLE_TOKENS}
                  skipped
                />
              ) : (
                <pre className="code-block code-block--cyan">
                  {renderAst(compilation.ast)}
                </pre>
              )}
            </div>
          ) : (
            <TabPlaceholder />
          ))}

        {activeTab === "assembly" &&
          (compilation ? (
            <div className="inspector-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Stack machine</span>
                  <h2>{instructionCount} instructions</h2>
                </div>
                <span>{formatMilliseconds(compilation.timings.codegen)}</span>
              </div>
              <div className="assembly-list" role="table">
                {visibleAssembly.map(({ instruction, index }) =>
                  instruction.opcode === "LABEL" ? (
                    <div
                      className="assembly-label"
                      role="row"
                      key={`${instruction.argument}:${index}`}
                    >
                      {instruction.argument}:
                    </div>
                  ) : (
                    <div className="assembly-row" role="row" key={index}>
                      <span role="cell">
                        {String(
                          compilation.instructionAddresses[index],
                        ).padStart(4, "0")}
                      </span>
                      <strong role="cell">{instruction.opcode}</strong>
                      <code role="cell">
                        {displayInstructionArgument(instruction)}
                      </code>
                    </div>
                  ),
                )}
              </div>
              {compilation.assembly.length > MAX_VISIBLE_ASSEMBLY_ENTRIES && (
                <InspectorLimit
                  artifact="Assembly"
                  count={compilation.assembly.length}
                  limit={MAX_VISIBLE_ASSEMBLY_ENTRIES}
                />
              )}
            </div>
          ) : (
            <TabPlaceholder />
          ))}

        {activeTab === "output" &&
          (compilation ? (
            <div className="inspector-panel output-panel">
              <div className="metric-grid">
                <div>
                  <span>Termination</span>
                  <strong data-status={compilation.result.status}>
                    {compilation.result.status}
                  </strong>
                </div>
                <div>
                  <span>VM steps</span>
                  <strong>
                    {compilation.result.steps.toLocaleString("en-US")}
                  </strong>
                </div>
                <div>
                  <span>Output</span>
                  <strong>{compilation.result.output.length} records</strong>
                </div>
                <div>
                  <span>Total time</span>
                  <strong>
                    {formatMilliseconds(compilation.timings.total)}
                  </strong>
                </div>
              </div>
              <div className="terminal-card">
                <div className="terminal-card__bar">
                  <span>
                    <i />
                    <i />
                    <i />
                  </span>
                  forge://stdout
                </div>
                <pre>
                  {compilation.result.output.length > 0
                    ? compilation.result.output.join("\n")
                    : "(program produced no output)"}
                </pre>
              </div>
              {Object.keys(compilation.result.globals).length > 0 && (
                <div className="globals-card">
                  <span className="eyebrow">Final global state</span>
                  <dl>
                    {Object.entries(compilation.result.globals).map(
                      ([name, value]) => (
                        <div key={name}>
                          <dt>{name}</dt>
                          <dd>{formatValue(value)}</dd>
                        </div>
                      ),
                    )}
                  </dl>
                </div>
              )}
            </div>
          ) : (
            <TabPlaceholder />
          ))}

        {activeTab === "trace" &&
          (compilation ? (
            <div className="inspector-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Execution history</span>
                  <h2>{compilation.result.trace.length} captured operations</h2>
                </div>
                <span>
                  {compilation.result.traceOverflow
                    ? `capped from ${compilation.result.steps}`
                    : "complete trace"}
                </span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">PC</th>
                      <th scope="col">Opcode</th>
                      <th scope="col">Argument</th>
                      <th scope="col">Stack after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compilation.result.trace.map((entry, index) => (
                      <tr key={`${entry.programCounter}:${index}`}>
                        <td>{entry.programCounter}</td>
                        <td>{entry.opcode}</td>
                        <td>
                          {entry.argument === undefined
                            ? "—"
                            : String(entry.argument)}
                        </td>
                        <td>
                          [
                          {entry.stackAfter
                            .map((value) => formatValue(value))
                            .join(", ")}
                          ]
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <TabPlaceholder />
          ))}
      </section>

      <footer className="app-footer">
        <div>
          <span>FORGE v{FORGE_VERSION}</span>
          <span>Finite-number VM</span>
          <span>Lexical scope</span>
          <span>Bounded execution</span>
        </div>
        <a
          href="https://github.com/0thernes/forge-compiler"
          target="_blank"
          rel="noreferrer"
        >
          Source &amp; language guide ↗
        </a>
      </footer>
    </main>
  );
}
