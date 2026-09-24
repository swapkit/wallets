---
"@swapkit/wallet-hardware": patch
"@swapkit/wallets": patch
"@swapkit/sdk": patch
---

Ledger UTXO wallets build their toolbox with the script type of the address the device returns, so `scriptType` and `getAddressFromKeys` report the Ledger account's real type (BIP44 legacy, BIP49 nested SegWit or BIP84 native SegWit) instead of the chain default. Ledger signs by the path's wallet format, so a BIP86 path keeps its native SegWit address and is reported as such. An address the SDK cannot spend from now fails the connect with `toolbox_utxo_invalid_address` or `toolbox_utxo_unsupported_script_type`.

Bitcoin BIP49 accounts also hand the toolbox the address's public key, derived from the account xpub the PSBT signer already caches: `transfer` passes it to `createTransaction` and the toolbox signer exposes it as `publicKey`, so the transaction the toolbox builds carries each nested SegWit input's `redeemScript`. The Bitcoin PSBT Ledger client gains `getPublicKey()`.
