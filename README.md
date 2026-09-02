# SwapKit Wallets

Wallet connectors for the [SwapKit SDK](https://github.com/swapkit/sdk):
browser extensions, hardware devices, and mobile/protocol wallets, exposed
through a single `loadWallet` entry point and typed `SKWallets` registry.

## Packages

| Package | Contents |
| --- | --- |
| [`@swapkit/wallets`](packages/wallets) | aggregator: `loadWallet`, `SKWallets`/`SKWalletsSupportedChains` types, and connectors without their own package (keystore, tonconnect, xaman, radix, passkeys, ledger-wallet-provider, …) |
| [`@swapkit/wallet-extensions`](packages/wallet-extensions) | injected browser-extension providers (MetaMask/EVM, Keplr, Vultisig, Ctrl, Phantom, Petra, Noir Wallet, …) |
| [`@swapkit/wallet-hardware`](packages/wallet-hardware) | Ledger, Trezor, KeepKey — direct WebHID/WebUSB transports |
| [`@swapkit/wallet-mobile`](packages/wallet-mobile) | mobile wallet support |
| [`@swapkit/sdk`](packages/sdk) | batteries-included bundle re-exporting core, plugins, toolboxes, and wallets |

Each connector is a lazy-loaded subpath export — apps pull only the wallets
they use.

## Development

Requires [bun](https://bun.sh) — use the version pinned in
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) to keep `bun.lock`
reproducible.

```bash
bun install
bun run build:ci     # build all packages + .d.ts generation
bun run type-check   # tsc across packages
bun test             # bun test across packages
bun run lint         # biome check --fix
bun run playground:vite-lite:start   # browser playground
```

## Adding a wallet

See [docs/adding-a-wallet.md](docs/adding-a-wallet.md) — covers the connector
module, registering the `WalletOption` and error codes through the
`@swapkit/helpers` extensible registries (no helpers release required), the
`loadWallet`/`SKWallets` wiring, and the gotchas.

## Releases

Versioning goes through [changesets](https://github.com/changesets/changesets):
every user-facing change ships a `.changeset/*.md` entry, and `@swapkit/*`
dependency bumps additionally need the generated changeset from
`bun generate:dep-changeset` (CI enforces it). Merges to `develop` roll up
into a "Version Packages" PR; merging that publishes to npm.
