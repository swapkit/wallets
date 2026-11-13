"use client";

import type React from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "./form";
import { Input } from "./input";

/**
 * Converts HSL string to hex color.
 * Handles formats: "H S% L%" or "H S% L% / A"
 */
function hslToHex(hslString: string): string {
  const match = hslString.match(/^(\d+)\s+(\d+)%\s+(\d+)%/);
  if (!match?.[1] || !match[2] || !match[3]) return "#1a1f1a"; // fallback to default dark

  const h = Number.parseInt(match[1], 10) / 360;
  const s = Number.parseInt(match[2], 10) / 100;
  const l = Number.parseInt(match[3], 10) / 100;

  const hue2rgb = (p: number, q: number, t: number) => {
    const tNorm = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
    if (tNorm < 1 / 2) return q;
    if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
    return p;
  };

  let r: number;
  let g: number;
  let b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Converts hex color to HSL string format "H S% L%"
 */
function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result?.[1] || !result[2] || !result[3]) return "0 0% 50%";

  const r = Number.parseInt(result[1], 16) / 255;
  const g = Number.parseInt(result[2], 16) / 255;
  const b = Number.parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

type ColorPickerFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  name: TName;
  label?: React.ReactNode;
  description?: React.ReactNode;
  placeholder?: string;
};

/**
 * Compact token-card colour input — swatch on the left, label + monospace HSL input
 * stacked on the right. Designed for the 2-col grid in the Widget Studio controls
 * sidebar; the swatch click opens the native colour picker, the HSL field accepts
 * direct text edits.
 */
export function ColorPickerField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ label, control, name, description, placeholder }: ColorPickerFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const hexColor = hslToHex(field.value || "");

        const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          field.onChange(hexToHsl(e.target.value));
        };

        return (
          <FormItem className="sk-ui-space-y-1">
            <FormControl>
              <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-2 sk-ui-rounded-lg sk-ui-border sk-ui-border-border sk-ui-bg-card sk-ui-p-2 focus-within:sk-ui-border-accent/40 hover:sk-ui-border-accent/30 sk-ui-transition-colors">
                {/* Swatch wraps the native colour input directly. The native input is
                    visually hidden behind the swatch but receives the tap, which
                    sidesteps the iOS Safari quirk where programmatic `.click()` from
                    a separate button doesn't open the native picker. */}
                <label
                  aria-label={typeof label === "string" ? `Pick ${label} color` : "Pick color"}
                  className="sk-ui-relative sk-ui-size-7 sk-ui-shrink-0 sk-ui-rounded sk-ui-border sk-ui-border-input sk-ui-cursor-pointer sk-ui-transition-all hover:sk-ui-ring-2 hover:sk-ui-ring-ring focus-within:sk-ui-ring-2 focus-within:sk-ui-ring-ring sk-ui-overflow-hidden"
                  style={{ backgroundColor: hexColor }}>
                  <input
                    className="sk-ui-absolute sk-ui-inset-0 sk-ui-w-full sk-ui-h-full sk-ui-opacity-0 sk-ui-cursor-pointer"
                    onChange={handleColorChange}
                    type="color"
                    value={hexColor}
                  />
                </label>
                <div className="sk-ui-min-w-0 sk-ui-flex-1">
                  {label && (
                    <FormLabel className="sk-ui-block sk-ui-text-xs sk-ui-font-medium sk-ui-leading-tight sk-ui-truncate">
                      {label}
                    </FormLabel>
                  )}
                  <Input
                    className="sk-ui-mt-0.5 sk-ui-h-6 sk-ui-w-full sk-ui-px-1.5 sk-ui-py-0 sk-ui-font-mono sk-ui-text-[11px] sk-ui-bg-transparent sk-ui-border-0 sk-ui-rounded focus-visible:sk-ui-ring-1"
                    onChange={field.onChange}
                    placeholder={placeholder}
                    value={field.value ?? ""}
                  />
                </div>
              </div>
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
