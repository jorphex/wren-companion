# Wren Companion

Wren Companion connects Ethereum apps in your browser to the
[Wren](https://github.com/jorphex/wren) desktop wallet. The extension carries
requests between each browser page and Wren. Wren stays in control of accounts,
approvals, signing, and broadcasting.

For app developers, Companion provides an EIP-1193 wallet interface and
announces Wren through EIP-6963.

It is derived from the GPL-3.0 Frame extension and is not affiliated with or
endorsed by Frame Labs. Internal `frame_*` labels and the `isFrame` flag remain
for compatibility. Public discovery uses Wren and `io.github.jorphex.wren`.

## Compatibility

Companion 0.1.2 uses pairing protocol 3. Use the minimum Wren desktop build
named in the `*-compatibility.json` release file, or a later release that still
supports protocol 3. A compatible Wren desktop update does not require a new
Companion release.

## Build

```bash
git clone https://github.com/jorphex/wren-companion
cd wren-companion
nvm install
nvm use
npm run setup:ci
npm run verify
```

Create and verify local browser archives with:

```bash
npm run package:browsers
npm run package:verify
```

## Install and pair

Verify the release checksums, then extract the ZIP for your browser. Chrome and
Firefox use different packages.

- Chrome or Brave: open `chrome://extensions` or `brave://extensions`, enable
  Developer mode, select **Load unpacked**, and choose the extracted directory
  (or `dist/` for a local build).
- Firefox: open `about:debugging#/runtime/this-firefox`, select **Load
  Temporary Add-on**, and choose `manifest.json` in the extracted directory
  (or run `npm run build:firefox` and choose `dist-firefox/manifest.json` for a
  local build).

On first connection, compare the six-digit code in Wren and the extension. If
the codes match, approve the connection in Wren. You can revoke the connection
in Wren or reset it in the extension. See [Security](SECURITY.md).

## Test a release candidate

Run `npm run qualify:serve` to host the local, dependency-free test page on
`127.0.0.1`. Follow Wren's [qualification
procedure](https://github.com/jorphex/wren/blob/main/QUALIFICATION.md) with
disposable test accounts only.

The extension has no telemetry or remote code. See [Privacy](PRIVACY.md), the
[release notes](release-notes/), [release procedure](RELEASE.md), and
[store submission guide](STORE_SUBMISSION.md).

## Typography

Companion bundles Recursive for interface text. Technical values use the
browser's monospace font. Fira Code is not currently bundled.
