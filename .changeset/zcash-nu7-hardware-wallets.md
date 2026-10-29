---
"@swapkit/wallet-hardware": patch
"@swapkit/wallet-extensions": patch
"@swapkit/wallet-mobile": patch
"@swapkit/wallets": patch
"@swapkit/sdk": patch
---

Zcash keeps signing on Trezor through the NU7 upgrade (mainnet block 3,543,405). Trezor now signs Zcash transactions with the version, version group, expiry and lock time of the transaction it is given instead of always asking for a version 4 transaction, so the version 5 transactions the toolbox builds from the activation block on are signed as such. Signatures returned by Trezor for a PCZT are read again with `@swapkit/utxo-signer` 3.2.0, which keeps a parsed input's scriptSig apart from its scriptPubKey. All packages move to the SwapKit SDK release that adds version 5 Zcash transactions.
