# Companion Release Procedure

## Release boundary

Companion is versioned independently from Wren desktop. Each release declares
its authentication protocol and minimum compatible desktop commit in
[`compatibility.json`](compatibility.json). It works with later desktop releases
that retain that protocol; desktop UI, signer, or wallet-feature changes do not
require another browser-store submission.

The release contains separate Chrome and Firefox Manifest V3 ZIPs. The Firefox
package has its own add-on ID and matching reviewer-source ZIP; it neither
claims nor updates the upstream Frame listings. Protocol 3 mutually authenticates
the Wren installation and Companion control/page key bundle after explicit code
comparison. A compromised host or browser profile remains inside the trusted
computing base. See [Security](SECURITY.md) and [Privacy](PRIVACY.md).

## Local gate

Start from a clean, reviewed commit with the pinned toolchain:

```bash
nvm install
nvm use
npm install --global npm@11.12.0
npm run setup:ci
npm run audit:release
npm run package:browsers
npm run package:verify
```

`artifacts/` must contain Chrome and Firefox ZIPs, Firefox reviewer source,
compatibility metadata, a production CycloneDX SBOM, and `SHA256SUMS`. Repeating
the package commands from the same commit and lockfile must reproduce every
checksum.

## GitHub draft release

Push the exact `v<package version>` tag from the reviewed commit. The release
workflow reruns the gate, verifies the minimum desktop commit is on the
configured branch, emits provenance and SBOM attestations, and creates a draft
release. It will not modify an existing release or reuse a tag bound to another
commit.

If a draft is unusable, delete the complete draft or bump the package version;
never combine artifacts from separate runs. Publishing a GitHub draft does not
submit to a browser store.

## Manual qualification

Before GitHub or store publication, use disposable accounts and browser profiles
on an isolated display. Do not load qualification builds in a daily-use profile
or put test windows on the active desktop.

1. Verify `SHA256SUMS` and GitHub attestations.
2. Load the Chrome ZIP unpacked in current stable Chrome and the Firefox ZIP
   temporarily in current stable Firefox, using only disposable profiles.
3. Pair each clean profile with a protocol-3 Wren desktop and compare the
   six-digit code in both interfaces.
4. Confirm EIP-6963 and legacy discovery, connection approval, account and
   chain events, rejection, reconnect, extension reset, and desktop revocation.
5. Confirm that tabs, iframes, and browser profiles never receive another
   document's response, event, subscription, or pairing authority.

## Store publication

Store credentials and publication are manual and external. Follow
[Store submission](STORE_SUBMISSION.md), submit only the exact verified browser
ZIP, and give Mozilla the matching source ZIP. A new Companion update is needed
only for Companion behavior, security, permissions, or an incompatible
protocol.
