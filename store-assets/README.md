# Store assets

The promotional image and 1280x800 screenshots use only Wren-owned branding.
The screenshots are composed from isolated qualification captures of the actual
Wren and Companion renderers, not from a daily browser profile or wallet.

The current Wren source captures came from desktop commit
`a65d5e0ac4ee6360de3b1d450bc37c7a33b4aa65`. Their account, connection,
origin, network, contract, address, and amount values are deterministic workshop
fixtures with no authority or funds. The Companion capture came from commit
`e4b724f` and a private disposable browser profile.

Run `npm run store:screenshots` to compose the reviewed source captures into the
two versioned Chrome Web Store PNGs. `npm run brand:verify` checks their exact
inventory and dimensions. Increment the filename version when changing a visual
so reviewers and local previews cannot reuse a cached image.
