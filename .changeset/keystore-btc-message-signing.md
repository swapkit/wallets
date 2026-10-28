---
"@swapkit/wallets": minor
---

The keystore wallet now declares that it can sign Bitcoin messages (`signingSupport[Chain.Bitcoin].btcMessage`, carried on the connected Bitcoin wallet as `signing.btcMessage`), so flows that need one, like cancelling a Harbor Bitcoin limit order, can use it. Signing itself requires the `@swapkit/toolboxes` release that adds Bitcoin message signing. A keystore using a Taproot Bitcoin address does not declare Bitcoin message signing.
