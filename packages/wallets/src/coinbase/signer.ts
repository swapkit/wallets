import type { CoinbaseWalletProvider } from "@coinbase/wallet-sdk";
import type { createCoinbaseWalletSDK } from "@coinbase/wallet-sdk/dist/createCoinbaseWalletSDK.js";
import { Chain, SwapKitError } from "@swapkit/helpers";
import type { Provider, TypedDataDomain, TypedDataField } from "ethers";

async function getCoinbaseMobileSigner(walletProvider: CoinbaseWalletProvider, provider?: Provider) {
  const { AbstractSigner } = await import("ethers");

  class CoinbaseMobileSigner extends AbstractSigner {
    #coinbaseProvider: CoinbaseWalletProvider;

    constructor(coinbaseProvider: CoinbaseWalletProvider, provider?: Provider) {
      super(provider);
      this.#coinbaseProvider = coinbaseProvider;
    }

    async getAddress() {
      const accounts = await this.#coinbaseProvider.request<string[]>({ method: "eth_requestAccounts" });

      if (!accounts[0]) throw new SwapKitError("wallet_coinbase_no_accounts");

      return accounts[0];
    }

    async signTransaction() {
      return await this.#coinbaseProvider.request<string>({ method: "eth_signTransaction" });
    }

    async signMessage(message: string | Uint8Array) {
      return await this.#coinbaseProvider.request<string>({
        method: "personal_sign",
        params: [message, await this.getAddress()],
      });
    }

    async signTypedData(
      domain: TypedDataDomain,
      types: Record<string, TypedDataField[]>,
      value: Record<string, unknown>,
      explicitPrimaryType?: string,
    ) {
      const { buildEIP712DomainType } = await import("@swapkit/toolboxes/evm");
      const { TypedDataEncoder } = await import("ethers");
      const address = await this.getAddress();

      const { EIP712Domain: _, ...filteredTypes } = types;
      const primaryType = explicitPrimaryType ?? TypedDataEncoder.from(filteredTypes).primaryType;

      const payload = {
        domain,
        message: value,
        primaryType,
        types: { EIP712Domain: buildEIP712DomainType(domain), ...filteredTypes },
      };

      return await this.#coinbaseProvider.request<string>({
        method: "eth_signTypedData_v4",
        params: [address, JSON.stringify(payload)],
      });
    }

    connect(provider: Provider) {
      return new CoinbaseMobileSigner(this.#coinbaseProvider, provider);
    }
  }

  return new CoinbaseMobileSigner(walletProvider, provider);
}

export const getWalletMethods = async ({
  chain,
  coinbaseSdk,
}: {
  chain: Chain;
  coinbaseSdk: ReturnType<typeof createCoinbaseWalletSDK>;
}) => {
  switch (chain) {
    case Chain.Ethereum:
    case Chain.Avalanche:
    case Chain.Arbitrum:
    case Chain.Optimism:
    case Chain.Polygon:
    case Chain.Base:
    case Chain.BinanceSmartChain: {
      const walletProvider = coinbaseSdk.getProvider() as CoinbaseWalletProvider;
      const { getEvmToolboxAsync, getProvider } = await import("@swapkit/toolboxes/evm");

      const provider = await getProvider(chain);
      const signer = await getCoinbaseMobileSigner(walletProvider, provider);
      const toolbox = await getEvmToolboxAsync(chain, { provider, signer });
      const address = await signer.getAddress();

      return { ...toolbox, address };
    }

    default:
      throw new SwapKitError("wallet_coinbase_chain_not_supported", { chain });
  }
};
