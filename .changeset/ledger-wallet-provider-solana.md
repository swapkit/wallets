---
"@swapkit/wallets": minor
---

Add Solana to the Ledger Wallet connector (`connectLedgerWalletProvider`). Ledger's SDK exposes Solana as a Wallet Standard wallet, which the connector picks up and hands to the SwapKit Solana toolbox; EVM and Solana can be connected together or separately. Ledger only registers the Solana wallet when Solana is enabled for the dApp, and its SDK still returns Solana transactions unsigned, so signing fails with the new `wallet_ledger_wallet_provider_signing_unsupported` error (80204) until Ledger ships it.
