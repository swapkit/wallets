"use client";

import { MinusIcon, PlusIcon } from "lucide-react";
import { useId } from "react";
import { MAX_DERIVATION_INDEX } from "../../lib/derivation-presets";

const STEP_BUTTON =
  "sk-ui-flex sk-ui-size-6 sk-ui-shrink-0 sk-ui-items-center sk-ui-justify-center sk-ui-rounded sk-ui-text-muted-foreground sk-ui-transition-colors hover:sk-ui-bg-bg-hover hover:sk-ui-text-foreground disabled:sk-ui-opacity-50 focus-visible:sk-ui-outline-none focus-visible:sk-ui-ring-1 focus-visible:sk-ui-ring-ring";

export function IndexStepper({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: number | "") => void;
  value: number | "";
}) {
  const inputId = useId();
  const numeric = value === "" ? 0 : value;

  return (
    <div className="sk-ui-flex sk-ui-shrink-0 sk-ui-items-center sk-ui-gap-0.5 sk-ui-rounded-md sk-ui-border sk-ui-border-border sk-ui-bg-background sk-ui-p-0.5">
      <button
        aria-label={`Decrease ${label}`}
        className={STEP_BUTTON}
        disabled={disabled || numeric <= 0}
        onClick={() => onChange(Math.max(0, numeric - 1))}
        type="button">
        <MinusIcon className="sk-ui-size-3" />
      </button>

      <label className="sk-ui-sr-only" htmlFor={inputId}>
        {label}
      </label>

      <input
        className="sk-ui-w-8 sk-ui-bg-transparent sk-ui-text-center sk-ui-text-foreground sk-ui-text-xs sk-ui-tabular-nums focus-visible:sk-ui-outline-none disabled:sk-ui-opacity-50"
        disabled={disabled}
        id={inputId}
        inputMode="numeric"
        onBlur={() => value === "" && onChange(0)}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "");
          onChange(digits === "" ? "" : Number(digits));
        }}
        type="text"
        value={value}
      />

      <button
        aria-label={`Increase ${label}`}
        className={STEP_BUTTON}
        disabled={disabled || numeric >= MAX_DERIVATION_INDEX}
        onClick={() => onChange(Math.min(MAX_DERIVATION_INDEX, numeric + 1))}
        type="button">
        <PlusIcon className="sk-ui-size-3" />
      </button>
    </div>
  );
}
