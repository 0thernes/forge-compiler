import { getForgeCapabilities } from "../compiler/capabilities.js";

const capabilities = getForgeCapabilities();

function humanizeIdentifier(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function CapabilityDeck() {
  const { compiler, identity, interfaces, limits, schema, verification } =
    capabilities;
  const { cli } = interfaces;
  const operatorSurfaceCount =
    Number(interfaces.browserWorkbench) + Number(Boolean(cli));
  const executionSignals = Object.entries(compiler.execution)
    .filter(([, enabled]) => enabled)
    .map(([name]) => humanizeIdentifier(name));
  const verificationSignals = Object.entries(verification)
    .filter(([, enabled]) => enabled)
    .map(([name]) => humanizeIdentifier(name));

  return (
    <details className="capability-deck">
      <summary>
        <span className="capability-deck__signal">
          <i aria-hidden="true" />
          Interface deck
        </span>
        <span className="capability-deck__summary">
          {interfaces.browserWorkbench && <span>Browser</span>}
          <span>{cli.commands.length} CLI commands</span>
          <span>{cli.output.join(" + ")}</span>
          <span>{compiler.backend}</span>
        </span>
        <span className="capability-deck__disclosure">
          Inspect contract
          <i aria-hidden="true" />
        </span>
      </summary>

      <div className="capability-deck__body">
        <header className="capability-deck__intro">
          <span>
            Agent link · <code>{cli.schema}</code>
          </span>
          <h2>One compiler, {operatorSurfaceCount} operator surfaces.</h2>
          <p>
            This panel reads the shipped capability manifest directly. It
            describes what this build exposes today.
          </p>
        </header>

        <div className="capability-deck__matrix">
          <article className="capability-module" data-channel="browser">
            <div className="capability-module__heading">
              <span>Interface 01</span>
              <strong>
                <i aria-hidden="true" />
                {interfaces.browserWorkbench ? "Online" : "Not exposed"}
              </strong>
            </div>
            <h3>Browser workbench</h3>
            <dl>
              <div>
                <dt>Language</dt>
                <dd>{identity.language}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{identity.version}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{identity.sourceExtensions.join(", ")}</dd>
              </div>
            </dl>
          </article>

          <article className="capability-module" data-channel="automation">
            <div className="capability-module__heading">
              <span>Interface 02</span>
              <strong>
                <i aria-hidden="true" />
                {cli.output.includes("json") ? "JSON ready" : "CLI ready"}
              </strong>
            </div>
            <h3>CLI + JSON contract</h3>
            <dl>
              <div>
                <dt>Input</dt>
                <dd>{cli.input.join(" · ")}</dd>
              </div>
              <div>
                <dt>Output</dt>
                <dd>{cli.output.join(" · ")}</dd>
              </div>
              <div>
                <dt>Schema</dt>
                <dd>{cli.schema}</dd>
              </div>
              <div>
                <dt>Exit codes</dt>
                <dd>
                  {Object.entries(cli.exitCodes)
                    .map(([name, code]) => `${name} ${code}`)
                    .join(" · ")}
                </dd>
              </div>
            </dl>
            <ul className="capability-module__chips" aria-label="CLI commands">
              {cli.commands.map((command) => (
                <li key={command}>{command}</li>
              ))}
            </ul>
          </article>

          <article className="capability-module" data-channel="runtime">
            <div className="capability-module__heading">
              <span>Runtime</span>
              <strong>
                <i aria-hidden="true" />
                {Object.keys(limits).length} limits
              </strong>
            </div>
            <h3>{humanizeIdentifier(compiler.backend)}</h3>
            <ul className="capability-module__readout">
              {executionSignals.map((signal) => (
                <li key={signal}>{signal}</li>
              ))}
            </ul>
          </article>

          <article className="capability-module" data-channel="evidence">
            <div className="capability-module__heading">
              <span>Evidence bank</span>
              <strong>
                <i aria-hidden="true" />
                {verificationSignals.length} gates
              </strong>
            </div>
            <h3>Artifacts + verification</h3>
            <p className="capability-module__artifact-count">
              {compiler.artifacts.length} inspectable artifacts ·{" "}
              {Object.keys(compiler.artifactSchemas).length} public schemas
            </p>
            <ul
              className="capability-module__chips"
              aria-label="Compiler artifacts"
            >
              {compiler.artifacts.map((artifact) => (
                <li key={artifact}>{artifact}</li>
              ))}
            </ul>
            <ul
              className="capability-module__readout"
              aria-label="Verification gates"
            >
              {verificationSignals.map((signal) => (
                <li key={signal}>{signal}</li>
              ))}
            </ul>
          </article>
        </div>

        <footer className="capability-deck__footer">
          <span>Manifest</span>
          <code>{schema}</code>
          <span>Pipeline</span>
          <code>{compiler.pipeline.join(" → ")}</code>
        </footer>
      </div>
    </details>
  );
}
