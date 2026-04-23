import type Sui from "@ledgerhq/hw-app-sui";
import type Transport from "@ledgerhq/hw-transport";
import {
  Chain,
  type DerivationPathArray,
  derivationPathToString,
  NetworkDerivationPath,
  SwapKitError,
} from "@swapkit/helpers";

import { getLedgerTransport } from "../helpers/getLedgerTransport";

export class SuiLedgerInterface {
  derivationPath: string;
  ledgerApp: InstanceType<typeof Sui> | null = null;
  address: string | null = null;
  publicKey: Uint8Array | null = null;
  private readonly injectedTransport?: Transport;

  constructor(derivationPath?: DerivationPathArray | string, transport?: Transport) {
    this.derivationPath =
      typeof derivationPath === "string"
        ? derivationPath
        : derivationPathToString(derivationPath || NetworkDerivationPath[Chain.Sui]);
    this.injectedTransport = transport;
  }

  /**
   * Transform derivation path for SUI Ledger format.
   * SUI Ledger expects: 44'/784'/0'/0'/0' (all hardened, no 'm/' prefix)
   * Standard format is: m/44'/784'/0'/0/0 (only first 3 hardened, has 'm/' prefix)
   */
  private getLedgerPath(): string {
    return this.derivationPath
      .replace(/^m\//, "") // Remove 'm/' prefix
      .replace(/\/(\d+)\/(\d+)$/, "/$1'/$2'"); // Make last two components hardened
  }

  private async createTransportAndLedger() {
    if (this.ledgerApp) return;

    const transport = this.injectedTransport ?? (await getLedgerTransport());
    const SuiApp = (await import("@ledgerhq/hw-app-sui")).default;
    this.ledgerApp = new SuiApp(transport);
  }

  async connect(): Promise<string> {
    await this.createTransportAndLedger();

    if (!this.ledgerApp) {
      throw new SwapKitError("wallet_ledger_transport_error");
    }

    const ledgerPath = this.getLedgerPath();
    const result = await this.ledgerApp.getPublicKey(ledgerPath);

    if (!result?.publicKey) {
      throw new SwapKitError("wallet_ledger_failed_to_get_address");
    }

    this.publicKey = result.publicKey;
    this.address = `0x${Buffer.from(result.address).toString("hex")}`;

    return this.address;
  }

  toSuiAddress(): string {
    if (!this.address) {
      throw new SwapKitError("wallet_ledger_failed_to_get_address");
    }
    return this.address;
  }

  async getAddress(): Promise<string> {
    if (this.address) return this.address;
    return await this.connect();
  }

  async signTransaction(
    input: Uint8Array | { transaction: Uint8Array },
  ): Promise<{ bytes: string; signature: string }> {
    const txBytes = input instanceof Uint8Array ? input : input.transaction;
    await this.createTransportAndLedger();

    if (!this.ledgerApp) {
      throw new SwapKitError("wallet_ledger_transport_error");
    }

    if (!this.publicKey) {
      throw new SwapKitError("wallet_ledger_failed_to_get_address");
    }

    try {
      const ledgerPath = this.getLedgerPath();

      // SUI intent message format for TransactionData:
      // [intent_scope=0 (TransactionData), intent_version=0, app_id=0] + transaction_bytes
      // The Ledger SUI app expects the INTENT MESSAGE, not raw transaction bytes
      const intentMessage = new Uint8Array(3 + txBytes.length);
      intentMessage[0] = 0; // IntentScope: TransactionData
      intentMessage[1] = 0; // IntentVersion: V0
      intentMessage[2] = 0; // AppId: Sui
      intentMessage.set(txBytes, 3);

      const result = await this.ledgerApp.signTransaction(ledgerPath, intentMessage);

      if (!result?.signature) {
        throw new SwapKitError("wallet_ledger_signing_error");
      }

      // SUI signature format: [scheme_flag (1 byte)] + [signature (64 bytes)] + [public_key (32 bytes)]
      // Scheme flag 0x00 = Ed25519
      const pubKey = this.publicKey.length === 33 ? this.publicKey.slice(1) : this.publicKey;
      if (pubKey.length !== 32) {
        throw new SwapKitError("wallet_ledger_signing_error", { error: "Invalid public key length" });
      }

      const serializedSignature = new Uint8Array(1 + 64 + 32);
      serializedSignature[0] = 0x00; // Ed25519 scheme flag
      serializedSignature.set(result.signature, 1);
      serializedSignature.set(pubKey, 65);

      const signatureBase64 = Buffer.from(serializedSignature).toString("base64");
      const bytesBase64 = Buffer.from(txBytes).toString("base64");

      return { bytes: bytesBase64, signature: signatureBase64 };
    } catch (error) {
      throw new SwapKitError("wallet_ledger_signing_error", { error });
    }
  }
}

export const SuiLedger = (derivationPath?: DerivationPathArray, transport?: Transport) =>
  new SuiLedgerInterface(derivationPath, transport);
