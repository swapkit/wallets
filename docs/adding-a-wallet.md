# Adding a wallet connector

How to add a new wallet to this repo, including registering its `WalletOption`
and error codes through the extensible registries that shipped with
`@swapkit/helpers` 5.1.0 ([swapkit/sdk#346]). No `@swapkit/helpers` release is
needed to add a wallet.

Worked examples in this repo:

- `packages/wallet-extensions/src/noir-wallet/` — injected browser-extension
  wallet with custom error codes (added via fork PR #111 + #144)
- `packages/wallets/src/tonconnect/` — connector living directly in
  `@swapkit/wallets`, registry registration only
- `packages/wallets/src/ledger-wallet-provider/` — connector wrapping a
  third-party EIP-1193 SDK: it initializes the vendor SDK lazily, picks the
  provider up over EIP-6963, and fans EIP-1193 requests out between the wallet
  and the chain's SwapKit RPC

## Where things live

| Package | Contents |
| --- | --- |
| `@swapkit/wallet-extensions` | injected browser-extension providers (`window.*`) |
| `@swapkit/wallet-hardware` | Ledger, Trezor, KeepKey |
| `@swapkit/wallets` | aggregator: `loadWallet`, `SKWallets` types, plus a few connectors that need no separate package (tonconnect, xaman, radix, …) |

The `WalletOption` union, `SwapKitError` keys, and the registries themselves
are defined upstream in `@swapkit/helpers` (SDK monorepo).

## 1. The connector module

Create `packages/wallet-extensions/src/<wallet>/index.ts` built around
`createWallet` from `@swapkit/wallet-core`:

- `connect` receives `{ addChain, walletType }` and returns the
  `connect<Name>` function. For each supported chain, spread the chain's
  toolbox into `addChain({ ...toolbox, address, chain, walletType, ... })` and
  override what the wallet handles itself (`transfer`, `getBalance`,
  `signMessage`, `signAndBroadcastTransaction`, …).
- `directSigningSupport` maps chains where the wallet can sign an
  API-prebuilt transaction (`route.tx`). With `{ [chain]: true }`, core routes
  swaps to the generic SwapKit plugin, which decodes `route.tx` and calls your
  `signAndBroadcastTransaction` override. With `{}`, swaps go through the
  provider plugin, which calls high-level methods like `transfer`. Wallets
  that only expose a "send" RPC can still support direct signing by
  translating the decoded transaction back into a send — see
  `extractUtxoTransferIntent` in
  `packages/wallet-extensions/src/helpers/utxoTransferIntent.ts` (Vultisig,
  Ctrl, KeepKey BEX).
- If the wallet cannot serve a method the toolbox spread exposes, override it
  with a clear `SwapKitError` throw instead of letting the toolbox default
  fail deep inside signing (see `unsupportedUtxoSignTransaction`).

## 2. The register module

Create `packages/wallet-extensions/src/<wallet>/register.ts`. The type-level
declaration and the runtime registration must sit side by side — one without
the other compiles to a trap (see [Gotchas](#gotchas)):

```ts
import { registerErrorCodes, registerWalletOption } from "@swapkit/helpers";

declare module "@swapkit/helpers" {
  interface WalletOptionRegistry {
    MY_WALLET: "MY_WALLET";
  }
  interface SwapKitErrorRegistry {
    wallet_my_wallet_not_found: 80301;
  }
}

registerWalletOption("MY_WALLET", "MY_WALLET");
registerErrorCodes({
  wallet_my_wallet_not_found: 80301,
});
```

Rules:

- The `declare module` must target `"@swapkit/helpers"` — that package
  declares the registries — even when consumers import `WalletOption` from
  `@swapkit/core`.
- Error codes must use the **80000–89999 extension range**. It is reserved by
  convention, not enforced at runtime; first-party codes live outside it and
  collisions throw only when two keys claim the same number. Grep this repo's
  registers for the next free block (noir-wallet holds 80101–80103,
  ledger-wallet-provider 80201–80203).
- Registration is idempotent for identical values and throws
  `helpers_invalid_params` on conflicting re-registration, so the module may
  safely load through multiple import paths.
- Registered options are appended to `SKConfig`'s default wallet list
  automatically (and survive `SKConfig.reinitialize()`).

Make the connector's `index.ts` import it first:

```ts
// Registers WalletOption.MY_WALLET and the wallet_my_wallet_* error codes
// before anything below reads them.
import "./register";
```

## 3. Package exports

Add **two** subpath exports to `packages/wallet-extensions/package.json`,
mirroring the neighbors' shape:

```jsonc
"./my-wallet":          { "bun": "./src/my-wallet/index.ts", ... },
"./my-wallet/register": { "bun": "./src/my-wallet/register.ts", ... },
```

The separate `register` subpath exists so `loadWallet` (and any app that only
references `WalletOption.MY_WALLET` — wallet pickers, `walletType`
comparisons) can import a ~20-line side-effect module instead of statically
pulling the whole connector, which would defeat the lazy loading in the match
arms. Apps that import the connector subpath directly need nothing extra —
`index.ts` imports `./register` itself.

Also add the new register module to `packages/wallets/src/register.ts` — the
roll-up that `@swapkit/wallets/register` exposes to apps. An app that puts a
registered option in a module-scope wallet list (as the SwapKit UI does in its
wallet dialog) evaluates `WalletOption.MY_WALLET` before any connector loads;
its entry module must `import "@swapkit/wallets/register"` first or the list
silently contains `undefined`.

## 4. Wiring `@swapkit/wallets`

Three touch points:

- **`src/utils.ts`** — side-effect import at the top (ordering matters: the
  match reads `WalletOption.MY_WALLET` at call time, before any connector has
  loaded), plus a lazy match arm:

  ```ts
  import "@swapkit/wallet-extensions/my-wallet/register";
  // ...
  .with(WalletOption.MY_WALLET, async () => (await import("@swapkit/wallet-extensions/my-wallet")).myWallet)
  ```

- **`src/types.ts`** — `SKWallets` and `SKWalletsSupportedChains` entries,
  keyed `[WalletOption.MY_WALLET]:` (computed keys in type position work
  because the const's properties are distinct string literals).

## 5. Tests

Alongside the usual connector tests, always assert the registered value:

```ts
test("registers MY_WALLET in the extensible WalletOption registry", () => {
  expect(WalletOption.MY_WALLET).toBe("MY_WALLET");
});
```

Without this, a missing registration makes `walletType` assertions pass
vacuously: `expect(wallet.walletType).toBe(WalletOption.MY_WALLET)` is
`undefined === undefined`. This exact false-green happened in the original
Noir Wallet PR.

## 6. Changeset

Add a `.changeset/*.md` entry (`minor` for a new connector). If the change
also bumps `@swapkit/*` dependency versions, run `bun generate:dep-changeset`
and commit the generated file — CI's `check` workflow fails without it.

## Gotchas

- **Type/runtime skew.** The module augmentation is visible program-wide the
  moment the `.d.ts` is in the compilation; the runtime key exists only after
  `register.ts` executes. Code that reads `WalletOption.MY_WALLET` before
  registration gets `undefined` — and a ts-pattern `.with(undefined, …)` arm
  then matches *any* unregistered option. Keep the side-effect import above
  the code that reads the key.
- **Tree-shaking.** Neither package sets `"sideEffects"` in package.json, so
  bundlers keep the register imports. If `"sideEffects": false` is ever
  added, the `register.ts` files must be listed as exceptions or registration
  silently disappears from production bundles.
- **One `@swapkit/helpers` copy, exactly.** Published SDK packages pin exact
  helpers versions. Bumping helpers alone forks the lockfile into nested
  copies — two helpers instances at runtime means registrations land in one
  copy while `@swapkit/core` reads the other, with no error. Bump the whole
  `@swapkit` release train together, reinstall clean with the CI-pinned bun
  (see `.github/workflows/ci.yml`), and verify:

  ```bash
  grep -o '@swapkit/helpers@[0-9][^"]*' bun.lock | sort | uniq -c
  ```

  One `5.x` entry is correct. (A legacy `4.x` copy nested under the old
  `@swapkit/ui` devDep is expected and inert.)

[swapkit/sdk#346]: https://github.com/swapkit/sdk/pull/346
