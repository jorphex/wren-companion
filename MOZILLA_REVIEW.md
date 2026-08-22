# Mozilla Reviewer Build Instructions

Wren Companion is derived from the GPL-3.0 `frame-labs/frame-extension` project.
It adds mutually authenticated protocol-3 pairing, strict origin and document routing,
EIP-6963 discovery, Manifest V3 support, and current browser and dependency
maintenance.

The submitted Firefox ZIP is generated with webpack and has matching reviewer
source attached. It contains no obfuscation or remote executable code.

## Data-transmission declaration

The extension communicates only with Wren desktop at
`ws://127.0.0.1:1248`. Mozilla defines data handled outside the add-on or local
browser as transmitted, so the Firefox manifest declares the following required
data types:

- `financialAndPaymentInfo`: wallet JSON-RPC messages can include accounts,
  messages, proposed transactions, and transaction results.
- `authenticationInfo`: the extension and Wren exchange pairing and
  authentication material for their local mutually authenticated connection.
- `browsingActivity`: each request includes the exact requesting origin so Wren
  can isolate and present the dapp identity.
- `websiteContent`: wallet JSON-RPC request and response data originates from
  and returns to the requesting document.

The maintainer receives none of this data. There is no telemetry, analytics,
advertising, cloud account, or developer-operated service. The declaration is
required because Wren is a separate local application, not because data leaves
the user's computer.

### Version 0.1.1 policy remediation

Version 0.1.0 explicitly included the browser name and runtime extension UUID in
its local authentication hello. Version 0.1.1 removes those fields from every
browser build. The signed installation ID and control/page public-key bundle are
the only Companion identity sent by the add-on and retained by Wren.

Firefox itself supplies a `moz-extension://...` Origin header when opening the
loopback WebSocket. Wren validates this browser-supplied header as live transport
security evidence and immediately discards the browser name/runtime UUID; neither
application persists it. There is no technical/interaction analytics, telemetry,
feature, or optional collection to declare. Automated protocol and packaged-
artifact checks reject reintroduction of the removed hello fields.

### Version 0.1.2 compatibility update

Version 0.1.2 retains the same protocol and data-transmission boundary. It adds
compatibility for dapps that use MetaMask's legacy provider marker as a generic
EIP-1193 gate, while Wren remains separately identified through EIP-6963. A
top-level content script now opens a lightweight browser-runtime port before the
first dapp RPC, allowing the popup to establish the active tab without opening a
desktop socket eagerly. Same-origin contract frames are aggregated without
downgrading a usable tab.

The new `storage` permission retains only the last network catalog successfully
read from local Wren. This prevents a Manifest V3 background restart or transient
localhost refresh failure from replacing known networks with an unavailable
screen. The cache contains no accounts, requests, transactions, page content, or
private keys and is cleared when pairing is reset.

The current candidate also binds popup identity changes to the exact top-level
document. Chromium uses the browser's `documentId`; on Firefox versions that do
not provide it to `scripting.executeScript`, a per-document random nonce supplies
the same fail-closed identity. A navigation or same-origin document replacement
invalidates the captured target before any write or reload.

Explorer qualification covers dapps that request their required chain before
account access, including BaseScan's Base-chain flow, in both Wren and legacy
MetaMask identity modes. The chain switch, chain confirmation, account request,
and resulting events all travel through the same authenticated, origin-bound page
channel.

## Build environment

- Release build: Ubuntu/Pop!_OS 22.04 x64
- Node.js: 24.18.1, pinned in `.nvmrc`
- npm: 11.12.0, pinned in `package.json`
- Dependencies: npm registry only, locked by `package-lock.json`

The build is architecture-independent and can run in Mozilla's ARM64 review
environment with the pinned Node and npm versions.

## Reproduce the Firefox output

From the source archive root:

```bash
npm ci
npm run build:firefox
```

The complete extension is written to `dist-firefox/`, and `build:firefox`
validates its inventory and manifest. With the submitted ZIP available beside
the source archive:

```bash
mkdir submitted
unzip wren-companion-0.1.2-firefox.zip -d submitted
diff -qr dist-firefox submitted
```

Create the release package with `npm run package:browsers` and verify it with
`npm run package:verify`.

## Functional test

Wren desktop must be running locally. Open the extension, compare the six-digit
pairing code in both interfaces, and approve the companion in Wren. Then open a
dapp or this repository's local qualification page. No account or paid service
is required; use disposable test accounts only.

## Included third-party runtime libraries

All exact versions are locked in `package-lock.json` and downloaded from the
official npm registry during `npm ci`. Upstream source repositories:

- Babel runtime: https://github.com/babel/babel/tree/main/packages/babel-runtime
- events: https://github.com/Gozala/events
- React and React DOM: https://github.com/facebook/react
- React Scheduler: https://github.com/facebook/react/tree/main/packages/scheduler
- react-restore: https://github.com/floating/restore
- styled-components: https://github.com/styled-components/styled-components
- Emotion property validation and memoization: https://github.com/emotion-js/emotion
- Stylis: https://github.com/thysultan/stylis.js
