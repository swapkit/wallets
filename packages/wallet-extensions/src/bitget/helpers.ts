import { base64, hex } from "@scure/base";
import {
  Chain,
  type EVMChain,
  EVMChains,
  GAIAConfig,
  type GenericTransferParams,
  prepareNetworkSwitch,
  SwapKitError,
  WalletOption,
} from "@swapkit/helpers";
import type { NearSigner } from "@swapkit/toolboxes/near";
import type { RippleTransaction } from "@swapkit/toolboxes/ripple";
import type { SolanaProvider } from "@swapkit/toolboxes/solana";
import type { SuiChainSigner } from "@swapkit/toolboxes/sui";
import type { TronTransaction } from "@swapkit/toolboxes/tron";
import { Transaction } from "@swapkit/utxo-signer";
import type { Eip1193Provider } from "ethers";
import { getTonConnectWallet } from "../helpers/tonConnect";
import { getUtxoScriptTypeParams } from "../helpers/utxoScriptType";
import type { BitgetNearAction, BitgetNearResponse, BitgetProviders, BitgetSolanaTransaction } from "./types";

const SUI_MAINNET = "sui:mainnet";

type WalletMethodsWithAddress = Record<string, unknown> & { address: string };

function notFoundError(chain: Chain) {
  return new SwapKitError("wallet_bitkeep_not_found", { chain });
}

function getProvider<Key extends keyof BitgetProviders>(key: Key, chain: Chain) {
  const provider = window.bitkeep?.[key];
  if (!provider) throw notFoundError(chain);

  return provider as BitgetProviders[Key];
}

function mainnetOnlyError(chain: Chain) {
  return new SwapKitError({
    errorKey: "wallet_chain_not_supported",
    info: { chain, message: "Mainnet only", wallet: WalletOption.BITGET },
  });
}

function connectionRejectedError(chain: Chain) {
  return new SwapKitError("wallet_connection_rejected_by_user", { chain, wallet: WalletOption.BITGET });
}

function transactionFailedError(chain: Chain, error?: unknown) {
  return new SwapKitError("core_transaction_failed", { chain, error, wallet: WalletOption.BITGET });
}

async function getEvmWalletMethods(chain: EVMChain) {
  const wallet = getProvider("ethereum", chain);
  const [address] = (await wallet.request({ method: "eth_requestAccounts" })) as [string, ...string[]];
  const evmWallet = await getWeb3WalletMethods({ chain, walletProvider: wallet });

  return { ...evmWallet, address };
}

async function getBitcoinWalletMethods() {
  const wallet = getProvider("unisat", Chain.Bitcoin);
  const [address] = await wallet.requestAccounts();
  if (!address) throw connectionRejectedError(Chain.Bitcoin);
  if (wallet.getNetwork && (await wallet.getNetwork()) !== "livenet") throw mainnetOnlyError(Chain.Bitcoin);

  const { getUtxoToolbox } = await import("@swapkit/toolboxes/utxo");

  async function signTransaction(tx: InstanceType<typeof Transaction>) {
    const signedPsbtHex = await wallet.signPsbt(hex.encode(tx.toPSBT(0)), { autoFinalized: false });

    return Transaction.fromPSBT(hex.decode(signedPsbtHex));
  }

  const signer = { getAddress: () => Promise.resolve(address), signTransaction };
  const toolbox = getUtxoToolbox(Chain.Bitcoin, {
    ...(await getUtxoScriptTypeParams({ address, chain: Chain.Bitcoin })),
    signer,
  });

  return { ...toolbox, address };
}

async function getCosmosWalletMethods() {
  const wallet = getProvider("keplr", Chain.Cosmos);

  await wallet.enable(GAIAConfig.chainId);
  const offlineSigner = await wallet.getOfflineSignerAuto(GAIAConfig.chainId);
  const accounts = await offlineSigner.getAccounts();
  if (!accounts?.[0]) throw new SwapKitError("wallet_bitkeep_no_accounts", { chain: Chain.Cosmos });

  const { getCosmosToolbox } = await import("@swapkit/toolboxes/cosmos");
  const [{ address }] = accounts;
  const signer = Object.assign(offlineSigner, { getAddress: () => Promise.resolve(address) });

  return { ...getCosmosToolbox(Chain.Cosmos, { signer }), address };
}

async function getSolanaWalletMethods() {
  const provider = getProvider("solana", Chain.Solana);
  const connection = await provider.connect();
  const address =
    provider.publicKey?.toString() ?? connection?.publicKey?.toString() ?? connection?.accounts?.[0]?.address;
  if (!address) throw new SwapKitError("wallet_bitkeep_no_accounts", { chain: Chain.Solana });

  const { getSolanaToolbox } = await import("@swapkit/toolboxes/solana");
  const { PublicKey, Transaction: SolanaTransaction, VersionedTransaction } = await import("@solana/web3.js");
  const publicKey = new PublicKey(address);

  async function signTransaction<T extends BitgetSolanaTransaction>(transaction: T) {
    const signed = await provider.signTransaction(transaction);
    if (!Array.isArray(signed)) return signed as T;

    const bytes = signed[0]?.signedTransaction;
    if (!bytes) throw transactionFailedError(Chain.Solana);

    return ("version" in transaction ? VersionedTransaction.deserialize(bytes) : SolanaTransaction.from(bytes)) as T;
  }

  const signer: SolanaProvider = {
    connect: () => Promise.resolve({ publicKey }),
    disconnect: () => provider.disconnect(),
    publicKey,
    signTransaction,
  };

  return { ...getSolanaToolbox({ signer }), address };
}

async function getTronWalletMethods() {
  const tronLink = getProvider("tronLink", Chain.Tron);
  const tronWeb = getProvider("tronWeb", Chain.Tron);
  const response = await tronLink.request({ method: "tron_requestAccounts" });

  if (response.code !== 200) {
    throw new SwapKitError("wallet_connection_rejected_by_user", {
      message: response.message || "User rejected connection",
    });
  }

  const address = tronWeb.defaultAddress?.base58;
  if (!address) throw new SwapKitError("wallet_bitkeep_no_accounts", { chain: Chain.Tron });

  const { getTronToolbox } = await import("@swapkit/toolboxes/tron");
  const signer = {
    getAddress: () => Promise.resolve(address),
    signTransaction: (transaction: TronTransaction) => tronWeb.trx.sign(transaction),
  };

  return { ...getTronToolbox({ signer }), address };
}

async function getAptosWalletMethods() {
  const { createAptosExtensionTransfer, getAptosToolbox, validateAptosAddress } = await import(
    "@swapkit/toolboxes/aptos"
  );
  const aptosProvider = getProvider("aptos", Chain.Aptos) as import("@swapkit/toolboxes/aptos").AptosExtensionProvider;

  const { address } = await aptosProvider.connect();
  if (!validateAptosAddress(address)) throw notFoundError(Chain.Aptos);

  return { ...getAptosToolbox(), address, transfer: createAptosExtensionTransfer({ provider: aptosProvider }) };
}

function getTonWalletMethods() {
  const bridge = window.bitgetTonWallet?.tonconnect;
  if (!bridge) throw notFoundError(Chain.Ton);

  return getTonConnectWallet({
    bridge,
    mainnetOnlyError: () => mainnetOnlyError(Chain.Ton),
    noAccountError: () => new SwapKitError("wallet_bitkeep_no_accounts", { chain: Chain.Ton }),
    wallet: WalletOption.BITGET,
  });
}

async function getSuiWalletMethods() {
  const provider = getProvider("suiWallet", Chain.Sui);
  const { accounts } = await provider.connect();
  const account = accounts.find(({ chains }) => !chains || chains.includes(SUI_MAINNET));
  if (!account?.address) throw mainnetOnlyError(Chain.Sui);

  const { getSuiToolbox } = await import("@swapkit/toolboxes/sui");

  const signer: SuiChainSigner = {
    getAddress: () => account.address,
    signTransaction: async (txBytes: Uint8Array) => {
      const serialized = base64.encode(txBytes);
      const transaction = { serialize: () => serialized, toJSON: () => Promise.resolve(serialized) };
      const signed = await provider.signTransaction({ account, chain: SUI_MAINNET, transaction });

      if (signed.bytes !== serialized) {
        throw new SwapKitError("toolbox_sui_signing_error", {
          chain: Chain.Sui,
          message: "Bitget signed a different transaction than the one requested",
        });
      }

      return { bytes: serialized, signature: signed.signature };
    },
    toSuiAddress: () => account.address,
  };

  return { ...getSuiToolbox({ signer }), address: account.address };
}

async function getStarknetWalletMethods() {
  const provider = window.starknet_bitkeep;
  if (!provider) throw notFoundError(Chain.Starknet);

  await provider.enable();
  const { account } = provider;
  if (!account) throw new SwapKitError("wallet_bitkeep_no_accounts", { chain: Chain.Starknet });

  const { getStarknetToolbox } = await import("@swapkit/toolboxes/starknet");

  return { ...getStarknetToolbox({ signer: account, walletDeploysAccount: true }), address: account.address };
}

type NearAction = {
  functionCall?: { methodName: string; args: Uint8Array; gas: bigint; deposit: bigint };
  transfer?: { deposit: bigint };
};

// Bitget takes NEAR actions in the wallet-selector JSON form instead of the borsh classes
export function toBitgetNearAction({ functionCall, transfer }: NearAction): BitgetNearAction {
  if (transfer) return { params: { deposit: transfer.deposit.toString() }, type: "Transfer" };

  if (functionCall) {
    return {
      params: {
        args: JSON.parse(new TextDecoder().decode(functionCall.args) || "{}"),
        deposit: functionCall.deposit.toString(),
        gas: functionCall.gas.toString(),
        methodName: functionCall.methodName,
      },
      type: "FunctionCall",
    };
  }

  throw new SwapKitError("wallet_near_method_not_supported", { method: "action", wallet: WalletOption.BITGET });
}

function readNearResponse({ error, response }: BitgetNearResponse) {
  if (error) throw transactionFailedError(Chain.Near, error);
  if (!(Array.isArray(response) && response.length)) throw transactionFailedError(Chain.Near, response);

  return response;
}

async function getNearWalletMethods() {
  const provider = getProvider("near", Chain.Near);

  if (!(provider.isSignedIn() && provider.getAccountId())) {
    const { accessKey, error } = await provider.requestSignIn({ contractId: "", methodNames: [] });
    if (!accessKey || error) throw connectionRejectedError(Chain.Near);
  }

  const address = provider.getAccountId();
  if (!address) throw new SwapKitError("wallet_bitkeep_no_accounts", { chain: Chain.Near });

  const { getNearToolbox } = await import("@swapkit/toolboxes/near");

  const notSupported = (method: string) =>
    Promise.reject(new SwapKitError("wallet_near_method_not_supported", { method, wallet: WalletOption.BITGET }));

  // Bitget only signs and sends NEAR transactions, so the toolbox falls back to signAndSendTransaction
  const signer = {
    getAddress: () => Promise.resolve(address),
    async getPublicKey() {
      const { PublicKey } = await import("@near-js/crypto");
      return PublicKey.fromString((await provider.getPublicKey()).toString());
    },
    async signAndSendTransaction({ actions, receiverId }: { actions: NearAction[]; receiverId?: string }) {
      if (!receiverId) throw transactionFailedError(Chain.Near, "Missing receiver");

      return readNearResponse(
        await provider.signAndSendTransaction({ actions: actions.map(toBitgetNearAction), receiverId }),
      );
    },
    signDelegateAction: () => notSupported("signDelegateAction"),
    signNep413Message: () => notSupported("signNep413Message"),
    signTransaction: () => notSupported("signTransaction"),
  };

  return { ...getNearToolbox({ signer: signer as unknown as NearSigner }), address };
}

function readXrpAddress(connection: unknown) {
  if (typeof connection === "string") return connection;
  if (!(connection && typeof connection === "object")) return undefined;

  const { address, account } = connection as { address?: unknown; account?: unknown };
  return [address, account].find((value): value is string => typeof value === "string");
}

function readXrpHash(result: unknown) {
  if (typeof result === "string") return result;
  if (!(result && typeof result === "object")) return undefined;

  const { hash, txid } = result as { hash?: unknown; txid?: unknown };
  return [hash, txid].find((value): value is string => typeof value === "string");
}

async function getRippleWalletMethods() {
  const provider = getProvider("xrp", Chain.Ripple);
  const { getRippleToolbox, validateRippleAddress } = await import("@swapkit/toolboxes/ripple");

  const address = readXrpAddress(await provider.connect());
  if (!(address && validateRippleAddress(address))) {
    throw new SwapKitError("wallet_bitkeep_no_accounts", { chain: Chain.Ripple });
  }

  const toolbox = getRippleToolbox();

  // Bitget signs and submits XRP transactions itself and never hands back a signed blob
  async function signAndBroadcastTransaction(transaction: RippleTransaction) {
    const hash = readXrpHash(await provider.sendTransaction({ ...transaction }));
    if (!hash) throw transactionFailedError(Chain.Ripple);

    return hash;
  }

  async function transfer({ assetValue, memo, recipient, sweep }: GenericTransferParams) {
    const transaction = await toolbox.createTransaction({ assetValue, memo, recipient, sender: address, sweep });
    return signAndBroadcastTransaction(transaction);
  }

  return {
    ...toolbox,
    address,
    getAddress: () => Promise.resolve(address),
    getBalance: () => toolbox.getBalance(address),
    signAndBroadcastTransaction,
    transfer,
  };
}

export function getWalletMethods(chain: Chain): Promise<WalletMethodsWithAddress> {
  if (EVMChains.includes(chain as EVMChain)) return getEvmWalletMethods(chain as EVMChain);

  switch (chain) {
    case Chain.Aptos:
      return getAptosWalletMethods();
    case Chain.Bitcoin:
      return getBitcoinWalletMethods();
    case Chain.Cosmos:
      return getCosmosWalletMethods();
    case Chain.Near:
      return getNearWalletMethods();
    case Chain.Ripple:
      return getRippleWalletMethods();
    case Chain.Solana:
      return getSolanaWalletMethods();
    case Chain.Starknet:
      return getStarknetWalletMethods();
    case Chain.Sui:
      return getSuiWalletMethods();
    case Chain.Ton:
      return getTonWalletMethods();
    case Chain.Tron:
      return getTronWalletMethods();
    default:
      throw new SwapKitError({ errorKey: "wallet_chain_not_supported", info: { chain, wallet: WalletOption.BITGET } });
  }
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

  return prepareNetworkSwitch({ chain, provider, toolbox });
};
