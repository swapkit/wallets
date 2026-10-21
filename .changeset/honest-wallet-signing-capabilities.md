---
"@swapkit/wallets": patch
"@swapkit/wallet-extensions": patch
"@swapkit/wallet-hardware": patch
---

Wallet signing methods that could never succeed are no longer exposed, so checking whether a method exists is a reliable capability check. No new signing support is added.

- WalletConnect (EVM): `signTypedData` is now `undefined` instead of a method that always threw. EIP-712 signing is still not supported.
- WalletConnect (NEAR): `signTransaction` is now `undefined`; use `signAndBroadcastTransaction`.
- KeepKey extension and Vultisig (UTXO chains), Noir Wallet (Zcash) and Ledger (Zcash): `signTransaction` is now `undefined` instead of a method that always threw. Transfers and `signAndBroadcastTransaction` are unchanged.
