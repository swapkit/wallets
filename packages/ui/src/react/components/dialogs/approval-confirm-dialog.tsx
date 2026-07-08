"use client";

import { AssetValue, getExplorerAddressUrl } from "@swapkit/helpers";
import { ExternalLinkIcon, Loader2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { useModal } from "../../hooks/use-modal";
import { getTokenLogoUrl } from "../config";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

export interface ApprovalConfirmDialogProps {
  tokenAsset: string;
  amount: string;
  /** The contract being granted the allowance. Omitted when it can't be decoded — the row is hidden rather than guessed. */
  spenderAddress?: string;
  isWaiting?: boolean;
  onApproveClick?: () => Promise<void>;
}

export const ApprovalConfirmDialog = ({
  tokenAsset,
  amount,
  spenderAddress,
  isWaiting: externalIsWaiting = false,
  onApproveClick,
}: ApprovalConfirmDialogProps) => {
  const modal = useModal();
  const [internalIsWaiting, setInternalIsWaiting] = useState(false);

  const isWaiting = externalIsWaiting || internalIsWaiting;

  const { tokenTicker, tokenLogoUrl, truncatedSpenderAddress, truncatedTokenAddress, tokenUrl, spenderUrl } =
    useMemo(() => {
      const truncate = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;

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
        truncatedSpenderAddress: spenderAddress ? truncate(spenderAddress) : undefined,
        truncatedTokenAddress: tokenAddress ? truncate(tokenAddress) : undefined,
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
        throw error;
      }
    } else {
      modal.resolve({ confirmed: true, data: undefined });
    }
  };

  return (
    <Dialog {...modal}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve Token</DialogTitle>
        </DialogHeader>

        <div className="sk-ui-flex sk-ui-flex-col sk-ui-items-center sk-ui-gap-4 sk-ui-py-4">
          <img alt={tokenTicker} className="sk-ui-size-12 sk-ui-rounded-full sk-ui-bg-primary" src={tokenLogoUrl} />

          <div className="sk-ui-text-center">
            <span className="sk-ui-font-bold sk-ui-text-xl sk-ui-text-foreground">
              {amount} {tokenTicker}
            </span>
          </div>

          {isWaiting ? (
            <div className="sk-ui-flex sk-ui-flex-col sk-ui-items-center sk-ui-gap-1 sk-ui-text-muted-foreground">
              <Loader2Icon className="sk-ui-h-6 sk-ui-w-6 sk-ui-animate-spin sk-ui-text-primary" />
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

        <Button disabled={isWaiting} onClick={handleApprove} variant="primary">
          {isWaiting ? "Confirming..." : "Approve"}
        </Button>
      </DialogContent>
    </Dialog>
  );
};
