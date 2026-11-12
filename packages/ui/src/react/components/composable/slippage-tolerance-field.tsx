"use client";

import { ChevronDownIcon, PercentIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "../../../lib/utils";
import {
  evaluateSlippageInput,
  formatSlippagePercent,
  MAX_SLIPPAGE_PERCENT,
  MIN_SLIPPAGE_PERCENT,
  SLIPPAGE_PRESETS_PERCENT,
} from "../../lib/slippage";
import { Card } from "../ui/card";
import { Chip } from "../ui/chip";
import { Input } from "../ui/input";

const CHIP_DISABLED_CLASSES = "disabled:sk-ui-pointer-events-none disabled:sk-ui-opacity-50";

export function SlippageToleranceField({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: number;
  onChange: (percent: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  const isPreset = SLIPPAGE_PRESETS_PERCENT.some((preset) => preset === value);

  const selectTolerance = (percent: number) => {
    setCustomInput("");
    setCustomError(null);
    onChange(percent);
  };

  if (!isExpanded) {
    return (
      <button
        className={cn(
          "sk-ui-flex sk-ui-w-full sk-ui-cursor-pointer sk-ui-items-center sk-ui-justify-between sk-ui-rounded-xl sk-ui-bg-card sk-ui-px-4 sk-ui-py-3 sk-ui-text-card-foreground sk-ui-shadow-sm sk-ui-transition-colors hover:sk-ui-bg-bg-hover disabled:sk-ui-pointer-events-none disabled:sk-ui-opacity-50",
          className,
        )}
        disabled={disabled}
        onClick={() => setIsExpanded(true)}
        type="button">
        <span className="sk-ui-flex sk-ui-items-center sk-ui-gap-2 sk-ui-text-muted-foreground sk-ui-text-sm">
          <PercentIcon className="sk-ui-size-4" />
          Slippage tolerance
        </span>
        <span className="sk-ui-flex sk-ui-items-center sk-ui-gap-1 sk-ui-font-medium sk-ui-text-foreground sk-ui-text-sm">
          {formatSlippagePercent(value)}
          <ChevronDownIcon className="sk-ui-size-4 sk-ui-text-muted-foreground" />
        </span>
      </button>
    );
  }

  return (
    <Card className={className}>
      <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-3 sk-ui-p-4">
        <button
          className="sk-ui-flex sk-ui-w-full sk-ui-cursor-pointer sk-ui-items-center sk-ui-justify-between sk-ui-text-xs"
          onClick={() => setIsExpanded(false)}
          type="button">
          <span className="sk-ui-flex sk-ui-items-center sk-ui-gap-2 sk-ui-text-muted-foreground">
            <PercentIcon className="sk-ui-size-4" />
            Slippage tolerance
          </span>
          <span className="sk-ui-font-medium sk-ui-text-foreground">Done</span>
        </button>

        <div className="sk-ui-flex sk-ui-flex-wrap sk-ui-items-center sk-ui-gap-2">
          {SLIPPAGE_PRESETS_PERCENT.map((preset) => (
            <Chip
              className={CHIP_DISABLED_CLASSES}
              disabled={disabled}
              hideCheck
              key={preset}
              onClick={() => selectTolerance(preset)}
              selected={value === preset}>
              {formatSlippagePercent(preset)}
            </Chip>
          ))}

          <div className="sk-ui-relative sk-ui-w-24">
            <Input
              aria-label="Custom slippage tolerance in percent"
              className={cn(
                "sk-ui-h-8 sk-ui-pr-6 sk-ui-text-xs",
                customError && "!sk-ui-border-error-foreground",
                !customError && !isPreset && "!sk-ui-border-accent/60",
              )}
              disabled={disabled}
              inputMode="decimal"
              onChange={(event) => {
                const raw = event.target.value;
                setCustomInput(raw);

                const evaluated = evaluateSlippageInput(raw);
                setCustomError(evaluated.status === "invalid" ? evaluated.error : null);
                if (evaluated.status === "valid") onChange(evaluated.percent);
              }}
              placeholder={isPreset ? "Custom" : String(value)}
              value={customInput}
            />

            <span className="sk-ui--translate-y-1/2 sk-ui-absolute sk-ui-top-1/2 sk-ui-right-2 sk-ui-text-muted-foreground sk-ui-text-xs">
              %
            </span>
          </div>
        </div>

        {customError ? (
          <p className="sk-ui-text-error-foreground sk-ui-text-xs">{customError}</p>
        ) : (
          <p className="sk-ui-text-muted-foreground sk-ui-text-xs">
            The swap is cancelled if the price moves more than this. Accepted range: {MIN_SLIPPAGE_PERCENT}% –{" "}
            {MAX_SLIPPAGE_PERCENT}%.
          </p>
        )}
      </div>
    </Card>
  );
}
