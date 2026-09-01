"use client";

import { Chain, getChainConfig } from "@swapkit/helpers";
import { ChevronDownIcon, ListFilterIcon, Loader2Icon, SearchIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn, formatCurrency } from "../../../lib/utils";
import { useFilteredSortedAssets } from "../../hooks/use-filtered-sorted-assets";
import { useMediaQuery } from "../../hooks/use-media-query";
import { showModal, useModal } from "../../hooks/use-modal";
import { useTokenPrices } from "../../hooks/use-token-prices";
import { useWalletsConfig } from "../../swapkit-config-context";
import { useSwapKitStore } from "../../swapkit-context";
import { ChainIcon } from "../simple/chain-icon";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { ChainFilterPopover } from "./chain-filter-popover";
import { ChainFilterSheet } from "./chain-filter-sheet";
import { SwapAssetItem } from "./swap-asset-item";

// Quick-filter pills shown under the search bar. First-class chains most users swap to/from.
const POPULAR_CHAIN_PILLS = [Chain.Bitcoin, Chain.Ethereum, Chain.Solana, Chain.Tron, Chain.Base] as const;

export const SwapAssetSelect = memo(function SwapAssetSelect({
  selectedAsset,
  setSelectedAsset,
  isOutputSelect = false,
}: {
  selectedAsset: string | undefined;
  setSelectedAsset: (asset: string) => void;
  isOutputSelect?: boolean;
}) {
  const handleSelectAssetClick = async () => {
    const { confirmed, data: assetIdentifier } = await showModal<string>(
      <SwapAssetSelectTokenDialog isOutputSelect={isOutputSelect} />,
    );

    if (!confirmed) return;

    setSelectedAsset(assetIdentifier);
  };

  return (
    <Button
      className="sk-ui--ml-2 sk-ui-mt-1 sk-ui-w-auto sk-ui-min-w-48 sk-ui-max-w-1/2 sk-ui-rounded-lg sk-ui-px-2 sk-ui-transition-colors sk-ui-duration-100 hover:sk-ui-bg-bg-hover sk-ui-justify-start sk-ui-gap-1"
      onClick={handleSelectAssetClick}
      type="button"
      variant="unstyled">
      <SwapAssetItem asset={selectedAsset} />
    </Button>
  );
});

export function SwapAssetSelectTokenDialog({ isOutputSelect = false }: { isOutputSelect?: boolean }) {
  const modal = useModal();

  const { assets, filters, isSearchingTokens, setFilters, tokenLogoUrls } = useFilteredSortedAssets({
    filterBySwapTo: isOutputSelect,
  });
  const { pricesByTokenId } = useTokenPrices();
  const { isFetchingSwapTo } = useSwapKitStore();
  const { effectiveChains, isChainAllowed } = useWalletsConfig();

  const popularChainPills = useMemo(() => POPULAR_CHAIN_PILLS.filter(isChainAllowed), [isChainAllowed]);

  const [selectedNetworks, setSelectedNetworks] = useState<Chain[]>([]);
  const [chainFilterOpen, setChainFilterOpen] = useState(false);
  const chainFilterTriggerRef = useRef<HTMLButtonElement>(null);
  // Mobile breakpoint per the design — keeps the asset list out from behind the picker
  // and gives the search input the keyboard real estate it needs.
  const isMobileChainFilter = useMediaQuery("(max-width: 639px)");

  useEffect(() => {
    setFilters((f) => ({ ...f, selectedNetworks }));
  }, [selectedNetworks, setFilters]);

  const searchQuery = filters?.searchQuery ?? "";
  const hasActiveFilters = searchQuery.length > 0 || selectedNetworks.length > 0;
  const isLoadingSwapTo = isOutputSelect && isFetchingSwapTo;

  const clearFilters = useCallback(() => {
    setSelectedNetworks([]);
    setFilters((f) => ({ ...f, searchQuery: "" }));
  }, [setFilters]);

  // Split into held vs rest. `assets` from the hook is already sorted balance-first,
  // but the visual grouping requires explicit partitioning.
  const { held, rest } = useMemo(() => {
    const limited = assets?.slice(0, 100) ?? [];
    const h: typeof limited = [];
    const r: typeof limited = [];
    for (const a of limited) {
      if ((a?.getValue?.("number") ?? 0) > 0) h.push(a);
      else r.push(a);
    }
    return { held: h, rest: r };
  }, [assets]);

  return (
    <Dialog {...modal}>
      <DialogContent className="sk-ui-flex sk-ui-flex-col sm:sk-ui-h-[620px] sm:!sk-ui-max-h-[min(90svh,620px)] max-sm:!sk-ui-top-0 max-sm:!sk-ui-left-0 max-sm:!sk-ui-translate-x-0 max-sm:!sk-ui-translate-y-0 max-sm:!sk-ui-h-svh max-sm:!sk-ui-max-h-none max-sm:!sk-ui-w-svw max-sm:!sk-ui-max-w-none max-sm:!sk-ui-rounded-none max-sm:!sk-ui-border-0">
        <DialogHeader>
          <DialogTitle>Select token</DialogTitle>
        </DialogHeader>

        {/* Search + chain filter popover trigger */}
        <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-2">
          <div className="sk-ui-relative sk-ui-flex-1">
            <Input
              className="sk-ui-h-10 sk-ui-bg-secondary sk-ui-pl-9 sk-ui-text-base sk-ui-text-foreground"
              onChange={(e) => setFilters((f) => ({ ...f, searchQuery: e.target.value }))}
              placeholder="Search by name, symbol or address"
              value={searchQuery}
            />
            {isSearchingTokens ? (
              <Loader2Icon className="sk-ui--translate-y-1/2 sk-ui-absolute sk-ui-top-1/2 sk-ui-left-3 sk-ui-size-4 sk-ui-animate-spin sk-ui-text-muted-foreground" />
            ) : (
              <SearchIcon className="sk-ui--translate-y-1/2 sk-ui-absolute sk-ui-top-1/2 sk-ui-left-3 sk-ui-size-4 sk-ui-text-muted-foreground" />
            )}
          </div>

          <div className="sk-ui-relative">
            <Button
              className={cn(
                "sk-ui-h-10 sk-ui-gap-1.5 sk-ui-border sk-ui-border-transparent sk-ui-text-foreground",
                selectedNetworks.length > 0 && "sk-ui-border-accent/40 sk-ui-bg-bg-active",
              )}
              onClick={() => setChainFilterOpen((v) => !v)}
              ref={chainFilterTriggerRef}
              size="sm"
              variant="ghost">
              <ListFilterIcon className="sk-ui-size-4" />
              <span>Chains</span>
              <span className="sk-ui-inline-block sk-ui-min-w-[1.25rem] sk-ui-text-center sk-ui-tabular-nums sk-ui-text-muted-foreground">
                {selectedNetworks.length === 0 ? "All" : selectedNetworks.length}
              </span>
              <ChevronDownIcon
                className={cn(
                  "sk-ui-size-3 sk-ui-transition-transform sk-ui-duration-200",
                  chainFilterOpen && "sk-ui-rotate-180",
                )}
              />
            </Button>
            {isMobileChainFilter ? (
              <ChainFilterSheet
                allChains={effectiveChains}
                onChange={setSelectedNetworks}
                onOpenChange={setChainFilterOpen}
                open={chainFilterOpen}
                selected={selectedNetworks}
              />
            ) : (
              chainFilterOpen && (
                <ChainFilterPopover
                  allChains={effectiveChains}
                  onChange={setSelectedNetworks}
                  onClose={() => setChainFilterOpen(false)}
                  selected={selectedNetworks}
                  triggerRef={chainFilterTriggerRef}
                />
              )
            )}
          </div>
        </div>

        {/* Popular chain pills — quick toggles */}
        <div className="sk-ui-flex sk-ui-flex-wrap sk-ui-gap-1.5">
          {popularChainPills.map((chain) => {
            const cfg = getChainConfig(chain);
            const isOn = selectedNetworks.includes(chain);
            return (
              <button
                aria-pressed={isOn}
                className={cn(
                  "sk-ui-inline-flex sk-ui-items-center sk-ui-gap-1.5 sk-ui-rounded-full sk-ui-border sk-ui-px-2.5 sk-ui-py-1 sk-ui-text-xs sk-ui-font-medium sk-ui-leading-none sk-ui-transition-colors",
                  isOn
                    ? "sk-ui-border-accent/40 sk-ui-bg-bg-active sk-ui-text-foreground"
                    : "sk-ui-border-border sk-ui-bg-transparent sk-ui-text-muted-foreground hover:sk-ui-bg-bg-hover hover:sk-ui-text-foreground",
                )}
                key={chain}
                onClick={() => {
                  setSelectedNetworks((prev) =>
                    prev.includes(chain) ? prev.filter((c) => c !== chain) : [...prev, chain],
                  );
                }}
                type="button">
                <ChainIcon chain={chain} className="sk-ui-block sk-ui-size-3 sk-ui-shrink-0" />
                {cfg?.name ?? chain}
              </button>
            );
          })}
        </div>

        {/* Scrollable grouped list. DialogContent is a fixed height on desktop (620px), so flex-1 here fills the remaining space. */}
        <div className="sk-ui--mx-6 sk-ui--mb-4 sk-ui-relative sk-ui-flex sk-ui-min-h-0 sk-ui-flex-1 sk-ui-flex-col sk-ui-overflow-auto sk-ui-px-6 sk-ui-pb-6">
          {isLoadingSwapTo && (
            <div className="sk-ui-flex sk-ui-flex-1 sk-ui-items-center sk-ui-justify-center sk-ui-gap-2 sk-ui-py-10 sk-ui-text-muted-foreground">
              <Loader2Icon className="sk-ui-size-4 sk-ui-animate-spin" />
              <span className="sk-ui-text-sm">Finding available pairs…</span>
            </div>
          )}

          {!isLoadingSwapTo && held.length === 0 && rest.length === 0 ? (
            <div className="sk-ui-flex sk-ui-flex-1 sk-ui-flex-col sk-ui-items-center sk-ui-justify-center sk-ui-gap-2 sk-ui-py-10 sk-ui-text-center">
              <span className="sk-ui-font-medium sk-ui-text-foreground">No assets found</span>
              <span className="sk-ui-text-muted-foreground sk-ui-text-sm">
                Try changing the selected networks or the search query
              </span>
              {hasActiveFilters && (
                <Button className="sk-ui-mt-1" onClick={clearFilters} size="sm" variant="ghost">
                  Clear filters
                </Button>
              )}
            </div>
          ) : !isLoadingSwapTo ? (
            <>
              {held.length > 0 && (
                <AssetGroup title="Your balances">
                  {held.map((asset) => (
                    <AssetRow
                      asset={asset}
                      key={`swap-asset-held-${asset.toString()}-${asset.chainId}`}
                      logoURI={tokenLogoUrls.get(asset.toString())}
                      onSelect={(identifier) => modal.resolve({ confirmed: true, data: identifier })}
                      priceUSD={pricesByTokenId?.get(asset.toString())?.priceUSD}
                    />
                  ))}
                </AssetGroup>
              )}
              {rest.length > 0 && (
                <AssetGroup title={held.length ? "All tokens" : "Tokens"}>
                  {rest.map((asset) => (
                    <AssetRow
                      asset={asset}
                      key={`swap-asset-rest-${asset.toString()}-${asset.chainId}`}
                      logoURI={tokenLogoUrls.get(asset.toString())}
                      onSelect={(identifier) => modal.resolve({ confirmed: true, data: identifier })}
                      priceUSD={pricesByTokenId?.get(asset.toString())?.priceUSD}
                    />
                  ))}
                </AssetGroup>
              )}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sk-ui-flex sk-ui-flex-col">
      <header className="sk-ui-sticky sk-ui-top-0 sk-ui-z-10 sk-ui-bg-secondary sk-ui-pt-2 sk-ui-pb-1 sk-ui-text-[11px] sk-ui-font-semibold sk-ui-uppercase sk-ui-tracking-wider sk-ui-text-muted-foreground">
        {title}
      </header>
      <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-0.5">{children}</div>
    </div>
  );
}

function AssetRow({
  asset,
  logoURI,
  onSelect,
  priceUSD,
}: {
  asset: ReturnType<typeof useFilteredSortedAssets>["assets"][number];
  logoURI: string | undefined;
  onSelect: (identifier: string) => void;
  priceUSD: number | undefined;
}) {
  const identifier = asset.toString();
  const heldAmount = asset?.getValue("number") ?? 0;
  const hasBalance = heldAmount > 0;

  return (
    <Button
      className="sk-ui-h-auto sk-ui-w-auto sk-ui-justify-between sk-ui-rounded-lg sk-ui-px-3 sk-ui-py-2"
      onClick={() => onSelect(identifier)}
      variant="ghost">
      <SwapAssetItem asset={identifier} logoURI={logoURI} />

      {hasBalance && (
        <div className="sk-ui-flex sk-ui-flex-col sk-ui-items-end">
          <span className="sk-ui-font-medium sk-ui-text-sm sk-ui-text-foreground">{asset.toSignificant(6)}</span>
          <span className="sk-ui--mt-0.5 sk-ui-text-muted-foreground sk-ui-text-xs">
            {priceUSD ? formatCurrency(priceUSD * heldAmount) : "\u00A0"}
          </span>
        </div>
      )}
    </Button>
  );
}
