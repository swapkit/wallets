import { AssetValue } from "@swapkit/helpers";

const INSUFFICIENT_NETWORK_FEE_PATTERN =
  /insufficient funds for (rent|fee|gas)|insufficient lamports|no record of a prior credit/i;

type RouteFee = { amount: string; asset: string; type: string };

export function getGasAsset(sellAsset: string) {
  return AssetValue.from({ chain: AssetValue.from({ asset: sellAsset }).chain });
}

export function getGasShortfall({
  balances,
  fees,
  isSweep = false,
  sellAmount,
  sellAsset,
}: {
  balances: AssetValue[];
  fees: RouteFee[] | undefined;
  isSweep?: boolean;
  sellAmount: string;
  sellAsset: string;
}) {
  const gasAsset = getGasAsset(sellAsset);
  const gasIdentifier = gasAsset.toString().toLowerCase();
  const isSellingGasAsset = sellAsset.toLowerCase() === gasIdentifier;
  // A sweep sells the whole balance and the backend deducts the fee from it.
  if (isSellingGasAsset && isSweep) return null;

  const networkFee = fees?.find((fee) => fee.type === "inbound" && fee.asset.toLowerCase() === gasIdentifier);
  if (!networkFee) return null;

  const fee = gasAsset.set(networkFee.amount);
  const required = isSellingGasAsset ? fee.add(sellAmount) : fee;
  const gasBalance = balances.find((balance) => balance.toString().toLowerCase() === gasIdentifier);

  return !gasBalance || gasBalance.lt(required) ? gasAsset.ticker : null;
}

export function isInsufficientNetworkFeeError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const causeMessage = (error as { cause?: { message?: unknown } }).cause?.message;
  return [error.message, causeMessage].some(
    (message) => typeof message === "string" && INSUFFICIENT_NETWORK_FEE_PATTERN.test(message),
  );
}
