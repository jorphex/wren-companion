# Browser Store Submission

Submit Wren Companion 0.1.2 independently of Wren desktop releases. Keep this
store version for later desktop releases while mutually authenticated protocol 3 remains
compatible. Store credentials and publication are manual and external.

## Maintainer prerequisites

Before uploading anything:

- Publish or stage a Wren desktop build at or after the exact minimum commit in
  `compatibility.json` so reviewers can install the required local application.
- Register the Chrome Web Store publisher account, pay Google's one-time fee,
  enable two-step verification, choose the durable publisher name, and verify
  the monitored contact email.
- Sign in to Firefox Add-ons Developer Hub, accept its current agreements, and
  confirm the account email.
- Create the Companion `v0.1.2` draft from the exact candidate commit. Use its
  checksums to identify the files below; do not rebuild during form entry.
- Use the immutable tagged privacy-policy URL
  `https://github.com/jorphex/wren-companion/blob/v0.1.2/PRIVACY.md` after the
  tag exists.

## Qualified files

From the exact clean release commit, run:

```bash
npm run package:browsers
npm run package:verify
```

- Chrome: `artifacts/wren-companion-0.1.2-chrome.zip`
- Firefox: `artifacts/wren-companion-0.1.2-firefox.zip`
- Firefox reviewer source: `artifacts/wren-companion-0.1.2-source.zip`
- Checksums: `artifacts/SHA256SUMS`

Do not interchange browser ZIPs or upload the reviewer-source ZIP as an
installable add-on.

## Shared listing copy

**Name:** Wren Companion

**Summary:** Connect browser dapps to the Wren desktop wallet.

**Description:**

Wren Companion connects browser-based Ethereum and EVM dapps to the Wren wallet
running on your desktop. Wren retains accounts, hardware signers, approvals, and
transaction review. The companion injects an EIP-1193 provider, announces Wren
through EIP-6963, and routes each page's requests to the local wallet. Before
pairing, compare and approve a six-digit code in both interfaces.

Wren desktop is required. This GPL-3.0 project is derived from the original
Frame extension and is not affiliated with Frame Labs. The companion has no
telemetry, advertising, remote code, cloud account, or developer-operated data
service.

**Homepage:** https://github.com/jorphex/wren-companion

**Support:** https://github.com/jorphex/wren-companion/issues

**Privacy policy:**
https://github.com/jorphex/wren-companion/blob/v0.1.2/PRIVACY.md

**License:** GNU General Public License v3.0 only

## Chrome Web Store

Upload the Chrome ZIP as a new item. Select `Workflow & Planning`, English as
the default language, and public distribution. The upstream listing is a
separate item and cannot be updated from this publisher account.

Privacy form answers:

- **Single purpose:** Connect browser dapps to the user's locally running Wren
  desktop wallet.
- **alarms:** Maintains and refreshes localhost Wren connection state while the
  Manifest V3 service worker is suspended and resumed.
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
  statements. The matching public Limited Use disclosure is in `PRIVACY.md`.

Use `src/icons/icon128.png` as the approved Character-flat store icon. It keeps
the square artwork inside Chrome's 96-by-96 safe area on a transparent 128px
canvas; regenerate it with `npm run store:icon`. The matching
`store-assets/promo-440x280.png` and all three v14 PNGs in
`store-assets/screenshots/` are ready for submission. They are composed from
isolated captures of the actual Companion and Wren renderers. Pairing,
connection, address, and transaction details come from disposable qualification
fixtures with no authority or funds. Uniswap is shown only as a recognizable
public dapp example; Wren is not affiliated with Uniswap. Do not publish
historical Frame screenshots or reuse upstream-listing assets; they have no
continuity with that listing.

Screenshot regeneration:

- Generate the pairing and connected Companion source captures in a private
  mode-0700 directory:

  ```sh
  WREN_COMPANION_QUALIFICATION_EXPORT=<directory> \
    WREN_COMPANION_STORE_DAPP_URL=https://app.uniswap.org/ \
    npm run qualify:browser -- --browser=chrome
  ```

  The optional dapp URL is restricted to this reviewed HTTPS example and is
  used only after the normal local qualification assertions pass.

- Read the disposable six-digit code from the Companion export, then generate
  matching Wren source captures through Wren's isolated Xvfb UI qualification
  with `WREN_UI_QUALIFICATION_PAIRING_CODE=<six digits>` and scenarios
  `tray-native-pairing-full-1` and
  `tray-transaction-method-verified-full-1.5`.
- Refresh `store-assets/source/uniswap-home.png` only from a clean disposable
  browser profile. Review the page for account, wallet, notification, and
  browser-profile details before retaining it.
- Copy the reviewed source captures to `store-assets/source/`, then run
  `npm run store:screenshots` and `npm run brand:verify`.
- Never replace the synthetic fixtures with a usable pairing code, funded wallet
  address, real transaction identifier, browser-profile detail, recovery
  material, or hardware-wallet identifier.
- Store screenshots are listing assets and are intentionally not embedded in the
  extension ZIP.

Reviewer test steps:

1. Install and start the staged Wren desktop build whose commit is at or after
   the minimum commit in the submitted compatibility artifact.
2. Open the Companion popup, compare its six-digit code with Wren, and approve
   pairing in Wren.
3. Visit a dapp. Wren is announced through EIP-6963, and connection requests
   appear in the desktop wallet.
4. No account or paid service is required; disposable accounts are recommended.

Choose deferred publishing so the approved listing can be checked before it is
public. Chrome allows up to 30 days to publish an approved staged submission;
do not submit until the desktop release and support contact are ready.

## Mozilla Add-ons

In Add-ons Developer Hub, submit a new add-on **On this site** and upload the
Firefox ZIP. The manifest UUID is unique to Wren Companion. Select desktop
Firefox and say that additional free software (Wren desktop) is required.

When asked whether source is required, choose **Yes** and upload the matching
reviewer-source ZIP. Put the reviewer test steps above in Notes for Reviewers,
link to `MOZILLA_REVIEW.md` in the source archive, select GPL-3.0-only, provide
the shared listing copy and privacy policy, and copy the third-party source links
from `MOZILLA_REVIEW.md`. The manifest's required data-transmission categories
are financial and payment information, authentication information, browsing
activity, and website content; all transmission is only to local Wren and is
necessary for the primary function. Then submit for signing and review.

In Notes for Reviewers, explicitly state that 0.1.1 removed the browser name and
runtime extension UUID previously sent by 0.1.0. Do not select
`technicalAndInteraction`: 0.1.2 has no technical/interaction analytics,
telemetry, or feature. Firefox's browser-supplied WebSocket Origin is validated
transiently by Wren and is neither emitted by Companion code nor persisted.

After Mozilla signs the version, install the signed file in regular Firefox and
repeat pairing, connection, account/chain event, reset, and revocation checks
before linking it from the desktop repository.
