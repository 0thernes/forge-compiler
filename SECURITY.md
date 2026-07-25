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

Direct assembly passed to the VM is checked for instruction shape, known
opcodes, operands, target bounds, and configured instruction, string, and array
limits before execution mutates state. Inspector formatting and worker payloads
are independently bounded.

These controls reduce accidental denial-of-service risk; they are not a formal
security sandbox. A hostile input may still consume the configured worker CPU
or memory budget until a limit is reached. Do not expose this educational
compiler as a multi-tenant execution service without an additional process or
container boundary, request timeouts, memory quotas, and worker termination.

The production bundle targets ES2022 and expects JavaScript modules, structured
cloning, and local storage. Module Web Workers are preferred but are not a
security boundary. If Worker startup or transport fails, the application uses
the same bounded compiler on the main thread; a costly input can then occupy the
interface until an applicable limit stops it. Older or embedded browsers
outside this runtime baseline are not security-tested.

## Browser data

The editor stores one versioned source draft and the selected console appearance
in the browser's local storage for the deployed origin. FORGE does not upload
those preferences, source, or program output, but anyone with access to the same
browser profile can read the stored draft through the site. Avoid entering
secrets and clear the site's stored data when using a shared device.

## CLI data

The CLI reads only the source file explicitly named by the caller, or standard
input. FORGE programs still have no ambient filesystem, process, environment,
or network access. JSON responses contain the caller-provided display name,
source size, and SHA-256 digest, but not source contents or the resolved host
path. Human operational labels and diagnostics escape terminal controls and
bidirectional formatting characters. Human program output remains verbatim;
redirect it or use JSON mode when running untrusted programs. Program output
and final globals can still reproduce secrets deliberately embedded in a
program, so treat saved protocol output as potentially sensitive.

The CLI's language limits are availability controls, not a multi-tenant
sandbox. Run untrusted jobs inside a separately constrained process or
container with OS-level CPU, wall-clock, memory, and output limits.
