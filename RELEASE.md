# Companion Release Procedure

Companion has its own version. A desktop update needs a Companion release only
when it changes extension behavior or protocol compatibility.
[`compatibility.json`](compatibility.json) records the protocol and minimum
desktop commit.

## Prepare and build

Use a clean, reviewed commit. Match the version in `package.json`,
`package-lock.json`, and `src/manifest.json`. Update the matching release notes
and compatibility record.

```bash
nvm install
nvm use
npm install --global npm@11.12.0
npm run setup:ci
npm run audit:release
npm run package:browsers
npm run package:verify
```

`artifacts/` contains separate Chrome and Firefox ZIPs, Mozilla reviewer
source, compatibility metadata, a production CycloneDX SBOM, and `SHA256SUMS`.
The same commit and lockfile must reproduce the same checksums.

## Test the candidate

Use test accounts and disposable browser profiles on an isolated display.
Keep test windows off the active desktop.

1. Check `SHA256SUMS` and GitHub attestations.
2. Extract the Chrome ZIP and load it unpacked in current stable Chrome.
   Load the Firefox ZIP as a temporary add-on in current stable Firefox.
3. Pair with the compatible desktop build and compare the six-digit codes.
4. Check discovery, site access, account and network events, rejection,
   reconnect, reset, and desktop revocation.
5. Check tab and frame isolation. Each document must receive only its own
   replies, events, and subscriptions.
6. Check delayed connection replies and retries. Old attempts must not change
   the new attempt or its network.

Follow the paired [desktop checklist](https://github.com/jorphex/wren/blob/main/QUALIFICATION.md)
for signing and device tests.

## Create the draft

Push `v<package version>` from the reviewed commit. The workflow checks the
minimum desktop commit, rebuilds and verifies the packages, records build and
SBOM attestations, and creates a draft from the matching release notes.

The workflow keeps existing releases and tags unchanged. Use a new version
for an existing release. For a failed draft, use a new version or remove the
complete draft before rebuilding. Keep files from one build together.

## Submit to stores

GitHub publication and browser-store submission are separate steps. Follow
[Store submission](STORE_SUBMISSION.md). Upload each verified browser ZIP and
give Mozilla its matching source ZIP. Test the signed Firefox package before
publication. Pairing and data handling are described in [Security](SECURITY.md)
and [Privacy](PRIVACY.md).
