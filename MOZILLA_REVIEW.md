# Mozilla Reviewer Build Instructions

Frame Community Companion is a GPL-3.0 community fork of
`frame-labs/frame-extension`. It differs from the upstream store add-on through
authenticated protocol-2 pairing, strict origin/document routing, EIP-6963
discovery, Manifest V3 support, and current browser/dependency maintenance.

The submitted Firefox ZIP is generated with webpack and therefore has matching
reviewer source attached. There is no obfuscation or remote executable code.

## Build Environment

- Ubuntu/Pop!_OS 22.04 x64 was used for the release build.
- Node.js `24.18.1`, pinned in `.nvmrc`.
- npm `11.12.0`, pinned in `package.json`.
- Dependencies are fetched only from the npm registry and locked by
  `package-lock.json`.

The build is architecture-independent and may be run on Mozilla's ARM64 review
environment with the pinned Node and npm versions.

## Reproduce Firefox Output

From the source archive root:

```bash
npm ci
npm run build:firefox
```

The complete Firefox extension is written to `dist-firefox/`. Its inventory and
manifest are validated automatically by `build:firefox`. To compare it with the
submitted ZIP:

```bash
mkdir submitted
unzip frame-companion-0.13.1-firefox.zip -d submitted
diff -qr dist-firefox submitted
```

The release package is produced from the same source with
`npm run package:browsers` and checked by `npm run package:verify`.

## Functional Test

Frame desktop is required and must be running locally. Open the extension,
compare the six-digit pairing code in both interfaces, approve the companion in
Frame, then open a dapp or the repository's local qualification page. No account
or paid service is required. Use only disposable test accounts.
