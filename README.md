<h2 align="center">
  <br>
  <img src="https://github.com/floating/frame/raw/master/asset/png/FrameLogo512.png?raw=true" alt="Frame" width="150" />
  <br>
  <br>
  <div align="center">Frame Browser Extension :link: </div>
  <br>
</h2>

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
in its `*-compatibility.json` artifact. Published archives include checksums and
a production SBOM; see the [release procedure](RELEASE.md).

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

### Related

- [Frame](https://github.com/jorphex/frame) - A cross-platform Ethereum provider interface
