import { type Chain, ChainToChainId } from "@swapkit/helpers";
import { SwapKitApi, TxnStatus } from "@swapkit/helpers/api";
import { captureWidgetError, isErrorCaptured } from "../sentry";

export async function waitForTransactionConfirmation(hash: string, chain: Chain): Promise<void> {
  const chainId = ChainToChainId[chain];
  const maxAttempts = 20;
  const pollInterval = 3000;
  let attempts = 0;
  let pollingErrorCaptured = false;

  while (attempts < maxAttempts) {
    try {
      const response = await SwapKitApi.getTrackerDetails({ chainId, hash });

      const status = response.status || response.legs?.[0]?.status;
      const isTerminal = status === TxnStatus.completed || status === TxnStatus.failed || status === TxnStatus.refunded;
      if (isTerminal && status !== TxnStatus.completed) {
        const txError = new Error(`Transaction ${status}`);
        captureWidgetError(txError, { category: "transaction", tags: { stage: "confirm", status } });
        throw txError;
      }
      if (isTerminal) return;
    } catch (error) {
      if (!pollingErrorCaptured && !isErrorCaptured(error)) {
        captureWidgetError(error, { category: "api", extra: { chain, hash }, tags: { endpoint: "tracker" } });
        pollingErrorCaptured = true;
      }
      if (error instanceof Error && (error.message.includes("failed") || error.message.includes("refunded"))) {
        throw error;
      }
    }

    attempts++;
    if (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error("Transaction confirmation timeout - please check manually");
}
