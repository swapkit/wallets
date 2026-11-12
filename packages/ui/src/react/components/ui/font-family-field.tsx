"use client";

import type React from "react";
import { useEffect } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { cn } from "../../../lib/utils";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "./form";
import { Input } from "./input";

const FONT_STYLESHEETS: ReadonlyArray<{ id: string; href: string }> = [
  { href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap", id: "swapkit-font-inter" },
  { href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap", id: "swapkit-font-geist" },
];

function useLoadWebFonts() {
  useEffect(() => {
    for (const { id, href } of FONT_STYLESHEETS) {
      if (document.getElementById(id)) continue;
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }
  }, []);
}

type FontPreset = { label: string; value: string };

const FONT_PRESETS: ReadonlyArray<FontPreset> = [
  {
    label: "Sans",
    value:
      'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
  },
  { label: "Serif", value: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif' },
  { label: "Mono", value: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace' },
];

function normalize(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function matchPreset(value: string | undefined): FontPreset | undefined {
  const target = normalize(value);
  return FONT_PRESETS.find((preset) => normalize(preset.value) === target);
}

type FontFamilyFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = { control: Control<TFieldValues>; name: TName; label?: React.ReactNode; description?: React.ReactNode };

export function FontFamilyField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ label, control, name, description }: FontFamilyFieldProps<TFieldValues, TName>) {
  useLoadWebFonts();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const value = (field.value as string | undefined) ?? "";
        const activePreset = matchPreset(value);

        return (
          <FormItem className="sk-ui-space-y-3">
            <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-gap-2">
              {label && <FormLabel className="sk-ui-text-sm sk-ui-font-medium">{label}</FormLabel>}
              <span
                aria-hidden="true"
                className="sk-ui-text-base sk-ui-leading-none sk-ui-text-muted-foreground sk-ui-tabular-nums"
                style={{ fontFamily: value || undefined }}>
                Aa
              </span>
            </div>

            <div className="sk-ui-flex sk-ui-flex-wrap sk-ui-gap-1">
              {FONT_PRESETS.map((preset) => {
                const active = activePreset?.label === preset.label;
                return (
                  <button
                    aria-pressed={active}
                    className={cn(
                      "sk-ui-px-2 sk-ui-py-1 sk-ui-text-xs sk-ui-rounded-md sk-ui-border sk-ui-transition-colors",
                      active
                        ? "sk-ui-bg-white/10 sk-ui-border-white/20 sk-ui-text-foreground"
                        : "sk-ui-bg-transparent sk-ui-border-white/[0.08] sk-ui-text-muted-foreground hover:sk-ui-bg-white/[0.04] hover:sk-ui-text-foreground",
                    )}
                    key={preset.label}
                    onClick={() => field.onChange(preset.value)}
                    style={{ fontFamily: preset.value }}
                    type="button">
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <FormControl>
              <Input
                className="sk-ui-font-mono sk-ui-text-xs"
                onChange={(e) => field.onChange(e.target.value)}
                placeholder="Custom font-family stack"
                value={value}
              />
            </FormControl>

            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
