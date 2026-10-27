import type { KeepKeySdk } from "@keepkey/keepkey-sdk";
import type { GenericTransferParams } from "@swapkit/helpers";
import {
  Chain,
  DerivationPath,
  type DerivationPathArray,
  derivationPathToString,
  FeeOption,
  GAIAConfig,
  getRPCUrl,
} from "@swapkit/helpers";

import { bip32ToAddressNList } from "../coins";

export async function cosmosWalletMethods({
  sdk,
  derivationPath,
}: {
  sdk: KeepKeySdk;
  derivationPath?: DerivationPathArray;
}): Promise<any> {
  const { getCosmosToolbox, getDefaultChainFee, createStargateClient } = await import("@swapkit/toolboxes/cosmos");
  const derivationPathString = derivationPath ? derivationPathToString(derivationPath) : `${DerivationPath.GAIA}/0`;

  const { address: fromAddress } = (await sdk.address.cosmosGetAddress({
    address_n: bip32ToAddressNList(derivationPathString),
  })) as { address: string };

  const toolbox = await getCosmosToolbox(Chain.Cosmos);

  // TODO support other cosmos assets
  const transfer = async ({
    assetValue,
    recipient,
    memo,
    feeRate,
    feeOptionKey = FeeOption.Fast,
  }: GenericTransferParams) => {
    const amount = assetValue.getBaseValue("string");
    const accountInfo = await toolbox.getAccount(fromAddress);
    // Pays what the toolbox's own transfer pays: the given fee, else the fee for the chosen option.
    const feeAmount = feeRate ? String(feeRate) : (await toolbox.getFees())[feeOptionKey].getBaseValue("string");

    const keepKeySignedTx = await sdk.cosmos.cosmosSignAmino({
      signDoc: {
        account_number: accountInfo?.accountNumber.toString() ?? "",
        chain_id: GAIAConfig.chainId,
        // A new object per transfer: the toolbox's default fee objects are shared with every other Cosmos wallet.
        fee: { amount: [{ amount: feeAmount, denom: "uatom" }], gas: getDefaultChainFee(Chain.Cosmos).gas },
        memo: memo || "",
        msgs: [
          {
            type: "cosmos-sdk/MsgSend",
            value: { amount: [{ amount, denom: "uatom" }], from_address: fromAddress, to_address: recipient },
          },
        ],
        sequence: accountInfo?.sequence.toString() ?? "",
      },
      signerAddress: fromAddress,
    });

    const decodedBytes = atob(keepKeySignedTx.serialized);
    const uint8Array = new Uint8Array(decodedBytes.length).map((_, i) => decodedBytes.charCodeAt(i));

    const rpcUrl = await getRPCUrl(Chain.Cosmos);
    const client = await createStargateClient(rpcUrl);
    const response = await client.broadcastTx(uint8Array);

    return response.transactionHash;
  };

  return { ...toolbox, address: fromAddress, transfer };
}
