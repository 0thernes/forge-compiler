import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_LIMITS,
  FORGE_VERSION,
  KEYWORDS,
  T,
} from "./compiler/constants.js";
import { renderAst } from "./compiler/ast.js";
import { EXAMPLES } from "./compiler/examples.js";
import { formatForPrint, formatValue } from "./compiler/format.js";
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
const MAX_VISIBLE_GLOBALS = 500;
const MAX_VISIBLE_TRACE_ENTRIES = 250;
const MAX_VISIBLE_OUTPUT_CHARACTERS = 100_000;
const MAX_INSPECTOR_VALUE_CHARACTERS = 2_000;
const MAX_AST_SOURCE_CHARACTERS = 50_000;
const DRAFT_KEY = "forge-compiler:draft";
const DRAFT_VERSION = 1;

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
    return formatValue(instruction.argument, {
      maxCharacters: MAX_INSPECTOR_VALUE_CHARACTERS,
    });
  }
  return formatForPrint(String(instruction.argument), {
    maxCharacters: MAX_INSPECTOR_VALUE_CHARACTERS,
  });
}

function displayTokenValue(token) {
  const formatter = token.type === T.STR ? formatValue : formatForPrint;
  return formatter(token.type === T.STR ? token.value : String(token.value), {
    maxCharacters: MAX_INSPECTOR_VALUE_CHARACTERS,
  });
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

function InspectorLimit({
  artifact,
  count,
  limit,
  skipped = false,
  unit = "entries",
}) {
  return (
    <div className="inspector-limit" role="status">
      <strong>{artifact} display capped</strong>
      <p>
        {skipped
          ? `Rendering was skipped because the program has ${count.toLocaleString("en-US")} ${unit}; the inspector limit is ${limit.toLocaleString("en-US")}.`
          : `Showing the first ${limit.toLocaleString("en-US")} of ${count.toLocaleString("en-US")} ${unit} to keep the interface responsive.`}{" "}
        Compilation used the complete program.
      </p>
    </div>
  );
}

function loadDraft() {
  if (typeof window === "undefined") return EXAMPLES.Arrays;
  try {
    const saved = JSON.parse(window.localStorage.getItem(DRAFT_KEY));
    if (
      saved?.version === DRAFT_VERSION &&
      typeof saved.source === "string" &&
      saved.source.length <= DEFAULT_LIMITS.maxSourceLength
    ) {
      return saved.source;
    }
  } catch {
    // Storage may be unavailable or contain data from an older format.
  }
  return EXAMPLES.Arrays;
}

export default function ForgeCompiler() {
  const [source, setSource] = useState(loadDraft);
  const [activeTab, setActiveTab] = useState("source");
  const [compilation, setCompilation] = useState(null);
  const [error, setError] = useState(null);
  const [verification, setVerification] = useState(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const textareaRef = useRef(null);
  const pendingSelection = useRef(null);
  const tabRefs = useRef(new Map());
  const sourceRevision = useRef(0);
  const nextCompileRequest = useRef(0);
  const activeCompileRequest = useRef(null);
  const nextVerificationRequest = useRef(0);
  const activeVerificationRequest = useRef(null);
  const mounted = useRef(true);
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
  const globals = useMemo(
    () => (compilation ? Object.entries(compilation.result.globals) : []),
    [compilation],
  );
  const visibleGlobals = useMemo(
    () => globals.slice(0, MAX_VISIBLE_GLOBALS),
    [globals],
  );
  const visibleTrace = useMemo(
    () =>
      compilation
        ? compilation.result.trace.slice(0, MAX_VISIBLE_TRACE_ENTRIES)
        : [],
    [compilation],
  );
  const outputText = useMemo(
    () =>
      compilation && compilation.result.output.length > 0
        ? compilation.result.output.join("\n")
        : "(program produced no output)",
    [compilation],
  );
  const visibleOutput = outputText.slice(0, MAX_VISIBLE_OUTPUT_CHARACTERS);
  const outputDisplayCapped = outputText.length > MAX_VISIBLE_OUTPUT_CHARACTERS;
  const compiledSourceLength = compilation?.source.length ?? 0;
  const skipAst =
    tokens.length > MAX_VISIBLE_TOKENS ||
    compiledSourceLength > MAX_AST_SOURCE_CHARACTERS;
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

  const updateSource = useCallback((nextSource) => {
    sourceRevision.current += 1;
    setSource(nextSource);
  }, []);

  const runCompilation = useCallback(async () => {
    if (
      activeCompileRequest.current !== null ||
      activeVerificationRequest.current !== null
    ) {
      return;
    }
    const requestId = nextCompileRequest.current + 1;
    nextCompileRequest.current = requestId;
    activeCompileRequest.current = requestId;
    const revision = sourceRevision.current;
    const sourceSnapshot = source;
    setIsCompiling(true);
    setError(null);
    setVerification(null);
    try {
      const nextCompilation = await compile(sourceSnapshot);
      if (
        !mounted.current ||
        activeCompileRequest.current !== requestId ||
        sourceRevision.current !== revision
      ) {
        return;
      }
      setCompilation(nextCompilation);
      setActiveTab("output");
    } catch (nextError) {
      if (
        !mounted.current ||
        activeCompileRequest.current !== requestId ||
        sourceRevision.current !== revision
      ) {
        return;
      }
      setCompilation(null);
      setError(nextError);
      setActiveTab("source");
    } finally {
      if (mounted.current && activeCompileRequest.current === requestId) {
        activeCompileRequest.current = null;
        setIsCompiling(false);
      }
    }
  }, [compile, source]);

  const runVerification = useCallback(async () => {
    if (
      activeVerificationRequest.current !== null ||
      activeCompileRequest.current !== null
    ) {
      return;
    }
    const requestId = nextVerificationRequest.current + 1;
    nextVerificationRequest.current = requestId;
    activeVerificationRequest.current = requestId;
    setIsVerifying(true);
    setVerification(null);
    try {
      const report = await verify();
      if (mounted.current && activeVerificationRequest.current === requestId) {
        setVerification(report);
      }
    } catch (nextError) {
      if (mounted.current && activeVerificationRequest.current === requestId) {
        setVerification({
          ok: false,
          failures: [{ name: "Verifier", message: nextError.message }],
        });
      }
    } finally {
      if (mounted.current && activeVerificationRequest.current === requestId) {
        activeVerificationRequest.current = null;
        setIsVerifying(false);
      }
    }
  }, [verify]);

  useEffect(() => {
    if (textareaRef.current && pendingSelection.current !== null) {
      const selection = pendingSelection.current;
      pendingSelection.current = null;
      textareaRef.current.setSelectionRange(selection.start, selection.end);
    }
  }, [source]);

  useEffect(() => {
    if (source.length > DEFAULT_LIMITS.maxSourceLength) return undefined;
    const timeout = setTimeout(() => {
      try {
        window.localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ version: DRAFT_VERSION, source }),
        );
      } catch {
        // Draft persistence is best-effort in restricted browser contexts.
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [source]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeCompileRequest.current = null;
      activeVerificationRequest.current = null;
    };
  }, []);

  const handleEditorKeyDown = useCallback(
    (event) => {
      if (event.key === "Tab" && !event.shiftKey) {
        event.preventDefault();
        const editor = event.currentTarget;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        if (start === end) {
          pendingSelection.current = {
            start: start + 2,
            end: start + 2,
          };
          updateSource(
            `${editor.value.slice(0, start)}  ${editor.value.slice(end)}`,
          );
        } else {
          const lineStart = editor.value.lastIndexOf("\n", start - 1) + 1;
          const selected = editor.value.slice(lineStart, end);
          const indented = selected.replace(/^/gm, "  ");
          const addedCharacters = indented.length - selected.length;
          pendingSelection.current = {
            start: start + 2,
            end: end + addedCharacters,
          };
          updateSource(
            `${editor.value.slice(0, lineStart)}${indented}${editor.value.slice(end)}`,
          );
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void runCompilation();
      }
    },
    [runCompilation, updateSource],
  );

  const loadExample = useCallback(
    (event) => {
      const selected = event.currentTarget.value;
      if (!EXAMPLES[selected]) return;
      updateSource(EXAMPLES[selected]);
      setCompilation(null);
      setError(null);
      setVerification(null);
      setActiveTab("source");
    },
    [updateSource],
  );

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
              {formatMilliseconds(verification.durationMilliseconds)}. The
              repository workflow runs the full release gate when hosted on
              GitHub.
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
            <span aria-hidden="true">{tab.marker}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      <section
        className="workspace"
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={0}
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
              onChange={(event) => updateSource(event.target.value)}
              onKeyDown={handleEditorKeyDown}
              maxLength={DEFAULT_LIMITS.maxSourceLength}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="// Write FORGE code here…"
            />
            <div className="editor-hint">
              <span>Tab inserts two spaces</span>
              <span>Shift + Tab leaves the editor</span>
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
                    <code>{displayTokenValue(token)}</code>
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
              {skipAst ? (
                <InspectorLimit
                  artifact="AST"
                  count={
                    tokens.length > MAX_VISIBLE_TOKENS
                      ? tokens.length
                      : compiledSourceLength
                  }
                  limit={
                    tokens.length > MAX_VISIBLE_TOKENS
                      ? MAX_VISIBLE_TOKENS
                      : MAX_AST_SOURCE_CHARACTERS
                  }
                  unit={
                    tokens.length > MAX_VISIBLE_TOKENS
                      ? "tokens"
                      : "source characters"
                  }
                  skipped
                />
              ) : (
                <pre
                  className="code-block code-block--cyan"
                  role="region"
                  aria-label="Abstract syntax tree"
                  tabIndex={0}
                >
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
                <span>
                  {formatMilliseconds(
                    compilation.timings.codegen + compilation.timings.link,
                  )}{" "}
                  generate + link
                </span>
              </div>
              <div
                className="assembly-list"
                role="table"
                aria-label="Generated assembly"
                tabIndex={0}
              >
                <div className="sr-only" role="rowgroup">
                  <div role="row">
                    <span role="columnheader">Address</span>
                    <span role="columnheader">Opcode</span>
                    <span role="columnheader">Argument</span>
                  </div>
                </div>
                <div role="rowgroup">
                  {visibleAssembly.map(({ instruction, index }) =>
                    instruction.opcode === "LABEL" ? (
                      <div
                        className="assembly-label"
                        role="row"
                        key={`${instruction.argument}:${index}`}
                      >
                        <span role="cell" aria-label="No address">
                          —
                        </span>
                        <strong role="cell">LABEL</strong>
                        <code role="cell">{instruction.argument}:</code>
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
                <pre role="region" aria-label="Program output" tabIndex={0}>
                  {visibleOutput}
                </pre>
              </div>
              {outputDisplayCapped && (
                <InspectorLimit
                  artifact="Output"
                  count={outputText.length}
                  limit={MAX_VISIBLE_OUTPUT_CHARACTERS}
                  unit="characters"
                />
              )}
              {globals.length > 0 && (
                <div className="globals-card">
                  <span className="eyebrow">Final global state</span>
                  <dl>
                    {visibleGlobals.map(([name, value]) => (
                      <div key={name}>
                        <dt>{name}</dt>
                        <dd>
                          {formatValue(value, {
                            maxCharacters: MAX_INSPECTOR_VALUE_CHARACTERS,
                          })}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {globals.length > MAX_VISIBLE_GLOBALS && (
                    <InspectorLimit
                      artifact="Global"
                      count={globals.length}
                      limit={MAX_VISIBLE_GLOBALS}
                    />
                  )}
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
              <div
                className="table-scroll"
                role="region"
                aria-label="Execution trace"
                tabIndex={0}
              >
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
                    {visibleTrace.map((entry, index) => (
                      <tr key={`${entry.programCounter}:${index}`}>
                        <td>{entry.programCounter}</td>
                        <td>{entry.opcode}</td>
                        <td>
                          {entry.argument === undefined
                            ? "—"
                            : formatForPrint(String(entry.argument), {
                                maxCharacters: MAX_INSPECTOR_VALUE_CHARACTERS,
                              })}
                        </td>
                        <td>
                          {formatValue(entry.stackAfter, {
                            maxCharacters: MAX_INSPECTOR_VALUE_CHARACTERS,
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {compilation.result.trace.length > MAX_VISIBLE_TRACE_ENTRIES && (
                <InspectorLimit
                  artifact="Trace"
                  count={compilation.result.trace.length}
                  limit={MAX_VISIBLE_TRACE_ENTRIES}
                />
              )}
            </div>
          ) : (
            <TabPlaceholder />
          ))}
      </section>
      {TABS.filter((tab) => tab.id !== activeTab).map((tab) => (
        <section
          key={tab.id}
          id={`panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab.id}`}
          hidden
        />
      ))}

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
