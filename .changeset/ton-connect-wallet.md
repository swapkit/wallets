---
"@swapkit/wallets": minor
---

Add TON Connect as a wallet option (`@swapkit/wallets/tonconnect`).

TON Connect is the standard wallet connection protocol for the TON blockchain and supports only `Chain.Ton`, including its native token and Jettons. The integration wraps `@tonconnect/ui` for the connect modal, universal links, and bridge sessions, and delegates message building, balances, and fee estimation to the signerless `@swapkit/toolboxes/ton` toolbox. Signing and broadcasting are routed through the connected wallet's `sendTransaction`.

Notes:

- Requires a publicly hosted `tonconnect-manifest.json` (`manifestUrl`), or an existing `TonConnectUI` instance can be injected.
- Sweep transfers (`CARRY_ALL_REMAINING_BALANCE`) are rejected: the TON Connect protocol does not carry a send mode, the wallet chooses it.
- Detached signing (`sign`) is not supported by the protocol; use `signAndBroadcastTransaction` / `transfer`.
