---
"@swapkit/wallet-hardware": patch
---

KeepKey Cosmos (ATOM) transfers now pay the toolbox fee for the chosen fee option (Fast when none is given), or the given `feeRate`, instead of a fixed 500 uatom that the Cosmos Hub rejects as below its minimum gas price of 0.005 uatom. Connecting a KeepKey also no longer writes into the SDK's shared default Cosmos fee, which lowered the fee of every other Cosmos wallet in the app on SDK releases with a higher default.
