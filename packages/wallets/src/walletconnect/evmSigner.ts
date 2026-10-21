import { type EVMChain, SwapKitError, WalletOption } from "@swapkit/helpers";
import type {
  JsonRpcProvider,
  Provider,
  TransactionRequest,
  TransactionResponse,
  TypedDataDomain,
  TypedDataField,
} from "ethers";
import { AbstractSigner, hexlify, TypedDataEncoder, toUtf8Bytes } from "ethers";

import { DEFAULT_EIP155_METHODS } from "./constants";
import { chainToChainId, getAddressByChain } from "./helpers";
import type { Walletconnect } from "./index";

interface WalletconnectEVMSignerParams {
  chain: EVMChain;
  walletconnect: Walletconnect;
  provider: Provider | JsonRpcProvider;
}

function toHexSignature(signature: unknown, method: DEFAULT_EIP155_METHODS) {
  if (typeof signature !== "string" || !signature) {
    throw new SwapKitError("wallet_walletconnect_invalid_method", { method, response: signature });
  }

  return signature.startsWith("0x") ? signature : `0x${signature}`;
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

  signMessage = async (message: string | Uint8Array) => {
    const session = this.walletconnect?.session;
    if (!session) {
      throw new SwapKitError("wallet_walletconnect_connection_not_established");
    }

    const address = await this.getAddress();
    const hexMessage = hexlify(typeof message === "string" ? toUtf8Bytes(message) : message);
    const signature = await this.walletconnect.client.request({
      chainId: chainToChainId(this.chain),
      request: { method: DEFAULT_EIP155_METHODS.PERSONAL_SIGN, params: [hexMessage, address] },
      topic: session.topic,
    });

    return toHexSignature(signature, DEFAULT_EIP155_METHODS.PERSONAL_SIGN);
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

  signTypedData = async (
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>,
  ) => {
    const session = this.walletconnect?.session;
    if (!session) {
      throw new SwapKitError("wallet_walletconnect_connection_not_established");
    }

    const { EIP712Domain: _domainType, ...messageTypes } = types;
    const payload = TypedDataEncoder.getPayload(domain, messageTypes, value);
    const address = await this.getAddress();
    const signature = await this.walletconnect.client.request({
      chainId: chainToChainId(this.chain),
      request: { method: DEFAULT_EIP155_METHODS.ETH_SIGN_TYPED_DATA_V4, params: [address, JSON.stringify(payload)] },
      topic: session.topic,
    });

    return toHexSignature(signature, DEFAULT_EIP155_METHODS.ETH_SIGN_TYPED_DATA_V4);
  };

  sendTransaction = async ({ from, to, value, data }: TransactionRequest) => {
    const session = this.walletconnect?.session;
    if (!session) {
      throw new SwapKitError("wallet_walletconnect_connection_not_established");
    }

    const { toHexString } = await import("@swapkit/toolboxes/evm");

    const baseTx = { data, from, to, value: toHexString(BigInt(value || 0)) };
    // eth_sendTransaction over WalletConnect resolves with the raw tx hash string, not an
    // ethers TransactionResponse — adapt it so callers reading `.hash` get the real hash.
    const txHash = (await this.walletconnect?.client.request({
      chainId: chainToChainId(this.chain),
      request: { method: DEFAULT_EIP155_METHODS.ETH_SEND_TRANSACTION, params: [baseTx] },
      topic: session.topic,
    })) as string;
    if (typeof txHash !== "string" || !txHash) {
      throw new SwapKitError("wallet_walletconnect_invalid_method", {
        method: "eth_sendTransaction",
        response: txHash,
      });
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
