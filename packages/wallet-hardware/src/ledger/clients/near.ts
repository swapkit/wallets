import { UserInteractionRequired } from "@ledgerhq/device-management-kit";
import type Transport from "@ledgerhq/hw-transport";
import type { SignedTransaction, Transaction } from "@near-js/transactions";
import { Chain, type DerivationPathArray, NetworkDerivationPath, SwapKitError } from "@swapkit/helpers";
import type { NearSigner } from "@swapkit/toolboxes/near";

import {
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
    operation: (app: InstanceType<typeof import("@ledgerhq/hw-app-near")["default"]>) => Promise<Output>;
    requiredUserInteraction?: UserInteractionRequired;
  }) {
    const Near = (await import("@ledgerhq/hw-app-near")).default;
    return runLedgerJsOperation({
      appName: "NEAR",
      connection,
      createApp: (ledgerTransport) => new Near(ledgerTransport),
      operation,
      requiredUserInteraction,
    });
  }

  const { address, publicKey } = await runNearOperation({ operation: (app) => app.getAddress(path) });

  const signer = {
    getAddress() {
      return Promise.resolve(address);
    },
    async getPublicKey() {
      const { PublicKey } = await import("@near-js/crypto");
      const encodedPublicKey = publicKey.startsWith("ed25519:") ? publicKey : `ed25519:${publicKey}`;
      return PublicKey.fromString(encodedPublicKey);
    },

    signDelegateAction(_delegateAction: any) {
      return Promise.reject(
        new SwapKitError("wallet_ledger_method_not_supported", { method: "signDelegateAction", wallet: "Ledger" }),
      );
    },

    signNep413Message(
      _message: string,
      _accountId: string,
      _recipient: string,
      _nonce: Uint8Array,
      _callbackUrl?: string,
    ) {
      return Promise.reject(
        new SwapKitError("wallet_ledger_method_not_supported", { method: "signNep413Message", wallet: "Ledger" }),
      );
    },

    async signTransaction(transaction: Transaction) {
      const { Signature, SignedTransaction } = await import("@near-js/transactions");
      try {
        const signatureArray = await runNearOperation({
          operation: (app) => app.signTransaction(transaction.encode(), path),
          requiredUserInteraction: UserInteractionRequired.SignTransaction,
        });
        if (!signatureArray) throw new Error("Signature undefined");

        const signature = new Signature({ data: signatureArray, keyType: 0 });
        const signedTransaction = new SignedTransaction({ signature, transaction });

        return [signatureArray, signedTransaction] as [Uint8Array<ArrayBufferLike>, SignedTransaction];
      } catch (error) {
        throw new SwapKitError("wallet_ledger_signing_error", { error });
      }
    },
  };

  return signer as NearSigner;
}
