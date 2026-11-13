import {
  AssetValue,
  type Chain,
  type EVMChain,
  EVMChains,
  LimitOrderEVMTransactionSchema,
  parseTransactionValue,
  SwapKitNumber,
} from "@swapkit/helpers";
import { formatTokenAmount } from "../../../../lib/utils";
import { ORDER_AMOUNT_MAX_SIGNIFICANT_DIGITS } from "../../../lib/limit-orders/row-model";
import type { LimitHeldOrder } from "../limit-order-store";
import type { LimitSignableBuildKind } from "./build-shape";

export function formatHeldAmount(amount: string) {
  return formatTokenAmount(amount, { maximumSignificantDigits: ORDER_AMOUNT_MAX_SIGNIFICANT_DIGITS });
}

export function getHeldSellAmount({ build, kind, route }: Pick<LimitHeldOrder, "build" | "kind" | "route">) {
  return kind.flow === "deposit" ? (build.depositAmount ?? route.sellAmount) : route.sellAmount;
}

export function hasDepositAmountMismatch({ build, route }: Pick<LimitHeldOrder, "build" | "route">) {
  if (!build.depositAmount) return false;
  try {
    return !new SwapKitNumber(build.depositAmount).eqValue(route.sellAmount);
  } catch {
    return build.depositAmount !== route.sellAmount;
  }
}

export function isApproximateReceive(kind: LimitSignableBuildKind) {
  return kind.flow === "deposit" && kind.custody === "protocol";
}

export function getDepositNetworkFee({ build, chain }: { build: LimitHeldOrder["build"]; chain: Chain }) {
  if (!EVMChains.includes(chain as EVMChain)) return null;
  const parsed = LimitOrderEVMTransactionSchema.safeParse(build.tx);
  if (!parsed.success) return null;
  const { gas, gasPrice, maxFeePerGas } = parsed.data;
  const gasLimit = parseTransactionValue(gas);
  const feePerGas = parseTransactionValue(maxFeePerGas ?? gasPrice);
  if (!gasLimit || !feePerGas) return null;
  const gasAsset = AssetValue.from({ chain });
  return `~${SwapKitNumber.fromBigInt(gasLimit * feePerGas, gasAsset.decimal ?? 18).toSignificant(2)} ${gasAsset.ticker}`;
}
