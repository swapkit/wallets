"use client";

import { AssetValue, getExplorerAddressUrl } from "@swapkit/helpers";
import { ExternalLinkIcon, InfoIcon, Loader2Icon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useModal } from "../../hooks/use-modal";
import { truncateMiddle } from "../../lib/truncate";
import { getTokenLogoUrl } from "../config";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

export interface ApprovalConfirmDialogProps {
  tokenAsset: string;
  /** Approval amount. Omitted for allowance-less approvals (e.g. a Stellar trustline). */
  amount?: string;
  /** The contract being granted the allowance. Omitted when it can't be decoded — the row is hidden rather than guessed. */
  spenderAddress?: string;
  /** Dialog heading. Defaults to "Approve Token". */
  title?: string;
  /** Optional explanatory copy shown under the token icon (e.g. what a trustline does). */
  description?: string;
  note?: ReactNode;
  isWaiting?: boolean;
  onApproveClick?: () => Promise<void>;
  onApproveError?: (error: unknown) => void;
}

export const ApprovalConfirmDialog = ({
  tokenAsset,
  amount,
  spenderAddress,
  title = "Approve Token",
  description,
  note,
  isWaiting: externalIsWaiting = false,
  onApproveClick,
  onApproveError,
}: ApprovalConfirmDialogProps) => {
  const modal = useModal();
  const [internalIsWaiting, setInternalIsWaiting] = useState(false);

  const isWaiting = externalIsWaiting || internalIsWaiting;

  const { tokenTicker, tokenLogoUrl, truncatedSpenderAddress, truncatedTokenAddress, tokenUrl, spenderUrl } =
    useMemo(() => {
      const assetValue = AssetValue.from({ asset: tokenAsset });
      const { chain, address: tokenAddress } = assetValue;

      // Explorer helper throws on unsupported chains — fall back to no link rather than break the dialog.
      const safeExplorerUrl = (address?: string) => {
        if (!address) return undefined;
        try {
          return getExplorerAddressUrl({ address, chain }) || undefined;
        } catch {
          return undefined;
        }
      };

      return {
        spenderUrl: safeExplorerUrl(spenderAddress),
        tokenLogoUrl: getTokenLogoUrl(tokenAsset),
        tokenTicker: assetValue.ticker,
        tokenUrl: safeExplorerUrl(tokenAddress),
        truncatedSpenderAddress: spenderAddress ? truncateMiddle(spenderAddress) : undefined,
        truncatedTokenAddress: tokenAddress ? truncateMiddle(tokenAddress) : undefined,
      };
    }, [tokenAsset, spenderAddress]);

  const handleApprove = async () => {
    if (onApproveClick) {
      setInternalIsWaiting(true);
      try {
        await onApproveClick();
        modal.resolve({ confirmed: true, data: undefined });
      } catch (error) {
        setInternalIsWaiting(false);
        if (onApproveError) {
          onApproveError(error);
        } else {
          console.error("Approval failed:", error);
        }
      }
    } else {
      modal.resolve({ confirmed: true, data: undefined });
    }
  };

  return (
    <Dialog {...modal}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="sk-ui-flex sk-ui-flex-col sk-ui-items-center sk-ui-gap-4 sk-ui-py-4">
          <img alt={tokenTicker} className="sk-ui-size-12 sk-ui-rounded-full sk-ui-bg-primary" src={tokenLogoUrl} />

          <div className="sk-ui-text-center">
            <span className="sk-ui-font-bold sk-ui-text-xl sk-ui-text-foreground">
              {amount ? `${amount} ${tokenTicker}` : tokenTicker}
            </span>
          </div>

          {description ? (
            <p className="sk-ui-text-center sk-ui-text-muted-foreground sk-ui-text-sm">{description}</p>
          ) : null}

          {isWaiting ? (
            <div className="sk-ui-flex sk-ui-flex-col sk-ui-items-center sk-ui-gap-1 sk-ui-text-muted-foreground">
              <Loader2Icon className="sk-ui-h-6 sk-ui-w-6 sk-ui-animate-spin sk-ui-text-foreground" />
              <span className="sk-ui-text-sm">Waiting for confirmation...</span>
            </div>
          ) : (
            <div className="sk-ui-flex sk-ui-w-full sk-ui-flex-col sk-ui-gap-2 sk-ui-text-sm">
              {tokenUrl ? (
                <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-gap-3">
                  <span className="sk-ui-text-muted-foreground">Token</span>

                  <a
                    className="sk-ui-flex sk-ui-items-center sk-ui-gap-1.5 sk-ui-font-mono sk-ui-text-foreground hover:sk-ui-underline"
                    href={tokenUrl}
                    rel="noopener noreferrer"
                    target="_blank">
                    <span className="sk-ui-font-sans sk-ui-text-muted-foreground">{tokenTicker}</span>
                    {truncatedTokenAddress}
                    <ExternalLinkIcon className="sk-ui-size-3.5 sk-ui-text-muted-foreground" />
                  </a>
                </div>
              ) : null}

              {truncatedSpenderAddress ? (
                <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-gap-3">
                  <span className="sk-ui-text-muted-foreground">Spender</span>

                  {spenderUrl ? (
                    <a
                      className="sk-ui-flex sk-ui-items-center sk-ui-gap-1.5 sk-ui-font-mono sk-ui-text-foreground hover:sk-ui-underline"
                      href={spenderUrl}
                      rel="noopener noreferrer"
                      target="_blank">
                      {truncatedSpenderAddress}
                      <ExternalLinkIcon className="sk-ui-size-3.5 sk-ui-text-muted-foreground" />
                    </a>
                  ) : (
                    <span className="sk-ui-font-mono sk-ui-text-foreground">{truncatedSpenderAddress}</span>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {note ? (
          <div className="sk-ui-flex sk-ui-items-start sk-ui-gap-2 sk-ui-rounded-lg sk-ui-border sk-ui-border-border sk-ui-p-3">
            <InfoIcon className="sk-ui-mt-px sk-ui-size-4 sk-ui-shrink-0 sk-ui-text-muted-foreground" />
            <span className="sk-ui-text-muted-foreground sk-ui-text-xs">{note}</span>
          </div>
        ) : null}

        <Button disabled={isWaiting} onClick={handleApprove} variant="primary">
          {isWaiting ? "Confirming..." : "Approve"}
        </Button>
      </DialogContent>
    </Dialog>
  );
};
