import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const polyfillsPkg = resolve(dirname(fileURLToPath(import.meta.resolve("vite-plugin-node-polyfills"))), "..");
const swapkitUiCss = fileURLToPath(import.meta.resolve("@swapkit/ui/swapkit.css"));

export default defineConfig({
  build: {
    commonjsOptions: { transformMixedEsModules: true },
    rollupOptions: { plugins: [nodePolyfills()] },
    sourcemap: true,
    target: "es2022",
  },
  define: { global: "globalThis", "process.browser": true, "process.env": {} },
  esbuild: { logOverride: { "this-is-undefined-in-esm": "silent" }, target: "es2022" },
  optimizeDeps: {
    entries: [
      "index.html",
      "../../packages/wallets/src/**/*.ts",
      "../../packages/wallet-extensions/src/**/*.ts",
      "../../packages/wallet-hardware/src/**/*.ts",
      "../../packages/wallet-mobile/src/**/*.ts",
    ],
    esbuildOptions: { define: { global: "globalThis" } },
    exclude: [
      "@swapkit/wallets",
      "@swapkit/wallet-extensions",
      "@swapkit/wallet-hardware",
      "@swapkit/wallet-mobile",
      // Avoid splitting nuqs into separate chunks — the adapter and the
      // useAdapter hook must share a single module instance to share React
      // context.
      "nuqs",
      "nuqs/adapters/react",
    ],
    include: [
      "@ledgerhq/devices",
      "@ledgerhq/errors",
      "@ledgerhq/hw-app-btc",
      "@ledgerhq/hw-transport-webhid",
      "@ledgerhq/hw-transport-webusb",
      "@near-js/accounts",
      "@near-js/crypto",
      "@near-js/providers",
      "@near-js/transactions",
      "@near-js/types",
      "@near-js/utils",
      "@solana/web3.js",
      "@swapkit/helpers",
      "@swapkit/toolboxes/utxo",
      "@swapkit/utxo-signer",
      "@swapkit/wallet-core",
      "bn.js",
      "depd",
      "eventemitter3",
      "ethers",
      "hoist-non-react-statics",
      "is-my-json-valid",
      "jayson/lib/client/browser",
      "mustache",
      "rpc-websockets",
      "secp256k1",
      "ts-pattern",
      "vite-plugin-node-polyfills/shims/buffer",
      "vite-plugin-node-polyfills/shims/global",
      "vite-plugin-node-polyfills/shims/process",
    ],
  },
  plugins: [nodePolyfills({ globals: { Buffer: true, global: true, process: true } }), react()],
  resolve: {
    alias: {
      "@swapkit/ui/swapkit.css": swapkitUiCss,
      "vite-plugin-node-polyfills/shims/buffer": resolve(polyfillsPkg, "shims/buffer/dist/index.js"),
      "vite-plugin-node-polyfills/shims/global": resolve(polyfillsPkg, "shims/global/dist/index.js"),
      "vite-plugin-node-polyfills/shims/process": resolve(polyfillsPkg, "shims/process/dist/index.js"),
    },
    // Prefer the "bun" condition so vite resolves workspace packages to their
    // src/ entrypoints instead of the (potentially stale) dist/ build.
    conditions: ["bun", "module", "browser", "import", "default"],
    // Force a single module instance for libraries that rely on React context —
    // bun's content-addressed store can otherwise produce two physical copies
    // even at the same version, breaking provider/context lookup.
    dedupe: ["react", "react-dom", "nuqs"],
  },
});
