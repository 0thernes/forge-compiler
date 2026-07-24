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
import { EraDial, ERA_PROFILES } from "./components/EraDial.jsx";
import { InspectorPager } from "./components/InspectorPager.jsx";
import { useCompilerWorker } from "./useCompilerWorker.js";
import "./App.css";

const INSPECTORS = [
  { id: "tokens", label: "Tokens", marker: "01", hint: "lexical stream" },
  { id: "ast", label: "AST", marker: "02", hint: "semantic tree" },
  { id: "assembly", label: "Assembly", marker: "03", hint: "stack program" },
  { id: "output", label: "Output", marker: "04", hint: "run result" },
  { id: "trace", label: "Trace", marker: "05", hint: "execution history" },
];

const PIPELINE_STAGES = [
  { id: "lex", label: "Lex", hint: "scan" },
  { id: "parse", label: "Parse", hint: "shape" },
  { id: "analyze", label: "Analyze", hint: "prove" },
  { id: "codegen", label: "Generate", hint: "lower" },
  { id: "link", label: "Link", hint: "resolve" },
  { id: "execute", label: "Execute", hint: "run" },
];

const TOKEN_PAGE_SIZE = 120;
const ASSEMBLY_PAGE_SIZE = 200;
const TRACE_PAGE_SIZE = 100;
const MAX_AST_TOKENS = 2_000;
const MAX_VISIBLE_GLOBALS = 500;
const MAX_VISIBLE_OUTPUT_CHARACTERS = 100_000;
const MAX_INSPECTOR_VALUE_CHARACTERS = 2_000;
const MAX_AST_SOURCE_CHARACTERS = 50_000;
const DRAFT_KEY = "forge-compiler:draft";
const DRAFT_VERSION = 1;
const ERA_KEY = "forge-compiler:era";

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

function loadEra() {
  if (typeof window === "undefined") return "analog";
  try {
    const saved = window.localStorage.getItem(ERA_KEY);
    if (ERA_PROFILES.some((profile) => profile.id === saved)) return saved;
  } catch {
    // Appearance persistence is best-effort in restricted browser contexts.
  }
  return "analog";
}

function offsetForPosition(source, position) {
  if (!position?.line || !position?.column) return 0;
  const lines = source.split("\n");
  const preceding = lines
    .slice(0, Math.max(0, position.line - 1))
    .reduce((total, line) => total + line.length + 1, 0);
  return Math.min(source.length, preceding + Math.max(0, position.column - 1));
}

function isCompactWorkbench() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 960px)").matches
  );
}

function resetScroll(element) {
  if (!element) return;
  element.scrollTop = 0;
  element.scrollLeft = 0;
}

export default function ForgeCompiler() {
  const [source, setSource] = useState(loadDraft);
  const [activeInspector, setActiveInspector] = useState("output");
  const [mobilePane, setMobilePane] = useState("source");
  const [era, setEra] = useState(loadEra);
  const [compilation, setCompilation] = useState(null);
  const [error, setError] = useState(null);
  const [verification, setVerification] = useState(null);
  const [previousExample, setPreviousExample] = useState(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [tokenPage, setTokenPage] = useState(0);
  const [assemblyPage, setAssemblyPage] = useState(0);
  const [tracePage, setTracePage] = useState(0);
  const [focusRequestRevision, setFocusRequestRevision] = useState(0);
  const textareaRef = useRef(null);
  const pendingSelection = useRef(null);
  const pendingPaneFocus = useRef(null);
  const tabRefs = useRef(new Map());
  const workspaceRef = useRef(null);
  const assemblyListRef = useRef(null);
  const traceTableRef = useRef(null);
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
    () =>
      tokens.slice(
        tokenPage * TOKEN_PAGE_SIZE,
        (tokenPage + 1) * TOKEN_PAGE_SIZE,
      ),
    [tokenPage, tokens],
  );
  const visibleAssembly = useMemo(() => {
    if (!compilation) return [];
    const start = assemblyPage * ASSEMBLY_PAGE_SIZE;
    return compilation.assembly
      .slice(start, start + ASSEMBLY_PAGE_SIZE)
      .map((instruction, index) => ({
        instruction,
        index: start + index,
      }));
  }, [assemblyPage, compilation]);
  const globals = useMemo(
    () => (compilation ? Object.entries(compilation.result.globals) : []),
    [compilation],
  );
  const visibleGlobals = useMemo(
    () => globals.slice(0, MAX_VISIBLE_GLOBALS),
    [globals],
  );
  const visibleTrace = useMemo(() => {
    if (!compilation) return [];
    const start = tracePage * TRACE_PAGE_SIZE;
    return compilation.result.trace.slice(start, start + TRACE_PAGE_SIZE);
  }, [compilation, tracePage]);
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
    tokens.length > MAX_AST_TOKENS ||
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
  const selectedEra =
    ERA_PROFILES.find((profile) => profile.id === era) ?? ERA_PROFILES[0];
  const runState = isCompiling
    ? "processing"
    : isVerifying
      ? "testing"
      : error
        ? "fault"
        : isStale
          ? "stale"
          : compilation
            ? "ready"
            : "idle";

  const updateSource = useCallback((nextSource) => {
    sourceRevision.current += 1;
    setSource(nextSource);
  }, []);

  const editSource = useCallback(
    (nextSource) => {
      setPreviousExample(null);
      updateSource(nextSource);
    },
    [updateSource],
  );

  const resetInspectorPages = useCallback(() => {
    setTokenPage(0);
    setAssemblyPage(0);
    setTracePage(0);
  }, []);

  const requestPaneFocus = useCallback((target, selection = null) => {
    pendingPaneFocus.current = { target, selection };
    setMobilePane(target);
    setFocusRequestRevision((revision) => revision + 1);
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
      setActiveInspector("output");
      setMobilePane("inspector");
      if (isCompactWorkbench()) requestPaneFocus("inspector");
      resetInspectorPages();
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
      setMobilePane("source");
      if (isCompactWorkbench()) requestPaneFocus("source");
    } finally {
      if (mounted.current && activeCompileRequest.current === requestId) {
        activeCompileRequest.current = null;
        setIsCompiling(false);
      }
    }
  }, [compile, requestPaneFocus, resetInspectorPages, source]);

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
    const request = pendingPaneFocus.current;
    if (!request || request.target !== mobilePane) return;
    pendingPaneFocus.current = null;

    if (request.target === "source") {
      textareaRef.current?.focus();
      if (request.selection !== null && textareaRef.current) {
        textareaRef.current.setSelectionRange(
          request.selection,
          request.selection,
        );
      }
      return;
    }
    tabRefs.current.get(activeInspector)?.focus();
  }, [activeInspector, focusRequestRevision, mobilePane]);

  useEffect(() => {
    resetScroll(workspaceRef.current);
    if (activeInspector === "assembly") resetScroll(assemblyListRef.current);
    if (activeInspector === "trace") resetScroll(traceTableRef.current);
  }, [activeInspector, assemblyPage, tokenPage, tracePage]);

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
    try {
      window.localStorage.setItem(ERA_KEY, era);
    } catch {
      // Appearance persistence is best-effort in restricted browser contexts.
    }
  }, [era]);

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
          editSource(
            `${editor.value.slice(0, start)}  ${editor.value.slice(end)}`,
          );
        } else {
          const effectiveEnd =
            end > start && editor.value[end - 1] === "\n" ? end - 1 : end;
          const lineStart = editor.value.lastIndexOf("\n", start - 1) + 1;
          const selected = editor.value.slice(lineStart, effectiveEnd);
          const indented = selected.replace(/^/gm, "  ");
          const addedCharacters = indented.length - selected.length;
          pendingSelection.current = {
            start: start + 2,
            end: end + addedCharacters,
          };
          editSource(
            `${editor.value.slice(0, lineStart)}${indented}${editor.value.slice(effectiveEnd)}`,
          );
        }
      }
    },
    [editSource],
  );

  const handleAppKeyDown = useCallback(
    (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        if (!event.repeat) void runCompilation();
      }
    },
    [runCompilation],
  );

  const loadExample = useCallback(
    (event) => {
      const selected = event.currentTarget.value;
      if (!EXAMPLES[selected]) return;
      setPreviousExample({ name: selected, source });
      updateSource(EXAMPLES[selected]);
      setCompilation(null);
      setError(null);
      setVerification(null);
      setMobilePane("source");
      resetInspectorPages();
    },
    [resetInspectorPages, source, updateSource],
  );

  const undoExample = useCallback(() => {
    if (!previousExample) return;
    updateSource(previousExample.source);
    setPreviousExample(null);
    setCompilation(null);
    setError(null);
    setVerification(null);
    setMobilePane("source");
  }, [previousExample, updateSource]);

  const focusErrorPosition = useCallback(() => {
    if (!error?.position || !textareaRef.current) return;
    const offset = offsetForPosition(source, error.position);
    requestPaneFocus("source", offset);
  }, [error, requestPaneFocus, source]);

  const handleSkipToSource = useCallback(
    (event) => {
      event.preventDefault();
      requestPaneFocus("source");
    },
    [requestPaneFocus],
  );

  const handleTabKeyDown = useCallback(
    (event) => {
      const currentIndex = INSPECTORS.findIndex(
        (tab) => tab.id === activeInspector,
      );
      let nextIndex;
      if (event.key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % INSPECTORS.length;
      } else if (event.key === "ArrowLeft") {
        nextIndex = (currentIndex - 1 + INSPECTORS.length) % INSPECTORS.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = INSPECTORS.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      const nextTab = INSPECTORS[nextIndex].id;
      setActiveInspector(nextTab);
      tabRefs.current.get(nextTab)?.focus();
    },
    [activeInspector],
  );

  const labMessage = error
    ? {
        tone: "error",
        label: `${error.phase ?? "compile"} fault`,
        detail: error.message,
        glyph: "×",
      }
    : verification
      ? {
          tone: verification.ok ? "success" : "error",
          label: verification.ok ? "Self-test passed" : "Self-test failed",
          detail: verification.ok
            ? `${verification.exampleCount} examples and ${verification.assertionCount} assertions agreed in ${formatMilliseconds(verification.durationMilliseconds)}. CI runs the differential and release gates.`
            : `${verification.failures?.length ?? 1} failure(s): ${verification.failures
                ?.slice(0, 3)
                .map((failure) => `${failure.name}: ${failure.message}`)
                .join(" · ")}`,
          glyph: verification.ok ? "✓" : "×",
        }
      : isCompiling
        ? {
            tone: "info",
            label: "Processing program",
            detail:
              "The compiler worker is scanning, proving, lowering, and executing this source.",
            glyph: "↻",
          }
        : isVerifying
          ? {
              tone: "info",
              label: "Running self-test",
              detail:
                "Examples and embedded language assertions are executing in the compiler worker.",
              glyph: "↻",
            }
          : isStale
            ? {
                tone: "warning",
                label: "Inspector out of date",
                detail:
                  "Source changed after the last run. Run again to tune the inspector to this draft.",
                glyph: "!",
              }
            : compilation
              ? {
                  tone: "success",
                  label: "Program ready",
                  detail: `${instructionCount.toLocaleString("en-US")} instructions completed in ${formatMilliseconds(compilation.timings.total)}.`,
                  glyph: "✓",
                }
              : {
                  tone: "idle",
                  label: "Console standing by",
                  detail:
                    "Edit the source, choose an inspector, then run the program with Ctrl/⌘ + Enter.",
                  glyph: "○",
                };

  return (
    <main
      className="app-shell"
      data-era={era}
      data-run-state={runState}
      onKeyDown={handleAppKeyDown}
    >
      <a
        className="skip-link"
        href="#forge-source"
        onClick={handleSkipToSource}
      >
        Skip to source editor
      </a>

      <div className="equipment-tape" aria-hidden="true">
        <span>FORGE LABORATORIES</span>
        <span>COMPUTATION UNIT · MODEL 14</span>
        <span>
          {selectedEra.label.toUpperCase()} SERIES · {selectedEra.year}
        </span>
      </div>

      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <span>F</span>
            <i />
          </span>
          <div>
            <div className="brand-row">
              <h1>FORGE</h1>
              <span className="version-badge">v{FORGE_VERSION}</span>
            </div>
            <p>Source-to-stack language laboratory · Built to be opened</p>
          </div>
        </div>

        <div className="lab-readout" data-status={runState}>
          <span className="lab-readout__pilot" aria-hidden="true" />
          <span>
            <small>System signal</small>
            <strong>{labMessage.label}</strong>
          </span>
        </div>
      </header>

      <section className="control-deck" aria-label="Laboratory controls">
        <EraDial value={era} onChange={setEra} />

        <div className="header-actions">
          <label className="select-field">
            <span>Program cartridge</span>
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
            {isVerifying ? "Testing…" : "Run self-test"}
          </button>
          <button
            className="button button--primary"
            type="button"
            onClick={() => void runCompilation()}
            disabled={isCompiling || isVerifying}
            aria-keyshortcuts="Control+Enter Meta+Enter"
          >
            {isCompiling ? "Running…" : "Run program"}
            <kbd>Ctrl/⌘ ↵</kbd>
          </button>
        </div>
      </section>

      <section
        className="pipeline-strip"
        data-state={runState}
        aria-label="Compiler pipeline"
      >
        <span className="pipeline-strip__label">Pipeline</span>
        <ol>
          {PIPELINE_STAGES.map((stage, index) => (
            <li
              key={stage.id}
              data-stage-state={
                isCompiling
                  ? "working"
                  : compilation && !isStale
                    ? "complete"
                    : "idle"
              }
            >
              <span className="pipeline-strip__index">
                <span>{String(index + 1).padStart(2, "0")}</span>
              </span>
              <strong>{stage.label}</strong>
              <small>
                {compilation
                  ? formatMilliseconds(compilation.timings[stage.id])
                  : stage.hint}
              </small>
            </li>
          ))}
        </ol>
        <span className="pipeline-strip__mode">LEXICAL · FINITE · BOUNDED</span>
      </section>

      <div
        className={`notice notice--${labMessage.tone}`}
        role={labMessage.tone === "error" ? "alert" : "status"}
        aria-live={labMessage.tone === "error" ? "assertive" : "polite"}
        aria-atomic="true"
        aria-label="Lab status"
      >
        <span aria-hidden="true">{labMessage.glyph}</span>
        <div>
          <strong>{labMessage.label}</strong>
          <p>{labMessage.detail}</p>
        </div>
        {error?.position && (
          <button
            className="notice__action"
            type="button"
            onClick={focusErrorPosition}
          >
            Go to {error.position.line}:{error.position.column}
          </button>
        )}
      </div>

      <div
        className="mobile-pane-switch"
        role="group"
        aria-label="Mobile workbench view"
      >
        <button
          type="button"
          aria-pressed={mobilePane === "source"}
          onClick={() => setMobilePane("source")}
        >
          Source
        </button>
        <button
          type="button"
          aria-pressed={mobilePane === "inspector"}
          onClick={() => setMobilePane("inspector")}
        >
          Inspector
        </button>
      </div>

      <div
        aria-busy={isCompiling}
        className="workbench"
        data-mobile-pane={mobilePane}
      >
        <section className="source-pane" aria-labelledby="source-heading">
          <h2 className="sr-only" id="source-heading">
            Source program
          </h2>
          <div className="editor-panel">
            <div className="panel-toolbar">
              <span className="panel-toolbar__file">main.forge</span>
              <div className="panel-toolbar__stats">
                <span>{sourceStats.lines} lines</span>
                <span>{sourceStats.characters} chars</span>
                <span>
                  {isStale ? "Changed since run" : "Autosaved locally"}
                </span>
                {previousExample && (
                  <button type="button" onClick={undoExample}>
                    Undo “{previousExample.name}”
                  </button>
                )}
              </div>
            </div>
            <label className="sr-only" htmlFor="forge-source">
              FORGE source code
            </label>
            <textarea
              id="forge-source"
              ref={textareaRef}
              value={source}
              onChange={(event) => editSource(event.target.value)}
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
        </section>

        <section className="inspector-shell" aria-label="Compiler inspector">
          <nav
            className="tab-bar"
            role="tablist"
            aria-label="Compiler inspectors"
            onKeyDown={handleTabKeyDown}
          >
            {INSPECTORS.map((tab) => (
              <button
                key={tab.id}
                ref={(element) => {
                  if (element) tabRefs.current.set(tab.id, element);
                }}
                id={`tab-${tab.id}`}
                role="tab"
                type="button"
                aria-label={tab.label}
                aria-selected={activeInspector === tab.id}
                aria-controls={`panel-${tab.id}`}
                tabIndex={activeInspector === tab.id ? 0 : -1}
                onClick={() => {
                  setActiveInspector(tab.id);
                  setMobilePane("inspector");
                }}
              >
                <span className="tab-bar__marker" aria-hidden="true">
                  {tab.marker}
                </span>
                <span className="tab-bar__copy">
                  <strong>{tab.label}</strong>
                  <small>{tab.hint}</small>
                </span>
              </button>
            ))}
          </nav>

          <section
            className="workspace"
            id={`panel-${activeInspector}`}
            ref={workspaceRef}
            role="tabpanel"
            aria-labelledby={`tab-${activeInspector}`}
            aria-busy={isCompiling}
          >
            {activeInspector === "tokens" &&
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
                        key={`${token.position.line}:${token.position.column}:${tokenPage * TOKEN_PAGE_SIZE + index}`}
                      >
                        <code>{displayTokenValue(token)}</code>
                        <span>{token.type}</span>
                        <small>
                          {token.position.line}:{token.position.column}
                        </small>
                      </div>
                    ))}
                  </div>
                  <InspectorPager
                    count={tokens.length}
                    page={tokenPage}
                    pageSize={TOKEN_PAGE_SIZE}
                    onPageChange={setTokenPage}
                    noun="tokens"
                  />
                </div>
              ) : (
                <TabPlaceholder />
              ))}

            {activeInspector === "ast" &&
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
                        tokens.length > MAX_AST_TOKENS
                          ? tokens.length
                          : compiledSourceLength
                      }
                      limit={
                        tokens.length > MAX_AST_TOKENS
                          ? MAX_AST_TOKENS
                          : MAX_AST_SOURCE_CHARACTERS
                      }
                      unit={
                        tokens.length > MAX_AST_TOKENS
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

            {activeInspector === "assembly" &&
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
                    ref={assemblyListRef}
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
                  <InspectorPager
                    count={compilation.assembly.length}
                    page={assemblyPage}
                    pageSize={ASSEMBLY_PAGE_SIZE}
                    onPageChange={setAssemblyPage}
                    noun="assembly rows"
                  />
                </div>
              ) : (
                <TabPlaceholder />
              ))}

            {activeInspector === "output" &&
              (compilation ? (
                <div className="inspector-panel">
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
                      <strong>
                        {compilation.result.output.length} records
                      </strong>
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
                      <span className="output-pilot">
                        <i aria-hidden="true" />
                        OUTPUT / {compilation.result.status.toUpperCase()}
                      </span>
                      <span>forge://stdout</span>
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

            {activeInspector === "trace" &&
              (compilation ? (
                <div className="inspector-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">Execution history</span>
                      <h2>
                        {compilation.result.trace.length} captured operations
                      </h2>
                    </div>
                    <span>
                      {compilation.result.traceOverflow
                        ? `capped from ${compilation.result.steps}`
                        : "complete trace"}
                    </span>
                  </div>
                  <div
                    className="table-scroll"
                    ref={traceTableRef}
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
                          <tr
                            key={`${entry.programCounter}:${tracePage * TRACE_PAGE_SIZE + index}`}
                          >
                            <td>{entry.programCounter}</td>
                            <td>{entry.opcode}</td>
                            <td>
                              {entry.argument === undefined
                                ? "—"
                                : formatForPrint(String(entry.argument), {
                                    maxCharacters:
                                      MAX_INSPECTOR_VALUE_CHARACTERS,
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
                  <InspectorPager
                    count={compilation.result.trace.length}
                    page={tracePage}
                    pageSize={TRACE_PAGE_SIZE}
                    onPageChange={setTracePage}
                    noun="trace entries"
                  />
                </div>
              ) : (
                <TabPlaceholder />
              ))}
          </section>
          {INSPECTORS.filter((tab) => tab.id !== activeInspector).map((tab) => (
            <section
              key={tab.id}
              id={`panel-${tab.id}`}
              role="tabpanel"
              aria-labelledby={`tab-${tab.id}`}
              hidden
            />
          ))}
        </section>
      </div>

      <footer className="app-footer">
        <div>
          <span>FORGE v{FORGE_VERSION}</span>
          <span>Finite-number VM</span>
          <span>Lexical scope</span>
          <span>Bounded execution</span>
          <span>Tree-walk VM oracle</span>
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
