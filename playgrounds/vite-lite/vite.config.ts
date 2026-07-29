import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const workspaceRoot = resolve(__dirname, "../..");
const swapkitUiCss = fileURLToPath(import.meta.resolve("@swapkit/ui/swapkit.css"));
const swapkitHelpers = fileURLToPath(import.meta.resolve("@swapkit/helpers"));
const swapkitHelpersApi = fileURLToPath(import.meta.resolve("@swapkit/helpers/api"));

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
      "@swapkit/helpers",
      "@swapkit/helpers/api",
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
      "@swapkit/toolboxes/utxo",
      "@swapkit/utxo-signer",
      "@swapkit/wallet-core",
      "@trezor/connect-web",
      "bn.js",
      "depd",
      "eventemitter3",
      "ethers",
      "hoist-non-react-statics",
      "is-my-json-valid",
      "jayson/lib/client/browser",
      "lucide-react",
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
    alias: [
      { find: "@noble/curves/ed25519", replacement: resolve(__dirname, "node_modules/@noble/curves/ed25519.js") },
      { find: "@noble/hashes/utils", replacement: resolve(__dirname, "node_modules/@noble/hashes/utils.js") },
      {
        find: "vite-plugin-node-polyfills/shims/buffer",
        replacement: resolve(__dirname, "node_modules/vite-plugin-node-polyfills/shims/buffer/dist/index.js"),
      },
      {
        find: "vite-plugin-node-polyfills/shims/global",
        replacement: resolve(__dirname, "node_modules/vite-plugin-node-polyfills/shims/global/dist/index.js"),
      },
      {
        find: "vite-plugin-node-polyfills/shims/process",
        replacement: resolve(__dirname, "node_modules/vite-plugin-node-polyfills/shims/process/dist/index.js"),
      },
      { find: "@swapkit/ui/swapkit.css", replacement: swapkitUiCss },
      { find: /^@swapkit\/helpers\/api$/, replacement: swapkitHelpersApi },
      { find: /^@swapkit\/helpers$/, replacement: swapkitHelpers },
      { find: "@swapkit/sdk", replacement: resolve(workspaceRoot, "packages/sdk/src/index.ts") },
      { find: "@swapkit/wallets", replacement: resolve(workspaceRoot, "packages/wallets/src/index.ts") },
      { find: "@swapkit/wallet-mobile", replacement: resolve(workspaceRoot, "packages/wallet-mobile/src/index.ts") },
      {
        find: /^@swapkit\/wallet-extensions\/(.+)$/,
        replacement: `${resolve(workspaceRoot, "packages/wallet-extensions/src")}/$1/index.ts`,
      },
      {
        find: "@swapkit/wallet-extensions",
        replacement: resolve(workspaceRoot, "packages/wallet-extensions/src/index.ts"),
      },
      {
        find: /^@swapkit\/wallet-hardware\/(.+)$/,
        replacement: `${resolve(workspaceRoot, "packages/wallet-hardware/src")}/$1/index.ts`,
      },
      {
        find: "@swapkit/wallet-hardware",
        replacement: resolve(workspaceRoot, "packages/wallet-hardware/src/index.ts"),
      },
    ],
    // Prefer the "bun" condition so vite resolves workspace packages to their
    // src/ entrypoints instead of the (potentially stale) dist/ build.
    conditions: ["bun", "module", "browser", "import", "default"],
    // Force a single module instance for libraries that rely on React context —
    // bun's content-addressed store can otherwise produce two physical copies
    // even at the same version, breaking provider/context lookup.
    dedupe: ["react", "react-dom", "nuqs"],
  },
});
