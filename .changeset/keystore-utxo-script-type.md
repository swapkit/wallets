---
"@swapkit/wallets": minor
"@swapkit/sdk": minor
---

**`connectKeystore`'s derivation map states the script type of every UTXO entry**, matching the SDK's UTXO script-type contract. A UTXO chain takes `{ derivationPath, scriptType }`; other chains keep taking a bare path or `{ derivationPath }`. Without an entry, the wallet default path (with the optional wallet index) and the type it implies apply, so default addresses are unchanged. `@swapkit/sdk` re-exports the keystore wallet, so it carries this change too.

```ts
import { Chain, UTXOScriptType } from "@swapkit/helpers";

await swapKit.connectKeystore([Chain.Bitcoin, Chain.Ethereum], phrase, {
  [Chain.Bitcoin]: { derivationPath: [86, 0, 0, 0, 0], scriptType: UTXOScriptType.P2TR },
  [Chain.Ethereum]: [44, 60, 0, 0, 3],
});
```

`getUTXOScriptTypeForPath(derivationPath)` reads the type a standard path implies; it returns `UTXOScriptType | undefined`, so narrow it before using it as `scriptType`.

**Breaking (public API):** the map type is now `KeystoreDerivationPathMap` (exported with `KeystoreDerivationPathMapOrIndex`, `KeystoreChainDerivation` and `KeystoreUTXOChainDerivation`). A bare path on a UTXO chain is refused with `toolbox_utxo_invalid_params`, and a type the chain cannot encode with `toolbox_utxo_unsupported_script_type`. Both are configuration errors that recur on every connect, so they fail the whole connect instead of skipping the chain; other per-chain failures are still skipped and logged.
