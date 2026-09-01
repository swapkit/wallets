"use client";

import { ArrowLeftRight, ChevronRight, InfoIcon, TimerIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { formatTokenAmount } from "../../../lib/utils";
import { useMediaQuery } from "../../hooks/use-media-query";
import { showModal } from "../../hooks/use-modal";
import type { UseSwapQuoteReturn } from "../../hooks/use-swap-quote";
import { SwapQuoteRouteSelectDialog } from "../dialogs/swap-quote-route-select-dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { pathLabel, RouteLegsTimeline, RoutePriorityRibbon, StackedProviderLogos } from "./route-provider-parts";

// Each fees-row info icon surfaces a short explanation. Desktop uses Radix
// Tooltip (hover-driven); on touch Radix Tooltip's pointerdown handler closes
// what just opened, so mobile gets a top-sliding Sheet instead — tap the
// icon, sheet slides in with the title + body, tap outside / close to dismiss.
// Rendered as inline-block + baseline-aligned so the icon flows with the
// preceding text rather than dropping to its own line when the label wraps.
function FeeInfo({ title, children }: { title: ReactNode; children: ReactNode }) {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const [open, setOpen] = useState(false);

  const trigger = (
    <button
      aria-label="More info"
      className="sk-ui-ml-1 sk-ui-inline-block sk-ui-align-middle sk-ui-text-muted-foreground hover:sk-ui-text-foreground focus-visible:sk-ui-text-foreground focus-visible:sk-ui-outline-none"
      onClick={isMobile ? () => setOpen(true) : undefined}
      type="button">
      <InfoIcon className="sk-ui-size-4" />
    </button>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Sheet onOpenChange={setOpen} open={open}>
          <SheetContent className="!sk-ui-max-h-[60vh] sk-ui-overflow-y-auto" side="top">
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>{children}</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent className="sk-ui-max-w-[240px] sk-ui-text-xs sk-ui-leading-snug">{children}</TooltipContent>
    </Tooltip>
  );
}

export function SwapQuotePreview({
  selectedRoute,
  routes,
  setSelectedRouteIndex,
  className,
}: {
  selectedRoute: UseSwapQuoteReturn["selectedRoute"];
  routes: UseSwapQuoteReturn["routes"];
  setSelectedRouteIndex: UseSwapQuoteReturn["setSelectedRouteIndex"];
  className?: string;
}) {
  if (!selectedRoute) return null;

  const selectQuoteRoute = async () => {
    const { confirmed, data: selectedRouteIndex } = await showModal<number>(
      <SwapQuoteRouteSelectDialog routes={routes} selectedRoute={selectedRoute} />,
    );

    if (!confirmed) return;

    setSelectedRouteIndex(selectedRouteIndex);
  };

  const providers = selectedRoute.route?.providers ?? [];
  const legs = selectedRoute.route?.legs ?? [];
  const tags = selectedRoute.tags;

  return (
    // sk-ui-relative on the wrapper so the corner ribbon positions against the
    // card edge (Card itself has no overflow:hidden so the ribbon doesn't clip).
    <div className={"sk-ui-relative"}>
      <RoutePriorityRibbon tags={tags} />

      <Card className={className}>
        <CardContent className="sk-ui-fade-in-0 sk-ui-flex sk-ui-animate-in sk-ui-flex-col sk-ui-items-stretch sk-ui-duration-300">
          <Button
            className="sk-ui--mt-4 sk-ui--mx-4 sk-ui-flex sk-ui-rounded-t-xl sk-ui-rounded-b-none sk-ui-px-4 sk-ui-py-3 hover:sk-ui-bg-bg-hover"
            onClick={selectQuoteRoute}
            variant="unstyled">
            <CardHeader className="sk-ui-flex sk-ui-w-full sk-ui-flex-row sk-ui-items-center sk-ui-space-y-0 sk-ui-text-sm">
              <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-1 sk-ui-items-center sk-ui-gap-2">
                <StackedProviderLogos providers={providers} size={24} />

                <span className="sk-ui-truncate sk-ui-font-medium sk-ui-text-foreground">{pathLabel(providers)}</span>
              </div>

              <div className="sk-ui-mr-4 sk-ui-flex sk-ui-items-center sk-ui-gap-1 sk-ui-text-muted-foreground sk-ui-text-sm">
                <TimerIcon className="sk-ui-size-4" />

                <span className="sk-ui-font-normal">{selectedRoute?.formattedEstimatedTime}</span>
              </div>

              <div className="sk-ui-font-medium sk-ui-text-foreground">
                {formatTokenAmount(selectedRoute?.expectedBuyAmount)} {selectedRoute?.outputAssetTicker}
              </div>

              <ChevronRight className="sk-ui-ml-2 sk-ui-size-4 sk-ui-text-foreground" />
            </CardHeader>
          </Button>

          <Accordion collapsible type="single">
            <AccordionItem className="sk-ui--mb-4 sk-ui--mx-4" value="quote">
              <AccordionTrigger className="sk-ui-flex sk-ui-items-center sk-ui-rounded-b-lg sk-ui-border-card sk-ui-border-r sk-ui-border-b sk-ui-border-l sk-ui-bg-background sk-ui-p-4 sk-ui-text-sm hover:sk-ui-bg-background/50 hover:sk-ui-no-underline data-[state=open]:sk-ui-rounded-b-none data-[state=open]:sk-ui-border-b-transparent">
                <ArrowLeftRight className="sk-ui-size-4 sk-ui-text-muted-foreground" />

                <span className="sk-ui-ml-2">
                  1 {selectedRoute?.inputAssetTicker} ≈ {formatTokenAmount(selectedRoute?.expectedBuyAmountFor1Input)}{" "}
                  {selectedRoute?.outputAssetTicker}
                </span>

                <span className="sk-ui-mr-2 sk-ui-ml-auto sk-ui-font-medium">
                  Fees: {selectedRoute?.formattedTotalFeesUSD}
                </span>
              </AccordionTrigger>

              <AccordionContent className="sk-ui-flex sk-ui-flex-col sk-ui-gap-4 sk-ui-rounded-b-lg sk-ui-border-card sk-ui-border-r sk-ui-border-b sk-ui-border-l sk-ui-bg-background sk-ui-px-4 sk-ui-pb-4 sk-ui-duration-150">
                {legs.length > 0 && (
                  <>
                    <RouteLegsTimeline
                      legs={legs}
                      outAmount={selectedRoute?.expectedBuyAmount}
                      outTicker={selectedRoute?.outputAssetTicker}
                      sellAmount={selectedRoute?.route?.sellAmount}
                      sellTicker={selectedRoute?.inputAssetTicker}
                    />
                    <div className="sk-ui-h-px sk-ui-w-full sk-ui-bg-border" />
                  </>
                )}

                <ul className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2 sk-ui-text-muted-foreground">
                  <li className="sk-ui-flex sk-ui-items-start sk-ui-gap-2">
                    <span className="sk-ui-min-w-0 sk-ui-flex-1">
                      Minimum received after slippage ({selectedRoute?.formattedMaxSlippagePercentage})
                      <FeeInfo title="Minimum received">
                        The smallest amount you'll receive if the price moves against you within your slippage
                        tolerance. If the route would deliver less than this, the swap is cancelled.
                      </FeeInfo>
                    </span>

                    <span className="sk-ui-shrink-0 sk-ui-font-medium sk-ui-text-foreground">
                      {formatTokenAmount(selectedRoute?.expectedBuyAmountMaxSlippage)}{" "}
                      {selectedRoute?.outputAssetTicker}
                    </span>
                  </li>

                  <li className="sk-ui-flex sk-ui-items-start sk-ui-gap-2">
                    <span className="sk-ui-min-w-0 sk-ui-flex-1">
                      Liquidity fee
                      <FeeInfo title="Liquidity fee">
                        Cost of sourcing the output asset along this route. May include pool fees, bridge spreads, or
                        DEX-aggregator pricing depending on the provider.
                      </FeeInfo>
                    </span>

                    {selectedRoute?.formattedLiquidityFeeUSD === "$0.00" ? (
                      <span className="sk-ui-shrink-0 sk-ui-font-medium sk-ui-text-success-foreground">FREE</span>
                    ) : (
                      <span className="sk-ui-shrink-0 sk-ui-font-medium sk-ui-text-foreground">
                        {selectedRoute?.formattedLiquidityFeeUSD}
                      </span>
                    )}
                  </li>

                  <li className="sk-ui-flex sk-ui-items-start sk-ui-gap-2">
                    <span className="sk-ui-min-w-0 sk-ui-flex-1">
                      Exchange fee
                      <FeeInfo title="Exchange fee">Fee taken to provide you with the swap service.</FeeInfo>
                    </span>

                    {selectedRoute?.formattedExchangeFeeUSD === "$0.00" ? (
                      <span className="sk-ui-shrink-0 sk-ui-font-medium sk-ui-text-success-foreground">FREE</span>
                    ) : (
                      <span className="sk-ui-shrink-0 sk-ui-font-medium sk-ui-text-foreground">
                        {selectedRoute?.formattedExchangeFeeUSD}
                      </span>
                    )}
                  </li>

                  <li className="sk-ui-flex sk-ui-items-start sk-ui-gap-2">
                    <span className="sk-ui-min-w-0 sk-ui-flex-1">
                      Inbound network fee
                      <FeeInfo title="Inbound network fee">
                        Gas paid to the source chain to send your input into the route. Varies with current network
                        conditions.
                      </FeeInfo>
                    </span>

                    {selectedRoute?.formattedInboundNetworkFeeUSD === "$0.00" ? (
                      <span className="sk-ui-shrink-0 sk-ui-font-medium sk-ui-text-success-foreground">FREE</span>
                    ) : (
                      <span className="sk-ui-shrink-0 sk-ui-font-medium sk-ui-text-foreground">
                        {selectedRoute?.formattedInboundNetworkFeeUSD}
                      </span>
                    )}
                  </li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
