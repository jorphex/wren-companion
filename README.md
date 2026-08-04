<h2 align="center">
  <br>
  <img src="src/FrameLogo.png" alt="Frame" width="150" />
  <br>
  <br>
  <div align="center">Frame Community Companion :link: </div>
  <br>
</h2>

This community-maintained browser companion connects web dapps to the
[Jorphex Frame](https://github.com/jorphex/frame) desktop wallet. It is a fork
of the original [Frame extension](https://github.com/frame-labs/frame-extension)
and is not an official Frame Labs release.

Companion `0.13.1` speaks authenticated protocol 2. It supports the minimum
desktop commit recorded in `compatibility.json` and later Frame releases that
retain protocol 2; desktop releases do not require new companion submissions.

### Build

```bash
# Clone
› git clone https://github.com/jorphex/frame-extension

# Use the pinned Node version
› nvm install
› nvm use

# Install, check and build
› npm run setup:ci
› npm run verify
```

### Install

Use only a companion build paired with the minimum Frame desktop commit recorded
in its `*-compatibility.json` artifact. Published archives include checksums, a
production SBOM, and Firefox reviewer source; see the [release
procedure](RELEASE.md).

To create the browser archives locally:

```bash
› npm run package:browsers
› npm run package:verify
```

Extract the browser ZIP before installation. Chrome and Firefox packages use
browser-specific background manifests and must not be interchanged.

1. Go to `brave://extensions` or `chrome://extensions`
2. Turn developer mode on if not already active (top-right corner)
3. Tap "Load unpacked"
4. Select the extracted archive directory, or `dist/` when installing a local build

For Firefox, open `about:debugging#/runtime/this-firefox`, select "Load Temporary
Add-on", and choose `manifest.json` at the extracted archive root, or
`dist/manifest.json` for a local build.

On first connection, compare and approve the six-digit pairing code in both
Frame and the extension. Frame can revoke a paired credential and the extension
settings can reset it. Pairing authenticates the extension to Frame; it does not
authenticate the localhost Frame endpoint to the extension. See the
[security policy](SECURITY.md) for the complete boundary.

Release candidates can be exercised with the local, dependency-free
qualification page by running `npm run qualify:serve`. It binds only to
`127.0.0.1`; follow the paired desktop [qualification
procedure](https://github.com/jorphex/frame/blob/main/QUALIFICATION.md)
and use disposable test accounts only.

The companion has no telemetry or remote code. Its local data handling is
documented in the [privacy policy](PRIVACY.md), and store submission material is
maintained in [STORE_SUBMISSION.md](STORE_SUBMISSION.md).

### Related

- [Frame](https://github.com/jorphex/frame) - A cross-platform Ethereum provider interface
