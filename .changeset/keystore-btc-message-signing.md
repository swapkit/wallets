---
"@swapkit/wallets": minor
---

The keystore wallet now declares that it can sign Bitcoin messages (`signingSupport[Chain.Bitcoin].btcMessage`, carried on the connected Bitcoin wallet as `signing.btcMessage`), so flows that need one, like cancelling a Harbor Bitcoin limit order, can use it. A keystore using a Bitcoin address type that Bitcoin message signatures cannot express, such as Taproot, does not declare it.
