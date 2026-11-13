"use client";

import { HistoryIcon, LogOutIcon, Wallet2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { SwapKitLogoHorizontalWhite } from "../../assets/swapkit-logo-horizontal-white";
import { showModal } from "../../hooks/use-modal";
import { truncateMiddle } from "../../lib/truncate";
import { useSwapKit } from "../../swapkit-context";
import { WalletConnectDialog } from "../dialogs/wallet-connect-dialog";
import { WalletIcon } from "../simple/wallet-icon";
import { Button } from "../ui/button";
import { showTransactionHistoryDrawer } from "./transaction-history-drawer";

export function WidgetHeader({
  actions,
  logoUrl,
  showLogo = true,
  walletAddress,
  onOpenWalletDrawer,
}: {
  actions?: ReactNode;
  logoUrl?: string | null;
  showLogo?: boolean;
  walletAddress?: string;
  onOpenWalletDrawer: () => void;
}) {
  const { isWalletConnected, walletType, eip6963WalletInfo, disconnectWallet } = useSwapKit();

  return (
    <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between">
      {showLogo &&
        (logoUrl ? (
          <img alt="" className="sk-ui-h-6 sk-ui-max-w-32 sk-ui-object-contain" src={logoUrl} />
        ) : (
          <SwapKitLogoHorizontalWhite className="sk-ui-h-6 sk-ui-w-auto" />
        ))}

      <div className="sk-ui-ml-auto sk-ui-flex sk-ui-items-center">
        {actions}

        <Button
          onClick={() => {
            void showTransactionHistoryDrawer();
          }}
          size="xs"
          variant="ghost">
          <HistoryIcon className="sk-ui-size-4" />
        </Button>

        {!isWalletConnected ? (
          <Button
            className="sk-ui-ml-2"
            onClick={() => {
              void showModal(<WalletConnectDialog />);
            }}
            size="xs"
            variant="ghost">
            <Wallet2Icon className="sk-ui-size-4" />

            <span>Connect wallet</span>
          </Button>
        ) : walletType ? (
          <div className="sk-ui-ml-2 sk-ui-flex sk-ui-items-center sk-ui-gap-px">
            <Button className="sk-ui-rounded-r-none" onClick={() => onOpenWalletDrawer()} size="xs" variant="secondary">
              <WalletIcon eip6963Info={eip6963WalletInfo} wallet={walletType} />

              <div>{walletAddress ? truncateMiddle(walletAddress) : "..."}</div>
            </Button>

            <Button className="sk-ui-rounded-l-none" onClick={() => disconnectWallet()} size="xs" variant="secondary">
              <LogOutIcon className="sk-ui-size-3.5" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
