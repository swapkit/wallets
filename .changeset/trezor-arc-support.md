---
"@swapkit/wallet-hardware": minor
---

Add Arc (`Chain.Arc`, chain id 5042) to the Trezor connector. Trezor ships a signed network definition for chain 5042 (name `Arc`, symbol `USDC`, slip44 60), so the device shows the network and the native gas token correctly without any extra handling.

Fix EIP-1559 detection in the Trezor EVM signer: it treated a zero-wei priority fee as missing fee data and failed the transaction with `wallet_missing_params`. Arc pays a tip of a few wei, and an idle RPC reports zero. The signer now checks whether the fee fields are present instead of whether they are non-zero.
