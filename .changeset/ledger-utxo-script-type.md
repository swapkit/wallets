---
"@swapkit/wallet-hardware": patch
"@swapkit/wallets": patch
"@swapkit/sdk": patch
---

Ledger Bitcoin wallets take their script type from the account path (BIP44 legacy, BIP49 nested SegWit, BIP84 native SegWit, BIP86 taproot) and fall back to the address form only for a custom purpose, so `scriptType` and `getAddressFromKeys` report the account's real type. The other Ledger UTXO chains keep taking it from the address the device returns, which is the form their app signs for.

A Bitcoin BIP86 path now connects as a taproot account: the wallet reads, reports and signs for the account's `bc1p` address. This replaces the 5.0.0 note that a BIP86 path kept its native SegWit address. The Bitcoin app (2.1.0 and later) refuses a native SegWit policy on an `86'` path, so on 5.0.x such a connection failed with `0x6a80` instead of returning a `bc1q` address.

Bitcoin BIP49 and BIP86 accounts hand the toolbox the account address's public key, derived from the account xpub the signer already caches: `transfer` passes it to `createTransaction` and the toolbox signer exposes it as `publicKey`, so the transaction the toolbox builds carries each nested SegWit input's `redeemScript` and each taproot input's `tapInternalKey`. The Bitcoin Ledger client gains `getPublicKey()`.
