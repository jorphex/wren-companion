# Browser Store Submission

Submit Companion 0.1.3 as an update to the existing Chrome and Firefox listings.
It adds connection retry fixes for Wren 0.1.11. Pairing protocol 3 and
permissions are unchanged.

## Prepare

- Stage or publish the desktop build named in `compatibility.json`, or a later
  compatible build, so reviewers can install Wren.
- Use the existing store accounts, with verified contact details and Chrome
  two-step verification.
- Create the `v0.1.3` draft from a clean, reviewed commit. Use one verified
  artifact set throughout submission.
- After the tag exists, use its privacy-policy link below.

Build and verify with:

```bash
npm run package:browsers
npm run package:verify
```

| Purpose                 | File                                         |
| ----------------------- | -------------------------------------------- |
| Chrome                  | `artifacts/wren-companion-0.1.3-chrome.zip`  |
| Firefox                 | `artifacts/wren-companion-0.1.3-firefox.zip` |
| Mozilla reviewer source | `artifacts/wren-companion-0.1.3-source.zip`  |
| Checksums               | `artifacts/SHA256SUMS`                       |

The source ZIP is for review. Install the ZIP made for each browser.

## Listing copy

**Name:** Wren Companion

**Summary:** Connect Ethereum apps in your browser to Wren on your desktop.

**Update summary:** Improved connection retries. Late replies no longer
interrupt a new attempt or change its network. Permissions are unchanged.

**Description:**

Wren Companion connects Ethereum apps in your browser to Wren on the same
computer. Wren handles accounts, hardware wallets, approvals, and transaction
review. To pair, compare the six-digit code in both apps.

Wren desktop is required. Companion is based on the GPL-3.0 Frame extension
and is maintained separately from Frame Labs. It has no telemetry,
advertising, cloud account, developer-operated service, or remote executable code.

**Homepage:** https://github.com/jorphex/wren-companion

**Support:** https://github.com/jorphex/wren-companion/issues

**Privacy:** https://github.com/jorphex/wren-companion/blob/v0.1.3/PRIVACY.md

**License:** GNU General Public License v3.0 only

Use `src/icons/icon128.png`, `store-assets/promo-440x280.png`, and the three v14
listing screenshots. See [Store assets](store-assets/README.md) for capture
sources and regeneration steps.

## Chrome Web Store

Upload the Chrome ZIP as a new version of the
[existing listing](https://chromewebstore.google.com/detail/wren-companion/ifimccfajfbgligbhcgfapdagpnfkbhn).
Keep the current category and language.

Use these privacy-form answers:

- **Single purpose:** Connect browser Ethereum apps to local Wren.
- **alarms:** Refresh local connection state when the background worker sleeps
  or resumes.
- **scripting:** Read or change the current site's provider setting. Bind the
  action and acknowledged reload to that exact document.
- **storage:** Keep the last network list from Wren through background restarts
  and brief disconnects. The list has no accounts, transactions, page content,
  or private keys. Pairing reset clears it.
- **Host access:** Offer the EIP-1193 provider at document start on HTTP and
  HTTPS sites. Route requests by browser-supplied tab, frame, document, and origin.
- **Remote code:** None; executable code is bundled.
- **Data handling:** Select financial and payment information, authentication
  information, web history, and website content. The full page URL is used
  locally to identify the document. Only its origin, local pairing identity,
  and wallet messages go to Wren on `127.0.0.1`. The maintainer receives none
  of this data. Confirm the Limited Use statements in [Privacy](PRIVACY.md).

Choose deferred publishing. Check the approved listing and package version,
then publish within 30 days. Install the live version in a clean profile and
repeat the reviewer steps below.

## Firefox Add-ons

Upload the Firefox ZIP as a new version of the
[existing add-on](https://addons.mozilla.org/en-US/firefox/addon/wren-companion/).
Keep its add-on ID and desktop Firefox target. State that Wren desktop is required.

Choose **Yes** when asked for source and attach the matching reviewer-source ZIP.
Use GPL-3.0-only, the listing and privacy text above, and the build instructions
and third-party source links in [Mozilla review](MOZILLA_REVIEW.md).
Include the reviewer steps below in Notes for Reviewers.

Keep these required data categories: financial and payment information,
authentication information, browsing activity, and website content. They cover
local routing to Wren. Do not select `technicalAndInteraction`; Companion has
no such analytics or feature.

Mention that 0.1.1 removed browser names and runtime extension UUIDs from
Companion authentication. Wren checks Firefox's browser-supplied Origin header
for the live connection and does not store those identifiers.

After signing, install the signed package in regular Firefox. Check pairing,
connection, account and network events, reset, and revocation before publication.

## Reviewer steps

1. Install and start the compatible Wren desktop build.
2. Open Companion, compare its six-digit code with Wren, and approve pairing.
3. Visit an Ethereum app. Wren appears through EIP-6963; connection requests
   open in the desktop wallet.
4. Use test accounts. No paid service is required.
