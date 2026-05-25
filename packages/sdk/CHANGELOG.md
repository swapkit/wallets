# @swapkit/sdk

## 4.6.26

### Patch Changes

- Updated dependencies []:
  - @swapkit/wallets@4.8.20

## 4.6.25

### Patch Changes

- [#71](https://github.com/swapkit/wallets/pull/71) [`abb3269`](https://github.com/swapkit/wallets/commit/abb32696836fad55dfbf6ab067611c797add1125) Thanks [@towanTG](https://github.com/towanTG)! - Bump published SwapKit dependencies to the latest release set.

- [#73](https://github.com/swapkit/wallets/pull/73) [`f9b747b`](https://github.com/swapkit/wallets/commit/f9b747beff9aa4619c1ec01a67d3f092c0e6ccf3) Thanks [@towanTG](https://github.com/towanTG)! - Bump published SwapKit dependencies to the latest release set.

- [#73](https://github.com/swapkit/wallets/pull/73) [`f9b747b`](https://github.com/swapkit/wallets/commit/f9b747beff9aa4619c1ec01a67d3f092c0e6ccf3) Thanks [@towanTG](https://github.com/towanTG)! - Pass previous transaction refs into Trezor serialized UTXO signing and force web connect mode on localhost.

- Updated dependencies [[`abb3269`](https://github.com/swapkit/wallets/commit/abb32696836fad55dfbf6ab067611c797add1125), [`f9b747b`](https://github.com/swapkit/wallets/commit/f9b747beff9aa4619c1ec01a67d3f092c0e6ccf3), [`f9b747b`](https://github.com/swapkit/wallets/commit/f9b747beff9aa4619c1ec01a67d3f092c0e6ccf3)]:
  - @swapkit/wallets@4.8.19

## 4.6.24

### Patch Changes

- [`ab59810`](https://github.com/swapkit/wallets/commit/ab5981024e748822c261882b1dc5cf51e3ddf1ab) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Fix Ledger EVM approval signing by reusing the Ledger transport during signing and parsing legacy EIP-155 signature values correctly. Also refresh SwapKit package dependencies used by the wallet packages.

- Updated dependencies [[`ab59810`](https://github.com/swapkit/wallets/commit/ab5981024e748822c261882b1dc5cf51e3ddf1ab)]:
  - @swapkit/wallets@4.8.18

## 4.6.23

### Patch Changes

- Updated dependencies []:
  - @swapkit/wallets@4.8.17

## 4.6.22

### Patch Changes

- Updated dependencies []:
  - @swapkit/wallets@4.8.16

## 4.6.21

### Patch Changes

- [#58](https://github.com/swapkit/wallets/pull/58) [`39128e4`](https://github.com/swapkit/wallets/commit/39128e42df687b3bb1d765ae149a8297afc16a1c) Thanks [@towanTG](https://github.com/towanTG)! - Enable Trezor DASH direct signing through the serialized UTXO signing path.

- Updated dependencies [[`39128e4`](https://github.com/swapkit/wallets/commit/39128e42df687b3bb1d765ae149a8297afc16a1c)]:
  - @swapkit/wallets@4.8.15

## 4.6.20

### Patch Changes

- Updated dependencies []:
  - @swapkit/wallets@4.8.14

## 4.6.19

### Patch Changes

- [#53](https://github.com/swapkit/wallets/pull/53) [`471c5c3`](https://github.com/swapkit/wallets/commit/471c5c34fdbbce88ee12ce666456ad4c05f2cf84) Thanks [@towanTG](https://github.com/towanTG)! - Request Ledger Litecoin account xpubs with the Litecoin xpub version so hardware address derivation can decode the key correctly.

- [#53](https://github.com/swapkit/wallets/pull/53) [`471c5c3`](https://github.com/swapkit/wallets/commit/471c5c34fdbbce88ee12ce666456ad4c05f2cf84) Thanks [@towanTG](https://github.com/towanTG)! - Add UTXO transfer intent extraction for extension wallets that can only sign and broadcast high-level transfer requests, enabling Vultisig BCH/DASH/DOGE/LTC, KeepKey BEX BTC/BCH/DASH/DOGE/LTC, and CTRL BCH/DOGE/LTC direct swap submission from provided UTXO transactions.

- Updated dependencies [[`471c5c3`](https://github.com/swapkit/wallets/commit/471c5c34fdbbce88ee12ce666456ad4c05f2cf84), [`471c5c3`](https://github.com/swapkit/wallets/commit/471c5c34fdbbce88ee12ce666456ad4c05f2cf84)]:
  - @swapkit/wallets@4.8.13

## 4.6.18

### Patch Changes

- [#51](https://github.com/swapkit/wallets/pull/51) [`dd362ca`](https://github.com/swapkit/wallets/commit/dd362ca1c9597e39ac7ca573624f2e5cf0e3fb9c) Thanks [@towanTG](https://github.com/towanTG)! - Add CTRL THORChain and Maya sign-and-broadcast transaction support, resolve CTRL providers through both `window.ctrl` and documented `window.xfi` injections, send CTRL Bitcoin PSBT requests with the callback-compatible params shape, broadcast CTRL Bitcoin PSBTs through the extension without local finalization, and wire Ledger THORChain through the toolbox signer path.

- Updated dependencies [[`dd362ca`](https://github.com/swapkit/wallets/commit/dd362ca1c9597e39ac7ca573624f2e5cf0e3fb9c)]:
  - @swapkit/wallets@4.8.12

## 4.6.17

### Patch Changes

- [`ec5af35`](https://github.com/swapkit/wallets/commit/ec5af3585d793bcaa6abe61c1bf4b4d50d85953e) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Add default Trezor Connect manifest and WebUSB popup fallbacks, and fix wallet declaration builds after provider type updates.

- Updated dependencies [[`ec5af35`](https://github.com/swapkit/wallets/commit/ec5af3585d793bcaa6abe61c1bf4b4d50d85953e)]:
  - @swapkit/wallets@4.8.11

## 4.6.16

### Patch Changes

- Updated dependencies []:
  - @swapkit/wallets@4.8.10

## 4.6.15

### Patch Changes

- Updated dependencies []:
  - @swapkit/wallets@4.8.9

## 4.6.14

### Patch Changes

- [#43](https://github.com/swapkit/wallets/pull/43) [`ccd24ef`](https://github.com/swapkit/wallets/commit/ccd24efef83af6b29f97e2cd8d39b78a24d491a0) Thanks [@towanTG](https://github.com/towanTG)! - Use workspace protocol for internal wallet package dependencies so changesets propagates version bumps from internal package releases.

- Updated dependencies [[`ccd24ef`](https://github.com/swapkit/wallets/commit/ccd24efef83af6b29f97e2cd8d39b78a24d491a0)]:
  - @swapkit/wallets@4.8.8

## 4.6.13

### Patch Changes

- [`4499da0`](https://github.com/swapkit/wallets/commit/4499da06f6077b097e1c1d70906350ac764bfece) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - bump deps for all sk

- Updated dependencies [[`4499da0`](https://github.com/swapkit/wallets/commit/4499da06f6077b097e1c1d70906350ac764bfece)]:
  - @swapkit/wallets@4.8.7

## 4.6.12

### Patch Changes

- [#36](https://github.com/swapkit/wallets/pull/36) [`f2a042b`](https://github.com/swapkit/wallets/commit/f2a042b90f0c1ed41ed8ca931567fe360cb69f6e) Thanks [@ice-chillios](https://github.com/ice-chillios)! - bump deps

- Updated dependencies [[`f2a042b`](https://github.com/swapkit/wallets/commit/f2a042b90f0c1ed41ed8ca931567fe360cb69f6e)]:
  - @swapkit/wallets@4.8.6

## 4.6.11

### Patch Changes

- [#34](https://github.com/swapkit/wallets/pull/34) [`3104442`](https://github.com/swapkit/wallets/commit/31044425a5753c4436f806379d427d2aa3050158) Thanks [@towanTG](https://github.com/towanTG)! - Update shared `@swapkit/*` dependency ranges to the latest published versions used in this monorepo.

- Updated dependencies [[`3104442`](https://github.com/swapkit/wallets/commit/31044425a5753c4436f806379d427d2aa3050158)]:
  - @swapkit/wallets@4.8.5

## 4.6.10

### Patch Changes

- [#31](https://github.com/swapkit/wallets/pull/31) [`ef5f220`](https://github.com/swapkit/wallets/commit/ef5f22005c99f71071205fa7b9b1820ace5a8c8c) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update core dependencies: @swapkit/core@4.4.20,@swapkit/toolboxes@4.15.7

- Updated dependencies [[`ef5f220`](https://github.com/swapkit/wallets/commit/ef5f22005c99f71071205fa7b9b1820ace5a8c8c)]:
  - @swapkit/wallets@4.8.4

## 4.6.9

### Patch Changes

- [#27](https://github.com/swapkit/wallets/pull/27) [`09e8bb6`](https://github.com/swapkit/wallets/commit/09e8bb63ad97f19504f4a1c19630eec4bc2f1dfe) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update core dependencies: @swapkit/core@4.4.19,@swapkit/toolboxes@4.15.6

- Updated dependencies [[`09e8bb6`](https://github.com/swapkit/wallets/commit/09e8bb63ad97f19504f4a1c19630eec4bc2f1dfe)]:
  - @swapkit/wallets@4.8.3

## 4.6.8

### Patch Changes

- [#25](https://github.com/swapkit/wallets/pull/25) [`81053d0`](https://github.com/swapkit/wallets/commit/81053d0a35fb9170e87bd38128f23d6a666621f6) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update core dependencies: @swapkit/core@4.4.18,@swapkit/toolboxes@4.15.5

- Updated dependencies [[`81053d0`](https://github.com/swapkit/wallets/commit/81053d0a35fb9170e87bd38128f23d6a666621f6)]:
  - @swapkit/wallets@4.8.2

## 4.6.7

### Patch Changes

- [`851cbdc`](https://github.com/swapkit/wallets/commit/851cbdcb15500e673c56fedacd7f473f7887b9db) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Publish TypeScript sources alongside dist output so Bun source export conditions resolve in published packages.

- Updated dependencies [[`851cbdc`](https://github.com/swapkit/wallets/commit/851cbdcb15500e673c56fedacd7f473f7887b9db)]:
  - @swapkit/wallets@4.8.1

## 4.6.6

### Patch Changes

- [`f33231b`](https://github.com/swapkit/wallets/commit/f33231b0e3e812475a8bc9ca5bc9b1c9347ae8ed) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Normalize workspace dependencies before publishing so SDK releases contain npm semver ranges and generated types.

## 4.6.5

### Patch Changes

- [#19](https://github.com/swapkit/wallets/pull/19) [`f181e26`](https://github.com/swapkit/wallets/commit/f181e26a24861d5b08284c583ab85e9fcfdd2008) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update core dependencies: @swapkit/core@4.4.13,@swapkit/toolboxes@4.15.0

- [#21](https://github.com/swapkit/wallets/pull/21) [`159098d`](https://github.com/swapkit/wallets/commit/159098d3acbf75e0739115dab7fbe0ad17b17dd2) Thanks [@towanTG](https://github.com/towanTG)! - Add account-aware UTXO HD discovery methods for hardware wallets. Ledger, Trezor, and KeepKey now expose `getExtendedPublicKeyInfo`, account-aware `deriveAddressAtIndex`, and batched `deriveAddresses`, while dependencies are bumped to the SDK versions that provide shared UTXO HD helpers.

- Updated dependencies [[`f181e26`](https://github.com/swapkit/wallets/commit/f181e26a24861d5b08284c583ab85e9fcfdd2008), [`159098d`](https://github.com/swapkit/wallets/commit/159098d3acbf75e0739115dab7fbe0ad17b17dd2)]:
  - @swapkit/wallets@4.8.0

## 4.6.4

### Patch Changes

- [#11](https://github.com/swapkit/wallets/pull/11) [`67d6989`](https://github.com/swapkit/wallets/commit/67d698968b20e68b92537b56d04a415ad516b84a) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update core dependencies: @swapkit/contracts@4.1.3,@swapkit/core@4.4.11,@swapkit/helpers@4.12.9,@swapkit/tokens@4.2.5,@swapkit/toolboxes@4.14.4,@swapkit/types@0.7.3,@swapkit/utxo-signer@2.1.1

- Updated dependencies [[`67d6989`](https://github.com/swapkit/wallets/commit/67d698968b20e68b92537b56d04a415ad516b84a), [`b4b4666`](https://github.com/swapkit/wallets/commit/b4b4666fccee2861aa733cf589a9a50aaf4ed981), [`5a5a117`](https://github.com/swapkit/wallets/commit/5a5a11738b1c8a2fd08fc571cc2156947ee05bd0)]:
  - @swapkit/wallets@4.7.0

## 4.6.3

### Patch Changes

- [`13bf898`](https://github.com/swapkit/wallets/commit/13bf898e4899ddb707faf711f8b8f355daa4635c) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Pin @swapkit/\* core dependency versions via root `overrides` to prevent transitive version drift, and bump to latest: @swapkit/core@4.4.10, @swapkit/helpers@4.12.8, @swapkit/plugins@4.6.24, @swapkit/server@4.2.35, @swapkit/toolboxes@4.14.3, @swapkit/wallet-core@4.1.28, @swapkit/wallet-keystore@4.3.16

- Updated dependencies [[`13bf898`](https://github.com/swapkit/wallets/commit/13bf898e4899ddb707faf711f8b8f355daa4635c)]:
  - @swapkit/wallets@4.6.4

## 4.6.2

### Patch Changes

- [#3](https://github.com/swapkit/wallets/pull/3) [`b4cdf9f`](https://github.com/swapkit/wallets/commit/b4cdf9f103ed527b970f0217f0da74433afb99bf) Thanks [@github-actions](https://github.com/apps/github-actions)! - Update core dependencies: @swapkit/core@4.4.9,@swapkit/helpers@4.12.7,@swapkit/plugins@4.6.23,@swapkit/server@4.2.34,@swapkit/toolboxes@4.14.2,@swapkit/wallet-core@4.1.27,@swapkit/wallet-keystore@4.3.15

- Updated dependencies [[`b4cdf9f`](https://github.com/swapkit/wallets/commit/b4cdf9f103ed527b970f0217f0da74433afb99bf)]:
  - @swapkit/wallets@4.6.3

## 4.6.1

### Patch Changes

- [`b7087d7`](https://github.com/swapkit/wallets/commit/b7087d79f8c105a163825c21a512d33cfe9049ab) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Update core dependencies from SDK release

- Updated dependencies [[`b7087d7`](https://github.com/swapkit/wallets/commit/b7087d79f8c105a163825c21a512d33cfe9049ab)]:
  - @swapkit/wallets@4.6.2

## 4.6.0

### Minor Changes

- [#4](https://github.com/swapkit/wallets/pull/4) [`9883a17`](https://github.com/swapkit/wallets/commit/9883a176197b111c00f369a4d680bbae7aa05a5e) Thanks [@towanTG](https://github.com/towanTG)! - feat: move SDK package to wallets repo for unified release cycle

## 4.5.23

### Patch Changes

- [`c1f4df2`](https://github.com/swapkit/sdk/commit/c1f4df22a244be2bdad874d6dcf789712e1532b3) Thanks [@towanTG](https://github.com/towanTG)! - fix: replace workspace:\* references to @swapkit/wallets with npm version

- Updated dependencies [[`c1f4df2`](https://github.com/swapkit/sdk/commit/c1f4df22a244be2bdad874d6dcf789712e1532b3)]:
  - @swapkit/core@4.4.4

## 4.5.22

### Patch Changes

- Updated dependencies [[`df5c67c`](https://github.com/swapkit/sdk/commit/df5c67cb9af27fe625959113bad47a74ad7cca58)]:
  - @swapkit/helpers@4.12.3
  - @swapkit/toolboxes@4.13.1
  - @swapkit/core@4.4.3
  - @swapkit/plugins@4.6.18
  - @swapkit/server@4.2.29
  - @swapkit/wallets@4.6.3

## 4.5.21

### Patch Changes

- Updated dependencies [[`551d65f`](https://github.com/swapkit/sdk/commit/551d65f8c761a7ff9a720ca54254f418a23d8dcd)]:
  - @swapkit/toolboxes@4.13.0
  - @swapkit/helpers@4.12.2
  - @swapkit/core@4.4.2
  - @swapkit/plugins@4.6.17
  - @swapkit/server@4.2.28
  - @swapkit/wallets@4.6.2

## 4.5.20

### Patch Changes

- Updated dependencies [[`674bce5`](https://github.com/swapkit/sdk/commit/674bce5d834ed6cf416282e60729fe9bd24fa698)]:
  - @swapkit/helpers@4.12.1
  - @swapkit/core@4.4.1
  - @swapkit/plugins@4.6.16
  - @swapkit/server@4.2.27
  - @swapkit/toolboxes@4.12.1
  - @swapkit/wallets@4.6.1

## 4.5.19

### Patch Changes

- Updated dependencies [[`e770e34`](https://github.com/swapkit/sdk/commit/e770e34f008e9c96738ed9d445dc5680927ad719)]:
  - @swapkit/toolboxes@4.12.0
  - @swapkit/helpers@4.12.0
  - @swapkit/wallets@4.6.0
  - @swapkit/core@4.4.0
  - @swapkit/plugins@4.6.15
  - @swapkit/server@4.2.26

## 4.5.18

### Patch Changes

- Updated dependencies [[`686341c`](https://github.com/swapkit/sdk/commit/686341cc66cc09b6389d19f57787203c72566ff8)]:
  - @swapkit/toolboxes@4.11.2
  - @swapkit/core@4.3.18
  - @swapkit/helpers@4.11.0
  - @swapkit/plugins@4.6.14
  - @swapkit/server@4.2.25
  - @swapkit/wallets@4.5.15

## 4.5.17

### Patch Changes

- Updated dependencies [[`f661bbe`](https://github.com/swapkit/sdk/commit/f661bbe11f4b4562ecebbfd1f6a024f5ecbb35ad)]:
  - @swapkit/toolboxes@4.11.1
  - @swapkit/core@4.3.17
  - @swapkit/helpers@4.11.0
  - @swapkit/plugins@4.6.13
  - @swapkit/server@4.2.24
  - @swapkit/wallets@4.5.14

## 4.5.16

### Patch Changes

- Updated dependencies [[`de2ae45`](https://github.com/swapkit/sdk/commit/de2ae45af86d78a25c4a3132e6f452362370a910), [`9804504`](https://github.com/swapkit/sdk/commit/9804504d0500d2a30dcc2677dba084a8a77cbcc7), [`997361a`](https://github.com/swapkit/sdk/commit/997361a6dabb079731268785c76d92e8e022b2be), [`9804504`](https://github.com/swapkit/sdk/commit/9804504d0500d2a30dcc2677dba084a8a77cbcc7)]:
  - @swapkit/wallets@4.5.13
  - @swapkit/toolboxes@4.11.0
  - @swapkit/helpers@4.11.0
  - @swapkit/core@4.3.16
  - @swapkit/plugins@4.6.12
  - @swapkit/server@4.2.23

## 4.5.15

### Patch Changes

- Updated dependencies [[`c2de41f`](https://github.com/swapkit/sdk/commit/c2de41f9773f0814a11d3ec0d191598b253d67da)]:
  - @swapkit/toolboxes@4.10.3
  - @swapkit/helpers@4.10.7
  - @swapkit/core@4.3.15
  - @swapkit/plugins@4.6.11
  - @swapkit/server@4.2.22
  - @swapkit/wallets@4.5.12

## 4.5.14

### Patch Changes

- Updated dependencies []:
  - @swapkit/helpers@4.10.6
  - @swapkit/wallets@4.5.11
  - @swapkit/core@4.3.14
  - @swapkit/plugins@4.6.10
  - @swapkit/server@4.2.21
  - @swapkit/toolboxes@4.10.2

## 4.5.13

### Patch Changes

- Updated dependencies [[`6346a4a`](https://github.com/swapkit/sdk/commit/6346a4a3c5cdde95f282b841d80d79c8eece47a8)]:
  - @swapkit/helpers@4.10.5
  - @swapkit/toolboxes@4.10.1
  - @swapkit/core@4.3.13
  - @swapkit/plugins@4.6.9
  - @swapkit/server@4.2.20
  - @swapkit/wallets@4.5.10

## 4.5.12

### Patch Changes

- Updated dependencies [[`0fd10ee`](https://github.com/swapkit/sdk/commit/0fd10eedd1c39324d4559c3e44f94ab1d55e644a)]:
  - @swapkit/toolboxes@4.10.0
  - @swapkit/helpers@4.10.4
  - @swapkit/plugins@4.6.8
  - @swapkit/core@4.3.12
  - @swapkit/wallets@4.5.9
  - @swapkit/server@4.2.19

## 4.5.11

### Patch Changes

- Updated dependencies [[`365fd35`](https://github.com/swapkit/sdk/commit/365fd35f35e9ad171509ead07c234244187e0a1c)]:
  - @swapkit/toolboxes@4.9.7
  - @swapkit/core@4.3.11
  - @swapkit/helpers@4.10.3
  - @swapkit/plugins@4.6.7
  - @swapkit/server@4.2.18
  - @swapkit/wallets@4.5.8

## 4.5.10

### Patch Changes

- Updated dependencies []:
  - @swapkit/wallets@4.5.7
  - @swapkit/core@4.3.10

## 4.5.9

### Patch Changes

- Updated dependencies [[`cb3f8b4`](https://github.com/swapkit/sdk/commit/cb3f8b426eda4e65513b0d1fbfc263dff961a30d)]:
  - @swapkit/helpers@4.10.3
  - @swapkit/core@4.3.9
  - @swapkit/plugins@4.6.6
  - @swapkit/server@4.2.17
  - @swapkit/toolboxes@4.9.6
  - @swapkit/wallets@4.5.6

## 4.5.8

### Patch Changes

- Updated dependencies [[`36f0c95`](https://github.com/swapkit/sdk/commit/36f0c9535bec4d608a853d5a00f178b4f4cc09f4), [`a333021`](https://github.com/swapkit/sdk/commit/a3330215648d4cde755dcb54eda9259c429e6910), [`3fbec61`](https://github.com/swapkit/sdk/commit/3fbec61cf9b4a5a6b8604c6c3b94d15a3e9de0d7)]:
  - @swapkit/toolboxes@4.9.5
  - @swapkit/core@4.3.8
  - @swapkit/helpers@4.10.2
  - @swapkit/plugins@4.6.5
  - @swapkit/wallets@4.5.5
  - @swapkit/server@4.2.16

## 4.5.7

### Patch Changes

- Updated dependencies [[`d49a4f2`](https://github.com/swapkit/sdk/commit/d49a4f21cd8929212161321f3ed9956dceb8d7c1)]:
  - @swapkit/helpers@4.10.1
  - @swapkit/plugins@4.6.4
  - @swapkit/core@4.3.7
  - @swapkit/server@4.2.15
  - @swapkit/toolboxes@4.9.4
  - @swapkit/wallets@4.5.4

## 4.5.6

### Patch Changes

- Updated dependencies [[`6b26d26`](https://github.com/swapkit/sdk/commit/6b26d26ab61fa4a05021bae1055fbefca14516f2), [`2a3f741`](https://github.com/swapkit/sdk/commit/2a3f74120c83724dc61360ac3bcae848683218c1), [`6b26d26`](https://github.com/swapkit/sdk/commit/6b26d26ab61fa4a05021bae1055fbefca14516f2), [`6b26d26`](https://github.com/swapkit/sdk/commit/6b26d26ab61fa4a05021bae1055fbefca14516f2), [`f041b69`](https://github.com/swapkit/sdk/commit/f041b69431a9c891780c931e591b8691a2a85daa)]:
  - @swapkit/helpers@4.10.0
  - @swapkit/toolboxes@4.9.3
  - @swapkit/core@4.3.6
  - @swapkit/plugins@4.6.3
  - @swapkit/server@4.2.14
  - @swapkit/wallets@4.5.3

## 4.5.5

### Patch Changes

- Updated dependencies [[`61296c8`](https://github.com/swapkit/sdk/commit/61296c81f33981c96bfba590c98298ee5629a06f)]:
  - @swapkit/helpers@4.9.5
  - @swapkit/core@4.3.5
  - @swapkit/plugins@4.6.2
  - @swapkit/server@4.2.13
  - @swapkit/toolboxes@4.9.2
  - @swapkit/wallets@4.5.2

## 4.5.4

### Patch Changes

- Updated dependencies [[`01cfad6`](https://github.com/swapkit/sdk/commit/01cfad601398e39fb852f97f4fa6dbf6309bb680), [`01cfad6`](https://github.com/swapkit/sdk/commit/01cfad601398e39fb852f97f4fa6dbf6309bb680), [`01cfad6`](https://github.com/swapkit/sdk/commit/01cfad601398e39fb852f97f4fa6dbf6309bb680), [`bdd6a23`](https://github.com/swapkit/sdk/commit/bdd6a237c41cb6a14465b04c9acbc3fbe2899be4)]:
  - @swapkit/helpers@4.9.4
  - @swapkit/toolboxes@4.9.1
  - @swapkit/core@4.3.4
  - @swapkit/plugins@4.6.1
  - @swapkit/server@4.2.12
  - @swapkit/wallets@4.5.1

## 4.5.3

### Patch Changes

- Updated dependencies [[`8e2587a`](https://github.com/swapkit/sdk/commit/8e2587a0bfcd41a1023fadb821903a4961d0aeef), [`1640cd7`](https://github.com/swapkit/sdk/commit/1640cd7ba5ff3397d278ce6a08f84ee98cfd356f), [`c990413`](https://github.com/swapkit/sdk/commit/c99041358ca8885ff168af12305f2008257bad65), [`123f2d6`](https://github.com/swapkit/sdk/commit/123f2d6454e8023d28d0d878f95c876ca5738d10)]:
  - @swapkit/toolboxes@4.9.0
  - @swapkit/plugins@4.6.0
  - @swapkit/core@4.3.3
  - @swapkit/helpers@4.9.3
  - @swapkit/server@4.2.11
  - @swapkit/wallets@4.5.0

## 4.5.2

### Patch Changes

- Updated dependencies []:
  - @swapkit/wallets@4.4.10
  - @swapkit/helpers@4.9.2
  - @swapkit/core@4.3.2
  - @swapkit/plugins@4.5.2
  - @swapkit/server@4.2.10
  - @swapkit/toolboxes@4.8.1

## 4.5.1

### Patch Changes

- Updated dependencies [[`8d9fd7d`](https://github.com/swapkit/sdk/commit/8d9fd7d56dbfe57638204060d029680452e08c39)]:
  - @swapkit/toolboxes@4.8.0
  - @swapkit/helpers@4.9.1
  - @swapkit/plugins@4.5.1
  - @swapkit/server@4.2.9
  - @swapkit/core@4.3.1
  - @swapkit/wallets@4.4.9

## 4.5.0

### Minor Changes

- [#13](https://github.com/swapkit/sdk/pull/13) [`08d41d2`](https://github.com/swapkit/sdk/commit/08d41d2476c56a6f81f5ea83902e6c497278c995) Thanks [@towanTG](https://github.com/towanTG)! - feat: Add V3 swap flow support with SwapKitPlugin

  ### New Features

  - **SwapKitPlugin**: New plugin for signing raw SwapKit API transactions directly

    - Supports UTXO chains (BTC, BCH, LTC, DOGE, DASH, ZEC) via PSBT
    - Supports all EVM chains via eth_sendTransaction
    - Supports Cosmos chains, Solana, Near, Ripple, Tron, Sui, Cardano
    - Includes transaction parsing validation with proper error handling

  - **V3SwapFlowSupport**: Registry mapping chains to supported wallets for V3 flow

    - Enables detection of wallet/chain capability for raw transaction signing
    - Automatic fallback to named plugins when V3 not supported

  - **signAndBroadcastTransaction**: New method on toolboxes for signing pre-built transactions
    - Added to Cosmos, Cardano, Tron, Sui, Near, Ripple toolboxes
    - Enables direct signing of API-provided transactions

  ### Improvements

  - Added new error key `plugin_swapkit_invalid_transaction` for better error handling
  - Improved test coverage across toolboxes (Near, Ripple, Solana, Substrate, Tron, UTXO)
  - Enhanced UTXO coin selection and transaction size estimation
  - Code cleanup in Cosmos toolbox (removed dead code)

  ### API Types

  - Added `QuoteResponseRoute` schema for V3 quote responses
  - Added transaction schemas for EVM, Cosmos, and Tron validation

### Patch Changes

- Updated dependencies [[`08d41d2`](https://github.com/swapkit/sdk/commit/08d41d2476c56a6f81f5ea83902e6c497278c995)]:
  - @swapkit/helpers@4.9.0
  - @swapkit/plugins@4.5.0
  - @swapkit/toolboxes@4.7.0
  - @swapkit/core@4.3.0
  - @swapkit/server@4.2.8
  - @swapkit/wallets@4.4.8

## 4.4.7

### Patch Changes

- Updated dependencies [[`e8b5bd5`](https://github.com/swapkit/sdk/commit/e8b5bd5e2cb9709265a488b2a0201077342c89b4)]:
  - @swapkit/toolboxes@4.6.7
  - @swapkit/core@4.2.7
  - @swapkit/helpers@4.8.4
  - @swapkit/plugins@4.4.7
  - @swapkit/server@4.2.7
  - @swapkit/wallets@4.4.7

## 4.4.6

### Patch Changes

- Updated dependencies [[`f220ae3`](https://github.com/swapkit/sdk/commit/f220ae38a32408093cebddc10b68a40bd088a64e)]:
  - @swapkit/toolboxes@4.6.6
  - @swapkit/core@4.2.6
  - @swapkit/helpers@4.8.4
  - @swapkit/plugins@4.4.6
  - @swapkit/server@4.2.6
  - @swapkit/wallets@4.4.6

## 4.4.5

### Patch Changes

- Updated dependencies [[`71d84ca`](https://github.com/swapkit/sdk/commit/71d84ca4c243cbce6617cfdea7ea2f0feb696fd7)]:
  - @swapkit/toolboxes@4.6.5
  - @swapkit/core@4.2.5
  - @swapkit/helpers@4.8.4
  - @swapkit/plugins@4.4.5
  - @swapkit/server@4.2.5
  - @swapkit/wallets@4.4.5

## 4.4.4

### Patch Changes

- Updated dependencies [[`c11cd18`](https://github.com/swapkit/sdk/commit/c11cd18052ca4e2f8c8fe0d678378e8d880073cd), [`fd43ab5`](https://github.com/swapkit/sdk/commit/fd43ab57e16d4ebac6960afc507678d427edf278), [`5d34cc2`](https://github.com/swapkit/sdk/commit/5d34cc2feb111517058a355d5215c66658469df6)]:
  - @swapkit/helpers@4.8.4
  - @swapkit/toolboxes@4.6.4
  - @swapkit/core@4.2.4
  - @swapkit/plugins@4.4.4
  - @swapkit/server@4.2.4
  - @swapkit/wallets@4.4.4

## 4.4.3

### Patch Changes

- Updated dependencies [[`34c9a02`](https://github.com/swapkit/sdk/commit/34c9a024716424e6b1ad0afe1d13097aca8aaca3), [`c79c65a`](https://github.com/swapkit/sdk/commit/c79c65ab5aabde6219e017501e7b1e3238ea316c), [`63c9069`](https://github.com/swapkit/sdk/commit/63c9069c76004e08beb42d289ed6d046c79e4e7f)]:
  - @swapkit/toolboxes@4.6.3
  - @swapkit/helpers@4.8.3
  - @swapkit/core@4.2.3
  - @swapkit/plugins@4.4.3
  - @swapkit/server@4.2.3
  - @swapkit/wallets@4.4.3

## 4.4.2

### Patch Changes

- Updated dependencies [[`38b55e7`](https://github.com/swapkit/sdk/commit/38b55e7e1455149f932a575cac4837d2b0a144db)]:
  - @swapkit/toolboxes@4.6.2
  - @swapkit/helpers@4.8.2
  - @swapkit/plugins@4.4.2
  - @swapkit/server@4.2.2
  - @swapkit/core@4.2.2
  - @swapkit/wallets@4.4.2

## 4.4.1

### Patch Changes

- [`50c49f8`](https://github.com/swapkit/sdk/commit/50c49f88c22c149fede95b109bab1b3ea0b300c4) Thanks [@ice-chillios](https://github.com/ice-chillios)! - Bump

- Updated dependencies [[`49f58fb`](https://github.com/swapkit/sdk/commit/49f58fb78fd08c82bccae0d49d6f9eb9e9e04b2a), [`50c49f8`](https://github.com/swapkit/sdk/commit/50c49f88c22c149fede95b109bab1b3ea0b300c4)]:
  - @swapkit/toolboxes@4.6.1
  - @swapkit/core@4.2.1
  - @swapkit/helpers@4.8.1
  - @swapkit/plugins@4.4.1
  - @swapkit/server@4.2.1
  - @swapkit/wallets@4.4.1

## 4.4.0

### Minor Changes

- [`a4402e9`](https://github.com/swapkit/sdk/commit/a4402e91de5d634da24aa0c752f5e473132a4c71) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Removes async toolboxes and adapts code for it

### Patch Changes

- Updated dependencies [[`a4402e9`](https://github.com/swapkit/sdk/commit/a4402e91de5d634da24aa0c752f5e473132a4c71), [`941d648`](https://github.com/swapkit/sdk/commit/941d648516ce8aca2c5e21827a27f75b34163cee)]:
  - @swapkit/core@4.2.0
  - @swapkit/helpers@4.8.0
  - @swapkit/plugins@4.4.0
  - @swapkit/server@4.2.0
  - @swapkit/toolboxes@4.6.0
  - @swapkit/wallets@4.4.0

## 4.3.3

### Patch Changes

- [#24](https://github.com/swapkit/sdk/pull/24) [`81936df`](https://github.com/swapkit/sdk/commit/81936df75586c2686ffd4b7b228f47b7461fa8d9) Thanks [@towanTG](https://github.com/towanTG)! - Validates Tron address before fetching balance

- Updated dependencies [[`148cd88`](https://github.com/swapkit/sdk/commit/148cd88c64ad573514454334e392bd7c65bb62e2), [`81936df`](https://github.com/swapkit/sdk/commit/81936df75586c2686ffd4b7b228f47b7461fa8d9)]:
  - @swapkit/toolboxes@4.5.3
  - @swapkit/core@4.1.16
  - @swapkit/plugins@4.3.3
  - @swapkit/server@4.1.3
  - @swapkit/wallets@4.3.15

## 4.3.2

### Patch Changes

- [`3608238`](https://github.com/swapkit/sdk/commit/3608238c4cc343c07c1c379343e5833fad58d68b) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Updates package.json src paths due to dist file restructuring

- Updated dependencies [[`3608238`](https://github.com/swapkit/sdk/commit/3608238c4cc343c07c1c379343e5833fad58d68b)]:
  - @swapkit/plugins@4.3.2
  - @swapkit/core@4.1.15

## 4.3.1

### Patch Changes

- [`799ccc8`](https://github.com/swapkit/sdk/commit/799ccc82896823a3233a48f97745b979622d5076) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - Manual update to fix release

- Updated dependencies [[`799ccc8`](https://github.com/swapkit/sdk/commit/799ccc82896823a3233a48f97745b979622d5076)]:
  - @swapkit/core@4.1.14
  - @swapkit/helpers@4.7.2
  - @swapkit/plugins@4.3.1
  - @swapkit/server@4.1.2
  - @swapkit/toolboxes@4.5.2
  - @swapkit/wallets@4.3.14

## 4.3.0

### Minor Changes

- [#14](https://github.com/swapkit/sdk/pull/14) [`47f6375`](https://github.com/swapkit/sdk/commit/47f63757c4ab6f7ac06a494a347a1f2383b03f63) Thanks [@towanTG](https://github.com/towanTG)! - Adds Harbor Provider and plugin

### Patch Changes

- Updated dependencies [[`47f6375`](https://github.com/swapkit/sdk/commit/47f63757c4ab6f7ac06a494a347a1f2383b03f63)]:
  - @swapkit/helpers@4.7.0
  - @swapkit/plugins@4.3.0

## 4.2.13

### Patch Changes

- [`4d60682`](https://github.com/swapkit/sdk/commit/4d606827eda5a8e1842cad9bcf1c88ff0d6f5517) Thanks [@towanTG](https://github.com/towanTG)! - Releases latest changes from public repo - enables monad for some wallets, fixes sui tokens tx building and fixes vultisig

- Updated dependencies [[`4d60682`](https://github.com/swapkit/sdk/commit/4d606827eda5a8e1842cad9bcf1c88ff0d6f5517), [`f6d9e39`](https://github.com/swapkit/sdk/commit/f6d9e390a3dc47d777c934d891626c2e8e97e45b)]:
  - @swapkit/core@4.1.13
  - @swapkit/helpers@4.6.0
  - @swapkit/plugins@4.2.12
  - @swapkit/server@4.1.1
  - @swapkit/toolboxes@4.5.0
  - @swapkit/wallets@4.3.13
