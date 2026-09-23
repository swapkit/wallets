import type { StdSignDoc } from "@cosmjs/amino";
import type { SignerCosmos } from "@ledgerhq/device-signer-kit-cosmos";
import type Transport from "@ledgerhq/hw-transport";
import { hex } from "@scure/base";
import {
  type DerivationPathArray,
  derivationPathToString,
  NetworkDerivationPath,
  SwapKitError,
} from "@swapkit/helpers";
import type { OfflineAminoSigner } from "@swapkit/toolboxes/cosmos";

import type { LedgerDMKSession } from "../helpers/dmk";
import { getLedgerDMKSession } from "../helpers/dmk";
import { executeLedgerDeviceAction, type LedgerDeviceActionStateHandler } from "../helpers/executeDeviceAction";

interface CosmosLedgerParams {
  derivationPath?: DerivationPathArray | string;
  dmkSession?: LedgerDMKSession;
  onDeviceActionState?: LedgerDeviceActionStateHandler;
  transport?: Transport;
}

interface CosmosAddressAndPublicKey {
  address: string;
  publicKey: string;
}

function normalizeCosmosPath(path: DerivationPathArray | string) {
  const normalized = (typeof path === "string" ? path : derivationPathToString(path))
    .replace(/^m\//, "")
    .replace(/^\/+/, "");

  if (!/^44'\/118'\/\d+'\/(0|1)\/\d+$/.test(normalized)) {
    throw new SwapKitError("wallet_ledger_invalid_params", {
      path: normalized,
      reason: "Expected a five-level Cosmos derivation path with coin type 118",
    });
  }

  return normalized;
}

// cosmjs is CJS and `require`s ESM-only `@scure/base`; loading it lazily keeps Bun from rejecting that
// require when the module graph also contains the ESM-only `@swapkit/*` packages.
async function normalizeCosmosSignature(signature: Uint8Array) {
  const { Secp256k1Signature } = await import("@cosmjs/crypto");
  try {
    return signature.length === 64
      ? Secp256k1Signature.fromFixedLength(signature).toFixedLength()
      : Secp256k1Signature.fromDer(signature).toFixedLength();
  } catch (error) {
    throw new SwapKitError("wallet_ledger_invalid_response", error);
  }
}

export class CosmosLedger {
  readonly chain = "cosmos";
  readonly derivationPath: string;
  private readonly dmkSession?: LedgerDMKSession;
  private readonly onDeviceActionState?: LedgerDeviceActionStateHandler;
  private readonly transport?: Transport;
  private legacyAppPromise?: Promise<import("@ledgerhq/hw-app-cosmos").default>;
  private pubKey: string | null = null;
  private signerPromise?: Promise<SignerCosmos>;

  constructor({
    derivationPath = NetworkDerivationPath.GAIA,
    dmkSession,
    onDeviceActionState,
    transport,
  }: CosmosLedgerParams = {}) {
    this.derivationPath = normalizeCosmosPath(derivationPath);
    this.dmkSession = dmkSession;
    this.onDeviceActionState = onDeviceActionState;
    this.transport = transport;
  }

  private getSigner() {
    if (this.transport) {
      throw new SwapKitError("wallet_ledger_invalid_params", {
        reason: "A Device Signer Kit operation is unavailable when a legacy transport is supplied",
      });
    }

    this.signerPromise ??= (async () => {
      const session = this.dmkSession ?? (await getLedgerDMKSession());
      const { SignerCosmosBuilder } = await import("@ledgerhq/device-signer-kit-cosmos");
      return new SignerCosmosBuilder(session).build();
    })();
    return this.signerPromise;
  }

  private getLegacyApp() {
    if (!this.transport) {
      throw new SwapKitError("wallet_ledger_invalid_params", { reason: "Legacy Cosmos transport is unavailable" });
    }

    this.legacyAppPromise ??= import("@ledgerhq/hw-app-cosmos").then(
      ({ default: CosmosApp }) => new CosmosApp(this.transport as Transport),
    );
    return this.legacyAppPromise;
  }

  private async signBytes(message: Uint8Array) {
    if (this.transport) {
      const app = await this.getLegacyApp();
      const response = await app.sign(this.derivationPath, new TextDecoder().decode(message));
      if (response.return_code !== 0x9000 || !response.signature) {
        throw new SwapKitError("wallet_ledger_invalid_response", { returnCode: response.return_code });
      }
      return normalizeCosmosSignature(response.signature);
    }

    const signer = await this.getSigner();
    const signature = await executeLedgerDeviceAction({
      action: signer.signTransaction(this.derivationPath, this.chain, message),
      onDeviceActionState: this.onDeviceActionState,
    });
    return normalizeCosmosSignature(signature);
  }

  async connect() {
    if (this.transport) await this.getLegacyApp();
    else await this.getSigner();

    const { address, publicKey } = await this.getAddressAndPubKey();
    this.pubKey = Buffer.from(publicKey, "hex").toString("base64");
    return address;
  }

  async disconnect() {}

  async getAddressAndPubKey(): Promise<CosmosAddressAndPublicKey> {
    if (this.transport) {
      return this.getLegacyApp().then((app) => app.getAddress(this.derivationPath, this.chain));
    }

    const signer = await this.getSigner();
    const { address, publicKey } = await executeLedgerDeviceAction({
      action: signer.getAddress(this.derivationPath, this.chain),
      onDeviceActionState: this.onDeviceActionState,
    });
    return { address, publicKey: hex.encode(publicKey) };
  }

  async showAddressAndPubKey(): Promise<CosmosAddressAndPublicKey> {
    if (this.transport) {
      return this.getLegacyApp().then((app) => app.getAddress(this.derivationPath, this.chain, true));
    }

    const signer = await this.getSigner();
    const { address, publicKey } = await executeLedgerDeviceAction({
      action: signer.getAddress(this.derivationPath, this.chain, { checkOnDevice: true }),
      onDeviceActionState: this.onDeviceActionState,
    });
    return { address, publicKey: hex.encode(publicKey) };
  }

  async signTransaction(rawTx: string | Uint8Array, sequence = "0") {
    const signature = await this.signBytes(typeof rawTx === "string" ? new TextEncoder().encode(rawTx) : rawTx);
    if (!this.pubKey) {
      const { publicKey } = await this.getAddressAndPubKey();
      this.pubKey = Buffer.from(publicKey, "hex").toString("base64");
    }

    return [{ pub_key: { type: "tendermint/PubKeySecp256k1", value: this.pubKey }, sequence, signature }];
  }

  // Typed against the toolbox signer contract so CosmosLedger satisfies `createSigningStargateClient`.
  async signAmino(
    signerAddress: string,
    signDoc: Parameters<OfflineAminoSigner["signAmino"]>[1],
  ): ReturnType<OfflineAminoSigner["signAmino"]> {
    const accounts = await this.getAccounts();
    const account = accounts.find(({ address }) => address === signerAddress);
    if (!account) {
      throw new SwapKitError("wallet_ledger_address_not_found", { address: signerAddress });
    }

    const { encodeSecp256k1Signature, serializeSignDoc } = await import("@cosmjs/amino");
    const signature = await this.signBytes(serializeSignDoc(signDoc as StdSignDoc));
    return { signature: encodeSecp256k1Signature(account.pubkey, signature), signed: signDoc };
  }

  async getAccounts() {
    const { address, publicKey } = await this.getAddressAndPubKey();
    return [{ address, algo: "secp256k1" as const, pubkey: hex.decode(publicKey) }];
  }
}
