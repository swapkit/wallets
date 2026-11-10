"use client";

import { AssetValue } from "@swapkit/helpers";
import { AlertTriangleIcon, ChevronDown, LockIcon, MoveDownIcon, MoveUpIcon, WalletIcon } from "lucide-react";
import { cn, formatCurrency } from "../../../../lib/utils";
import { SwapAmountInput } from "../../../components/composable/swap-amount-input";
import { SwapAssetItem } from "../../../components/composable/swap-asset-item";
import { LimitNotice } from "../../../components/simple/limit-notice";
import { SummaryList, type SummaryListItem } from "../../../components/simple/summary-list";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../../components/ui/accordion";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { useModal } from "../../../hooks/use-modal";
import { useTokenPrices } from "../../../hooks/use-token-prices";
import { getChainName } from "../../../lib/chain-catalog";
import { formatExpiryDateTime, formatExpiryDuration } from "../../../lib/limit-orders/expiry";
import { formatFeeBps, formatLimitPrice, toDisplayPrice } from "../../../lib/limit-orders/price";
import { truncateMiddle } from "../../../lib/truncate";
import { formatHeldAmount, getDepositNetworkFee, getHeldSellAmount, isApproximateReceive } from "../lib/held-order";
import type { LimitHeldOrder } from "../limit-order-store";

function FundsDisclosure({
  body,
  footer,
  title,
  tone,
}: {
  body: string;
  footer: string;
  title: string;
  tone: "wallet" | "deposit";
}) {
  const Icon = tone === "wallet" ? WalletIcon : LockIcon;
  return (
    <div
      className={cn(
        "sk-ui-flex sk-ui-items-start sk-ui-gap-2 sk-ui-rounded-lg sk-ui-border sk-ui-p-3",
        tone === "wallet" ? "sk-ui-border-border" : "sk-ui-border-warning-foreground/40 sk-ui-bg-warning",
      )}>
      <Icon
        className={cn(
          "sk-ui-mt-px sk-ui-size-4 sk-ui-shrink-0",
          tone === "wallet" ? "sk-ui-text-success-foreground" : "sk-ui-text-warning-foreground",
        )}
      />
      <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-col sk-ui-gap-1 sk-ui-text-xs">
        <span className="sk-ui-font-medium sk-ui-text-foreground sk-ui-text-sm">{title}</span>
        <span className="sk-ui-text-muted-foreground">{body}</span>
        <span className="sk-ui-mt-1 sk-ui-text-muted-foreground">{footer}</span>
      </div>
    </div>
  );
}

function AssetRow({ amount, asset, usd }: { amount: string; asset: string; usd: string }) {
  return (
    <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-gap-2">
      <SwapAssetItem asset={asset} className="sk-ui-shrink-0" />
      <SwapAmountInput
        amount={amount}
        className="[&_input]:!sk-ui-opacity-100 [&_input]:!sk-ui-cursor-text sk-ui-min-w-0"
        disabled
        formattedAmountUSD={usd}
      />
    </div>
  );
}

export function LimitOrderConfirmDialog({ order }: { order: LimitHeldOrder }) {
  const modal = useModal();
  const { pricesByTokenId } = useTokenPrices();
  const { build, destinationAddress, direction, expiresAt, expirySeconds, kind, route } = order;

  const sellValue = AssetValue.from({ asset: route.sellAsset });
  const buyValue = AssetValue.from({ asset: route.buyAsset });
  const isSell = direction === "sell";
  const isDeposit = kind.flow === "deposit";
  const isApproximate = isApproximateReceive(kind);
  const sellAmount = getHeldSellAmount(order);
  const sellTicker = sellValue.ticker;
  const buyTicker = buyValue.ticker;
  const [baseTicker, quoteTicker] = isSell ? [sellTicker, buyTicker] : [buyTicker, sellTicker];
  const chainName = getChainName(sellValue.chain);
  const sellText = `${formatHeldAmount(sellAmount)} ${sellTicker}`;
  const buyText = `${formatHeldAmount(route.buyAmount)} ${buyTicker}`;
  const expiryLabel = formatExpiryDuration(expirySeconds);
  const displayPrice = toDisplayPrice({ direction, wirePrice: route.limitPrice });
  const price = displayPrice ? (formatLimitPrice(displayPrice) ?? displayPrice) : route.limitPrice;

  const usd = (value: AssetValue, amount: string) =>
    formatCurrency((pricesByTokenId.get(value.toString())?.priceUSD ?? 0) * Number(amount || 0));

  const sellRow = (
    <AssetRow amount={formatHeldAmount(sellAmount)} asset={route.sellAsset} usd={usd(sellValue, sellAmount)} />
  );
  const buyRow = (
    <AssetRow
      amount={`${isApproximate ? "~" : ""}${formatHeldAmount(route.buyAmount)}`}
      asset={route.buyAsset}
      usd={usd(buyValue, route.buyAmount)}
    />
  );
  const DividerIcon = isSell ? MoveDownIcon : MoveUpIcon;

  const disclosure =
    kind.flow === "signature"
      ? {
          body: `You're signing a message, not sending a transaction. Your ${sellText} moves only if the order fills — and you receive ${buyText} in full, with no deduction.`,
          footer: `Keep the ${sellText} and its approval in this wallet for the next ${expiryLabel}. If you spend it, the order can never fill.`,
          title: "Nothing leaves your wallet now.",
        }
      : kind.custody === "protocol"
        ? {
            body: `This is a real ${chainName} transaction. Your ${sellTicker} is held until the order fills, fees come out of what you receive, and the final amount is approximate.`,
            footer: `Cancelling is free and sends your ${sellTicker} back.`,
            title: `You're sending ${sellText} now.`,
          }
        : {
            body: `It moves into an order contract owned by your wallet until the order fills. You receive ${buyText} in full.`,
            footer: `Cancelling needs a transaction from this wallet and returns the ${sellTicker}.`,
            title: `You're sending ${sellText} now.`,
          };

  const networkFee = isDeposit ? getDepositNetworkFee({ build, chain: sellValue.chain }) : null;
  const feeItems: SummaryListItem[] = [
    { title: "Liquidity fee", value: formatFeeBps(route.takerFeeBps) },
    { title: "Exchange fee", value: formatFeeBps(route.integratorFeeBps) },
    ...(isDeposit
      ? networkFee
        ? [{ title: `${chainName} network fee`, value: networkFee }]
        : []
      : [{ title: "Network fee", value: <span className="sk-ui-text-success-foreground">FREE</span> }]),
  ];
  const feeNote = !isDeposit
    ? "Already included in the limit price above — not deducted from what you receive."
    : isApproximate
      ? "Taken out of what you receive, which is why the amount above is approximate. The network fee is paid by your wallet to send the deposit."
      : "Already included in the limit price above — not deducted from what you receive. The network fee is paid by your wallet to send the deposit.";

  const summaryItems: SummaryListItem[] = [
    { title: isSell ? "Sell limit price" : "Buy limit price", value: `${price} ${quoteTicker} per ${baseTicker}` },
    { title: isSell ? "Fills at or above" : "Fills at or below", value: price },
    { title: "Expires", value: formatExpiryDateTime(expiresAt) },
    { title: "Partial fills", value: "Allowed" },
    { title: isDeposit ? "Receiving address" : "Recipient", value: truncateMiddle(destinationAddress) },
  ];

  return (
    <Dialog {...modal}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isSell ? "Confirm sell order" : "Confirm buy order"}</DialogTitle>
        </DialogHeader>

        <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2">
          {isSell ? sellRow : buyRow}

          <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-2">
            <div className="sk-ui-h-px sk-ui-w-full sk-ui-bg-border" />
            <DividerIcon className="sk-ui-size-4 sk-ui-shrink-0 sk-ui-font-bold sk-ui-stroke-[2.5] sk-ui-text-[#8b8c8b]" />
            <div className="sk-ui-h-px sk-ui-w-full sk-ui-bg-border" />
          </div>

          {isSell ? buyRow : sellRow}
        </div>

        <FundsDisclosure {...disclosure} tone={isDeposit ? "deposit" : "wallet"} />

        <div className="sk-ui-overflow-hidden sk-ui-rounded-lg sk-ui-border sk-ui-p-4 sk-ui-text-sm">
          <Accordion type="multiple">
            <AccordionItem value="total-fee">
              <AccordionTrigger
                className="sk-ui--mx-4 sk-ui--mt-4 sk-ui--mb-3 sk-ui-items-center sk-ui-px-4 sk-ui-py-3 sk-ui-text-muted-foreground sk-ui-outline-none sk-ui-duration-150 hover:sk-ui-text-foreground hover:sk-ui-no-underline focus:sk-ui-text-foreground"
                showChevron={false}>
                <span className="sk-ui-flex sk-ui-items-center">Total fee</span>
                <ChevronDown className="sk-ui-mt-px sk-ui-ml-1 sk-ui-size-4" />
                <span className="sk-ui-ml-auto sk-ui-font-medium sk-ui-text-foreground">
                  {formatFeeBps(route.takerFeeBps + route.integratorFeeBps)}
                </span>
              </AccordionTrigger>

              <AccordionContent className="sk-ui-mt-3 sk-ui-pb-0">
                <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-3 sk-ui-border-b sk-ui-pb-3">
                  <SummaryList items={feeItems} />
                  <p className="sk-ui-text-muted-foreground sk-ui-text-xs">{feeNote}</p>
                </div>
              </AccordionContent>

              <SummaryList className="sk-ui-mt-3" items={summaryItems} />
            </AccordionItem>
          </Accordion>
        </div>

        {build.warnings?.map((warning) => (
          <LimitNotice
            body={warning.tooltip ?? warning.display}
            icon={AlertTriangleIcon}
            key={warning.code}
            title={warning.tooltip ? warning.display : undefined}
            tone="warning"
          />
        ))}

        <Button onClick={() => modal.resolve({ confirmed: true, data: undefined })} variant="primary">
          {isDeposit ? `Send ${sellTicker} and place order` : "Sign and place order"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
