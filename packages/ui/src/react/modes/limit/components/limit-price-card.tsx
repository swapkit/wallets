"use client";

import { Loader2Icon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "../../../../lib/utils";
import { Card } from "../../../components/ui/card";
import { Chip } from "../../../components/ui/chip";
import { Input } from "../../../components/ui/input";
import {
  formatLimitPercent,
  getLimitPresets,
  groupDigits,
  type LimitDirection,
  type LimitPriceBand,
  parseLimitPercentInput,
} from "../../../lib/limit-orders/price";

const SELECTED_PRESET_TOLERANCE = 0.05;

function sanitizePrice(raw: string) {
  const digits = raw.replace(/[^\d.]/g, "");
  const dot = digits.indexOf(".");
  return dot === -1 ? digits : `${digits.slice(0, dot + 1)}${digits.slice(dot + 1).replace(/\./g, "")}`;
}

function formatPercentField(percent: string | null) {
  const formatted = percent === null ? null : formatLimitPercent(percent);
  return formatted === null ? "" : `${formatted.replace(/^-/, "−")} %`;
}

function presetLabel(percent: number) {
  if (percent === 0) return "Market";
  return percent > 0 ? `+${percent}%` : `−${Math.abs(percent)}%`;
}

const BAND_INPUT_CLASSES: Record<LimitPriceBand, string | undefined> = {
  beyond: "sk-ui-border-error-foreground",
  resting: undefined,
  withinFeeGap: "sk-ui-border-warning-foreground/40",
};

const INPUT_CLASS = "sk-ui-font-medium sk-ui-text-base sk-ui-text-foreground sk-ui-tabular-nums";

export function LimitPriceCardSkeleton() {
  return (
    <Card>
      <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-3 sk-ui-p-4">
        <span className="sk-ui-text-muted-foreground sk-ui-text-xs">Limit price</span>
        <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-2">
          <div className="sk-ui-h-10 sk-ui-flex-1 sk-ui-animate-pulse sk-ui-rounded-sm sk-ui-bg-secondary" />
          <div className="sk-ui-h-10 sk-ui-w-24 sk-ui-shrink-0 sk-ui-animate-pulse sk-ui-rounded-sm sk-ui-bg-secondary" />
        </div>
        <div className="sk-ui-h-4 sk-ui-w-3/5 sk-ui-animate-pulse sk-ui-rounded-sm sk-ui-bg-secondary" />
        <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-2 sk-ui-text-muted-foreground">
          <Loader2Icon className="sk-ui-size-3.5 sk-ui-animate-spin" />
          <span className="sk-ui-text-xs">Pricing your order…</span>
        </div>
      </div>
    </Card>
  );
}

export function LimitPriceCard({
  band,
  baseTicker,
  direction,
  disabled,
  effectiveFillPrice,
  market,
  onPercentChange,
  onPriceChange,
  percent,
  price,
  quoteTicker,
  summary,
}: {
  band: LimitPriceBand | null;
  baseTicker: string;
  direction: LimitDirection;
  disabled?: boolean;
  effectiveFillPrice: string;
  market: string;
  onPercentChange: (percent: string) => void;
  onPriceChange: (price: string) => void;
  percent: string | null;
  price: string;
  quoteTicker: string;
  summary: ReactNode;
}) {
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [percentDraft, setPercentDraft] = useState<string | null>(null);
  const bandClass = band ? BAND_INPUT_CLASSES[band] : undefined;
  const percentValue = percent === null ? null : Number(percent);
  const presets = getLimitPresets({ direction, effectiveFillPrice });

  const commitPercent = () => {
    if (percentDraft === null) return;
    const parsed = parseLimitPercentInput(percentDraft.replace("%", ""));
    setPercentDraft(null);
    if (parsed.status === "valid") onPercentChange(parsed.percent);
  };

  return (
    <Card>
      <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-3 sk-ui-p-4">
        <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between">
          <span className="sk-ui-text-muted-foreground sk-ui-text-xs">
            {direction === "sell" ? "Sell limit price" : "Buy limit price"}
          </span>
          <span className="sk-ui-text-muted-foreground sk-ui-text-xs">
            {quoteTicker} per {baseTicker}
          </span>
        </div>

        <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-2">
          <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-1 sk-ui-basis-0 sk-ui-flex-col sk-ui-gap-1">
            <Input
              aria-label="Limit price"
              className={cn(INPUT_CLASS, bandClass)}
              disabled={disabled}
              inputMode="decimal"
              onBlur={() => setIsEditingPrice(false)}
              onChange={(event) => onPriceChange(sanitizePrice(event.target.value))}
              onFocus={() => setIsEditingPrice(true)}
              placeholder="0.00"
              value={isEditingPrice ? price : groupDigits(price)}
            />
            <span className="sk-ui-ml-1 sk-ui-text-[11px] sk-ui-text-muted-foreground">Market {market}</span>
          </div>
          <div className="sk-ui-flex sk-ui-w-24 sk-ui-shrink-0 sk-ui-flex-col sk-ui-gap-1">
            <Input
              aria-label="Price versus market"
              className={cn(INPUT_CLASS, "sk-ui-text-end", bandClass)}
              disabled={disabled}
              inputMode="decimal"
              onBlur={commitPercent}
              onChange={(event) => setPercentDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitPercent();
              }}
              value={percentDraft ?? formatPercentField(percent)}
            />
            <span className="sk-ui-mr-1 sk-ui-text-end sk-ui-text-[11px] sk-ui-text-muted-foreground">vs market</span>
          </div>
        </div>

        <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-1.5">
          <div className="sk-ui-flex sk-ui-flex-wrap sk-ui-gap-1.5">
            {presets.map((preset) => (
              <Chip
                disabled={disabled || preset.displayPrice === null}
                key={preset.percent}
                onClick={() => preset.displayPrice && onPriceChange(preset.displayPrice)}
                selected={percentValue !== null && Math.abs(percentValue - preset.percent) < SELECTED_PRESET_TOLERANCE}>
                {presetLabel(preset.percent)}
              </Chip>
            ))}
          </div>
          <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-gap-2 sk-ui-text-[11px] sk-ui-text-muted-foreground">
            {direction === "sell" ? (
              <>
                <span>Market · place order at current rate</span>
                <span>higher {baseTicker} price · waits →</span>
              </>
            ) : (
              <>
                <span>← lower {baseTicker} price · waits</span>
                <span>Market · place order at current rate</span>
              </>
            )}
          </div>
        </div>

        {summary && (
          <>
            <div className="sk-ui-h-px sk-ui-w-full sk-ui-bg-border" />
            {summary}
          </>
        )}
      </div>
    </Card>
  );
}
