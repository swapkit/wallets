import type { AccountData, AminoSignResponse, StdSignDoc } from "@cosmjs/amino";
import type Transport from "@ledgerhq/hw-transport";
import { base64 } from "@scure/base";
import { type DerivationPathArray, NetworkDerivationPath, SwapKitError } from "@swapkit/helpers";

import { CosmosLedgerInterface } from "../../interfaces/CosmosLedgerInterface";
import type { GetAddressAndPubKeyResponse } from "../../types";
import { getSignature } from "./utils";

type ThorchainAssetObject = { chain?: string; symbol?: string; synth?: boolean; ticker?: string };

type ThorchainDepositCoin = { amount: string; asset: string | ThorchainAssetObject };

function getAminoAssetDenom(asset: string | ThorchainAssetObject) {
  if (typeof asset === "string") return asset;

  const chain = asset.chain?.toUpperCase();
  const symbol = (asset.symbol || asset.ticker || "").toUpperCase();

  if (!(chain && symbol)) return symbol || chain || "";
  if (asset.synth) return `${chain}/${symbol}`;

  return `${chain}.${symbol}`;
}

export function normalizeThorchainLedgerSignDoc(signDoc: StdSignDoc): StdSignDoc {
  return {
    ...signDoc,
    msgs: signDoc.msgs.map((msg) => {
      if (!msg.type.includes("MsgDeposit")) return msg;

      const coins = msg.value.coins;
      if (!Array.isArray(coins)) return msg;

      return {
        ...msg,
        value: {
          ...msg.value,
          coins: coins.map((coin: ThorchainDepositCoin) => ({ ...coin, asset: getAminoAssetDenom(coin.asset) })),
        },
      };
    }),
  };
}

export class THORChainLedger extends CosmosLedgerInterface {
  private pubKey: string | null = null;

  derivationPath: DerivationPathArray;

  constructor(derivationPath: DerivationPathArray = NetworkDerivationPath.THOR, transport?: Transport) {
    super(transport);
    this.chain = "thor";
    this.derivationPath = derivationPath;
  }

  get pubkey() {
    return this.pubKey;
  }

  connect = async () => {
    await this.checkOrCreateTransportAndLedger();
    const { compressed_pk, bech32_address }: GetAddressAndPubKeyResponse = await this.getAddressAndPubKey();

    this.pubKey = base64.encode(compressed_pk);

    return bech32_address;
  };

  getAddressAndPubKey = async () => {
    await this.checkOrCreateTransportAndLedger(true);

    const response: GetAddressAndPubKeyResponse = await this.ledgerApp.getAddressAndPubKey(
      this.derivationPath,
      this.chain,
    );

    this.validateResponse(response.return_code, response.error_message);

    return response;
  };

  showAddressAndPubKey = async () => {
    await this.checkOrCreateTransportAndLedger(true);

    const response: GetAddressAndPubKeyResponse = await this.ledgerApp.showAddressAndPubKey(
      this.derivationPath,
      this.chain,
    );

    this.validateResponse(response.return_code, response.error_message);

    return response;
  };

  signTransaction = async (rawTx: string, sequence = "0") => {
    await this.checkOrCreateTransportAndLedger(true);

    const { return_code, error_message, signature } = await this.ledgerApp.sign(this.derivationPath, rawTx);

    if (!this.pubKey) throw new SwapKitError("wallet_ledger_pubkey_not_found");

    this.validateResponse(return_code, error_message);

    return [
      {
        pub_key: { type: "tendermint/PubKeySecp256k1", value: this.pubKey },
        sequence,
        signature: getSignature(signature),
      },
    ];
  };

  signAmino = async (signerAddress: string, signDoc: StdSignDoc): Promise<AminoSignResponse> => {
    await this.checkOrCreateTransportAndLedger(true);

    const account = (await this.getAccounts()).find((item) => item.address === signerAddress);
    if (!account) {
      throw new SwapKitError("wallet_ledger_address_not_found", { address: signerAddress });
    }

    const importedAmino = await import("@cosmjs/amino");
    const encodeSecp256k1Signature =
      importedAmino.encodeSecp256k1Signature ?? importedAmino.default?.encodeSecp256k1Signature;
    const serializeSignDoc = importedAmino.serializeSignDoc ?? importedAmino.default?.serializeSignDoc;
    const normalizedSignDoc = normalizeThorchainLedgerSignDoc(signDoc);

    const { return_code, error_message, signature } = await this.ledgerApp.sign(
      this.derivationPath,
      serializeSignDoc(normalizedSignDoc),
    );

    this.validateResponse(return_code, error_message);

    return {
      signature: encodeSecp256k1Signature(account.pubkey, base64.decode(getSignature(signature))),
      // CosmJS rebuilds bodyBytes from the returned `signed` doc. Keep the
      // original direct-shaped doc there so MsgDeposit protobuf assets do not
      // get round-tripped through the incomplete Amino converter.
      signed: signDoc,
    };
  };

  getAccounts = async (): Promise<readonly AccountData[]> => {
    await this.checkOrCreateTransportAndLedger(true);

    const { bech32_address, compressed_pk }: GetAddressAndPubKeyResponse = await this.getAddressAndPubKey();

    this.pubKey = base64.encode(compressed_pk);

    return [{ address: bech32_address, algo: "secp256k1", pubkey: compressed_pk }];
  };

  sign = async (message: string) => {
    await this.checkOrCreateTransportAndLedger(true);

    const { return_code, error_message, signature } = await this.ledgerApp.sign(this.derivationPath, message);

    if (!this.pubKey) throw new SwapKitError("wallet_ledger_pubkey_not_found");

    this.validateResponse(return_code, error_message);

    return getSignature(signature);
  };
}
