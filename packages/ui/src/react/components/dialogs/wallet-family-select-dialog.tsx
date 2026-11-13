"use client";

import { Chain } from "@swapkit/helpers";
import { useState } from "react";
import { cn } from "../../../lib/utils";
import { useModal } from "../../hooks/use-modal";
import type { WalletDescriptor } from "../../types";
import { ChainIcon } from "../simple/chain-icon";
import { WalletIcon } from "../simple/wallet-icon";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import type { ChainFamily } from "./wallet-utils";

export type FamilySelectResult = { family: ChainFamily };

const FAMILY_OPTIONS: Record<ChainFamily, { label: string; icon: Chain }> = {
  evm: { icon: Chain.Ethereum, label: "EVM networks" },
  solana: { icon: Chain.Solana, label: "Solana" },
};

export function WalletFamilySelectDialog({
  wallet,
  families,
  connectedFamilies,
  defaultFamily,
}: {
  wallet: WalletDescriptor;
  families: ChainFamily[];
  connectedFamilies: ChainFamily[];
  defaultFamily: ChainFamily;
}) {
  const modal = useModal<FamilySelectResult>();
  const [selectedFamily, setSelectedFamily] = useState(defaultFamily);

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
          {wallet.displayName} connects one network family at a time. Please select the accounts you want to connect.
        </p>

        <div className="sk-ui-grid sk-ui-grid-cols-2 sk-ui-gap-2">
          {families.map((family) => {
            const isConnected = connectedFamilies.includes(family);

            return (
              <Button
                className={cn(
                  "sk-ui-h-auto sk-ui-justify-start sk-ui-gap-2 sk-ui-border sk-ui-border-transparent sk-ui-px-3 sk-ui-py-3",
                  family === selectedFamily && "!sk-ui-border-foreground !sk-ui-text-foreground",
                )}
                disabled={isConnected}
                key={family}
                onClick={() => setSelectedFamily(family)}>
                <ChainIcon chain={FAMILY_OPTIONS[family].icon} className="sk-ui-size-5" />
                <span className="sk-ui-flex sk-ui-flex-col sk-ui-items-start">
                  {FAMILY_OPTIONS[family].label}
                  {isConnected && <span className="sk-ui-text-muted-foreground sk-ui-text-xs">Already connected</span>}
                </span>
              </Button>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            onClick={() => modal.resolve({ confirmed: true, data: { family: selectedFamily } })}
            type="button"
            variant="primary">
            Connect {FAMILY_OPTIONS[selectedFamily].label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
