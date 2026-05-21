---
"@swapkit/wallet-extensions": patch
"@swapkit/wallet-hardware": patch
"@swapkit/wallets": patch
"@swapkit/sdk": patch
---

Enable KeepKey BEX and Vultisig THORChain/Maya direct swap submission by translating provided toolbox transactions into provider sign-and-broadcast requests. Enable Vultisig BTC, Cosmos, Kujira, and Ripple direct swap submission through intent extraction and mark Solana direct signing support. Stop advertising unsupported KeepKey BEX XRP/Solana and Vultisig Polkadot combinations. Add KeepKey SDK UTXO direct swap submission by signing the provided PSBT transaction and broadcasting the serialized transaction returned by KeepKey.
