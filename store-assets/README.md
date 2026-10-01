# Store Assets

The promotional image and 1280×800 screenshots use Wren branding and isolated
captures of the Wren and Companion renderers. Uniswap appears as a public app
example and is not affiliated with Wren.

## Capture sources

The v14 screenshots show pairing, connection, and review views from 0.1.0.
These views still represent the current interface.

- Wren source: `80e99f7e82db25ac4f4a2cb67c008571f8394b32`
- Companion source: `3e3a66bffaa079eb2b50dff14d1523dec3396ccf`

Captures use a disposable profile and synthetic account, network, contract,
and transaction data with no funds or authority. Their pairing code expired
with the mock desktop process. Use these reviewed captures rather than
historical Frame or upstream-listing images.

## Regenerate screenshots

1. Create a private mode-0700 export directory, then capture Companion:

   ```sh
   WREN_COMPANION_QUALIFICATION_EXPORT=<directory> \
     WREN_COMPANION_STORE_DAPP_URL=https://app.uniswap.org/ \
     npm run qualify:browser -- --browser=chrome
   ```

   The optional app URL is limited to this reviewed HTTPS example and is used
   after the normal local checks pass.

2. Read the disposable pairing code from the export. Capture Wren on an
   isolated Xvfb display with `WREN_UI_QUALIFICATION_PAIRING_CODE=<six digits>`
   and scenarios `tray-native-pairing-full-1` and
   `tray-transaction-method-verified-full-1.5`.
3. Refresh `store-assets/source/uniswap-home.png` in a clean disposable browser profile.
4. Review the captures for real credentials, accounts, transactions, device IDs,
   and browser-profile data. Keep only synthetic fixtures.
5. Copy approved captures to `store-assets/source/` and run
   `npm run store:screenshots` and `npm run brand:verify`.

Increment the image filename version when changing a visual to avoid cached
previews. Listing images are not included in the extension ZIP.

## Store icon

Run `npm run store:icon` to generate `src/icons/icon128.png`. It centers Wren's
artwork in Chrome's 96px safe area on a transparent 128px canvas.
This padding applies only to the store icon. The desktop icon stays unchanged.
