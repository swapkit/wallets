import { buildPackage } from "../../tools/builder";

void buildPackage({
  bundlePackages: [
    "@ledgerhq/context-module",
    "@ledgerhq/device-management-kit",
    "@ledgerhq/device-signer-kit-bitcoin",
    "@ledgerhq/device-signer-kit-cosmos",
    "@ledgerhq/device-signer-kit-ethereum",
    "@ledgerhq/device-signer-kit-zcash",
    "@ledgerhq/device-transport-kit-web-hid",
    "@ledgerhq/hw-transport",
  ],
});
