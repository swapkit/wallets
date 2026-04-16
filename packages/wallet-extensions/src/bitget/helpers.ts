import { hex } from "@scure/base";
import {
  Chain,
  type EVMChain,
  GAIAConfig,
  prepareNetworkSwitch,
  SwapKitError,
  switchEVMWalletNetwork,
} from "@swapkit/helpers";
import type { TronTransaction } from "@swapkit/toolboxes/tron";
import { Transaction } from "@swapkit/utxo-signer";
import type { Eip1193Provider } from "ethers";

export async function getWalletMethods(chain: Chain) {
  const { match, P } = await import("ts-pattern");
  const bitget = window.bitkeep;

  return match(chain)
    .with(
      P.union(
        Chain.Arbitrum,
        Chain.Aurora,
        Chain.Avalanche,
        Chain.Base,
        Chain.Berachain,
        Chain.BinanceSmartChain,
        Chain.Ethereum,
        Chain.Gnosis,
        Chain.Monad,
        Chain.Optimism,
        Chain.Polygon,
        Chain.XLayer,
      ),
      async () => {
        if (!(bitget && "ethereum" in bitget)) {
          throw new SwapKitError("wallet_bitkeep_not_found");
        }

        const wallet = bitget.ethereum;

        const [address]: [string] = await wallet.send("eth_requestAccounts", []);
        const evmWallet = await getWeb3WalletMethods({ chain: chain as EVMChain, walletProvider: wallet });

        return { ...evmWallet, address };
      },
    )
    .with(Chain.Bitcoin, async () => {
      if (!(bitget && "unisat" in bitget)) {
        throw new SwapKitError("wallet_bitkeep_not_found");
      }
      const { unisat: wallet } = bitget;

      const { getUtxoToolbox } = await import("@swapkit/toolboxes/utxo");
      const [address] = await wallet.requestAccounts();

      async function signTransaction(tx: InstanceType<typeof Transaction>) {
        const psbtHex = hex.encode(tx.toPSBT(0));
        const signedPsbtHex = await wallet.signPsbt(psbtHex, { autoFinalized: false });

        return Transaction.fromPSBT(hex.decode(signedPsbtHex));
      }

      const signer = { getAddress: () => Promise.resolve(address), signTransaction };

      const toolbox = getUtxoToolbox(Chain.Bitcoin, { signer });

      return { ...toolbox, address };
    })
    .with(Chain.Cosmos, async () => {
      if (!(bitget && "keplr" in bitget)) {
        throw new SwapKitError("wallet_bitkeep_not_found");
      }
      const { keplr: wallet } = bitget;

      await wallet.enable(GAIAConfig.chainId);
      const offlineSigner = await wallet.getOfflineSignerAuto(GAIAConfig.chainId);
      const accounts = await offlineSigner.getAccounts();
      if (!accounts?.[0]) throw new SwapKitError("wallet_bitkeep_no_accounts", { chain: Chain.Cosmos });

      const { getCosmosToolbox } = await import("@swapkit/toolboxes/cosmos");
      const [{ address }] = accounts;

      const signer = Object.assign(offlineSigner, { getAddress: () => Promise.resolve(address) });

      const toolbox = getCosmosToolbox(Chain.Cosmos, { signer });

      return { ...toolbox, address };
    })
    .with(Chain.Solana, async () => {
      if (!(bitget && "solana" in bitget)) {
        throw new SwapKitError("wallet_bitkeep_not_found");
      }

      const { getSolanaToolbox } = await import("@swapkit/toolboxes/solana");
      const provider = bitget?.solana;

      const { publicKey } = await provider.connect();
      const address: string = publicKey.toString();

      const signer = Object.assign(provider, { getAddress: async () => address });

      const toolbox = getSolanaToolbox({ signer });

      return { ...toolbox, address };
    })
    .with(Chain.Tron, async () => {
      if (!(bitget && "tronLink" in bitget && "tronWeb" in bitget)) {
        throw new SwapKitError("wallet_bitkeep_not_found");
      }

      const { getTronToolbox } = await import("@swapkit/toolboxes/tron");
      const { tronLink, tronWeb } = bitget;

      const response = await tronLink.request({ method: "tron_requestAccounts" });

      if (response.code !== 200) {
        throw new SwapKitError("wallet_connection_rejected_by_user", {
          message: response.message || "User rejected connection",
        });
      }

      const address = tronWeb.defaultAddress?.base58;

      if (!address) {
        throw new SwapKitError("wallet_bitkeep_no_accounts", { chain: Chain.Tron });
      }

      const signer = {
        getAddress: () => Promise.resolve(address),
        signTransaction: async (transaction: TronTransaction) => {
          const signedTx = await tronWeb.trx.sign(transaction);
          return signedTx;
        },
      };

      const toolbox = getTronToolbox({ signer });

      return { ...toolbox, address };
    })
    .with(Chain.Aptos, async () => {
      if (!(bitget && "aptos" in bitget)) {
        throw new SwapKitError("wallet_bitkeep_not_found");
      }

      const { createAptosExtensionTransfer, getAptosToolbox, validateAptosAddress } = await import(
        "@swapkit/toolboxes/aptos"
      );
      const aptosProvider = bitget.aptos as import("@swapkit/toolboxes/aptos").AptosExtensionProvider;

      const { address } = await aptosProvider.connect();
      if (!validateAptosAddress(address)) throw new SwapKitError("wallet_bitkeep_not_found");

      const toolbox = getAptosToolbox();

      return { ...toolbox, address, transfer: createAptosExtensionTransfer({ provider: aptosProvider }) };
    })
    .otherwise(() => {
      throw new SwapKitError("wallet_chain_not_supported");
    });
}

export const getWeb3WalletMethods = async ({
  chain,
  walletProvider,
}: {
  walletProvider?: Eip1193Provider;
  chain: EVMChain;
}) => {
  const { getEvmToolboxAsync } = await import("@swapkit/toolboxes/evm");
  const { BrowserProvider } = await import("ethers");
  if (!walletProvider) throw new SwapKitError("wallet_provider_not_found");

  const provider = new BrowserProvider(walletProvider, "any");
  const signer = await provider.getSigner();
  const toolbox = await getEvmToolboxAsync(chain, { provider, signer });

  try {
    if (chain !== Chain.Ethereum && "getNetworkParams" in toolbox) {
      await switchEVMWalletNetwork(provider, chain, toolbox.getNetworkParams());
    }
  } catch {
    throw new SwapKitError("wallet_bitkeep_failed_to_switch_network", { chain });
  }

  return prepareNetworkSwitch({ chain, provider, toolbox });
};
