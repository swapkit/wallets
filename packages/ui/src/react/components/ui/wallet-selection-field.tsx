"use client";

import { WalletOption } from "@swapkit/helpers";
import { AlertTriangleIcon } from "lucide-react";
import type React from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { isExperimentalWallet } from "../../lib/experimental-wallets";
import { WALLET_CONFIG_REQUIREMENTS } from "../../lib/wallet-config-requirements";
import { useWalletsConfig } from "../../swapkit-config-context";
import { WALLET_DISPLAY_NAMES } from "../config";
import { WalletIcon } from "../simple/wallet-icon";
import { Chip } from "./chip";
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from "./form";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

type WalletSelectionFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  name: TName;
  label?: React.ReactNode;
  description?: React.ReactNode;
  disallowedWallets?: ReadonlySet<WalletOption>;
};

const WALLET_GROUPS = {
  "Browser Extensions": [
    WalletOption.BITGET,
    WalletOption.BRAVE,
    WalletOption.COINBASE_WEB,
    WalletOption.CTRL,
    WalletOption.KEEPKEY_BEX,
    WalletOption.KEPLR,
    WalletOption.LEAP,
    WalletOption.METAMASK,
    WalletOption.OKX,
    WalletOption.ONEKEY,
    WalletOption.PASSKEYS,
    WalletOption.PHANTOM,
    WalletOption.RADIX_WALLET,
    WalletOption.TALISMAN,
  ],
  "Hardware Wallets": [WalletOption.KEEPKEY, WalletOption.LEDGER, WalletOption.TREZOR],
  "Mobile Wallets": [
    WalletOption.COINBASE_MOBILE,
    WalletOption.OKX_MOBILE,
    WalletOption.TRONLINK,
    WalletOption.TRUSTWALLET_WEB,
    WalletOption.VULTISIG,
    WalletOption.WALLETCONNECT,
    WalletOption.XAMAN,
  ],
  Other: [WalletOption.KEYSTORE],
} as const;

/** Flattened list of every wallet option offered by the controls UI. */
export const ALL_CONTROLLABLE_WALLETS = Object.values(WALLET_GROUPS).flat() as readonly WalletOption[];
const EMPTY_DISALLOWED_WALLETS = new Set<WalletOption>();

function formatList(items: ReadonlyArray<string>): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function getDisabledWalletMessage(wallet: WalletOption): string {
  const requiredFields = WALLET_CONFIG_REQUIREMENTS[wallet]?.required.map((field) => field.label) ?? [];
  if (requiredFields.length === 0) return "Configure this wallet before enabling it.";
  return `Requires ${formatList(requiredFields)}. Fill ${requiredFields.length === 1 ? "it" : "them"} in Wallet configuration.`;
}

export function WalletSelectionField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  label,
  control,
  name,
  description,
  disallowedWallets = EMPTY_DISALLOWED_WALLETS,
}: WalletSelectionFieldProps<TFieldValues, TName>) {
  const { isDev } = useWalletsConfig();

  // In prod the experimental wallets are dropped from the visible/controllable
  // set entirely. In dev they stay, badged "DEV" so the wallets repo can
  // toggle them while iterating.
  const visibleWallets = isDev
    ? ALL_CONTROLLABLE_WALLETS
    : ALL_CONTROLLABLE_WALLETS.filter((w) => !isExperimentalWallet(w));

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const allowedVisibleWallets = visibleWallets.filter((wallet) => !disallowedWallets.has(wallet));
        const selectedWallets =
          field.value === "all"
            ? allowedVisibleWallets
            : (field.value as WalletOption[]).filter((wallet) => allowedVisibleWallets.includes(wallet));
        const allSelected = selectedWallets.length === allowedVisibleWallets.length;

        const isWalletSelected = (wallet: WalletOption) =>
          !disallowedWallets.has(wallet) && (field.value === "all" || (field.value as WalletOption[]).includes(wallet));

        const toggleWallet = (wallet: WalletOption) => {
          if (disallowedWallets.has(wallet)) return;
          if (field.value === "all") {
            field.onChange(allowedVisibleWallets.filter((w) => w !== wallet));
            return;
          }
          const current = (field.value as WalletOption[]).filter((w) => allowedVisibleWallets.includes(w));
          if (current.includes(wallet)) {
            field.onChange(current.filter((w) => w !== wallet));
            return;
          }
          const updated = [...current, wallet];
          field.onChange(updated.length === allowedVisibleWallets.length ? "all" : updated);
        };

        const enableAll = () =>
          field.onChange(allowedVisibleWallets.length === visibleWallets.length ? "all" : allowedVisibleWallets);
        const disableAll = () => field.onChange([]);

        return (
          <FormItem>
            {label && <FormLabel>{label}</FormLabel>}
            {description && <FormDescription>{description}</FormDescription>}

            <TooltipProvider delayDuration={200}>
              <FormControl>
                <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2.5">
                  <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-1.5 sk-ui-text-[11.5px] sk-ui-text-muted-foreground">
                    <button
                      className="sk-ui-text-foreground hover:sk-ui-underline focus-visible:sk-ui-outline-none"
                      onClick={enableAll}
                      type="button">
                      Enable all
                    </button>
                    <span aria-hidden>·</span>
                    <button
                      className="sk-ui-text-foreground hover:sk-ui-underline focus-visible:sk-ui-outline-none"
                      onClick={disableAll}
                      type="button">
                      Disable all
                    </button>
                    <span className="sk-ui-ml-auto sk-ui-tabular-nums">
                      {allSelected ? allowedVisibleWallets.length : selectedWallets.length}/
                      {allowedVisibleWallets.length}
                    </span>
                  </div>

                  {Object.entries(WALLET_GROUPS).map(([groupName, wallets]) => {
                    const groupWallets = isDev ? wallets : wallets.filter((w) => !isExperimentalWallet(w));
                    if (groupWallets.length === 0) return null;
                    const allowedGroupWallets = groupWallets.filter((wallet) => !disallowedWallets.has(wallet));
                    const groupSelectedCount = allowedGroupWallets.filter(isWalletSelected).length;

                    return (
                      <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-1.5" key={groupName}>
                        <div className="sk-ui-flex sk-ui-items-center sk-ui-text-[11px] sk-ui-font-semibold sk-ui-uppercase sk-ui-tracking-wider sk-ui-text-muted-foreground">
                          <span>{groupName}</span>
                          <span className="sk-ui-ml-auto sk-ui-tabular-nums">
                            {groupSelectedCount}/{allowedGroupWallets.length}
                          </span>
                        </div>
                        <div className="sk-ui-grid sk-ui-grid-cols-2 sk-ui-gap-1.5">
                          {groupWallets.map((wallet) => {
                            const isDisallowed = disallowedWallets.has(wallet);
                            const chip = (
                              <div className="sk-ui-relative" key={wallet}>
                                <Chip
                                  className={
                                    isDisallowed
                                      ? "sk-ui-w-full sk-ui-justify-start sk-ui-opacity-40 sk-ui-cursor-not-allowed sk-ui-grayscale"
                                      : "sk-ui-w-full sk-ui-justify-start"
                                  }
                                  leading={<WalletIcon className="sk-ui-size-4 sk-ui-shrink-0" wallet={wallet} />}
                                  onClick={() => toggleWallet(wallet)}
                                  selected={isWalletSelected(wallet) && !isDisallowed}>
                                  <span className="sk-ui-inline-flex sk-ui-items-center sk-ui-gap-1">
                                    {WALLET_DISPLAY_NAMES[wallet] || wallet}
                                    {isDev && isExperimentalWallet(wallet) && <DevBadge />}
                                  </span>
                                </Chip>
                                {isDisallowed && (
                                  <span
                                    aria-hidden
                                    className="sk-ui-pointer-events-none sk-ui-absolute sk-ui-top-1 sk-ui-right-1 sk-ui-inline-flex sk-ui-items-center sk-ui-justify-center sk-ui-size-4 sk-ui-rounded-full sk-ui-bg-red-500/20 sk-ui-text-red-400 sk-ui-shadow-sm">
                                    <AlertTriangleIcon className="sk-ui-size-2.5" />
                                  </span>
                                )}
                              </div>
                            );
                            if (!isDisallowed) return chip;

                            return (
                              <Tooltip key={wallet}>
                                <TooltipTrigger asChild>{chip}</TooltipTrigger>
                                <TooltipContent className="sk-ui-max-w-[220px] sk-ui-text-xs sk-ui-leading-snug">
                                  {getDisabledWalletMessage(wallet)}
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </FormControl>
            </TooltipProvider>
          </FormItem>
        );
      }}
    />
  );
}

function DevBadge() {
  return (
    <span
      className="sk-ui-rounded sk-ui-bg-orange-500/15 sk-ui-px-1 sk-ui-py-px sk-ui-text-[9px] sk-ui-font-semibold sk-ui-uppercase sk-ui-tracking-wider sk-ui-text-orange-400"
      title="Development only — not supported in production">
      Dev
    </span>
  );
}
