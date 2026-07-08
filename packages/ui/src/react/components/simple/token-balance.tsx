"use client";

import type { AssetValue } from "@swapkit/helpers";
import { cn, formatCurrency } from "../../../lib/utils";
import { useTokenPrices } from "../../hooks/use-token-prices";
import { Skeleton } from "../ui/skeleton";
import { AssetIcon } from "./asset-icon";

interface TokenBalanceProps {
  balance: AssetValue;
  /** When provided, the row becomes a button that reports the asset identifier on click. */
  onSelect?: (asset: string) => void;
}

export function TokenBalance({ balance, onSelect }: TokenBalanceProps) {
  const { pricesByTokenId } = useTokenPrices();

  const displaySymbol = balance.ticker || balance.symbol;
  const balanceNumber = balance.getValue("number") ?? 0;
  const formattedBalance = balance.toSignificant(6);
  const isNonNative = balance.type !== "Native";

  const priceData = pricesByTokenId.get(balance.toString());
  const usdValue = balanceNumber > 0 && priceData?.priceUSD ? balanceNumber * priceData.priceUSD : 0;
  const isLoadingPrice = priceData === undefined;

  const content = (
    <>
      <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-2">
        <AssetIcon asset={balance.toString()} className="sk-ui-size-8" />

        <div className="sk-ui-flex sk-ui-flex-col">
          <span className={balance.isGasAsset ? "sk-ui-font-medium" : ""}>{displaySymbol}</span>

          {isNonNative && <span className="sk-ui-text-xs sk-ui-text-muted-foreground">{balance.chain}</span>}
        </div>
      </div>

      <div className="sk-ui-flex sk-ui-flex-col sk-ui-items-end">
        <span className={balance.isGasAsset ? "sk-ui-font-medium" : ""}>{formattedBalance}</span>

        <Skeleton className="sk-ui-h-4 sk-ui-rounded-md" isLoading={isLoadingPrice}>
          <span className="sk-ui-text-xs sk-ui-text-muted-foreground">{formatCurrency(usdValue)}</span>
        </Skeleton>
      </div>
    </>
  );

  const baseClassName = cn(
    "sk-ui-flex sk-ui-w-full sk-ui-items-center sk-ui-justify-between sk-ui-rounded-lg sk-ui-border sk-ui-p-3 sk-ui-transition-colors sk-ui-bg-white/[0.04]",
    balance.isGasAsset && "sk-ui-bg-bg-active",
  );

  if (onSelect) {
    return (
      <button
        className={cn(
          baseClassName,
          "sk-ui-cursor-pointer sk-ui-text-left hover:sk-ui-bg-bg-hover focus-visible:sk-ui-outline-none focus-visible:sk-ui-ring-2 focus-visible:sk-ui-ring-ring",
        )}
        onClick={() => onSelect(balance.toString())}
        type="button">
        {content}
      </button>
    );
  }

  return <div className={baseClassName}>{content}</div>;
}
