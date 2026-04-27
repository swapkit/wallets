import { hex } from "@scure/base";
import {
  Chain,
  type EVMChain,
  type GenericTransferParams,
  getChainConfig,
  getRPCUrl,
  prepareNetworkSwitch,
  SwapKitError,
} from "@swapkit/helpers";
import type { TronSignedTransaction, TronSigner, TronTransaction } from "@swapkit/toolboxes/tron";
import { Transaction } from "@swapkit/utxo-signer";
import type { Eip1193Provider } from "ethers";

type WalletMethodsWithAddress = Record<string, unknown> & { address: string };

const cosmosTransfer =
  (sender: string) =>
  async ({ recipient, assetValue, memo }: GenericTransferParams) => {
    if (!(window.okxwallet && "keplr" in window.okxwallet)) {
      throw new SwapKitError("wallet_okx_not_found", { chain: Chain.Cosmos });
    }
    const { createSigningStargateClient } = await import("@swapkit/toolboxes/cosmos");

    const { keplr: wallet } = window.okxwallet;
    const offlineSigner = wallet?.getOfflineSignerOnlyAmino(getChainConfig(Chain.Cosmos).chainId);

    const rpcUrl = await getRPCUrl(Chain.Cosmos);
    const cosmJS = await createSigningStargateClient(rpcUrl, offlineSigner);

    const denom = assetValue?.symbol === "MUON" ? "umuon" : "uatom";
    const coins = [{ amount: assetValue.getBaseValue("string"), denom }];

    const { transactionHash } = await cosmJS.sendTokens(sender, recipient, coins, 1.6, memo);
    return transactionHash;
  };

async function getWeb3WalletMethods({
  walletProvider,
  chain,
}: {
  walletProvider: Eip1193Provider | undefined;
  chain: EVMChain;
}) {
  const { getEvmToolboxAsync } = await import("@swapkit/toolboxes/evm");
  const { BrowserProvider } = await import("ethers");
  if (!walletProvider) throw new SwapKitError("wallet_okx_not_found");

  const provider = new BrowserProvider(walletProvider, "any");
  const signer = await provider.getSigner();
  const toolbox = await getEvmToolboxAsync(chain, { provider, signer });

  return prepareNetworkSwitch({ chain, provider, toolbox });
}

export async function getWalletMethods(chain: Chain): Promise<WalletMethodsWithAddress> {
  const { match, P } = await import("ts-pattern");

  return (
    match(chain)
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
          if (!(window.okxwallet && "send" in window.okxwallet)) {
            throw new SwapKitError("wallet_okx_not_found", { chain });
          }

          const evmWallet = await getWeb3WalletMethods({ chain: chain as EVMChain, walletProvider: window.okxwallet });
          const address: string = (await window.okxwallet.send("eth_requestAccounts", [])).result[0];

          return { ...evmWallet, address };
        },
      )
      .with(Chain.Bitcoin, async () => {
        if (!(window.okxwallet && "bitcoin" in window.okxwallet)) {
          throw new SwapKitError("wallet_okx_not_found", { chain: Chain.Bitcoin });
        }

        const { getUtxoToolbox } = await import("@swapkit/toolboxes/utxo");

        const { bitcoin: wallet } = window.okxwallet;
        const address = (await wallet.connect()).address;

        const signer = {
          getAddress: async () => Promise.resolve(address),
          signTransaction: async (tx: InstanceType<typeof Transaction>) => {
            const psbtHex = hex.encode(tx.toPSBT(0));
            const signedPsbtHex = await wallet.signPsbt(psbtHex, { from: address, type: "list" });

            return Transaction.fromPSBT(hex.decode(signedPsbtHex));
          },
        };

        const toolbox = getUtxoToolbox(Chain.Bitcoin, { signer });

        return { ...toolbox, address };
      })
      .with(Chain.Cosmos, async () => {
        if (!(window.okxwallet && "keplr" in window.okxwallet)) {
          throw new SwapKitError("wallet_okx_not_found", { chain: Chain.Cosmos });
        }
        const { keplr: wallet } = window.okxwallet;

        await wallet.enable(getChainConfig(chain).chainId);
        const offlineSigner = wallet.getOfflineSignerOnlyAmino(getChainConfig(chain).chainId);
        const accounts = await offlineSigner.getAccounts();

        if (!(accounts && Array.isArray(accounts)) || accounts.length === 0) {
          throw new SwapKitError("wallet_okx_no_accounts", {
            chain: Chain.Cosmos,
            message: "No Cosmos accounts returned from OKX Wallet",
          });
        }

        const { getCosmosToolbox } = await import("@swapkit/toolboxes/cosmos");
        const [{ address }] = accounts;
        const toolbox = await getCosmosToolbox(Chain.Cosmos, { signer: offlineSigner });

        return { ...toolbox, address, transfer: cosmosTransfer(address) };
      })
      // INFO: OK wallet near is broken
      // .with(Chain.Near, async () => {
      //   if (!(window.okxwallet && "near" in window.okxwallet)) {
      //     throw new SwapKitError("wallet_okx_not_found", { chain: Chain.Near });
      //   }

      //   const { createNearSignerFromProvider } = await import("../helpers/near");
      //   const { getNearToolbox } = await import("@swapkit/toolboxes/near");

      //   const provider = window.okxwallet.near;
      //   const signer = await createNearSignerFromProvider(provider, "OKX");
      //   const accountId = await signer.getAddress();
      //   const toolbox = await getNearToolbox({ signer });

      //   return { ...toolbox, address: accountId } as NearToolbox & { address: string };
      // })
      .with(Chain.Tron, async () => {
        if (!(window.okxwallet && "tronLink" in window.okxwallet)) {
          throw new SwapKitError("wallet_okx_not_found", { chain: Chain.Tron });
        }

        const { getTronToolbox } = await import("@swapkit/toolboxes/tron");

        const tronLink = window.okxwallet.tronLink;

        const accounts = await (tronLink as { request: (args: { method: string }) => Promise<string[]> }).request({
          method: "tron_requestAccounts",
        });
        if (!accounts || accounts.length === 0) {
          throw new SwapKitError("wallet_okx_no_accounts", { chain: Chain.Tron });
        }

        const address = (tronLink as { tronWeb: { defaultAddress: { base58: string } } }).tronWeb.defaultAddress.base58;

        const signer: TronSigner = {
          getAddress: async () => address,
          signTransaction: async (transaction: TronTransaction) => {
            return (await (
              tronLink as { tronWeb: { trx: { sign: (tx: TronTransaction) => Promise<TronTransaction> } } }
            ).tronWeb.trx.sign(transaction)) as TronSignedTransaction;
          },
        };

        const toolbox = getTronToolbox({ signer });

        return { ...toolbox, address };
      })
      .with(Chain.Aptos, async () => {
        if (!(window.okxwallet && "aptos" in window.okxwallet)) {
          throw new SwapKitError("wallet_okx_not_found", { chain: Chain.Aptos });
        }

        const { createAptosExtensionTransfer, getAptosToolbox, validateAptosAddress } = await import(
          "@swapkit/toolboxes/aptos"
        );
        const aptosProvider = window.okxwallet.aptos as import("@swapkit/toolboxes/aptos").AptosExtensionProvider;

        const { address } = await aptosProvider.connect();
        if (!validateAptosAddress(address)) throw new SwapKitError("wallet_okx_not_found", { chain: Chain.Aptos });

        const toolbox = getAptosToolbox();

        return { ...toolbox, address, transfer: createAptosExtensionTransfer({ provider: aptosProvider }) };
      })
      .otherwise(() => {
        throw new SwapKitError("wallet_okx_chain_not_supported", { chain });
      })
  );
}
