# FORGE Compiler portable release

This archive is a prebuilt static copy of the FORGE Compiler. It is intended
for local exploration or deployment to a static web host; it is not a source
checkout or an npm package.

## Run the archive

Extract the `.zip` or `.tar.gz`, start any static HTTP server in the extracted
directory, and open the displayed local URL. For example, with Python 3:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/>. JavaScript modules and origin-scoped browser
storage are involved, so opening `index.html` directly through a `file:` URL is
not a supported launch method. Node.js and npm are not required to run the
prebuilt application.

The release build uses relative asset paths. It can therefore be hosted at a
domain root or below a path prefix as long as the archive's directory structure
is preserved. Use HTTPS for any non-local deployment.

## Archive contents

- `index.html`, `forge-mark.svg`, and `assets/`: the compiled application,
  styles, Worker bundles, and source maps;
- `LICENSE`: the MIT license;
- `CHANGELOG.md`, `SECURITY.md`, and `CONTRIBUTING.md`: project policies and
  history;
- `docs/`: the language, architecture, release, and portable-use
  documentation.

The archive intentionally omits compiler source modules, tests, `package.json`,
the lockfile, and development tooling. Commands such as `npm ci`, `npm test`,
and `npm run dev` apply to a cloned source repository, not to this archive.

## Browser and data model

The bundle targets ES2022 and requires JavaScript modules, ES2022 runtime
features, structured cloning, and local storage. It uses a module Web Worker
when available and falls back to main-thread compilation if Worker startup or
transport fails.

FORGE source executes as data inside the project's bounded virtual machine. The
application stores one versioned source draft in local storage for its origin
and does not upload source or output. This is an educational runtime, not a
formal hostile-code sandbox; see the
[security policy](https://github.com/0thernes/forge-compiler/blob/main/SECURITY.md)
for the trust model and deployment guidance.

## Verify and learn more

Compare an archive's SHA-256 digest with its entry in the separately published
`SHA256SUMS` asset before use:

```bash
sha256sum forge-compiler-v*.tar.gz
```

On PowerShell:

```powershell
Get-FileHash .\forge-compiler-v*.zip -Algorithm SHA256
```

- [Live compiler](https://0thernes.github.io/forge-compiler/)
- [Source repository](https://github.com/0thernes/forge-compiler)
- [Language reference](https://github.com/0thernes/forge-compiler/blob/main/docs/LANGUAGE.md)
- [Compiler architecture](https://github.com/0thernes/forge-compiler/blob/main/docs/ARCHITECTURE.md)
- [Issues](https://github.com/0thernes/forge-compiler/issues)
