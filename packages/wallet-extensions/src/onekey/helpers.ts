import { base64, hex } from "@scure/base";
import { Chain, type EVMChain, EVMChains, prepareNetworkSwitch, SwapKitError, WalletOption } from "@swapkit/helpers";
import type { NearSigner } from "@swapkit/toolboxes/near";
import type { StellarSigner } from "@swapkit/toolboxes/stellar";
import type { TronSigner } from "@swapkit/toolboxes/tron";
import { Transaction } from "@swapkit/utxo-signer";
import { getTonConnectWallet } from "../helpers/tonConnect";
import { getUtxoScriptTypeParams } from "../helpers/utxoScriptType";

type WalletMethodsWithAddress = Record<string, unknown> & { address: string };

const TRON_USER_REJECTED = 4000;

function getProvider<Key extends keyof NonNullable<Window["$onekey"]>>(key: Key, chain: Chain) {
  const provider = window.$onekey?.[key];
  if (!provider) {
    throw new SwapKitError({ errorKey: "wallet_onekey_not_found", info: { chain } });
  }

  return provider as NonNullable<NonNullable<Window["$onekey"]>[Key]>;
}

function signingError(chain: Chain, reason: string) {
  return new SwapKitError({ errorKey: "wallet_onekey_sign_transaction_error", info: { chain, reason } });
}

function mainnetOnlyError(chain: Chain) {
  return new SwapKitError({
    errorKey: "wallet_chain_not_supported",
    info: { chain, message: "Mainnet only", wallet: WalletOption.ONEKEY },
  });
}

function connectionRejectedError(chain: Chain) {
  return new SwapKitError("wallet_connection_rejected_by_user", { chain, wallet: WalletOption.ONEKEY });
}

function connectionFailedError(chain: Chain, info?: Record<string, unknown>) {
  return new SwapKitError({
    errorKey: "core_wallet_connection_failed",
    info: { chain, wallet: WalletOption.ONEKEY, ...info },
  });
}

async function getBitcoinWalletMethods() {
  const wallet = getProvider("btc", Chain.Bitcoin);
  const [address] = await wallet.requestAccounts();
  if (!address) throw connectionRejectedError(Chain.Bitcoin);
  if ((await wallet.getNetwork()) !== "livenet") throw mainnetOnlyError(Chain.Bitcoin);

  const { getUtxoToolbox } = await import("@swapkit/toolboxes/utxo");

  async function signTransaction(tx: InstanceType<typeof Transaction>) {
    const signedPsbtHex = await wallet.signPsbt(hex.encode(tx.toPSBT(0)), { autoFinalized: false });
    return Transaction.fromPSBT(hex.decode(signedPsbtHex));
  }

  const signer = { getAddress: () => Promise.resolve(address), signTransaction };
  const toolbox = await getUtxoToolbox(Chain.Bitcoin, {
    ...(await getUtxoScriptTypeParams({ address, chain: Chain.Bitcoin })),
    signer,
  });

  return { ...toolbox, address };
}

async function getSolanaWalletMethods() {
  const provider = getProvider("solana", Chain.Solana);
  const { getSolanaToolbox } = await import("@swapkit/toolboxes/solana");
  const { publicKey } = await provider.connect();

  return { ...getSolanaToolbox({ signer: provider }), address: publicKey.toString() };
}

async function getEvmWalletMethods(chain: EVMChain) {
  const ethereum = getProvider("ethereum", chain);
  const { getProvider: getEvmProvider, getEvmToolboxAsync } = await import("@swapkit/toolboxes/evm");
  const { BrowserProvider } = await import("ethers");
  const provider = new BrowserProvider(ethereum, "any");

  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const toolbox = await getEvmToolboxAsync(chain, { provider: await getEvmProvider(chain), signer });

  return { address, ...prepareNetworkSwitch({ chain, provider, toolbox }) };
}

async function getTronWalletMethods() {
  const provider = getProvider("tron", Chain.Tron);
  const response = await provider.request({ method: "tron_requestAccounts" });
  // OneKey answers 4000 when the user declines and other codes, such as a request already queued, otherwise
  if (response.code === TRON_USER_REJECTED) throw connectionRejectedError(Chain.Tron);
  if (response.code !== 200)
    throw connectionFailedError(Chain.Tron, { code: response.code, message: response.message });

  // The injected tronWeb can lag behind an existing connection, so the address comes from OneKey itself
  const [address] = await provider.request({ method: "tron_accounts" });
  if (!address) throw connectionFailedError(Chain.Tron);

  const { getTronToolbox } = await import("@swapkit/toolboxes/tron");

  const signer: TronSigner = {
    getAddress: () => Promise.resolve(address),
    signTransaction: async (transaction) => {
      const { signature, txID } = await provider.sign(transaction);

      if (txID !== transaction.txID) {
        throw signingError(Chain.Tron, "OneKey signed a different transaction than the one requested");
      }
      if (!signature?.length) throw signingError(Chain.Tron, "OneKey returned no signature");

      return { ...transaction, signature };
    },
  };

  return { ...getTronToolbox({ signer }), address };
}

async function getCardanoWalletMethods() {
  const api = await getProvider("cardano", Chain.Cardano).enable();
  if ((await api.getNetworkId()) !== 1) throw mainnetOnlyError(Chain.Cardano);

  const { addCardanoVkeyWitnesses, decodeCardanoWitnessSet, getCardanoAddressFromBytes, getCardanoToolbox } =
    await import("@swapkit/toolboxes/cardano");

  const changeAddress = await api.getChangeAddress();
  const address = changeAddress.startsWith("addr")
    ? changeAddress
    : await getCardanoAddressFromBytes(hex.decode(changeAddress));

  const signer = {
    address,
    connect: () => Promise.resolve({ address }),
    disconnect: () => Promise.resolve(),
    getAddress: () => Promise.resolve(address),
    signTransaction: async (transaction: string) =>
      addCardanoVkeyWitnesses(transaction, await decodeCardanoWitnessSet(await api.signTx(transaction))),
  };

  return { ...getCardanoToolbox({ signer }), address };
}

async function getStellarWalletMethods() {
  const provider = getProvider("stellar", Chain.Stellar);
  const { address } = await provider.getAddress();
  const { Networks, TransactionBuilder } = await import("@stellar/stellar-sdk");
  if ((await provider.getNetwork()).networkPassphrase !== Networks.PUBLIC) throw mainnetOnlyError(Chain.Stellar);

  const { getStellarToolbox } = await import("@swapkit/toolboxes/stellar");

  const signer: StellarSigner = {
    getAddress: () => address,
    signTransaction: async (transaction) => {
      const { signedTxXdr } = await provider.signTransaction(transaction.toXDR(), {
        networkPassphrase: Networks.PUBLIC,
      });
      const signed = TransactionBuilder.fromXDR(signedTxXdr, Networks.PUBLIC);

      if (!signed.hash().equals(transaction.hash())) {
        throw signingError(Chain.Stellar, "OneKey signed a different transaction than the one requested");
      }

      const existing = new Set(transaction.signatures.map((entry) => entry.signature().toString("base64")));
      const added = signed.signatures.filter((entry) => !existing.has(entry.signature().toString("base64")));
      if (!added.length) throw signingError(Chain.Stellar, "OneKey returned no signature");

      for (const entry of added) transaction.addDecoratedSignature(entry);
      return transaction;
    },
  };

  return { ...getStellarToolbox({ signer }), address };
}

async function requestNear<Result>(method: string, params?: unknown) {
  const bridge = getProvider("jsBridge", Chain.Near);
  const response = await bridge.request({ data: { method, params }, scope: "near" });
  return response?.result as Result | undefined;
}

async function getNearWalletMethods() {
  const result = await requestNear<{ accounts?: { accountId: string; publicKey: string }[] }>("near_requestAccounts");
  const account = result?.accounts?.[0];
  if (!account?.accountId) throw connectionRejectedError(Chain.Near);

  const network = await requestNear<{ networkId: string }>("near_network");
  if (network?.networkId !== "mainnet") throw mainnetOnlyError(Chain.Near);

  const { getNearToolbox } = await import("@swapkit/toolboxes/near");

  const notSupported = (method: string) =>
    Promise.reject(new SwapKitError("wallet_near_method_not_supported", { method, wallet: WalletOption.ONEKEY }));

  // OneKey only signs and sends NEAR transactions, so the toolbox falls back to signAndSendTransactions
  const signer = {
    getAddress: () => Promise.resolve(account.accountId),
    async getPublicKey() {
      const { PublicKey } = await import("@near-js/crypto");
      return PublicKey.fromString(account.publicKey);
    },
    async signAndSendTransactions({ transactions }: { transactions: { encode: () => Uint8Array }[] }) {
      const response = await requestNear<{ transactionHashes?: string[] }>("near_requestSignTransactions", [
        { meta: {}, send: true, transactions: transactions.map((transaction) => base64.encode(transaction.encode())) },
      ]);

      if (!response?.transactionHashes?.length) throw signingError(Chain.Near, "OneKey returned no transaction hash");
      return response.transactionHashes;
    },
    signDelegateAction: () => notSupported("signDelegateAction"),
    signNep413Message: () => notSupported("signNep413Message"),
    signTransaction: () => notSupported("signTransaction"),
  };

  return { ...getNearToolbox({ signer: signer as unknown as NearSigner }), address: account.accountId };
}

function getTonWalletMethods() {
  return getTonConnectWallet({
    bridge: getProvider("tonconnect", Chain.Ton),
    mainnetOnlyError: () => mainnetOnlyError(Chain.Ton),
    noAccountError: () => connectionFailedError(Chain.Ton),
    wallet: WalletOption.ONEKEY,
  });
}

export function getWalletMethods(chain: Chain): Promise<WalletMethodsWithAddress> {
  if (EVMChains.includes(chain as EVMChain)) return getEvmWalletMethods(chain as EVMChain);

  switch (chain) {
    case Chain.Bitcoin:
      return getBitcoinWalletMethods();
    case Chain.Cardano:
      return getCardanoWalletMethods();
    case Chain.Near:
      return getNearWalletMethods();
    case Chain.Solana:
      return getSolanaWalletMethods();
    case Chain.Stellar:
      return getStellarWalletMethods();
    case Chain.Ton:
      return getTonWalletMethods();
    case Chain.Tron:
      return getTronWalletMethods();
    default:
      throw new SwapKitError({ errorKey: "wallet_chain_not_supported", info: { chain, wallet: WalletOption.ONEKEY } });
  }
}
