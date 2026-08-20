---
"@swapkit/wallet-hardware": major
---

Migrate Ledger connections to the Device Management Kit by default.

Browser connections now discover and reuse one WebHID DMK session. Consumers that manage the device lifecycle can pass a caller-owned `dmkSession`; `originToken` enables EVM Transaction Checks, and `onDeviceActionState` exposes device prompts to the UI.

EVM, Bitcoin, Cosmos, and transparent Zcash signing use stable Device Signer Kits. THORChain uses its app-v2 protocol in one atomic DMK action, while chains without a stable signer kit run their existing Ledger app client through an operation-scoped DMK bridge. An explicitly injected LedgerJS `transport` remains available as a temporary non-EVM compatibility path, but cannot be combined with `dmkSession`.

EVM message, transaction, and full EIP-712 signing now use the current signer APIs. Bitcoin signs PSBTs with the Bitcoin signer kit, and Zcash transfer signing produces the transparent v5 transaction required by the current Zcash app. Legacy Zcash PCZT v4 signing is no longer exposed as a supported Ledger path.

THORChain Amino signing keeps a compatibility normalizer for object-shaped deposit assets emitted by toolboxes 4.x while signing the canonical string form expected on-chain.
