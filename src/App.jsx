import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  T, KEYWORDS, escapeForDisplay, formatValue,
  lex, parse, codegen, execute,
  renderAST, computeAsmPCs, TRACE_LIMIT,
} from "./compiler/index.js";
import { EXAMPLES } from "./examples.js";
import { runConformance } from "./self-test.js";

const TABS = [
  { id: "source", label: "SOURCE", icon: ">" }, { id: "tokens", label: "TOKENS", icon: "#" },
  { id: "ast", label: "AST", icon: "{" }, { id: "asm", label: "ASM", icon: ":" },
  { id: "output", label: "OUTPUT", icon: "$" }, { id: "trace", label: "TRACE", icon: "~" }
];
const THEME = {
  bg: "#0a0a0f", surface: "#111118", border: "#1e1e2e",
  accent: "#c0f0a0", dim: "#555570", bright: "#e0e0f0",
  red: "#ff6b6b", cyan: "#70d0e0", yellow: "#e0d070", purple: "#b090e0"
};

// UI display helper — strings show quoted, arrays bracketed, cycle-safe
function displayValue(v) {
  return formatValue(v);
}

export default function ForgeCompiler() {
  const [source, setSource] = useState(EXAMPLES["Arrays"]);
  const [activeTab, setActiveTab] = useState("source");
  const [compiled, setCompiled] = useState(null);
  const [error, setError] = useState(null);
  const [selfTest, setSelfTest] = useState(null);
  const textareaRef = useRef(null);
  const pendingCursor = useRef(null);
  const { bg, surface, border, accent, dim, bright, red, cyan, yellow, purple } = THEME;

  const compile = useCallback(() => {
    try { setError(null); const tokens = lex(source); const ast = parse(tokens); const asmCode = codegen(ast); const asmPCs = computeAsmPCs(asmCode); const result = execute(asmCode); setCompiled({ tokens, ast, asm: asmCode, asmPCs, result }); setActiveTab("output"); }
    catch (e) { setError(e.message); }
  }, [source]);

  // [F3 v13] CI self-test: every example + every embedded assertion runs the
  // FULL pipeline (lex → parse → codegen → link → execute).
  const runSelfTest = useCallback(() => {
    const { failures, exampleCount, testCount } = runConformance();
    setSelfTest(failures.length === 0
      ? { ok: true, msg: `✓ CI GREEN — ${exampleCount} examples + ${testCount} assertions pass the full pipeline` }
      : { ok: false, msg: `✕ ${failures.length} failed — ${failures.slice(0, 4).join("  |  ")}${failures.length > 4 ? " …" : ""}` });
  }, []);

  useEffect(() => { if (textareaRef.current && pendingCursor.current != null) { const p = pendingCursor.current; pendingCursor.current = null; textareaRef.current.selectionStart = p; textareaRef.current.selectionEnd = p; } }, [source]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Tab") { e.preventDefault(); const ta = e.target; pendingCursor.current = ta.selectionStart + 2; setSource(ta.value.substring(0, ta.selectionStart) + "  " + ta.value.substring(ta.selectionEnd)); }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); compile(); }
  }, [compile]);
  const handleExampleSelect = useCallback((e) => { const n = e.target.value; if (EXAMPLES[n]) { setSource(EXAMPLES[n]); e.target.value = ""; } }, []);
  const realInstCount = useMemo(() => compiled ? compiled.asm.filter(i => i.op !== "LABEL").length : 0, [compiled]);
  const visibleTokens = useMemo(() => compiled ? compiled.tokens.filter(t => t.type !== T.EOF) : [], [compiled]);

  return (
    <div style={{ background: bg, color: bright, minHeight: "100vh", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace", fontSize: 13 }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: accent, fontSize: 18, fontWeight: 800, letterSpacing: 4 }}>FORGE</span>
          <span style={{ color: dim, fontSize: 11 }}>v13</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select onChange={handleExampleSelect} style={{ background: surface, color: dim, border: `1px solid ${border}`, padding: "4px 8px", borderRadius: 4, fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
            <option value="">examples</option>
            {Object.keys(EXAMPLES).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <button onClick={runSelfTest} style={{ background: "transparent", color: dim, border: `1px solid ${border}`, padding: "6px 12px", borderRadius: 4, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1 }}>SELF-TEST</button>
          <button onClick={compile} style={{ background: accent, color: "#0a0a0f", border: "none", padding: "6px 16px", borderRadius: 4, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1 }}>COMPILE ⏎</button>
        </div>
      </div>

      {selfTest && (
        <div style={{ background: selfTest.ok ? "#0d140a" : "#1a0808", borderBottom: `1px solid ${selfTest.ok ? accent : red}33`, padding: "8px 20px", color: selfTest.ok ? accent : red, fontSize: 11 }}>
          {selfTest.msg}
        </div>
      )}

      <div style={{ display: "flex", borderBottom: `1px solid ${border}`, overflow: "auto" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ background: activeTab === t.id ? surface : "transparent", color: activeTab === t.id ? accent : dim, border: "none", borderBottom: activeTab === t.id ? `2px solid ${accent}` : "2px solid transparent", padding: "10px 16px", cursor: "pointer", fontFamily: "inherit", fontSize: 11, letterSpacing: 2, fontWeight: activeTab === t.id ? 700 : 400, whiteSpace: "nowrap" }}>
            <span style={{ marginRight: 6, opacity: 0.5 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {error && <div style={{ background: "#1a0808", borderBottom: `1px solid ${red}33`, padding: "10px 20px", color: red, fontSize: 12 }}>✕ {error}</div>}

      <div style={{ padding: 0, minHeight: "calc(100vh - 120px)" }}>
        {activeTab === "source" && (
          <div style={{ position: "relative" }}>
            <textarea ref={textareaRef} value={source} onChange={(e) => setSource(e.target.value)} onKeyDown={handleKeyDown} spellCheck={false}
              style={{ width: "100%", minHeight: "calc(100vh - 120px)", background: surface, color: bright, border: "none", padding: 20, fontFamily: "inherit", fontSize: 14, lineHeight: 1.7, resize: "none", outline: "none", boxSizing: "border-box", tabSize: 2 }}
              placeholder="// Write FORGE code here..." />
            <div style={{ position: "absolute", bottom: 12, right: 16, color: dim, fontSize: 10 }}>Ctrl+Enter to compile</div>
          </div>
        )}

        {activeTab === "tokens" && compiled && (
          <div style={{ padding: 20 }}>
            <div style={{ color: dim, fontSize: 11, marginBottom: 12 }}>{visibleTokens.length} TOKENS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {visibleTokens.map((tok, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: surface, border: `1px solid ${border}`, borderRadius: 4, padding: "4px 8px", fontSize: 12 }}>
                  <span style={{ color: tok.type === T.NUM ? yellow : tok.type === T.STR ? cyan : tok.type === T.IDENT ? bright : KEYWORDS[tok.value] ? purple : accent, fontWeight: 600 }}>
                    {tok.type === T.STR ? `"${escapeForDisplay(tok.value)}"` : tok.value}
                  </span>
                  <span style={{ color: dim, fontSize: 9 }}>{tok.type}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {activeTab === "ast" && compiled && (
          <pre style={{ padding: 20, margin: 0, color: cyan, fontSize: 12, lineHeight: 1.6, overflow: "auto", whiteSpace: "pre-wrap" }}>{renderAST(compiled.ast)}</pre>
        )}

        {activeTab === "asm" && compiled && (
          <div style={{ padding: 20 }}>
            <div style={{ color: dim, fontSize: 11, marginBottom: 12 }}>{realInstCount} INSTRUCTIONS</div>
            <pre style={{ margin: 0, lineHeight: 1.6, fontSize: 12 }}>
              {compiled.asm.map((inst, i) => {
                if (inst.op === "LABEL") return <div key={i} style={{ color: accent, fontWeight: 700, marginTop: 8 }}>{`\n${inst.arg}:`}</div>;
                const pc = compiled.asmPCs[i];
                return (
                  <div key={i} style={{ color: bright }}>
                    <span style={{ color: dim, marginRight: 12 }}>{String(pc).padStart(4, " ")}</span>
                    <span style={{ color: yellow, fontWeight: 600 }}>{inst.op}</span>
                    {inst.arg !== undefined && <span style={{ color: inst.op === "PUSH" || inst.op === "PUSH_STR" ? cyan : purple, marginLeft: 8 }}>{typeof inst.arg === "string" && inst.op === "PUSH_STR" ? `"${escapeForDisplay(inst.arg)}"` : inst.arg}</span>}
                  </div>
                );
              })}
            </pre>
          </div>
        )}

        {activeTab === "output" && compiled && (
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", gap: 20, marginBottom: 16, color: dim, fontSize: 11 }}>
              <span>{compiled.result.steps} steps</span>
              <span>{Object.keys(compiled.result.globals).length} vars</span>
              <span>{compiled.result.output.length} lines</span>
            </div>
            <pre style={{ margin: 0, background: surface, padding: 16, borderRadius: 6, border: `1px solid ${border}`, lineHeight: 1.7, fontSize: 14, minHeight: 100, color: accent, whiteSpace: "pre-wrap" }}>
              {compiled.result.output.length > 0 ? compiled.result.output.join("\n") : <span style={{ color: dim }}>(no output)</span>}
            </pre>
            {Object.keys(compiled.result.globals).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ color: dim, fontSize: 11, marginBottom: 8 }}>FINAL STATE</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {Object.entries(compiled.result.globals).map(([k, v]) => (
                    <span key={k} style={{ background: surface, border: `1px solid ${border}`, borderRadius: 4, padding: "4px 10px", fontSize: 12 }}>
                      <span style={{ color: purple }}>{k}</span><span style={{ color: dim }}> = </span>
                      <span style={{ color: yellow }}>{displayValue(v)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "trace" && compiled && (
          <div style={{ padding: 20 }}>
            <div style={{ color: dim, fontSize: 11, marginBottom: 12 }}>
              TRACE — {compiled.result.trace.length} of {compiled.result.steps} ops
              {compiled.result.traceOverflow && <span style={{ color: yellow }}> (capped at {TRACE_LIMIT})</span>}
            </div>
            <div style={{ overflow: "auto", maxHeight: "calc(100vh - 200px)" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
                <thead><tr style={{ color: dim, borderBottom: `1px solid ${border}` }}>
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>PC</th><th style={{ padding: "6px 8px", textAlign: "left" }}>OP</th>
                  <th style={{ padding: "6px 8px", textAlign: "left" }}>ARG</th><th style={{ padding: "6px 8px", textAlign: "left" }}>STACK</th>
                </tr></thead>
                <tbody>{compiled.result.trace.map((t, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${border}22` }}>
                    <td style={{ padding: "4px 8px", color: dim }}>{t.pc}</td>
                    <td style={{ padding: "4px 8px", color: yellow, fontWeight: 600 }}>{t.op}</td>
                    <td style={{ padding: "4px 8px", color: cyan }}>{t.arg !== undefined ? (typeof t.arg === "string" ? escapeForDisplay(t.arg) : String(t.arg)) : ""}</td>
                    <td style={{ padding: "4px 8px", color: purple }}>[{t.stackAfter.map(v => displayValue(v)).join(", ")}]</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}

        {!compiled && activeTab !== "source" && <div style={{ padding: 40, textAlign: "center", color: dim }}>Hit COMPILE to see this stage</div>}
      </div>

      <div style={{ borderTop: `1px solid ${border}`, padding: "12px 20px", color: dim, fontSize: 10, lineHeight: 1.8 }}>
        <span style={{ color: accent }}>FORGE</span>{" · "}
        let · print() · if/else · while · break · continue · fn · return · true/false{" · "}
        [1,2,3] · a[i] · += -= *= /= %={" · "}&quot;strings&quot; · len · char_at · substr · floor · type_of · push · pop
      </div>
    </div>
  );
}
