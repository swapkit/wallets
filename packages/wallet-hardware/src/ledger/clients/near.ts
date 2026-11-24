import type { UserInteractionRequired } from "@ledgerhq/device-management-kit";
import type Near from "@ledgerhq/hw-app-near";
import type Transport from "@ledgerhq/hw-transport";
import { Chain, type DerivationPathArray, NetworkDerivationPath, SwapKitError } from "@swapkit/helpers";
import type { NearSigner } from "@swapkit/toolboxes/near";
import type { Transaction } from "near-api-js";

import {
  LEDGER_USER_INTERACTION_REQUIRED,
  type LedgerJsClientParams,
  normalizeLedgerJsClientParams,
  runLedgerJsOperation,
} from "../helpers/ledgerJsDmkBridge";

type NearLedgerParams = LedgerJsClientParams<DerivationPathArray>;

export async function getNearLedgerClient(
  paramsOrPath?: NearLedgerParams | DerivationPathArray,
  transport?: Transport,
) {
  const { derivationPath, ...connection } = normalizeLedgerJsClientParams({ paramsOrPath, transport });
  const path = (derivationPath || NetworkDerivationPath[Chain.Near]).join("'/").concat("'");

  async function runNearOperation<Output>({
    operation,
    requiredUserInteraction,
  }: {
    operation: (app: Near) => Promise<Output>;
    requiredUserInteraction?: UserInteractionRequired;
  }) {
    const NearApp = (await import("@ledgerhq/hw-app-near")).default;
    return runLedgerJsOperation({
      appName: "NEAR",
      connection,
      createApp: (ledgerTransport) => new NearApp(ledgerTransport),
      operation,
      requiredUserInteraction,
    });
  }

  const { address, publicKey } = await runNearOperation({ operation: (app) => app.getAddress(path) });

  const signer: NearSigner = {
    getAddress() {
      return Promise.resolve(address);
    },
    async getPublicKey() {
      const { PublicKey } = await import("near-api-js");
      const encodedPublicKey = publicKey.startsWith("ed25519:") ? publicKey : `ed25519:${publicKey}`;
      return PublicKey.fromString(encodedPublicKey);
    },

    signDelegateAction() {
      return Promise.reject(
        new SwapKitError("wallet_ledger_method_not_supported", { method: "signDelegateAction", wallet: "Ledger" }),
      );
    },

    signNep413Message() {
      return Promise.reject(
        new SwapKitError("wallet_ledger_method_not_supported", { method: "signNep413Message", wallet: "Ledger" }),
      );
    },

    async signTransaction(transaction: Transaction) {
      const { KeyType, Signature, SignedTransaction } = await import("near-api-js");
      try {
        const signatureArray = await runNearOperation({
          operation: (app) => app.signTransaction(transaction.encode(), path),
          requiredUserInteraction: LEDGER_USER_INTERACTION_REQUIRED.SignTransaction,
        });
        if (!signatureArray) {
          throw new SwapKitError("wallet_ledger_signing_error", { reason: "Ledger returned no NEAR signature" });
        }

        const signature = new Signature({ data: signatureArray, keyType: KeyType.ED25519 });
        const signedTransaction = new SignedTransaction({ signature, transaction });

        return [signatureArray, signedTransaction];
      } catch (error) {
        if (error instanceof SwapKitError) throw error;
        throw new SwapKitError("wallet_ledger_signing_error", { error });
      }
    },
  };

  return signer;
}
