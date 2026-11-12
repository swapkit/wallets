"use client";

import type { AssetValue } from "@swapkit/helpers";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { SwapAmountInput } from "./swap-amount-input";
import { type AssetPickerFilter, SwapAssetSelect } from "./swap-asset-select";

export function SwapInputWithChainSelector({
  label,
  formattedAmountUSD,

  isSwapping,
  isLoading,
  isOutputSelect = false,
  sellAsset,

  selectedAsset,
  setSelectedAsset,

  amount,
  setAmount,

  balance,
  onMaxClick,
  assetFilter,
}: {
  label: ReactNode;
  formattedAmountUSD: string | undefined;

  isSwapping: boolean;
  isLoading?: boolean;
  isOutputSelect?: boolean;
  sellAsset?: string;

  selectedAsset: string | undefined;
  setSelectedAsset: (asset: string) => void;

  amount: string | null | undefined;
  setAmount?: (amount: string) => void;

  balance?: AssetValue | null;
  onMaxClick?: () => void;
  assetFilter?: AssetPickerFilter;
}) {
  const isInputDisabled = !selectedAsset || isSwapping || isLoading || !setAmount;

  return (
    <div className="sk-ui--my-2">
      <span className="sk-ui-text-muted-foreground sk-ui-text-xs">{label}</span>

      <div className="sk-ui-flex sk-ui-justify-between">
        <div className="sk-ui-flex sk-ui-flex-col">
          <SwapAssetSelect
            assetFilter={assetFilter}
            isOutputSelect={isOutputSelect}
            selectedAsset={selectedAsset}
            sellAsset={sellAsset}
            setSelectedAsset={setSelectedAsset}
          />

          {balance && (
            <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-1.5 sk-ui-ml-1 sk-ui-mt-1">
              <span className="sk-ui-text-muted-foreground sk-ui-text-[11px]">Bal: {balance.toSignificant(6)}</span>

              {onMaxClick && (
                <Button
                  className="sk-ui-h-auto sk-ui-rounded sk-ui-px-1.5 sk-ui-py-0.5 sk-ui-text-[11px]"
                  disabled={isInputDisabled}
                  onClick={onMaxClick}
                  size="unstyled"
                  type="button"
                  variant="default">
                  Max
                </Button>
              )}
            </div>
          )}
        </div>

        <SwapAmountInput
          amount={amount}
          disabled={isInputDisabled}
          formattedAmountUSD={formattedAmountUSD}
          isLoading={isLoading}
          setAmount={setAmount}
        />
      </div>
    </div>
  );
}
