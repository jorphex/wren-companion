# Security Policy

Data handling and retention are documented separately in the
[privacy policy](PRIVACY.md).

## Supported Version

Only the newest release published by
[`jorphex/wren-companion`](https://github.com/jorphex/wren-companion/releases)
is considered for security fixes. Development branches and locally built
artifacts are unsupported previews.

This companion is not a wallet or signer. It injects an EIP-1193 provider into
web pages and routes requests to the separately installed Wren desktop wallet.
It never needs a seed phrase, private key, or hardware-wallet PIN. Do not enter
those secrets into the extension or a dapp page.

## Trust Boundary

- Browser APIs establish the requesting origin, tab, frame, and document. Page
  payloads cannot supply that authority.
- Each document owns an isolated, bounded localhost WebSocket and receives only
  its own responses, events, and subscriptions.
- A nonextractable per-installation P-256 credential authenticates Companion to
  Wren after explicit six-digit pairing approval.
- Protocol version 2 does not authenticate Wren or the localhost endpoint back
  to Companion. A same-user process that owns or intercepts port 1248 remains in
  the trusted computing base.
- Web-page code shares the page's provider environment and can replace or wrap
  injected JavaScript. The extension does not treat page code as trusted or
  store wallet authority in that bridge.
- Browser-profile compromise, malicious extensions with sufficient privileges,
  host compromise, dependency compromise, and unreviewed binaries are outside
  the guarantees of the pairing protocol.

Wren remains the approval, permission, account, signing, and broadcast
authority. Review every request in Wren and on the hardware device where
available.

## Reporting

Do not include private keys, seed phrases, real pairing credentials, or valuable
account data in a report. Prefer GitHub's private vulnerability-reporting path
for this repository when available; otherwise contact the maintainer privately
through the repository owner's GitHub profile before filing a public issue.

Include the affected commit or release, browser and version, desktop build,
impact, and reproducible steps using disposable accounts. Do not test against
another person's browser profile, wallet, device, dapp, or funds.
