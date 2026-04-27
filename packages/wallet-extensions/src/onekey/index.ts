import { base64 } from "@scure/base";
import { Chain, filterSupportedChains, prepareNetworkSwitch, SwapKitError, WalletOption } from "@swapkit/helpers";
import { Transaction } from "@swapkit/utxo-signer";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import type { BitcoinProvider, GetAddressOptions, GetAddressResponse, SignTransactionOptions } from "sats-connect";
import type { ExtensionWallet } from "../walletTypes";

async function getWalletMethodsForExtension(chain: Chain) {
  switch (chain) {
    case Chain.Bitcoin: {
      if (!window.$onekey?.btc) {
        throw new SwapKitError({ errorKey: "wallet_onekey_not_found", info: { chain } });
      }

      const { getUtxoToolbox } = await import("@swapkit/toolboxes/utxo");
      const {
        signTransaction: satsSignTransaction,
        getAddress,
        AddressPurpose,
        BitcoinNetworkType,
      } = await import("sats-connect");

      let address = "";

      const getProvider = () => new Promise<BitcoinProvider>((res) => res(window.$onekey?.btc));

      const getAddressOptions: GetAddressOptions = {
        getProvider,
        onCancel: () => {
          throw new SwapKitError("wallet_connection_rejected_by_user");
        },
        onFinish: (response: GetAddressResponse) => {
          if (response.addresses[0]?.address) {
            address = response.addresses[0].address;
          }
        },
        payload: {
          message: "Address for receiving and sending payments",
          network: { type: BitcoinNetworkType.Mainnet },
          purposes: [AddressPurpose.Payment],
        },
      };

      await getAddress(getAddressOptions);

      async function signTransaction(tx: InstanceType<typeof Transaction>) {
        let signedTx: InstanceType<typeof Transaction> | undefined;
        const psbtBytes = tx.toPSBT(0);
        const psbtBase64 = base64.encode(psbtBytes);
        const inputCount = tx.inputsLength;

        const signPsbtOptions: SignTransactionOptions = {
          getProvider,
          onCancel: () => {
            throw new SwapKitError("wallet_connection_rejected_by_user");
          },
          onFinish: (response) => {
            signedTx = Transaction.fromPSBT(base64.decode(response.psbtBase64));
          },
          payload: {
            broadcast: false,
            inputsToSign: [{ address, signingIndexes: Array.from({ length: inputCount }, (_, i) => i) }],
            message: "Sign transaction",
            network: { type: BitcoinNetworkType.Mainnet },
            psbtBase64,
          },
        };

        await satsSignTransaction(signPsbtOptions);
        if (!signedTx) throw new SwapKitError("wallet_onekey_sign_transaction_error");
        return signedTx;
      }

      const signer = { getAddress: () => Promise.resolve(address), signTransaction };

      const toolbox = await getUtxoToolbox(chain, { signer });

      return { ...toolbox, address };
    }

    case Chain.Solana: {
      if (!window.$onekey?.sol) {
        throw new SwapKitError({ errorKey: "wallet_onekey_not_found", info: { chain } });
      }

      const { getSolanaToolbox } = await import("@swapkit/toolboxes/solana");

      const signer = window.$onekey.sol;
      const address = await signer.getAddress();
      const toolbox = await getSolanaToolbox({ signer });

      return { ...toolbox, address };
    }

    case Chain.Arbitrum:
    case Chain.Aurora:
    case Chain.Avalanche:
    case Chain.Base:
    case Chain.BinanceSmartChain:
    case Chain.Ethereum:
    case Chain.Gnosis:
    case Chain.Optimism:
    case Chain.Polygon:
    case Chain.XLayer: {
      const { getProvider, getEvmToolboxAsync } = await import("@swapkit/toolboxes/evm");
      if (!window.$onekey?.ethereum) {
        throw new SwapKitError({ errorKey: "wallet_onekey_not_found", info: { chain } });
      }

      const { BrowserProvider } = await import("ethers");
      const provider = new BrowserProvider(window.$onekey.ethereum, "any");

      await provider.send("eth_requestAccounts", []);
      const jsonRpcProvider = await getProvider(chain);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      const toolbox = await getEvmToolboxAsync(chain, { provider: jsonRpcProvider, signer });

      return { address, ...prepareNetworkSwitch({ chain, provider, toolbox }) };
    }

    default:
      throw new SwapKitError({ errorKey: "wallet_chain_not_supported", info: { chain, wallet: WalletOption.ONEKEY } });
  }
}

export const onekeyWallet: ExtensionWallet<"connectOnekeyWallet"> = createWallet({
  connect: ({ addChain, walletType, supportedChains }) =>
    async function connectOnekeyWallet(chains: Chain[]) {
      if (!window.$onekey) {
        throw new SwapKitError({ errorKey: "wallet_onekey_not_found", info: { wallet: WalletOption.ONEKEY } });
      }

      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });

      await Promise.all(
        filteredChains.map(async (chain) => {
          const walletMethods = await getWalletMethodsForExtension(chain);

          const address = (await walletMethods.getAddress()) || "F";

          addChain({ ...walletMethods, address, chain, walletType });
        }),
      );

      return true;
    },
  directSigningSupport: {
    [Chain.Arbitrum]: true,
    [Chain.Aurora]: true,
    [Chain.Avalanche]: true,
    [Chain.Base]: true,
    [Chain.BinanceSmartChain]: true,
    [Chain.Bitcoin]: true,
    [Chain.Ethereum]: true,
    [Chain.Gnosis]: true,
    [Chain.Optimism]: true,
    [Chain.Polygon]: true,
    [Chain.Solana]: true,
    [Chain.XLayer]: true,
  },
  name: "connectOnekeyWallet",
  supportedChains: [
    Chain.Arbitrum,
    Chain.Aurora,
    Chain.Avalanche,
    Chain.Base,
    Chain.BinanceSmartChain,
    Chain.Bitcoin,
    Chain.Ethereum,
    Chain.Gnosis,
    Chain.Optimism,
    Chain.Polygon,
    Chain.Solana,
    Chain.XLayer,
  ],
  walletType: WalletOption.ONEKEY,
});

export const ONEKEY_WALLET_SUPPORTED_CHAINS = getWalletSupportedChains(onekeyWallet);
