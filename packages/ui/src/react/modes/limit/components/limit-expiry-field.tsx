"use client";

import { ChevronDownIcon, TimerIcon } from "lucide-react";
import { cn } from "../../../../lib/utils";
import { Card } from "../../../components/ui/card";
import { Chip } from "../../../components/ui/chip";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  formatExpiryBounds,
  formatExpiryDate,
  formatExpiryDuration,
  getVisibleExpiryPresets,
  type LimitExpiry,
  type LimitExpiryBounds,
  resolveLimitExpiry,
  splitExpirySeconds,
} from "../../../lib/limit-orders/expiry";

const CUSTOM_FIELDS = [
  { key: "days", label: "Days" },
  { key: "hours", label: "Hours" },
  { key: "minutes", label: "Minutes" },
] as const;

export function LimitExpiryField({
  bounds,
  disabled,
  expiry,
  isExpanded,
  onChange,
  onExpandedChange,
}: {
  bounds: LimitExpiryBounds;
  disabled?: boolean;
  expiry: LimitExpiry;
  isExpanded: boolean;
  onChange: (expiry: LimitExpiry) => void;
  onExpandedChange: (isExpanded: boolean) => void;
}) {
  const resolved = resolveLimitExpiry(expiry, bounds);
  const label = resolved.isValid && resolved.seconds !== null ? formatExpiryDuration(resolved.seconds) : "Custom";

  if (!isExpanded) {
    return (
      <button
        className="sk-ui-flex sk-ui-w-full sk-ui-cursor-pointer sk-ui-items-center sk-ui-justify-between sk-ui-rounded-xl sk-ui-bg-card sk-ui-px-4 sk-ui-py-3 sk-ui-text-card-foreground sk-ui-shadow-sm sk-ui-transition-colors hover:sk-ui-bg-bg-hover disabled:sk-ui-pointer-events-none disabled:sk-ui-opacity-50"
        disabled={disabled}
        onClick={() => onExpandedChange(true)}
        type="button">
        <span className="sk-ui-flex sk-ui-items-center sk-ui-gap-2 sk-ui-text-muted-foreground sk-ui-text-sm">
          <TimerIcon className="sk-ui-size-4" />
          Expires in
        </span>
        <span
          className={cn(
            "sk-ui-flex sk-ui-items-center sk-ui-gap-1 sk-ui-font-medium sk-ui-text-sm",
            resolved.isValid ? "sk-ui-text-foreground" : "sk-ui-text-error-foreground",
          )}>
          {label}
          <ChevronDownIcon className="sk-ui-size-4 sk-ui-text-muted-foreground" />
        </span>
      </button>
    );
  }

  const presets = getVisibleExpiryPresets(bounds);
  const custom =
    expiry.kind === "custom" ? expiry : { kind: "custom" as const, ...splitExpirySeconds(resolved.seconds ?? 0) };

  return (
    <Card>
      <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-3 sk-ui-p-4">
        <button
          className="sk-ui-flex sk-ui-cursor-pointer sk-ui-items-center sk-ui-justify-between"
          onClick={() => onExpandedChange(false)}
          type="button">
          <span className="sk-ui-flex sk-ui-items-center sk-ui-gap-2 sk-ui-text-muted-foreground sk-ui-text-xs">
            <TimerIcon className="sk-ui-size-4" />
            Expires in
          </span>
          <span className="sk-ui-text-[11px] sk-ui-text-muted-foreground">{formatExpiryBounds(bounds)}</span>
        </button>

        <div className="sk-ui-flex sk-ui-flex-wrap sk-ui-gap-1.5">
          {presets.map((seconds) => (
            <Chip
              disabled={disabled}
              key={seconds}
              onClick={() => onChange({ kind: "preset", seconds })}
              selected={expiry.kind === "preset" && resolved.seconds === seconds}>
              {formatExpiryDuration(seconds)}
            </Chip>
          ))}
          <Chip disabled={disabled} onClick={() => onChange(custom)} selected={expiry.kind === "custom"}>
            Custom
          </Chip>
        </div>

        {expiry.kind === "custom" && (
          <div className="sk-ui-flex sk-ui-items-end sk-ui-gap-2">
            {CUSTOM_FIELDS.map(({ key, label: fieldLabel }) => (
              <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-1 sk-ui-basis-0 sk-ui-flex-col sk-ui-gap-2" key={key}>
                <Label className="sk-ui-text-muted-foreground" htmlFor={`limit-expiry-${key}`}>
                  {fieldLabel}
                </Label>
                <Input
                  className={cn(
                    "sk-ui-text-foreground sk-ui-text-sm sk-ui-tabular-nums",
                    !resolved.isValid && "sk-ui-border-error-foreground",
                  )}
                  disabled={disabled}
                  id={`limit-expiry-${key}`}
                  inputMode="numeric"
                  onChange={(event) => onChange({ ...expiry, [key]: event.target.value.replace(/\D/g, "") })}
                  value={expiry[key]}
                />
              </div>
            ))}
          </div>
        )}

        <span
          className={cn(
            "sk-ui-text-[11px]",
            resolved.isValid ? "sk-ui-text-muted-foreground" : "sk-ui-text-error-foreground",
          )}>
          {resolved.isValid && resolved.seconds !== null
            ? formatExpiryDate(Math.floor(Date.now() / 1000) + resolved.seconds)
            : `Choose between ${formatExpiryBounds(bounds)}.`}
        </span>
      </div>
    </Card>
  );
}
