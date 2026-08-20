# Privacy Policy

Effective: August 20, 2026

Wren Companion connects browser dapps to a Wren desktop wallet on the same
computer. It has no analytics, advertising, telemetry, remote code,
developer-operated service, or cloud account.

## What the companion handles

The companion processes the active page origin and wallet JSON-RPC messages,
which can contain account addresses, chain identifiers, messages, and proposed
transactions. It routes them only between the requesting browser document and
Wren at `ws://127.0.0.1:1248`; the extension does not send them to the
maintainer or another third party.

For browser-store disclosure purposes, this local routing can involve financial
and payment information, authentication information, browsing activity, and
website content. These labels describe the data types that can pass between a
dapp and Wren; they do not mean the maintainer collects or receives that data.

Wren desktop and a dapp may separately communicate with RPC endpoints or other
services selected by their operators. Those communications are outside
Companion and are governed by their respective policies.

## Local storage and browser access

The companion stores a nonextractable P-256 control/page key bundle and the pinned
Wren installation identity in browser IndexedDB. They mutually authenticate the
local connection, are not wallet private keys, and cannot sign blockchain
transactions. They remain until the user resets pairing or removes the extension.

The companion also stores Wren's last successfully read network catalog in browser
extension storage. This cache contains network metadata such as chain identifiers,
names, currency and explorer details, and connection availability. It keeps the
popup useful when a Manifest V3 background worker restarts or a localhost refresh
briefly fails. It contains no account, transaction, private-key, or page-content
data and is cleared when pairing is reset or the extension is removed.

Companion does not intentionally send or store the browser name or the browser's
runtime extension UUID. Firefox and Chromium attach an extension Origin header to
the local WebSocket as part of the browser transport. Wren validates that header
only to authenticate the live local transport, then discards the browser name and
runtime UUID before constructing or storing pairing state. Companion collects no
technical/interaction analytics or telemetry.

An optional per-site setting that makes Wren appear as a legacy MetaMask
provider is stored in that site's browser local storage. Request routing,
account and chain state, and pending messages otherwise remain in memory.

HTTP and HTTPS access lets Companion inject the provider at document start and
route requests on sites the user visits. It does not scrape arbitrary page
content or browsing history. `scripting` is used only when the user changes the
per-site legacy-provider setting, `storage` retains the local network catalog and
pairing-independent popup continuity described above, and `alarms` keeps the local
Wren connection state current.

## Collection and sharing

The maintainer does not collect, retain, sell, or share user data. All handling
above occurs locally on the user's device, and the extension does not execute
remotely hosted code.

## Chrome Web Store Limited Use

Wren Companion's use of information received from Chrome APIs is limited to
providing its single purpose: connecting browser dapps to the user's locally
running Wren wallet. It does not use or transfer that information for
advertising, creditworthiness, lending, or any unrelated purpose. It does not
sell user data or allow humans to read it. The only transfer is to the user's
local Wren application when necessary to provide the requested wallet feature.

For privacy reports, use the private contact method in [Security](SECURITY.md),
or file a public issue when appropriate in the
[issue tracker](https://github.com/jorphex/wren-companion/issues).
