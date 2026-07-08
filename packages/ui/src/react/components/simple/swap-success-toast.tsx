"use client";

import type { ChainId } from "@swapkit/helpers";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";

export function SwapSuccessToast({
  txHash,
  chainId,
  depositChannelId,
  depositAddress,
}: {
  txHash: string;
  chainId: ChainId;
  depositChannelId?: string;
  depositAddress?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTrack = () => {
    const params = new URLSearchParams({ chainId, hash: txHash });

    if (depositChannelId) {
      params.set("depositChannelId", depositChannelId);
    }
    if (depositAddress) {
      params.set("depositAddress", depositAddress);
    }

    window.open(`https://track.swapkit.dev/?${params.toString()}`, "_blank");
  };

  return (
    <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-gap-2 sk-ui-w-full">
      <div className="sk-ui-min-w-0 sk-ui-flex-1">
        <div className="sk-ui-font-medium">Swap submitted!</div>
        <div className="sk-ui-text-muted-foreground sk-ui-text-xs sk-ui-truncate">{txHash}</div>
      </div>

      <div className="sk-ui-flex sk-ui-gap-1 sk-ui-shrink-0">
        <Button className="sk-ui-shrink-0" onClick={handleCopy} size="xs" variant="secondary">
          {copied ? <CheckIcon className="sk-ui-size-3" /> : <CopyIcon className="sk-ui-size-3" />}
        </Button>

        <Button className="sk-ui-shrink-0" onClick={handleTrack} size="xs" variant="secondary">
          <ExternalLinkIcon className="sk-ui-size-3" />
          Track
        </Button>
      </div>
    </div>
  );
}
