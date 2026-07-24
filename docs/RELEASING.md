# Release runbook

FORGE releases are tag-driven and intentionally pass through a reviewable
draft before publication.

## Prepare

1. Start from a clean `main` branch that matches `origin/main`.
2. Update the version in `package.json`, `package-lock.json`, and
   `src/compiler/constants.js`, then finalize the matching changelog entry.
3. Use the declared Node 24/npm 11 toolchain and run:

   ```bash
   npm ci
   npm run verify
   node scripts/verify-release.mjs v14.0.0
   ```

4. Push `main` and wait for the **CI and Pages** workflow to finish
   successfully.

## Draft

Create and push an annotated version tag:

```bash
git tag -a v14.0.0 -m "FORGE v14.0.0"
git push origin v14.0.0
```

The **Release** workflow rejects a version mismatch or a tag commit that is not
on `main`. It reruns the quality gate, builds a relative-path portable bundle,
and attaches `.tar.gz` and `.zip` archives, a build-dependency CycloneDX SBOM,
and SHA-256 checksums to a draft GitHub Release. Each archive includes the MIT
license and the project documentation linked from its README.

## Inspect and publish

1. Confirm the Release workflow succeeded.
2. Download the assets and verify `SHA256SUMS`.
3. Review the generated release notes and draft title.
4. Publish the existing draft:

   ```bash
   gh release edit v14.0.0 --draft=false --latest
   ```

5. Confirm the published tag and release target the intended `main` commit.
   Pages deploys from `main`, independently of the release tag.

Workflow reruns may replace assets only while the release remains a draft.
Published release assets are deliberately left untouched.
