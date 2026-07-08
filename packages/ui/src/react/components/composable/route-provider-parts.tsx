"use client";

import { AssetValue, PriorityLabel, type QuoteResponseRoute } from "@swapkit/helpers";
import { match } from "ts-pattern";
import { cn, formatTokenAmount } from "../../../lib/utils";
import { formatProviderName } from "../../hooks/use-swap-quote";
import { getProviderLogoUrl } from "../config";
import { AssetIcon } from "../simple/asset-icon";

// Build stable React keys for repeated providers. A multi-hop route can hit
// the same provider twice (e.g. ONEINCH on both legs), so we suffix each
// occurrence with its index to keep keys unique without falling back to a
// raw array index.
function keyedProviders(providers: ReadonlyArray<string>) {
  const counts = new Map<string, number>();
  return providers.map((provider, index) => {
    const occurrence = (counts.get(provider) ?? 0) + 1;
    counts.set(provider, occurrence);
    return { index, key: `${provider}#${occurrence}`, provider };
  });
}

// Sized for the collapsed quote header by default; consumers (dialog rows) can
// bump it up. Face-piles when more than one provider with negative margin and
// a ring matching the surface so logos read distinct from each other.
export function StackedProviderLogos({
  providers,
  size = 24,
  ringColor = "sk-ui-ring-background",
  className,
}: {
  providers: ReadonlyArray<string>;
  size?: number;
  ringColor?: string;
  className?: string;
}) {
  if (!providers?.length) return null;

  return (
    <span className={cn("sk-ui-inline-flex sk-ui-shrink-0", className)}>
      {keyedProviders(providers).map(({ provider, key, index }) => (
        <img
          alt={formatProviderName(provider)}
          className={cn(
            "sk-ui-rounded-full sk-ui-bg-primary sk-ui-object-contain",
            index > 0 && "sk-ui-ring-2",
            index > 0 && ringColor,
          )}
          height={size}
          key={key}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
          src={getProviderLogoUrl(provider)}
          style={{
            height: size,
            marginLeft: index === 0 ? 0 : -Math.round(size / 3),
            width: size,
            zIndex: providers.length - index,
          }}
          title={formatProviderName(provider)}
          width={size}
        />
      ))}
    </span>
  );
}

export function pathLabel(providers: ReadonlyArray<string>): string {
  const names = providers.map(formatProviderName);
  if (names.length <= 1) return names[0] ?? "";
  // Three or more providers compress the middle to keep the label single-line
  // at the 380px widget width: "1inch → … → Chainflip".
  if (names.length > 3) return `${names[0]} → … → ${names[names.length - 1]}`;
  return names.join(" → ");
}

function tagLabel(tags: ReadonlyArray<PriorityLabel> | undefined): string | null {
  return (
    match(tags)
      .when(
        (t): t is PriorityLabel[] => Array.isArray(t) && t.includes(PriorityLabel.RECOMMENDED),
        () => "Recommended",
      )
      .when(
        (t): t is PriorityLabel[] => Array.isArray(t) && t.includes(PriorityLabel.CHEAPEST),
        () => "Cheapest",
      )
      .when(
        (t): t is PriorityLabel[] => Array.isArray(t) && t.includes(PriorityLabel.FASTEST),
        () => "Fastest",
      )
      .otherwise(() => null) ?? null
  );
}

// Sits at the top-right of the card, straddling its border so the inline row
// has room for the path + timer + amount. The fill is an opaque equivalent of
// the inline `bg-success` (translucent green @ 0.16) composited over whichever
// surface the ribbon straddles — the card by default, the base background for
// dialog rows. Computing it live with `color-mix` keeps it in sync when a
// studio user re-themes either token, instead of muddying as a translucent
// chip would over the row border.
export function RoutePriorityRibbon({
  tags,
  className,
  surfaceVar = "--sk-ui-card",
}: {
  tags?: ReadonlyArray<PriorityLabel>;
  className?: string;
  /** Theme variable for the surface the ribbon sits over. */
  surfaceVar?: "--sk-ui-card" | "--sk-ui-background";
}) {
  const label = tagLabel(tags);
  if (!label) return null;
  return (
    <span
      className={cn(
        "sk-ui-pointer-events-none sk-ui-absolute -sk-ui-top-2 sk-ui-right-3 sk-ui-z-10 sk-ui-whitespace-nowrap",
        "sk-ui-rounded-md sk-ui-px-2 sk-ui-py-1 sk-ui-text-success-foreground sk-ui-text-[11.5px] sk-ui-font-semibold sk-ui-leading-none sk-ui-shadow-sm",
        className,
      )}
      style={{ background: `color-mix(in srgb, hsl(var(--sk-ui-success-foreground)) 16%, hsl(var(${surfaceVar})))` }}>
      {label}
    </span>
  );
}

function safeTicker(asset: string | undefined): string {
  if (!asset) return "";
  try {
    return AssetValue.from({ asset }).ticker ?? asset;
  } catch {
    // Fall back to the suffix after the chain dot if AssetValue can't parse.
    return asset.split(".")[1]?.split("-")[0] ?? asset;
  }
}

export type RouteLeg = NonNullable<QuoteResponseRoute["legs"]>[number];

// Vertical timeline laid out as input asset → provider step → mid asset → … →
// receive asset. Mirrors the design's expanded detail.
export function RouteLegsTimeline({
  legs,
  outAmount,
  outTicker,
  sellAmount,
  sellTicker,
}: {
  legs: ReadonlyArray<RouteLeg>;
  outAmount?: string | number | null;
  outTicker?: string | null;
  sellAmount?: string | number | null;
  sellTicker?: string | null;
}) {
  if (!legs?.length) return null;

  type AssetNode = { type: "asset"; asset: string; role: "pay" | "mid" | "receive" };
  type StepNode = { type: "step"; leg: RouteLeg };
  type Node = AssetNode | StepNode;

  const nodes: Node[] = [{ asset: legs[0]?.sellAsset ?? "", role: "pay", type: "asset" }];
  legs.forEach((leg, index) => {
    nodes.push({ leg, type: "step" });
    nodes.push({ asset: leg.buyAsset, role: index === legs.length - 1 ? "receive" : "mid", type: "asset" });
  });

  return (
    <ol className="sk-ui-m-0 sk-ui-flex sk-ui-list-none sk-ui-flex-col sk-ui-p-0">
      {nodes.map((node, index) => {
        const isFirst = index === 0;
        const isLast = index === nodes.length - 1;
        const key = node.type === "asset" ? `asset-${index}-${node.asset}` : `step-${index}-${node.leg.provider}`;
        return (
          <li className="sk-ui-flex sk-ui-items-stretch sk-ui-gap-3" key={key}>
            {/* Rail + marker */}
            <div className="sk-ui-relative sk-ui-flex sk-ui-w-8 sk-ui-shrink-0 sk-ui-items-center sk-ui-justify-center">
              {!isFirst && (
                <span className="sk-ui-absolute sk-ui-top-0 sk-ui-left-1/2 sk-ui-h-1/2 sk-ui-w-px sk-ui--translate-x-1/2 sk-ui-bg-border" />
              )}
              {!isLast && (
                <span className="sk-ui-absolute sk-ui-bottom-0 sk-ui-left-1/2 sk-ui-h-1/2 sk-ui-w-px sk-ui--translate-x-1/2 sk-ui-bg-border" />
              )}
              {node.type === "asset" ? (
                // Reuse AssetIcon so the timeline marker is identical to
                // every other place the widget shows assets (asset select,
                // wallet drawer): real token icon + chain badge bottom-right
                // for non-native tokens, deterministic-hue fallback if the
                // icon URL 404s.
                <span className="sk-ui-relative sk-ui-z-10 sk-ui-bg-background">
                  <AssetIcon asset={node.asset} className="sk-ui-size-6" />
                </span>
              ) : (
                // Larger than the asset markers (size-8 vs size-6) so the
                // provider reads as the actor mediating between assets, not
                // a peer node. Matches the design's 32px provider vs 24px asset.
                <img
                  alt={formatProviderName(node.leg.provider)}
                  className="sk-ui-relative sk-ui-z-10 sk-ui-size-8 sk-ui-rounded-full sk-ui-bg-primary sk-ui-object-contain sk-ui-ring-2 sk-ui-ring-background"
                  height={32}
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                  src={getProviderLogoUrl(node.leg.provider)}
                  width={32}
                />
              )}
            </div>

            {/* Content */}
            {node.type === "asset" ? (
              <RouteAssetRow
                asset={node.asset}
                outAmount={outAmount}
                outTicker={outTicker}
                role={node.role}
                sellAmount={sellAmount}
                sellTicker={sellTicker}
              />
            ) : (
              <RouteStepRow leg={node.leg} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function RouteAssetRow({
  asset,
  role,
  sellAmount,
  sellTicker,
  outAmount,
  outTicker,
}: {
  asset: string;
  role: "pay" | "mid" | "receive";
  sellAmount?: string | number | null;
  sellTicker?: string | null;
  outAmount?: string | number | null;
  outTicker?: string | null;
}) {
  const ticker = safeTicker(asset);
  const chain = asset.split(".")[0] ?? "";

  return (
    <div className="sk-ui-flex sk-ui-flex-1 sk-ui-items-center sk-ui-gap-2 sk-ui-py-1">
      <div className="sk-ui-flex sk-ui-flex-1 sk-ui-flex-col">
        <span className="sk-ui-font-semibold sk-ui-text-sm sk-ui-text-foreground">{ticker}</span>
        {chain && <span className="sk-ui-text-[11px] sk-ui-text-muted-foreground">{chain}</span>}
      </div>
      {role === "pay" && sellAmount != null && (
        <div className="sk-ui-flex sk-ui-flex-col sk-ui-items-end sk-ui-gap-0.5 sk-ui-text-right">
          <span className="sk-ui-text-[11px] sk-ui-text-muted-foreground">You send</span>
          <span className="sk-ui-font-semibold sk-ui-text-foreground">
            {formatTokenAmount(sellAmount)} {sellTicker ?? ticker}
          </span>
        </div>
      )}
      {role === "receive" && outAmount != null && (
        <div className="sk-ui-flex sk-ui-flex-col sk-ui-items-end sk-ui-gap-0.5 sk-ui-text-right">
          <span className="sk-ui-text-[11px] sk-ui-text-muted-foreground">You receive</span>
          <span className="sk-ui-font-semibold sk-ui-text-foreground">
            {formatTokenAmount(outAmount)} {outTicker ?? ticker}
          </span>
        </div>
      )}
    </div>
  );
}

function RouteStepRow({ leg }: { leg: RouteLeg }) {
  return (
    <div className="sk-ui-flex sk-ui-min-h-10 sk-ui-flex-1 sk-ui-items-center sk-ui-gap-2 sk-ui-py-1">
      <span className="sk-ui-truncate sk-ui-font-semibold sk-ui-text-sm sk-ui-text-foreground">
        {formatProviderName(leg.provider)}
      </span>
      <span className="sk-ui-shrink-0 sk-ui-rounded sk-ui-bg-secondary sk-ui-px-1.5 sk-ui-py-0.5 sk-ui-text-[10px] sk-ui-font-medium sk-ui-uppercase sk-ui-tracking-wider sk-ui-text-muted-foreground">
        Swap Provider
      </span>
    </div>
  );
}
