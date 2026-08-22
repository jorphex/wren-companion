# Privacy Policy

Effective: August 22, 2026

Wren Companion connects Ethereum apps in your browser to Wren on the same
computer. It has no analytics, advertising, telemetry, remote code, cloud
account, or service operated by the developer.

## What the extension handles

When a site asks Wren to do something, the extension handles the wallet request
and response. This data can include account addresses, network identifiers,
messages, and proposed transactions.

The browser also gives the extension the full URL of the page making the
request. The extension uses the URL on your device to keep each request tied to
the correct page. It sends only the site's origin, such as
`https://app.example.com`, with wallet messages to Wren at
`ws://127.0.0.1:1248`. It does not send the URL path, query, or fragment to Wren,
the maintainer, or another third party.

Browser stores call these data types financial and payment information,
authentication information, browsing activity, and website content. These
labels describe data that can pass locally between a site and Wren. The
maintainer does not collect or receive it.

Wren and a site may separately communicate with network providers or other
services selected by their operators. Those communications are outside
Companion and are governed by their respective policies.

## Local storage and browser access

The extension stores a nonextractable P-256 key bundle and the identity of the
paired Wren installation in browser IndexedDB. These values let the two apps
recognize each other. They are not wallet private keys and cannot sign
transactions. They remain until you reset pairing or remove the extension.

The extension also stores the last network list it received from Wren. This list
contains network identifiers, names, availability, and test-network labels. It
keeps the popup useful during a brief local disconnect or browser background
restart. It contains no account, transaction, private-key, or page-content data.
It is cleared when you reset pairing or remove the extension.

Companion code does not add or store the browser name or the browser's runtime
extension UUID. Firefox and Chromium attach an extension Origin header to the
local WebSocket. Wren checks this header for the live local connection, then
discards the browser name and runtime UUID before it creates or stores pairing
state. Companion collects no technical or interaction analytics.

An optional site setting can make Wren appear as a legacy MetaMask provider.
The browser stores this choice only for that site. Request routing, account and
network state, and pending messages otherwise remain in memory.

HTTP and HTTPS access lets Companion offer Wren to sites you visit. It does not
scrape page content or browsing history. The other browser permissions support
the same purpose:

- `scripting` reads or changes the current site's Wren/MetaMask setting and
  keeps that action tied to the correct page.
- `storage` retains the local network list described above.
- `alarms` keeps the local Wren connection state current.

## Collection and sharing

The maintainer does not collect, retain, sell, or share user data. All handling
above occurs locally on the user's device, and the extension does not execute
remotely hosted code.

## Chrome Web Store Limited Use

The use of information received from Google APIs will adhere to the Chrome Web
Store User Data Policy, including the Limited Use requirements.

Wren Companion's use of information received from Chrome APIs is limited to
providing its single purpose: connecting Ethereum apps in the browser to the
user's locally running Wren wallet. It does not use or transfer that information
for advertising, creditworthiness, lending, or any unrelated purpose. It does
not sell user data or allow humans to read it. The only transfer is to the
user's local Wren application when necessary to provide the requested wallet
feature.

For privacy reports, use the private contact method in [Security](SECURITY.md),
or file a public issue when appropriate in the
[issue tracker](https://github.com/jorphex/wren-companion/issues).
