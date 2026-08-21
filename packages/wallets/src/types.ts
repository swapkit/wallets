import { WalletOption } from "@swapkit/helpers";
import type { bitgetWallet } from "@swapkit/wallet-extensions/bitget";
import type { cosmostationWallet } from "@swapkit/wallet-extensions/cosmostation";
import type { ctrlWallet } from "@swapkit/wallet-extensions/ctrl";
import type { evmWallet } from "@swapkit/wallet-extensions/evm-extensions";
import type { keepkeyBexWallet } from "@swapkit/wallet-extensions/keepkey-bex";
import type { keplrWallet } from "@swapkit/wallet-extensions/keplr";
import type { okxWallet } from "@swapkit/wallet-extensions/okx";
import type { onekeyWallet } from "@swapkit/wallet-extensions/onekey";
import type { petraWallet } from "@swapkit/wallet-extensions/petra";
import type { phantomWallet } from "@swapkit/wallet-extensions/phantom";
import type { polkadotWallet } from "@swapkit/wallet-extensions/polkadotjs";
import type { talismanWallet } from "@swapkit/wallet-extensions/talisman";
import type { tronlinkWallet } from "@swapkit/wallet-extensions/tronlink";
import type { trustwalletWallet } from "@swapkit/wallet-extensions/trustwallet";
import type { vultisigWallet } from "@swapkit/wallet-extensions/vultisig";
import type { keepkeyWallet } from "@swapkit/wallet-hardware/keepkey";
import type { ledgerWallet } from "@swapkit/wallet-hardware/ledger";
import type { trezorWallet } from "@swapkit/wallet-hardware/trezor";
import type { coinbaseWallet } from "./coinbase";
import type { keystoreWallet } from "./keystore";
import type { metamaskWallet } from "./metamask";
import type { walletSelectorWallet } from "./near-wallet-selector";
import type { passkeysWallet } from "./passkeys";
import type { radixWallet } from "./radix";
import type { tonconnectWallet } from "./tonconnect";
import type { walletconnectWallet } from "./walletconnect";
import type { xamanWallet } from "./xaman";

export type SKWallets = {
  [WalletOption.BITGET]: typeof bitgetWallet;
  [WalletOption.BRAVE]: typeof evmWallet;
  [WalletOption.COINBASE_MOBILE]: typeof coinbaseWallet;
  [WalletOption.COINBASE_WEB]: typeof evmWallet;
  [WalletOption.COSMOSTATION]: typeof cosmostationWallet;
  [WalletOption.CTRL]: typeof ctrlWallet;
  [WalletOption.EIP6963]: typeof evmWallet;
  [WalletOption.EXODUS]: typeof passkeysWallet;
  [WalletOption.KEEPKEY]: typeof keepkeyWallet;
  [WalletOption.KEEPKEY_BEX]: typeof keepkeyBexWallet;
  [WalletOption.KEPLR]: typeof keplrWallet;
  [WalletOption.KEYSTORE]: typeof keystoreWallet;
  [WalletOption.LEAP]: typeof keplrWallet;
  [WalletOption.LEDGER]: typeof ledgerWallet;
  [WalletOption.METAMASK]: typeof metamaskWallet;
  [WalletOption.OKX]: typeof okxWallet;
  [WalletOption.OKX_MOBILE]: typeof evmWallet;
  [WalletOption.ONEKEY]: typeof onekeyWallet;
  [WalletOption.PASSKEYS]: typeof passkeysWallet;
  [WalletOption.PASSKEY_WALLET]: typeof passkeysWallet;
  [WalletOption.PETRA]: typeof petraWallet;
  [WalletOption.PHANTOM]: typeof phantomWallet;
  [WalletOption.POLKADOT_JS]: typeof polkadotWallet;
  [WalletOption.RADIX_WALLET]: typeof radixWallet;
  [WalletOption.TALISMAN]: typeof talismanWallet;
  TON_CONNECT: typeof tonconnectWallet;
  [WalletOption.TREZOR]: typeof trezorWallet;
  [WalletOption.TRONLINK]: typeof tronlinkWallet;
  [WalletOption.TRUSTWALLET_WEB]: typeof trustwalletWallet;
  [WalletOption.VULTISIG]: typeof vultisigWallet;
  [WalletOption.WALLETCONNECT]: typeof walletconnectWallet;
  [WalletOption.WALLET_SELECTOR]: typeof walletSelectorWallet;
  [WalletOption.XAMAN]: typeof xamanWallet;
};

export type SKConnectWallets = SKWallets[keyof SKWallets];

export type HDWalletAccountParams = { accountIndex?: number };

export type HDWalletDeriveAddressParams = HDWalletAccountParams & { index: number; change?: boolean };

export type HDWalletDeriveAddressesParams = HDWalletAccountParams & {
  count: number;
  startIndex?: number;
  change?: boolean;
};

export type HDWalletDerivedAddress = {
  address: string;
  index: number;
  change: boolean;
  path: string;
  accountIndex: number;
  pubkey: string;
};

export type HDWalletExtendedPublicKey = {
  xpub: string;
  path: string;
  accountIndex: number;
  xpubSegwit?: string;
  chainCode?: string;
  publicKey?: string;
  fingerprint?: number;
  depth?: number;
};

export type HDWalletDiscoveryMethods = {
  getExtendedPublicKey?: (
    params?: HDWalletAccountParams,
  ) => Promise<string | HDWalletExtendedPublicKey | undefined> | string | HDWalletExtendedPublicKey | undefined;
  getExtendedPublicKeyInfo: (params?: HDWalletAccountParams) => Promise<HDWalletExtendedPublicKey | undefined>;
  deriveAddressAtIndex: (params: HDWalletDeriveAddressParams) => Promise<HDWalletDerivedAddress | undefined>;
  deriveAddresses: (params: HDWalletDeriveAddressesParams) => Promise<HDWalletDerivedAddress[]>;
};

export type SKWalletsSupportedChains = {
  [WalletOption.BITGET]: typeof bitgetWallet.connectBitget.supportedChains;
  [WalletOption.BRAVE]: typeof evmWallet.connectEVMWallet.supportedChains;
  [WalletOption.COINBASE_MOBILE]: typeof coinbaseWallet.connectCoinbaseWallet.supportedChains;
  [WalletOption.COINBASE_WEB]: typeof evmWallet.connectEVMWallet.supportedChains;
  [WalletOption.COSMOSTATION]: typeof cosmostationWallet.connectCosmostation.supportedChains;
  [WalletOption.CTRL]: typeof ctrlWallet.connectCtrl.supportedChains;
  [WalletOption.EIP6963]: typeof evmWallet.connectEVMWallet.supportedChains;
  [WalletOption.EXODUS]: typeof passkeysWallet.connectPasskeys.supportedChains;
  [WalletOption.KEEPKEY]: typeof keepkeyWallet.connectKeepkey.supportedChains;
  [WalletOption.KEEPKEY_BEX]: typeof keepkeyBexWallet.connectKeepkeyBex.supportedChains;
  [WalletOption.KEPLR]: typeof keplrWallet.connectKeplr.supportedChains;
  [WalletOption.KEYSTORE]: typeof keystoreWallet.connectKeystore.supportedChains;
  [WalletOption.LEAP]: typeof keplrWallet.connectKeplr.supportedChains;
  [WalletOption.LEDGER]: typeof ledgerWallet.connectLedger.supportedChains;
  [WalletOption.METAMASK]: typeof metamaskWallet.connectMetamask.supportedChains;
  [WalletOption.OKX]: typeof okxWallet.connectOkx.supportedChains;
  [WalletOption.OKX_MOBILE]: typeof evmWallet.connectEVMWallet.supportedChains;
  [WalletOption.ONEKEY]: typeof onekeyWallet.connectOnekeyWallet.supportedChains;
  [WalletOption.PASSKEYS]: typeof passkeysWallet.connectPasskeys.supportedChains;
  [WalletOption.PASSKEY_WALLET]: typeof passkeysWallet.connectPasskeys.supportedChains;
  [WalletOption.PETRA]: typeof petraWallet.connectPetra.supportedChains;
  [WalletOption.PHANTOM]: typeof phantomWallet.connectPhantom.supportedChains;
  [WalletOption.POLKADOT_JS]: typeof polkadotWallet.connectPolkadotJs.supportedChains;
  [WalletOption.RADIX_WALLET]: typeof radixWallet.connectRadixWallet.supportedChains;
  [WalletOption.TALISMAN]: typeof talismanWallet.connectTalisman.supportedChains;
  TON_CONNECT: typeof tonconnectWallet.connectTonConnect.supportedChains;
  [WalletOption.TREZOR]: typeof trezorWallet.connectTrezor.supportedChains;
  [WalletOption.TRONLINK]: typeof tronlinkWallet.connectTronLink.supportedChains;
  [WalletOption.TRUSTWALLET_WEB]: typeof trustwalletWallet.connectTrustWallet.supportedChains;
  [WalletOption.VULTISIG]: typeof vultisigWallet.connectVultisig.supportedChains;
  [WalletOption.WALLETCONNECT]: typeof walletconnectWallet.connectWalletconnect.supportedChains;
  [WalletOption.WALLET_SELECTOR]: typeof walletSelectorWallet.connectWalletSelector.supportedChains;
  [WalletOption.XAMAN]: typeof xamanWallet.connectXaman.supportedChains;
};
