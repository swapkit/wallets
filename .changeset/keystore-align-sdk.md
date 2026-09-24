---
"@swapkit/wallets": minor
"@swapkit/sdk": minor
---

**The keystore wallet is aligned with `@swapkit/wallet-keystore@6.0.0`.**

- `connectKeystore`'s derivation map states the script type of every UTXO entry: a UTXO chain takes `{ derivationPath, scriptType }`, other chains keep taking a bare path or `{ derivationPath }`. Without an entry, the default path and the type it implies apply, so default addresses are unchanged.
- A bare UTXO path (`toolbox_utxo_invalid_params`) or a type the chain cannot encode (`toolbox_utxo_unsupported_script_type`) fails the whole connect instead of skipping the chain. Other per-chain failures are still skipped and logged.
- A numeric wallet index goes into the account slot on NEAR, Stellar and Sui (`ACCOUNT_INDEXED_CHAINS`), and into the address index slot everywhere else.
- `generatePhrase` defaults to 24 words, accepts 12, 15, 18, 21 or 24 and throws `wallet_keystore_invalid_word_count` otherwise. `generateKeystore({ password, wordCount })` and `PhraseWordCount` are exported.
- The HD helpers of UTXO wallets take an optional `accountIndex`.

```ts
import { Chain, UTXOScriptType } from "@swapkit/helpers";

await swapKit.connectKeystore([Chain.Bitcoin, Chain.Ethereum], phrase, {
  [Chain.Bitcoin]: { derivationPath: [86, 0, 0, 0, 0], scriptType: UTXOScriptType.P2TR },
  [Chain.Ethereum]: [44, 60, 0, 0, 3],
});
```

**Breaking (types):** the map type is now `KeystoreDerivationPathMap` (exported with `KeystoreDerivationPathMapOrIndex`, `KeystoreChainDerivation` and `KeystoreUTXOChainDerivation`), and `createKeystoreWallet` returns a `Partial` record because skipped chains are missing from it.
