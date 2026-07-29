---
"@swapkit/wallets": patch
---

Fix WalletConnect EVM swaps always failing with "no transaction hash": eth_sendTransaction over WalletConnect resolves with the raw tx hash string, but the signer returned it cast as an ethers TransactionResponse, so callers reading `.hash` got `undefined` even though the wallet had already broadcast the transaction. The signer now wraps the hash (normalizing a missing 0x prefix) in a TransactionResponse-shaped object. Also corrects the `signTypedData` unsupported-method error to report `signTypedData` instead of `signTransaction`.
