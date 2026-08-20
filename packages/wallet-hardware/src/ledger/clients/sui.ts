import { UserInteractionRequired } from "@ledgerhq/device-management-kit";
import type Sui from "@ledgerhq/hw-app-sui";
import type Transport from "@ledgerhq/hw-transport";
import {
  Chain,
  type DerivationPathArray,
  derivationPathToString,
  NetworkDerivationPath,
  SwapKitError,
} from "@swapkit/helpers";

import {
  type LedgerJsClientParams,
  normalizeLedgerJsClientParams,
  runLedgerJsOperation,
} from "../helpers/ledgerJsDmkBridge";

type SuiLedgerParams = LedgerJsClientParams<DerivationPathArray | string>;

export class SuiLedgerInterface {
  readonly derivationPath: string;
  address: string | null = null;
  publicKey: Uint8Array | null = null;
  private readonly connection: Omit<SuiLedgerParams, "derivationPath">;

  constructor(paramsOrPath?: SuiLedgerParams | DerivationPathArray | string, transport?: Transport) {
    const { derivationPath, ...connection } = normalizeLedgerJsClientParams({ paramsOrPath, transport });
    this.derivationPath =
      typeof derivationPath === "string"
        ? derivationPath
        : derivationPathToString(derivationPath || NetworkDerivationPath[Chain.Sui]);
    this.connection = connection;
  }

  private getLedgerPath() {
    return this.derivationPath.replace(/^m\//, "").replace(/\/(\d+)\/(\d+)$/, "/$1'/$2'");
  }

  private async runSuiOperation<Output>({
    operation,
    requiredUserInteraction,
  }: {
    operation: (app: InstanceType<typeof Sui>) => Promise<Output>;
    requiredUserInteraction?: UserInteractionRequired;
  }) {
    const SuiApp = (await import("@ledgerhq/hw-app-sui")).default;
    return runLedgerJsOperation({
      appName: "Sui",
      connection: this.connection,
      createApp: (ledgerTransport) => new SuiApp(ledgerTransport),
      operation,
      requiredUserInteraction,
    });
  }

  async connect() {
    const ledgerPath = this.getLedgerPath();
    const result = await this.runSuiOperation({ operation: (app) => app.getPublicKey(ledgerPath) });

    if (!result?.publicKey) throw new SwapKitError("wallet_ledger_failed_to_get_address");

    this.publicKey = result.publicKey;
    this.address = `0x${Buffer.from(result.address).toString("hex")}`;

    return this.address;
  }

  toSuiAddress() {
    if (!this.address) throw new SwapKitError("wallet_ledger_failed_to_get_address");
    return this.address;
  }

  async getAddress() {
    if (this.address) return this.address;
    return await this.connect();
  }

  async signTransaction(input: Uint8Array | { transaction: Uint8Array }) {
    const txBytes = input instanceof Uint8Array ? input : input.transaction;
    if (!this.publicKey) throw new SwapKitError("wallet_ledger_failed_to_get_address");

    try {
      const ledgerPath = this.getLedgerPath();
      const intentMessage = new Uint8Array(3 + txBytes.length);
      intentMessage.set(txBytes, 3);

      const result = await this.runSuiOperation({
        operation: (app) => app.signTransaction(ledgerPath, intentMessage),
        requiredUserInteraction: UserInteractionRequired.SignTransaction,
      });

      if (!result?.signature) throw new SwapKitError("wallet_ledger_signing_error");

      const pubKey = this.publicKey.length === 33 ? this.publicKey.slice(1) : this.publicKey;
      if (pubKey.length !== 32) {
        throw new SwapKitError("wallet_ledger_signing_error", { error: "Invalid public key length" });
      }

      const serializedSignature = new Uint8Array(97);
      serializedSignature.set(result.signature, 1);
      serializedSignature.set(pubKey, 65);

      return {
        bytes: Buffer.from(txBytes).toString("base64"),
        signature: Buffer.from(serializedSignature).toString("base64"),
      };
    } catch (error) {
      throw new SwapKitError("wallet_ledger_signing_error", { error });
    }
  }
}

export function SuiLedger(paramsOrPath?: SuiLedgerParams | DerivationPathArray, transport?: Transport) {
  return new SuiLedgerInterface(paramsOrPath, transport);
}
