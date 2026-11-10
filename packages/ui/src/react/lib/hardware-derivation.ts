import { Chain, WalletOption } from "@swapkit/helpers";
import { type DerivationStandardId, standardsFor } from "./derivation-presets";

export type HardwareStandardId = Exclude<DerivationStandardId, "custom">;

export type HardwareStandard = { id: HardwareStandardId; label: string; template: string };

// The device apps only sign taproot for Bitcoin; Litecoin on an 86' path derives native SegWit or is rejected.
const TAPROOT_CHAINS: readonly Chain[] = [Chain.Bitcoin];

const PURPOSE_AWARE_WALLETS = new Set<WalletOption>([WalletOption.LEDGER, WalletOption.TREZOR]);

export function hardwareStandardsToOffer(
  chain: Chain,
  wallet: WalletOption,
  allowDerivationSelection: boolean,
): HardwareStandard[] {
  if (!(allowDerivationSelection && PURPOSE_AWARE_WALLETS.has(wallet))) return [];

  const offered = standardsFor(chain).filter(
    (standard): standard is HardwareStandard =>
      standard.id !== "custom" && (standard.id !== "taproot" || TAPROOT_CHAINS.includes(chain)),
  );

  return offered.length > 1 ? offered : [];
}
