---
"@swapkit/wallet-hardware": patch
"@swapkit/wallets": patch
"@swapkit/sdk": patch
---

Trezor Bitcoin wallets connect on a BIP86 path as taproot accounts: the toolbox gets the `P2TR` script type, the device signs with `SPENDTAPROOT` and the returned PSBT carries each input's `tapKeySig`, so it finalizes. Other Trezor UTXO chains still reject an `86'` path.
