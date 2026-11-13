import { describe, expect, test } from "bun:test";
import { SwapKitError } from "@swapkit/helpers";
import { connectErrorMessage } from "../keystore-connect-error";

const PASSWORD_MESSAGE = "You used an incorrect password or something went wrong.";

describe("the message a failed keystore connect shows", () => {
  test("names the chain when the toolbox refuses the derivation path", () => {
    const error = new SwapKitError({
      errorKey: "toolbox_derivation_slot_unsupported",
      info: { chain: "SUI", derivationPath: [44, 784, 0, 0, 0] },
    });

    const message = connectErrorMessage(error);

    expect(message).toContain("SUI");
    expect(message).not.toBe(PASSWORD_MESSAGE);
  });

  test("still names a derivation problem when the error carries no chain", () => {
    const message = connectErrorMessage(new SwapKitError("toolbox_utxo_invalid_params"));

    expect(message).toContain("derivation path");
    expect(message).not.toBe(PASSWORD_MESSAGE);
  });

  test("blames the password for a decryption failure", () => {
    expect(connectErrorMessage(new Error("Failed to decrypt keystore"))).toBe(PASSWORD_MESSAGE);
  });

  test("blames the password for anything it cannot identify", () => {
    for (const error of [undefined, null, "boom", new SwapKitError("core_plugin_not_found")]) {
      expect(connectErrorMessage(error)).toBe(PASSWORD_MESSAGE);
    }
  });
});
