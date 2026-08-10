# Security Policy

For data handling and retention, see [Privacy](PRIVACY.md).

## Scope and support

Only the newest release published by
[`jorphex/wren-companion`](https://github.com/jorphex/wren-companion/releases)
is considered for security fixes. Development branches and local builds are
unsupported previews.

Companion is not a wallet or signer. It injects an EIP-1193 provider and routes
requests to the separately installed Wren desktop wallet. Never enter a seed
phrase, private key, or hardware-wallet PIN in the extension or a dapp page.

## Security boundary

- Browser APIs supply the requesting origin, tab, frame, and document; page
  payloads cannot supply that authority. Each document has an isolated, bounded
  localhost WebSocket and receives only its own responses, events, and
  subscriptions.
- After an explicit six-digit approval, a nonextractable, per-installation
  P-256 credential authenticates Companion to Wren.
- Protocol 2 does not authenticate Wren or the localhost endpoint to
  Companion. The settings UI reports a compatible desktop connection, not a
  Wren server identity. A same-user process that owns or intercepts port 1248
  remains in the trusted computing base.
- Web-page code shares the page's provider environment and can replace or wrap
  injected JavaScript. It is not trusted, and the bridge stores no wallet
  authority. Browser-profile compromise, malicious extensions with sufficient
  privileges, host or dependency compromise, and unreviewed binaries are
  outside the pairing protocol's guarantees.

Wren remains the approval, permission, account, signing, and broadcast
authority. Review every request in Wren and, where available, on the hardware
device.

## Report a vulnerability

Do not include private keys, seed phrases, real pairing credentials, or valuable
account data. Use GitHub's private vulnerability-reporting path for this
repository when available; otherwise contact the maintainer privately through
the repository owner's GitHub profile before opening a public issue.

Include the affected commit or release, browser and version, desktop build,
impact, and reproducible steps using disposable accounts. Do not test another
person's browser profile, wallet, device, dapp, or funds.
