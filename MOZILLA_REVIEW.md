# Mozilla Reviewer Build Instructions

Wren Companion is derived from the GPL-3.0 `frame-labs/frame-extension` project.
It adds mutually authenticated protocol-3 pairing, strict origin and document routing,
EIP-6963 discovery, Manifest V3 support, and current browser and dependency
maintenance.

The submitted Firefox ZIP is generated with webpack and has matching reviewer
source attached. It contains no obfuscation or remote executable code.

## Build environment

- Release build: Ubuntu/Pop!_OS 22.04 x64
- Node.js: 24.18.1, pinned in `.nvmrc`
- npm: 11.12.0, pinned in `package.json`
- Dependencies: npm registry only, locked by `package-lock.json`

The build is architecture-independent and can run in Mozilla's ARM64 review
environment with the pinned Node and npm versions.

## Reproduce the Firefox output

From the source archive root:

```bash
npm ci
npm run build:firefox
```

The complete extension is written to `dist-firefox/`, and `build:firefox`
validates its inventory and manifest. With the submitted ZIP available beside
the source archive:

```bash
mkdir submitted
unzip wren-companion-0.1.0-firefox.zip -d submitted
diff -qr dist-firefox submitted
```

Create the release package with `npm run package:browsers` and verify it with
`npm run package:verify`.

## Functional test

Wren desktop must be running locally. Open the extension, compare the six-digit
pairing code in both interfaces, and approve the companion in Wren. Then open a
dapp or this repository's local qualification page. No account or paid service
is required; use disposable test accounts only.
