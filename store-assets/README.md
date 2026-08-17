# Store assets

The promotional image and 1280x800 screenshots use Wren-owned product branding.
The screenshots are composed from isolated captures of the actual Wren and
Companion renderers, not from a daily browser profile or wallet. The current
Uniswap page is shown only as a recognizable public dapp example; Wren is not
affiliated with Uniswap.

The current Wren source captures use the 0.1.0 release renderer from desktop
commit `80e99f7e82db25ac4f4a2cb67c008571f8394b32`. The current Companion source
captures use the 0.1.0 release renderer from commit
`3e3a66bffaa079eb2b50dff14d1523dec3396ccf` and a private disposable browser
profile. Their pairing, connection, network, contract, address, and amount data
has no authority or funds; the pairing code expires with the disposable mock
desktop process.

Run `npm run store:screenshots` to compose the reviewed source captures into the
three versioned Chrome Web Store PNGs. `npm run brand:verify` checks their exact
inventory and dimensions. Increment the filename version when changing a visual
so reviewers and local previews cannot reuse a cached image.

The manifest's 128px store icon is generated separately with `npm run
store:icon`. It centers the canonical app artwork in Chrome's 96px square-icon
safe area; this padding is specific to browser-store presentation and does not
change Wren's desktop icon.
