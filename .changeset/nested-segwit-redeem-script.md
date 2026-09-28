---
"@swapkit/wallet-hardware": patch
---

Sign Bitcoin and Litecoin swaps from a nested segwit (P2SH-P2WPKH) address on Ledger and Trezor. The API omits `redeemScript` on P2SH-wrapped segwit inputs, which the devices tolerate — they sign such an input without it — but client-side finalization does not, so assembly failed with `inputType: sh without redeemScript` after the user had already confirmed on the device. Both PSBT signers now restore the field, and only on inputs whose scriptPubKey provably matches the redeem script derived from the signing pubkey; anything else is left untouched.
