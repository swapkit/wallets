"use client";

import { AssetValue } from "@swapkit/helpers";
import { useState } from "react";
import { cn } from "../../../lib/utils";
import { getChainLogoUrl, getTokenLogoUrl } from "../config";

interface AssetIconProps {
  asset: string;
  className?: string;
  showSmallIcon?: boolean;
}

function getTickerHue(ticker: string): number {
  return ticker.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
}

export function AssetIcon({ asset, className }: AssetIconProps) {
  const [imgError, setImgError] = useState(false);

  if (!asset) return null;

  const assetValue = AssetValue.from({ asset });
  const ticker = assetValue?.ticker || "?";
  const hue = getTickerHue(ticker);

  return (
    <div className={cn("sk-ui-relative sk-ui-size-10", className)}>
      {imgError ? (
        <div
          className="sk-ui-size-full sk-ui-rounded-full sk-ui-flex sk-ui-items-center sk-ui-justify-center sk-ui-text-xs sk-ui-font-semibold sk-ui-text-white"
          style={{ backgroundColor: `hsl(${hue} 50% 35%)` }}>
          {ticker.slice(0, 3)}
        </div>
      ) : (
        <img
          alt={ticker}
          className="sk-ui-size-full sk-ui-overflow-hidden sk-ui-rounded-full sk-ui-object-contain"
          height={40}
          onError={() => setImgError(true)}
          src={getTokenLogoUrl(assetValue?.toString())}
          width={40}
        />
      )}

      {assetValue?.type !== "Native" && (
        <img
          alt={assetValue?.chain}
          className="sk-ui--bottom-0.5 sk-ui-absolute sk-ui-right-0 sk-ui-size-[45%] sk-ui-rounded-full sk-ui-border-2 sk-ui-border-secondary sk-ui-bg-secondary"
          height={24}
          src={getChainLogoUrl(assetValue?.chain)}
          width={24}
        />
      )}
    </div>
  );
}
