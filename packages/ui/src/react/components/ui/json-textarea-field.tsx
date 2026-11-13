"use client";

import hljs from "highlight.js/lib/core";
import json from "highlight.js/lib/languages/json";
import type React from "react";
import { useMemo, useRef } from "react";
import type { Control, ControllerRenderProps, FieldPath, FieldValues } from "react-hook-form";
import { cn } from "../../../lib/utils";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "./form";
import type { TextareaProps } from "./textarea";

if (!hljs.getLanguage("json")) hljs.registerLanguage("json", json);

// Geometry shared verbatim by the textarea and the highlight overlay so the two
// layers align pixel-for-pixel. Any consumer `className` (mono/text-xs here) is
// appended to both. `box-border` is explicit because this package's preflight —
// and thus the border-box default — is scoped to `.swapkit-ui-preflight`.
const SHARED_BOX_CLASS =
  "sk-ui-box-border sk-ui-block sk-ui-w-full sk-ui-min-h-32 sk-ui-rounded-md sk-ui-border sk-ui-px-3 sk-ui-py-2 sk-ui-text-sm sk-ui-whitespace-pre-wrap sk-ui-break-words";

type JsonTextareaFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  name: TName;
  label?: React.ReactNode;
  description?: React.ReactNode;
} & TextareaProps;

export function JsonTextareaField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ label, control, name, description, ...props }: JsonTextareaFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {label && <FormLabel>{label}</FormLabel>}

          <FormControl>
            <JsonEditor field={field} {...props} />
          </FormControl>

          {description && <FormDescription>{description}</FormDescription>}

          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function JsonEditor<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ field, className, ...props }: { field: ControllerRenderProps<TFieldValues, TName> } & TextareaProps) {
  const overlayRef = useRef<HTMLPreElement>(null);
  const text = typeof field.value === "string" ? field.value : "";

  // Highlight `text + "\n"` so a trailing empty line in the textarea has a
  // matching line in the overlay and the two never drift out of alignment.
  const highlighted = useMemo(() => hljs.highlight(`${text}\n`, { language: "json" }).value, [text]);

  return (
    <div className="sk-ui-relative">
      <pre
        aria-hidden
        className={cn(
          "swapkit-json-editor sk-ui-pointer-events-none sk-ui-absolute sk-ui-inset-0 sk-ui-m-0 sk-ui-overflow-hidden sk-ui-border-transparent sk-ui-bg-background sk-ui-text-foreground",
          SHARED_BOX_CLASS,
          className,
        )}
        ref={overlayRef}>
        <code
          className="hljs sk-ui-bg-transparent sk-ui-p-0"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: hljs.highlight escapes its input before adding spans
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
      {/* Real textarea on top: transparent text (the overlay supplies the
          visible, highlighted glyphs) but a visible caret. */}
      <textarea
        {...field}
        {...props}
        className={cn(
          "sk-ui-relative sk-ui-border-input sk-ui-bg-transparent sk-ui-text-transparent sk-ui-caret-foreground sk-ui-ring-offset-background placeholder:sk-ui-text-muted-foreground focus-visible:sk-ui-ring-2 focus-visible:sk-ui-ring-ring focus-visible:sk-ui-ring-offset-2 focus-visible:sk-ui-outline-none disabled:sk-ui-cursor-not-allowed disabled:sk-ui-opacity-50",
          SHARED_BOX_CLASS,
          className,
        )}
        onBlur={() => {
          field.onBlur();
          if (text.trim() === "") return;
          try {
            field.onChange(JSON.stringify(JSON.parse(text), null, 2));
          } catch {
            // Not valid JSON — leave the user's text untouched.
          }
        }}
        onScroll={(event) => {
          const overlay = overlayRef.current;
          if (!overlay) return;
          overlay.scrollTop = event.currentTarget.scrollTop;
          overlay.scrollLeft = event.currentTarget.scrollLeft;
        }}
        value={text}
      />
    </div>
  );
}
