# FORGE compiler CLI

This archive is the focused, dependency-free FORGE compiler package for Node.js
24 LTS. It contains the `forge` executable, the compiler API, the deterministic
stack VM, the machine-readable contract, and user documentation. It does not
contain the React workbench or repository development tooling.

## Install a release archive

Install a downloaded release globally:

```bash
npm install --global ./forge-compiler-cli-v14.2.0.tgz
forge version
forge capabilities --json
```

Or install it inside another project:

```bash
npm install ./forge-compiler-cli-v14.2.0.tgz
npx forge run program.forge
```

The versioned filename changes with each release. The package has no runtime
dependencies and its `engines` field declares only the required Node.js
runtime.

## Start here

- [CLI and automation contract](docs/CLI.md)
- [Language reference](docs/LANGUAGE.md)
- [Compiler and VM architecture](docs/ARCHITECTURE.md)
- [Security and execution limits](SECURITY.md)
- [Changelog](CHANGELOG.md)
- [License](LICENSE)

Programmatic consumers may import the compiler from `forge-compiler`, the CLI
runner from `forge-compiler/cli`, or capability discovery from
`forge-compiler/capabilities`.
