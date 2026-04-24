import type Transport from "@ledgerhq/hw-transport";
import { base64 } from "@scure/base";
import { HDKey } from "@scure/bip32";
import { type DerivationPathArray, derivationPathToString, getWalletFormatFor, SwapKitError } from "@swapkit/helpers";
import type { Transaction } from "@swapkit/utxo-signer";

import { getLedgerTransport } from "../helpers/getLedgerTransport";

type SupportedCoin = "bitcoin" | "litecoin";

type DefaultDescriptorTemplate = "wpkh(@0/**)" | "tr(@0/**)" | "sh(wpkh(@0/**))" | "pkh(@0/**)";

function templateForFormat(format: ReturnType<typeof getWalletFormatFor>): DefaultDescriptorTemplate {
  switch (format) {
    case "bech32":
      return "wpkh(@0/**)";
    case "p2sh":
      return "sh(wpkh(@0/**))";
    case "legacy":
      return "pkh(@0/**)";
    default:
      return "wpkh(@0/**)";
  }
}

function pathToString(path: DerivationPathArray | string): string {
  return typeof path === "string" ? path : derivationPathToString(path);
}

function pathToNumberArray(path: string): number[] {
  return path
    .replace(/^m\//, "")
    .split("/")
    .filter(Boolean)
    .map((p) => {
      const hardened = p.endsWith("'");
      const num = Number.parseInt(hardened ? p.slice(0, -1) : p, 10);
      return hardened ? (num | 0x80000000) >>> 0 : num;
    });
}

const BaseLedgerPsbtUTXO = ({ chain }: { chain: SupportedCoin }) => {
  return (derivationPathArray?: DerivationPathArray | string, injectedTransport?: Transport) => {
    // Per-call state — each BitcoinPsbtLedger/LitecoinPsbtLedger invocation has its own
    // AppClient and master fingerprint so different consumers (e.g. concurrent MCP
    // sessions on different devices) cannot inherit each other's ledger bindings or xpub.
    let appClient: import("ledger-bitcoin").AppClient | undefined;
    let masterFingerprint: string | undefined;

    async function getAppClient() {
      if (!appClient) {
        const transport = injectedTransport ?? (await getLedgerTransport());
        const { AppClient } = await import("ledger-bitcoin");
        appClient = new AppClient(transport);
      }
      return appClient;
    }

    async function getFingerprint() {
      if (!masterFingerprint) {
        const app = await getAppClient();
        masterFingerprint = await app.getMasterFingerprint();
      }
      return masterFingerprint;
    }

    // Single-address account: change == index == 0 by default.
    const derivationPath = derivationPathArray ? pathToString(derivationPathArray) : "84'/0'/0'/0/0";
    const accountPath = derivationPath.split("/").slice(0, 3).join("/");
    const leafSegments = derivationPath.split("/").slice(3);
    const change = Number(leafSegments[0] ?? 0);
    const addressIndex = Number(leafSegments[1] ?? 0);
    const format = getWalletFormatFor(derivationPath);
    const template = templateForFormat(format);

    let cachedAccountXpub: string | undefined;
    let cachedLeafPubkey: Uint8Array | undefined;

    async function buildPolicy() {
      const app = await getAppClient();
      const fpr = await getFingerprint();
      if (!cachedAccountXpub) {
        cachedAccountXpub = await app.getExtendedPubkey(`m/${accountPath}`);
      }
      const { DefaultWalletPolicy } = await import("ledger-bitcoin");
      const policy = new DefaultWalletPolicy(template, `[${fpr}/${accountPath}]${cachedAccountXpub}`);
      return { app, fpr, policy, xpub: cachedAccountXpub };
    }

    async function getLeafPubkey() {
      if (!cachedLeafPubkey) {
        const { xpub } = await buildPolicy();
        const accountKey = HDKey.fromExtendedKey(xpub);
        const leaf = accountKey.derive(`m/${change}/${addressIndex}`);
        if (!leaf.publicKey) {
          throw new SwapKitError("wallet_ledger_get_address_error", {
            message: `Cannot derive leaf pubkey for ${chain}`,
          });
        }
        cachedLeafPubkey = leaf.publicKey;
      }
      return cachedLeafPubkey;
    }

    return {
      connect: async () => {
        await getAppClient();
      },
      getAddress: async () => {
        const { app, policy } = await buildPolicy();
        const address = await app.getWalletAddress(policy, null, change, addressIndex, false);
        if (!address) {
          throw new SwapKitError("wallet_ledger_get_address_error", {
            message: `Cannot get ${chain} address from ledger derivation path: ${derivationPath}`,
          });
        }
        return address;
      },
      getExtendedPublicKey: async (path = `m/${accountPath}`) => {
        const app = await getAppClient();
        return app.getExtendedPubkey(path);
      },
      signTransaction: async (tx: Transaction): Promise<Transaction> => {
        const { app, policy, fpr } = await buildPolicy();
        const fingerprintBE = Number.parseInt(fpr, 16) >>> 0;
        const pathNumbers = pathToNumberArray(derivationPath);
        const leafPubkey = await getLeafPubkey();

        // Single-address account: every input is owned by the same key + path.
        for (let i = 0; i < tx.inputsLength; i++) {
          tx.updateInput(i, { bip32Derivation: [[leafPubkey, { fingerprint: fingerprintBE, path: pathNumbers }]] });
        }

        const psbtB64 = base64.encode(tx.toPSBT(0));
        const sigs = await app.signPsbt(psbtB64, policy, null);

        for (const [idx, partial] of sigs) {
          tx.updateInput(idx, { partialSig: [[new Uint8Array(partial.pubkey), new Uint8Array(partial.signature)]] });
        }

        tx.finalize();
        return tx;
      },
    };
  };
};

export const BitcoinPsbtLedger = BaseLedgerPsbtUTXO({ chain: "bitcoin" });
export const LitecoinPsbtLedger = BaseLedgerPsbtUTXO({ chain: "litecoin" });
