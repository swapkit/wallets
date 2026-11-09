---
"@swapkit/wallets": patch
---

The keystore wallet now cleans up a seed phrase before deriving any key, using `canonicalizeMnemonic` from `@swapkit/helpers`. A phrase pasted with tabs, repeated spaces, non-breaking spaces or a trailing newline connects to the same addresses as the clean phrase, a phrase with a bad checksum is rejected with `wallet_keystore_invalid_phrase`, and `validatePhrase` follows the same rules. Clean phrases are unaffected.
