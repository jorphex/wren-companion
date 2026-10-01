# Privacy Policy

Effective: October 1, 2026

Wren Companion sends wallet requests to Wren on the same computer. It has no
analytics, advertising, telemetry, cloud account, developer-operated service,
or remotely hosted executable code.

## Data handled

Wallet requests and replies can contain account addresses, network IDs,
messages, proposed transactions, and results.

The browser supplies the requesting page's full URL. Companion uses it locally
to keep each request tied to the correct page. Only the site's origin, such as
`https://app.example.com`, goes to Wren with wallet messages at
`ws://127.0.0.1:1248`. URL paths, queries, and fragments stay on your device.

Browser stores classify this local exchange as financial and payment
information, authentication information, browsing activity, and website
content. The maintainer receives none of it.

Wren and websites may use their own network providers and services. Their
policies cover those requests.

## Data kept on your device

- **Pairing:** Browser IndexedDB holds nonextractable P-256 keys and the paired
  Wren installation's identity. These keys identify the apps; they cannot sign
  wallet transactions. Resetting pairing or removing Companion clears them.
- **Networks:** Browser storage keeps the last network list from Wren: IDs,
  names, availability, and test-network labels. This keeps the popup useful
  during disconnects and background restarts. The list has no accounts,
  transactions, private keys, or page content. Pairing reset or removal clears it.
- **Site preference:** An optional per-site setting presents Wren as a legacy
  MetaMask provider. The browser stores this choice for that site.

Request routing, account and network state, and pending messages otherwise
stay in memory.

Companion does not add or store browser names or runtime extension UUIDs.
Browsers attach an Origin header to the local WebSocket. Wren checks it for
the connection, then discards those browser identifiers before storing pairing.

## Browser access

HTTP and HTTPS access lets Companion offer Wren to websites. It does not scrape
page content or browsing history.

- `scripting` reads or changes the current site's provider setting and ties the
  action to the correct page.
- `storage` keeps the network list above.
- `alarms` refreshes local connection state.

The maintainer does not collect, retain, sell, or share user data. Companion's
handling takes place on your device.

## Chrome Web Store Limited Use

The use of information received from Google APIs will adhere to the Chrome Web
Store User Data Policy, including the Limited Use requirements.

Chrome API data is used only to connect browser apps to your local Wren wallet.
It is transferred only to local Wren when needed for your wallet request. It is
not sold, made available for human review, or used for advertising,
creditworthiness, lending, or unrelated purposes.

For a private privacy report, use [Security](SECURITY.md). General questions can
use the [issue tracker](https://github.com/jorphex/wren-companion/issues).
