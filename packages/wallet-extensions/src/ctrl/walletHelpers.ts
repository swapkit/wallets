import type { Keplr } from "@keplr-wallet/types";
import {
  type AssetValue,
  Chain,
  ChainToChainId,
  type CosmosChain,
  CosmosChainPrefixes,
  type EVMChain,
  EVMChains,
  type FeeOption,
  getChainConfig,
  providerRequest,
  SwapKitError,
  type TCLikeChain,
  WalletOption,
} from "@swapkit/helpers";
import { base64ToBech32 } from "@swapkit/toolboxes/cosmos";
import type { SolanaProvider } from "@swapkit/toolboxes/solana";
import type { Eip1193Provider } from "ethers";
import { match } from "ts-pattern";

type TransactionMethod = "transfer" | "deposit";

type TransactionParams = {
  asset: string | { chain: string; symbol: string; ticker: string };
  amount: number | string | { amount: number; decimals?: number };
  decimal?: number;
  from?: string;
  gasLimit?: string | bigint;
  recipient: string;
  memo?: string;
};

type CtrlRequestProvider = {
  request(
    args: { method: string; params: unknown[] | Record<string, unknown> },
    cb?: (err: unknown, result: unknown) => void,
  ): unknown;
};

type ThorchainTransferMessage = {
  typeUrl?: string;
  type?: string;
  value: {
    amount: { amount: string; denom: string }[];
    fromAddress?: string;
    from_address?: string;
    toAddress?: string;
    to_address?: string;
  };
};

type ThorchainDepositMessage = {
  typeUrl?: string;
  type?: string;
  value: {
    coins: { amount: string; asset: string | { chain?: string; symbol?: string; ticker?: string } }[];
    memo?: string;
    signer: string;
  };
};

type ThorchainToolboxTransaction = {
  fee?: { gas?: string };
  memo?: string;
  msgs: Array<ThorchainTransferMessage | ThorchainDepositMessage>;
};

export type WalletTxParams = {
  feeOptionKey?: FeeOption;
  from?: string;
  memo?: string;
  recipient: string;
  assetValue: AssetValue;
  gasLimit?: string | bigint;
};

type CtrlProviderType<T> = T extends typeof Chain.Solana
  ? SolanaProvider
  : T extends Exclude<CosmosChain, TCLikeChain>
    ? Keplr
    : T extends EVMChain
      ? Eip1193Provider
      : T extends TCLikeChain
        ? CtrlRequestProvider
        : undefined;

export function getCtrlProvider<T extends Chain>(chain: T): CtrlProviderType<T> {
  const ctrl = window.ctrl || window.xfi;
  if (!ctrl) throw new SwapKitError("wallet_ctrl_not_found");

  // @ts-expect-error
  return match(chain as Chain)
    .with(...EVMChains, () => ctrl.ethereum)
    .with(Chain.Cosmos, Chain.Kujira, Chain.Noble, () => ctrl.keplr)
    .with(Chain.Bitcoin, () => ctrl.bitcoin)
    .with(Chain.BitcoinCash, () => ctrl.bitcoincash)
    .with(Chain.Dogecoin, () => ctrl.dogecoin)
    .with(Chain.Litecoin, () => ctrl.litecoin)
    .with(Chain.Solana, () => ctrl.solana)
    .with(Chain.THORChain, () => ctrl.thorchain)
    .with(Chain.Maya, () => ctrl.mayachain)
    .otherwise(() => undefined);
}

async function transaction({
  method,
  params,
  chain,
}: {
  method: TransactionMethod;
  params: TransactionParams[];
  chain: Chain;
}): Promise<string> {
  const client = await getCtrlProvider(chain);

  return new Promise<string>((resolve, reject) => {
    if (!(client && "request" in client)) {
      reject(new SwapKitError({ errorKey: "wallet_provider_not_found", info: { chain, wallet: WalletOption.CTRL } }));
      return;
    }

    const handler = (err: unknown, tx: unknown) => {
      err ? reject(err) : resolve(tx as string);
    };
    const maybePromise = client.request({ method, params }, handler);
    if (maybePromise && typeof (maybePromise as { then?: unknown }).then === "function") {
      (maybePromise as Promise<string>).then(
        (tx) => handler(null, tx),
        (err) => handler(err, null),
      );
    }
  });
}

function getCtrlAssetFromThorchainAsset(
  asset: ThorchainDepositMessage["value"]["coins"][number]["asset"],
  chain: Chain,
) {
  if (typeof asset === "string") {
    const [, symbol = asset] = asset.split(".");
    return { chain, symbol, ticker: symbol.split("-")[0] || symbol };
  }

  const symbol = asset.symbol || asset.ticker || chain;
  return { chain: asset.chain || chain, symbol, ticker: asset.ticker || symbol.split("-")[0] || symbol };
}

function getCtrlAssetFromThorchainDenom(denom: string, chain: Chain) {
  const symbol = denom.includes(".") ? denom.split(".").at(-1) || denom : denom;
  const ticker = symbol.split("-")[0] || symbol;

  return { chain, symbol: symbol.toUpperCase(), ticker: ticker.toUpperCase() };
}

function normalizeTCLikeAddress(address: string, chain: Chain.THORChain | Chain.Maya) {
  const prefix = CosmosChainPrefixes[chain];
  if (address.startsWith(`${prefix}1`)) return address;

  return base64ToBech32(address, prefix);
}

function getCtrlTransactionMethod(tx: ThorchainToolboxTransaction): TransactionMethod {
  const [msg] = tx.msgs;
  if (!msg) throw new SwapKitError("plugin_swapkit_invalid_transaction");

  const messageType = msg.typeUrl || msg.type;
  if (messageType?.includes("MsgDeposit") || "coins" in msg.value) return "deposit";
  if (messageType?.includes("MsgSend") || "amount" in msg.value) return "transfer";

  throw new SwapKitError("plugin_swapkit_invalid_transaction", { messageType });
}

async function getCtrlTCLikeAddress(chain: Chain.THORChain | Chain.Maya) {
  const provider = await getCtrlProvider(chain);
  if (!(provider && "request" in provider)) {
    throw new SwapKitError({ errorKey: "wallet_provider_not_found", info: { chain, wallet: WalletOption.CTRL } });
  }

  return new Promise<string | undefined>((resolve, reject) => {
    const handler = (err: unknown, accounts: unknown) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(Array.isArray(accounts) ? accounts[0] : undefined);
    };
    const maybePromise = provider.request({ method: "request_accounts", params: [] }, handler);
    if (maybePromise && typeof (maybePromise as { then?: unknown }).then === "function") {
      (maybePromise as Promise<unknown>).then(
        (accounts) => handler(null, accounts),
        (err) => handler(err, null),
      );
    }
  });
}

export function convertThorchainTransactionToCtrlParams(
  tx: ThorchainToolboxTransaction,
  chain: Chain.THORChain | Chain.Maya,
): TransactionParams {
  const [msg] = tx.msgs;
  if (!msg) throw new SwapKitError("plugin_swapkit_invalid_transaction");

  if (getCtrlTransactionMethod(tx) === "deposit") {
    const { coins, memo = tx.memo || "", signer } = (msg as ThorchainDepositMessage).value;
    const [coin] = coins;
    if (!coin) throw new SwapKitError("plugin_swapkit_invalid_transaction");

    return {
      amount: { amount: Number(coin.amount), decimals: getChainConfig(chain).baseDecimal },
      asset: getCtrlAssetFromThorchainAsset(coin.asset, chain),
      from: normalizeTCLikeAddress(signer, chain),
      gasLimit: tx.fee?.gas,
      memo,
      recipient: "",
    };
  }

  const { amount, fromAddress, from_address, toAddress, to_address } = (msg as ThorchainTransferMessage).value;
  const [coin] = amount;
  const from = fromAddress || from_address;
  const recipient = toAddress || to_address;

  if (!(coin && from && recipient)) throw new SwapKitError("plugin_swapkit_invalid_transaction");

  return {
    amount: { amount: Number(coin.amount), decimals: getChainConfig(chain).baseDecimal },
    asset: getCtrlAssetFromThorchainDenom(coin.denom, chain),
    from,
    gasLimit: tx.fee?.gas,
    memo: tx.memo || "",
    recipient,
  };
}

export async function signCtrlThorchainTransaction(
  tx: ThorchainToolboxTransaction,
  chain: Chain.THORChain | Chain.Maya,
) {
  const method = getCtrlTransactionMethod(tx);
  const params = [convertThorchainTransactionToCtrlParams(tx, chain)];
  const expectedAddress = params[0]?.from;
  const activeAddress = expectedAddress ? await getCtrlTCLikeAddress(chain) : undefined;

  if (activeAddress && expectedAddress && activeAddress !== expectedAddress) {
    throw new SwapKitError("wallet_ctrl_not_found", { activeAddress, chain, expectedAddress, reason: "Wrong account" });
  }

  return transaction({ chain, method, params });
}

export async function getCtrlAddress(chain: Chain) {
  try {
    const eipProvider = (await getCtrlProvider(chain)) as Eip1193Provider;
    if (!eipProvider) {
      throw new SwapKitError({ errorKey: "wallet_provider_not_found", info: { chain, wallet: WalletOption.CTRL } });
    }

    if ([Chain.Cosmos, Chain.Kujira, Chain.Noble].includes(chain as Exclude<CosmosChain, TCLikeChain>)) {
      const provider = await getCtrlProvider(Chain.Cosmos);
      if (!provider || "request" in provider) {
        throw new SwapKitError({ errorKey: "wallet_provider_not_found", info: { chain, wallet: WalletOption.CTRL } });
      }

      // Enabling before using the Keplr is recommended.
      // This method will ask the user whether to allow access if they haven't visited this website.
      // Also, it will request that the user unlock the wallet if the wallet is locked.
      const chainId = ChainToChainId[chain];
      await provider.enable(chainId);

      const offlineSigner = provider.getOfflineSigner(chainId);

      const [item] = await offlineSigner.getAccounts();
      return item?.address;
    }

    if (EVMChains.includes(chain as EVMChain)) {
      // For CTRL wallet, we need to use the request method directly on the provider
      if ("request" in eipProvider && typeof eipProvider.request === "function") {
        const accounts = await eipProvider.request({ method: "eth_requestAccounts" });
        return accounts[0];
      }
      const { BrowserProvider } = await import("ethers");
      const provider = new BrowserProvider(eipProvider, "any");
      const [response] = (await providerRequest({ method: "eth_requestAccounts", params: [], provider })) as [
        string,
        ...string[],
      ];
      return response;
    }

    if (chain === Chain.Solana) {
      const provider = await getCtrlProvider(Chain.Solana);

      const accounts = await provider.connect();
      return accounts.publicKey.toString();
    }

    const accounts = await eipProvider.request({ method: "request_accounts", params: [] });
    return accounts[0];
  } catch {
    throw new SwapKitError({ errorKey: "wallet_provider_not_found", info: { chain, wallet: WalletOption.CTRL } });
  }
}

export async function walletTransfer(
  { assetValue, recipient, memo, gasLimit }: WalletTxParams,
  method: TransactionMethod = "transfer",
) {
  if (!assetValue) {
    throw new SwapKitError("wallet_ctrl_asset_not_defined");
  }

  /**
   * EVM requires amount to be hex string
   * UTXO/Cosmos requires amount to be number
   */

  const from = await getCtrlAddress(assetValue.chain);
  const params = [
    {
      amount: { amount: assetValue.getBaseValue("number"), decimals: assetValue.decimal },
      asset: {
        chain: assetValue.chain,
        symbol: assetValue.symbol.toUpperCase(),
        ticker: assetValue.symbol.toUpperCase(),
      },
      from,
      gasLimit,
      memo: memo || "",
      recipient,
    },
  ];

  return transaction({ chain: assetValue.chain, method, params });
}
