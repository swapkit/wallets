---
"@swapkit/wallet-extensions": patch
---

Deprecate connecting MetaMask through `connectEVMWallet` (`WalletOption.METAMASK`, also its default `walletType`). It keeps working for now and will be removed in the next major; use `connectMetamask` from `@swapkit/wallets/metamask`, which supports EVM and Solana in one session.
