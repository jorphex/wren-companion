# Privacy Policy

Effective: August 4, 2026

Wren Companion connects browser dapps to a Wren desktop wallet on the same
computer. It has no analytics, advertising, telemetry, remote code,
developer-operated service, or cloud account.

## What the companion handles

The companion processes the active page origin and wallet JSON-RPC messages,
which can contain account addresses, chain identifiers, messages, and proposed
transactions. It routes them only between the requesting browser document and
Wren at `ws://127.0.0.1:1248`; the extension does not send them to the
maintainer or another third party.

Wren desktop and a dapp may separately communicate with RPC endpoints or other
services selected by their operators. Those communications are outside
Companion and are governed by their respective policies.

## Local storage and browser access

The companion stores a non-exportable P-256 pairing credential in browser
IndexedDB. It identifies this extension installation to Wren, is not a wallet
private key, and cannot sign blockchain transactions. It remains until the user
resets the credential or removes the extension.

An optional per-site setting that makes Wren appear as a legacy MetaMask
provider is stored in that site's browser local storage. Request routing,
account and chain state, and pending messages otherwise remain in memory.

HTTP and HTTPS access lets Companion inject the provider at document start and
route requests on sites the user visits. It does not scrape arbitrary page
content or browsing history. `scripting` is used only when the user changes the
per-site legacy-provider setting, and `alarms` keeps the local Wren connection
state current.

## Collection and sharing

The maintainer does not collect, retain, sell, or share user data. All handling
above occurs locally on the user's device, and the extension does not execute
remotely hosted code.

For privacy reports, use the private contact method in [Security](SECURITY.md),
or file a public issue when appropriate in the
[issue tracker](https://github.com/jorphex/wren-companion/issues).
