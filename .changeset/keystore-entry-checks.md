---
"@swapkit/wallets": patch
---

The keystore wallet now rejects a missing or blank phrase with `wallet_missing_params` before connecting any chain, instead of failing on one chain or connecting others with an empty address. It also reads every derivation entry, in chain order, before any chain connects: an entry that is not a path array or `{ derivationPath: number[] }`, such as a string, a number or `{ scriptType }` alone, now fails the whole connect and names its chain (`toolbox_utxo_invalid_params` for UTXO chains, `wallet_missing_params` for the others), instead of throwing an unnamed `TypeError` or silently leaving the chain out. A script type the chain cannot encode still fails the whole connect; any other error while a chain connects leaves that chain out.
