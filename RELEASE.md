# Companion Release Procedure

## Release Boundary

Wren Companion is versioned independently from Wren desktop. A
companion release declares its authentication protocol and the minimum
compatible desktop commit in `compatibility.json`. It remains compatible with
later desktop releases while they retain that protocol; a desktop UI, signer,
or wallet-feature release does not require another browser-store submission.

The project produces separate Chrome and Firefox Manifest V3 ZIP files. The
Firefox package has a unique add-on ID and matching reviewer-source ZIP. It does
not claim or update the existing upstream Frame store listings.

The extension authenticates itself to Wren using protocol 2. Wren is not
authenticated back to the extension, so the same-user host account and owner of
the localhost endpoint remain trusted. See `SECURITY.md` and `PRIVACY.md`.

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

`artifacts/` must contain Chrome and Firefox ZIPs, Firefox reviewer source,
compatibility metadata, a production CycloneDX SBOM, and `SHA256SUMS`. Repeating
the package commands from the same commit and lockfile must reproduce every
checksum.

## GitHub Release

Push an exact `v<package version>` tag from the reviewed commit. The release
workflow reruns the gate, proves the minimum desktop commit remains on the
configured branch, emits provenance and SBOM attestations, and creates a new
draft release. It refuses to modify an existing release or reuse a tag bound to
another commit.

If a draft is unusable, delete the entire draft or bump the package version.
Never combine artifacts from separate runs. Publishing the GitHub draft does
not submit anything to a browser store.

## Manual Qualification

Before GitHub or store publication, use disposable accounts and browser
profiles on an isolated display. Do not load qualification builds into a live
daily-use profile or place test windows on the active desktop:

1. Verify `SHA256SUMS` and GitHub attestations.
2. Load the Chrome ZIP unpacked in the current stable Chrome release and the Firefox ZIP
   temporarily in the current stable Firefox release, using only those disposable profiles.
3. Pair each clean browser profile with a protocol-2 Wren desktop and compare
   the six-digit code in both interfaces.
4. Confirm EIP-6963 and legacy discovery, connection approval, account and
   chain events, rejection, reconnect, extension reset, and desktop revocation.
5. Confirm tabs, iframes, and browser profiles never receive another document's
   response, event, subscription, or pairing authority.

## Store Publication

Browser-store credentials and publication remain manual and external. Follow
`STORE_SUBMISSION.md`; submit only the exact verified browser ZIP, and provide
the matching source ZIP to Mozilla. A future companion update is needed only
for companion behavior, security, permissions, or an incompatible protocol.
