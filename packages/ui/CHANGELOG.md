# @swapkit/ui

## 0.30.0

### Minor Changes

- [#225](https://github.com/swapkit/wallets/pull/225) [`0a68bb8`](https://github.com/swapkit/wallets/commit/0a68bb8a45cc51bcb26ee69e27f962cd2a816830) Thanks [@robottheory](https://github.com/robottheory)! - Import SwapKit UI 0.29.0 and its studio into the wallets workspace.
- [#225](https://github.com/swapkit/wallets/pull/225) [`0a68bb8`](https://github.com/swapkit/wallets/commit/0a68bb8a45cc51bcb26ee69e27f962cd2a816830) Thanks [@robottheory](https://github.com/robottheory)! - Update SwapKit SDK dependencies:
- [#226](https://github.com/swapkit/wallets/pull/226) [`9fcbd70`](https://github.com/swapkit/wallets/commit/9fcbd70282d11f94dc33967e98711450134fe383) Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Bitget Wallet now connects Sui, TON and XRP, and every EVM chain it lists. Chains are connected one at a time, so a chain missing in the wallet is skipped instead of failing the whole connection. Cosmos is no longer offered with Bitget for now: the wallet refuses the Cosmos Hub connection request. Solana, Tron and XRP transactions are checked against what was requested before they are sent, so a transaction the wallet altered is rejected. (via @swapkit/wallets@6.3.0)
- [#224](https://github.com/swapkit/wallets/pull/224) [`43b5a90`](https://github.com/swapkit/wallets/commit/43b5a90c0b56e62c0575a941f8dc04ba21e705ba) Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Cardano browser wallets that follow CIP-30 (Lace, Eternl, Vespr, Yoroi, Typhon and others) can now connect, send and swap. `getCardanoWallets()` lists the wallets injected in the page and `connectCardano(chains, walletKey)` connects the chosen one under the new `WalletOption.CIP30`. Mainnet only; message signing is not available yet. (via @swapkit/wallets@6.3.0)
- [#190](https://github.com/swapkit/wallets/pull/190) [`a74f087`](https://github.com/swapkit/wallets/commit/a74f08759992982d590ae7bf53b2c42993df1571) Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - OKX Wallet now connects Sui. OKX does not inject a Sui provider on `window`, so it is found through the Wallet Standard as "OKX Wallet". (via @swapkit/wallets@6.3.0)
- [#217](https://github.com/swapkit/wallets/pull/217) [`ae15331`](https://github.com/swapkit/wallets/commit/ae153315ab521da10aa33478d91f0fba5b4fbb43) Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - OneKey now connects Sui on mainnet. A Sui signature from OneKey is rejected if it covers a different transaction than the one requested. (via @swapkit/wallets@6.3.0)

## 0.29.0

### Minor Changes

- #384 `457e6bf` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Add a Max button next to the swap amount that fills in the full balance, sweeping native coins on chains that support it so the network fee is covered.

### Patch Changes

- #380 `4da98f1` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Bring back the "Done" action that closes the slippage tolerance settings.

- #386 `8c3d13f` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Make the loading spinners in the approval and unshield dialogs and the quote refresh button visible against the widget background.

- #382 `8e3fd2b` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Sui balances load again in the widget. The widget shipped an older version of the Sui library than the SDK expects, so loading a Sui wallet's balances always failed.

## 0.28.1

### Patch Changes

- #374 `1e03ead` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Swap quotes load faster: opening the swap screen requests a quote once instead of twice, going back to a recent amount or pair shows its quote right away while it refreshes, and outdated quotes no longer show warnings after the user has moved on.

- #377 `0483468` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Long token names in the wallet balances list are now shortened instead of pushing the balance out of the card.

- #378 `bada8de` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - The widget studio now enables a wallet as soon as its required setting (such as the TON Connect manifest URL or the WalletConnect project ID) is filled in, without reloading the page.

- #374 `1e03ead` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Update SwapKit SDK and wallet packages:

  - Zcash keeps working through the NU7 network upgrade (around 5 November 2026) with the keystore, Ledger and Trezor, and Ledger and Trezor can send ZEC again.
  - Swaps to THORChain and Maya ZEC vaults that use `tex1…` addresses now go through.
  - OneKey connects Stellar, TON, TRON and NEAR, and Bitcoin and Solana connections work again.
  - Trezor supports HyperCore (Hyperliquid) USDC transfers and swaps, and selling from HyperCore also works through NEAR Intents.
  - Fixes for Solana Token-2022 transfers (such as PYUSD), THORChain and Maya tokens like staked RUJI, and TON jetton sales on the public endpoint.

- #379 `263fab4` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Fix the toast description text being almost unreadable on dark themes.

## 0.28.0

### Minor Changes

- #349 `fbfdf25` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Integrators can show their own logo in the widget header or hide it, while a small "Powered by SwapKit" mark always stays below the widget.

- #332 `49ab6ac` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - The widget now keeps its data cache to itself and never touches a query cache your app already has. Exported hooks and components that load data, including `useSwapKit`, must be rendered inside `<SwapKitWidget>`. The widget no longer clears its API key or widget credentials from the shared config when it unmounts; passing no auth props clears them instead.

### Patch Changes

- #340 `42d22a3` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Ask for all token prices in one request when a wallet connects or balances refresh, instead of one request per chain.

- #337 `aeaf141` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Reword the keystore connect flow to say "unlock" instead of "upload", making it clear the keystore file never leaves the user's device.

- #325 `bdc3b0e` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Add warning, error and info theme colours and use them, together with the existing success colour, for every status message, badge and validation hint. Light themes no longer get unreadable yellow, red or green text that was only tuned for the dark background. The four status colours are now theme tokens (`success`, `warning`, `error`, `info` on the `theme` prop, `color-success` and friends on the web component), so integrators can match them to their brand.

- #321 `4a072da` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Fix widget toasts always rendering dark: they now follow the widget theme, so the "Swap submitted" notice is readable on light themes.

## 0.27.0

### Minor Changes

- #313 `a203206` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Add a `show-experimental-wallets` option (`showExperimentalWallets` in React) that lists the wallets still in testing without turning on dev mode or the dev API.

  `useWalletsConfig()` now exposes `showExperimental` instead of `isDev`. Read `SKConfig.envs.isDev` if you need the dev mode flag itself.

- #284 `16faf33` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Add TON Connect as a wallet option in the widget. It needs a `tonconnect-manifest.json` URL (`integrations.tonConnect.manifestUrl`, also editable in the studio). The TON Connect modal stays usable while the widget's connect dialog is open.

### Patch Changes

- #294 `27b605a` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Show clear messages again when a Ledger is locked, disconnected, has the wrong app open or the request is rejected while loading addresses.

- #299 `791000f` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Ledger Wallet now asks whether to connect its EVM networks or Solana when both are available, and only opens Ledger's account picker for that family. A family that is already connected with Ledger Wallet stays in the picker but disabled, and if every family is already connected the widget says so instead of reconnecting. Ledger Wallet and the direct Ledger connection can no longer be connected at the same time, since both would hold the same device: while one is connected, the other shows as disabled until it is disconnected. A Solana-only connection no longer waits for the EVM provider. Solana shows up once the `@swapkit/wallets` release with Ledger Wallet Solana support is installed.

- #316 `01b4081` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Fix the Ledger Wallet window showing without its styles in the widget loaded from the CDN.

- #319 `ea4b25f` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - The widget bundle and Studio now ship a single copy of ethers. Wallet packages could pull in their own copy, which made the SDK treat browser and hardware wallets as plain RPC providers and fail with a gas estimation error when the wallet was on a different network than the swap (for example Ledger Wallet connected on Avalanche while swapping from BNB Smart Chain).

## 0.26.1

### Patch Changes

- #301 `47278c9` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - When the connect wallet list is filtered by chain, wallets that support the selected chains are listed first and the ones marked "Not supported on selected chains" after them.

- #302 `5923888` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - The "Popular" section of the wallet connect dialog now features TronLink instead of Coinbase Wallet.

## 0.26.0

### Minor Changes

- #256 `d49b676` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Add the Ledger Wallet Provider (`WalletOption.LEDGER_WALLET_PROVIDER`, "Ledger Wallet") to the wallet connect flow as a standalone option under Hardware Wallets, behind dev mode for now: like the other experimental wallets, its connect row, Studio wallet toggle and Studio configuration block are hidden unless `developMode` / `SKConfig.envs.isDev` is on, where they carry a "DEV" badge. The provider the Ledger SDK announces over EIP-6963 is never listed under Detected wallets, in dev mode or not, so the option only ever appears once.

  One click connects every EVM chain it supports from a single device approval through Ledger's own SDK — no chain picker — and it is available on mobile browsers (the SDK hands off to Ledger Live). The existing Ledger option is unchanged: it still connects one chain per approval through its own chain picker.

  The SDK options `apiKey` and `dAppIdentifier` are configurable under `integrations.ledgerWalletProvider` through the `config` prop / attribute and the Studio's wallet configuration; nothing else is. The floating Ledger button is always hidden, the SDK always runs against production, and its UI always mounts into `<body>`, where it stays clickable above the widget's dialogs. When the SDK cannot start because the browser or frame lacks WebHID/Web Bluetooth, the connect error says so in one line.

  A swap rejected in the wallet now shows a short warning toast instead of the raw signer error, for every wallet.

  The package entry now imports `@swapkit/wallets/register` so registered wallet options resolve before the module-scope wallet lists read them. Requires a `@swapkit/wallets` release that ships `@swapkit/wallets/ledger-wallet-provider`.

### Patch Changes

- #287 `f8e5744` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - The Ledger and Trezor derivation picker offers Taproot on Bitcoin.

- #264 `f98a75c` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Block swaps when the wallet's gas balance can't cover the quoted network fee and show a clear message when a transaction fails for insufficient fee funds.

- #288 `aef9fea` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Show the chain badge on any gas asset whose ticker pays gas on several chains (ETH on Arbitrum, Base, Optimism, Linea…, BTC on Botanix, USDC on Arc and Noble), keeping it hidden on the chain named after the ticker. Gas assets are now read from the SDK chain config instead of a hand-maintained table.

- #285 `70b9693` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - MetaMask now connects through its multichain connector, so selecting Solana with MetaMask works instead of failing with `wallet_chain_not_supported`.

- #278 `577d86c` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Show the real USD value of what you receive: fees were being subtracted a second time from an amount that already excludes them, which could even show a negative value on small swaps.

- #295 `fe92f07` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Skip the network-fee check when selling the gas asset on chains the backend can sweep (BTC, BCH, DASH, DOGE, LTC, ZEC, TRON, TON), so max-spend swaps aren't blocked.

- #282 `fb17dad` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - The widget no longer reads Widget Studio settings saved in the browser, so embeds always follow their own configuration. The studio still remembers its settings and passes them to its widget directly

- #275 `93cfef4` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Apply the `theme` tokens to dialogs, drawers and tooltips. They render outside the widget root, so they kept the default dark palette even when a theme was provided.

  - `overlay`, `fontFamily` and `radius` now reach portaled content. The modal backdrop follows the `overlay` token, which previously had no effect.
  - `getThemeTokenStyleProps` (and the deprecated `getColorsStyleProps`) now include the derived variables (`--sk-ui-card`, `--sk-ui-foreground`, ...) the same way `applyThemeTokensToElement` already did.
  - Theme variables are applied inline on dialog, drawer and tooltip roots. A stylesheet override of `--sk-*` variables on that content no longer wins when a theme is provided; pass `style` to the component instead.

- #274 `c137b4a` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Show TronLink in the widget wallet list, recognise it when detected, and show browser wallet icons in the wallet drawer

## 0.25.0

### Minor Changes

- #262 `aa03c39` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Extend `allowDerivationSelection` to Ledger and Trezor: Bitcoin and Litecoin get an address-type picker that lists the first addresses and balances on the branch you choose, and Ethereum, Avalanche and BNB Smart Chain get the same MetaMask, Legacy and Ledger Live shapes the keystore picker offers. The device is only asked to approve the standard you actually pick.

- #254 `3c657d2` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Add opt-in derivation controls to the keystore connect flow, behind a new `allowDerivationSelection` prop (off by default). Keystore connects can pick a wallet index per chain, a named BIP standard on Bitcoin, Litecoin, Ethereum, BSC and Avalanche, or type a custom path on those chains or Solana. Under the free-form path on Bitcoin and Litecoin, and only where the typed purpose is not already 84, the path can also force the address format — the recovery route for funds sitting at an address the widget handed out before the BIP43 purpose decided the encoding, since those keys used to come back as native SegWit whatever path they were derived on. Deriving SegWit from a legacy path produces an address no other wallet reproduces from that path, so the named standard pills deliberately do not offer it, and the wallet drawer badges a forced encoding on its own line. Nested SegWit and Taproot custom paths now connect where they previously failed with `toolbox_utxo_unsupported_script_type`, and the keystore picker offers both. Every UTXO chain's derivation entry now states its encoding — the widget sends `{ derivationPath, scriptType }` for those chains and a bare path everywhere else — which needs `@swapkit/helpers` 6, `@swapkit/toolboxes` 6 and `@swapkit/wallet-keystore` 6 for the explicit-script-type contract. `@swapkit/wallets` moves to 5 alongside them, and the keystore derivation map is now typed by the SDK rather than by the widget, so a UTXO entry missing its encoding is a type error instead of a runtime one.

### Patch Changes

- #253 `df2eeb1` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - A wallet rejection during an approval no longer escapes as an unhandled promise rejection: the approval dialog stays open for a retry and the widget shows what happened. Rejected network switches get their own message (approve the network request, or add the chain in the wallet manually) and no longer count as errors in telemetry.

- #259 `3bcca0a` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Disable Kujira. The chain is no longer listed in the widget, studio chain grid, Keplr chain set or minimal token list.

- #257 `57df9f0` Thanks [@ice-chillios](https://github.com/ice-chillios)! - Remove CTRL (formerly XDEFI) and Leap from the connection dialog, widget controls, connection dispatch and hosted-widget configuration. Existing integrations should remove CTRL and Leap from their configured wallets and use a supported wallet instead.

## 0.24.2

### Patch Changes

- #242 `708fb10` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Show the chain badge on `ARC.USDC`. The SDK types Arc's gas asset as native, which used to hide the badge, so USDC on Arc looked like USDC anywhere else. The badge now also hides itself when the chain logo fails to load instead of rendering a broken image.

- #242 `708fb10` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Arc's ERC-20 USDC (`ARC.USDC-0x3600…`) is the same balance as the native gas asset `ARC.USDC`, and the API returns both. The widget now shows only `ARC.USDC`: the ERC-20 spelling is dropped from token lists, balances, price lookups and search results, and is resolved to `ARC.USDC` when an integrator passes it in `swapToAssets`.

- #245 `c21688f` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Token, chain, provider and wallet logos now load from `https://tokens.swapkit.dev` in every build mode, replacing the two Google Cloud Storage buckets that were picked by Vite mode.

- #242 `708fb10` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Arc is dev-only on Ledger, Coinbase and Brave for now. wallets 4.13.0 declares Arc among their chains, but those flows have not been verified, so the chain is hidden for these wallets in production builds and stays available with `developMode` for testing.

## 0.24.1

### Patch Changes

- #240 `42a5edc` Thanks [@towanTG](https://github.com/towanTG)! - Bump @swapkit packages to the 2026-09-16 SDK release line — core 5.0.8, helpers 5.4.1, plugins 5.0.8, toolboxes 5.4.1, wallet-keystore 5.2.0, wallets 4.13.0. Brings the public Arc mainnet RPC as the SDK default for `Chain.Arc` (the widget's `rpcUrls` config is no longer required for Arc), the 24-word keystore phrase default + `generateKeystore`, the new token icon base URL, and Arc on the WalletConnect / Coinbase / Ledger / Trezor / KeepKey connectors. Drops the root `@swapkit/tokens` 5.0.6 override now that helpers 5.4.1 pins tokens 5.0.8.

## 0.24.0

### Minor Changes

- #239 `4e74225` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Enable Arc (ARC) in the widget: added to the chain catalog, API-supported chain list and minimal tokens with its native gas asset `ARC.USDC` (18 decimals). Arc joins the EVM chain list, and the two hard-coded EVM lists used for EIP-6963 wallet descriptors and the ERC-20 approval path now derive from the catalog, so HyperEVM and Robinhood are covered there too. The React `config` prop accepts `rpcUrls`, since the SDK ships no public RPC for Arc.

- #230 `1cd3737` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Add a slippage tolerance control to the widget, below the swap inputs and above
  the action button. Collapsed it summarizes the tolerance in effect; expanded it
  offers the `0.25% / 1%` presets and a custom percentage between 0.25% and 50%.
  The default is **1%**.

  Note for existing embeds: the widget now always sends `slippage` with the quote
  request (previously it sent none and the API default applied).

### Patch Changes

- #221 `2be4909` Thanks [@towanTG](https://github.com/towanTG)! - Bump @swapkit dependencies to the SDK 5.0.0 release line (core/helpers/plugins/toolboxes/wallet-keystore 5.0.0, wallets 4.11.0), enabling Hypercore and HyperEVM end to end — keystore HYPE/HyperEVM derivation needs helpers 5.0.0. Root override pins @swapkit/cosmos-signer to 0.1.0 while the 0.2.0 that toolboxes 5.0.0 peers on is unpublished (sdk release-run npm E404); drop the override once 0.2.0 lands.

- #223 `24dbaab` Thanks [@towanTG](https://github.com/towanTG)! - Bump @swapkit dependencies to the latest releases: wallets 4.11.1 (cosmos-signer
  0.2.0 resolution, test hygiene), sdk family 5.0.2 / toolboxes 5.1.1 (API-first
  HyperCore getBalance with getBalanceFromChain fallback, corrected HyperEVM /
  Hyperliquid chain names, spotMeta weiDecimals balance decimals).

- #224 `2dd25a0` Thanks [@towanTG](https://github.com/towanTG)! - Bump @swapkit dependencies to the latest releases: wallets 4.12.0 (Noir Wallet
  connector for Zcash, TON_CONNECT via the extensible WalletOption registry),
  sdk family 5.0.4 / helpers 5.2.0 / toolboxes 5.2.0 / wallet-keystore 5.1.0
  (derivation paths now honour non-zero index and explicit path — index 0 without
  a path is unchanged; refreshed token lists). Adapt to the literal-typed
  WalletOption registry (explicit WalletOption annotations on wallet collections)
  and cast around the stale mutable-tuple derivation-path params still baked into
  the published wallet-hardware 4.9.33 typings.

- #226 `250d92c` Thanks [@towanTG](https://github.com/towanTG)! - Bump @swapkit packages to the plugins 5.0.5 line — accepts the canonical HyperCore USDC HIP-1 identifier the API emits since 2026-08-27, fixing `plugin_swapkit_invalid_transaction` on every HyperCore USDC payin (core 5.0.5, helpers 5.2.1, toolboxes 5.2.1, wallet-keystore 5.1.1, wallets 4.12.1).

- #229 `c5e99f5` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - A quote that comes back with no routes now clears the receive amount and its USD value instead of leaving the previous quote's numbers on screen, and shows a "No routes available for this swap" toast. A response with a missing `routes` field is treated the same way.

- #232 `a6d0900` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Fix ERC-20 approvals being rejected on Robinhood Chain and HyperEVM. The widget kept two stale
  copies of the EVM chain list (the approval gate in `swapkit-widget.tsx` and the EIP-6963 fallback in
  `wallet-chains-config.ts`) that were never updated when those chains were enabled, so swaps from an
  ERC-20 source token failed with "Approval transactions are only supported on EVM chains" and
  unmapped injected wallets were never offered the chains. Both now use `EVM_CHAINS` from the chain
  catalog, with a test asserting it covers every EVM chain in `API_SUPPORTED_CHAINS`.

- #206 `44a7742` Thanks [@towanTG](https://github.com/towanTG)! - Output token picker falls back to the full asset catalog when swap-to pair data is unavailable (request disabled by missing credentials, failed, or not yet run) instead of rendering an empty "No assets found" list. Token search is enabled in the fallback state so the picker behaves like the input picker. [API-2945]

- #234 `2b229af` Thanks [@towanTG](https://github.com/towanTG)! - Override @swapkit/tokens to 5.0.6 — refreshes the baked widget token list (helpers 5.2.1 hard-pins tokens 5.0.5; drop the override when a helpers release pins ≥5.0.6).

- #204 `6504d78` Thanks [@towanTG](https://github.com/towanTG)! - Point widget asset image URLs (tokens, chains, providers, wallets) at the new org buckets — sk-apiv2-token-list-swapkit (prod) and sk-apiv2-dev-token-list-swapkit (dev), matching the logoURI host the api serves. [API-2944]

- #237 `5abc017` Thanks [@hippocampusSK](https://github.com/hippocampusSK)! - Side drawers (transaction history, connected wallets) now take the full viewport width on phones instead of leaving an unusable 25% strip under the overlay, with tighter padding below the `sm` breakpoint. Transaction history rows were reflowed for narrow screens: the hash and open-in-tracker icon are pinned right and always visible on touch devices, the Shielded badge wraps under the type/age instead of squeezing the hash, and the sell → buy legs wrap between legs rather than overflowing.

## 0.23.0

### Minor Changes

- #190 `96394f7` Thanks [@towanTG](https://github.com/towanTG)! - Enable the Aleo chain for keystore wallets, detect shielded swap deliveries, and add a resumable unshield dialog for private Aleo records. Completed swaps that delivered shielded ALEO get a passive "Shielded" badge in the transaction history; the unshield action lives in the wallet drawer's ALEO section ("Shielded swap deliveries" row with an Unshield button). The dialog labels amounts as shielded _from swap deliveries_ (only swap-delivered records are visible — there is no chain scanning) and unshields the largest record per pass, with the remainder staying shielded for the next pass. `@provablehq/sdk` ships as a peer dependency of `@swapkit/toolboxes` — package managers that don't auto-install peers need it added as a direct dependency. Vite integrators must exclude `@provablehq/sdk` from dependency optimization and include `@provablehq/sdk > core-js/proposals/json-parse-with-source.js` so the SDK's browser WASM asset resolves correctly. Swap tracking and shielded-delivery detection now run whenever the widget is mounted (previously only while the transaction history drawer was open). After a successful pass the dialog offers "Unshield next" when more shielded records remain — including the fee record's change, which is now tracked under the unshield transaction so it stays unshieldable — and the tab warns before closing while a proof is being generated.

- #201 `acac94e` Thanks [@towanTG](https://github.com/towanTG)! - Bump @swapkit dependencies (wallets 4.10.0, wallet-keystore 4.5.5, toolboxes 4.28.0, helpers 4.20.1, core 4.6.4, plugins 4.7.4). Enables Hypercore (HYPE) for keystore wallets: the keystore connect path (`@swapkit/wallets`) now lists `Chain.Hype`, so it no longer gets filtered out at connect time.

- #197 `2bda851` Thanks [@towanTG](https://github.com/towanTG)! - Enable Hypercore (HYPE) and HyperEVM in the widget: added to the chain catalog, API-supported chain list, and minimal tokens with their native HYPE assets (8 and 18 decimals respectively). HyperEVM joins the EVM chain list, so wallet support comes through the shared EVM wallet paths.

- #191 `b9cf5dc` Thanks [@towanTG](https://github.com/towanTG)! - Enable Robinhood Chain (HOOD) in the widget: added to the EVM chain list and chain catalog with the `HOOD.ETH` native asset (ETH-gas L2). Wallet support comes automatically through the shared EVM wallet paths. Note: the public RPC (`rpc.mainnet.chain.robinhood.com`) is rate-limited — production integrators should configure a provider RPC via `SKConfig.setRpcUrl`.

- #195 `dbe2fc1` Thanks [@towanTG](https://github.com/towanTG)! - Search the SwapKit API token catalog when selecting chains or typing in the asset picker, merging API-only tokens after bundled static results. Update @swapkit/\* dependencies to the July 24 stable release (helpers 4.20.0 with searchTokens, tokens 4.4.0 with dev token lists).

- #173 `c879ec8` Thanks [@towanTG](https://github.com/towanTG)! - Add Stellar (XLM) chain support to the widget: chain catalog entry, native asset defaults, and minimal token list. Bump @swapkit/\* dependencies to nightly builds with the Stellar toolbox and keystore signing support.

- #187 `dab11a1` Thanks [@towanTG](https://github.com/towanTG)! - Add a Stellar trustline approval step to the swap widget. Swapping into a non-native Stellar asset (e.g. XLM.USDC) whose receiving account lacks the required trustline now prompts a one-time "Approve on Stellar" step (the dialog explains that the trustline locks a 0.5 XLM base reserve): `swapKit.approveAssetValue(route)` has the receiving wallet sign and broadcast the API-delivered changeTrust XDR (skipping when the trustline already exists), then the route is re-fetched and the swap continues. If the destination account doesn't exist on Stellar yet, a distinct message explains it must be created and funded (~1 XLM minimum plus 0.5 XLM per trustline) first. SDK dependencies are bumped to the releases carrying this flow (`@swapkit/core` 4.6.1, `@swapkit/helpers` 4.19.1, `@swapkit/plugins` 4.7.1, `@swapkit/toolboxes` 4.26.1, `@swapkit/wallet-keystore` 4.5.2, `@swapkit/wallets` 4.8.31), along with `@stellar/stellar-sdk` 16.1.0 — required by the new toolboxes peer range and for working Stellar support in browser bundles (v15 shipped a UMD `browser` entry whose named exports resolve to `undefined` under Vite).

### Patch Changes

- #195 `dbe2fc1` Thanks [@towanTG](https://github.com/towanTG)! - Add Robinhood Chain to API_SUPPORTED_CHAINS so HOOD actually appears in the widget's chain filter and asset picker (completes the HOOD enablement from #191).

- #175 `15d4e04` Thanks [@towanTG](https://github.com/towanTG)! - Bump @swapkit/\* to nightly builds that include the Stellar swap dispatch fix (the swapkit plugin now signs and broadcasts the Stellar transaction envelope XDR returned in swap responses).

## 0.22.1

### Patch Changes

- #164 `908717f` Thanks [@towanTG](https://github.com/towanTG)! - Bump @swapkit dependencies to latest published versions.

## 0.22.0

### Minor Changes

- #153 `551165f` Thanks [@towanTG](https://github.com/towanTG)! - Make assets in the wallet drawer selectable as the swap input. Clicking a token row now closes the drawer and sets that asset as the widget's input asset, leaving the output unchanged. If the picked asset is the current output asset, the sides swap so the pair stays valid; the entered amount is cleared on change (matching the normal input-asset selector).

### Patch Changes

- #154 `8f34999` Thanks [@towanTG](https://github.com/towanTG)! - Approval dialog now shows the token contract and the **spender** as block-explorer links (via `getExplorerAddressUrl` from `@swapkit/helpers`). The spender is the real allowance grantee, decoded from the approve calldata with `ethers` (the approval tx's `to` is the token contract, not the spender); if it can't be decoded it's hidden rather than shown as a misleading address. Both addresses are truncated, labelled, and open the explorer in a new tab. (API-2647 a/b)

- #159 `f16e85f` Thanks [@towanTG](https://github.com/towanTG)! - Bump `@swapkit/*` dependencies to latest: `core` 4.4.40, `helpers` 4.15.1, `plugins` 4.6.54, `toolboxes` 4.19.0, `wallet-keystore` 4.4.8, `wallets` 4.8.26. `wallets` 4.8.26 realigns the tree so it resolves a single `@swapkit/types@0.9.0` (previously bumping pulled a duplicate 0.8.1/0.9.0 and broke the type-check).

## 0.21.1

### Patch Changes

- #143 `5936cea` Thanks [@towanTG](https://github.com/towanTG)! - Fix a Widget Studio crash for users whose persisted `formValues` (localStorage) predate the Local Mode field. The form default read `SKConfig.getState().localMode`, which can be `undefined` (older bundled `@swapkit/helpers`, a stale bundler dep cache, or pre-existing localStorage), leaving `localMode` undefined and throwing `Cannot read properties of undefined (reading 'enabled')` on first render. Local mode now falls back to a hardcoded default (`{ enabled: false, quoteUrl: "http://localhost:3000", swapUrl: "http://localhost:3001" }`) and is coalesced so it is never undefined downstream.

## 0.21.0

### Minor Changes

- #141 `3bcd3f9` Thanks [@towanTG](https://github.com/towanTG)! - Bump all `@swapkit/*` dependencies to latest (core 4.4.38, helpers 4.15.0, plugins 4.6.52, toolboxes 4.17.6, wallet-keystore 4.4.6, wallets 4.8.25) and add a **Local Mode** toggle to the Widget Studio's Developer settings.

  Local Mode mirrors `@swapkit/helpers`' `SKConfig.localMode`, routing quote/swap requests to locally running services (default `http://localhost:3000` / `http://localhost:3001`). The toggle is only shown when the studio itself is served from `localhost`, since it targets local-only endpoints and never ships in the embed snippet.

## 0.20.4

### Patch Changes

- #137 `360939c` Thanks [@towanTG](https://github.com/towanTG)! - Route widget selected/hover/active states through the correct theme tokens so every persistent fill is configurable from the Widget Studio. Selected chain rows (popover + sheet), popular chain pills, derive-address rows, and the selected `Chip` now use `colorBgActive`; default `Button`, `Skeleton`, and provider badge use `colorSecondary` for their static surface; transient `hover:` overlays continue to use `colorBgHover`. Accent color stays as the selection affordance (border, check icon) only.

## 0.20.3

### Patch Changes

- #134 `9482966` Thanks [@towanTG](https://github.com/towanTG)! - Add configurable widget theme tokens for border radius and font family, emit the full Studio configuration through generated snippets, and document the UI package.

## 0.20.2

### Patch Changes

- #131 `a164ef9` Thanks [@towanTG](https://github.com/towanTG)! - Expose active and overlay theme controls in Widget Studio, update wallet configuration learn-more links, and bump SwapKit runtime dependencies.

## 0.20.1

### Patch Changes

- `7238dcd` Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Stabilize the React widget studio wallet configuration and swap-to asset loading.

## 0.20.0

### Minor Changes

- #123 `b6bde66` Thanks [@towanTG](https://github.com/towanTG)! - Surface every provider in a multi-hop quote rather than just the first.

  - The collapsed quote card now face-piles the provider logos and renders the full path label (`1inch → Chainflip`, truncated to `A → … → Z` for 4+ providers) instead of only `providers[0]`.
  - The priority badge (Recommended / Cheapest / Fastest) moves to a corner ribbon on the top-right of the card and dialog rows, freeing the inline row for the path label and amount on mobile too.
  - The fee details accordion now leads with a vertical per-leg timeline (sell asset → provider → … → buy asset) for multi-hop routes; single-hop routes show the fees breakdown only, unchanged.
  - The route-select dialog mirrors the collapsed card: stacked logos, path label, corner ribbon, and the title becomes "Select route".

## 0.19.1

### Patch Changes

- `9fd99aa` Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Declare SwapKit peer dependencies required by toolbox consumers and keep balance refresh available for connected zero-balance wallets.

## 0.19.0

### Minor Changes

- #113 `417ccf7` Thanks [@towanTG](https://github.com/towanTG)! - Wallet drawer + connect-wallet flow improvements, plus a SwapKit dependency bump.

  - **Wallet drawer grouped by wallet.** Connected chains are now grouped under a per-wallet header (avatar, name, "N chains · M tokens", total USD) that collapses/expands when more than one wallet is connected; a single wallet renders as a flat label. The Connect-wallet action is always visible, pinned above Disconnect, and uses a generic label (no input/output chain reference). Disconnect reads "Disconnect all" when multiple wallets are connected.
  - **Main swap button connect logic.** The button shows a plain "Connect wallet" while there is no wallet connected and no quote yet — clicking it opens the generic connect dialog. The chain-specific connect flow only triggers once a route exists, and the input chain (what the user pays from) is always resolved before the output chain.
  - **Dependency bump:** `@swapkit/core@4.4.31`, `@swapkit/helpers@4.13.13`, `@swapkit/plugins@4.6.45`, `@swapkit/toolboxes@4.16.2`, `@swapkit/wallet-keystore@4.3.37`, `@swapkit/wallets@4.8.22`.

## 0.18.2

### Patch Changes

- #110 `7128a31` Thanks [@towanTG](https://github.com/towanTG)! - Bump SwapKit packages to the latest releases, including wallets 4.8.19, and apply developer-mode chain filtering consistently in the wallet connect dialog. Ledger Litecoin is no longer hidden behind developer mode.

## 0.18.1

### Patch Changes

- #106 `349a199` Thanks [@towanTG](https://github.com/towanTG)! - Bump SwapKit package dependencies to their latest patch releases (`@swapkit/core@4.4.28`, `@swapkit/helpers@4.13.11`, `@swapkit/plugins@4.6.42`, `@swapkit/toolboxes@4.15.15`, `@swapkit/wallet-keystore@4.3.34`, `@swapkit/wallets@4.8.18`).

- #107 `67da9b1` Thanks [@towanTG](https://github.com/towanTG)! - Validate `getRouteWithTx` amount fields before calling `swap`, matching the stricter SwapKit route type required by the latest helpers/core packages.

## 0.18.0

### Minor Changes

- #103 `0c379f9` Thanks [@towanTG](https://github.com/towanTG)! - **Chains configuration + redesigned wallet rows in the studio.**

  Adds a new **Chains** section to the studio's Settings tab letting integrators restrict the chain set the widget operates on. Disabling a chain hides it from the asset selector and auto-disables wallets whose required chains are all gone (Ripple → Xaman, Radix → Radix Wallet, all Cosmos chains → Keplr / Leap). The change is full-stack:

  - React widget gains a `chains` prop (`Chain[] | "all" | { include } | { exclude }`, mirroring `wallets`).
  - Web component gains `chains` / `chains-include` / `chains-exclude` attributes; the snippet generator emits them when the user picks anything other than "all".
  - `SwapKitConfigProvider` exposes `enabledChains` and `isChainAllowed`; the asset-select chain filter, popular-chain pills, asset list hook, and wallet-connect dialog all honour the gate.
  - New `lib/chain-catalog.ts` declares the 32 controllable chains, preset groupings (All / EVM only / BTC + ETH / Cosmos / UTXO), and the chain → required-wallets dependency map.

  Also redesigns the **Wallet Configuration** rows in the same tab. The single-line layout was wrapping to 5+ visual lines at the sidebar's 380px width. New row: glyph · name · status tag (Needs config / Ready / Disabled) on the title line, description + doc link on the sub-line, switch + chevron-to-configure on the right. Fields expand inline below the row instead of all at once. Sort order: needs-config → ready → disabled.

### Patch Changes

- #98 `d4ed0e2` Thanks [@towanTG](https://github.com/towanTG)! - Drop `React.forwardRef` across all UI primitives (accordion, button, card, checkbox, chip, dialog, form, input, label, separator, sheet, sidebar, tabs, textarea, tooltip) — React 19 accepts `ref` as a regular prop. Ref types are widened to `React.Ref<T>` so callback refs from libraries like React Hook Form still work. Behaviour is unchanged. Also drops three unused biome suppression comments and refactors `<swapkit-widget>` `getConfig` into smaller helpers to clear a cognitive-complexity warning.

## 0.17.0

### Minor Changes

- #96 `d8bca4a` Thanks [@towanTG](https://github.com/towanTG)! - Gate KeepKey, Vultisig, and Litecoin-on-Ledger behind the dev-mode flag. In production builds they're hidden from the wallet connect dialog, the studio sidebar wallet selector, and (for LTC-on-Ledger) the chain select dialog. In dev mode they remain visible but are tagged with a "DEV" badge so the wallets repo can iterate on them through this UI.

  The dev signal is `SKConfig.envs.isDev`, which is wired to the studio's `developMode` toggle, the web component's `develop-mode` attribute, and the `__SWAPKIT_IS_DEV__` compile-time default (`SWAPKIT_USE_DEV_API=true` at build).

### Patch Changes

- #92 `c9213b0` Thanks [@towanTG](https://github.com/towanTG)! - Bump SwapKit dependencies and limit swap confirmation amounts to 10 significant digits.

- #92 `c9213b0` Thanks [@towanTG](https://github.com/towanTG)! - Remove the "Customised" / "Defaults" label from the studio sidebar footer. The Reset button's disabled state already communicates whether the config differs from defaults, so the label was redundant.

## 0.16.5

### Patch Changes

- #88 `74cefd7` Thanks [@towanTG](https://github.com/towanTG)! - Add input-chain wallet connection actions when a quote exists but the connected wallet does not cover the pay asset chain.

- #87 `b3ce60b` Thanks [@towanTG](https://github.com/towanTG)! - Persist tracker polling metadata with transaction history and schedule pending transaction checks with backoff, visibility gating, and a per-tick request cap.

## 0.16.4

### Patch Changes

- #84 `d4c1c0a` Thanks [@towanTG](https://github.com/towanTG)! - Use wallet-level UTXO xpub discovery before hardware address selection, then bind the selected derived address on final connect.

## 0.16.3

### Patch Changes

- #81 `170f352` Thanks [@towanTG](https://github.com/towanTG)! - Bump `@swapkit/wallets` to 4.8.12.

- #81 `170f352` Thanks [@towanTG](https://github.com/towanTG)! - Request the send-chain wallet connection before swap execution when a quote exists but the input chain is not connected.

## 0.16.2

### Patch Changes

- #78 `9d6ede4` Thanks [@towanTG](https://github.com/towanTG)! - Bump `@swapkit/wallets` to 4.8.11 and keep web-component swap state local so embedded widgets do not refresh when assets change.

## 0.16.1

### Patch Changes

- #74 `d74ed28` Thanks [@towanTG](https://github.com/towanTG)! - Enable the UTXO xpub address selection flow for Trezor hardware wallets.

## 0.16.0

### Minor Changes

- #68 `d14e317` Thanks [@towanTG](https://github.com/towanTG)! - Studio sidebar — new "Wallet configuration" section under Settings.

  Lets developers persist wallet/integration credentials (`apiKeys.walletConnectProjectId`, `apiKeys.xaman`, `apiKeys.passkeys`, `apiKeys.keepKey`, plus `integrations.{coinbase, nearWalletSelector, trezor, keepKey, radix}`) directly in the studio. Persisted to localStorage alongside the rest of the form, applied to `SKConfig` immediately and on next page load so the studio's live preview reflects the values.

  Each wallet's block:

  - Header with the wallet name + "Get it →" link to where the credential is acquired (cloud.reown.com, apps.xumm.dev, console.radixdlt.com, etc.).
  - Inline `Missing` badge when an enabled wallet's required field is empty.
  - Top-of-section warning banner when any enabled wallet is missing a hard-required field.

  The configurator-side picker continues to surface the full wallet list regardless of mobile UA — only the connect dialog filters to mobile-supported wallets.

- #68 `d14e317` Thanks [@towanTG](https://github.com/towanTG)! - Wallet config now flows from the studio into the embed snippet and the deployed `<swapkit-widget>` web component.

  **Snippet generator** — when any wallet/integration credential is set, emits a JSON `config` attribute on the `<swapkit-widget>` element next to `widget-id` / `widget-key`. The payload is the same partial `SKConfig.set` shape the studio's live preview already feeds into the SDK (apiKeys + integrations, with empty fields filtered).

  **Web component** — `config` is now an `observedAttribute`. `getConfig()` parses it as JSON; `renderWidget()` applies it via `SKConfig.set` before any wallet connect runs, so the widget's `SwapKit()` client picks up the credentials at construct time. Bad JSON is `console.warn`'d and ignored — doesn't crash the widget.

  **Wallet config blocks** in the studio sidebar now sort dynamically: blocks missing a hard-required field bubble to the top, then blocks with any required spec, then recommended-only / NEAR. Original order is the tiebreaker so the layout stays stable as users fill things in.

  **Per-wallet enable toggle** — each wallet config block has a compact switch on the right side of its header that toggles `enabledWalletOptions` in sync with the wallet picker below.

### Patch Changes

- #70 `6c8d007` Thanks [@towanTG](https://github.com/towanTG)! - Fix `apiKeyInvalid` on the very first `SwapKitApi.*` request after `<SwapKitWidget>` mounts.

  `useSwapTo` is declared earlier in `<SwapKitWidget>` than the `applyAuthConfig` `useEffect`, and React fires effects in declaration order — so swap-to fired its fetch before the widget had a chance to write `widgetId/widgetKey` (or `apiKeys.swapKit`) into `SKConfig`. The helpers' `dynamicHeader` callback returned `{}`, the request shipped without auth, and the API responded `{"error":"apiKeyInvalid","message":"Invalid API key"}`.

  Apply auth synchronously during the first render via a `useRef` sentinel, before any effect runs. `SKConfig` is a zustand store — sync writes from render are safe because they don't touch React's own state graph. Subsequent prop changes are still picked up by the debounced re-apply effect.

  The web-component path (`<swapkit-widget>`) was already race-free since `renderWidget()` writes to `SKConfig` synchronously before mounting React.

- #67 `470ffe9` Thanks [@towanTG](https://github.com/towanTG)! - Bump `@swapkit/wallets` to 4.8.8 — picks up upstream wallet connect fixes.

- #63 `fdbcca6` Thanks [@towanTG](https://github.com/towanTG)! - `ColorPickerField` — open the native colour picker reliably on mobile.

  Tapping the colour swatch on iOS Safari (and some Android browsers) didn't open the native picker because the swatch was a `<button>` that programmatically called `.click()` on a visually hidden `<input type="color">`. iOS Safari blocks programmatic picker invocations from a separate element.

  Restructured the swatch as a `<label>` that wraps the native colour input directly, so the tap lands on the input itself and the OS picker opens as a true user gesture. Desktop behaviour unchanged.

- #67 `470ffe9` Thanks [@towanTG](https://github.com/towanTG)! - Hide wallets that can't possibly work on mobile from the connect dialog.

  When the host page runs on a mobile user-agent (`iPhone | iPad | iPod | Android`), `useWalletsConfig().isWalletAllowed(...)` now returns `false` for wallet options that have no working path on mobile — hardware wallets (Ledger, Trezor, KeepKey) and desktop-only browser extensions (Bitget, Brave, CTRL, Keplr, Leap, OKX, OneKey, Radix, Talisman). They simply don't render in the connect dialog.

  Wallets with mobile in-app browsers (MetaMask, Coinbase, Phantom, TrustWallet) and chain-specific mobile apps (WalletConnect, Xaman, Coinbase Mobile, OKX Mobile, etc.) still appear — those work or fail loudly with a clear error in the connect-time path. EIP-6963 wallets remain self-pruning by design.

  The studio's wallet-selection picker is unaffected; partners configuring the widget on a phone can still toggle desktop-only wallets for their end users.

- #68 `d14e317` Thanks [@towanTG](https://github.com/towanTG)! - `useModal` — fall back from `crypto.randomUUID()` to a non-cryptographic `Math.random` ID. The Web Crypto API's `randomUUID` is only available on secure contexts (HTTPS or localhost), so opening a modal from a LAN-IP host (e.g. `vite --host` on `http://10.x.x.x` for mobile testing) was throwing `TypeError: crypto.randomUUID is not a function`. Modal IDs are React-key only — non-cryptographic randomness is sufficient.

- #69 `fcde026` Thanks [@towanTG](https://github.com/towanTG)! - Fix `Cannot read properties of undefined (reading 'walletConnectProjectId')` crash on the studio when the user has localStorage from before the wallet-config section shipped.

  The hydration `useEffect` was calling `form.reset(parsed, { keepDefaultValues: true })` with a parsed blob that lacked `apiKeys` / `integrations` keys. `form.reset` doesn't merge defaults — those nested objects became `undefined`, and the apply-effect's `buildSdkConfigPatch` then dereferenced `apiKeys.walletConnectProjectId` and threw.

  Fix is in two layers:

  - **Hydration**: deep-merge persisted values with `defaultValues` so the form is always fully populated, regardless of which keys the persisted blob has.
  - **`buildSdkConfigPatch`**: accept partially-shaped inputs and read every leaf with optional chaining as belt-and-suspenders.

- #65 `3ed8ad0` Thanks [@towanTG](https://github.com/towanTG)! - Wallet connect — eliminate double-tap "Already processing eth_requestAccounts" failures.

  Two fixes that compose:

  - `Button` now propagates `isLoading` to the underlying button's `disabled` attribute (and sets `aria-busy`). Previously a loading state only displayed a spinner; the button stayed clickable, so a fast double-tap on mobile fired the click handler twice.
  - `connectWallet` in the SwapKit context reads live store state at the top of the callback and bails if a connect is already in flight. Defence-in-depth — even if a click slips through, the second invocation no-ops instead of triggering a second `eth_requestAccounts` (MetaMask returns `-32002 "already processing"` for that case, surfaced as "Failed to connect METAMASK").

  Also includes:

  - The route-tag pill in `SwapQuotePreview` is hidden on viewports `< 640px` so it stops crowding the timer + buy-amount on the same row. Tags still render in the route-select dialog on every viewport.
  - `vite:preloadError` listener in the playground recovers from "stale tab after deploy" errors by reloading once per session — the older `index.html` references chunk hashes the new container doesn't have.

## 0.15.1

### Patch Changes

- #60 `34ecba8` Thanks [@towanTG](https://github.com/towanTG)! - Bump `@swapkit/*` to the latest line: core 4.4.23, helpers 4.13.7, plugins 4.6.37, toolboxes 4.15.10, wallet-keystore 4.3.29, wallets 4.8.7.

## 0.15.0

### Minor Changes

- #58 `567f5f3` Thanks [@towanTG](https://github.com/towanTG)! - Widget Studio sidebar redesign + widget ID auth.

  **Auth (`widgetId` + `widgetKey`)**

  `@swapkit/helpers@4.13.5` ships `SKConfig.setWidgetId`, an `x-widget-id` header, and a 4-arg `signWidgetRequest(secret, widgetId, origin, timestamp)`. HMAC mode now requires both `widgetId` and `widgetKey` together; otherwise the SDK falls back to `x-api-key` (or no auth). Wired through:

  - `ControlsStoreFieldValues.widgetId` form field, persisted to localStorage alongside `widgetKey`.
  - `<SwapKitWidget widgetId={…} widgetKey={…} />` prop pair on the React widget; same on the `<swapkit-widget widget-id widget-key>` web component (new `observedAttributes` entry).
  - Snippet generator emits `widget-id="…"` paired with `widget-key="…"` when both are set; `api-key` otherwise.
  - Partial-auth warning when one of the two is set in isolation.
  - `useSwapKitConfig` now exposes `widgetId`.

  **Widget Studio sidebar**

  Refined three-tab layout (Design / Settings / Integrate) with a sticky footer.

  - **Design tab** — preset row with Moon/Sun mode toggle (each preset carries `dark` and `light` palettes; switching mode re-applies the active preset), 2-column compact token grid (new `variant="compact"` on `ColorPickerField`).
  - **Settings tab** — segmented Widget Key / API Key auth, collapsible "Developer settings" (API endpoint + Developer Mode + Dev API URL), collapsible "Enabled wallets" with an inline-chip variant.
  - **Integrate tab** — embed snippet with HTML syntax highlighting (`highlight.js/lib/core` + xml grammar; ~7 KB gz, themed via `--sk-ui-accent` so colours track the live preset).

  Reusable building blocks added: `<Chip>` (`components/ui/chip.tsx`), `WalletSelectionField variant="chips"` (`ALL_CONTROLLABLE_WALLETS` exported), `ColorPickerField variant="compact"`, `<TabsContent>` now hides inactive panels via `data-[state=inactive]:hidden` so flex-1 layouts work as expected.

  **Playground**

  Floating, blurred sidebar (`position: fixed` + backdrop-filter + box-shadow) over a centred widget canvas. Workspace `@swapkit/ui` source aliased so sidebar/widget edits HMR live without a package rebuild.

## 0.14.0

### Minor Changes

- #52 `2c012d5` Thanks [@towanTG](https://github.com/towanTG)! - Preload wallet modules at widget mount and use a single SwapKit SDK instance.

  The widget previously lazy-loaded each wallet module the first time the connect dialog opened and rebuilt the SwapKit client on every connect. That meant `connect<Wallet>` methods were derived from a just-created instance while another SDK reference was still in the store, and any `SKConfig` values that toolboxes cache at construction (notably `isDev` and the API key used by the balance API) didn't reach the live SDK after a dev-mode or api-key toggle.

  The new flow:

  - At mount, the widget resolves `enabledWallets` (from the `wallets` prop or the settings localStorage override), loads all those modules in parallel, and builds one SwapKit instance with the full wallet set.
  - `walletChainsMap` is populated during that preload via each module's `directSigningSupport`, so the connect-wallet dialog no longer has to trigger `ensureWalletsLoaded` on open.
  - `connectWallet` / `connectKeystore` call `connect<Wallet>` on the existing instance — no more mid-connect rebuild, no more `setSwapKit` race.
  - Config-change effects (apiKey, widgetKey, dev mode, apiBaseUrl) rebuild via the same preload path. Wallet modules stay cached, so the rebuild is cheap.

  Also bumps `@swapkit/*` to the latest line (core 4.4.19, plugins 4.6.33, toolboxes 4.15.6, wallet-keystore 4.3.25, wallets 4.8.3). `@swapkit/toolboxes@4.15.6` switches the Near signer from a dynamic destructured `import("near-seed-phrase")` to a static namespace import, which fixes the `TypeError: y is not a function` the keystore flow hit under Vite's CJS→ESM dep pre-bundle.

### Patch Changes

- #56 `0c85687` Thanks [@towanTG](https://github.com/towanTG)! - Bump `@swapkit/*` to the latest line: core 4.4.20, plugins 4.6.34, toolboxes 4.15.7, wallet-keystore 4.3.26.

  Widen `SwapKitClient` to match the concrete client shape we build. The typed `ReturnType<typeof SwapKit>` without generics stopped being assignable from the concrete `SwapKit({ plugins, wallets })` call after core@4.4.20 (contravariant narrowing of `approveAssetValue`'s `contractAddress` and per-wallet `connect<X>` methods). We now parameterize `SwapKitClient` with the loaded plugins and a union-to-intersection merge of `SKWallets` so every `connect<X>` method surfaces on the type.

## 0.13.0

### Minor Changes

- #46 `da2d196` Thanks [@towanTG](https://github.com/towanTG)! - Only show wallet+chain combos that support direct signing. Chain lists per wallet are now derived at runtime from each wallet's `directSigningSupport` (loaded when the connect dialog opens) instead of a hardcoded `availableChainsByWallet` map, so wallets that relay via off-chain messages (e.g. WalletConnect for THORChain/Maya) no longer claim support for those chains. Wallets with no direct-signing chains are hidden entirely.

- #46 `da2d196` Thanks [@towanTG](https://github.com/towanTG)! - Add an HD address picker for hardware wallets (Ledger, KeepKey) on UTXO chains. After the user selects a single UTXO chain the widget opens a new dialog that fetches the account-level xpub once from the device, derives addresses locally via `deriveAddressesFromXpub` from `@swapkit/toolboxes/utxo`, and fetches balances in parallel. The dialog supports switching the BIP44 account index, jumping to a specific receive index, toggling change (BIP44 internal) addresses, and a Retry button that maps common device errors (disconnect, locked, app not open, busy, timeout) to plain-English guidance. On pick, the wallet is silently re-bound at the chosen derivation path so swaps and sends sign against that address. Also declares `@swapkit/toolboxes` as a direct dep so `deriveAddressesFromXpub` resolves from the 4.15.x line.

- #46 `da2d196` Thanks [@towanTG](https://github.com/towanTG)! - Connect-wallet and asset-select dialog rework.

  **Connect-wallet dialog**

  - Replaces the old inline "Customize chains" grid with a shared `ChainFilterPopover` (searchable flat list, accent checkmark on selected rows, `Clear` action). When a swap requires a specific output chain, a dismissible banner offers a one-click **Only show {chain}** filter instead of greying out wallets.
  - Detected (EIP-6963) wallets render first with an `Installed` pill; popular wallets follow. Wallet rows are larger (size-10 icon, text-base name, py-3 padding) with a chain-count pill and stacked chain icons ordered by market cap.
  - Bottom gradient fade hints at scrollable content. Fixed desktop height (680px, capped at 90svh) stops the dialog from jumping as filters change.
  - Full-screen on mobile.

  **Asset-select dialog**

  - Reworked to match the reference template: the popular-chain grid is replaced with inline pills (Bitcoin, Ethereum, Solana, Tron, Base) and the shared `Chains` filter popover next to the search input.
  - Grouped list with sticky section headers (`Your balances`, `All tokens`). Empty state has a `Clear filters` action when filters are active.
  - Fixed desktop height (620px, capped at 90svh) and full-screen mobile layout.

  **Wallet + chain support**

  - Chain lists per wallet are derived at runtime from each wallet module's `directSigningSupport` (loaded when the connect dialog opens), filtered by `API_SUPPORTED_CHAINS`. Wallets without direct-signing support for any API-supported chain are hidden.

  **HD address picker**

  - Hardware wallets (Ledger/KeepKey) on UTXO chains open a new dialog that fetches the account xpub once from the device and derives addresses locally via `deriveAddressesFromXpub` (batch of 10), then fetches balances in parallel. Supports switching the BIP44 account index, toggling change addresses, and plain-English error mapping for common device states. On pick, the wallet is re-bound at the chosen derivation path.

  **Deps**

  - Declares `@swapkit/toolboxes` as a direct dep (for `deriveAddressesFromXpub`) and bumps `@swapkit/*` to the 4.15.x line.

## 0.12.0

### Minor Changes

- #41 `1a1a8b5` Thanks [@towanTG](https://github.com/towanTG)! - Scope Tailwind preflight to `.swapkit-ui-preflight` so widget styles no longer bleed onto host pages, rename the last few unprefixed CSS variables (`--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-accent`, inline `--sidebar-width`) to `--sk-ui-*`, and bump `@swapkit/wallet-keystore` to `^4.3.21`.

## 0.11.1

### Patch Changes

- #38 `346ffef` Thanks [@towanTG](https://github.com/towanTG)! - Bump `@swapkit/*` deps to latest: core 4.4.12, helpers 4.13.0, plugins 4.6.26, wallet-keystore 4.3.18, wallets 4.7.0.

## 0.11.0

### Minor Changes

- `194b5b1` Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - - Widget now has its own isolated Sentry client (baked-in DSN) so widget errors always report to our project without colliding with host apps. New `disableTelemetry` prop as an escape hatch.

  - New keystore UI dialogs (create wallet, import phrase) and a `textarea` primitive.
  - Updated `MINIMAL_TOKENS` to use current chain identifiers (POL, XLAYER).
  - Harder failure handling: `loadStaticAssets` errors no longer loop/crash; per-route quote parsing skips malformed fees instead of throwing; widget render is gated until localStorage settings hydrate.
  - Bumped `@swapkit/*` deps.

- #36 `1dd5cd0` Thanks [@towanTG](https://github.com/towanTG)! - `<SwapKitWidget />` React component now accepts an `apiKey` prop in addition to `widgetKey`, matching the web-component's `api-key` / `widget-key` attributes. `apiKey` takes precedence; setting one clears the other. Auth is cleared from `SKConfig` on unmount.

## 0.10.1

### Patch Changes

- `bc33b52` Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Update core dependencies from SDK and wallets release

## 0.10.0

### Minor Changes

- `aeb02b6` Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - feat: add Sentry error logging with categorized error tracking (ui, api, wallet, transaction, data)

## 0.9.0

### Minor Changes

- Migrate all dependencies from @swapkit-dev to @swapkit org
