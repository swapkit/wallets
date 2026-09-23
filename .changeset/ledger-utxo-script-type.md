---
"@swapkit/wallet-hardware": patch
"@swapkit/wallets": patch
"@swapkit/sdk": patch
---

Ledger UTXO wallets take their script type from the account path (BIP44 legacy, BIP49 nested SegWit, BIP84 native SegWit, BIP86 taproot) and fall back to the address form only for a custom purpose, so `scriptType` and `getAddressFromKeys` report the account's real type.

Bitcoin BIP49 and BIP86 accounts hand the toolbox the account address's public key, derived from the account xpub the signer already caches: `transfer` passes it to `createTransaction` and the toolbox signer exposes it as `publicKey`, so the transaction the toolbox builds carries each nested SegWit input's `redeemScript` and each taproot input's `tapInternalKey`. The Bitcoin Ledger client gains `getPublicKey()`.
