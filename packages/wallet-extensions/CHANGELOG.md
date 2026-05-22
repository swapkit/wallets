# @swapkit-dev/wallet-extensions

## 4.5.16

### Patch Changes

- [#71](https://github.com/swapkit/wallets/pull/71) [`abb3269`](https://github.com/swapkit/wallets/commit/abb32696836fad55dfbf6ab067611c797add1125) Thanks [@towanTG](https://github.com/towanTG)! - Bump published SwapKit dependencies to the latest release set.

- [#73](https://github.com/swapkit/wallets/pull/73) [`f9b747b`](https://github.com/swapkit/wallets/commit/f9b747beff9aa4619c1ec01a67d3f092c0e6ccf3) Thanks [@towanTG](https://github.com/towanTG)! - Bump published SwapKit dependencies to the latest release set.

## 4.5.15

### Patch Changes

- [`ab59810`](https://github.com/swapkit/wallets/commit/ab5981024e748822c261882b1dc5cf51e3ddf1ab) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Fix Ledger EVM approval signing by reusing the Ledger transport during signing and parsing legacy EIP-155 signature values correctly. Also refresh SwapKit package dependencies used by the wallet packages.

## 4.5.14

### Patch Changes

- [#62](https://github.com/swapkit/wallets/pull/62) [`b9bd479`](https://github.com/swapkit/wallets/commit/b9bd4796395e5a0120e1309b67c08a68d831998e) Thanks [@towanTG](https://github.com/towanTG)! - Preserve Phantom Solana transfer memos when creating transactions.

## 4.5.13

### Patch Changes

- [#56](https://github.com/swapkit/wallets/pull/56) [`232e0c0`](https://github.com/swapkit/wallets/commit/232e0c040087f639348dc2b237f586c246f9ca78) Thanks [@towanTG](https://github.com/towanTG)! - Fix CTRL Solana connection parameters and allow multi-chain CTRL connections to continue when one optional chain provider fails.

## 4.5.12

### Patch Changes

- [#53](https://github.com/swapkit/wallets/pull/53) [`471c5c3`](https://github.com/swapkit/wallets/commit/471c5c34fdbbce88ee12ce666456ad4c05f2cf84) Thanks [@towanTG](https://github.com/towanTG)! - Add UTXO transfer intent extraction for extension wallets that can only sign and broadcast high-level transfer requests, enabling Vultisig BCH/DASH/DOGE/LTC, KeepKey BEX BTC/BCH/DASH/DOGE/LTC, and CTRL BCH/DOGE/LTC direct swap submission from provided UTXO transactions.

## 4.5.11

### Patch Changes

- [#51](https://github.com/swapkit/wallets/pull/51) [`dd362ca`](https://github.com/swapkit/wallets/commit/dd362ca1c9597e39ac7ca573624f2e5cf0e3fb9c) Thanks [@towanTG](https://github.com/towanTG)! - Add CTRL THORChain and Maya sign-and-broadcast transaction support, resolve CTRL providers through both `window.ctrl` and documented `window.xfi` injections, send CTRL Bitcoin PSBT requests with the callback-compatible params shape, broadcast CTRL Bitcoin PSBTs through the extension without local finalization, and wire Ledger THORChain through the toolbox signer path.

## 4.5.10

### Patch Changes

- [`ec5af35`](https://github.com/swapkit/wallets/commit/ec5af3585d793bcaa6abe61c1bf4b4d50d85953e) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Add default Trezor Connect manifest and WebUSB popup fallbacks, and fix wallet declaration builds after provider type updates.

## 4.5.9

### Patch Changes

- [#41](https://github.com/swapkit/wallets/pull/41) [`b9d3c09`](https://github.com/swapkit/wallets/commit/b9d3c09a926188474664bc1b59c5b753498fa03e) Thanks [@towanTG](https://github.com/towanTG)! - Avoid parallel `eth_requestAccounts` calls when connecting EVM extension wallets across multiple chains.

## 4.5.8

### Patch Changes

- [`4499da0`](https://github.com/swapkit/wallets/commit/4499da06f6077b097e1c1d70906350ac764bfece) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - bump deps for all sk

## 4.5.7

### Patch Changes

- [#36](https://github.com/swapkit/wallets/pull/36) [`f2a042b`](https://github.com/swapkit/wallets/commit/f2a042b90f0c1ed41ed8ca931567fe360cb69f6e) Thanks [@ice-chillios](https://github.com/ice-chillios)! - bump deps

## 4.5.6

### Patch Changes

- [#34](https://github.com/swapkit/wallets/pull/34) [`3104442`](https://github.com/swapkit/wallets/commit/31044425a5753c4436f806379d427d2aa3050158) Thanks [@towanTG](https://github.com/towanTG)! - Update shared `@swapkit/*` dependency ranges to the latest published versions used in this monorepo.

- [#34](https://github.com/swapkit/wallets/pull/34) [`3104442`](https://github.com/swapkit/wallets/commit/31044425a5753c4436f806379d427d2aa3050158) Thanks [@towanTG](https://github.com/towanTG)! - Add explicit exported wallet type annotations so declaration builds emit portable types instead of Bun store paths.

## 4.5.5

### Patch Changes

- [#31](https://github.com/swapkit/wallets/pull/31) [`ef5f220`](https://github.com/swapkit/wallets/commit/ef5f22005c99f71071205fa7b9b1820ace5a8c8c) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update core dependencies: @swapkit/core@4.4.20,@swapkit/toolboxes@4.15.7

## 4.5.4

### Patch Changes

- [#27](https://github.com/swapkit/wallets/pull/27) [`09e8bb6`](https://github.com/swapkit/wallets/commit/09e8bb63ad97f19504f4a1c19630eec4bc2f1dfe) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update core dependencies: @swapkit/core@4.4.19,@swapkit/toolboxes@4.15.6

## 4.5.3

### Patch Changes

- [#25](https://github.com/swapkit/wallets/pull/25) [`81053d0`](https://github.com/swapkit/wallets/commit/81053d0a35fb9170e87bd38128f23d6a666621f6) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update core dependencies: @swapkit/core@4.4.18,@swapkit/toolboxes@4.15.5

## 4.5.2

### Patch Changes

- [`851cbdc`](https://github.com/swapkit/wallets/commit/851cbdcb15500e673c56fedacd7f473f7887b9db) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Publish TypeScript sources alongside dist output so Bun source export conditions resolve in published packages.

## 4.5.1

### Patch Changes

- [#19](https://github.com/swapkit/wallets/pull/19) [`f181e26`](https://github.com/swapkit/wallets/commit/f181e26a24861d5b08284c583ab85e9fcfdd2008) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update core dependencies: @swapkit/core@4.4.13,@swapkit/toolboxes@4.15.0

## 4.5.0

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

- [#14](https://github.com/swapkit/wallets/pull/14) [`f7f0f94`](https://github.com/swapkit/wallets/commit/f7f0f94596d77727a0b5eeff4f70264177aba1ee) Thanks [@towanTG](https://github.com/towanTG)! - BitGet: drop dead `signTransaction` stub on Cosmos and stop spreading the Solana provider so toolbox synthesis of `signAndBroadcastTransaction` can use the real signer methods (V3 swap flow).

- [#11](https://github.com/swapkit/wallets/pull/11) [`67d6989`](https://github.com/swapkit/wallets/commit/67d698968b20e68b92537b56d04a415ad516b84a) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update core dependencies: @swapkit/contracts@4.1.3,@swapkit/core@4.4.11,@swapkit/helpers@4.12.9,@swapkit/tokens@4.2.5,@swapkit/toolboxes@4.14.4,@swapkit/types@0.7.3,@swapkit/utxo-signer@2.1.1

- [#12](https://github.com/swapkit/wallets/pull/12) [`9dd5073`](https://github.com/swapkit/wallets/commit/9dd50734580ba787f335c925032dad82293523a7) Thanks [@towanTG](https://github.com/towanTG)! - CTRL: sign Bitcoin transactions via sats-connect `sign_psbt`, enabling V3 raw-transaction swap flow. BCH/DOGE/LTC continue to use the bespoke `walletTransfer` path.

- [#18](https://github.com/swapkit/wallets/pull/18) [`b4b4666`](https://github.com/swapkit/wallets/commit/b4b4666fccee2861aa733cf589a9a50aaf4ed981) Thanks [@towanTG](https://github.com/towanTG)! - Defer EVM network switch from wallet connect to method call time. On connect we now just read the wallet's currently selected address and wire the toolbox; `prepareNetworkSwitch` handles the chain switch lazily when a transaction method is invoked. Stops the "add chain" prompt storm users saw on first connect.

  Affected: evm-extensions (Metamask / Brave / Coinbase / EIP-6963), bitget, ctrl, okx, onekey, trustwallet, vultisig, phantom, talisman, keepkey-bex, passkeys.

- [#13](https://github.com/swapkit/wallets/pull/13) [`5202c86`](https://github.com/swapkit/wallets/commit/5202c86388c8b371b48e09c12aa7e5b2419d8ce6) Thanks [@towanTG](https://github.com/towanTG)! - OKX: pass the Keplr-compatible offline signer into `getCosmosToolbox` so the toolbox can synthesize `signAndBroadcastTransaction`, unblocking the V3 SwapKit swap flow for OKX Cosmos.

## 4.4.3

### Patch Changes

- [`13bf898`](https://github.com/swapkit/wallets/commit/13bf898e4899ddb707faf711f8b8f355daa4635c) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Pin @swapkit/\* core dependency versions via root `overrides` to prevent transitive version drift, and bump to latest: @swapkit/core@4.4.10, @swapkit/helpers@4.12.8, @swapkit/plugins@4.6.24, @swapkit/server@4.2.35, @swapkit/toolboxes@4.14.3, @swapkit/wallet-core@4.1.28, @swapkit/wallet-keystore@4.3.16

## 4.4.2

### Patch Changes

- [#3](https://github.com/swapkit/wallets/pull/3) [`b4cdf9f`](https://github.com/swapkit/wallets/commit/b4cdf9f103ed527b970f0217f0da74433afb99bf) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update core dependencies: @swapkit/core@4.4.9,@swapkit/helpers@4.12.7,@swapkit/plugins@4.6.23,@swapkit/server@4.2.34,@swapkit/toolboxes@4.14.2,@swapkit/wallet-core@4.1.27,@swapkit/wallet-keystore@4.3.15

## 4.4.1

### Patch Changes

- [`b7087d7`](https://github.com/swapkit/wallets/commit/b7087d79f8c105a163825c21a512d33cfe9049ab) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Update core dependencies from SDK release

## 4.4.0

### Minor Changes

- Migrate all dependencies from @swapkit-dev to @swapkit org; inline wallet-core and wallet-keystore packages

## 4.3.6

### Patch Changes

- Updated dependencies [[`686341c`](https://github.com/swapkit/sdk/commit/686341cc66cc09b6389d19f57787203c72566ff8)]:
  - @swapkit-dev/toolboxes@4.11.2
  - @swapkit-dev/helpers@4.11.0

## 4.3.5

### Patch Changes

- Updated dependencies [[`f661bbe`](https://github.com/swapkit/sdk/commit/f661bbe11f4b4562ecebbfd1f6a024f5ecbb35ad)]:
  - @swapkit-dev/toolboxes@4.11.1
  - @swapkit-dev/helpers@4.11.0

## 4.3.4

### Patch Changes

- [#139](https://github.com/swapkit/sdk/pull/139) [`de2ae45`](https://github.com/swapkit/sdk/commit/de2ae45af86d78a25c4a3132e6f452362370a910) Thanks [@towanTG](https://github.com/towanTG)! - Add TON support for Trust Wallet: create dedicated trustwallet connector handling both EVM and TON chains, update widget chain config

- Updated dependencies [[`9804504`](https://github.com/swapkit/sdk/commit/9804504d0500d2a30dcc2677dba084a8a77cbcc7), [`997361a`](https://github.com/swapkit/sdk/commit/997361a6dabb079731268785c76d92e8e022b2be), [`9804504`](https://github.com/swapkit/sdk/commit/9804504d0500d2a30dcc2677dba084a8a77cbcc7)]:
  - @swapkit-dev/toolboxes@4.11.0
  - @swapkit-dev/helpers@4.11.0
  - @swapkit-dev/wallet-core@4.1.19

## 4.3.3

### Patch Changes

- Updated dependencies [[`c2de41f`](https://github.com/swapkit/sdk/commit/c2de41f9773f0814a11d3ec0d191598b253d67da)]:
  - @swapkit-dev/toolboxes@4.10.3
  - @swapkit-dev/helpers@4.10.7
  - @swapkit-dev/wallet-core@4.1.18

## 4.3.2

### Patch Changes

- Updated dependencies []:
  - @swapkit-dev/helpers@4.10.6
  - @swapkit-dev/toolboxes@4.10.2
  - @swapkit-dev/wallet-core@4.1.17

## 4.3.1

### Patch Changes

- Updated dependencies [[`6346a4a`](https://github.com/swapkit/sdk/commit/6346a4a3c5cdde95f282b841d80d79c8eece47a8)]:
  - @swapkit-dev/helpers@4.10.5
  - @swapkit-dev/toolboxes@4.10.1
  - @swapkit-dev/wallet-core@4.1.16

## 4.3.0

### Minor Changes

- [#120](https://github.com/swapkit/sdk/pull/120) [`0fd10ee`](https://github.com/swapkit/sdk/commit/0fd10eedd1c39324d4559c3e44f94ab1d55e644a) Thanks [@towanTG](https://github.com/towanTG)! - feat(utxo): replace bitcoinjs-lib with scure-btc-signer for all UTXO chains

  Introduces @swapkit-dev/utxo-signer as a standalone signing package built on @noble/hashes and @scure/btc-signer. Refactors UTXO toolbox with HD wallet derivation, RBF (replace-by-fee) support, Zcash PCZT transaction builder, improved fee estimation, and batch UTXO fetching for Dogecoin. Hardware wallets (Ledger, Trezor, KeepKey) and keystore wallet updated to use the new signer.

### Patch Changes

- Updated dependencies [[`0fd10ee`](https://github.com/swapkit/sdk/commit/0fd10eedd1c39324d4559c3e44f94ab1d55e644a)]:
  - @swapkit-dev/utxo-signer@2.1.0
  - @swapkit-dev/toolboxes@4.10.0
  - @swapkit-dev/helpers@4.10.4
  - @swapkit-dev/wallet-core@4.1.15

## 4.2.18

### Patch Changes

- Updated dependencies [[`365fd35`](https://github.com/swapkit/sdk/commit/365fd35f35e9ad171509ead07c234244187e0a1c)]:
  - @swapkit-dev/toolboxes@4.9.7
  - @swapkit-dev/helpers@4.10.3

## 4.2.17

### Patch Changes

- Updated dependencies [[`cb3f8b4`](https://github.com/swapkit/sdk/commit/cb3f8b426eda4e65513b0d1fbfc263dff961a30d)]:
  - @swapkit-dev/helpers@4.10.3
  - @swapkit-dev/toolboxes@4.9.6
  - @swapkit-dev/wallet-core@4.1.14

## 4.2.16

### Patch Changes

- Updated dependencies [[`36f0c95`](https://github.com/swapkit/sdk/commit/36f0c9535bec4d608a853d5a00f178b4f4cc09f4), [`3fbec61`](https://github.com/swapkit/sdk/commit/3fbec61cf9b4a5a6b8604c6c3b94d15a3e9de0d7)]:
  - @swapkit-dev/toolboxes@4.9.5
  - @swapkit-dev/helpers@4.10.2
  - @swapkit-dev/wallet-core@4.1.13

## 4.2.15

### Patch Changes

- Updated dependencies [[`d49a4f2`](https://github.com/swapkit/sdk/commit/d49a4f21cd8929212161321f3ed9956dceb8d7c1)]:
  - @swapkit-dev/helpers@4.10.1
  - @swapkit-dev/toolboxes@4.9.4
  - @swapkit-dev/wallet-core@4.1.12

## 4.2.14

### Patch Changes

- [#91](https://github.com/swapkit/sdk/pull/91) [`4c85d18`](https://github.com/swapkit/sdk/commit/4c85d1813a55cc3d205f647788ed56ace6372ebd) Thanks [@0xepicode](https://github.com/0xepicode)! - Fix Phantom BTC signing bug where Psbt class from dynamic import was captured in closure and became undefined by the time signTransaction was called. Now imports Psbt inside the signTransaction function to ensure it's available.

- Updated dependencies [[`6b26d26`](https://github.com/swapkit/sdk/commit/6b26d26ab61fa4a05021bae1055fbefca14516f2), [`2a3f741`](https://github.com/swapkit/sdk/commit/2a3f74120c83724dc61360ac3bcae848683218c1), [`6b26d26`](https://github.com/swapkit/sdk/commit/6b26d26ab61fa4a05021bae1055fbefca14516f2), [`6b26d26`](https://github.com/swapkit/sdk/commit/6b26d26ab61fa4a05021bae1055fbefca14516f2), [`f041b69`](https://github.com/swapkit/sdk/commit/f041b69431a9c891780c931e591b8691a2a85daa)]:
  - @swapkit-dev/helpers@4.10.0
  - @swapkit-dev/toolboxes@4.9.3
  - @swapkit-dev/wallet-core@4.1.11

## 4.2.13

### Patch Changes

- Updated dependencies [[`61296c8`](https://github.com/swapkit/sdk/commit/61296c81f33981c96bfba590c98298ee5629a06f)]:
  - @swapkit-dev/helpers@4.9.5
  - @swapkit-dev/toolboxes@4.9.2
  - @swapkit-dev/wallet-core@4.1.10

## 4.2.12

### Patch Changes

- Updated dependencies [[`01cfad6`](https://github.com/swapkit/sdk/commit/01cfad601398e39fb852f97f4fa6dbf6309bb680), [`01cfad6`](https://github.com/swapkit/sdk/commit/01cfad601398e39fb852f97f4fa6dbf6309bb680), [`01cfad6`](https://github.com/swapkit/sdk/commit/01cfad601398e39fb852f97f4fa6dbf6309bb680), [`bdd6a23`](https://github.com/swapkit/sdk/commit/bdd6a237c41cb6a14465b04c9acbc3fbe2899be4)]:
  - @swapkit-dev/helpers@4.9.4
  - @swapkit-dev/toolboxes@4.9.1
  - @swapkit-dev/wallet-core@4.1.9

## 4.2.11

### Patch Changes

- Updated dependencies [[`8e2587a`](https://github.com/swapkit/sdk/commit/8e2587a0bfcd41a1023fadb821903a4961d0aeef), [`1640cd7`](https://github.com/swapkit/sdk/commit/1640cd7ba5ff3397d278ce6a08f84ee98cfd356f), [`123f2d6`](https://github.com/swapkit/sdk/commit/123f2d6454e8023d28d0d878f95c876ca5738d10)]:
  - @swapkit-dev/toolboxes@4.9.0
  - @swapkit-dev/helpers@4.9.3
  - @swapkit-dev/wallet-core@4.1.8

## 4.2.10

### Patch Changes

- [#61](https://github.com/swapkit/sdk/pull/61) [`4d1ea1d`](https://github.com/swapkit/sdk/commit/4d1ea1da6528da59861d5e1f7de51cad41a1f0cc) Thanks [@0xepicode](https://github.com/0xepicode)! - Update Bera and Gnosis supported wallets

- Updated dependencies []:
  - @swapkit-dev/helpers@4.9.2
  - @swapkit-dev/toolboxes@4.8.1
  - @swapkit-dev/wallet-core@4.1.7

## 4.2.9

### Patch Changes

- Updated dependencies [[`8d9fd7d`](https://github.com/swapkit/sdk/commit/8d9fd7d56dbfe57638204060d029680452e08c39)]:
  - @swapkit-dev/toolboxes@4.8.0
  - @swapkit-dev/helpers@4.9.1
  - @swapkit-dev/wallet-core@4.1.6

## 4.2.8

### Patch Changes

- Updated dependencies [[`08d41d2`](https://github.com/swapkit/sdk/commit/08d41d2476c56a6f81f5ea83902e6c497278c995)]:
  - @swapkit-dev/helpers@4.9.0
  - @swapkit-dev/toolboxes@4.7.0
  - @swapkit-dev/wallet-core@4.1.5

## 4.2.7

### Patch Changes

- Updated dependencies [[`e8b5bd5`](https://github.com/swapkit/sdk/commit/e8b5bd5e2cb9709265a488b2a0201077342c89b4)]:
  - @swapkit-dev/toolboxes@4.6.7
  - @swapkit-dev/helpers@4.8.4

## 4.2.6

### Patch Changes

- Updated dependencies [[`f220ae3`](https://github.com/swapkit/sdk/commit/f220ae38a32408093cebddc10b68a40bd088a64e)]:
  - @swapkit-dev/toolboxes@4.6.6
  - @swapkit-dev/helpers@4.8.4

## 4.2.5

### Patch Changes

- Updated dependencies [[`71d84ca`](https://github.com/swapkit/sdk/commit/71d84ca4c243cbce6617cfdea7ea2f0feb696fd7)]:
  - @swapkit-dev/toolboxes@4.6.5
  - @swapkit-dev/helpers@4.8.4

## 4.2.4

### Patch Changes

- Updated dependencies [[`c11cd18`](https://github.com/swapkit/sdk/commit/c11cd18052ca4e2f8c8fe0d678378e8d880073cd), [`fd43ab5`](https://github.com/swapkit/sdk/commit/fd43ab57e16d4ebac6960afc507678d427edf278), [`5d34cc2`](https://github.com/swapkit/sdk/commit/5d34cc2feb111517058a355d5215c66658469df6)]:
  - @swapkit-dev/helpers@4.8.4
  - @swapkit-dev/toolboxes@4.6.4
  - @swapkit-dev/wallet-core@4.1.4

## 4.2.3

### Patch Changes

- Updated dependencies [[`34c9a02`](https://github.com/swapkit/sdk/commit/34c9a024716424e6b1ad0afe1d13097aca8aaca3), [`c79c65a`](https://github.com/swapkit/sdk/commit/c79c65ab5aabde6219e017501e7b1e3238ea316c), [`63c9069`](https://github.com/swapkit/sdk/commit/63c9069c76004e08beb42d289ed6d046c79e4e7f)]:
  - @swapkit-dev/toolboxes@4.6.3
  - @swapkit-dev/helpers@4.8.3
  - @swapkit-dev/wallet-core@4.1.3

## 4.2.2

### Patch Changes

- Updated dependencies [[`38b55e7`](https://github.com/swapkit/sdk/commit/38b55e7e1455149f932a575cac4837d2b0a144db)]:
  - @swapkit-dev/toolboxes@4.6.2
  - @swapkit-dev/helpers@4.8.2
  - @swapkit-dev/wallet-core@4.1.2

## 4.2.1

### Patch Changes

- [`50c49f8`](https://github.com/swapkit/sdk/commit/50c49f88c22c149fede95b109bab1b3ea0b300c4) Thanks [@ice-chillios](https://github.com/ice-chillios)! - Bump

- Updated dependencies [[`49f58fb`](https://github.com/swapkit/sdk/commit/49f58fb78fd08c82bccae0d49d6f9eb9e9e04b2a), [`50c49f8`](https://github.com/swapkit/sdk/commit/50c49f88c22c149fede95b109bab1b3ea0b300c4)]:
  - @swapkit-dev/toolboxes@4.6.1
  - @swapkit-dev/helpers@4.8.1
  - @swapkit-dev/wallet-core@4.1.1

## 4.2.0

### Minor Changes

- [`a4402e9`](https://github.com/swapkit/sdk/commit/a4402e91de5d634da24aa0c752f5e473132a4c71) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Removes async toolboxes and adapts code for it

- [#19](https://github.com/swapkit/sdk/pull/19) [`941d648`](https://github.com/swapkit/sdk/commit/941d648516ce8aca2c5e21827a27f75b34163cee) Thanks [@ice-chillios](https://github.com/ice-chillios)! - Add sync resolving for toolboxes and server sync methods

### Patch Changes

- Updated dependencies [[`a4402e9`](https://github.com/swapkit/sdk/commit/a4402e91de5d634da24aa0c752f5e473132a4c71), [`941d648`](https://github.com/swapkit/sdk/commit/941d648516ce8aca2c5e21827a27f75b34163cee)]:
  - @swapkit-dev/helpers@4.8.0
  - @swapkit-dev/toolboxes@4.6.0
  - @swapkit-dev/wallet-core@4.1.0

## 4.1.15

### Patch Changes

- [#24](https://github.com/swapkit/sdk/pull/24) [`81936df`](https://github.com/swapkit/sdk/commit/81936df75586c2686ffd4b7b228f47b7461fa8d9) Thanks [@towanTG](https://github.com/towanTG)! - Validates Tron address before fetching balance

- Updated dependencies [[`148cd88`](https://github.com/swapkit/sdk/commit/148cd88c64ad573514454334e392bd7c65bb62e2), [`81936df`](https://github.com/swapkit/sdk/commit/81936df75586c2686ffd4b7b228f47b7461fa8d9)]:
  - @swapkit-dev/toolboxes@4.5.3
  - @swapkit-dev/wallet-core@4.0.57

## 4.1.14

### Patch Changes

- [`799ccc8`](https://github.com/swapkit/sdk/commit/799ccc82896823a3233a48f97745b979622d5076) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Manual update to fix release

- Updated dependencies [[`799ccc8`](https://github.com/swapkit/sdk/commit/799ccc82896823a3233a48f97745b979622d5076)]:
  - @swapkit-dev/helpers@4.7.2
  - @swapkit-dev/toolboxes@4.5.2
  - @swapkit-dev/wallet-core@4.0.56

## 4.1.13

### Patch Changes

- [#7](https://github.com/swapkit/sdk/pull/7) [`2b554fa`](https://github.com/swapkit/sdk/commit/2b554fa2c8c2b7cf5e9c4b8c2b7570393889c443) Thanks [@towanTG](https://github.com/towanTG)! - fix atom not connecting via vultisig due to empty address

- [`4d60682`](https://github.com/swapkit/sdk/commit/4d606827eda5a8e1842cad9bcf1c88ff0d6f5517) Thanks [@towanTG](https://github.com/towanTG)! - Releases latest changes from public repo - enables monad for some wallets, fixes sui tokens tx building and fixes vultisig

- [#7](https://github.com/swapkit/sdk/pull/7) [`2b554fa`](https://github.com/swapkit/sdk/commit/2b554fa2c8c2b7cf5e9c4b8c2b7570393889c443) Thanks [@towanTG](https://github.com/towanTG)! - Fix connecting bitget and okx wallets to monad

- Updated dependencies [[`4d60682`](https://github.com/swapkit/sdk/commit/4d606827eda5a8e1842cad9bcf1c88ff0d6f5517), [`f6d9e39`](https://github.com/swapkit/sdk/commit/f6d9e390a3dc47d777c934d891626c2e8e97e45b)]:
  - @swapkit-dev/helpers@4.6.0
  - @swapkit-dev/toolboxes@4.5.0
  - @swapkit-dev/wallet-core@4.0.55
