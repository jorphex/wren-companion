# Companion Release Procedure

## Current Boundary

This fork produces separately named Chrome and Firefox Manifest V3 ZIP files
with browser-specific background declarations. Releases create GitHub drafts
and are not published or installed automatically.

The extension authenticates itself to Frame using protocol version 2. Frame is
not authenticated back to the extension, so the same-user host account and the
owner of the localhost endpoint remain trusted. Each release includes exact
source and minimum compatible desktop commits in a compatibility JSON file.

## Local Gate

Use a clean, reviewed commit and the pinned toolchain:

```bash
nvm install
nvm use
npm install --global npm@11.12.0
npm run setup:ci
npm audit --audit-level=high
npm run package:browsers
npm run package:verify
```

The `artifacts/` directory must contain only both browser ZIPs, compatibility
metadata, a production CycloneDX SBOM, and `SHA256SUMS`. Repeating the package
commands from the same commit and lockfile must reproduce the complete checksum
manifest.

## Draft Release

Push the exact `v<package version>` tag from the reviewed commit. This triggers
**Build a draft companion release** even while the preview workflow is not on
the repository's default branch. Once the workflow exists on the default branch,
it may instead be dispatched manually against the same reviewed commit and exact
tag. The workflow reruns the local gate, proves that the minimum desktop commit
is an ancestor of the configured desktop branch, creates provenance and SBOM
attestations, and creates one new draft containing the complete artifact set.

The workflow rejects a tag bound to another source commit and categorically
refuses to modify an existing release. If a draft build is unusable, delete the
entire draft or bump the package version; never merge artifacts from separate
runs.

## Manual Qualification

Before publication, use disposable accounts and inspect both archives:

1. Verify `SHA256SUMS` and the GitHub attestations.
2. Load the Chrome archive unpacked in current Chrome or Chromium and load the
   Firefox archive temporarily in current Firefox.
3. Pair each clean browser profile with the exact compatible Frame desktop
   candidate and confirm the six-digit code in both interfaces.
4. Confirm EIP-6963 discovery, legacy injection, connection approval, account and
   chain events, rejection, reconnect, extension reset, and desktop revocation.
5. Confirm that one tab, iframe, or browser profile never receives another
   document's response, event, subscription, or pairing authority.
6. Re-run the desktop signer and package qualification matrix before publishing
   the paired release candidates.

Chrome Web Store and Mozilla Add-ons publication are not configured. Store
signing, review, update channels, and persistent Firefox installation remain
external release prerequisites.
