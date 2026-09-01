"use client";

import type { Chain } from "@swapkit/helpers";
import { cn } from "../../../lib/utils";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";

export function DestinationAddressInput({
  chain,
  customAddress,
  error,
  isExpanded,
  isOutputChainConnected,
  isWalletConnected,
  walletAddress,
  onAddressChange,
  onExpandedChange,
}: {
  chain: Chain | undefined;
  customAddress: string;
  error: string | null;
  isExpanded: boolean;
  isOutputChainConnected: boolean;
  isWalletConnected: boolean;
  walletAddress: string;
  onAddressChange: (address: string) => void;
  onExpandedChange: (expanded: boolean) => void;
}) {
  if (!isWalletConnected || !chain) return null;

  // Output chain IS connected and field is collapsed — show compact address card
  if (isOutputChainConnected && !isExpanded) {
    return (
      <Card className="sk-ui--mt-1">
        <CardContent className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-py-2 sk-ui-px-4">
          <span className="sk-ui-text-muted-foreground sk-ui-text-xs">
            Receiving at{" "}
            <span className="sk-ui-font-medium">
              {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </span>
          </span>
          <Button className="sk-ui-text-xs" onClick={() => onExpandedChange(true)} size="xs" variant="link">
            Edit
          </Button>
        </CardContent>
      </Card>
    );
  }

  const hasError = !!error;

  // Output chain NOT connected OR field expanded — show address input
  return (
    <Card className="sk-ui--mt-1">
      <CardContent className="sk-ui-space-y-2 sk-ui-pt-2 sk-ui-pb-3">
        <p className={cn("sk-ui-text-sm", hasError ? "sk-ui-text-red-400" : "sk-ui-text-muted-foreground")}>
          {hasError
            ? error
            : isOutputChainConnected
              ? "Enter a custom receiving address"
              : "Enter a receiving address or connect a wallet"}
        </p>

        <Input
          className={cn("sk-ui-text-sm sk-ui-font-mono", hasError && "!sk-ui-border-red-400")}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder={`${chain} address`}
          value={customAddress}
        />

        {isOutputChainConnected && (
          <Button
            className="sk-ui-text-xs"
            onClick={() => {
              onAddressChange("");
              onExpandedChange(false);
            }}
            size="xs"
            variant="ghost">
            Use wallet address
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
