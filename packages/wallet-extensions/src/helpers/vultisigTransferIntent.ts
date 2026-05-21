import { Chain, getChainConfig, SwapKitError } from "@swapkit/helpers";
import type { CosmosTransaction } from "@swapkit/helpers/api";
import type { RippleTransaction } from "@swapkit/toolboxes/ripple";

export type VultisigNativeTransferIntent = {
  amount: { amount: number; decimals: number };
  asset: { chain: string; symbol: string; ticker: string };
  from: string;
  memo: string;
  recipient: string;
};

type CosmosSendMessage = {
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

function getNativeCosmosSymbol(chain: Chain.Cosmos | Chain.Kujira) {
  return chain === Chain.Kujira ? "KUJI" : "ATOM";
}

export function extractVultisigCosmosTransferIntent({
  chain,
  tx,
}: {
  chain: Chain.Cosmos | Chain.Kujira;
  tx: CosmosTransaction;
}): VultisigNativeTransferIntent {
  const [msg] = tx.msgs as CosmosSendMessage[];
  const messageType = msg?.typeUrl || msg?.type;

  if (!(msg && messageType?.includes("MsgSend"))) {
    throw new SwapKitError("plugin_swapkit_invalid_transaction", {
      chain,
      messageType,
      reason: "Vultisig Cosmos/Kujira direct signing only supports native MsgSend transactions",
    });
  }

  const [coin] = msg.value.amount;
  const from = msg.value.fromAddress || msg.value.from_address;
  const recipient = msg.value.toAddress || msg.value.to_address;

  if (!(coin && from && recipient)) throw new SwapKitError("plugin_swapkit_invalid_transaction", { chain });

  const symbol = getNativeCosmosSymbol(chain);

  return {
    amount: { amount: Number(coin.amount), decimals: getChainConfig(chain).baseDecimal },
    asset: { chain, symbol, ticker: symbol },
    from,
    memo: tx.memo || "",
    recipient,
  };
}

function decodeXrplMemo(tx: RippleTransaction) {
  const [memo] = "Memos" in tx && Array.isArray(tx.Memos) ? tx.Memos : [];
  const memoData = memo?.Memo?.MemoData;
  if (!memoData) return "";

  try {
    return Buffer.from(memoData, "hex").toString("utf8");
  } catch {
    return "";
  }
}

export function extractVultisigRippleTransferIntent(tx: RippleTransaction): VultisigNativeTransferIntent {
  if (tx.TransactionType !== "Payment") {
    throw new SwapKitError("plugin_swapkit_invalid_transaction", {
      chain: Chain.Ripple,
      reason: "Vultisig Ripple direct signing only supports native Payment transactions",
      transactionType: tx.TransactionType,
    });
  }

  if (typeof tx.Amount !== "string") {
    throw new SwapKitError("plugin_swapkit_invalid_transaction", {
      chain: Chain.Ripple,
      reason: "Vultisig Ripple direct signing only supports native XRP payments",
    });
  }

  if (!(tx.Account && tx.Destination))
    throw new SwapKitError("plugin_swapkit_invalid_transaction", { chain: Chain.Ripple });

  return {
    amount: { amount: Number(tx.Amount), decimals: getChainConfig(Chain.Ripple).baseDecimal },
    asset: { chain: Chain.Ripple, symbol: Chain.Ripple, ticker: Chain.Ripple },
    from: tx.Account,
    memo: decodeXrplMemo(tx),
    recipient: tx.Destination,
  };
}
