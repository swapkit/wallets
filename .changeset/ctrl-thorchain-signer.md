---
"@swapkit/wallet-extensions": patch
"@swapkit/wallet-hardware": patch
"@swapkit/wallets": patch
"@swapkit/sdk": patch
---

Add CTRL THORChain and Maya sign-and-broadcast transaction support, resolve CTRL providers through both `window.ctrl` and documented `window.xfi` injections, send CTRL Bitcoin PSBT requests with the callback-compatible params shape, broadcast CTRL Bitcoin PSBTs through the extension without local finalization, and wire Ledger THORChain through the toolbox signer path.
