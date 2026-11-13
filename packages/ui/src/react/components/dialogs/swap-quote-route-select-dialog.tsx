import { TimerIcon } from "lucide-react";
import { cn, formatTokenAmount } from "../../../lib/utils";
import { useModal } from "../../hooks/use-modal";
import type { UseSwapQuoteReturn } from "../../hooks/use-swap-quote";
import { pathLabel, RoutePriorityRibbon, StackedProviderLogos } from "../composable/route-provider-parts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

export const SwapQuoteRouteSelectDialog = ({
  routes,
  selectedRoute,
}: {
  routes: UseSwapQuoteReturn["routes"];
  selectedRoute: UseSwapQuoteReturn["selectedRoute"];
}) => {
  const modal = useModal<NonNullable<UseSwapQuoteReturn["selectedRoute"]>["routeIndex"]>();

  return (
    <Dialog {...modal}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select route</DialogTitle>
        </DialogHeader>

        <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-4">
          {routes?.map((route) => {
            const providers = route?.route?.providers ?? [];
            const isSelected = route?.routeIndex === selectedRoute?.routeIndex;
            return (
              <div className="sk-ui-relative" key={`swap-quote-route-${route?.routeIndex}`}>
                <RoutePriorityRibbon surfaceVar="--sk-ui-background" tags={route?.tags} />
                <button
                  className={cn(
                    "sk-ui-relative sk-ui-flex sk-ui-w-full sk-ui-cursor-pointer sk-ui-items-center sk-ui-gap-3 sk-ui-rounded-lg sk-ui-border sk-ui-border-border sk-ui-bg-background sk-ui-p-3 sk-ui-text-left sk-ui-transition-colors hover:sk-ui-bg-bg-hover focus-visible:sk-ui-outline-none focus-visible:sk-ui-ring-2 focus-visible:sk-ui-ring-ring",
                    isSelected && "sk-ui-border-accent sk-ui-bg-bg-active",
                  )}
                  onClick={() => modal.resolve({ confirmed: true, data: route?.routeIndex })}
                  type="button">
                  <StackedProviderLogos providers={providers} ringColor="sk-ui-ring-background" size={32} />

                  <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-1 sk-ui-flex-col sk-ui-gap-0.5">
                    <span className="sk-ui-truncate sk-ui-font-semibold sk-ui-text-foreground sk-ui-text-sm">
                      {pathLabel(providers)}
                    </span>
                    <span className="sk-ui-inline-flex sk-ui-items-center sk-ui-gap-1 sk-ui-text-muted-foreground sk-ui-text-xs">
                      <TimerIcon className="sk-ui-size-3.5" />
                      {route?.formattedEstimatedTime}
                    </span>
                  </div>

                  <div className="sk-ui-ml-auto sk-ui-flex sk-ui-shrink-0 sk-ui-flex-col sk-ui-items-end sk-ui-gap-0.5">
                    <span className="sk-ui-font-semibold sk-ui-text-foreground">
                      {formatTokenAmount(route?.expectedBuyAmount)} {route?.outputAssetTicker}
                    </span>
                    <span className="sk-ui-text-muted-foreground sk-ui-text-xs">
                      ≈ {route?.formattedOutputAssetPriceUSD}
                    </span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};
