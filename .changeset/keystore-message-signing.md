---
"@swapkit/wallets": minor
---

The keystore wallet now declares the `message` signing capability on Bitcoin, Bitcoin Cash, Dash, Dogecoin, Litecoin, Solana and Tron, wherever the connected wallet can actually sign a message. It replaces `btcMessage`, which the SDK removed, so cancelling a NEAR limit order with the keystore keeps working and now also works on the chains above.
