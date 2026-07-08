import { AssetValue } from "@swapkit/helpers";
import { ChevronDown, MoveDownIcon } from "lucide-react";
import { useMemo } from "react";
import { formatTokenAmount } from "../../../lib/utils";
import { useModal } from "../../hooks/use-modal";
import type { useSwapQuote } from "../../hooks/use-swap-quote";
import { SwapAmountInput } from "../composable/swap-amount-input";
import { SwapAssetItem } from "../composable/swap-asset-item";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

const CONFIRM_AMOUNT_MAX_SIGNIFICANT_DIGITS = 10;

function formatConfirmAmount(amount: number | string | null | undefined) {
  return formatTokenAmount(amount, { maximumSignificantDigits: CONFIRM_AMOUNT_MAX_SIGNIFICANT_DIGITS });
}

export const SwapConfirmDialog = ({
  swapRoute,
  destinationAddress,
}: {
  swapRoute: NonNullable<ReturnType<typeof useSwapQuote>["selectedRoute"]>;
  destinationAddress: string;
}) => {
  const modal = useModal();

  const { totalFeesListItems, swapSummaryListItems } = useMemo(() => {
    const totalFeesListItems = [
      { title: "Network fee", value: swapRoute.formattedInboundNetworkFeeUSD },
      { title: "Liquidity fee", value: swapRoute.formattedLiquidityFeeUSD },
      { title: "Exchange fee", value: swapRoute.formattedExchangeFeeUSD },
    ];

    const buyTicker = swapRoute.route?.buyAsset ? AssetValue.from({ asset: swapRoute.route.buyAsset }).ticker : "";

    const truncatedAddress = destinationAddress
      ? `${destinationAddress.slice(0, 6)}...${destinationAddress.slice(-4)}`
      : "";

    const swapSummaryListItems = [
      { title: "Estimated time", value: swapRoute.formattedEstimatedTime },
      { title: "Max. slippage", value: swapRoute?.formattedMaxSlippagePercentage },
      { title: "Recipient", value: truncatedAddress },
      { title: "Min received", value: `${formatConfirmAmount(swapRoute.expectedBuyAmountMaxSlippage)} ${buyTicker}` },
    ];

    return { swapSummaryListItems, totalFeesListItems };
  }, [swapRoute, destinationAddress]);

  return (
    <Dialog {...modal}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm swap</DialogTitle>
        </DialogHeader>

        <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2">
          <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-gap-2">
            <SwapAssetItem asset={swapRoute?.route?.sellAsset} className="sk-ui-max-w-1/2" />

            <SwapAmountInput
              amount={formatConfirmAmount(swapRoute.amount)}
              className="[&_input]:!sk-ui-opacity-100 [&_input]:!sk-ui-cursor-text sk-ui-max-w-1/2"
              disabled
              formattedAmountUSD={swapRoute.formattedInputAssetPriceUSD}
            />
          </div>

          <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-2">
            <div className="sk-ui-h-px sk-ui-w-full sk-ui-bg-border" />

            <MoveDownIcon className="sk-ui-size-4 sk-ui-shrink-0 sk-ui-font-bold sk-ui-stroke-[2.5] sk-ui-text-[#8b8c8b]" />

            <div className="sk-ui-h-px sk-ui-w-full sk-ui-bg-border" />
          </div>

          <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-gap-2">
            <SwapAssetItem asset={swapRoute?.route?.buyAsset} />

            <SwapAmountInput
              amount={formatConfirmAmount(swapRoute?.expectedBuyAmount)}
              className="[&_input]:!sk-ui-opacity-100 [&_input]:!sk-ui-cursor-text"
              disabled
              formattedAmountUSD={swapRoute?.formattedOutputAssetPriceUSD}
            />
          </div>
        </div>

        <div className="sk-ui-overflow-hidden sk-ui-rounded-lg sk-ui-border sk-ui-p-4 sk-ui-text-sm">
          <Accordion type="multiple">
            <AccordionItem value="total-fee">
              <AccordionTrigger
                className="sk-ui--mx-4 sk-ui--mt-4 sk-ui--mb-3 sk-ui-items-center sk-ui-px-4 sk-ui-py-3 sk-ui-text-muted-foreground sk-ui-outline-none sk-ui-duration-150 hover:sk-ui-text-foreground hover:sk-ui-no-underline focus:sk-ui-text-foreground"
                showChevron={false}>
                <span className="sk-ui-flex sk-ui-items-center">Total fee</span>

                <ChevronDown className="sk-ui-mt-px sk-ui-ml-1 sk-ui-size-4" />

                <span className="sk-ui-ml-auto sk-ui-font-medium sk-ui-text-foreground">
                  {swapRoute?.formattedTotalFeesUSD}
                </span>
              </AccordionTrigger>

              <AccordionContent className="sk-ui-mt-3 sk-ui-pb-0">
                <ul className="sk-ui-flex sk-ui-flex-col sk-ui-gap-3 sk-ui-border-b sk-ui-pb-3">
                  {totalFeesListItems.map((item) => (
                    <li
                      className="sk-ui-flex sk-ui-items-start sk-ui-justify-between sk-ui-gap-1"
                      key={`total-fee-list-item-${item.title}`}>
                      <span className="sk-ui-text-muted-foreground">{item.title}</span>

                      <span className="sk-ui-max-w-[60%] sk-ui-break-all sk-ui-text-right sk-ui-font-medium">
                        {item.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </AccordionContent>

              <ul className="sk-ui-mt-3 sk-ui-flex sk-ui-flex-col sk-ui-gap-3">
                {swapSummaryListItems.map((item) => (
                  <li
                    className="sk-ui-flex sk-ui-items-start sk-ui-justify-between sk-ui-gap-1"
                    key={`swap-list-item-${item.title}`}>
                    <span className="sk-ui-text-muted-foreground">{item.title}</span>

                    <span className="sk-ui-max-w-[60%] sk-ui-break-all sk-ui-text-right sk-ui-font-medium">
                      {item.value}
                    </span>
                  </li>
                ))}
              </ul>
            </AccordionItem>
          </Accordion>
        </div>

        <Button onClick={() => modal.resolve({ confirmed: true, data: undefined })} variant="primary">
          Confirm swap
        </Button>
      </DialogContent>
    </Dialog>
  );
};
