# Contributing

## Development setup

Use the pinned Node.js 24.18.0 LTS and npm 11.18.0 toolchain. Node.js 24 LTS is
the supported development line; the exact npm version is recorded in
`package.json`.

```bash
npm ci
npm run dev
```

Before opening a pull request, run:

```bash
npm run verify
```

This checks formatting, lint, documentation and release metadata, core coverage
thresholds, all compatibility and UI tests, the differential corpus and
mutation-sensitivity gate, the production build, and its expected artifact
contents.

## Compiler changes

Keep each phase deterministic and free of browser dependencies. A language
change should include:

1. focused tests for the affected phase;
2. an end-to-end execution test;
3. adversarial cases for errors and relevant resource limits;
4. updates to `docs/LANGUAGE.md` and `CHANGELOG.md`;
5. compatibility notes when v13 behavior changes.

Do not silently accept invalid source in unreachable branches. Static errors
belong in the earliest compiler phase that has enough context to diagnose them.
Runtime errors should use `ForgeError` codes and must not expose host APIs.

## Pull requests

Keep changes scoped, explain observable language behavior, and avoid committing
`dist/`, `coverage/`, editor state, or dependency directories. CI must be green
before merge.
