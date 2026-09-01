---
"@swapkit/ui": patch
---

Bump @swapkit dependencies to the latest releases: wallets 4.12.0 (Noir Wallet
connector for Zcash, TON_CONNECT via the extensible WalletOption registry),
sdk family 5.0.4 / helpers 5.2.0 / toolboxes 5.2.0 / wallet-keystore 5.1.0
(derivation paths now honour non-zero index and explicit path — index 0 without
a path is unchanged; refreshed token lists). Adapt to the literal-typed
WalletOption registry (explicit WalletOption annotations on wallet collections)
and cast around the stale mutable-tuple derivation-path params still baked into
the published wallet-hardware 4.9.33 typings.
