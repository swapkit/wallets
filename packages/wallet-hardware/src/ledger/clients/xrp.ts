import type { UserInteractionRequired } from "@ledgerhq/device-management-kit";
import type Xrp from "@ledgerhq/hw-app-xrp";
import type Transport from "@ledgerhq/hw-transport";
import { Chain, type DerivationPathArray, derivationPathToString, NetworkDerivationPath } from "@swapkit/helpers";
import type { RippleTransaction } from "@swapkit/toolboxes/ripple";
import type { Payment } from "xrpl";

import {
  LEDGER_USER_INTERACTION_REQUIRED,
  type LedgerJsClientParams,
  normalizeLedgerJsClientParams,
  runLedgerJsOperation,
} from "../helpers/ledgerJsDmkBridge";

const TF_FULLY_CANONICAL_SIG = 2147483648;

type XRPLedgerParams = LedgerJsClientParams<DerivationPathArray>;

function cleanTransactionObject(transaction: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(transaction).filter(([, value]) => value !== null && value !== undefined));
}

export async function XRPLedger(paramsOrPath?: XRPLedgerParams | DerivationPathArray, transport?: Transport) {
  const { derivationPath, ...connection } = normalizeLedgerJsClientParams({ paramsOrPath, transport });
  const path = derivationPathToString(derivationPath || NetworkDerivationPath[Chain.Ripple]);

  async function runXrpOperation<Output>({
    operation,
    requiredUserInteraction,
  }: {
    operation: (app: Xrp) => Promise<Output>;
    requiredUserInteraction?: UserInteractionRequired;
  }) {
    const XrpApp = (await import("@ledgerhq/hw-app-xrp")).default;
    return runLedgerJsOperation({
      appName: "XRP",
      connection,
      createApp: (ledgerTransport) => new XrpApp(ledgerTransport),
      operation,
      requiredUserInteraction,
    });
  }

  const { address, publicKey } = await runXrpOperation({ operation: (app) => app.getAddress(path) });

  async function signTransaction(transaction: Payment | RippleTransaction) {
    const [{ encode }, { hashes }] = await Promise.all([import("ripple-binary-codec"), import("xrpl")]);
    const transactionJSON = {
      ...cleanTransactionObject(transaction),
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
