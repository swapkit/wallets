"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { type Chain, getChainConfig } from "@swapkit/helpers";
import { CheckIcon, ChevronLeftIcon, SearchIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "../../../lib/utils";
import { ChainIcon } from "../simple/chain-icon";

/**
 * Mobile chain filter — full-screen bottom sheet replacement for `ChainFilterPopover`
 * on viewports `< 640px`. Single-select UX: tapping a chain row replaces the multi
 * selection with that one chain and dismisses; tapping "All chains" clears and
 * dismisses; the close affordance dismisses without applying.
 *
 * Multi-select is preserved on desktop via the popover; mobile users still have the
 * popular-chain pills above the search for quick toggles.
 */
export function ChainFilterSheet({
  open,
  onOpenChange,
  allChains,
  selected,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allChains: Chain[];
  selected: Chain[];
  onChange: (next: Chain[]) => void;
}) {
  const [query, setQuery] = useState("");

  // Open with a clean search state and reset on close.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const matches = useCallback(
    (c: Chain) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return c.toLowerCase().includes(q) || (getChainConfig(c)?.name ?? c).toLowerCase().includes(q);
    },
    [query],
  );

  const visibleChains = useMemo(() => allChains.filter(matches), [allChains, matches]);

  // The sheet UX is single-select. Translate at the boundary: a single-element
  // `selected` highlights that row; a multi-selection (set via the popular-chain
  // pills) shows nothing highlighted so the next tap is a clean replace.
  const activeChain: Chain | null = selected.length === 1 ? (selected[0] ?? null) : null;

  const handleSelect = (c: Chain | null) => {
    onChange(c ? [c] : []);
    onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root onOpenChange={onOpenChange} open={open}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=closed]:sk-ui-fade-out-0 data-[state=open]:sk-ui-fade-in-0 sk-ui-fixed sk-ui-inset-0 sk-ui-z-50 sk-ui-bg-black/80 data-[state=closed]:sk-ui-animate-out data-[state=open]:sk-ui-animate-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="swapkit-ui-preflight sk-ui-fixed sk-ui-inset-x-0 sk-ui-bottom-0 sk-ui-z-50 sk-ui-flex sk-ui-flex-col sk-ui-bg-background sk-ui-border-t sk-ui-border-border data-[state=closed]:sk-ui-slide-out-to-bottom data-[state=open]:sk-ui-slide-in-from-bottom data-[state=closed]:sk-ui-animate-out data-[state=open]:sk-ui-animate-in data-[state=closed]:sk-ui-duration-300 data-[state=open]:sk-ui-duration-300"
          // 100dvh handles iOS browser chrome reliably; Tailwind 3.4 ships dvh utilities.
          style={{ height: "100dvh", maxHeight: "100dvh" }}>
          <header className="sk-ui-grid sk-ui-grid-cols-[1fr_auto_1fr] sk-ui-items-center sk-ui-gap-2 sk-ui-px-2 sk-ui-py-3 sk-ui-border-b sk-ui-border-border sk-ui-shrink-0">
            <DialogPrimitive.Close asChild>
              <button
                className="sk-ui-justify-self-start sk-ui-inline-flex sk-ui-items-center sk-ui-gap-0.5 sk-ui-px-1 sk-ui-py-2 sk-ui-bg-transparent sk-ui-text-accent sk-ui-text-[15px] focus-visible:sk-ui-outline-none focus-visible:sk-ui-ring-2 focus-visible:sk-ui-ring-ring sk-ui-rounded-md"
                type="button">
                <ChevronLeftIcon className="sk-ui-size-5" />
                <span>Cancel</span>
              </button>
            </DialogPrimitive.Close>
            <DialogPrimitive.Title className="sk-ui-text-base sk-ui-font-semibold sk-ui-text-foreground">
              Chain
            </DialogPrimitive.Title>
            <span aria-hidden className="sk-ui-w-px sk-ui-justify-self-end" />
          </header>

          <div className="sk-ui-relative sk-ui-px-4 sk-ui-py-2.5 sk-ui-border-b sk-ui-border-border sk-ui-shrink-0">
            <SearchIcon className="sk-ui-pointer-events-none sk-ui-absolute sk-ui-left-7 sk-ui-top-1/2 sk-ui-size-4 sk-ui--translate-y-1/2 sk-ui-text-muted-foreground" />
            <input
              // biome-ignore lint/a11y/noAutofocus: explicit per spec — sheet is a mobile modal where the search input is the primary affordance
              autoFocus
              className="sk-ui-w-full sk-ui-h-10 sk-ui-pl-9 sk-ui-pr-3 sk-ui-rounded-lg sk-ui-border sk-ui-border-border sk-ui-bg-secondary sk-ui-text-foreground sk-ui-text-[15px] focus-visible:sk-ui-outline-none focus-visible:sk-ui-border-accent/50"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chains"
              type="search"
              value={query}
            />
          </div>

          <div className="sk-ui-flex-1 sk-ui-overflow-y-auto sk-ui-pt-1 sk-ui-pb-6" role="listbox">
            <div>
              <button
                aria-selected={activeChain === null}
                className={cn(
                  "sk-ui-flex sk-ui-w-full sk-ui-items-center sk-ui-gap-3 sk-ui-min-h-14 sk-ui-px-4 sk-ui-bg-transparent sk-ui-text-left sk-ui-text-[15px] sk-ui-text-foreground sk-ui-cursor-pointer active:sk-ui-bg-bg-active",
                  activeChain === null && "sk-ui-bg-bg-active",
                )}
                onClick={() => handleSelect(null)}
                role="option"
                type="button">
                <span
                  aria-hidden
                  className="sk-ui-inline-flex sk-ui-size-7 sk-ui-shrink-0 sk-ui-items-center sk-ui-justify-center sk-ui-rounded-full sk-ui-bg-secondary sk-ui-text-muted-foreground sk-ui-text-sm">
                  ⌘
                </span>
                <span className="sk-ui-flex-1 sk-ui-font-medium">All chains</span>
                {activeChain === null && <CheckIcon className="sk-ui-size-[18px] sk-ui-shrink-0 sk-ui-text-accent" />}
              </button>
            </div>

            {visibleChains.map((c) => {
              const cfg = getChainConfig(c);
              const isActive = activeChain === c;
              return (
                <div key={c}>
                  <button
                    aria-selected={isActive}
                    className={cn(
                      "sk-ui-flex sk-ui-w-full sk-ui-items-center sk-ui-gap-3 sk-ui-min-h-14 sk-ui-px-4 sk-ui-bg-transparent sk-ui-text-left sk-ui-text-[15px] sk-ui-text-foreground sk-ui-cursor-pointer active:sk-ui-bg-bg-active",
                      isActive && "sk-ui-bg-bg-active",
                    )}
                    onClick={() => handleSelect(c)}
                    role="option"
                    type="button">
                    <ChainIcon chain={c} className="sk-ui-size-7 sk-ui-shrink-0 sk-ui-rounded-full" />
                    <span className="sk-ui-flex-1 sk-ui-font-medium">{cfg?.name ?? c}</span>
                    {isActive && <CheckIcon className="sk-ui-size-[18px] sk-ui-shrink-0 sk-ui-text-accent" />}
                  </button>
                </div>
              );
            })}

            {visibleChains.length === 0 && (
              <div className="sk-ui-px-4 sk-ui-py-6 sk-ui-text-center sk-ui-text-sm sk-ui-text-muted-foreground">
                No chains match "{query}"
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
