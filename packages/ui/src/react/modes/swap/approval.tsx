import { AssetValue, Chain, type ChainId, ChainToChainId, isUserRejectedRequest } from "@swapkit/helpers";
import {
  type QuoteResponseRoute,
  type StellarApprovalTransaction,
  SwapKitApi,
  type SwapRouteV2Response,
} from "@swapkit/helpers/api";
import type { ReactNode } from "react";
import type { SwapKitClient } from "../../../swapkit-types";
import { ApprovalConfirmDialog } from "../../components/dialogs/approval-confirm-dialog";
import { SWAPKIT_WIDGET_TOASTER_ID, toast } from "../../components/ui/sonner";
import { showModal } from "../../hooks/use-modal";
import { decodeApproveSpender } from "../../lib/decode-approve-spender";
import { getErrorMessage } from "../../lib/error-message";
import { waitForTransactionConfirmation } from "../../lib/wait-for-transaction";
import { captureWidgetError } from "../../sentry";
import type { TransactionStatus, TransactionType } from "../../stores/transaction-history-store";

type ApprovalTx = { data: string; from: string; to: string; value?: string };
type AddTransaction = (tx: {
  chainId: ChainId;
  hash: string;
  sellAmount: string;
  sellAsset: string;
  status: TransactionStatus;
  type: TransactionType;
}) => void;
export type EVMWallet = {
  sendTransaction: (tx: { data: string; from: string; to: string; value: bigint }) => Promise<string>;
};

export function isStellarApprovalTx(
  approvalTx: SwapRouteV2Response["approvalTx"],
): approvalTx is StellarApprovalTransaction {
  return !!approvalTx && "txType" in approvalTx && approvalTx.txType === "STELLAR";
}

// HTTP 400 destinationTrustlineRequired with data.reason "account_not_funded": the
// destination account doesn't exist on Stellar, so a changeTrust can't even be built.
export function isStellarAccountNotFundedError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const info = (error as { info?: unknown }).info;
  if (typeof info !== "object" || info === null) return false;
  const { data, error: errorCode } = info as { data?: unknown; error?: unknown };
  if (errorCode !== "destinationTrustlineRequired") return false;
  return typeof data === "object" && data !== null && (data as { reason?: unknown }).reason === "account_not_funded";
}

const NETWORK_SWITCH_ERROR_KEY = "helpers_failed_to_switch_network";
const ON_CHAIN_FAILURE_MESSAGES = ["Transaction failed", "Transaction refunded"];

function reportApprovalClickError(error: unknown, chain: Chain) {
  const { errorKey, cause } = (error ?? {}) as { errorKey?: string; cause?: { error?: unknown; reason?: string } };

  if (errorKey === NETWORK_SWITCH_ERROR_KEY) {
    if (cause?.reason?.startsWith("user rejected") || isUserRejectedRequest(cause?.error)) {
      toast.warning(
        `Your wallet rejected switching to ${chain}. Approve the network request in your wallet — or add ${chain} there manually — and try the approval again.`,
        { toasterId: SWAPKIT_WIDGET_TOASTER_ID },
      );
      return;
    }
  } else if (isUserRejectedRequest(error)) {
    toast.warning("Approval rejected in your wallet.", { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
    return;
  }

  captureWidgetError(error, { category: "transaction", tags: { chain, stage: "approval_sign" } });
  toast.error(`Approval failed: ${getErrorMessage(error)}`, { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
}

export async function confirmAndSendApproval({
  addTransaction,
  amount,
  approvalTx,
  chain,
  note,
  tokenAsset,
  wallet,
}: {
  addTransaction: AddTransaction;
  amount: string;
  approvalTx: ApprovalTx;
  chain: Chain;
  note?: ReactNode;
  tokenAsset: string;
  wallet: EVMWallet;
}) {
  const sellAsset = AssetValue.from({ asset: tokenAsset }).toString();
  let failedOnChain = false;
  const { confirmed } = await showModal(
    <ApprovalConfirmDialog
      amount={amount}
      note={note}
      onApproveClick={async () => {
        const approvalTxHash = await wallet.sendTransaction({
          data: approvalTx.data,
          from: approvalTx.from,
          to: approvalTx.to,
          value: BigInt(approvalTx.value || "0"),
        });

        addTransaction({
          chainId: ChainToChainId[chain],
          hash: String(approvalTxHash),
          sellAmount: amount,
          sellAsset,
          status: "pending",
          type: "approval",
        });

        try {
          await waitForTransactionConfirmation(String(approvalTxHash), chain);
          toast.success(`Approval confirmed: ${String(approvalTxHash).slice(0, 10)}...`, {
            toasterId: SWAPKIT_WIDGET_TOASTER_ID,
          });
        } catch (error) {
          failedOnChain = error instanceof Error && ON_CHAIN_FAILURE_MESSAGES.includes(error.message);
          captureWidgetError(error, { category: "transaction", tags: { stage: "approval_confirm" } });
          console.warn("Failed to wait for approval confirmation:", error);
          toast.warning(`Approval sent: ${String(approvalTxHash).slice(0, 10)}... - proceeding with caution`, {
            toasterId: SWAPKIT_WIDGET_TOASTER_ID,
          });
        }
      }}
      onApproveError={(error) => reportApprovalClickError(error, chain)}
      spenderAddress={decodeApproveSpender(approvalTx.data)}
      tokenAsset={tokenAsset}
    />,
  );

  return { confirmed, failedOnChain };
}

export async function handleApprovalIfNeeded({
  addTransaction,
  approvalTx,
  getRouteParams,
  route,
  sourceAsset,
  wallet,
}: {
  addTransaction: AddTransaction;
  approvalTx: ApprovalTx;
  getRouteParams: { destinationAddress: string; routeId: string; sourceAddress: string };
  route: QuoteResponseRoute;
  sourceAsset: AssetValue;
  wallet: EVMWallet;
}): Promise<{ confirmed: false } | { confirmed: true; updatedRoute: SwapRouteV2Response }> {
  const { confirmed: approvalConfirmed } = await confirmAndSendApproval({
    addTransaction,
    amount: route.sellAmount,
    approvalTx,
    chain: sourceAsset.chain,
    tokenAsset: route.sellAsset,
    wallet,
  });

  if (!approvalConfirmed) {
    return { confirmed: false };
  }

  try {
    const updatedRoute = await SwapKitApi.getRouteWithTx(getRouteParams);
    return { confirmed: true, updatedRoute };
  } catch (error) {
    captureWidgetError(error, {
      category: "transaction",
      tags: { provider: route?.providers?.[0] ?? "unknown", stage: "approval" },
    });
    throw error;
  }
}

// The swapkit plugin owns the trustline mechanics; the widget only supplies the wording.
export async function handleStellarTrustlineIfNeeded({
  addTransaction,
  destinationAsset,
  getRouteParams,
  route,
  routeWithTx,
  swapKit,
}: {
  addTransaction: AddTransaction;
  destinationAsset: AssetValue;
  getRouteParams: { destinationAddress: string; routeId: string; sourceAddress: string };
  route: QuoteResponseRoute;
  routeWithTx: SwapRouteV2Response;
  swapKit: SwapKitClient;
}): Promise<{ confirmed: false } | { confirmed: true; updatedRoute: SwapRouteV2Response }> {
  const { confirmed } = await showModal(
    <ApprovalConfirmDialog
      description="This sets a one-time trustline that lets your receiving account hold this asset. It locks 0.5 XLM as a base reserve on your Stellar account."
      onApproveClick={async () => {
        const result = await swapKit.approveAssetValue(routeWithTx);
        // Only a real signature returns a transaction hash worth recording.
        if (typeof result === "string" && result !== "approved") {
          addTransaction({
            chainId: ChainToChainId[Chain.Stellar],
            hash: result,
            sellAmount: "0",
            sellAsset: destinationAsset.toString(),
            status: "pending",
            type: "approval",
          });
        }
      }}
      onApproveError={(error) => reportApprovalClickError(error, Chain.Stellar)}
      title={`Approve ${destinationAsset.ticker} on Stellar`}
      tokenAsset={route.buyAsset}
    />,
  );
  if (!confirmed) return { confirmed: false };

  const updatedRoute = await SwapKitApi.getRouteWithTx(getRouteParams);
  if (!updatedRoute.tx) {
    throw new Error("Trustline is set, but the swap route isn't ready yet — please retry the swap.");
  }
  return { confirmed: true, updatedRoute };
}
