"use client";

import { type Chain, getChainConfig } from "@swapkit/helpers";
import { CheckIcon, SearchIcon } from "lucide-react";
import { type Ref, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../../lib/utils";
import { ChainIcon } from "../simple/chain-icon";
import { Input } from "../ui/input";

/**
 * Chain multi-select popover used by both the connect-wallet dialog and the
 * asset-select dialog. Flat list, search, accent check on selected rows.
 *
 * The caller owns the open/close state and the trigger button. Pass `triggerRef`
 * so outside-click ignores the trigger (otherwise the trigger's toggle onClick
 * fights the popover's mousedown-close).
 */
export function ChainFilterPopover({
  allChains,
  selected,
  onChange,
  onClose,
  triggerRef,
  className,
}: {
  allChains: Chain[];
  selected: Chain[];
  onChange: (next: Chain[]) => void;
  onClose: () => void;
  triggerRef: Ref<HTMLElement | null> extends never ? never : React.RefObject<HTMLElement | null>;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef?.current?.contains(target)) return;
      if (containerRef.current && !containerRef.current.contains(target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, triggerRef]);

  const matches = useCallback(
    (c: Chain) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return c.toLowerCase().includes(q) || (getChainConfig(c)?.name ?? c).toLowerCase().includes(q);
    },
    [query],
  );

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visibleChains = useMemo(() => allChains.filter(matches), [allChains, matches]);

  const toggle = (c: Chain) => {
    if (selectedSet.has(c)) onChange(selected.filter((x) => x !== c));
    else onChange([...selected, c]);
  };

  return (
    <div
      className={cn(
        "sk-ui-absolute sk-ui-right-0 sk-ui-top-[calc(100%+4px)] sk-ui-z-50 sk-ui-w-[280px] sk-ui-rounded-lg sk-ui-border sk-ui-border-border sk-ui-bg-secondary sk-ui-shadow-none",
        className,
      )}
      ref={containerRef}>
      <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-px-3 sk-ui-pt-2.5 sk-ui-pb-1">
        <span className="sk-ui-text-[11px] sk-ui-font-semibold sk-ui-uppercase sk-ui-tracking-wider sk-ui-text-muted-foreground">
          Filter chains{selected.length > 0 ? ` · ${selected.length}` : ""}
        </span>
        {selected.length > 0 && (
          <button
            className="sk-ui-text-muted-foreground hover:sk-ui-text-foreground sk-ui-text-[11px] sk-ui-font-medium"
            onClick={() => onChange([])}
            type="button">
            Clear
          </button>
        )}
      </div>
      <div className="sk-ui-px-2 sk-ui-pb-2">
        <div className="sk-ui-relative">
          <Input
            className="sk-ui-h-8 sk-ui-bg-secondary sk-ui-pl-8 sk-ui-text-sm"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chains"
            ref={inputRef}
            value={query}
          />
          <SearchIcon className="sk-ui-pointer-events-none sk-ui-absolute sk-ui-top-1/2 sk-ui-left-3 sk-ui-size-3.5 sk-ui--translate-y-[55%] sk-ui-text-muted-foreground" />
        </div>
      </div>
      <div className="sk-ui-max-h-72 sk-ui-overflow-auto sk-ui-px-2 sk-ui-pb-2 sk-ui-flex sk-ui-flex-col sk-ui-gap-0.5">
        {visibleChains.length === 0 ? (
          <div className="sk-ui-px-2 sk-ui-py-4 sk-ui-text-center sk-ui-text-muted-foreground sk-ui-text-sm">
            No chains match
          </div>
        ) : (
          visibleChains.map((c) => {
            const isSel = selectedSet.has(c);
            const cfg = getChainConfig(c);
            return (
              // biome-ignore lint/a11y/useSemanticElements: button+role=checkbox keeps chain icon and name inside a single clickable row; <input type="checkbox"> + <label> fights the compact flex layout.
              <button
                aria-checked={isSel}
                className={cn(
                  "sk-ui-flex sk-ui-items-center sk-ui-gap-2 sk-ui-rounded-md sk-ui-px-2 sk-ui-py-1.5 sk-ui-text-left sk-ui-text-sm sk-ui-transition-colors",
                  "hover:sk-ui-bg-bg-hover",
                  isSel && "sk-ui-bg-bg-active",
                )}
                key={c}
                onClick={() => toggle(c)}
                role="checkbox"
                type="button">
                <ChainIcon chain={c} className="sk-ui-size-3 sk-ui-shrink-0" />
                <span className="sk-ui-flex-1 sk-ui-truncate sk-ui-text-foreground">{cfg?.name ?? c}</span>
                {isSel && <CheckIcon className="sk-ui-size-3.5 sk-ui-shrink-0 sk-ui-text-accent" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
