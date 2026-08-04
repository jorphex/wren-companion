# Browser Store Submission

Submit Companion `0.13.1` independently of Frame desktop releases. Reuse this
store version with future desktop releases while authenticated protocol 2
remains compatible.

## Qualified Files

Generate and verify the files from the exact clean release commit:

```bash
npm run package:browsers
npm run package:verify
```

- Chrome: `artifacts/frame-companion-0.13.1-chrome.zip`
- Firefox: `artifacts/frame-companion-0.13.1-firefox.zip`
- Firefox reviewer source: `artifacts/frame-companion-0.13.1-source.zip`
- Checksums: `artifacts/SHA256SUMS`

Do not interchange the browser ZIPs. Do not upload the reviewer-source ZIP as
the installable add-on.

## Shared Listing Copy

**Name:** Frame Community Companion

**Summary:** Community-maintained browser companion connecting dapps to the
Jorphex Frame desktop wallet.

**Description:**

Frame Community Companion connects browser-based Ethereum and EVM dapps to the
Jorphex Frame wallet running on your desktop.

Frame keeps accounts, hardware signers, approvals, and transaction review in
the desktop application. The companion injects an EIP-1193 provider, announces
Frame through EIP-6963, and routes each page's requests to the local wallet. A
six-digit code must be compared and approved before the browser installation is
paired with Frame.

This is a community-maintained fork and is not an official Frame Labs release.
Frame desktop is required. The companion has no telemetry, advertising, remote
code, cloud account, or developer-operated data service.

**Homepage:** https://github.com/jorphex/frame-extension

**Support:** https://github.com/jorphex/frame-extension/issues

**Privacy policy:**
https://github.com/jorphex/frame-extension/blob/main/PRIVACY.md

**License:** GNU General Public License v3.0 only

## Chrome Web Store

Upload the Chrome ZIP as a new item. Use `Workflow & Planning` as the category,
English as the default language, and public distribution. The existing upstream
listing is a separate item and cannot be updated from this publisher account.

Privacy form answers:

- **Single purpose:** Connect browser dapps to the user's locally running
  Jorphex Frame desktop wallet.
- **alarms:** Maintains and refreshes the localhost Frame connection state while
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
  single purpose. It transmits them only to Frame on `127.0.0.1`; the maintainer
  does not collect or receive them. Certify all applicable limited-use
  statements.

The dashboard also requires the 128x128 icon from `src/icons/icon128.png` and
the prepared `store-assets/promo-440x280.png` small promotional tile. Upload
these real 1280x800 product screenshots in this order:

1. `store-assets/screenshot-connected-1280x800.png` — Companion connected to
   Frame while available to a browser dapp.
2. `store-assets/screenshot-pairing-1280x800.png` — matching six-digit approval
   codes in Companion and Frame desktop.

The public dapp in the first screenshot is shown only to demonstrate the
companion in normal use. Do not reuse screenshots from the upstream listing.

Test instructions for reviewers:

1. Install Jorphex Frame desktop from its GitHub release and start it.
2. Open the companion popup and compare the six-digit code with Frame.
3. Approve pairing in Frame.
4. Visit a dapp; Frame is announced through EIP-6963 and connection requests
   appear in the desktop wallet.
5. No account or paid service is required; disposable accounts are recommended.

Choose deferred publishing when submitting for review so approval can be
checked before the listing becomes public.

## Mozilla Add-ons

In the Add-ons Developer Hub, submit a new add-on **On this site** and upload the
Firefox ZIP. The manifest's UUID is unique to this fork. Select desktop Firefox,
mark the add-on experimental while the desktop wallet is still a preview, and
indicate that additional free software (Frame desktop) is required.

When asked whether source is required, choose **Yes** and upload the matching
reviewer-source ZIP. Paste the functional test steps above into Notes for
Reviewers and point reviewers to `MOZILLA_REVIEW.md` inside the source archive.
Select the GPL-3.0-only license, provide the shared listing copy and privacy
policy, then submit the version for signing and review.

After Mozilla signs the version, install the signed file in regular Firefox and
repeat pairing, connection, account/chain event, reset, and revocation checks
before linking it from the desktop repository.
