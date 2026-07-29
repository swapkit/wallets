import { type EVMChain, SwapKitError, WalletOption } from "@swapkit/helpers";
import type {
  JsonRpcProvider,
  Provider,
  TransactionRequest,
  TransactionResponse,
  TypedDataDomain,
  TypedDataField,
} from "ethers";
import { AbstractSigner } from "ethers";

import { DEFAULT_EIP155_METHODS } from "./constants";
import { chainToChainId, getAddressByChain } from "./helpers";
import type { Walletconnect } from "./index";

interface WalletconnectEVMSignerParams {
  chain: EVMChain;
  walletconnect: Walletconnect;
  provider: Provider | JsonRpcProvider;
}

class WalletconnectSigner extends AbstractSigner {
  address: string;

  private chain: EVMChain;
  private walletconnect: Walletconnect;
  readonly provider: Provider | JsonRpcProvider;

  constructor({ chain, provider, walletconnect }: WalletconnectEVMSignerParams) {
    super(provider);
    this.chain = chain;
    this.walletconnect = walletconnect;
    this.provider = provider;
    this.address = "";
  }

  // biome-ignore lint/suspicious/useAwait: fulfil implementation type
  getAddress = async () => {
    if (!this.walletconnect) {
      throw new SwapKitError("wallet_walletconnect_connection_not_established");
    }
    if (!this.address) {
      this.address = getAddressByChain(this.chain, this.walletconnect.accounts || []);
    }

    return this.address;
  };

  signMessage = async (message: string) => {
    // this is probably broken
    const txHash = (await this.walletconnect?.client.request({
      chainId: chainToChainId(this.chain),
      request: { method: DEFAULT_EIP155_METHODS.ETH_SIGN, params: [message] },
      topic: this.walletconnect.session.topic || "",
    })) as string;

    return txHash.startsWith("0x") ? txHash : `0x${txHash}`;
  };

  signTransaction = () => {
    throw new SwapKitError("wallet_walletconnect_method_not_supported", { method: "signTransaction" });

    // const baseTx = {
    //   from,
    //   to,
    //   value: BigNumber.from(value || 0).toHexString(),
    //   data,
    // };

    // const txHash = (await this.walletconnect?.client.request({
    //   chainId: chainToChainId(this.chain),
    //   topic: this.walletconnect.session.topic,
    //   request: {
    //     method: DEFAULT_EIP155_METHODS.ETH_SIGN_TRANSACTION,
    //     params: [baseTx],
    //   },
    // })) as string;

    // return txHash.startsWith('0x') ? txHash : `0x${txHash}`;
  };

  signTypedData = (
    _domain: TypedDataDomain,
    _types: Record<string, TypedDataField[]>,
    _value: Record<string, unknown>,
    _explicitPrimaryType?: string,
  ) => {
    throw new SwapKitError("wallet_walletconnect_method_not_supported", { method: "signTypedData" });
  };

  sendTransaction = async ({ from, to, value, data }: TransactionRequest) => {
    const { toHexString } = await import("@swapkit/toolboxes/evm");

    const baseTx = { data, from, to, value: toHexString(BigInt(value || 0)) };
    // eth_sendTransaction over WalletConnect resolves with the raw tx hash string, not an
    // ethers TransactionResponse — adapt it so callers reading `.hash` get the real hash.
    const txHash = (await this.walletconnect?.client.request({
      chainId: chainToChainId(this.chain),
      request: { method: DEFAULT_EIP155_METHODS.ETH_SEND_TRANSACTION, params: [baseTx] },
      topic: this.walletconnect.session.topic,
    })) as string;
    if (typeof txHash !== "string" || !txHash) {
      throw new SwapKitError("wallet_walletconnect_invalid_method", { method: "eth_sendTransaction", response: txHash });
    }
    const hash = txHash.startsWith("0x") ? txHash : `0x${txHash}`;

    return { hash } as TransactionResponse;
  };

  connect = (provider: Provider | null) => {
    if (!provider) {
      throw new SwapKitError({
        errorKey: "wallet_provider_not_found",
        info: { chain: this.chain, wallet: WalletOption.WALLETCONNECT },
      });
    }

    return new WalletconnectSigner({ chain: this.chain, provider, walletconnect: this.walletconnect });
  };
}
export const getEVMSigner = async ({ chain, walletconnect, provider }: WalletconnectEVMSignerParams) =>
  new WalletconnectSigner({ chain, provider, walletconnect });
