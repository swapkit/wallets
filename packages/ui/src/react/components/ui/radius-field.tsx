"use client";

import type React from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { cn } from "../../../lib/utils";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "./form";

const MIN_REM = 0;
const MAX_REM = 1.5;
const STEP_REM = 0.0625;
const PRESETS_REM = [0, 0.25, 0.5, 0.75, 1, 1.5] as const;

function parseRem(value: string | undefined): number {
  if (!value) return 0;
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_REM, Math.max(MIN_REM, n));
}

function formatRem(value: number): string {
  if (value === 0) return "0rem";
  const trimmed = value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return `${trimmed}rem`;
}

function isApproxEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.001;
}

type RadiusFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = { control: Control<TFieldValues>; name: TName; label?: React.ReactNode; description?: React.ReactNode };

export function RadiusField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ label, control, name, description }: RadiusFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const current = parseRem(field.value as string | undefined);
        const percent = ((current - MIN_REM) / (MAX_REM - MIN_REM)) * 100;
        const trackBackground = `linear-gradient(to right, hsl(var(--sk-ui-white) / 0.32) 0%, hsl(var(--sk-ui-white) / 0.32) ${percent}%, hsl(var(--sk-ui-white) / 0.08) ${percent}%, hsl(var(--sk-ui-white) / 0.08) 100%)`;

        return (
          <FormItem className="sk-ui-space-y-3">
            <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-gap-2">
              {label && <FormLabel className="sk-ui-text-sm sk-ui-font-medium">{label}</FormLabel>}
              <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-2">
                <span
                  aria-hidden="true"
                  className="sk-ui-h-5 sk-ui-w-5 sk-ui-border sk-ui-border-white/20 sk-ui-bg-white/10"
                  style={{ borderRadius: formatRem(current) }}
                />
                <span className="sk-ui-text-xs sk-ui-font-mono sk-ui-text-muted-foreground sk-ui-tabular-nums sk-ui-min-w-[3.5rem] sk-ui-text-right">
                  {formatRem(current)}
                </span>
              </div>
            </div>

            <FormControl>
              <input
                aria-label={typeof label === "string" ? label : "Border radius"}
                className={cn(
                  "sk-ui-w-full sk-ui-h-1.5 sk-ui-appearance-none sk-ui-rounded-full sk-ui-cursor-pointer sk-ui-outline-none",
                  "focus-visible:sk-ui-ring-2 focus-visible:sk-ui-ring-ring focus-visible:sk-ui-ring-offset-2 focus-visible:sk-ui-ring-offset-background",
                  "[&::-webkit-slider-thumb]:sk-ui-appearance-none [&::-webkit-slider-thumb]:sk-ui-h-4 [&::-webkit-slider-thumb]:sk-ui-w-4 [&::-webkit-slider-thumb]:sk-ui-rounded-full [&::-webkit-slider-thumb]:sk-ui-bg-white [&::-webkit-slider-thumb]:sk-ui-shadow-[0_1px_3px_rgba(0,0,0,0.4)] [&::-webkit-slider-thumb]:sk-ui-border-0 [&::-webkit-slider-thumb]:sk-ui-cursor-grab active:[&::-webkit-slider-thumb]:sk-ui-cursor-grabbing [&::-webkit-slider-thumb]:sk-ui-transition-transform hover:[&::-webkit-slider-thumb]:sk-ui-scale-110",
                  "[&::-moz-range-thumb]:sk-ui-h-4 [&::-moz-range-thumb]:sk-ui-w-4 [&::-moz-range-thumb]:sk-ui-rounded-full [&::-moz-range-thumb]:sk-ui-bg-white [&::-moz-range-thumb]:sk-ui-border-0 [&::-moz-range-thumb]:sk-ui-cursor-grab active:[&::-moz-range-thumb]:sk-ui-cursor-grabbing [&::-moz-range-thumb]:sk-ui-shadow-[0_1px_3px_rgba(0,0,0,0.4)]",
                )}
                max={MAX_REM}
                min={MIN_REM}
                onChange={(e) => field.onChange(formatRem(Number.parseFloat(e.target.value)))}
                step={STEP_REM}
                style={{ background: trackBackground }}
                type="range"
                value={current}
              />
            </FormControl>

            <div className="sk-ui-flex sk-ui-flex-wrap sk-ui-gap-1">
              {PRESETS_REM.map((preset) => {
                const active = isApproxEqual(current, preset);
                return (
                  <button
                    aria-pressed={active}
                    className={cn(
                      "sk-ui-px-2 sk-ui-py-1 sk-ui-text-xs sk-ui-font-mono sk-ui-rounded-md sk-ui-border sk-ui-transition-colors",
                      active
                        ? "sk-ui-bg-white/10 sk-ui-border-white/20 sk-ui-text-foreground"
                        : "sk-ui-bg-transparent sk-ui-border-white/[0.08] sk-ui-text-muted-foreground hover:sk-ui-bg-white/[0.04] hover:sk-ui-text-foreground",
                    )}
                    key={preset}
                    onClick={() => field.onChange(formatRem(preset))}
                    type="button">
                    {preset}
                  </button>
                );
              })}
            </div>

            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
