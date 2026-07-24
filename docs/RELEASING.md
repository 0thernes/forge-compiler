# Release runbook

FORGE releases are tag-driven and intentionally pass through a reviewable
draft before publication.

## Prepare

1. Start from a clean `main` branch that matches `origin/main`.
2. Update the version in `package.json`, `package-lock.json`, and
   `src/compiler/constants.js`, then finalize the matching changelog entry.
3. Derive the tag from the package version. The commands below assume the same
   shell session; repeat these two assignments after opening a new shell:

   ```bash
   VERSION="$(node -p "require('./package.json').version")"
   TAG="v${VERSION}"
   ```

4. Use the pinned Node.js 24.18.0 LTS/npm 11.18.0 toolchain and run:

   ```bash
   npm ci
   npm run verify
   node scripts/verify-release.mjs "$TAG"
   ```

5. Push `main` and wait for the **CI and Pages** workflow to finish
   successfully.

## Draft

Create and push an annotated version tag:

```bash
git tag -a "$TAG" -m "FORGE $TAG"
git push origin "$TAG"
```

The **Release** workflow rejects a version mismatch or a tag commit that is not
on `main`. It reruns the quality gate, builds a relative-path portable bundle,
and attaches `.tar.gz` and `.zip` archives, a build-dependency CycloneDX SBOM,
and SHA-256 checksums to a draft GitHub Release.

The archives contain a prebuilt static browser application, not a source
checkout: they intentionally omit `src/`, `package.json`, tests, and the npm
toolchain. Packaging must install
[`PORTABLE-RELEASE.md`](PORTABLE-RELEASE.md) as the archive's `README.md` and
include the MIT license plus its linked project documentation. Validate the
archive as a static site; do not test its instructions as though it were an npm
project.

## Inspect and publish

1. Confirm the Release workflow succeeded.
2. Download the assets and verify `SHA256SUMS`.
3. Review the generated release notes and draft title.
4. Confirm repository release immutability is enabled, then publish the
   existing draft:

   ```bash
   gh release edit "$TAG" --draft=false --latest
   ```

5. Confirm the published tag and release target the intended `main` commit.
   GitHub should mark the release **Immutable**. Pages deploys from `main`,
   independently of the release tag.

Workflow reruns may replace assets only while the release remains a draft.
Published release assets and the associated tag are locked.

If a tag-triggered workflow fails before creating the draft, fix the workflow
through the normal protected-branch review and retry the existing version tag
without moving it:

```bash
gh workflow run release.yml --ref main -f "tag=$TAG"
```
