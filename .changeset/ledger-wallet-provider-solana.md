---
"@swapkit/wallets": minor
---

Add Solana to the Ledger Wallet connector (`connectLedgerWalletProvider`) and move it to Ledger Wallet Provider v2 (`@ledgerhq/ledger-wallet-provider` 2.0.0 with the `-evm` and `-solana` family packages, both wired into `initializeLedgerProvider`). Ledger exposes Solana as a Wallet Standard wallet that the connector hands to the SwapKit Solana toolbox; EVM and Solana can be connected together or separately. Ledger only registers the Solana wallet when Solana is enabled for the dApp. A transaction the SDK returns without a signature fails with the new `wallet_ledger_wallet_provider_signing_unsupported` error (80204) instead of being broadcast.
