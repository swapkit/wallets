import { type Chain, CosmosChainPrefixes, getChainConfig, SwapKitError } from "@swapkit/helpers";
import { base64ToBech32 } from "@swapkit/toolboxes/cosmos";

export type TCLikeChain = typeof Chain.THORChain | typeof Chain.Maya;

type TCLikeTransferMessage = {
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

type TCLikeDepositMessage = {
  typeUrl?: string;
  type?: string;
  value: {
    coins: { amount: string; asset: string | { chain?: string; symbol?: string; ticker?: string } }[];
    memo?: string;
    signer: string;
  };
};

export type TCLikeToolboxTransaction = {
  fee?: { gas?: string };
  memo?: string;
  msgs: Array<TCLikeTransferMessage | TCLikeDepositMessage>;
};

export type TCLikeTransferIntent = {
  amount: { amount: number; decimals: number };
  asset: { chain: string; symbol: string; ticker: string };
  from: string;
  gasLimit?: string;
  memo: string;
  method: "deposit" | "transfer";
  recipient: string;
};

function getTCLikeTransactionMethod(tx: TCLikeToolboxTransaction): TCLikeTransferIntent["method"] {
  const [msg] = tx.msgs;
  if (!msg) throw new SwapKitError("plugin_swapkit_invalid_transaction");

  const messageType = msg.typeUrl || msg.type;
  if (messageType?.includes("MsgDeposit") || "coins" in msg.value) return "deposit";
  if (messageType?.includes("MsgSend") || "amount" in msg.value) return "transfer";

  throw new SwapKitError("plugin_swapkit_invalid_transaction", { messageType });
}

function normalizeTCLikeAddress(address: string, chain: TCLikeChain) {
  const prefix = CosmosChainPrefixes[chain];
  if (address.startsWith(`${prefix}1`)) return address;

  return base64ToBech32(address, prefix);
}

function getAssetFromDepositCoin(asset: TCLikeDepositMessage["value"]["coins"][number]["asset"], chain: TCLikeChain) {
  if (typeof asset === "string") {
    const [assetChain = chain, symbol = assetChain] = asset.includes(".") ? asset.split(".") : [chain, asset];
    return { chain: assetChain, symbol: symbol.toUpperCase(), ticker: symbol.split("-")[0]?.toUpperCase() || symbol };
  }

  const symbol = asset.symbol || asset.ticker || chain;
  const ticker = asset.ticker || symbol.split("-")[0] || symbol;

  return { chain: asset.chain || chain, symbol: symbol.toUpperCase(), ticker: ticker.toUpperCase() };
}

function getAssetFromTransferDenom(denom: string, chain: TCLikeChain) {
  const symbol = (denom.includes(".") ? denom.split(".").at(-1) || denom : denom).toUpperCase();
  const ticker = symbol.split("-")[0] || symbol;

  return { chain, symbol, ticker };
}

export function extractTCLikeTransferIntent({
  chain,
  tx,
}: {
  chain: TCLikeChain;
  tx: TCLikeToolboxTransaction;
}): TCLikeTransferIntent {
  const [msg] = tx.msgs;
  if (!msg) throw new SwapKitError("plugin_swapkit_invalid_transaction");

  const method = getTCLikeTransactionMethod(tx);
  if (method === "deposit") {
    const { coins, memo = tx.memo || "", signer } = (msg as TCLikeDepositMessage).value;
    const [coin] = coins;
    if (!coin) throw new SwapKitError("plugin_swapkit_invalid_transaction");

    const asset = getAssetFromDepositCoin(coin.asset, chain);

    return {
      amount: { amount: Number(coin.amount), decimals: getChainConfig(chain).baseDecimal },
      asset,
      from: normalizeTCLikeAddress(signer, chain),
      gasLimit: tx.fee?.gas,
      memo,
      method,
      recipient: "",
    };
  }

  const { amount, fromAddress, from_address, toAddress, to_address } = (msg as TCLikeTransferMessage).value;
  const [coin] = amount;
  const from = fromAddress || from_address;
  const recipient = toAddress || to_address;

  if (!(coin && from && recipient)) throw new SwapKitError("plugin_swapkit_invalid_transaction");

  const asset = getAssetFromTransferDenom(coin.denom, chain);

  return {
    amount: { amount: Number(coin.amount), decimals: getChainConfig(chain).baseDecimal },
    asset,
    from: normalizeTCLikeAddress(from, chain),
    gasLimit: tx.fee?.gas,
    memo: tx.memo || "",
    method,
    recipient,
  };
}
