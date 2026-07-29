---
"@swapkit/wallets": minor
---

Enable Hypercore (HYPE) on the keystore wallet. HyperEVM was already covered via `EVMChains`; `Chain.Hype` is now listed in `supportedChains` and `directSigningSupport`, so `connectKeystore` no longer filters it out.
