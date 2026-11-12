import { SwapKitError } from "@swapkit/helpers";

export function isUserRejection(error: unknown) {
  if (error instanceof SwapKitError) return error.errorKey === "wallet_connection_rejected_by_user";

  // ethers wraps the EIP-1193 4001 rejection of the EVM provider as ACTION_REJECTED
  const code = (error as { code?: unknown } | null)?.code;
  return code === 4001 || code === "ACTION_REJECTED";
}
