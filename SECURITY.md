# Security Policy

Security fixes target the latest published
[Wren Companion release](https://github.com/jorphex/wren-companion/releases).
Local builds and development branches are test versions. See [Privacy](PRIVACY.md)
for data handling and retention.

## Using Companion

Companion routes browser requests to Wren. Account access, approvals, signing,
and sending happen in the desktop wallet. Compare the six-digit codes when
pairing and review requests in Wren and, when available, on your hardware device.

Keep recovery phrases, wallet private keys, and hardware PINs out of the
extension and websites.

## Connection boundary

Browser APIs identify the requesting origin, tab, frame, and document. Page
messages cannot set this authority. Each document has a separate connection
with bounded queues and receives only its own replies, events, and subscriptions.

After code approval, protocol 3 authenticates both Wren and Companion.
Companion holds nonextractable P-256 pairing keys. Signed messages bind each
key and session to its role and channel. These keys do not hold wallet
signing authority.

Known identities reconnect without another prompt. Identity changes require
recovery. During key rotation, Companion keeps the old keys until Wren's
signed acknowledgement and a successful reconnect confirm the new keys.

Website code can wrap or replace the page provider. The bridge therefore holds
no wallet authority. Pairing protects local connection identity; it cannot
protect a compromised computer, browser profile, privileged extension,
dependency, or unreviewed binary.

## Report a vulnerability

Use this repository's private GitHub vulnerability reporting when available.
Otherwise contact the maintainer through the repository owner's GitHub profile
before opening a public issue.

Include the release or commit, browser version, Wren build, impact, and steps
to reproduce with test accounts. Leave out secrets, real pairing credentials,
and valuable account data. Test only profiles, wallets, devices, and sites you
have permission to use.
