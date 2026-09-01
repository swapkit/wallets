import { getAddress, Interface, ZeroAddress } from "ethers";

const APPROVE_INTERFACE = new Interface(["function approve(address spender, uint256 amount)"]);

/**
 * Decodes the spender from ERC-20 `approve(address,uint256)` calldata.
 *
 * The approval transaction is sent to the *token* contract, so `approvalTx.to`
 * is the token — not the spender. The actual spender (the contract being granted
 * an allowance) is the first argument of the approve call, encoded in the data.
 *
 * Returns `undefined` for anything that isn't a standard approve (e.g. Permit2,
 * `increaseAllowance`, malformed data) so callers can hide the spender rather
 * than display a misleading address.
 */
export function decodeApproveSpender(data: string | undefined | null): string | undefined {
  if (!data) return undefined;

  try {
    const parsed = APPROVE_INTERFACE.parseTransaction({ data });
    if (parsed?.name !== "approve") return undefined;

    const spender = parsed.args[0] as string;
    if (!spender || spender === ZeroAddress) return undefined;

    return getAddress(spender);
  } catch {
    return undefined;
  }
}
