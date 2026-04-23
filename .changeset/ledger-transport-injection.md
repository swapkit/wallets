---
"@swapkit/wallet-hardware": minor
---

Add an optional `transport` option to `connectLedger`, allowing Node and other non-browser consumers to pass their own `@ledgerhq/hw-transport` instance:

```ts
import { ledgerWallet } from "@swapkit/wallet-hardware/ledger";
import TransportNodeHidSingleton from "@ledgerhq/hw-transport-node-hid-singleton";

const transport = await TransportNodeHidSingleton.default.open(null);

await ledgerWallet.connectLedger.connectWallet({ addChain })(chains, derivationPath, { transport });
```

When `transport` is omitted, the existing WebHID / WebUSB flow is used exactly as before, so web consumers need no changes. `node-hid` is not added as a runtime dependency; consumers bring their own transport.
