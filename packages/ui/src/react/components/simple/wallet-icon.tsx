"use client";

import type { EIP6963ProviderInfo, WalletOption } from "@swapkit/helpers";
import { cn } from "../../../lib/utils";
import { getWalletLogoUrl } from "../config";

export function WalletIcon({
  wallet,
  className = "",
  eip6963Info,
}: {
  wallet: WalletOption;
  className?: string;
  eip6963Info?: EIP6963ProviderInfo | null;
}) {
  // Use EIP-6963 wallet icon if available
  const iconUrl = eip6963Info?.icon || getWalletLogoUrl(wallet);
  const altText = eip6963Info?.name || wallet;

  return (
    <img
      alt={altText}
      className={cn("sk-ui-inline-block sk-ui-size-5 sk-ui-object-contain", className)}
      src={iconUrl}
    />
  );
}
