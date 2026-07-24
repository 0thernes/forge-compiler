# Security policy

## Supported version

Security fixes are applied to the current 14.x line.

## Reporting

Please report a suspected vulnerability through the repository's private
security-advisory feature rather than a public issue:

<https://github.com/0thernes/forge-compiler/security/advisories/new>

Include the smallest source program that reproduces the issue, the browser or
Node version, the observed result, and the expected limit or isolation
boundary.

## Execution model

FORGE programs execute as data inside a purpose-built virtual machine. The
language has no file, network, DOM, module, or JavaScript interop operations.
Compilation normally runs in a Web Worker, and explicit resource limits bound
the main parser and VM data structures.

These controls reduce accidental denial-of-service risk; they are not a formal
security sandbox. A hostile input may still consume the configured worker CPU
or memory budget until a limit is reached. Do not expose this educational
compiler as a multi-tenant execution service without an additional process or
container boundary, request timeouts, memory quotas, and worker termination.
