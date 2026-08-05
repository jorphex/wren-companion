# Browser Store Submission

Submit Wren Companion `0.1.0` independently of Wren desktop releases. Reuse this
store version with future desktop releases while authenticated protocol 2
remains compatible.

## Qualified Files

Generate and verify the files from the exact clean release commit:

```bash
npm run package:browsers
npm run package:verify
```

- Chrome: `artifacts/wren-companion-0.1.0-chrome.zip`
- Firefox: `artifacts/wren-companion-0.1.0-firefox.zip`
- Firefox reviewer source: `artifacts/wren-companion-0.1.0-source.zip`
- Checksums: `artifacts/SHA256SUMS`

Do not interchange the browser ZIPs. Do not upload the reviewer-source ZIP as
the installable add-on.

## Shared Listing Copy

**Name:** Wren Companion

**Summary:** Connect browser dapps to the Wren desktop wallet.

**Description:**

Wren Companion connects browser-based Ethereum and EVM dapps to the Wren wallet
running on your desktop.

Wren keeps accounts, hardware signers, approvals, and transaction review in
the desktop application. The companion injects an EIP-1193 provider, announces
Wren through EIP-6963, and routes each page's requests to the local wallet. A
six-digit code must be compared and approved before the browser installation is
paired with Wren.

Wren desktop is required. This project is derived from the original GPL-3.0
Frame extension and is not affiliated with Frame Labs. The companion has no
telemetry, advertising, remote code, cloud account, or developer-operated data
service.

**Homepage:** https://github.com/jorphex/wren-companion

**Support:** https://github.com/jorphex/wren-companion/issues

**Privacy policy:**
https://github.com/jorphex/wren-companion/blob/main/PRIVACY.md

**License:** GNU General Public License v3.0 only

## Chrome Web Store

Upload the Chrome ZIP as a new item. Use `Workflow & Planning` as the category,
English as the default language, and public distribution. The existing upstream
listing is a separate item and cannot be updated from this publisher account.

Privacy form answers:

- **Single purpose:** Connect browser dapps to the user's locally running
  Wren desktop wallet.
- **alarms:** Maintains and refreshes the localhost Wren connection state while
  the Manifest V3 service worker is suspended and resumed.
- **scripting:** Reads or changes the per-site legacy-provider preference only
  when the user explicitly toggles it in the extension popup.
- **Host access:** Injects the EIP-1193 provider at document start on HTTP and
  HTTPS dapp pages. Sites cannot be predicted in advance; requests remain
  isolated by browser-provided tab, frame, document, and origin identity.
- **Remote code:** No. All executable code is bundled in the extension.
- **Data handling:** Select financial and payment information, authentication
  information, web history, and website content. The extension handles only the
  dapp origin, local pairing credential, and wallet RPC messages needed for its
  single purpose. It transmits them only to Wren on `127.0.0.1`; the maintainer
  does not collect or receive them. Certify all applicable limited-use
  statements.

Use `src/icons/icon128.png` as the provisional store icon. Do not publish the
existing `store-assets` screenshots or promo tile: they document the historical
Frame build and must be replaced with real Wren-branded captures before store
submission. Capture these 1280x800 product states in this order:

1. `store-assets/screenshot-connected-1280x800.png` — Companion connected to
   Wren while available to a browser dapp.
2. `store-assets/screenshot-pairing-1280x800.png` — matching six-digit approval
   codes in Companion and Wren desktop.

The public dapp in the first screenshot is shown only to demonstrate the
companion in normal use. Do not reuse screenshots from the upstream listing.

Test instructions for reviewers:

1. Install Wren desktop from its GitHub release and start it.
2. Open the companion popup and compare the six-digit code with Wren.
3. Approve pairing in Wren.
4. Visit a dapp; Wren is announced through EIP-6963 and connection requests
   appear in the desktop wallet.
5. No account or paid service is required; disposable accounts are recommended.

Choose deferred publishing when submitting for review so approval can be
checked before the listing becomes public.

## Mozilla Add-ons

In the Add-ons Developer Hub, submit a new add-on **On this site** and upload the
Firefox ZIP. The manifest's UUID is unique to this fork. Select desktop Firefox,
mark the add-on experimental while the desktop wallet is still a preview, and
indicate that additional free software (Wren desktop) is required.

When asked whether source is required, choose **Yes** and upload the matching
reviewer-source ZIP. Paste the functional test steps above into Notes for
Reviewers and point reviewers to `MOZILLA_REVIEW.md` inside the source archive.
Select the GPL-3.0-only license, provide the shared listing copy and privacy
policy, then submit the version for signing and review.

After Mozilla signs the version, install the signed file in regular Firefox and
repeat pairing, connection, account/chain event, reset, and revocation checks
before linking it from the desktop repository.
