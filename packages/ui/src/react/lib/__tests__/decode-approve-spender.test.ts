import { describe, expect, test } from "bun:test";

import { getAddress, Interface } from "ethers";
import { decodeApproveSpender } from "../decode-approve-spender";

const SPENDER = "0x1111111254EEB25477B68fb85Ed929f73A960582";
const approveIface = new Interface(["function approve(address spender, uint256 amount)"]);
const transferIface = new Interface(["function transfer(address to, uint256 amount)"]);

describe("decodeApproveSpender", () => {
  test("decodes the spender from approve calldata", () => {
    const data = approveIface.encodeFunctionData("approve", [SPENDER, 1_000_000n]);
    expect(decodeApproveSpender(data)).toBe(getAddress(SPENDER));
  });

  test("decodes an unlimited (max uint256) approval too", () => {
    const data = approveIface.encodeFunctionData("approve", [SPENDER, 2n ** 256n - 1n]);
    expect(decodeApproveSpender(data)).toBe(getAddress(SPENDER));
  });

  test("returns undefined for a non-approve method (e.g. transfer)", () => {
    const data = transferIface.encodeFunctionData("transfer", [SPENDER, 1n]);
    expect(decodeApproveSpender(data)).toBeUndefined();
  });

  test("returns undefined for the zero-address spender", () => {
    const data = approveIface.encodeFunctionData("approve", ["0x0000000000000000000000000000000000000000", 1n]);
    expect(decodeApproveSpender(data)).toBeUndefined();
  });

  test("returns undefined for empty / malformed data", () => {
    expect(decodeApproveSpender(undefined)).toBeUndefined();
    expect(decodeApproveSpender(null)).toBeUndefined();
    expect(decodeApproveSpender("")).toBeUndefined();
    expect(decodeApproveSpender("0x")).toBeUndefined();
    expect(decodeApproveSpender("0xdeadbeef")).toBeUndefined();
  });
});
