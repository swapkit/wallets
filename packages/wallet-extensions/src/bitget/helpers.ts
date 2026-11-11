import { base64, hex } from "@scure/base";
import { Chain, type EVMChain, EVMChains, prepareNetworkSwitch, SwapKitError, WalletOption } from "@swapkit/helpers";
import type { RippleTransaction } from "@swapkit/toolboxes/ripple";
import type { SolanaProvider } from "@swapkit/toolboxes/solana";
import type { SuiChainSigner } from "@swapkit/toolboxes/sui";
import type { TronTransaction } from "@swapkit/toolboxes/tron";
import { Transaction } from "@swapkit/utxo-signer";
import type { Eip1193Provider } from "ethers";
import { getTonConnectWallet } from "../helpers/tonConnect";
import { getUtxoScriptTypeParams } from "../helpers/utxoScriptType";
import type { BitgetProviders, BitgetSolanaTransaction } from "./types";

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
  // Asked only once per site: a second eth_requestAccounts while one is open is rejected as already pending
  const [connected] = (await wallet.request({ method: "eth_accounts" })) as string[];
  const [address] = connected ? [connected] : ((await wallet.request({ method: "eth_requestAccounts" })) as string[]);
  if (!address) throw new SwapKitError("wallet_bitkeep_no_accounts", { chain });

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

async function getSolanaWalletMethods() {
  const provider = getProvider("solana", Chain.Solana);
  const connection = await provider.connect();
  const address =
    provider.publicKey?.toString() ?? connection?.publicKey?.toString() ?? connection?.accounts?.[0]?.address;
  if (!address) throw new SwapKitError("wallet_bitkeep_no_accounts", { chain: Chain.Solana });

  const { getSolanaToolbox } = await import("@swapkit/toolboxes/solana");
  const { PublicKey, Transaction: SolanaTransaction, VersionedTransaction } = await import("@solana/web3.js");
  const publicKey = new PublicKey(address);

  function messageOf(transaction: BitgetSolanaTransaction) {
    return hex.encode("version" in transaction ? transaction.message.serialize() : transaction.serializeMessage());
  }

  async function signTransaction<T extends BitgetSolanaTransaction>(transaction: T) {
    const requested = messageOf(transaction);
    const response = await provider.signTransaction(transaction);
    const bytes = Array.isArray(response) ? response[0]?.signedTransaction : undefined;
    if (Array.isArray(response) && !bytes) throw transactionFailedError(Chain.Solana, "Bitget returned no signature");

    const signed = Array.isArray(response)
      ? "version" in transaction
        ? VersionedTransaction.deserialize(bytes as Uint8Array)
        : SolanaTransaction.from(bytes as Uint8Array)
      : response;

    if (messageOf(signed) !== requested || messageOf(transaction) !== requested) {
      throw transactionFailedError(Chain.Solana, "Bitget signed a different transaction than the one requested");
    }

    if (transaction instanceof VersionedTransaction) {
      transaction.signatures = (signed as InstanceType<typeof VersionedTransaction>).signatures;
    } else {
      for (const { publicKey: signerKey, signature } of (signed as InstanceType<typeof SolanaTransaction>).signatures) {
        if (signature) transaction.addSignature(signerKey, signature);
      }
    }

    return transaction;
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
    signTransaction: async (transaction: TronTransaction) => {
      const signed = await tronWeb.trx.sign(structuredClone(transaction));

      if (signed?.txID !== transaction.txID) {
        throw transactionFailedError(Chain.Tron, "Bitget signed a different transaction than the one requested");
      }
      if (!signed.signature?.length) throw transactionFailedError(Chain.Tron, "Bitget returned no signature");

      // Bitget hands back a copy without `visible` and `raw_data_hex`, which the node then cannot read
      return { ...transaction, signature: signed.signature };
    },
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

const XRP_WALLET_FIELDS = ["Fee", "Flags", "LastLedgerSequence", "Sequence", "SigningPubKey"];

async function hashSignedXrpTransaction(blob: string) {
  const bytes = hex.decode(`54584e00${blob.toLowerCase()}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-512", new Uint8Array(bytes)));

  return hex.encode(digest.slice(0, 32)).toUpperCase();
}

async function getRippleWalletMethods() {
  const provider = getProvider("xrp", Chain.Ripple);
  const { getRippleToolbox, validateRippleAddress } = await import("@swapkit/toolboxes/ripple");

  const address = await provider.connect();
  if (!(typeof address === "string" && validateRippleAddress(address))) {
    throw new SwapKitError("wallet_bitkeep_no_accounts", { chain: Chain.Ripple });
  }

  const { decode, encode } = await import("ripple-binary-codec");

  async function signTransaction(transaction: RippleTransaction) {
    const blob = await provider.signTransaction({ ...transaction });
    if (typeof blob !== "string") throw transactionFailedError(Chain.Ripple, "Bitget returned no signed transaction");

    const { TxnSignature, ...signed } = decode(blob);
    if (!TxnSignature) throw transactionFailedError(Chain.Ripple, "Bitget returned no signature");

    // Only the fields the wallet is expected to fill in may differ from the request
    const expected: Record<string, unknown> = { ...transaction };
    for (const field of XRP_WALLET_FIELDS) {
      if (!(field in expected) && field in signed) expected[field] = signed[field];
    }

    if (encode(expected) !== encode(signed)) {
      throw transactionFailedError(Chain.Ripple, "Bitget signed a different transaction than the one requested");
    }

    return { hash: await hashSignedXrpTransaction(blob), tx_blob: blob };
  }

  const signer = { getAddress: () => Promise.resolve(address), signTransaction };

  return { ...getRippleToolbox({ signer }), address };
}

export function getWalletMethods(chain: Chain): Promise<WalletMethodsWithAddress> {
  if (EVMChains.includes(chain as EVMChain)) return getEvmWalletMethods(chain as EVMChain);

  switch (chain) {
    case Chain.Aptos:
      return getAptosWalletMethods();
    case Chain.Bitcoin:
      return getBitcoinWalletMethods();
    case Chain.Ripple:
      return getRippleWalletMethods();
    case Chain.Solana:
      return getSolanaWalletMethods();
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
