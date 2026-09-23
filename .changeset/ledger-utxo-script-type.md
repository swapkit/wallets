---
"@swapkit/wallet-hardware": patch
"@swapkit/wallets": patch
"@swapkit/sdk": patch
---

Ledger UTXO wallets build their toolbox with the script type the account path implies (BIP44 legacy, BIP49 nested SegWit, BIP84 native SegWit, BIP86 taproot; a custom purpose falls back to the address form), so `scriptType` and `getAddressFromKeys` report the Ledger account's real type instead of the chain default.

Bitcoin BIP49 and BIP86 accounts also hand the toolbox the account address's public key, derived from the account xpub the signer already caches: `transfer` passes it to `createTransaction` and the toolbox signer exposes it as `publicKey`, so the transaction the toolbox builds carries each nested SegWit input's `redeemScript` and spent output and each taproot input's `tapInternalKey`. The Bitcoin Ledger client gains `getPublicKey()`.
