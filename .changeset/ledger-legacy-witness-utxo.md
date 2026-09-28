---
"@swapkit/wallet-hardware": patch
---

Sign Bitcoin swaps from a legacy address on Ledger. The API attaches both `witnessUtxo` and `nonWitnessUtxo` to every input, and the device reads `witnessUtxo` as a claim that the input is segwit, so a P2PKH input under a `pkh(@0/**)` policy contradicted itself and signing failed with `0x6a80`. The field is now dropped for legacy accounts only; nested segwit still gets both.
