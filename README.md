# Wren Companion

## Typography

Companion bundles Recursive for UI text. Addresses, numbers, URLs, and other
technical values use the browser monospace stack; Fira Code is not currently
bundled or claimed as a runtime dependency. Adding it requires a licensed
webfont and an explicit `@font-face` declaration.

Wren Companion connects Ethereum and EVM dapps in the browser to the
[Wren](https://github.com/jorphex/wren) desktop wallet. It injects an
EIP-1193 provider and announces Wren through EIP-6963; Wren keeps account,
approval, signing, and broadcast authority.

It is derived from the GPL-3.0 Frame extension and is not affiliated with or
endorsed by Frame Labs. Internal `frame_*` labels and the `isFrame` flag remain
for compatibility. Public discovery uses Wren and `io.github.jorphex.wren`.

## Compatibility

Companion 0.1.2 uses mutually authenticated protocol 3 and no longer sends its browser
name or runtime extension UUID in the authentication hello. Pair it only with the minimum
Wren desktop commit named in its `*-compatibility.json` artifact, or a later
desktop release that retains protocol 3. Desktop releases that retain the
protocol do not need a new Companion submission.

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

Verify the release checksums, then extract the matching browser ZIP. Chrome and
Firefox archives have different background manifests and must not be
interchanged.

- Chrome or Brave: open `chrome://extensions` or `brave://extensions`, enable
  Developer mode, select **Load unpacked**, and choose the extracted directory
  (or `dist/` for a local build).
- Firefox: open `about:debugging#/runtime/this-firefox`, select **Load
  Temporary Add-on**, and choose `manifest.json` in the extracted directory
  (or `dist/manifest.json`).

On first connection, compare the six-digit code in Wren and the extension, then
approve it in Wren. Wren can revoke a pairing and the extension can reset its
credential. Pairing mutually authenticates that Wren installation and the
extension's control/page key bundle. See [Security](SECURITY.md).

## Test a release candidate

Run `npm run qualify:serve` to host the local, dependency-free qualification
page on `127.0.0.1`. Follow Wren's [qualification
procedure](https://github.com/jorphex/wren/blob/main/QUALIFICATION.md) with
disposable test accounts only.

The companion has no telemetry or remote code. See [Privacy](PRIVACY.md), the
[release procedure](RELEASE.md), and [store submission guide](STORE_SUBMISSION.md).
