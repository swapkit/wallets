---
"@swapkit/wallets": patch
"@swapkit/wallet-extensions": patch
"@swapkit/wallet-hardware": patch
---

Wallet signing methods are now present only when the wallet can actually sign on that chain, so checking whether a method exists is a reliable capability check.

- WalletConnect (EVM): `signTypedData` now works (EIP-712 via `eth_signTypedData_v4`) and `signMessage` now uses `personal_sign`. Each is exposed only on chains where the wallet granted that method in the session; on other chains it is `undefined` instead of throwing.
- WalletConnect (NEAR): `signTransaction` is now `undefined`; use `signAndBroadcastTransaction`.
- KeepKey extension and Vultisig (UTXO chains), Noir Wallet (Zcash) and Ledger (Zcash): `signTransaction` is now `undefined` instead of a method that always threw. Transfers and `signAndBroadcastTransaction` are unchanged.
