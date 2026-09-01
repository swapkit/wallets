---
"@swapkit/ui": patch
---

Bump @swapkit dependencies to the SDK 5.0.0 release line (core/helpers/plugins/toolboxes/wallet-keystore 5.0.0, wallets 4.11.0), enabling Hypercore and HyperEVM end to end — keystore HYPE/HyperEVM derivation needs helpers 5.0.0. Root override pins @swapkit/cosmos-signer to 0.1.0 while the 0.2.0 that toolboxes 5.0.0 peers on is unpublished (sdk release-run npm E404); drop the override once 0.2.0 lands.
