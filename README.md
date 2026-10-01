# Wren Companion

Wren Companion connects Ethereum apps in your browser to the
[Wren](https://github.com/jorphex/wren) desktop wallet. It carries each page's
requests to Wren, where you review access, approvals, and signatures.

## Install and pair

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/wren-companion/ifimccfajfbgligbhcgfapdagpnfkbhn)
or [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/wren-companion/).
Chrome's package also works in Brave.

Start Wren and open the Companion popup. Compare the six-digit code in both
apps, then approve pairing in Wren. You can reset pairing in Companion or
revoke it in Wren.

## Compatibility

Companion 0.1.3 uses pairing protocol 3. Use Wren 0.1.11 or a later release
that supports this protocol. The release's `*-compatibility.json` file records
the minimum desktop commit. Compatible desktop updates do not require a new
Companion release.

## Build and test

```bash
git clone https://github.com/jorphex/wren-companion
cd wren-companion
nvm install
nvm use
npm run setup:ci
npm run verify
```

Load a local build in a disposable browser profile:

- Chrome or Brave: open `chrome://extensions` or `brave://extensions`, enable
  Developer mode, select **Load unpacked**, and choose `dist/`.
- Firefox: run `npm run build:firefox`, open
  `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**,
  and choose `dist-firefox/manifest.json`. The temporary build lasts until
  Firefox restarts.

Run `npm run qualify:serve` for the local test page. Follow Wren's
[qualification checklist](https://github.com/jorphex/wren/blob/main/QUALIFICATION.md)
with test accounts.

For release archives, use a clean commit:

```bash
npm run package:browsers
npm run package:verify
```

Check `SHA256SUMS` before loading an extracted archive. Chrome and Firefox have
separate packages. See [Release](RELEASE.md) and [Store submission](STORE_SUBMISSION.md).

## Developer reference

Companion provides EIP-1193 and announces Wren through EIP-6963 as
`io.github.jorphex.wren`. Legacy `frame_*` labels and `isFrame` remain for
compatibility.

Interface text uses Recursive. Technical values use the browser's monospace
font. Fira Code is not currently bundled.

Companion is based on the GPL-3.0 Frame extension and is maintained separately
from Frame Labs. See [Privacy](PRIVACY.md), [Security](SECURITY.md), and
[release notes](release-notes/).
