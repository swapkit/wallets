---
"@swapkit/wallets": minor
---

Enable Aleo for keystore wallets: `Chain.Aleo` joins `supportedChains` and `directSigningSupport` (derivation was already available in `@swapkit/wallet-keystore`; Aleo uses a 4-element hardened path like Solana). Also hardens `connectKeystore`: chain derivations now run with `Promise.allSettled`, so one failing chain no longer aborts the whole connect — failed chains are skipped with a logged error, and the connect only rejects when every requested chain fails.
