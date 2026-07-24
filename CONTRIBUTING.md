# Contributing

## Development setup

Use Node.js 24 and the npm version recorded in `package.json`.

```bash
npm ci
npm run dev
```

Before opening a pull request, run:

```bash
npm run verify
```

This checks formatting, lint, core coverage thresholds, all compatibility and
UI tests, and the production build.

## Compiler changes

Keep each phase deterministic and free of browser dependencies. A language
change should include:

1. focused tests for the affected phase;
2. an end-to-end execution test;
3. adversarial cases for errors and relevant resource limits;
4. updates to `docs/LANGUAGE.md` and `CHANGELOG.md`;
5. compatibility notes when v13 behavior changes.

Do not silently accept invalid source in unreachable branches. Static errors
belong in the analyzer when they can be known before execution. Runtime errors
should use `ForgeError` codes and must not expose host APIs.

## Pull requests

Keep changes scoped, explain observable language behavior, and avoid committing
`dist/`, `coverage/`, editor state, or dependency directories. CI must be green
before merge.
