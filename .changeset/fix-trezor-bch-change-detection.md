---
"@swapkit/wallet-hardware": patch
---

Fix Trezor BCH transaction signing: send the prefixed CashAddr to Trezor as the output address while comparing prefix-stripped values for change-output detection. Also enrich the `wallet_trezor_failed_to_sign_transaction` error with `code` and the raw `payload` so failures can be diagnosed.
