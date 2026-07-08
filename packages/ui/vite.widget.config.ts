import { copyFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import wasm from "vite-plugin-wasm";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve shims from ui package context so Rollup can find them when bundling other packages
const polyfillsPkg = resolve(dirname(fileURLToPath(import.meta.resolve("vite-plugin-node-polyfills"))), "..");

function getCssContent(): string {
  try {
    return readFileSync(resolve(__dirname, "dist/swapkit.css"), "utf-8");
  } catch {
    return "/* CSS will be inlined during build */";
  }
}

export default defineConfig({
  build: {
    commonjsOptions: { include: [/@swapkit/, /node_modules/], transformMixedEsModules: true },
    lib: {
      entry: resolve(__dirname, "src/react/swapkit-widget-web-component.tsx"),
      fileName: "swapkit-widget",
      formats: ["es"],
      name: "SwapKitWidget",
    },
    minify: "terser",
    outDir: "dist/widget",
    rollupOptions: {
      output: {
        // Ensure proper chunking - shared deps shouldn't go into lazy chunks
        chunkFileNames: "[name]-[hash].js",
        manualChunks: (id) => {
          // Buffer and process polyfills must be in their own chunk FIRST
          if (
            id.includes("buffer-shim") ||
            (id.includes("node_modules/buffer") && !id.includes("safe-buffer")) ||
            (id.includes("node_modules/process") && !id.includes("processChild"))
          ) {
            return "polyfill-buffer";
          }

          // Shared utilities - must be in their own chunk to avoid bundling with vendors
          if (id.includes("tslib")) return "shared-utils";

          // Crypto browserify - only needed by keystore, keep separate
          if (id.includes("crypto-browserify") || id.includes("browserify-")) return "shared-crypto";

          // Keystore wallet with crypto deps - must be lazy loaded
          // Only match the package, not local files with "keystore" in the name
          if (id.includes("@swapkit/wallet-keystore") || id.includes("node_modules/wallet-keystore")) {
            return "wallet-keystore";
          }

          // Heavy chain/wallet packages - lazy loaded
          if (id.includes("@cosmjs") || id.includes("cosmjs-types")) return "chain-cosmos";
          if (id.includes("protobufjs") || id.includes("@protobufjs")) return "chain-cosmos";
          if (id.includes("@keepkey")) return "wallet-keepkey";
          if (id.includes("@polkadot")) return "vendor-polkadot";
          if (id.includes("@walletconnect")) return "vendor-walletconnect";
          if (id.includes("@trezor")) return "vendor-trezor";
          if (id.includes("@coinbase/wallet-sdk")) return "wallet-coinbase";
          if (id.includes("@radixdlt")) return "vendor-radix";
        },
      },
    },
    sourcemap: "hidden",
    target: "esnext",
    terserOptions: {
      // Keep function names for BigInteger type checks in @psf/bitcoincashjs-lib
      keep_fnames: true,
    },
  },
  define: {
    __SWAPKIT_CSS__: JSON.stringify(getCssContent()),
    __SWAPKIT_IS_DEV__: JSON.stringify(process.env.SWAPKIT_USE_DEV_API === "true"),
    __SWAPKIT_VERSION__: JSON.stringify(JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8")).version),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  esbuild: {
    // fixes BigInteger type checks in @psf/bitcoincashjs-lib
    keepNames: true,
  },
  optimizeDeps: { include: ["@swapkit/helpers", "@swapkit/core", "@swapkit/plugins", "@swapkit/wallets"] },
  plugins: [
    // Emit the standalone widget-host page (swap.swapkit.dev) alongside the
    // bundle. Ships deploy-time placeholders (__CDN_BASE__/__WIDGET_ID__/
    // __WIDGET_KEY__) that the private devops deploy substitutes per env.
    {
      closeBundle() {
        copyFileSync(resolve(__dirname, "widget-host/index.html"), resolve(__dirname, "dist/widget/index.html"));
      },
      name: "emit-widget-host",
    },
    wasm(),
    react(),
    nodePolyfills({ globals: { Buffer: true, global: true, process: true } }),
    ...(process.env.SENTRY_AUTH_TOKEN
      ? [
          sentryVitePlugin({
            authToken: process.env.SENTRY_AUTH_TOKEN,
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            release: {
              name:
                process.env.SENTRY_RELEASE ||
                `@swapkit/ui@${JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8")).version}`,
            },
            sourcemaps: { assets: "./dist/widget/**", filesToDeleteAfterUpload: "./dist/widget/**/*.map" },
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      // Force Buffer and process to come from our shim, not from @cosmjs dependencies
      buffer: resolve(__dirname, "shims/buffer-shim.js"),
      process: resolve(__dirname, "shims/buffer-shim.js"),
      // ESM shim for randomfill to fix "exports is not defined" error in production builds
      randomfill: resolve(__dirname, "shims/randomfill.js"),
      // Force tslib helpers to come from tslib, not vendor packages
      tslib: "tslib",
      "vite-plugin-node-polyfills/shims/buffer": resolve(polyfillsPkg, "shims/buffer/dist/index.js"),
      "vite-plugin-node-polyfills/shims/global": resolve(polyfillsPkg, "shims/global/dist/index.js"),
      "vite-plugin-node-polyfills/shims/process": resolve(polyfillsPkg, "shims/process/dist/index.js"),
    },
  },
});
