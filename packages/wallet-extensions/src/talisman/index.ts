import {
  Chain,
  type EVMChain,
  filterSupportedChains,
  prepareNetworkSwitch,
  SwapKitError,
  WalletOption,
} from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import type { Eip1193Provider } from "ethers";
import type { ExtensionWallet } from "../walletTypes";

export const talismanWallet: ExtensionWallet<"connectTalisman"> = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectTalisman(chains: Chain[]) {
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });

      await Promise.all(
        filteredChains.map(async (chain) => {
          const walletMethods = await getWalletMethods(chain);

          addChain({ ...walletMethods, chain, walletType });
        }),
      );

      return true;
    },
  name: "connectTalisman",
  signingSupport: {
    [Chain.Arbitrum]: { direct: true, typedData: true },
    [Chain.Avalanche]: { direct: true, typedData: true },
    [Chain.Base]: { direct: true, typedData: true },
    [Chain.Berachain]: { direct: true, typedData: true },
    [Chain.BinanceSmartChain]: { direct: true, typedData: true },
    [Chain.Chainflip]: { direct: true },
    [Chain.Ethereum]: { direct: true, typedData: true },
    [Chain.Gnosis]: { direct: true, typedData: true },
    [Chain.Monad]: { direct: true, typedData: true },
    [Chain.Optimism]: { direct: true, typedData: true },
    [Chain.Polygon]: { direct: true, typedData: true },
    [Chain.XLayer]: { direct: true, typedData: true },
    // Polkadot: not in V3 chain list
  },
  supportedChains: [
    Chain.Berachain,
    Chain.Ethereum,
    Chain.Arbitrum,
    Chain.Avalanche,
    Chain.Base,
    Chain.Gnosis,
    Chain.Monad,
    Chain.Polygon,
    Chain.BinanceSmartChain,
    Chain.Optimism,
    Chain.XLayer,
    Chain.Polkadot,
    Chain.Chainflip,
  ],
  walletType: WalletOption.TALISMAN,
});

export const TALISMAN_SUPPORTED_CHAINS = getWalletSupportedChains(talismanWallet);

async function getWeb3WalletMethods({
  walletProvider,
  chain,
}: {
  walletProvider: Eip1193Provider | undefined;
  chain: EVMChain;
}) {
  const { getEvmToolboxAsync } = await import("@swapkit/toolboxes/evm");
  const { BrowserProvider } = await import("ethers");

  if (!walletProvider) {
    throw new SwapKitError({ errorKey: "wallet_provider_not_found", info: { chain, wallet: WalletOption.TALISMAN } });
  }

  const provider = new BrowserProvider(walletProvider, "any");
  const signer = await provider.getSigner();
  const toolbox = await getEvmToolboxAsync(chain, { provider, signer });

  return prepareNetworkSwitch({ chain, provider, toolbox });
}

async function getWalletMethods(chain: Chain) {
  switch (chain) {
    case Chain.Berachain:
    case Chain.Ethereum:
    case Chain.Arbitrum:
    case Chain.Optimism:
    case Chain.Polygon:
    case Chain.Avalanche:
    case Chain.BinanceSmartChain:
    case Chain.Base:
    case Chain.Gnosis:
    case Chain.Monad:
    case Chain.XLayer: {
      if (!(window.talismanEth && "send" in window.talismanEth)) {
        throw new SwapKitError({ errorKey: "wallet_talisman_not_found", info: { chain } });
      }

      const evmWallet = await getWeb3WalletMethods({ chain, walletProvider: window.talismanEth });
      const [address] = (await window.talismanEth.request({ method: "eth_requestAccounts" })) as [string, ...string[]];

      return { ...evmWallet, address };
    }

    case Chain.Polkadot:
    case Chain.Chainflip: {
      const { getSubstrateToolbox, SubstrateNetwork } = await import("@swapkit/toolboxes/substrate");

      const injectedExtension = window?.injectedWeb3?.talisman;
      const rawExtension = await injectedExtension?.enable?.("talisman");

      if (!rawExtension) {
        throw new SwapKitError({ errorKey: "wallet_talisman_not_enabled", info: { chain } });
      }

      const toolbox = await getSubstrateToolbox(chain, { signer: rawExtension.signer });
      const accounts = await rawExtension.accounts.get();

      if (!accounts[0]?.address) {
        throw new SwapKitError({
          errorKey: "wallet_missing_params",
          info: { accounts, address: accounts[0]?.address, wallet: WalletOption.TALISMAN },
        });
      }
      const address = toolbox.convertAddress(accounts[0].address, SubstrateNetwork[chain].prefix);

      return { ...toolbox, address };
    }

    default:
      throw new SwapKitError({
        errorKey: "wallet_chain_not_supported",
        info: { chain, wallet: WalletOption.TALISMAN },
      });
  }
}
