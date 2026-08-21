import type { UserInteractionRequired } from "@ledgerhq/device-management-kit";
import Xrp from "@ledgerhq/hw-app-xrp";
import type Transport from "@ledgerhq/hw-transport";
import { Chain, type DerivationPathArray, derivationPathToString, NetworkDerivationPath } from "@swapkit/helpers";
import type { RippleTransaction } from "@swapkit/toolboxes/ripple";
import { encode } from "ripple-binary-codec";
import type { Payment } from "xrpl";

import {
  LEDGER_USER_INTERACTION_REQUIRED,
  type LedgerJsClientParams,
  normalizeLedgerJsClientParams,
  runLedgerJsOperation,
} from "../helpers/ledgerJsDmkBridge";

const TF_FULLY_CANONICAL_SIG = 2147483648;

type XRPLedgerParams = LedgerJsClientParams<DerivationPathArray>;

function cleanTransactionObject(obj: Record<string, any>) {
  const cleaned: Record<string, any> = {};
  for (const key in obj) {
    if (obj[key] !== null && obj[key] !== undefined) cleaned[key] = obj[key];
  }
  return cleaned;
}

export async function XRPLedger(paramsOrPath?: XRPLedgerParams | DerivationPathArray, transport?: Transport) {
  const { derivationPath, ...connection } = normalizeLedgerJsClientParams({ paramsOrPath, transport });
  const path = derivationPathToString(derivationPath || NetworkDerivationPath[Chain.Ripple]);

  function runXrpOperation<Output>({
    operation,
    requiredUserInteraction,
  }: {
    operation: (app: Xrp) => Promise<Output>;
    requiredUserInteraction?: UserInteractionRequired;
  }) {
    return runLedgerJsOperation({
      appName: "XRP",
      connection,
      createApp: (ledgerTransport) => new Xrp(ledgerTransport),
      operation,
      requiredUserInteraction,
    });
  }

  const { address, publicKey } = await runXrpOperation({ operation: (app) => app.getAddress(path) });

  async function signTransaction(transaction: Payment | RippleTransaction) {
    const { hashes } = await import("xrpl");
    const cleanedTxWithPubKey = cleanTransactionObject(transaction);
    const transactionJSON = {
      ...cleanedTxWithPubKey,
      Flags: transaction.Flags || TF_FULLY_CANONICAL_SIG,
      SigningPubKey: publicKey.toUpperCase(),
    };

    const transactionToSignOnLedger = encode(transactionJSON);
    const txnSignature = await runXrpOperation({
      operation: (app) => app.signTransaction(path, transactionToSignOnLedger),
      requiredUserInteraction: LEDGER_USER_INTERACTION_REQUIRED.SignTransaction,
    });
    const tx_blob = encode({ ...transactionJSON, TxnSignature: txnSignature });
    const hash = hashes.hashSignedTx(tx_blob);

    return { hash, tx_blob };
  }

  return { getAddress: () => address, signTransaction };
}
