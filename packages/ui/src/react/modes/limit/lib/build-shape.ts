import {
  type LimitOrderBuildResponse,
  type LimitOrderEVMTransaction,
  LimitOrderEVMTransactionSchema,
  parseTransactionValue,
} from "@swapkit/helpers";

export type LimitDepositCustody = "contract" | "protocol";

export type LimitSignableBuildKind =
  | { chainId: number; custody: "wallet"; flow: "signature"; needsApproval: boolean }
  | { chainId?: number; custody: LimitDepositCustody; flow: "deposit"; needsApproval: boolean; txType: string };

export type LimitBuildKind = LimitSignableBuildKind | { flow: "invalid"; reason: string };

type LimitBuildShape = Pick<
  LimitOrderBuildResponse,
  "approvalTx" | "depositAddress" | "isApproved" | "tx" | "txMeta" | "typedData"
>;

function getEvmFeeFieldsConflict({
  gasPrice,
  maxFeePerGas,
  maxPriorityFeePerGas,
  type,
}: Pick<LimitOrderEVMTransaction, "gasPrice" | "maxFeePerGas" | "maxPriorityFeePerGas" | "type">) {
  const isEIP1559 = maxFeePerGas !== undefined || maxPriorityFeePerGas !== undefined;
  if (gasPrice !== undefined && isEIP1559) return "EVM build mixes gasPrice with EIP-1559 fee fields";
  if (type !== undefined && parseTransactionValue(type) !== (gasPrice === undefined ? 2n : 0n)) {
    return "EVM build type contradicts its fee fields";
  }
  return null;
}

export function classifyLimitBuild(build: LimitBuildShape): LimitBuildKind {
  const needsApproval = build.isApproved === false && !!build.approvalTx;

  if (build.typedData) {
    if (build.tx !== null) return { flow: "invalid", reason: "Build carries both typedData and a tx" };
    const domainChainId = build.typedData.domain.chainId;
    if (build.txMeta?.chainId !== undefined && build.txMeta.chainId !== domainChainId) {
      return { flow: "invalid", reason: "typedData domain chainId does not match txMeta chainId" };
    }
    return { chainId: domainChainId, custody: "wallet", flow: "signature", needsApproval };
  }

  if (!build.tx || !build.txMeta) return { flow: "invalid", reason: "Build carries neither typedData nor a tx" };
  const { chainId, txType } = build.txMeta;

  if (txType !== "evm") {
    if (!build.depositAddress) return { flow: "invalid", reason: "Non-EVM build needs a deposit address" };
    return { custody: "protocol", flow: "deposit", needsApproval, txType };
  }

  const evmTx = LimitOrderEVMTransactionSchema.safeParse(build.tx);
  if (chainId == null || !evmTx.success) {
    return { flow: "invalid", reason: "EVM build needs a chainId and a transaction the wallet signs as received" };
  }

  const feeFieldsReason = getEvmFeeFieldsConflict(evmTx.data);
  if (feeFieldsReason) return { flow: "invalid", reason: feeFieldsReason };

  return { chainId, custody: build.depositAddress ? "protocol" : "contract", flow: "deposit", needsApproval, txType };
}
