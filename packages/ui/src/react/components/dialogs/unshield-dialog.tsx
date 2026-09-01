"use client";

import type { AleoWallet } from "@swapkit/toolboxes/aleo";
import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon, ShieldCheckIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useModal } from "../../hooks/use-modal";
import {
  addAleoShieldedDeliveryHash,
  clearAleoUnshieldResumeTransactions,
  getAleoShieldedDeliveryHashes,
  getAleoUnshieldResumeTransaction,
  persistAleoUnshieldResumeTransaction,
  removeAleoShieldedDeliveryHashes,
} from "../../lib/aleo-shielded-deliveries";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

const MICRO_CREDITS_PER_ALEO = 1_000_000n;
const DEFAULT_FEE_RECORD_MICROCREDITS = 4n * MICRO_CREDITS_PER_ALEO;

type UnshieldState = "idle" | "fetching" | "confirm" | "proving" | "confirming" | "success" | "error";
type AleoRecord = Awaited<ReturnType<AleoWallet["getRecords"]>>[number];

type DeliveryRecords = { deliveryHash: string; records: AleoRecord[]; microcredits: bigint };

export type AleoUnshieldWallet = Pick<AleoWallet, "getRecords" | "unshield">;

export type UnshieldDialogProps = {
  address: string;
  deliveryHashes?: readonly string[];
  onCompleted?: (deliveryHashes: readonly string[]) => Promise<void> | void;
  onRefreshBalance?: () => Promise<void>;
  wallet: AleoUnshieldWallet;
};

function formatMicrocredits(microcredits: bigint) {
  const whole = microcredits / MICRO_CREDITS_PER_ALEO;
  const fraction = (microcredits % MICRO_CREDITS_PER_ALEO).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function truncateHash(hash: string) {
  return hash.length <= 18 ? hash : `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "The unshield transaction could not be completed. Please try again.";
}

function extractSplitTransactionId(error: unknown) {
  const queue: unknown[] = [error];
  const visited = new Set<object>();

  while (queue.length) {
    const value = queue.shift();
    if (typeof value !== "object" || value === null || visited.has(value)) continue;
    visited.add(value);

    const record = value as Record<string, unknown>;
    if (typeof record.splitTransactionId === "string" && record.splitTransactionId) {
      return record.splitTransactionId;
    }

    queue.push(record.info, record.error, record.cause);
  }

  return undefined;
}

function getPlannedUnshieldAmount(records: readonly AleoRecord[]) {
  const unspent = records.filter((record) => !record.spent).sort((a, b) => (a.microcredits < b.microcredits ? -1 : 1));
  const [onlyRecord] = unspent;
  if (!onlyRecord) return 0n;
  if (unspent.length === 1) {
    return onlyRecord.microcredits > DEFAULT_FEE_RECORD_MICROCREDITS
      ? onlyRecord.microcredits - DEFAULT_FEE_RECORD_MICROCREDITS
      : 0n;
  }
  return unspent.at(-1)?.microcredits ?? 0n;
}

export const UnshieldDialog = ({
  address,
  deliveryHashes: deliveryHashesProp,
  onCompleted,
  onRefreshBalance,
  wallet,
}: UnshieldDialogProps) => {
  const modal = useModal();
  const [deliveryHashes, setDeliveryHashes] = useState(() => [
    ...new Set(deliveryHashesProp ?? getAleoShieldedDeliveryHashes(address)),
  ]);
  const [remainingDeliveryHashes, setRemainingDeliveryHashes] = useState<readonly string[]>([]);
  const [state, setState] = useState<UnshieldState>("idle");
  const [deliveries, setDeliveries] = useState<DeliveryRecords[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [resumeTransactionId, setResumeTransactionId] = useState<string>();
  const [publicBalance, setPublicBalance] = useState<string>();
  const [unshieldedMicrocredits, setUnshieldedMicrocredits] = useState(0n);

  const records = useMemo(() => deliveries.flatMap((delivery) => delivery.records), [deliveries]);
  const totalMicrocredits = useMemo(
    () => deliveries.reduce((total, delivery) => total + delivery.microcredits, 0n),
    [deliveries],
  );
  const plannedMicrocredits = useMemo(() => getPlannedUnshieldAmount(records), [records]);
  const isBusy = state === "proving" || state === "confirming";

  const fetchRecords = useCallback(async () => {
    setState("fetching");
    setErrorMessage("");

    try {
      const fetchedDeliveries = await Promise.all(
        deliveryHashes.map(async (deliveryHash) => {
          const fetchedRecords = await wallet.getRecords({ transactionIds: [deliveryHash] });
          const unspentRecords = fetchedRecords.filter((record) => !record.spent);
          return {
            deliveryHash,
            microcredits: unspentRecords.reduce((total, record) => total + record.microcredits, 0n),
            records: unspentRecords,
          };
        }),
      );
      const storedResumeTransactionId = getAleoUnshieldResumeTransaction(address, deliveryHashes);

      setDeliveries(fetchedDeliveries);
      setResumeTransactionId(storedResumeTransactionId);

      if (storedResumeTransactionId) {
        setErrorMessage("A previous unshield split completed, but the final transaction did not. Resume it safely.");
        setState("error");
        return;
      }

      if (!fetchedDeliveries.some((delivery) => delivery.records.length > 0)) {
        setErrorMessage("No unspent shielded records were found for these swap deliveries.");
        setState("error");
        return;
      }

      setState("confirm");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setState("error");
    }
  }, [address, deliveryHashes, wallet]);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  // Closing the tab mid-proof loses the pass (only a confirmed split is resumable) —
  // warn while proving or confirming.
  useEffect(() => {
    if (!isBusy || typeof window === "undefined") return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isBusy]);

  const handleUnshieldNext = useCallback(() => {
    if (!remainingDeliveryHashes.length) return;
    setRemainingDeliveryHashes([]);
    // fetchRecords re-runs via its deliveryHashes dependency once state lands.
    setDeliveryHashes([...new Set(remainingDeliveryHashes)]);
  }, [remainingDeliveryHashes]);

  const completeUnshield = useCallback(
    async (result: Awaited<ReturnType<AleoUnshieldWallet["unshield"]>>) => {
      setState("confirming");
      try {
        await onRefreshBalance?.();
      } catch {
        // The toolbox result already contains the refreshed public balance, so a
        // secondary widget balance refresh must not turn a successful unshield into an error.
      }
      let completedDeliveryHashes: string[] = [];
      try {
        const [deliveryStates, unshieldChangeRecords] = await Promise.all([
          Promise.all(
            deliveryHashes.map(async (deliveryHash) => ({
              deliveryHash,
              records: await wallet.getRecords({ transactionIds: [deliveryHash] }),
            })),
          ),
          wallet.getRecords({ transactionIds: [result.unshieldTransactionId] }),
        ]);
        completedDeliveryHashes = deliveryStates
          .filter(({ records: deliveryRecords }) => !deliveryRecords.some((record) => !record.spent))
          .map(({ deliveryHash }) => deliveryHash);
        // The fee record's private change lands under the unshield transaction —
        // track it as a delivery so it stays unshieldable in a later pass.
        if (unshieldChangeRecords.some((record) => !record.spent)) {
          addAleoShieldedDeliveryHash(address, result.unshieldTransactionId);
        }
      } catch {
        // Preserve hashes when the post-success check fails so shielded funds are
        // never hidden from the next session by a transient record lookup error.
      }
      removeAleoShieldedDeliveryHashes(address, completedDeliveryHashes);
      clearAleoUnshieldResumeTransactions(address, deliveryHashes);
      await onCompleted?.(completedDeliveryHashes);
      setRemainingDeliveryHashes(getAleoShieldedDeliveryHashes(address));
      setPublicBalance(result.publicBalance.toSignificant(6));
      setResumeTransactionId(undefined);
      setState("success");
    },
    [address, deliveryHashes, onCompleted, onRefreshBalance, wallet],
  );

  const handleUnshield = useCallback(async () => {
    const activeRecords = records.filter((record) => !record.spent);
    if (!activeRecords.length) return;

    setUnshieldedMicrocredits(getPlannedUnshieldAmount(activeRecords));
    setState("proving");
    setErrorMessage("");

    try {
      const result = await wallet.unshield({ records: activeRecords });
      await completeUnshield(result);
    } catch (error) {
      const splitTransactionId = extractSplitTransactionId(error);
      if (splitTransactionId) {
        persistAleoUnshieldResumeTransaction(address, deliveryHashes, splitTransactionId);
        setResumeTransactionId(splitTransactionId);
        setErrorMessage(
          "The record split completed, but the final unshield transaction did not. Your progress is saved.",
        );
      } else {
        setErrorMessage(getErrorMessage(error));
      }
      setState("error");
    }
  }, [address, completeUnshield, deliveryHashes, records, wallet]);

  const handleResume = useCallback(async () => {
    if (!resumeTransactionId) return;

    setState("proving");
    setErrorMessage("");

    try {
      const result = await wallet.unshield({ transactionId: resumeTransactionId });
      await completeUnshield(result);
    } catch (error) {
      const splitTransactionId = extractSplitTransactionId(error) ?? resumeTransactionId;
      persistAleoUnshieldResumeTransaction(address, deliveryHashes, splitTransactionId);
      setResumeTransactionId(splitTransactionId);
      setErrorMessage(getErrorMessage(error));
      setState("error");
    }
  }, [address, completeUnshield, deliveryHashes, resumeTransactionId, wallet]);

  return (
    <Dialog
      {...modal}
      onOpenChange={(open) => {
        if (isBusy && !open) return;
        modal.onOpenChange(open);
      }}>
      <DialogContent
        onEscapeKeyDown={(event) => {
          if (isBusy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (isBusy) event.preventDefault();
        }}
        showCloseButton={!isBusy}>
        <DialogHeader>
          <DialogTitle>Unshield Aleo</DialogTitle>
        </DialogHeader>

        {state === "idle" || state === "fetching" ? (
          <div className="sk-ui-flex sk-ui-flex-col sk-ui-items-center sk-ui-gap-3 sk-ui-py-8 sk-ui-text-center">
            <Loader2Icon className="sk-ui-size-8 sk-ui-animate-spin sk-ui-text-primary" />
            <div>
              <p className="sk-ui-font-medium">Finding shielded swap deliveries</p>
              <p className="sk-ui-mt-1 sk-ui-text-muted-foreground sk-ui-text-sm">
                Decrypting records locally for this wallet session.
              </p>
            </div>
          </div>
        ) : null}

        {state === "confirm" ? (
          <>
            <div className="sk-ui-rounded-lg sk-ui-border sk-ui-bg-card sk-ui-p-4">
              <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-3">
                <ShieldCheckIcon className="sk-ui-size-8 sk-ui-text-[#00C3FF]" />
                <div>
                  <p className="sk-ui-text-muted-foreground sk-ui-text-sm">Shielded from swap deliveries</p>
                  <p className="sk-ui-font-semibold sk-ui-text-2xl">{formatMicrocredits(totalMicrocredits)} ALEO</p>
                </div>
              </div>
            </div>

            <div className="sk-ui-flex sk-ui-max-h-56 sk-ui-flex-col sk-ui-gap-2 sk-ui-overflow-y-auto">
              {deliveries.map((delivery) => (
                <div
                  className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-gap-3 sk-ui-rounded-lg sk-ui-border sk-ui-p-3 sk-ui-text-sm"
                  key={delivery.deliveryHash}>
                  <div className="sk-ui-min-w-0">
                    <p className="sk-ui-font-medium">Swap delivery</p>
                    <p className="sk-ui-truncate sk-ui-font-mono sk-ui-text-muted-foreground sk-ui-text-xs">
                      {truncateHash(delivery.deliveryHash)}
                    </p>
                  </div>
                  <span className="sk-ui-shrink-0 sk-ui-font-medium">
                    {formatMicrocredits(delivery.microcredits)} ALEO
                  </span>
                </div>
              ))}
            </div>

            <p className="sk-ui-text-muted-foreground sk-ui-text-sm">
              Unshielding generates a zero-knowledge proof in this browser. No record plaintext is stored.
              {plannedMicrocredits > 0n && plannedMicrocredits < totalMicrocredits
                ? " Each pass unshields the largest record — the remainder stays shielded and can be unshielded next."
                : ""}
              {plannedMicrocredits === 0n
                ? ` This record is smaller than the ${formatMicrocredits(DEFAULT_FEE_RECORD_MICROCREDITS)} ALEO fee reserve, so it cannot cover its own unshield fee.`
                : ""}
            </p>

            <Button disabled={plannedMicrocredits === 0n} onClick={() => void handleUnshield()} variant="primary">
              Unshield {formatMicrocredits(plannedMicrocredits)} ALEO
            </Button>
          </>
        ) : null}

        {state === "proving" ? (
          <div className="sk-ui-flex sk-ui-flex-col sk-ui-items-center sk-ui-gap-4 sk-ui-py-8 sk-ui-text-center">
            <Loader2Icon className="sk-ui-size-10 sk-ui-animate-spin sk-ui-text-primary" />
            <div>
              <p className="sk-ui-font-medium sk-ui-text-lg">Generating zero-knowledge proof</p>
              <p className="sk-ui-mt-2 sk-ui-max-w-sm sk-ui-text-muted-foreground sk-ui-text-sm">
                This can take a minute or two. Keep this tab open. The flow cannot be cancelled while proving.
              </p>
            </div>
          </div>
        ) : null}

        {state === "confirming" ? (
          <div className="sk-ui-flex sk-ui-flex-col sk-ui-items-center sk-ui-gap-4 sk-ui-py-8 sk-ui-text-center">
            <Loader2Icon className="sk-ui-size-10 sk-ui-animate-spin sk-ui-text-primary" />
            <div>
              <p className="sk-ui-font-medium sk-ui-text-lg">Confirming unshield transaction</p>
              <p className="sk-ui-mt-2 sk-ui-text-muted-foreground sk-ui-text-sm">
                The proof was submitted. Refreshing your public Aleo balance now.
              </p>
            </div>
          </div>
        ) : null}

        {state === "success" ? (
          <div className="sk-ui-flex sk-ui-flex-col sk-ui-items-center sk-ui-gap-4 sk-ui-py-4 sk-ui-text-center">
            <CheckCircle2Icon className="sk-ui-size-12 sk-ui-text-green-500" />
            <div>
              <p className="sk-ui-font-semibold sk-ui-text-xl">Unshield complete</p>
              <p className="sk-ui-mt-2 sk-ui-text-muted-foreground sk-ui-text-sm">
                Unshielded amount: {formatMicrocredits(unshieldedMicrocredits)} ALEO
              </p>
              <p className="sk-ui-mt-1 sk-ui-text-muted-foreground sk-ui-text-sm">
                Refreshed public balance: {publicBalance ?? "0"} ALEO
              </p>
            </div>
            <div className="sk-ui-flex sk-ui-gap-2">
              {remainingDeliveryHashes.length ? (
                <Button onClick={handleUnshieldNext} variant="primary">
                  Unshield next
                </Button>
              ) : null}
              <Button
                onClick={() => modal.resolve({ confirmed: true, data: undefined })}
                variant={remainingDeliveryHashes.length ? "outline" : "primary"}>
                Done
              </Button>
            </div>
          </div>
        ) : null}

        {state === "error" ? (
          <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-4">
            <div className="sk-ui-flex sk-ui-gap-3 sk-ui-rounded-lg sk-ui-border sk-ui-border-red-500/40 sk-ui-bg-red-500/10 sk-ui-p-4">
              <AlertCircleIcon className="sk-ui-mt-0.5 sk-ui-size-5 sk-ui-shrink-0 sk-ui-text-red-500" />
              <div>
                <p className="sk-ui-font-medium">Unshield needs attention</p>
                <p className="sk-ui-mt-1 sk-ui-text-muted-foreground sk-ui-text-sm">{errorMessage}</p>
                {resumeTransactionId ? (
                  <p className="sk-ui-mt-2 sk-ui-font-mono sk-ui-text-muted-foreground sk-ui-text-xs">
                    Split transaction: {truncateHash(resumeTransactionId)}
                  </p>
                ) : null}
              </div>
            </div>

            {resumeTransactionId ? (
              <Button onClick={() => void handleResume()} variant="primary">
                Resume unshield
              </Button>
            ) : (
              <Button onClick={() => void fetchRecords()} variant="primary">
                Try again
              </Button>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
