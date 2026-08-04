# Privacy Policy

Effective: August 4, 2026

Frame Community Companion connects browser dapps to a Frame desktop wallet
running on the same computer. It has no analytics, advertising, telemetry,
remote code, developer-operated service, or cloud account.

## Data Handling

The companion processes the active page origin and wallet JSON-RPC messages,
which can contain account addresses, chain identifiers, messages, and proposed
transactions. This information is routed only between the requesting browser
document and Frame at `ws://127.0.0.1:1248`. It is not sent to the companion
maintainer or any third party by the extension.

Frame desktop and the dapp may independently communicate with RPC endpoints or
other services selected by their operators. Those communications are outside
the companion and are governed by the respective software and service policies.

## Local Storage

The companion stores a non-exportable P-256 pairing credential in browser
IndexedDB. The credential identifies this extension installation to Frame; it
is not a wallet private key and cannot sign blockchain transactions. It remains
until the user resets the companion credential or removes the extension.

An optional per-site setting that makes Frame appear as a legacy MetaMask
provider is stored in that site's browser local storage. Request routing,
account and chain state, and pending messages are otherwise held only in memory.

## Browser Access

Access to HTTP and HTTPS pages is required to inject the wallet provider at
document start and route requests for dapps on sites the user chooses to visit.
The companion does not scrape arbitrary page content or browsing history.
`scripting` is used only when the user changes the per-site legacy-provider
setting, and `alarms` keeps the local Frame connection state current.

## Collection and Sharing

The maintainer does not collect, retain, sell, or share user data. All handling
described above occurs locally on the user's device. The extension does not
execute remotely hosted code.

Questions or privacy reports can be filed privately using the contact method in
[`SECURITY.md`](SECURITY.md), or publicly when appropriate through the
[issue tracker](https://github.com/jorphex/frame-extension/issues).
