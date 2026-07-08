"use client";

import type { AssetValue } from "@swapkit/helpers";
import { SwapAmountInput } from "./swap-amount-input";
import { SwapAssetSelect } from "./swap-asset-select";

export function SwapInputWithChainSelector({
  label,
  formattedAmountUSD,

  isSwapping,
  isLoading,
  isOutputSelect = false,

  selectedAsset,
  setSelectedAsset,

  amount,
  setAmount,

  balance,
}: {
  label: string;
  formattedAmountUSD: string | undefined;

  isSwapping: boolean;
  isLoading?: boolean;
  isOutputSelect?: boolean;

  selectedAsset: string | undefined;
  setSelectedAsset: (asset: string) => void;

  amount: string | null | undefined;
  setAmount?: (amount: string) => void;

  balance?: AssetValue | null;
}) {
  const isInputDisabled = !selectedAsset || isSwapping || isLoading || !setAmount;

  return (
    <div className="sk-ui--my-2">
      <span className="sk-ui-text-muted-foreground sk-ui-text-xs">{label}</span>

      <div className="sk-ui-flex sk-ui-justify-between">
        <div className="sk-ui-flex sk-ui-flex-col">
          <SwapAssetSelect
            isOutputSelect={isOutputSelect}
            selectedAsset={selectedAsset}
            setSelectedAsset={setSelectedAsset}
          />

          {balance && (
            <span className="sk-ui-text-muted-foreground sk-ui-text-[11px] sk-ui-ml-1 sk-ui-mt-1">
              Bal: {balance.toSignificant(6)}
            </span>
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
