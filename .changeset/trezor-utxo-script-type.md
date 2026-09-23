---
"@swapkit/wallet-hardware": patch
"@swapkit/wallets": patch
"@swapkit/sdk": patch
---

Trezor UTXO wallets build their toolboxes with the script type the account path states (BIP44 legacy, BIP49 nested SegWit, BIP84 native SegWit), so `scriptType` and `getAddressFromKeys` report the Trezor account's real type instead of the chain default. Paths, addresses and device signing are unchanged.
