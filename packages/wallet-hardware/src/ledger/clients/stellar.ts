import type { UserInteractionRequired } from "@ledgerhq/device-management-kit";
import type Str from "@ledgerhq/hw-app-str";
import type Transport from "@ledgerhq/hw-transport";
import {
  Chain,
  type DerivationPathArray,
  derivationPathToString,
  NetworkDerivationPath,
  SwapKitError,
} from "@swapkit/helpers";
import type { StellarSigner, StellarTransaction } from "@swapkit/toolboxes/stellar";

import {
  LEDGER_USER_INTERACTION_REQUIRED,
  type LedgerJsClientParams,
  normalizeLedgerJsClientParams,
  runLedgerJsOperation,
} from "../helpers/ledgerJsDmkBridge";

type StellarLedgerParams = LedgerJsClientParams<DerivationPathArray>;

// The Stellar app derives accounts from m/44'/148'/x' only, like Trezor and the SwapKit keystore.
export function getStellarLedgerPath(derivationPath: DerivationPathArray) {
  const [purpose, coinType, account, change, index] = derivationPath;
  if (purpose !== 44 || coinType !== 148 || account === undefined || change || index) {
    throw new SwapKitError("wallet_ledger_derivation_path_error", {
      chain: Chain.Stellar,
      derivationPath,
      reason: "Stellar only uses m/44'/148'/x'",
    });
  }

  // hw-app-str hardens every segment, so a leading "m" would become "m'" and fail to parse.
  return derivationPathToString([purpose, coinType, account]).replace(/^m\//, "");
}

export async function StellarLedger(paramsOrPath?: StellarLedgerParams | DerivationPathArray, transport?: Transport) {
  const { derivationPath, ...connection } = normalizeLedgerJsClientParams({ paramsOrPath, transport });
  const path = getStellarLedgerPath(derivationPath || NetworkDerivationPath[Chain.Stellar]);

  async function runStellarOperation<Output>({
    operation,
    requiredUserInteraction,
  }: {
    operation: (app: Str) => Promise<Output>;
    requiredUserInteraction?: UserInteractionRequired;
  }) {
    const StrApp = (await import("@ledgerhq/hw-app-str")).default;
    return runLedgerJsOperation({
      appName: "Stellar",
      connection,
      createApp: (ledgerTransport) => new StrApp(ledgerTransport),
      operation,
      requiredUserInteraction,
    });
  }

  const [{ rawPublicKey }, { StrKey }] = await Promise.all([
    runStellarOperation({ operation: (app) => app.getPublicKey(path) }),
    import("@stellar/stellar-sdk"),
  ]);
  const address = StrKey.encodeEd25519PublicKey(rawPublicKey);

  // The device parses the signature base itself, so it displays and signs the transaction exactly as received.
  async function signTransaction(transaction: StellarTransaction) {
    const { signature } = await runStellarOperation({
      operation: (app) => app.signTransaction(path, transaction.signatureBase()),
      requiredUserInteraction: LEDGER_USER_INTERACTION_REQUIRED.SignTransaction,
    });

    try {
      transaction.addSignature(address, signature.toString("base64"));
    } catch (error) {
      throw new SwapKitError("wallet_ledger_invalid_signature", { chain: Chain.Stellar, error });
    }

    return transaction;
  }

  return { getAddress: () => address, publicKey: rawPublicKey, signTransaction } satisfies StellarSigner & {
    publicKey: Buffer;
  };
}
