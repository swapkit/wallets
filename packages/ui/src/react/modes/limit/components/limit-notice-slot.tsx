"use client";

import { type Chain, type EVMChain, EVMChains, getChainConfig, type LimitOrderQuoteRoute } from "@swapkit/helpers";
import { InfoIcon, PauseCircleIcon, RefreshCwIcon, WalletIcon } from "lucide-react";
import { match, P } from "ts-pattern";
import { LimitNotice } from "../../../components/simple/limit-notice";
import type { LimitDirection } from "../../../lib/limit-orders/price";
import { LIMIT_QUOTE_ERROR_KEYS } from "../hooks/use-limit-order-quote";

type LimitWarning = NonNullable<LimitOrderQuoteRoute["warnings"]>[number];

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function getSigningHint(sellChain: Chain | undefined) {
  if (!sellChain || EVMChains.includes(sellChain as EVMChain)) {
    return "Connect a wallet that can sign typed messages, or try another pair.";
  }
  const name = getChainConfig(sellChain)?.name ?? sellChain;
  return `Connect a wallet that can sign ${name} transactions, or try another pair.`;
}

function QuoteWarnings({ warnings }: { warnings: LimitWarning[] }) {
  return (
    <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2">
      {warnings.map((warning) => (
        <LimitNotice
          body={warning.tooltip}
          icon={InfoIcon}
          key={`${warning.code}:${warning.display}`}
          title={capitalize(warning.display)}
          tone="neutral"
        />
      ))}
    </div>
  );
}

export function LimitNoticeSlot({
  buyTicker,
  direction,
  errorKey,
  newQuoteAmount,
  quoteTicker,
  requoteNotice,
  sellChain,
  sellTicker,
  warnings,
}: {
  buyTicker: string;
  direction: LimitDirection;
  errorKey: string | undefined;
  newQuoteAmount: string;
  quoteTicker: string;
  requoteNotice: { previousAmount: string } | null;
  sellChain: Chain | undefined;
  sellTicker: string;
  warnings: LimitWarning[];
}) {
  const pairLabel = `${sellTicker} → ${buyTicker}`;

  return match({ errorKey, requoteNotice })
    .with({ requoteNotice: P.nonNullable }, ({ requoteNotice: { previousAmount } }) => (
      <LimitNotice
        body={
          <>
            {direction === "sell" ? "You'll receive " : "You'll pay "}
            <span className="sk-ui-font-medium sk-ui-text-foreground">
              {newQuoteAmount} {quoteTicker}
            </span>{" "}
            instead of {previousAmount}. Review, then sign.
          </>
        }
        icon={RefreshCwIcon}
        title="Price updated before signing."
        tone="neutral"
      />
    ))
    .with({ errorKey: LIMIT_QUOTE_ERROR_KEYS.actionUnavailable }, () => (
      <LimitNotice
        body="Try again later, or swap this pair instead."
        icon={PauseCircleIcon}
        title={`Limit orders are paused for ${pairLabel} right now.`}
        tone="warning"
      />
    ))
    .with({ errorKey: LIMIT_QUOTE_ERROR_KEYS.noSignableProvider }, () => (
      <LimitNotice
        body={getSigningHint(sellChain)}
        icon={WalletIcon}
        title={`Your wallet can't place limit orders for ${sellTicker}.`}
        tone="error"
      />
    ))
    .otherwise(() => (warnings.length > 0 ? <QuoteWarnings warnings={warnings} /> : null));
}
