# @swapkit/ui

## 0.23.0

### Minor Changes

- [#190](https://github.com/swapkit/ui/pull/190) [`96394f7`](https://github.com/swapkit/ui/commit/96394f72e0f3a4b058e4d18bad923eb3370c412a) Thanks [@towanTG](https://github.com/towanTG)! - Enable the Aleo chain for keystore wallets, detect shielded swap deliveries, and add a resumable unshield dialog for private Aleo records. Completed swaps that delivered shielded ALEO get a passive "Shielded" badge in the transaction history; the unshield action lives in the wallet drawer's ALEO section ("Shielded swap deliveries" row with an Unshield button). The dialog labels amounts as shielded _from swap deliveries_ (only swap-delivered records are visible — there is no chain scanning) and unshields the largest record per pass, with the remainder staying shielded for the next pass. `@provablehq/sdk` ships as a peer dependency of `@swapkit/toolboxes` — package managers that don't auto-install peers need it added as a direct dependency. Vite integrators must exclude `@provablehq/sdk` from dependency optimization and include `@provablehq/sdk > core-js/proposals/json-parse-with-source.js` so the SDK's browser WASM asset resolves correctly. Swap tracking and shielded-delivery detection now run whenever the widget is mounted (previously only while the transaction history drawer was open). After a successful pass the dialog offers "Unshield next" when more shielded records remain — including the fee record's change, which is now tracked under the unshield transaction so it stays unshieldable — and the tab warns before closing while a proof is being generated.

- [#201](https://github.com/swapkit/ui/pull/201) [`acac94e`](https://github.com/swapkit/ui/commit/acac94e82383df885ba557a9bcadd0ff22e22f97) Thanks [@towanTG](https://github.com/towanTG)! - Bump @swapkit dependencies (wallets 4.10.0, wallet-keystore 4.5.5, toolboxes 4.28.0, helpers 4.20.1, core 4.6.4, plugins 4.7.4). Enables Hypercore (HYPE) for keystore wallets: the keystore connect path (`@swapkit/wallets`) now lists `Chain.Hype`, so it no longer gets filtered out at connect time.

- [#197](https://github.com/swapkit/ui/pull/197) [`2bda851`](https://github.com/swapkit/ui/commit/2bda8516e6e4e6ef3c16ea4bc9ba7ca485833328) Thanks [@towanTG](https://github.com/towanTG)! - Enable Hypercore (HYPE) and HyperEVM in the widget: added to the chain catalog, API-supported chain list, and minimal tokens with their native HYPE assets (8 and 18 decimals respectively). HyperEVM joins the EVM chain list, so wallet support comes through the shared EVM wallet paths.

- [#191](https://github.com/swapkit/ui/pull/191) [`b9cf5dc`](https://github.com/swapkit/ui/commit/b9cf5dc1e71164d1d221f014923f77edc3cf7d55) Thanks [@towanTG](https://github.com/towanTG)! - Enable Robinhood Chain (HOOD) in the widget: added to the EVM chain list and chain catalog with the `HOOD.ETH` native asset (ETH-gas L2). Wallet support comes automatically through the shared EVM wallet paths. Note: the public RPC (`rpc.mainnet.chain.robinhood.com`) is rate-limited — production integrators should configure a provider RPC via `SKConfig.setRpcUrl`.

- [#195](https://github.com/swapkit/ui/pull/195) [`dbe2fc1`](https://github.com/swapkit/ui/commit/dbe2fc1aeea49af19b863856e6b535d557bef5c9) Thanks [@towanTG](https://github.com/towanTG)! - Search the SwapKit API token catalog when selecting chains or typing in the asset picker, merging API-only tokens after bundled static results. Update @swapkit/\* dependencies to the July 24 stable release (helpers 4.20.0 with searchTokens, tokens 4.4.0 with dev token lists).

- [#173](https://github.com/swapkit/ui/pull/173) [`c879ec8`](https://github.com/swapkit/ui/commit/c879ec822d261545608ee1c75e78079cd8c0a33b) Thanks [@towanTG](https://github.com/towanTG)! - Add Stellar (XLM) chain support to the widget: chain catalog entry, native asset defaults, and minimal token list. Bump @swapkit/\* dependencies to nightly builds with the Stellar toolbox and keystore signing support.

- [#187](https://github.com/swapkit/ui/pull/187) [`dab11a1`](https://github.com/swapkit/ui/commit/dab11a1fd752abd0d9a7b871639fbf2d2a9ccfa1) Thanks [@towanTG](https://github.com/towanTG)! - Add a Stellar trustline approval step to the swap widget. Swapping into a non-native Stellar asset (e.g. XLM.USDC) whose receiving account lacks the required trustline now prompts a one-time "Approve on Stellar" step (the dialog explains that the trustline locks a 0.5 XLM base reserve): `swapKit.approveAssetValue(route)` has the receiving wallet sign and broadcast the API-delivered changeTrust XDR (skipping when the trustline already exists), then the route is re-fetched and the swap continues. If the destination account doesn't exist on Stellar yet, a distinct message explains it must be created and funded (~1 XLM minimum plus 0.5 XLM per trustline) first. SDK dependencies are bumped to the releases carrying this flow (`@swapkit/core` 4.6.1, `@swapkit/helpers` 4.19.1, `@swapkit/plugins` 4.7.1, `@swapkit/toolboxes` 4.26.1, `@swapkit/wallet-keystore` 4.5.2, `@swapkit/wallets` 4.8.31), along with `@stellar/stellar-sdk` 16.1.0 — required by the new toolboxes peer range and for working Stellar support in browser bundles (v15 shipped a UMD `browser` entry whose named exports resolve to `undefined` under Vite).

### Patch Changes

- [#195](https://github.com/swapkit/ui/pull/195) [`dbe2fc1`](https://github.com/swapkit/ui/commit/dbe2fc1aeea49af19b863856e6b535d557bef5c9) Thanks [@towanTG](https://github.com/towanTG)! - Add Robinhood Chain to API_SUPPORTED_CHAINS so HOOD actually appears in the widget's chain filter and asset picker (completes the HOOD enablement from [#191](https://github.com/swapkit/ui/issues/191)).

- [#175](https://github.com/swapkit/ui/pull/175) [`15d4e04`](https://github.com/swapkit/ui/commit/15d4e04af9cce8e219abcc5c84bfcab8341fa564) Thanks [@towanTG](https://github.com/towanTG)! - Bump @swapkit/\* to nightly builds that include the Stellar swap dispatch fix (the swapkit plugin now signs and broadcasts the Stellar transaction envelope XDR returned in swap responses).

## 0.22.1

### Patch Changes

- [#164](https://github.com/swapkit/ui/pull/164) [`908717f`](https://github.com/swapkit/ui/commit/908717fa4a402dcff67984ede6e6edeca132704b) Thanks [@towanTG](https://github.com/towanTG)! - Bump @swapkit dependencies to latest published versions.

## 0.22.0

### Minor Changes

- [#153](https://github.com/swapkit/ui/pull/153) [`551165f`](https://github.com/swapkit/ui/commit/551165f01df1f034bd41117e8cd46d9063710a54) Thanks [@towanTG](https://github.com/towanTG)! - Make assets in the wallet drawer selectable as the swap input. Clicking a token row now closes the drawer and sets that asset as the widget's input asset, leaving the output unchanged. If the picked asset is the current output asset, the sides swap so the pair stays valid; the entered amount is cleared on change (matching the normal input-asset selector).

### Patch Changes

- [#154](https://github.com/swapkit/ui/pull/154) [`8f34999`](https://github.com/swapkit/ui/commit/8f349993d8225504efa3545ce15f24bd842dd860) Thanks [@towanTG](https://github.com/towanTG)! - Approval dialog now shows the token contract and the **spender** as block-explorer links (via `getExplorerAddressUrl` from `@swapkit/helpers`). The spender is the real allowance grantee, decoded from the approve calldata with `ethers` (the approval tx's `to` is the token contract, not the spender); if it can't be decoded it's hidden rather than shown as a misleading address. Both addresses are truncated, labelled, and open the explorer in a new tab. (API-2647 a/b)

- [#159](https://github.com/swapkit/ui/pull/159) [`f16e85f`](https://github.com/swapkit/ui/commit/f16e85f67279458158db53c062d786083e0470de) Thanks [@towanTG](https://github.com/towanTG)! - Bump `@swapkit/*` dependencies to latest: `core` 4.4.40, `helpers` 4.15.1, `plugins` 4.6.54, `toolboxes` 4.19.0, `wallet-keystore` 4.4.8, `wallets` 4.8.26. `wallets` 4.8.26 realigns the tree so it resolves a single `@swapkit/types@0.9.0` (previously bumping pulled a duplicate 0.8.1/0.9.0 and broke the type-check).

## 0.21.1

### Patch Changes

- [#143](https://github.com/swapkit/ui/pull/143) [`5936cea`](https://github.com/swapkit/ui/commit/5936ceabdf1dccd6ce5bbcfffc08adc67b820eea) Thanks [@towanTG](https://github.com/towanTG)! - Fix a Widget Studio crash for users whose persisted `formValues` (localStorage) predate the Local Mode field. The form default read `SKConfig.getState().localMode`, which can be `undefined` (older bundled `@swapkit/helpers`, a stale bundler dep cache, or pre-existing localStorage), leaving `localMode` undefined and throwing `Cannot read properties of undefined (reading 'enabled')` on first render. Local mode now falls back to a hardcoded default (`{ enabled: false, quoteUrl: "http://localhost:3000", swapUrl: "http://localhost:3001" }`) and is coalesced so it is never undefined downstream.

## 0.21.0

### Minor Changes

- [#141](https://github.com/swapkit/ui/pull/141) [`3bcd3f9`](https://github.com/swapkit/ui/commit/3bcd3f91889ac6e71ffe3a773a836041c0bf870e) Thanks [@towanTG](https://github.com/towanTG)! - Bump all `@swapkit/*` dependencies to latest (core 4.4.38, helpers 4.15.0, plugins 4.6.52, toolboxes 4.17.6, wallet-keystore 4.4.6, wallets 4.8.25) and add a **Local Mode** toggle to the Widget Studio's Developer settings.

  Local Mode mirrors `@swapkit/helpers`' `SKConfig.localMode`, routing quote/swap requests to locally running services (default `http://localhost:3000` / `http://localhost:3001`). The toggle is only shown when the studio itself is served from `localhost`, since it targets local-only endpoints and never ships in the embed snippet.

## 0.20.4

### Patch Changes

- [#137](https://github.com/swapkit/ui/pull/137) [`360939c`](https://github.com/swapkit/ui/commit/360939c34a123a05fcfabfd5158d59004385dd13) Thanks [@towanTG](https://github.com/towanTG)! - Route widget selected/hover/active states through the correct theme tokens so every persistent fill is configurable from the Widget Studio. Selected chain rows (popover + sheet), popular chain pills, derive-address rows, and the selected `Chip` now use `colorBgActive`; default `Button`, `Skeleton`, and provider badge use `colorSecondary` for their static surface; transient `hover:` overlays continue to use `colorBgHover`. Accent color stays as the selection affordance (border, check icon) only.

## 0.20.3

### Patch Changes

- [#134](https://github.com/swapkit/ui/pull/134) [`9482966`](https://github.com/swapkit/ui/commit/9482966faff5ef7ff6af2d75de2238ca14e0cbbe) Thanks [@towanTG](https://github.com/towanTG)! - Add configurable widget theme tokens for border radius and font family, emit the full Studio configuration through generated snippets, and document the UI package.

## 0.20.2

### Patch Changes

- [#131](https://github.com/swapkit/ui/pull/131) [`a164ef9`](https://github.com/swapkit/ui/commit/a164ef9a1d71fe43c25dfe866cd13f39345e21a6) Thanks [@towanTG](https://github.com/towanTG)! - Expose active and overlay theme controls in Widget Studio, update wallet configuration learn-more links, and bump SwapKit runtime dependencies.

## 0.20.1

### Patch Changes

- [`7238dcd`](https://github.com/swapkit/ui/commit/7238dcd1a2bf00850af2a7ad163eb125e294fb6c) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Stabilize the React widget studio wallet configuration and swap-to asset loading.

## 0.20.0

### Minor Changes

- [#123](https://github.com/swapkit/ui/pull/123) [`b6bde66`](https://github.com/swapkit/ui/commit/b6bde663d46c47f3fdfbc320222db5757beeb04d) Thanks [@towanTG](https://github.com/towanTG)! - Surface every provider in a multi-hop quote rather than just the first.

  - The collapsed quote card now face-piles the provider logos and renders the full path label (`1inch → Chainflip`, truncated to `A → … → Z` for 4+ providers) instead of only `providers[0]`.
  - The priority badge (Recommended / Cheapest / Fastest) moves to a corner ribbon on the top-right of the card and dialog rows, freeing the inline row for the path label and amount on mobile too.
  - The fee details accordion now leads with a vertical per-leg timeline (sell asset → provider → … → buy asset) for multi-hop routes; single-hop routes show the fees breakdown only, unchanged.
  - The route-select dialog mirrors the collapsed card: stacked logos, path label, corner ribbon, and the title becomes "Select route".

## 0.19.1

### Patch Changes

- [`9fd99aa`](https://github.com/swapkit/ui/commit/9fd99aad6159da2908cefbe8d530774949239bbf) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Declare SwapKit peer dependencies required by toolbox consumers and keep balance refresh available for connected zero-balance wallets.

## 0.19.0

### Minor Changes

- [#113](https://github.com/swapkit/ui/pull/113) [`417ccf7`](https://github.com/swapkit/ui/commit/417ccf72f734a22a17bffb1525311a5346121086) Thanks [@towanTG](https://github.com/towanTG)! - Wallet drawer + connect-wallet flow improvements, plus a SwapKit dependency bump.

  - **Wallet drawer grouped by wallet.** Connected chains are now grouped under a per-wallet header (avatar, name, "N chains · M tokens", total USD) that collapses/expands when more than one wallet is connected; a single wallet renders as a flat label. The Connect-wallet action is always visible, pinned above Disconnect, and uses a generic label (no input/output chain reference). Disconnect reads "Disconnect all" when multiple wallets are connected.
  - **Main swap button connect logic.** The button shows a plain "Connect wallet" while there is no wallet connected and no quote yet — clicking it opens the generic connect dialog. The chain-specific connect flow only triggers once a route exists, and the input chain (what the user pays from) is always resolved before the output chain.
  - **Dependency bump:** `@swapkit/core@4.4.31`, `@swapkit/helpers@4.13.13`, `@swapkit/plugins@4.6.45`, `@swapkit/toolboxes@4.16.2`, `@swapkit/wallet-keystore@4.3.37`, `@swapkit/wallets@4.8.22`.

## 0.18.2

### Patch Changes

- [#110](https://github.com/swapkit/ui/pull/110) [`7128a31`](https://github.com/swapkit/ui/commit/7128a31bd59a28cbdfb635ee99c4c2ef8b0cea74) Thanks [@towanTG](https://github.com/towanTG)! - Bump SwapKit packages to the latest releases, including wallets 4.8.19, and apply developer-mode chain filtering consistently in the wallet connect dialog. Ledger Litecoin is no longer hidden behind developer mode.

## 0.18.1

### Patch Changes

- [#106](https://github.com/swapkit/ui/pull/106) [`349a199`](https://github.com/swapkit/ui/commit/349a1996d13129b13aabcfa2aa477bb117095456) Thanks [@towanTG](https://github.com/towanTG)! - Bump SwapKit package dependencies to their latest patch releases (`@swapkit/core@4.4.28`, `@swapkit/helpers@4.13.11`, `@swapkit/plugins@4.6.42`, `@swapkit/toolboxes@4.15.15`, `@swapkit/wallet-keystore@4.3.34`, `@swapkit/wallets@4.8.18`).

- [#107](https://github.com/swapkit/ui/pull/107) [`67da9b1`](https://github.com/swapkit/ui/commit/67da9b1a7b47caf75601c08835cd03190142d4c1) Thanks [@towanTG](https://github.com/towanTG)! - Validate `getRouteWithTx` amount fields before calling `swap`, matching the stricter SwapKit route type required by the latest helpers/core packages.

## 0.18.0

### Minor Changes

- [#103](https://github.com/swapkit/ui/pull/103) [`0c379f9`](https://github.com/swapkit/ui/commit/0c379f942ef32a5135d233563893c49bace0dc84) Thanks [@towanTG](https://github.com/towanTG)! - **Chains configuration + redesigned wallet rows in the studio.**

  Adds a new **Chains** section to the studio's Settings tab letting integrators restrict the chain set the widget operates on. Disabling a chain hides it from the asset selector and auto-disables wallets whose required chains are all gone (Ripple → Xaman, Radix → Radix Wallet, all Cosmos chains → Keplr / Leap). The change is full-stack:

  - React widget gains a `chains` prop (`Chain[] | "all" | { include } | { exclude }`, mirroring `wallets`).
  - Web component gains `chains` / `chains-include` / `chains-exclude` attributes; the snippet generator emits them when the user picks anything other than "all".
  - `SwapKitConfigProvider` exposes `enabledChains` and `isChainAllowed`; the asset-select chain filter, popular-chain pills, asset list hook, and wallet-connect dialog all honour the gate.
  - New `lib/chain-catalog.ts` declares the 32 controllable chains, preset groupings (All / EVM only / BTC + ETH / Cosmos / UTXO), and the chain → required-wallets dependency map.

  Also redesigns the **Wallet Configuration** rows in the same tab. The single-line layout was wrapping to 5+ visual lines at the sidebar's 380px width. New row: glyph · name · status tag (Needs config / Ready / Disabled) on the title line, description + doc link on the sub-line, switch + chevron-to-configure on the right. Fields expand inline below the row instead of all at once. Sort order: needs-config → ready → disabled.

### Patch Changes

- [#98](https://github.com/swapkit/ui/pull/98) [`d4ed0e2`](https://github.com/swapkit/ui/commit/d4ed0e20b472635ea894524d61eb3364f0a87af3) Thanks [@towanTG](https://github.com/towanTG)! - Drop `React.forwardRef` across all UI primitives (accordion, button, card, checkbox, chip, dialog, form, input, label, separator, sheet, sidebar, tabs, textarea, tooltip) — React 19 accepts `ref` as a regular prop. Ref types are widened to `React.Ref<T>` so callback refs from libraries like React Hook Form still work. Behaviour is unchanged. Also drops three unused biome suppression comments and refactors `<swapkit-widget>` `getConfig` into smaller helpers to clear a cognitive-complexity warning.

## 0.17.0

### Minor Changes

- [#96](https://github.com/swapkit/ui/pull/96) [`d8bca4a`](https://github.com/swapkit/ui/commit/d8bca4acd4f32540498a31ab014cdfbb8d0d37aa) Thanks [@towanTG](https://github.com/towanTG)! - Gate KeepKey, Vultisig, and Litecoin-on-Ledger behind the dev-mode flag. In production builds they're hidden from the wallet connect dialog, the studio sidebar wallet selector, and (for LTC-on-Ledger) the chain select dialog. In dev mode they remain visible but are tagged with a "DEV" badge so the wallets repo can iterate on them through this UI.

  The dev signal is `SKConfig.envs.isDev`, which is wired to the studio's `developMode` toggle, the web component's `develop-mode` attribute, and the `__SWAPKIT_IS_DEV__` compile-time default (`SWAPKIT_USE_DEV_API=true` at build).

### Patch Changes

- [#92](https://github.com/swapkit/ui/pull/92) [`c9213b0`](https://github.com/swapkit/ui/commit/c9213b035ba0165ff2f518c12533f28eac91930f) Thanks [@towanTG](https://github.com/towanTG)! - Bump SwapKit dependencies and limit swap confirmation amounts to 10 significant digits.

- [#92](https://github.com/swapkit/ui/pull/92) [`c9213b0`](https://github.com/swapkit/ui/commit/c9213b035ba0165ff2f518c12533f28eac91930f) Thanks [@towanTG](https://github.com/towanTG)! - Remove the "Customised" / "Defaults" label from the studio sidebar footer. The Reset button's disabled state already communicates whether the config differs from defaults, so the label was redundant.

## 0.16.5

### Patch Changes

- [#88](https://github.com/swapkit/ui/pull/88) [`74cefd7`](https://github.com/swapkit/ui/commit/74cefd7a575ad97bcce020a0ec4d84f11f90dc77) Thanks [@towanTG](https://github.com/towanTG)! - Add input-chain wallet connection actions when a quote exists but the connected wallet does not cover the pay asset chain.

- [#87](https://github.com/swapkit/ui/pull/87) [`b3ce60b`](https://github.com/swapkit/ui/commit/b3ce60b61b4146f345aa0ab9cdd8c4862599cc6e) Thanks [@towanTG](https://github.com/towanTG)! - Persist tracker polling metadata with transaction history and schedule pending transaction checks with backoff, visibility gating, and a per-tick request cap.

## 0.16.4

### Patch Changes

- [#84](https://github.com/swapkit/ui/pull/84) [`d4c1c0a`](https://github.com/swapkit/ui/commit/d4c1c0ac580bfc6862638070d91ad72c98761fde) Thanks [@towanTG](https://github.com/towanTG)! - Use wallet-level UTXO xpub discovery before hardware address selection, then bind the selected derived address on final connect.

## 0.16.3

### Patch Changes

- [#81](https://github.com/swapkit/ui/pull/81) [`170f352`](https://github.com/swapkit/ui/commit/170f3528aab5ea3134a1946a8320f3b5311efbe7) Thanks [@towanTG](https://github.com/towanTG)! - Bump `@swapkit/wallets` to 4.8.12.

- [#81](https://github.com/swapkit/ui/pull/81) [`170f352`](https://github.com/swapkit/ui/commit/170f3528aab5ea3134a1946a8320f3b5311efbe7) Thanks [@towanTG](https://github.com/towanTG)! - Request the send-chain wallet connection before swap execution when a quote exists but the input chain is not connected.

## 0.16.2

### Patch Changes

- [#78](https://github.com/swapkit/ui/pull/78) [`9d6ede4`](https://github.com/swapkit/ui/commit/9d6ede4022d17da75cb64791567e280ecb191d7a) Thanks [@towanTG](https://github.com/towanTG)! - Bump `@swapkit/wallets` to 4.8.11 and keep web-component swap state local so embedded widgets do not refresh when assets change.

## 0.16.1

### Patch Changes

- [#74](https://github.com/swapkit/ui/pull/74) [`d74ed28`](https://github.com/swapkit/ui/commit/d74ed28b2ca28b3808b7a19ace338a3dd0e2cc7e) Thanks [@towanTG](https://github.com/towanTG)! - Enable the UTXO xpub address selection flow for Trezor hardware wallets.

## 0.16.0

### Minor Changes

- [#68](https://github.com/swapkit/ui/pull/68) [`d14e317`](https://github.com/swapkit/ui/commit/d14e317b0ec9a54588d066f89b21c60184ab962c) Thanks [@towanTG](https://github.com/towanTG)! - Studio sidebar — new "Wallet configuration" section under Settings.

  Lets developers persist wallet/integration credentials (`apiKeys.walletConnectProjectId`, `apiKeys.xaman`, `apiKeys.passkeys`, `apiKeys.keepKey`, plus `integrations.{coinbase, nearWalletSelector, trezor, keepKey, radix}`) directly in the studio. Persisted to localStorage alongside the rest of the form, applied to `SKConfig` immediately and on next page load so the studio's live preview reflects the values.

  Each wallet's block:

  - Header with the wallet name + "Get it →" link to where the credential is acquired (cloud.reown.com, apps.xumm.dev, console.radixdlt.com, etc.).
  - Inline `Missing` badge when an enabled wallet's required field is empty.
  - Top-of-section warning banner when any enabled wallet is missing a hard-required field.

  The configurator-side picker continues to surface the full wallet list regardless of mobile UA — only the connect dialog filters to mobile-supported wallets.

- [#68](https://github.com/swapkit/ui/pull/68) [`d14e317`](https://github.com/swapkit/ui/commit/d14e317b0ec9a54588d066f89b21c60184ab962c) Thanks [@towanTG](https://github.com/towanTG)! - Wallet config now flows from the studio into the embed snippet and the deployed `<swapkit-widget>` web component.

  **Snippet generator** — when any wallet/integration credential is set, emits a JSON `config` attribute on the `<swapkit-widget>` element next to `widget-id` / `widget-key`. The payload is the same partial `SKConfig.set` shape the studio's live preview already feeds into the SDK (apiKeys + integrations, with empty fields filtered).

  **Web component** — `config` is now an `observedAttribute`. `getConfig()` parses it as JSON; `renderWidget()` applies it via `SKConfig.set` before any wallet connect runs, so the widget's `SwapKit()` client picks up the credentials at construct time. Bad JSON is `console.warn`'d and ignored — doesn't crash the widget.

  **Wallet config blocks** in the studio sidebar now sort dynamically: blocks missing a hard-required field bubble to the top, then blocks with any required spec, then recommended-only / NEAR. Original order is the tiebreaker so the layout stays stable as users fill things in.

  **Per-wallet enable toggle** — each wallet config block has a compact switch on the right side of its header that toggles `enabledWalletOptions` in sync with the wallet picker below.

### Patch Changes

- [#70](https://github.com/swapkit/ui/pull/70) [`6c8d007`](https://github.com/swapkit/ui/commit/6c8d00724a5384bb18f48c89a40c1c4d188721e7) Thanks [@towanTG](https://github.com/towanTG)! - Fix `apiKeyInvalid` on the very first `SwapKitApi.*` request after `<SwapKitWidget>` mounts.

  `useSwapTo` is declared earlier in `<SwapKitWidget>` than the `applyAuthConfig` `useEffect`, and React fires effects in declaration order — so swap-to fired its fetch before the widget had a chance to write `widgetId/widgetKey` (or `apiKeys.swapKit`) into `SKConfig`. The helpers' `dynamicHeader` callback returned `{}`, the request shipped without auth, and the API responded `{"error":"apiKeyInvalid","message":"Invalid API key"}`.

  Apply auth synchronously during the first render via a `useRef` sentinel, before any effect runs. `SKConfig` is a zustand store — sync writes from render are safe because they don't touch React's own state graph. Subsequent prop changes are still picked up by the debounced re-apply effect.

  The web-component path (`<swapkit-widget>`) was already race-free since `renderWidget()` writes to `SKConfig` synchronously before mounting React.

- [#67](https://github.com/swapkit/ui/pull/67) [`470ffe9`](https://github.com/swapkit/ui/commit/470ffe9440c1c6fc5c14749524c26291d6f97c4c) Thanks [@towanTG](https://github.com/towanTG)! - Bump `@swapkit/wallets` to 4.8.8 — picks up upstream wallet connect fixes.

- [#63](https://github.com/swapkit/ui/pull/63) [`fdbcca6`](https://github.com/swapkit/ui/commit/fdbcca622cb9f1195184f0339d70a6e451f12bc9) Thanks [@towanTG](https://github.com/towanTG)! - `ColorPickerField` — open the native colour picker reliably on mobile.

  Tapping the colour swatch on iOS Safari (and some Android browsers) didn't open the native picker because the swatch was a `<button>` that programmatically called `.click()` on a visually hidden `<input type="color">`. iOS Safari blocks programmatic picker invocations from a separate element.

  Restructured the swatch as a `<label>` that wraps the native colour input directly, so the tap lands on the input itself and the OS picker opens as a true user gesture. Desktop behaviour unchanged.

- [#67](https://github.com/swapkit/ui/pull/67) [`470ffe9`](https://github.com/swapkit/ui/commit/470ffe9440c1c6fc5c14749524c26291d6f97c4c) Thanks [@towanTG](https://github.com/towanTG)! - Hide wallets that can't possibly work on mobile from the connect dialog.

  When the host page runs on a mobile user-agent (`iPhone | iPad | iPod | Android`), `useWalletsConfig().isWalletAllowed(...)` now returns `false` for wallet options that have no working path on mobile — hardware wallets (Ledger, Trezor, KeepKey) and desktop-only browser extensions (Bitget, Brave, CTRL, Keplr, Leap, OKX, OneKey, Radix, Talisman). They simply don't render in the connect dialog.

  Wallets with mobile in-app browsers (MetaMask, Coinbase, Phantom, TrustWallet) and chain-specific mobile apps (WalletConnect, Xaman, Coinbase Mobile, OKX Mobile, etc.) still appear — those work or fail loudly with a clear error in the connect-time path. EIP-6963 wallets remain self-pruning by design.

  The studio's wallet-selection picker is unaffected; partners configuring the widget on a phone can still toggle desktop-only wallets for their end users.

- [#68](https://github.com/swapkit/ui/pull/68) [`d14e317`](https://github.com/swapkit/ui/commit/d14e317b0ec9a54588d066f89b21c60184ab962c) Thanks [@towanTG](https://github.com/towanTG)! - `useModal` — fall back from `crypto.randomUUID()` to a non-cryptographic `Math.random` ID. The Web Crypto API's `randomUUID` is only available on secure contexts (HTTPS or localhost), so opening a modal from a LAN-IP host (e.g. `vite --host` on `http://10.x.x.x` for mobile testing) was throwing `TypeError: crypto.randomUUID is not a function`. Modal IDs are React-key only — non-cryptographic randomness is sufficient.

- [#69](https://github.com/swapkit/ui/pull/69) [`fcde026`](https://github.com/swapkit/ui/commit/fcde02652785618420211d27ad20a452ecb2973c) Thanks [@towanTG](https://github.com/towanTG)! - Fix `Cannot read properties of undefined (reading 'walletConnectProjectId')` crash on the studio when the user has localStorage from before the wallet-config section shipped.

  The hydration `useEffect` was calling `form.reset(parsed, { keepDefaultValues: true })` with a parsed blob that lacked `apiKeys` / `integrations` keys. `form.reset` doesn't merge defaults — those nested objects became `undefined`, and the apply-effect's `buildSdkConfigPatch` then dereferenced `apiKeys.walletConnectProjectId` and threw.

  Fix is in two layers:

  - **Hydration**: deep-merge persisted values with `defaultValues` so the form is always fully populated, regardless of which keys the persisted blob has.
  - **`buildSdkConfigPatch`**: accept partially-shaped inputs and read every leaf with optional chaining as belt-and-suspenders.

- [#65](https://github.com/swapkit/ui/pull/65) [`3ed8ad0`](https://github.com/swapkit/ui/commit/3ed8ad00d37ea9cba80c36f668f2fb5d85939dd8) Thanks [@towanTG](https://github.com/towanTG)! - Wallet connect — eliminate double-tap "Already processing eth_requestAccounts" failures.

  Two fixes that compose:

  - `Button` now propagates `isLoading` to the underlying button's `disabled` attribute (and sets `aria-busy`). Previously a loading state only displayed a spinner; the button stayed clickable, so a fast double-tap on mobile fired the click handler twice.
  - `connectWallet` in the SwapKit context reads live store state at the top of the callback and bails if a connect is already in flight. Defence-in-depth — even if a click slips through, the second invocation no-ops instead of triggering a second `eth_requestAccounts` (MetaMask returns `-32002 "already processing"` for that case, surfaced as "Failed to connect METAMASK").

  Also includes:

  - The route-tag pill in `SwapQuotePreview` is hidden on viewports `< 640px` so it stops crowding the timer + buy-amount on the same row. Tags still render in the route-select dialog on every viewport.
  - `vite:preloadError` listener in the playground recovers from "stale tab after deploy" errors by reloading once per session — the older `index.html` references chunk hashes the new container doesn't have.

## 0.15.1

### Patch Changes

- [#60](https://github.com/swapkit/ui/pull/60) [`34ecba8`](https://github.com/swapkit/ui/commit/34ecba8e2ae20c857a9911e735920566e611bba9) Thanks [@towanTG](https://github.com/towanTG)! - Bump `@swapkit/*` to the latest line: core 4.4.23, helpers 4.13.7, plugins 4.6.37, toolboxes 4.15.10, wallet-keystore 4.3.29, wallets 4.8.7.

## 0.15.0

### Minor Changes

- [#58](https://github.com/swapkit/ui/pull/58) [`567f5f3`](https://github.com/swapkit/ui/commit/567f5f3638b4ffb28a83d5e4552250af65e3426d) Thanks [@towanTG](https://github.com/towanTG)! - Widget Studio sidebar redesign + widget ID auth.

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

- [#52](https://github.com/swapkit/ui/pull/52) [`2c012d5`](https://github.com/swapkit/ui/commit/2c012d52ff12f1fa731687a8c2ccf2f59e904779) Thanks [@towanTG](https://github.com/towanTG)! - Preload wallet modules at widget mount and use a single SwapKit SDK instance.

  The widget previously lazy-loaded each wallet module the first time the connect dialog opened and rebuilt the SwapKit client on every connect. That meant `connect<Wallet>` methods were derived from a just-created instance while another SDK reference was still in the store, and any `SKConfig` values that toolboxes cache at construction (notably `isDev` and the API key used by the balance API) didn't reach the live SDK after a dev-mode or api-key toggle.

  The new flow:

  - At mount, the widget resolves `enabledWallets` (from the `wallets` prop or the settings localStorage override), loads all those modules in parallel, and builds one SwapKit instance with the full wallet set.
  - `walletChainsMap` is populated during that preload via each module's `directSigningSupport`, so the connect-wallet dialog no longer has to trigger `ensureWalletsLoaded` on open.
  - `connectWallet` / `connectKeystore` call `connect<Wallet>` on the existing instance — no more mid-connect rebuild, no more `setSwapKit` race.
  - Config-change effects (apiKey, widgetKey, dev mode, apiBaseUrl) rebuild via the same preload path. Wallet modules stay cached, so the rebuild is cheap.

  Also bumps `@swapkit/*` to the latest line (core 4.4.19, plugins 4.6.33, toolboxes 4.15.6, wallet-keystore 4.3.25, wallets 4.8.3). `@swapkit/toolboxes@4.15.6` switches the Near signer from a dynamic destructured `import("near-seed-phrase")` to a static namespace import, which fixes the `TypeError: y is not a function` the keystore flow hit under Vite's CJS→ESM dep pre-bundle.

### Patch Changes

- [#56](https://github.com/swapkit/ui/pull/56) [`0c85687`](https://github.com/swapkit/ui/commit/0c85687555fdbead5e6d2503458c4af126325c3a) Thanks [@towanTG](https://github.com/towanTG)! - Bump `@swapkit/*` to the latest line: core 4.4.20, plugins 4.6.34, toolboxes 4.15.7, wallet-keystore 4.3.26.

  Widen `SwapKitClient` to match the concrete client shape we build. The typed `ReturnType<typeof SwapKit>` without generics stopped being assignable from the concrete `SwapKit({ plugins, wallets })` call after core@4.4.20 (contravariant narrowing of `approveAssetValue`'s `contractAddress` and per-wallet `connect<X>` methods). We now parameterize `SwapKitClient` with the loaded plugins and a union-to-intersection merge of `SKWallets` so every `connect<X>` method surfaces on the type.

## 0.13.0

### Minor Changes

- [#46](https://github.com/swapkit/ui/pull/46) [`da2d196`](https://github.com/swapkit/ui/commit/da2d196ccec501a198ae18d2d05cb908b194e378) Thanks [@towanTG](https://github.com/towanTG)! - Only show wallet+chain combos that support direct signing. Chain lists per wallet are now derived at runtime from each wallet's `directSigningSupport` (loaded when the connect dialog opens) instead of a hardcoded `availableChainsByWallet` map, so wallets that relay via off-chain messages (e.g. WalletConnect for THORChain/Maya) no longer claim support for those chains. Wallets with no direct-signing chains are hidden entirely.

- [#46](https://github.com/swapkit/ui/pull/46) [`da2d196`](https://github.com/swapkit/ui/commit/da2d196ccec501a198ae18d2d05cb908b194e378) Thanks [@towanTG](https://github.com/towanTG)! - Add an HD address picker for hardware wallets (Ledger, KeepKey) on UTXO chains. After the user selects a single UTXO chain the widget opens a new dialog that fetches the account-level xpub once from the device, derives addresses locally via `deriveAddressesFromXpub` from `@swapkit/toolboxes/utxo`, and fetches balances in parallel. The dialog supports switching the BIP44 account index, jumping to a specific receive index, toggling change (BIP44 internal) addresses, and a Retry button that maps common device errors (disconnect, locked, app not open, busy, timeout) to plain-English guidance. On pick, the wallet is silently re-bound at the chosen derivation path so swaps and sends sign against that address. Also declares `@swapkit/toolboxes` as a direct dep so `deriveAddressesFromXpub` resolves from the 4.15.x line.

- [#46](https://github.com/swapkit/ui/pull/46) [`da2d196`](https://github.com/swapkit/ui/commit/da2d196ccec501a198ae18d2d05cb908b194e378) Thanks [@towanTG](https://github.com/towanTG)! - Connect-wallet and asset-select dialog rework.

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

- [#41](https://github.com/swapkit/ui/pull/41) [`1a1a8b5`](https://github.com/swapkit/ui/commit/1a1a8b55465561ff07ed38139c37348d54f5743c) Thanks [@towanTG](https://github.com/towanTG)! - Scope Tailwind preflight to `.swapkit-ui-preflight` so widget styles no longer bleed onto host pages, rename the last few unprefixed CSS variables (`--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-accent`, inline `--sidebar-width`) to `--sk-ui-*`, and bump `@swapkit/wallet-keystore` to `^4.3.21`.

## 0.11.1

### Patch Changes

- [#38](https://github.com/swapkit/ui/pull/38) [`346ffef`](https://github.com/swapkit/ui/commit/346ffef74bc2b46890e062be79b49986eebb0464) Thanks [@towanTG](https://github.com/towanTG)! - Bump `@swapkit/*` deps to latest: core 4.4.12, helpers 4.13.0, plugins 4.6.26, wallet-keystore 4.3.18, wallets 4.7.0.

## 0.11.0

### Minor Changes

- [`194b5b1`](https://github.com/swapkit/ui/commit/194b5b1ae5ec692076fb195bcf7f4591184ad6f3) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - - Widget now has its own isolated Sentry client (baked-in DSN) so widget errors always report to our project without colliding with host apps. New `disableTelemetry` prop as an escape hatch.

  - New keystore UI dialogs (create wallet, import phrase) and a `textarea` primitive.
  - Updated `MINIMAL_TOKENS` to use current chain identifiers (POL, XLAYER).
  - Harder failure handling: `loadStaticAssets` errors no longer loop/crash; per-route quote parsing skips malformed fees instead of throwing; widget render is gated until localStorage settings hydrate.
  - Bumped `@swapkit/*` deps.

- [#36](https://github.com/swapkit/ui/pull/36) [`1dd5cd0`](https://github.com/swapkit/ui/commit/1dd5cd0c480feb9b9b065045efa45fce53c2640a) Thanks [@towanTG](https://github.com/towanTG)! - `<SwapKitWidget />` React component now accepts an `apiKey` prop in addition to `widgetKey`, matching the web-component's `api-key` / `widget-key` attributes. `apiKey` takes precedence; setting one clears the other. Auth is cleared from `SKConfig` on unmount.

## 0.10.1

### Patch Changes

- [`bc33b52`](https://github.com/swapkit/ui/commit/bc33b527386632f65b84a2627949e2b3a2676df1) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Update core dependencies from SDK and wallets release

## 0.10.0

### Minor Changes

- [`aeb02b6`](https://github.com/swapkit/ui/commit/aeb02b625cf10259d0f87354cacdd5fe5a6317e9) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - feat: add Sentry error logging with categorized error tracking (ui, api, wallet, transaction, data)

## 0.9.0

### Minor Changes

- Migrate all dependencies from @swapkit-dev to @swapkit org
