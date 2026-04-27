import { SwapKitError } from "@swapkit/helpers";
import type { Xumm } from "xumm";
import type { XamanPaymentParams, XamanTrustSetParams } from "./types";

export const connectXamanWallet = async (xumm: Xumm) => {
  if (!xumm) {
    throw new SwapKitError("wallet_xaman_not_configured");
  }

  try {
    const user = await xumm.user;
    const account = await user?.account;

    if (account) {
      return account;
    }

    throw new SwapKitError("wallet_xaman_auth_failed");
  } catch {
    throw new SwapKitError("wallet_xaman_connection_failed");
  }
};

export async function submitXamanPayload(
  xumm: Xumm,
  txjson: Record<string, unknown>,
  { submit = true }: { submit?: boolean } = {},
) {
  const payload = (submit ? txjson : { options: { submit: false }, txjson }) as Parameters<
    NonNullable<Xumm["payload"]>["createAndSubscribe"]
  >[0];

  const subscription = await xumm.payload?.createAndSubscribe(payload, (event) => {
    if ("signed" in event.data) return event.data;
    return undefined;
  });

  if (!subscription) {
    throw new SwapKitError("wallet_xaman_transaction_failed");
  }

  const { created } = subscription;

  if (xumm.runtime?.xapp) {
    xumm.xapp?.openSignRequest(created);
  } else if (typeof window !== "undefined") {
    const url =
      created.pushed && created.next?.no_push_msg_received ? created.next.no_push_msg_received : created.next?.always;
    if (url) window.open(url);
  }

  const resolved = await subscription.resolved;

  if (!resolved || typeof resolved !== "object" || !("signed" in resolved) || !resolved.signed) {
    throw new SwapKitError("wallet_xaman_transaction_failed");
  }

  const payloadDetails = await xumm.payload?.get((resolved as any).payload_uuidv4);

  if (!payloadDetails) {
    throw new SwapKitError("wallet_xaman_monitoring_failed");
  }

  const transactionId = payloadDetails.response?.txid || "";
  const account = payloadDetails.response?.account || "";
  const hex = payloadDetails.response?.hex || "";

  if (!transactionId) {
    throw new SwapKitError("wallet_xaman_transaction_failed");
  }

  return {
    deepLink: created.next?.always || "",
    payloadId: created.uuid || "",
    qrCode: created.refs?.qr_png || "",
    result: { account, hex, reason: undefined, success: true, transactionId },
    websocketUrl: created.refs?.websocket_status || "",
  };
}

export async function sendXamanTransaction(xumm: Xumm, params: XamanPaymentParams) {
  if (!(params.destination && params.amount && params.from)) {
    throw new SwapKitError("wallet_xaman_connection_failed");
  }

  const isTokenTransfer = params.currency && params.issuer;
  const amount = isTokenTransfer
    ? { currency: params.currency, issuer: params.issuer, value: params.amount }
    : (Number.parseFloat(params.amount) * 1000000).toString();

  const transaction = {
    Account: params.from,
    Amount: amount,
    Destination: params.destination,
    TransactionType: "Payment" as const,
    ...(params.destinationTag !== undefined && { DestinationTag: params.destinationTag }),
    ...(params.memo && {
      Memos: [{ Memo: { MemoData: Buffer.from(params.memo, "utf8").toString("hex").toUpperCase() } }],
    }),
  };

  return await submitXamanPayload(xumm, transaction);
}

export async function sendXamanTrustSet(xumm: Xumm, params: XamanTrustSetParams) {
  if (!(params.from && params.currency && params.issuer && params.limit !== undefined)) {
    throw new SwapKitError("wallet_xaman_connection_failed");
  }

  const transaction = {
    Account: params.from,
    LimitAmount: { currency: params.currency, issuer: params.issuer, value: params.limit },
    TransactionType: "TrustSet" as const,
  };

  return await submitXamanPayload(xumm, transaction);
}
