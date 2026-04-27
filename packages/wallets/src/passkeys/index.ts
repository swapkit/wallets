import type { Wallet } from "@passkeys/core";
import { base64 } from "@scure/base";
import {
  Chain,
  EVMChains,
  filterSupportedChains,
  prepareNetworkSwitch,
  SKConfig,
  SwapKitError,
  WalletOption,
} from "@swapkit/helpers";
import type { SolanaProvider } from "@swapkit/toolboxes/solana";
import { Transaction } from "@swapkit/utxo-signer";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import {
  AddressPurpose,
  BitcoinNetworkType,
  type GetAddressOptions,
  type GetAddressResponse,
  getAddress,
  type SignTransactionOptions,
  signTransaction as satsSignTransaction,
} from "sats-connect";
import { match } from "ts-pattern";

async function getPasskeyWallet() {
  const appId = SKConfig.get("apiKeys").passkeys;
  const { createWallet } = await import("@passkeys/core");

  return createWallet({
    appId: appId.length > 0 ? appId : undefined,
    providers: { bitcoin: true, ethereum: true, solana: true },
  });
}

function getWalletMethods({ wallet, chain: paramChain }: { wallet: Wallet; chain: Chain }) {
  return match(paramChain)
    .with(Chain.Bitcoin, async (chain) => {
      const { getUtxoToolbox } = await import("@swapkit/toolboxes/utxo");
      const provider = await wallet.getProvider("bitcoin");

      if (!provider) {
        throw new SwapKitError("wallet_passkeys_not_found");
      }

      let address = "";

      const getProvider = () => Promise.resolve(provider);

      const getAddressOptions: GetAddressOptions = {
        getProvider,
        onCancel: () => {
          throw new SwapKitError("wallet_passkeys_request_canceled");
        },
        onFinish: (response: GetAddressResponse) => {
          if (!response.addresses[0]) throw new SwapKitError("wallet_passkeys_no_address");
          address = response.addresses[0].address;
        },
        payload: {
          message: "Address for receiving and sending payments",
          network: { type: BitcoinNetworkType.Mainnet },
          purposes: [AddressPurpose.Payment],
        },
      };

      // TODO: Towan - probably not needed ?
      await getAddress(getAddressOptions);

      async function signTransaction(tx: InstanceType<typeof Transaction>) {
        let signedTx: InstanceType<typeof Transaction> | undefined;
        const psbtBytes = tx.toPSBT(0);
        const psbtBase64Str = base64.encode(psbtBytes);
        const inputCount = tx.inputsLength;

        const signPsbtOptions: SignTransactionOptions = {
          getProvider,
          onCancel: () => {
            throw new SwapKitError("wallet_passkeys_signature_canceled");
          },
          onFinish: (response) => {
            signedTx = Transaction.fromPSBT(base64.decode(response.psbtBase64));
          },
          payload: {
            broadcast: false,
            inputsToSign: [{ address: address, signingIndexes: Array.from({ length: inputCount }, (_, i) => i) }],
            message: "Sign transaction",
            network: { type: BitcoinNetworkType.Mainnet },
            psbtBase64: psbtBase64Str,
          },
        };

        await satsSignTransaction(signPsbtOptions);
        if (!signedTx) throw new SwapKitError("wallet_passkeys_sign_transaction_error");
        return signedTx;
      }

      const signer = { getAddress: () => Promise.resolve(address), signTransaction };
      const toolbox = await getUtxoToolbox(chain, { signer });

      return { ...toolbox, address };
    })
    .with(...EVMChains, async (chain) => {
      const { getProvider, getEvmToolboxAsync } = await import("@swapkit/toolboxes/evm");
      const { BrowserProvider } = await import("ethers");

      const walletProvider = await wallet.getProvider("ethereum");
      if (!walletProvider) {
        throw new SwapKitError("wallet_passkeys_not_found");
      }

      const jsonRpcProvider = await getProvider(chain);
      const browserProvider = new BrowserProvider(walletProvider, "any");

      await browserProvider.send("eth_requestAccounts", []);

      const signer = await browserProvider.getSigner();
      const address = await signer.getAddress();
      const toolbox = await getEvmToolboxAsync(chain, { provider: jsonRpcProvider, signer });

      return { ...prepareNetworkSwitch({ chain, provider: browserProvider, toolbox }), address };
    })
    .with(Chain.Solana, async () => {
      const { getSolanaToolbox } = await import("@swapkit/toolboxes/solana");
      const provider = (await wallet.getProvider("solana")) as any as SolanaProvider;
      const providerConnection = await provider.connect();
      const address = providerConnection.publicKey.toString();
      const toolbox = await getSolanaToolbox({ signer: provider });

      const disconnect = async () => {
        await provider.disconnect();
      };

      return { ...toolbox, address, disconnect };
    })
    .otherwise((chain) => {
      throw new SwapKitError("wallet_passkeys_chain_not_supported", { chain });
    });
}

export const passkeysWallet = createWallet({
  connect: ({ addChain, walletType, supportedChains }) =>
    async function connectPasskeys(chains: Chain[], paramWallet?: Wallet) {
      const wallet = paramWallet || (await getPasskeyWallet());

      if (!wallet) throw new SwapKitError("wallet_passkeys_instance_missing");
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });

      await Promise.all(
        filteredChains.map(async (chain) => {
          try {
            const walletData = await getWalletMethods({ chain, wallet });

            const { address, ...walletMethods } = walletData;

            addChain({
              ...walletMethods,
              address,
              chain,
              disconnect: wallet.disconnect,
              walletType: WalletOption.PASSKEYS,
            });
          } catch (error) {
            console.error(`Failed to connect ${chain} wallet:`, error);
            throw error;
          }
        }),
      );

      return true;
    },
  directSigningSupport: {
    ...Object.fromEntries(EVMChains.map((chain) => [chain, true])),
    [Chain.Bitcoin]: true,
    [Chain.Solana]: true,
  },
  name: "connectPasskeys",
  supportedChains: [...EVMChains, Chain.Bitcoin, Chain.Solana],
  walletType: WalletOption.PASSKEYS,
});

export const PASSKEYS_SUPPORTED_CHAINS = getWalletSupportedChains(passkeysWallet);
export * from "@passkeys/core";
export * from "@passkeys/react";
