import { UserInteractionRequired } from "@ledgerhq/device-management-kit";
import type TronApp from "@ledgerhq/hw-app-trx";
import type Transport from "@ledgerhq/hw-transport";
import {
  type DerivationPathArray,
  derivationPathToString,
  NetworkDerivationPath,
  SwapKitError,
} from "@swapkit/helpers";
import type { TronSignedTransaction, TronSigner, TronTransaction } from "@swapkit/toolboxes/tron";

import {
  type LedgerJsClientParams,
  normalizeLedgerJsClientParams,
  runLedgerJsOperation,
} from "../helpers/ledgerJsDmkBridge";

type TronLedgerParams = LedgerJsClientParams<DerivationPathArray | string>;

export class TronLedgerInterface implements TronSigner {
  readonly derivationPath: string;
  readonly ledgerTimeout = 50000;
  private readonly connection: Omit<TronLedgerParams, "derivationPath">;

  constructor(paramsOrPath?: TronLedgerParams | DerivationPathArray | string, transport?: Transport) {
    const { derivationPath, ...connection } = normalizeLedgerJsClientParams({ paramsOrPath, transport });
    this.derivationPath =
      typeof derivationPath === "string"
        ? derivationPath
        : derivationPathToString(derivationPath || NetworkDerivationPath.TRON);
    this.connection = connection;
  }

  private async runTronOperation<Output>({
    operation,
    requiredUserInteraction,
  }: {
    operation: (app: InstanceType<typeof TronApp>) => Promise<Output>;
    requiredUserInteraction?: UserInteractionRequired;
  }) {
    const TronApp = (await import("@ledgerhq/hw-app-trx")).default;
    return runLedgerJsOperation({
      appName: "Tron",
      connection: this.connection,
      createApp: (ledgerTransport) => new TronApp(ledgerTransport),
      operation,
      requiredUserInteraction,
    });
  }

  checkOrCreateTransportAndLedger = async () => {
    await this.runTronOperation({ operation: async () => true });
  };

  createTransportAndLedger = async () => {
    await this.runTronOperation({ operation: async () => true });
  };

  getAddress = async () => {
    const response = await this.getAddressAndPubKey();
    if (!response) throw new SwapKitError("wallet_ledger_failed_to_get_address");
    return response.address;
  };

  getAddressAndPubKey = async () => {
    const result = await this.runTronOperation({ operation: (app) => app.getAddress(this.derivationPath) });
    if (!result) throw new SwapKitError("wallet_ledger_failed_to_get_address");

    return { address: result.address, publicKey: result.publicKey };
  };

  showAddressAndPubKey = async () => {
    return await this.runTronOperation({
      operation: (app) => app.getAddress(this.derivationPath, true),
      requiredUserInteraction: UserInteractionRequired.VerifyAddress,
    });
  };

  signTransaction = async (transaction: TronTransaction): Promise<TronSignedTransaction> => {
    try {
      const signature = await this.runTronOperation({
        operation: (app) => app.signTransaction(this.derivationPath, transaction.raw_data_hex, []),
        requiredUserInteraction: UserInteractionRequired.SignTransaction,
      });

      if (!signature) throw new SwapKitError("wallet_ledger_signing_error");
      return { ...transaction, signature: [signature] };
    } catch (error) {
      throw new SwapKitError("wallet_ledger_signing_error", { error });
    }
  };
}

export function TronLedger(paramsOrPath?: TronLedgerParams | DerivationPathArray, transport?: Transport) {
  return new TronLedgerInterface(paramsOrPath, transport);
}
