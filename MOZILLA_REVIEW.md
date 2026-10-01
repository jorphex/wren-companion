# Mozilla Reviewer Build Instructions

Companion sends wallet requests only to Wren on the same computer at
`ws://127.0.0.1:1248`. Wren handles account access, approvals, and signing.
The Firefox ZIP is built with webpack and has matching reviewer source.
Executable code is bundled; there is no obfuscation or remote executable code.

Companion is based on the GPL-3.0 `frame-labs/frame-extension` project.
It adds protocol-3 pairing, document-specific routing, EIP-6963 discovery,
and Manifest V3 support.

## Data declaration

The Firefox manifest declares four required data types for local communication
with Wren:

- `financialAndPaymentInfo`: accounts, messages, transactions, and results in
  wallet requests and replies.
- `authenticationInfo`: pairing and authentication material.
- `browsingActivity`: the requesting site's origin.
- `websiteContent`: wallet request data from the document and replies to it.

The browser's full page URL identifies the document locally. Only the origin
goes to Wren. The maintainer receives none of this data. There is no telemetry,
analytics, advertising, cloud account, or developer-operated service.
See [Privacy](PRIVACY.md) for retention and permissions.

## Version details

### 0.1.3: Connection retries

Connection checks stop after three seconds. Each attempt has its own ID, so
late replies cannot cancel a retry or change its network. Failed attempts
release queued requests and timers. Transaction and approval requests keep
their existing wait behavior.

Protocol 3, permissions, and data types are unchanged. Use Wren 0.1.11 or a
later compatible build; the exact minimum commit is in `compatibility.json`.

### 0.1.2: Site compatibility

Wren can present a legacy MetaMask provider marker while keeping its own
EIP-6963 identity. This supports apps that use the marker to check compatibility.
A top-level runtime port lets the popup identify the active tab before the
first wallet request, without opening a desktop socket. Same-origin frames
retain the top-level tab's connection status.

The `storage` permission keeps the last network list from Wren through brief
disconnects and background restarts. It contains no accounts, requests,
transactions, page content, or private keys. Pairing reset clears it.

Popup setting changes target the exact document. Chrome uses `documentId`;
Firefox uses a per-document random nonce when that API does not supply an ID.
Navigation or document replacement invalidates the target before a write or reload.

Explorer tests cover requests to switch networks before account access,
including BaseScan, in Wren and legacy MetaMask modes. Requests and events use
the authenticated, origin-specific page channel.

### 0.1.1: Authentication fields

Companion removed the browser name and runtime extension UUID sent by 0.1.0.
Its signed installation ID and control/page public keys identify it to Wren.
Firefox supplies its own `moz-extension://...` Origin header. Wren checks this
for the live connection, then discards the browser identifiers before storing
pairing. Neither app stores the runtime UUID.

There is no technical/interaction analytics, optional collection, or related
feature to declare. Protocol and artifact checks guard these field removals.

## Build

Use the pinned Node.js 24.18.1 and npm 11.12.0. Dependencies come from the npm
registry and are locked in `package-lock.json`. The build runs on x64 and ARM64;
the release build uses Ubuntu/Pop!_OS 22.04 x64.

From the source archive root:

```bash
npm ci
npm run build:firefox
```

Output is in `dist-firefox/`. The build checks its manifest and file inventory.
Compare it with the submitted ZIP:

```bash
mkdir submitted
unzip wren-companion-0.1.3-firefox.zip -d submitted
diff -qr dist-firefox submitted
```

Create release packages with `npm run package:browsers` and verify them with
`npm run package:verify`.

## Test

Start compatible Wren desktop, open Companion, compare the six-digit codes,
and approve pairing. Open an Ethereum app or the local test page served by
`npm run qualify:serve`. Use test accounts; no paid service is required.

## Third-party runtime source

Exact versions are in `package-lock.json`.

- Babel runtime: https://github.com/babel/babel/tree/main/packages/babel-runtime
- events: https://github.com/Gozala/events
- React and React DOM: https://github.com/facebook/react
- React Scheduler: https://github.com/facebook/react/tree/main/packages/scheduler
- react-restore: https://github.com/floating/restore
- styled-components: https://github.com/styled-components/styled-components
- Emotion: https://github.com/emotion-js/emotion
- Stylis: https://github.com/thysultan/stylis.js
