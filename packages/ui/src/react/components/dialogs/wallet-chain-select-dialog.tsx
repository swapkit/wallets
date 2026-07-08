"use client";

import { type Chain, getChainConfig } from "@swapkit/helpers";
import { AlertTriangleIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "../../../lib/utils";
import { useModal } from "../../hooks/use-modal";
import { isExperimentalChainForWallet } from "../../lib/experimental-wallets";
import { useWalletsConfig } from "../../swapkit-config-context";
import type { WalletDescriptor } from "../../types";
import { ChainIcon } from "../simple/chain-icon";
import { WalletIcon } from "../simple/wallet-icon";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function WalletChainSelectDialog({
  wallet,
  chains,
  defaultChain,
  showDeviceHint,
}: {
  wallet: WalletDescriptor;
  chains: Chain[];
  defaultChain?: Chain;
  showDeviceHint?: boolean;
}) {
  const modal = useModal();
  const { isDev } = useWalletsConfig();
  const initialChain = defaultChain && chains.includes(defaultChain) ? defaultChain : chains[0];
  // biome-ignore lint/style/noNonNullAssertion: chains is always non-empty
  const [selectedChain, setSelectedChain] = useState<Chain>(initialChain!);

  const chainConfig = getChainConfig(selectedChain);

  return (
    <Dialog {...modal}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="sk-ui-flex sk-ui-items-center sk-ui-gap-2">
            <WalletIcon className="sk-ui-size-5" eip6963Info={wallet.eip6963Info} wallet={wallet.walletOption} />
            Connect {wallet.displayName}
          </DialogTitle>
        </DialogHeader>

        <p className="sk-ui-text-muted-foreground sk-ui-text-sm">
          {wallet.displayName} only supports connecting one chain at a time. Please select the chain you want to
          connect.
        </p>

        {showDeviceHint && (
          <div className="sk-ui-flex sk-ui-items-start sk-ui-gap-2 sk-ui-rounded-md sk-ui-border sk-ui-border-orange-500/30 sk-ui-bg-orange-500/10 sk-ui-p-3">
            <AlertTriangleIcon className="sk-ui-mt-0.5 sk-ui-size-4 sk-ui-shrink-0 sk-ui-text-orange-400" />
            <p className="sk-ui-text-orange-300 sk-ui-text-sm">
              Make sure the <span className="sk-ui-font-medium">{chainConfig?.name ?? selectedChain}</span> app is open
              on your device before connecting.
            </p>
          </div>
        )}

        <div className="sk-ui-grid sk-ui-grid-cols-8 sk-ui-gap-2">
          {chains.map((chain) => {
            const config = getChainConfig(chain);
            const isSelected = chain === selectedChain;
            const isExperimental = isDev && isExperimentalChainForWallet(wallet.walletOption, chain);

            return (
              <Tooltip key={chain}>
                <TooltipTrigger asChild>
                  <Button
                    className={cn(
                      "sk-ui-relative sk-ui-h-auto sk-ui-border sk-ui-border-transparent sk-ui-p-0 sk-ui-aspect-square",
                      isSelected && "!sk-ui-border-foreground !sk-ui-text-foreground",
                    )}
                    onClick={() => setSelectedChain(chain)}>
                    <ChainIcon chain={chain} className="sk-ui-size-5" />
                    {isExperimental && (
                      <span className="sk-ui-pointer-events-none sk-ui-absolute sk-ui--right-1 sk-ui--top-1 sk-ui-rounded sk-ui-bg-orange-500/90 sk-ui-px-1 sk-ui-py-px sk-ui-text-[8px] sk-ui-font-semibold sk-ui-uppercase sk-ui-tracking-wider sk-ui-text-background">
                        Dev
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <span className="sk-ui-font-medium">{config?.name ?? chain}</span>
                  {isExperimental && (
                    <span className="sk-ui-block sk-ui-text-[10px] sk-ui-text-orange-400">
                      Development only — not supported in production
                    </span>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            onClick={() => modal.resolve({ confirmed: true, data: selectedChain })}
            type="button"
            variant="primary">
            Connect {chainConfig?.name ?? selectedChain}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
