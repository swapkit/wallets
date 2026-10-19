---
"@swapkit/wallets": patch
"@swapkit/wallet-extensions": patch
"@swapkit/wallet-hardware": patch
---

Pin ethers to the same version `@swapkit/toolboxes` requires, so applications that install both no longer end up with two copies of ethers. Two copies made the SDK treat browser and hardware wallets as plain RPC providers and fail with a gas estimation error when the wallet was on a different network than the swap.
