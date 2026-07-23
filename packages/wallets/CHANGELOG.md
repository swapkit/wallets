# @swapkit-dev/wallets

## 4.8.31

### Patch Changes

- [#114](https://github.com/swapkit/wallets/pull/114) [`a5b2da2`](https://github.com/swapkit/wallets/commit/a5b2da283f8c4175258361b179734953c8400833) Thanks [@towanTG](https://github.com/towanTG)! - Update SwapKit SDK dependencies:

  - [#336](https://github.com/swapkit/sdk/pull/336) [`82ddf32`](https://github.com/swapkit/sdk/commit/82ddf329eba718c23239bdea60dc070f4c8b4b34) Thanks [@towanTG](https://github.com/towanTG)! - Upgrade `@stellar/stellar-sdk` from 15.1.0 to 16.1.0 to fix Stellar in browser bundles. v15 mapped the `browser` export condition to a minified UMD bundle, so bundlers like Vite resolved a namespace without named exports — every lazy `const { Keypair } = await import("@stellar/stellar-sdk")` yielded `undefined` in the browser. The fallout was silent: XLM keystore wallets registered with an empty address, `getBalance` failed with `toolbox_stellar_account_not_found` without a Horizon call ever firing, and transaction signing (including the trustline approval flow) was broken in web apps, while Node/Bun (and therefore all tests) resolved the `default` condition and worked. v16 ships native ESM with no `browser` condition, restoring correct named-export resolution everywhere. No SwapKit API changes. (via @swapkit/toolboxes@4.26.1)
  - Update generated token lists. (via @swapkit/toolboxes@4.26.1)
  - Update generated token lists. (via @swapkit/tokens@4.3.5)
  - Update generated token lists. (via @swapkit/helpers@4.19.1)

- Updated dependencies [[`a5b2da2`](https://github.com/swapkit/wallets/commit/a5b2da283f8c4175258361b179734953c8400833)]:
  - @swapkit/wallet-extensions@4.5.25
  - @swapkit/wallet-hardware@4.9.26

## 4.8.30

### Patch Changes

- [#112](https://github.com/swapkit/wallets/pull/112) [`e84d7bb`](https://github.com/swapkit/wallets/commit/e84d7bb684a8d3303b9793b99f2d9635d81d6927) Thanks [@towanTG](https://github.com/towanTG)! - Update SwapKit SDK dependencies:

  - [#332](https://github.com/swapkit/sdk/pull/332) [`d099d5f`](https://github.com/swapkit/sdk/commit/d099d5f95289e25a053cb0575f464c18419eebf0) Thanks [@towanTG](https://github.com/towanTG)! - `approveAssetValue` and `isAssetValueApproved` take **either the route or an explicit assetValue + spender/plugin address** — a route carries everything: the approval subject (a Stellar trustline belongs to the buy asset; an EVM allowance covers `sellAsset`/`sellAmount`), the spender (`meta.approvalAddress`), and the plugin (resolved the same way `swap()` resolves it: swapkit-routed providers and direct-signing wallets go to the swapkit plugin, everything else by the route's provider).
  - [#331](https://github.com/swapkit/sdk/pull/331) [`f740a74`](https://github.com/swapkit/sdk/commit/f740a742a0cf879b4e56bb73647d21642bc22e9d) Thanks [@towanTG](https://github.com/towanTG)! - Add client-side support for the Stellar trustline approval flow: swap response types model the `approvalTx` union (EVM | Stellar changeTrust XDR) and `nextActions`, `approveAssetValue`/`isAssetValueApproved` switch between EVM allowances and Stellar trustlines (checking via the new Stellar toolbox `hasTrustline({ address, assetValue })`, approving by signing the API-provided changeTrust XDR with the destination wallet). The swap method itself is unchanged — integrators approve first, re-fetch the route, then swap. (via @swapkit/helpers@4.19.0)
  - Update generated token lists. (via @swapkit/helpers@4.19.0)
  - [#329](https://github.com/swapkit/sdk/pull/329) [`55d9edc`](https://github.com/swapkit/sdk/commit/55d9edcc603e0139588c905e41a59eaaa3275cda) Thanks [@towanTG](https://github.com/towanTG)! - Update NEAR provider token list: add Stellar assets (XLM.XLM, XLM.USDC) and latest NEAR-intents listings (SWEAT, GMX, KAITO, AAVE, LINK, UNI, and more); remove BTC.BTC(OMNI) (via @swapkit/helpers@4.19.0)
  - [#319](https://github.com/swapkit/sdk/pull/319) [`67445d1`](https://github.com/swapkit/sdk/commit/67445d13c963492bbe4283f098b959de010ed0a7) Thanks [@towanTG](https://github.com/towanTG)! - Add Aleo chain metadata, assets, public-balance support, HD derivation, public transfers, fee estimates, broadcasting, transaction status, and keystore/server registration.
  - [#328](https://github.com/swapkit/sdk/pull/328) [`0794dd0`](https://github.com/swapkit/sdk/commit/0794dd0d92a4ab1808c42069d483b91e5ae35f4a) Thanks [@towanTG](https://github.com/towanTG)! - Aleo review follow-up: surface `splitTransactionId` in unshield failure errors so an interrupted unshield is resumable, treat a 404 on the serial-number lookup as the authoritative unspent answer across RPC failover, filter record extraction to `credits.aleo` in `getRecords`, reject toolbox params carrying both a phrase and an external signer (`toolbox_aleo_conflicting_signers`), validate `feeRecordCredits`, and throw a clear `toolbox_aleo_no_rpc_urls` error when no RPC URL is configured. (via @swapkit/toolboxes@4.25.0)
  - [#325](https://github.com/swapkit/sdk/pull/325) [`88aa0cc`](https://github.com/swapkit/sdk/commit/88aa0cc308af1010e5632a7fd9136e43ddbed6a4) Thanks [@paz-ts](https://github.com/paz-ts)! - toSignificant no longer corrupts values with long decimal parts: leading zeros are stripped as a string instead of through Number.parseInt, whose float round-trip rendered full-precision balances on 24-decimal chains like NEAR with two decimal points ("0.0003.2238") and silently lost digits past 2^53 on 18-decimal chains. (via @swapkit/toolboxes@4.25.0)
  - Update generated token lists. (via @swapkit/toolboxes@4.25.0)
  - [#306](https://github.com/swapkit/sdk/pull/306) [`be7e885`](https://github.com/swapkit/sdk/commit/be7e885d3779005b4a2e2e4d6560b2a1031994a3) Thanks [@towanTG](https://github.com/towanTG)! - Update generated token lists and preserve Maya address prefixes when signing THOR/Maya Amino messages. (via @swapkit/toolboxes@4.24.1)
  - [#324](https://github.com/swapkit/sdk/pull/324) [`9641c5d`](https://github.com/swapkit/sdk/commit/9641c5d55b12e7e7263f4ef4d1c276eff9c866a9) Thanks [@towanTG](https://github.com/towanTG)! - Sweep hardening from post-merge adversarial review: EVM sweeps fail closed when the near-final gas probe is unaffordable instead of broadcasting with an under-validated gas limit; clamped Sui sweep budgets are dry-run verified so dust wallets cannot burn their balance on an insufficient budget; native TON sweeps throw the shared sweep guard for empty wallets; NEAR token-sweep gas shortfalls use the standard sweep error key. (via @swapkit/toolboxes@4.24.1)
  - Update generated token lists. (via @swapkit/toolboxes@4.24.1)
  - [#311](https://github.com/swapkit/sdk/pull/311) [`d787a38`](https://github.com/swapkit/sdk/commit/d787a38c6c96f36afde3964957409f4b2e4356a3) Thanks [@towanTG](https://github.com/towanTG)! - Add a `sweep` flag to `createTransaction` and `transfer` across all toolboxes. For native/gas assets, sweep sends the maximum spendable amount while keeping the sender account alive (fees, reserves, rent, existential deposits, and storage stakes are reserved per chain); for tokens, sweep resolves the full token balance. Also fixes Starknet balance decoding (uint256 halves order and decimals), the shared `GenericCreateTransactionParams` Omit, and the Chainflip EIP-7702 authorization signature type. (via @swapkit/helpers@4.17.0)
  - Update generated token lists. (via @swapkit/tokens@4.3.4)
  - Update generated token lists. (via @swapkit/tokens@4.3.3)
  - Update generated token lists. (via @swapkit/tokens@4.3.2)
  - Update generated token lists. (via @swapkit/helpers@4.18.0)
  - Update generated token lists. (via @swapkit/helpers@4.17.1)

- Updated dependencies [[`e84d7bb`](https://github.com/swapkit/wallets/commit/e84d7bb684a8d3303b9793b99f2d9635d81d6927)]:
  - @swapkit/wallet-extensions@4.5.24
  - @swapkit/wallet-hardware@4.9.25

## 4.8.29

### Patch Changes

- [#109](https://github.com/swapkit/wallets/pull/109) [`8a29aa8`](https://github.com/swapkit/wallets/commit/8a29aa817cff49ac2dac73fc8af055e64b080012) Thanks [@towanTG](https://github.com/towanTG)! - Update SwapKit SDK dependencies:

  - [#317](https://github.com/swapkit/sdk/pull/317) [`41978a5`](https://github.com/swapkit/sdk/commit/41978a5601851ff5a72cb2a59495294dd04059a2) Thanks [@towanTG](https://github.com/towanTG)! - Replace dead THORChain default endpoints (thorchain.network, Nine Realms) with the official Liquify public gateway (gateway.liquify.com) for THORNode API, Tendermint RPC and Midgard (via @swapkit/helpers@4.16.2)
  - [#315](https://github.com/swapkit/sdk/pull/315) [`b42ef37`](https://github.com/swapkit/sdk/commit/b42ef37d2510ffa6ffaf5f9e36ad13fa4881bbf7) Thanks [@towanTG](https://github.com/towanTG)! - Rename Robinhood Chain string identifier from RBH to HOOD. `Chain.Robinhood` now equals `"HOOD"`, the gas asset identifier is `HOOD.ETH`, and the EVM toolbox export is `HOODToolbox` (previously `RBHToolbox`). Chain ID (4663) and all other chain config values are unchanged. Anyone consuming the short-lived `"RBH"` string or `RBHToolbox` export from 4.16.0 must switch to `"HOOD"` / `HOODToolbox`. (via @swapkit/toolboxes@4.23.0)
  - [#313](https://github.com/swapkit/sdk/pull/313) [`d800a41`](https://github.com/swapkit/sdk/commit/d800a41b60219f2e792fd9e68761b4ae87240d4c) Thanks [@towanTG](https://github.com/towanTG)! - Add support for Robinhood Chain (RBH) — an Ethereum-compatible Arbitrum Orbit L2 (chain ID 4663) with ETH as the native gas token. Includes chain config, EVM toolbox (RBHToolbox), gas asset resolution (RBH.ETH), wallet network params, and explorer URLs via Blockscout. Default RPC is the public endpoint; production apps should configure a provider endpoint (e.g. QuickNode robinhood-mainnet) via SKConfig.setRpcUrl. (via @swapkit/helpers@4.16.0)
  - [#308](https://github.com/swapkit/sdk/pull/308) [`e83807a`](https://github.com/swapkit/sdk/commit/e83807a134cd844a2d6133444112142447918bab) Thanks [@towanTG](https://github.com/towanTG)! - Handle Stellar routes in the SwapKit plugin swap dispatch: decode the base64 transaction envelope XDR from the swap response and sign-and-broadcast it via the connected wallet. (via @swapkit/plugins@4.6.58)
  - [#309](https://github.com/swapkit/sdk/pull/309) [`2cbca65`](https://github.com/swapkit/sdk/commit/2cbca65b786d9fb7e188b1fff36107887e963d3c) Thanks [@towanTG](https://github.com/towanTG)! - Return reserve-aware XLM balances, preserve Stellar issuer casing, and support USDC payments and trustline transactions. (via @swapkit/plugins@4.6.58)
  - Validate Zcash Sprout, Sapling, and unified addresses while keeping transaction creation limited to transparent addresses. (via @swapkit/toolboxes@4.20.2)
  - Validate Zcash Sprout, Sapling, and unified addresses while keeping transaction creation limited to transparent addresses.

- Updated dependencies [[`8a29aa8`](https://github.com/swapkit/wallets/commit/8a29aa817cff49ac2dac73fc8af055e64b080012)]:
  - @swapkit/wallet-extensions@4.5.23
  - @swapkit/wallet-hardware@4.9.24

## 4.8.28

### Patch Changes

- [#106](https://github.com/swapkit/wallets/pull/106) [`dbd9bd4`](https://github.com/swapkit/wallets/commit/dbd9bd48b205d06f5d679fe133d44b397d88cbe9) Thanks [@towanTG](https://github.com/towanTG)! - Update SwapKit SDK dependencies:

  - Accept base-10 and hex integer EVM-compatible transaction values, expose shared value parsing helpers, and add TRON/TON quote tx types.
  - [#294](https://github.com/swapkit/sdk/pull/294) [`01a1d86`](https://github.com/swapkit/sdk/commit/01a1d869ec879ee80f4118719d7746c1b4f8e9bf) Thanks [@ice-chillios](https://github.com/ice-chillios)! - Leaner published bundles: externalize sibling `@swapkit/*` workspace packages and enable ESM code-splitting for every package (builder change in `@swapkit/tools-builder`).
  - [#299](https://github.com/swapkit/sdk/pull/299) [`78d430d`](https://github.com/swapkit/sdk/commit/78d430df03f86dfe2cea5dd4bdc5884de5ba1529) Thanks [@towanTG](https://github.com/towanTG)! - Fail TRC-20 transaction creation when both Tron energy probes fail instead of falling back to a hardcoded 65k energy estimate. (via @swapkit/toolboxes@4.20.0)
  - Accept base-10 and hex integer EVM-compatible transaction values, expose shared value parsing helpers, and add TRON/TON quote tx types. (via @swapkit/helpers@4.15.3)

- Updated dependencies [[`dbd9bd4`](https://github.com/swapkit/wallets/commit/dbd9bd48b205d06f5d679fe133d44b397d88cbe9)]:
  - @swapkit/wallet-extensions@4.5.22
  - @swapkit/wallet-hardware@4.9.23

## 4.8.27

### Patch Changes

- Updated dependencies [[`ce62c4d`](https://github.com/swapkit/wallets/commit/ce62c4d952760117ee2fa4def058b51bf47f0ce4), [`ce62c4d`](https://github.com/swapkit/wallets/commit/ce62c4d952760117ee2fa4def058b51bf47f0ce4)]:
  - @swapkit/wallet-extensions@4.5.21
  - @swapkit/wallet-hardware@4.9.22

## 4.8.26

### Patch Changes

- [#99](https://github.com/swapkit/wallets/pull/99) [`5bdec3a`](https://github.com/swapkit/wallets/commit/5bdec3ab5f3ae14010e34c902631f952fd23e219) Thanks [@towanTG](https://github.com/towanTG)! - Update SwapKit SDK dependencies:

  - [#290](https://github.com/swapkit/sdk/pull/290) [`4e7d2d7`](https://github.com/swapkit/sdk/commit/4e7d2d72b4c1254d16a8a6084843bd49d0795b3b) Thanks [@olegpetroveth](https://github.com/olegpetroveth)! - Add TON native balance sweep. `createTransaction`/`transfer` accept a `sweep` flag that sets the `CARRY_ALL_REMAINING_BALANCE | IGNORE_ERRORS` send mode so the wallet sends its full balance minus fees. `TONTransactionMessage` gains an optional `sendMode` override (read per-transfer from the first message by `sign`/`estimateTransactionFee`). Sweep is native-only; jetton sweeps throw. (via @swapkit/toolboxes@4.19.0)
  - [#288](https://github.com/swapkit/sdk/pull/288) [`3172029`](https://github.com/swapkit/sdk/commit/3172029e6349e82b128719a640604ef89e4645ab) Thanks [@ice-chillios](https://github.com/ice-chillios)! - Add Linea (`59144`) and Plasma (`9745`) EVM chains: chain/chainId enums, chain configs, and EVM toolbox wiring. (via @swapkit/toolboxes@4.18.0)
  - [#247](https://github.com/swapkit/sdk/pull/247) [`f3888bf`](https://github.com/swapkit/sdk/commit/f3888bf4695cdef3353557f2494034acc178c67d) Thanks [@ice-chillios](https://github.com/ice-chillios)! - Bump `@aptos-labs/ts-sdk` from 1.34.0 to 7.0.1. v7 is ESM-only and requires Node 22+. Adds two `AptosConfig` parameters required by v7: `network: Network.MAINNET` (custom endpoints now require an explicit network) and `clientConfig: { http2: false }` (Bun's HTTP/2 client isn't mature; v7 warns at construction otherwise). No public API change in our usage. (via @swapkit/toolboxes@4.18.0)
  - [#287](https://github.com/swapkit/sdk/pull/287) [`19133e3`](https://github.com/swapkit/sdk/commit/19133e3c212cb0a8854698dc041b5487b9790175) Thanks [@ochhii1337](https://github.com/ochhii1337)! - Allow handling for hex strings in Tron toolbox memos (via @swapkit/toolboxes@4.18.0)
  - [#278](https://github.com/swapkit/sdk/pull/278) [`02cec19`](https://github.com/swapkit/sdk/commit/02cec190fa5688a75be4ec00d9fdf33f871a7962) Thanks [@towanTG](https://github.com/towanTG)! - Add `localMode` to SKConfig for routing quote and swap requests to locally running API services. When enabled, quote requests go to `http://localhost:3000` and swap requests to `http://localhost:3001` by default (both configurable via `quoteUrl`/`swapUrl`), while all other endpoints keep using the configured `apiUrl`. (via @swapkit/helpers@4.15.0)
  - [#277](https://github.com/swapkit/sdk/pull/277) [`731e9c1`](https://github.com/swapkit/sdk/commit/731e9c18dfa8bb9b289699a9baee8456d4e4ad30) Thanks [@GiMa-SwapKit](https://github.com/GiMa-SwapKit)! - Optimize Sui `createTransaction` by setting gas price, gas budget, and gas payment refs before building transactions, reducing internal Sui SDK RPC round trips for native and token transfers. (via @swapkit/toolboxes@4.17.6)

- Updated dependencies [[`e6522af`](https://github.com/swapkit/wallets/commit/e6522af679657a1c34878b29aa8f4cdb8dbd4e43), [`5bdec3a`](https://github.com/swapkit/wallets/commit/5bdec3ab5f3ae14010e34c902631f952fd23e219)]:
  - @swapkit/wallet-extensions@4.5.20
  - @swapkit/wallet-hardware@4.9.21

## 4.8.25

### Patch Changes

- [#91](https://github.com/swapkit/wallets/pull/91) [`833d967`](https://github.com/swapkit/wallets/commit/833d967d7b5dbd492b88e5161356132be2dbe3fd) Thanks [@towanTG](https://github.com/towanTG)! - Update SwapKit SDK dependencies:

  - [#274](https://github.com/swapkit/sdk/pull/274) [`d0a20af`](https://github.com/swapkit/sdk/commit/d0a20afe503343174c792a74f20102d9d06baa64) Thanks [@towanTG](https://github.com/towanTG)! - Ship `CHANGELOG.md` in the published package. Each package now lists `CHANGELOG.md` in its `files`, so the changelog ships in the npm tarball alongside `dist/`. Consumers (e.g. the wallets release tooling) can read the underlying SDK changes directly from `node_modules` instead of fetching them from the private GitHub repo.
  - [#272](https://github.com/swapkit/sdk/pull/272) [`5708090`](https://github.com/swapkit/sdk/commit/57080902b1a377dc5f2dd1c99101da0f5ab63de2) Thanks [@towanTG](https://github.com/towanTG)! - Prefer a user-configured TON RPC URL (via SKConfig) over the Orbs-discovered endpoint. Previously the TON toolbox always used Orbs and only fell back to the configured URL when Orbs failed, so a configured endpoint was ignored. Orbs auto-discovery remains the default when no TON RPC URL is configured (the chain-config default is empty). (via @swapkit/toolboxes@4.17.4)
  - [#269](https://github.com/swapkit/sdk/pull/269) [`d62628e`](https://github.com/swapkit/sdk/commit/d62628ec4e3791cfff7844720a87918db6494749) Thanks [@towanTG](https://github.com/towanTG)! - Resolve the Sui client RPC endpoint via getRPCUrl(Chain.Sui) so SKConfig-configured URLs are respected, instead of hardcoding the @mysten/sui public fullnode. (via @swapkit/toolboxes@4.17.3)
  - [#271](https://github.com/swapkit/sdk/pull/271) [`fe7a345`](https://github.com/swapkit/sdk/commit/fe7a3455b1e5d3123aeb59705f85f66220899960) Thanks [@towanTG](https://github.com/towanTG)! - Resolve the Sui client RPC endpoint with getRPCUrlSync (configured URL, no network health-check) instead of getRPCUrl, which could throw helpers_chain_rpc_connection_failed when the health-check failed. (via @swapkit/toolboxes@4.17.3)

- Updated dependencies [[`833d967`](https://github.com/swapkit/wallets/commit/833d967d7b5dbd492b88e5161356132be2dbe3fd)]:
  - @swapkit/wallet-extensions@4.5.19
  - @swapkit/wallet-hardware@4.9.20

## 4.8.24

### Patch Changes

- [#89](https://github.com/swapkit/wallets/pull/89) [`30cc7ff`](https://github.com/swapkit/wallets/commit/30cc7ff52de4481159be19a9b9c99d85fce24020) Thanks [@towanTG](https://github.com/towanTG)! - Bump SwapKit runtime dependencies to the latest published versions.

- Updated dependencies [[`30cc7ff`](https://github.com/swapkit/wallets/commit/30cc7ff52de4481159be19a9b9c99d85fce24020)]:
  - @swapkit/wallet-hardware@4.9.19
  - @swapkit/wallet-extensions@4.5.18

## 4.8.23

### Patch Changes

- [#82](https://github.com/swapkit/wallets/pull/82) [`198943e`](https://github.com/swapkit/wallets/commit/198943e244b02bde58d20054da710a5e4943190c) Thanks [@towanTG](https://github.com/towanTG)! - Bump SwapKit runtime dependencies to the latest published versions.

- Updated dependencies [[`198943e`](https://github.com/swapkit/wallets/commit/198943e244b02bde58d20054da710a5e4943190c)]:
  - @swapkit/wallet-hardware@4.9.18
  - @swapkit/wallet-extensions@4.5.17

## 4.8.22

### Patch Changes

- Updated dependencies [[`e02506a`](https://github.com/swapkit/wallets/commit/e02506a46f206844d307a66c20d23656f9795091)]:
  - @swapkit/wallet-hardware@4.9.17

## 4.8.21

### Patch Changes

- [`888e661`](https://github.com/swapkit/wallets/commit/888e661b9a73899bbf5e096a1664d2b7d44d8800) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Broadcast Trezor's exact serialized Zcash transfer transaction instead of reserializing through the toolbox.

- Updated dependencies [[`888e661`](https://github.com/swapkit/wallets/commit/888e661b9a73899bbf5e096a1664d2b7d44d8800)]:
  - @swapkit/wallet-hardware@4.9.16

## 4.8.20

### Patch Changes

- Updated dependencies [[`7d6830d`](https://github.com/swapkit/wallets/commit/7d6830da9f6cd9eb0fba47486d4c281e8dcefd7f)]:
  - @swapkit/wallet-hardware@4.9.15

## 4.8.19

### Patch Changes

- [#71](https://github.com/swapkit/wallets/pull/71) [`abb3269`](https://github.com/swapkit/wallets/commit/abb32696836fad55dfbf6ab067611c797add1125) Thanks [@towanTG](https://github.com/towanTG)! - Bump published SwapKit dependencies to the latest release set.

- [#73](https://github.com/swapkit/wallets/pull/73) [`f9b747b`](https://github.com/swapkit/wallets/commit/f9b747beff9aa4619c1ec01a67d3f092c0e6ccf3) Thanks [@towanTG](https://github.com/towanTG)! - Bump published SwapKit dependencies to the latest release set.

- [#73](https://github.com/swapkit/wallets/pull/73) [`f9b747b`](https://github.com/swapkit/wallets/commit/f9b747beff9aa4619c1ec01a67d3f092c0e6ccf3) Thanks [@towanTG](https://github.com/towanTG)! - Pass previous transaction refs into Trezor serialized UTXO signing and force web connect mode on localhost.

- Updated dependencies [[`abb3269`](https://github.com/swapkit/wallets/commit/abb32696836fad55dfbf6ab067611c797add1125), [`f9b747b`](https://github.com/swapkit/wallets/commit/f9b747beff9aa4619c1ec01a67d3f092c0e6ccf3), [`f9b747b`](https://github.com/swapkit/wallets/commit/f9b747beff9aa4619c1ec01a67d3f092c0e6ccf3)]:
  - @swapkit/wallet-extensions@4.5.16
  - @swapkit/wallet-hardware@4.9.14

## 4.8.18

### Patch Changes

- [`ab59810`](https://github.com/swapkit/wallets/commit/ab5981024e748822c261882b1dc5cf51e3ddf1ab) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Fix Ledger EVM approval signing by reusing the Ledger transport during signing and parsing legacy EIP-155 signature values correctly. Also refresh SwapKit package dependencies used by the wallet packages.

- Updated dependencies [[`ab59810`](https://github.com/swapkit/wallets/commit/ab5981024e748822c261882b1dc5cf51e3ddf1ab)]:
  - @swapkit/wallet-extensions@4.5.15
  - @swapkit/wallet-hardware@4.9.13

## 4.8.17

### Patch Changes

- Updated dependencies [[`0f68485`](https://github.com/swapkit/wallets/commit/0f684855cd5b75759cf073bf29414fa5755ba1fa)]:
  - @swapkit/wallet-hardware@4.9.12

## 4.8.16

### Patch Changes

- Updated dependencies [[`b9bd479`](https://github.com/swapkit/wallets/commit/b9bd4796395e5a0120e1309b67c08a68d831998e)]:
  - @swapkit/wallet-extensions@4.5.14

## 4.8.15

### Patch Changes

- [#58](https://github.com/swapkit/wallets/pull/58) [`39128e4`](https://github.com/swapkit/wallets/commit/39128e42df687b3bb1d765ae149a8297afc16a1c) Thanks [@towanTG](https://github.com/towanTG)! - Enable Trezor DASH direct signing through the serialized UTXO signing path.

- Updated dependencies [[`39128e4`](https://github.com/swapkit/wallets/commit/39128e42df687b3bb1d765ae149a8297afc16a1c)]:
  - @swapkit/wallet-hardware@4.9.11

## 4.8.14

### Patch Changes

- Updated dependencies [[`232e0c0`](https://github.com/swapkit/wallets/commit/232e0c040087f639348dc2b237f586c246f9ca78)]:
  - @swapkit/wallet-extensions@4.5.13

## 4.8.13

### Patch Changes

- [#53](https://github.com/swapkit/wallets/pull/53) [`471c5c3`](https://github.com/swapkit/wallets/commit/471c5c34fdbbce88ee12ce666456ad4c05f2cf84) Thanks [@towanTG](https://github.com/towanTG)! - Request Ledger Litecoin account xpubs with the Litecoin xpub version so hardware address derivation can decode the key correctly.

- [#53](https://github.com/swapkit/wallets/pull/53) [`471c5c3`](https://github.com/swapkit/wallets/commit/471c5c34fdbbce88ee12ce666456ad4c05f2cf84) Thanks [@towanTG](https://github.com/towanTG)! - Add UTXO transfer intent extraction for extension wallets that can only sign and broadcast high-level transfer requests, enabling Vultisig BCH/DASH/DOGE/LTC, KeepKey BEX BTC/BCH/DASH/DOGE/LTC, and CTRL BCH/DOGE/LTC direct swap submission from provided UTXO transactions.

- Updated dependencies [[`471c5c3`](https://github.com/swapkit/wallets/commit/471c5c34fdbbce88ee12ce666456ad4c05f2cf84), [`471c5c3`](https://github.com/swapkit/wallets/commit/471c5c34fdbbce88ee12ce666456ad4c05f2cf84), [`471c5c3`](https://github.com/swapkit/wallets/commit/471c5c34fdbbce88ee12ce666456ad4c05f2cf84)]:
  - @swapkit/wallet-hardware@4.9.10
  - @swapkit/wallet-extensions@4.5.12

## 4.8.12

### Patch Changes

- [#51](https://github.com/swapkit/wallets/pull/51) [`dd362ca`](https://github.com/swapkit/wallets/commit/dd362ca1c9597e39ac7ca573624f2e5cf0e3fb9c) Thanks [@towanTG](https://github.com/towanTG)! - Add CTRL THORChain and Maya sign-and-broadcast transaction support, resolve CTRL providers through both `window.ctrl` and documented `window.xfi` injections, send CTRL Bitcoin PSBT requests with the callback-compatible params shape, broadcast CTRL Bitcoin PSBTs through the extension without local finalization, and wire Ledger THORChain through the toolbox signer path.

- Updated dependencies [[`dd362ca`](https://github.com/swapkit/wallets/commit/dd362ca1c9597e39ac7ca573624f2e5cf0e3fb9c)]:
  - @swapkit/wallet-extensions@4.5.11
  - @swapkit/wallet-hardware@4.9.9

## 4.8.11

### Patch Changes

- [`ec5af35`](https://github.com/swapkit/wallets/commit/ec5af3585d793bcaa6abe61c1bf4b4d50d85953e) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Add default Trezor Connect manifest and WebUSB popup fallbacks, and fix wallet declaration builds after provider type updates.

- Updated dependencies [[`ec5af35`](https://github.com/swapkit/wallets/commit/ec5af3585d793bcaa6abe61c1bf4b4d50d85953e)]:
  - @swapkit/wallet-hardware@4.9.8
  - @swapkit/wallet-extensions@4.5.10

## 4.8.10

### Patch Changes

- Updated dependencies [[`6feb513`](https://github.com/swapkit/wallets/commit/6feb51351cc54514ba6362d790987cb3b77d0812)]:
  - @swapkit/wallet-hardware@4.9.7

## 4.8.9

### Patch Changes

- Updated dependencies [[`3c4e059`](https://github.com/swapkit/wallets/commit/3c4e05940bc735f95648e746dd706944294102b0)]:
  - @swapkit/wallet-hardware@4.9.6

## 4.8.8

### Patch Changes

- [#43](https://github.com/swapkit/wallets/pull/43) [`ccd24ef`](https://github.com/swapkit/wallets/commit/ccd24efef83af6b29f97e2cd8d39b78a24d491a0) Thanks [@towanTG](https://github.com/towanTG)! - Use workspace protocol for internal wallet package dependencies so changesets propagates version bumps from internal package releases.

## 4.8.7

### Patch Changes

- [`4499da0`](https://github.com/swapkit/wallets/commit/4499da06f6077b097e1c1d70906350ac764bfece) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - bump deps for all sk

- Updated dependencies [[`4499da0`](https://github.com/swapkit/wallets/commit/4499da06f6077b097e1c1d70906350ac764bfece)]:
  - @swapkit/wallet-extensions@4.5.8
  - @swapkit/wallet-hardware@4.9.5

## 4.8.6

### Patch Changes

- [#36](https://github.com/swapkit/wallets/pull/36) [`f2a042b`](https://github.com/swapkit/wallets/commit/f2a042b90f0c1ed41ed8ca931567fe360cb69f6e) Thanks [@ice-chillios](https://github.com/ice-chillios)! - bump deps

- Updated dependencies [[`f2a042b`](https://github.com/swapkit/wallets/commit/f2a042b90f0c1ed41ed8ca931567fe360cb69f6e)]:
  - @swapkit/wallet-extensions@4.5.7
  - @swapkit/wallet-hardware@4.9.3

## 4.8.5

### Patch Changes

- [#34](https://github.com/swapkit/wallets/pull/34) [`3104442`](https://github.com/swapkit/wallets/commit/31044425a5753c4436f806379d427d2aa3050158) Thanks [@towanTG](https://github.com/towanTG)! - Update shared `@swapkit/*` dependency ranges to the latest published versions used in this monorepo.

- Updated dependencies [[`3104442`](https://github.com/swapkit/wallets/commit/31044425a5753c4436f806379d427d2aa3050158), [`3104442`](https://github.com/swapkit/wallets/commit/31044425a5753c4436f806379d427d2aa3050158)]:
  - @swapkit/wallet-extensions@4.5.6
  - @swapkit/wallet-hardware@4.9.2

## 4.8.4

### Patch Changes

- [#31](https://github.com/swapkit/wallets/pull/31) [`ef5f220`](https://github.com/swapkit/wallets/commit/ef5f22005c99f71071205fa7b9b1820ace5a8c8c) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update core dependencies: @swapkit/core@4.4.20,@swapkit/toolboxes@4.15.7

- Updated dependencies [[`ef5f220`](https://github.com/swapkit/wallets/commit/ef5f22005c99f71071205fa7b9b1820ace5a8c8c)]:
  - @swapkit/wallet-extensions@4.5.5
  - @swapkit/wallet-hardware@4.9.1

## 4.8.3

### Patch Changes

- [#27](https://github.com/swapkit/wallets/pull/27) [`09e8bb6`](https://github.com/swapkit/wallets/commit/09e8bb63ad97f19504f4a1c19630eec4bc2f1dfe) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update core dependencies: @swapkit/core@4.4.19,@swapkit/toolboxes@4.15.6

- Updated dependencies [[`09e8bb6`](https://github.com/swapkit/wallets/commit/09e8bb63ad97f19504f4a1c19630eec4bc2f1dfe)]:
  - @swapkit/wallet-extensions@4.5.4
  - @swapkit/wallet-hardware@4.8.4

## 4.8.2

### Patch Changes

- [#25](https://github.com/swapkit/wallets/pull/25) [`81053d0`](https://github.com/swapkit/wallets/commit/81053d0a35fb9170e87bd38128f23d6a666621f6) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update core dependencies: @swapkit/core@4.4.18,@swapkit/toolboxes@4.15.5

- Updated dependencies [[`81053d0`](https://github.com/swapkit/wallets/commit/81053d0a35fb9170e87bd38128f23d6a666621f6)]:
  - @swapkit/wallet-extensions@4.5.3
  - @swapkit/wallet-hardware@4.8.3

## 4.8.1

### Patch Changes

- [`851cbdc`](https://github.com/swapkit/wallets/commit/851cbdcb15500e673c56fedacd7f473f7887b9db) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Publish TypeScript sources alongside dist output so Bun source export conditions resolve in published packages.

- Updated dependencies [[`851cbdc`](https://github.com/swapkit/wallets/commit/851cbdcb15500e673c56fedacd7f473f7887b9db)]:
  - @swapkit/wallet-extensions@4.5.2
  - @swapkit/wallet-hardware@4.8.2

## 4.8.0

### Minor Changes

- [#21](https://github.com/swapkit/wallets/pull/21) [`159098d`](https://github.com/swapkit/wallets/commit/159098d3acbf75e0739115dab7fbe0ad17b17dd2) Thanks [@towanTG](https://github.com/towanTG)! - Add account-aware UTXO HD discovery methods for hardware wallets. Ledger, Trezor, and KeepKey now expose `getExtendedPublicKeyInfo`, account-aware `deriveAddressAtIndex`, and batched `deriveAddresses`, while dependencies are bumped to the SDK versions that provide shared UTXO HD helpers.

### Patch Changes

- [#19](https://github.com/swapkit/wallets/pull/19) [`f181e26`](https://github.com/swapkit/wallets/commit/f181e26a24861d5b08284c583ab85e9fcfdd2008) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update core dependencies: @swapkit/core@4.4.13,@swapkit/toolboxes@4.15.0

- Updated dependencies [[`f181e26`](https://github.com/swapkit/wallets/commit/f181e26a24861d5b08284c583ab85e9fcfdd2008), [`159098d`](https://github.com/swapkit/wallets/commit/159098d3acbf75e0739115dab7fbe0ad17b17dd2), [`e87714a`](https://github.com/swapkit/wallets/commit/e87714a6e48aeff85674b7647b7b1a2943969b6b)]:
  - @swapkit/wallet-extensions@4.5.1
  - @swapkit/wallet-hardware@4.8.0

## 4.7.0

### Minor Changes

- [#17](https://github.com/swapkit/wallets/pull/17) [`5a5a117`](https://github.com/swapkit/wallets/commit/5a5a11738b1c8a2fd08fc571cc2156947ee05bd0) Thanks [@towanTG](https://github.com/towanTG)! - Per-wallet `directSigningSupport` mappings for the V3 swap flow

  - Bump `@swapkit/wallet-core` to `^4.2.0` and delete the duplicated local `core.ts` files in `wallets`, `wallet-extensions`, and `wallet-hardware` — every wallet module now imports `createWallet` / `getWalletSupportedChains` from `@swapkit/wallet-core` directly.
  - Stamp `directSigningSupport: Partial<Record<Chain, boolean>>` on every `createWallet({...})` call so the SDK can decide V3 routing per (wallet, chain) without consulting a central map.
  - Wire two real signers as part of the rollout:
    - **Xaman / Ripple** — `submitXamanPayload` now exposes the signed `hex` blob and accepts `{ submit: false }`; a new `ChainSigner` wraps `xumm.payload.createAndSubscribe` and is passed to `getRippleToolbox({ signer })`, unblocking V3 for XRPL.
    - **Ledger / Cosmos Hub** — pass the existing `CosmosLedger` (already an `OfflineAminoSigner`) into `getCosmosToolbox(Chain.Cosmos, { signer })`, unblocking V3 for ATOM. Bespoke `transfer` retained for back-compat.
  - BitGet Cosmos: switch `getOfflineSignerOnlyAmino` → `getOfflineSignerAuto` so V3 proto SignDocs sign natively (Ledger via BitGet still falls back to amino).
  - WalletConnect EVM: fix latent bugs flagged by the V3 audit — add Aurora and Berachain to the EVM `getToolbox` switch, register `XLAYER_MAINNET_ID` so XLayer's namespace negotiation works.

### Patch Changes

- [#11](https://github.com/swapkit/wallets/pull/11) [`67d6989`](https://github.com/swapkit/wallets/commit/67d698968b20e68b92537b56d04a415ad516b84a) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update core dependencies: @swapkit/contracts@4.1.3,@swapkit/core@4.4.11,@swapkit/helpers@4.12.9,@swapkit/tokens@4.2.5,@swapkit/toolboxes@4.14.4,@swapkit/types@0.7.3,@swapkit/utxo-signer@2.1.1

- [#18](https://github.com/swapkit/wallets/pull/18) [`b4b4666`](https://github.com/swapkit/wallets/commit/b4b4666fccee2861aa733cf589a9a50aaf4ed981) Thanks [@towanTG](https://github.com/towanTG)! - Defer EVM network switch from wallet connect to method call time. On connect we now just read the wallet's currently selected address and wire the toolbox; `prepareNetworkSwitch` handles the chain switch lazily when a transaction method is invoked. Stops the "add chain" prompt storm users saw on first connect.

  Affected: evm-extensions (Metamask / Brave / Coinbase / EIP-6963), bitget, ctrl, okx, onekey, trustwallet, vultisig, phantom, talisman, keepkey-bex, passkeys.

- Updated dependencies [[`f7f0f94`](https://github.com/swapkit/wallets/commit/f7f0f94596d77727a0b5eeff4f70264177aba1ee), [`67d6989`](https://github.com/swapkit/wallets/commit/67d698968b20e68b92537b56d04a415ad516b84a), [`9dd5073`](https://github.com/swapkit/wallets/commit/9dd50734580ba787f335c925032dad82293523a7), [`b4b4666`](https://github.com/swapkit/wallets/commit/b4b4666fccee2861aa733cf589a9a50aaf4ed981), [`5202c86`](https://github.com/swapkit/wallets/commit/5202c86388c8b371b48e09c12aa7e5b2419d8ce6), [`5a5a117`](https://github.com/swapkit/wallets/commit/5a5a11738b1c8a2fd08fc571cc2156947ee05bd0)]:
  - @swapkit/wallet-extensions@4.5.0
  - @swapkit/wallet-hardware@4.7.0

## 4.6.4

### Patch Changes

- [`13bf898`](https://github.com/swapkit/wallets/commit/13bf898e4899ddb707faf711f8b8f355daa4635c) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Pin @swapkit/\* core dependency versions via root `overrides` to prevent transitive version drift, and bump to latest: @swapkit/core@4.4.10, @swapkit/helpers@4.12.8, @swapkit/plugins@4.6.24, @swapkit/server@4.2.35, @swapkit/toolboxes@4.14.3, @swapkit/wallet-core@4.1.28, @swapkit/wallet-keystore@4.3.16

- Updated dependencies [[`13bf898`](https://github.com/swapkit/wallets/commit/13bf898e4899ddb707faf711f8b8f355daa4635c)]:
  - @swapkit/wallet-extensions@4.4.3
  - @swapkit/wallet-hardware@4.6.3

## 4.6.3

### Patch Changes

- [#3](https://github.com/swapkit/wallets/pull/3) [`b4cdf9f`](https://github.com/swapkit/wallets/commit/b4cdf9f103ed527b970f0217f0da74433afb99bf) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update core dependencies: @swapkit/core@4.4.9,@swapkit/helpers@4.12.7,@swapkit/plugins@4.6.23,@swapkit/server@4.2.34,@swapkit/toolboxes@4.14.2,@swapkit/wallet-core@4.1.27,@swapkit/wallet-keystore@4.3.15

- Updated dependencies [[`b4cdf9f`](https://github.com/swapkit/wallets/commit/b4cdf9f103ed527b970f0217f0da74433afb99bf)]:
  - @swapkit/wallet-extensions@4.4.2
  - @swapkit/wallet-hardware@4.6.2

## 4.6.2

### Patch Changes

- [`b7087d7`](https://github.com/swapkit/wallets/commit/b7087d79f8c105a163825c21a512d33cfe9049ab) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Update core dependencies from SDK release

- Updated dependencies [[`b7087d7`](https://github.com/swapkit/wallets/commit/b7087d79f8c105a163825c21a512d33cfe9049ab)]:
  - @swapkit/wallet-extensions@4.4.1
  - @swapkit/wallet-hardware@4.6.1

## 4.6.0

### Minor Changes

- Migrate all dependencies from @swapkit-dev to @swapkit org; inline wallet-core and wallet-keystore packages

### Patch Changes

- Updated dependencies []:
  - @swapkit/wallet-extensions@4.4.0
  - @swapkit/wallet-hardware@4.6.0

## 4.5.15

### Patch Changes

- Updated dependencies [[`686341c`](https://github.com/swapkit/sdk/commit/686341cc66cc09b6389d19f57787203c72566ff8)]:
  - @swapkit-dev/toolboxes@4.11.2
  - @swapkit-dev/helpers@4.11.0
  - @swapkit-dev/wallet-extensions@4.3.6
  - @swapkit-dev/wallet-hardware@4.5.6
  - @swapkit-dev/wallet-keystore@4.3.6

## 4.5.14

### Patch Changes

- Updated dependencies [[`f661bbe`](https://github.com/swapkit/sdk/commit/f661bbe11f4b4562ecebbfd1f6a024f5ecbb35ad)]:
  - @swapkit-dev/toolboxes@4.11.1
  - @swapkit-dev/helpers@4.11.0
  - @swapkit-dev/wallet-extensions@4.3.5
  - @swapkit-dev/wallet-hardware@4.5.5
  - @swapkit-dev/wallet-keystore@4.3.5

## 4.5.13

### Patch Changes

- [#139](https://github.com/swapkit/sdk/pull/139) [`de2ae45`](https://github.com/swapkit/sdk/commit/de2ae45af86d78a25c4a3132e6f452362370a910) Thanks [@towanTG](https://github.com/towanTG)! - Add TON support for Trust Wallet: create dedicated trustwallet connector handling both EVM and TON chains, update widget chain config

- Updated dependencies [[`de2ae45`](https://github.com/swapkit/sdk/commit/de2ae45af86d78a25c4a3132e6f452362370a910), [`9804504`](https://github.com/swapkit/sdk/commit/9804504d0500d2a30dcc2677dba084a8a77cbcc7), [`997361a`](https://github.com/swapkit/sdk/commit/997361a6dabb079731268785c76d92e8e022b2be), [`9804504`](https://github.com/swapkit/sdk/commit/9804504d0500d2a30dcc2677dba084a8a77cbcc7), [`9804504`](https://github.com/swapkit/sdk/commit/9804504d0500d2a30dcc2677dba084a8a77cbcc7)]:
  - @swapkit-dev/wallet-extensions@4.3.4
  - @swapkit-dev/toolboxes@4.11.0
  - @swapkit-dev/helpers@4.11.0
  - @swapkit-dev/wallet-keystore@4.3.4
  - @swapkit-dev/wallet-hardware@4.5.4
  - @swapkit-dev/wallet-core@4.1.19

## 4.5.12

### Patch Changes

- Updated dependencies [[`c2de41f`](https://github.com/swapkit/sdk/commit/c2de41f9773f0814a11d3ec0d191598b253d67da)]:
  - @swapkit-dev/toolboxes@4.10.3
  - @swapkit-dev/helpers@4.10.7
  - @swapkit-dev/wallet-extensions@4.3.3
  - @swapkit-dev/wallet-hardware@4.5.3
  - @swapkit-dev/wallet-keystore@4.3.3
  - @swapkit-dev/wallet-core@4.1.18

## 4.5.11

### Patch Changes

- Updated dependencies [[`80dd152`](https://github.com/swapkit/sdk/commit/80dd1525a812573e6bb4d2218ea3a7b3e5e9eef6)]:
  - @swapkit-dev/wallet-hardware@4.5.2
  - @swapkit-dev/helpers@4.10.6
  - @swapkit-dev/toolboxes@4.10.2
  - @swapkit-dev/wallet-core@4.1.17
  - @swapkit-dev/wallet-extensions@4.3.2
  - @swapkit-dev/wallet-keystore@4.3.2

## 4.5.10

### Patch Changes

- Updated dependencies [[`6346a4a`](https://github.com/swapkit/sdk/commit/6346a4a3c5cdde95f282b841d80d79c8eece47a8)]:
  - @swapkit-dev/helpers@4.10.5
  - @swapkit-dev/toolboxes@4.10.1
  - @swapkit-dev/wallet-core@4.1.16
  - @swapkit-dev/wallet-extensions@4.3.1
  - @swapkit-dev/wallet-hardware@4.5.1
  - @swapkit-dev/wallet-keystore@4.3.1

## 4.5.9

### Patch Changes

- [#120](https://github.com/swapkit/sdk/pull/120) [`0fd10ee`](https://github.com/swapkit/sdk/commit/0fd10eedd1c39324d4559c3e44f94ab1d55e644a) Thanks [@towanTG](https://github.com/towanTG)! - feat(utxo): replace bitcoinjs-lib with scure-btc-signer for all UTXO chains

  Introduces @swapkit-dev/utxo-signer as a standalone signing package built on @noble/hashes and @scure/btc-signer. Refactors UTXO toolbox with HD wallet derivation, RBF (replace-by-fee) support, Zcash PCZT transaction builder, improved fee estimation, and batch UTXO fetching for Dogecoin. Hardware wallets (Ledger, Trezor, KeepKey) and keystore wallet updated to use the new signer.

- Updated dependencies [[`0fd10ee`](https://github.com/swapkit/sdk/commit/0fd10eedd1c39324d4559c3e44f94ab1d55e644a)]:
  - @swapkit-dev/utxo-signer@2.1.0
  - @swapkit-dev/toolboxes@4.10.0
  - @swapkit-dev/helpers@4.10.4
  - @swapkit-dev/wallet-hardware@4.5.0
  - @swapkit-dev/wallet-keystore@4.3.0
  - @swapkit-dev/wallet-extensions@4.3.0
  - @swapkit-dev/wallet-core@4.1.15

## 4.5.8

### Patch Changes

- Updated dependencies [[`365fd35`](https://github.com/swapkit/sdk/commit/365fd35f35e9ad171509ead07c234244187e0a1c)]:
  - @swapkit-dev/toolboxes@4.9.7
  - @swapkit-dev/helpers@4.10.3
  - @swapkit-dev/wallet-extensions@4.2.18
  - @swapkit-dev/wallet-hardware@4.4.19
  - @swapkit-dev/wallet-keystore@4.2.18

## 4.5.7

### Patch Changes

- Updated dependencies [[`861ab82`](https://github.com/swapkit/sdk/commit/861ab8293b8ec9ab486ff3a9fec09dbaa89d3bae)]:
  - @swapkit-dev/wallet-hardware@4.4.18

## 4.5.6

### Patch Changes

- Updated dependencies [[`cb3f8b4`](https://github.com/swapkit/sdk/commit/cb3f8b426eda4e65513b0d1fbfc263dff961a30d)]:
  - @swapkit-dev/helpers@4.10.3
  - @swapkit-dev/toolboxes@4.9.6
  - @swapkit-dev/wallet-core@4.1.14
  - @swapkit-dev/wallet-extensions@4.2.17
  - @swapkit-dev/wallet-hardware@4.4.17
  - @swapkit-dev/wallet-keystore@4.2.17

## 4.5.5

### Patch Changes

- Updated dependencies [[`36f0c95`](https://github.com/swapkit/sdk/commit/36f0c9535bec4d608a853d5a00f178b4f4cc09f4), [`3fbec61`](https://github.com/swapkit/sdk/commit/3fbec61cf9b4a5a6b8604c6c3b94d15a3e9de0d7)]:
  - @swapkit-dev/wallet-hardware@4.4.16
  - @swapkit-dev/toolboxes@4.9.5
  - @swapkit-dev/helpers@4.10.2
  - @swapkit-dev/wallet-extensions@4.2.16
  - @swapkit-dev/wallet-keystore@4.2.16
  - @swapkit-dev/wallet-core@4.1.13

## 4.5.4

### Patch Changes

- Updated dependencies [[`d49a4f2`](https://github.com/swapkit/sdk/commit/d49a4f21cd8929212161321f3ed9956dceb8d7c1)]:
  - @swapkit-dev/helpers@4.10.1
  - @swapkit-dev/toolboxes@4.9.4
  - @swapkit-dev/wallet-core@4.1.12
  - @swapkit-dev/wallet-extensions@4.2.15
  - @swapkit-dev/wallet-hardware@4.4.15
  - @swapkit-dev/wallet-keystore@4.2.15

## 4.5.3

### Patch Changes

- Updated dependencies [[`6b26d26`](https://github.com/swapkit/sdk/commit/6b26d26ab61fa4a05021bae1055fbefca14516f2), [`2a3f741`](https://github.com/swapkit/sdk/commit/2a3f74120c83724dc61360ac3bcae848683218c1), [`6b26d26`](https://github.com/swapkit/sdk/commit/6b26d26ab61fa4a05021bae1055fbefca14516f2), [`6b26d26`](https://github.com/swapkit/sdk/commit/6b26d26ab61fa4a05021bae1055fbefca14516f2), [`39e2cff`](https://github.com/swapkit/sdk/commit/39e2cff71fd205e4840545b1f3e394ec6933b33e), [`4c85d18`](https://github.com/swapkit/sdk/commit/4c85d1813a55cc3d205f647788ed56ace6372ebd), [`f041b69`](https://github.com/swapkit/sdk/commit/f041b69431a9c891780c931e591b8691a2a85daa)]:
  - @swapkit-dev/helpers@4.10.0
  - @swapkit-dev/toolboxes@4.9.3
  - @swapkit-dev/wallet-hardware@4.4.14
  - @swapkit-dev/wallet-extensions@4.2.14
  - @swapkit-dev/wallet-core@4.1.11
  - @swapkit-dev/wallet-keystore@4.2.14

## 4.5.2

### Patch Changes

- Updated dependencies [[`61296c8`](https://github.com/swapkit/sdk/commit/61296c81f33981c96bfba590c98298ee5629a06f)]:
  - @swapkit-dev/helpers@4.9.5
  - @swapkit-dev/toolboxes@4.9.2
  - @swapkit-dev/wallet-core@4.1.10
  - @swapkit-dev/wallet-extensions@4.2.13
  - @swapkit-dev/wallet-hardware@4.4.13
  - @swapkit-dev/wallet-keystore@4.2.13

## 4.5.1

### Patch Changes

- Updated dependencies [[`01cfad6`](https://github.com/swapkit/sdk/commit/01cfad601398e39fb852f97f4fa6dbf6309bb680), [`01cfad6`](https://github.com/swapkit/sdk/commit/01cfad601398e39fb852f97f4fa6dbf6309bb680), [`01cfad6`](https://github.com/swapkit/sdk/commit/01cfad601398e39fb852f97f4fa6dbf6309bb680), [`bdd6a23`](https://github.com/swapkit/sdk/commit/bdd6a237c41cb6a14465b04c9acbc3fbe2899be4)]:
  - @swapkit-dev/helpers@4.9.4
  - @swapkit-dev/toolboxes@4.9.1
  - @swapkit-dev/wallet-core@4.1.9
  - @swapkit-dev/wallet-extensions@4.2.12
  - @swapkit-dev/wallet-hardware@4.4.12
  - @swapkit-dev/wallet-keystore@4.2.12

## 4.5.0

### Minor Changes

- [#54](https://github.com/swapkit/sdk/pull/54) [`123f2d6`](https://github.com/swapkit/sdk/commit/123f2d6454e8023d28d0d878f95c876ca5738d10) Thanks [@ice-chillios](https://github.com/ice-chillios)! - feat(ripple): add XRPL token support with trust line management

  - Add token transfer support for XRPL issued currencies
  - Add trust line management: `getTrustLines`, `hasTrustLine`, `setTrustLine`, `setTrustLineAndBroadcast`
  - Add currency encoding utilities for hex/ASCII XRPL currency codes
  - Add known tokens list with verified issuers (USDC, RLUSD, Bitstamp, GateHub, Sologenic)
  - Add Xaman wallet support for token transfers and trust line operations
  - Add new Ripple-specific error codes
  - Mark Ripple as case-sensitive chain for asset identifiers

### Patch Changes

- Updated dependencies [[`8e2587a`](https://github.com/swapkit/sdk/commit/8e2587a0bfcd41a1023fadb821903a4961d0aeef), [`1640cd7`](https://github.com/swapkit/sdk/commit/1640cd7ba5ff3397d278ce6a08f84ee98cfd356f), [`123f2d6`](https://github.com/swapkit/sdk/commit/123f2d6454e8023d28d0d878f95c876ca5738d10)]:
  - @swapkit-dev/toolboxes@4.9.0
  - @swapkit-dev/helpers@4.9.3
  - @swapkit-dev/wallet-extensions@4.2.11
  - @swapkit-dev/wallet-hardware@4.4.11
  - @swapkit-dev/wallet-keystore@4.2.11
  - @swapkit-dev/wallet-core@4.1.8

## 4.4.10

### Patch Changes

- Updated dependencies [[`4d1ea1d`](https://github.com/swapkit/sdk/commit/4d1ea1da6528da59861d5e1f7de51cad41a1f0cc)]:
  - @swapkit-dev/wallet-extensions@4.2.10
  - @swapkit-dev/wallet-hardware@4.4.10
  - @swapkit-dev/helpers@4.9.2
  - @swapkit-dev/toolboxes@4.8.1
  - @swapkit-dev/wallet-core@4.1.7
  - @swapkit-dev/wallet-keystore@4.2.10

## 4.4.9

### Patch Changes

- Updated dependencies [[`8d9fd7d`](https://github.com/swapkit/sdk/commit/8d9fd7d56dbfe57638204060d029680452e08c39)]:
  - @swapkit-dev/toolboxes@4.8.0
  - @swapkit-dev/helpers@4.9.1
  - @swapkit-dev/wallet-extensions@4.2.9
  - @swapkit-dev/wallet-hardware@4.4.9
  - @swapkit-dev/wallet-keystore@4.2.9
  - @swapkit-dev/wallet-core@4.1.6

## 4.4.8

### Patch Changes

- Updated dependencies [[`08d41d2`](https://github.com/swapkit/sdk/commit/08d41d2476c56a6f81f5ea83902e6c497278c995)]:
  - @swapkit-dev/helpers@4.9.0
  - @swapkit-dev/toolboxes@4.7.0
  - @swapkit-dev/wallet-core@4.1.5
  - @swapkit-dev/wallet-extensions@4.2.8
  - @swapkit-dev/wallet-hardware@4.4.8
  - @swapkit-dev/wallet-keystore@4.2.8

## 4.4.7

### Patch Changes

- Updated dependencies [[`e8b5bd5`](https://github.com/swapkit/sdk/commit/e8b5bd5e2cb9709265a488b2a0201077342c89b4)]:
  - @swapkit-dev/toolboxes@4.6.7
  - @swapkit-dev/helpers@4.8.4
  - @swapkit-dev/wallet-extensions@4.2.7
  - @swapkit-dev/wallet-hardware@4.4.7
  - @swapkit-dev/wallet-keystore@4.2.7

## 4.4.6

### Patch Changes

- Updated dependencies [[`f220ae3`](https://github.com/swapkit/sdk/commit/f220ae38a32408093cebddc10b68a40bd088a64e)]:
  - @swapkit-dev/toolboxes@4.6.6
  - @swapkit-dev/helpers@4.8.4
  - @swapkit-dev/wallet-extensions@4.2.6
  - @swapkit-dev/wallet-hardware@4.4.6
  - @swapkit-dev/wallet-keystore@4.2.6

## 4.4.5

### Patch Changes

- Updated dependencies [[`71d84ca`](https://github.com/swapkit/sdk/commit/71d84ca4c243cbce6617cfdea7ea2f0feb696fd7)]:
  - @swapkit-dev/toolboxes@4.6.5
  - @swapkit-dev/helpers@4.8.4
  - @swapkit-dev/wallet-extensions@4.2.5
  - @swapkit-dev/wallet-hardware@4.4.5
  - @swapkit-dev/wallet-keystore@4.2.5

## 4.4.4

### Patch Changes

- Updated dependencies [[`c11cd18`](https://github.com/swapkit/sdk/commit/c11cd18052ca4e2f8c8fe0d678378e8d880073cd), [`fd43ab5`](https://github.com/swapkit/sdk/commit/fd43ab57e16d4ebac6960afc507678d427edf278), [`5d34cc2`](https://github.com/swapkit/sdk/commit/5d34cc2feb111517058a355d5215c66658469df6)]:
  - @swapkit-dev/helpers@4.8.4
  - @swapkit-dev/toolboxes@4.6.4
  - @swapkit-dev/wallet-core@4.1.4
  - @swapkit-dev/wallet-extensions@4.2.4
  - @swapkit-dev/wallet-hardware@4.4.4
  - @swapkit-dev/wallet-keystore@4.2.4

## 4.4.3

### Patch Changes

- Updated dependencies [[`34c9a02`](https://github.com/swapkit/sdk/commit/34c9a024716424e6b1ad0afe1d13097aca8aaca3), [`c79c65a`](https://github.com/swapkit/sdk/commit/c79c65ab5aabde6219e017501e7b1e3238ea316c), [`63c9069`](https://github.com/swapkit/sdk/commit/63c9069c76004e08beb42d289ed6d046c79e4e7f)]:
  - @swapkit-dev/toolboxes@4.6.3
  - @swapkit-dev/helpers@4.8.3
  - @swapkit-dev/wallet-extensions@4.2.3
  - @swapkit-dev/wallet-hardware@4.4.3
  - @swapkit-dev/wallet-keystore@4.2.3
  - @swapkit-dev/wallet-core@4.1.3

## 4.4.2

### Patch Changes

- Updated dependencies [[`38b55e7`](https://github.com/swapkit/sdk/commit/38b55e7e1455149f932a575cac4837d2b0a144db)]:
  - @swapkit-dev/toolboxes@4.6.2
  - @swapkit-dev/helpers@4.8.2
  - @swapkit-dev/wallet-extensions@4.2.2
  - @swapkit-dev/wallet-hardware@4.4.2
  - @swapkit-dev/wallet-keystore@4.2.2
  - @swapkit-dev/wallet-core@4.1.2

## 4.4.1

### Patch Changes

- [`50c49f8`](https://github.com/swapkit/sdk/commit/50c49f88c22c149fede95b109bab1b3ea0b300c4) Thanks [@ice-chillios](https://github.com/ice-chillios)! - Bump

- Updated dependencies [[`49f58fb`](https://github.com/swapkit/sdk/commit/49f58fb78fd08c82bccae0d49d6f9eb9e9e04b2a), [`50c49f8`](https://github.com/swapkit/sdk/commit/50c49f88c22c149fede95b109bab1b3ea0b300c4)]:
  - @swapkit-dev/toolboxes@4.6.1
  - @swapkit-dev/helpers@4.8.1
  - @swapkit-dev/wallet-core@4.1.1
  - @swapkit-dev/wallet-extensions@4.2.1
  - @swapkit-dev/wallet-hardware@4.4.1
  - @swapkit-dev/wallet-keystore@4.2.1

## 4.4.0

### Minor Changes

- [`a4402e9`](https://github.com/swapkit/sdk/commit/a4402e91de5d634da24aa0c752f5e473132a4c71) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Removes async toolboxes and adapts code for it

- [#19](https://github.com/swapkit/sdk/pull/19) [`941d648`](https://github.com/swapkit/sdk/commit/941d648516ce8aca2c5e21827a27f75b34163cee) Thanks [@ice-chillios](https://github.com/ice-chillios)! - Add sync resolving for toolboxes and server sync methods

### Patch Changes

- Updated dependencies [[`a4402e9`](https://github.com/swapkit/sdk/commit/a4402e91de5d634da24aa0c752f5e473132a4c71), [`941d648`](https://github.com/swapkit/sdk/commit/941d648516ce8aca2c5e21827a27f75b34163cee)]:
  - @swapkit-dev/helpers@4.8.0
  - @swapkit-dev/toolboxes@4.6.0
  - @swapkit-dev/wallet-core@4.1.0
  - @swapkit-dev/wallet-extensions@4.2.0
  - @swapkit-dev/wallet-hardware@4.4.0
  - @swapkit-dev/wallet-keystore@4.2.0

## 4.3.15

### Patch Changes

- [#24](https://github.com/swapkit/sdk/pull/24) [`81936df`](https://github.com/swapkit/sdk/commit/81936df75586c2686ffd4b7b228f47b7461fa8d9) Thanks [@towanTG](https://github.com/towanTG)! - Validates Tron address before fetching balance

- Updated dependencies [[`148cd88`](https://github.com/swapkit/sdk/commit/148cd88c64ad573514454334e392bd7c65bb62e2), [`81936df`](https://github.com/swapkit/sdk/commit/81936df75586c2686ffd4b7b228f47b7461fa8d9)]:
  - @swapkit-dev/toolboxes@4.5.3
  - @swapkit-dev/wallet-core@4.0.57
  - @swapkit-dev/wallet-extensions@4.1.15
  - @swapkit-dev/wallet-hardware@4.3.3
  - @swapkit-dev/wallet-keystore@4.1.14

## 4.3.14

### Patch Changes

- [`799ccc8`](https://github.com/swapkit/sdk/commit/799ccc82896823a3233a48f97745b979622d5076) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Manual update to fix release

- Updated dependencies [[`799ccc8`](https://github.com/swapkit/sdk/commit/799ccc82896823a3233a48f97745b979622d5076)]:
  - @swapkit-dev/helpers@4.7.2
  - @swapkit-dev/toolboxes@4.5.2
  - @swapkit-dev/wallet-core@4.0.56
  - @swapkit-dev/wallet-extensions@4.1.14
  - @swapkit-dev/wallet-hardware@4.3.2
  - @swapkit-dev/wallet-keystore@4.1.13

## 4.3.13

### Patch Changes

- [`4d60682`](https://github.com/swapkit/sdk/commit/4d606827eda5a8e1842cad9bcf1c88ff0d6f5517) Thanks [@towanTG](https://github.com/towanTG)! - Releases latest changes from public repo - enables monad for some wallets, fixes sui tokens tx building and fixes vultisig

- Updated dependencies [[`2b554fa`](https://github.com/swapkit/sdk/commit/2b554fa2c8c2b7cf5e9c4b8c2b7570393889c443), [`4d60682`](https://github.com/swapkit/sdk/commit/4d606827eda5a8e1842cad9bcf1c88ff0d6f5517), [`2b554fa`](https://github.com/swapkit/sdk/commit/2b554fa2c8c2b7cf5e9c4b8c2b7570393889c443), [`f6d9e39`](https://github.com/swapkit/sdk/commit/f6d9e390a3dc47d777c934d891626c2e8e97e45b)]:
  - @swapkit-dev/wallet-extensions@4.1.13
  - @swapkit-dev/helpers@4.6.0
  - @swapkit-dev/toolboxes@4.5.0
  - @swapkit-dev/wallet-core@4.0.55
  - @swapkit-dev/wallet-hardware@4.3.1
  - @swapkit-dev/wallet-keystore@4.1.12
