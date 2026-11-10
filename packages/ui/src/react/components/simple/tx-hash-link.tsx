"use client";

import { type Chain, getExplorerTxUrl } from "@swapkit/helpers";
import { ExternalLinkIcon } from "lucide-react";
import { truncateMiddle } from "../../lib/truncate";

function getSafeExplorerTxUrl(chain: Chain | undefined, txHash: string) {
  if (!chain) return undefined;
  try {
    return getExplorerTxUrl({ chain, txHash }) || undefined;
  } catch {
    return undefined;
  }
}

export function TxHashLink({ chain, txHash }: { chain: Chain | undefined; txHash: string }) {
  const explorerUrl = getSafeExplorerTxUrl(chain, txHash);
  const label = truncateMiddle(txHash);

  if (!explorerUrl) {
    return <span className="sk-ui-shrink-0 sk-ui-font-mono sk-ui-text-muted-foreground sk-ui-text-xs">{label}</span>;
  }

  return (
    <a
      className="sk-ui-flex sk-ui-shrink-0 sk-ui-items-center sk-ui-gap-1 sk-ui-font-mono sk-ui-text-muted-foreground sk-ui-text-xs hover:sk-ui-text-foreground hover:sk-ui-underline"
      href={explorerUrl}
      rel="noopener noreferrer"
      target="_blank">
      {label}
      <ExternalLinkIcon className="sk-ui-size-3" />
    </a>
  );
}
