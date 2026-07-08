"use client";

import type React from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { cn } from "../../../lib/utils";
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from "./form";

type ToggleFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = { control: Control<TFieldValues>; name: TName; label?: React.ReactNode; description?: React.ReactNode };

export function ToggleField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ label, control, name, description }: ToggleFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="sk-ui-flex sk-ui-flex-row sk-ui-items-center sk-ui-justify-between sk-ui-gap-4">
          <div className="sk-ui-space-y-0.5">
            {label && <FormLabel className="sk-ui-text-sm sk-ui-font-medium">{label}</FormLabel>}
            {description && <FormDescription className="sk-ui-text-xs">{description}</FormDescription>}
          </div>

          <FormControl>
            <button
              aria-checked={field.value}
              className={cn(
                "sk-ui-relative sk-ui-inline-flex sk-ui-h-6 sk-ui-w-11 sk-ui-shrink-0 sk-ui-cursor-pointer sk-ui-rounded-full sk-ui-border-2 sk-ui-border-transparent sk-ui-transition-colors",
                "focus-visible:sk-ui-outline-none focus-visible:sk-ui-ring-2 focus-visible:sk-ui-ring-ring focus-visible:sk-ui-ring-offset-2",
                "disabled:sk-ui-cursor-not-allowed disabled:sk-ui-opacity-50",
                field.value ? "sk-ui-bg-accent" : "sk-ui-bg-white/10",
              )}
              onClick={() => field.onChange(!field.value)}
              role="switch"
              type="button">
              <span
                className={cn(
                  "sk-ui-pointer-events-none sk-ui-block sk-ui-h-5 sk-ui-w-5 sk-ui-rounded-full sk-ui-bg-background sk-ui-ring-0 sk-ui-transition-transform",
                  field.value ? "sk-ui-translate-x-5" : "sk-ui-translate-x-0",
                )}
              />
            </button>
          </FormControl>
        </FormItem>
      )}
    />
  );
}
