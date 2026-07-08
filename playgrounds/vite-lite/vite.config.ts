import { createReadStream, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type ViteDevServer } from "vite";
import { cjsInterop } from "vite-plugin-cjs-interop";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Resolve shims from this package's context so Rollup can find them when bundling other packages
const polyfillsPkg = resolve(dirname(fileURLToPath(import.meta.resolve("vite-plugin-node-polyfills"))), "..");

// Point @swapkit/ui imports at the workspace source so Vite HMRs sidebar/widget edits without a rebuild.
const uiSrc = resolve(__dirname, "../../packages/ui/src");

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",

  build: {
    commonjsOptions: { transformMixedEsModules: true },
    rollupOptions: { plugins: [nodePolyfills()] },
    sourcemap: true,
    target: "es2022",
  },

  define: { global: "globalThis", "process.browser": true, "process.env": {} },

  esbuild: { logOverride: { "this-is-undefined-in-esm": "silent" }, target: "es2022" },

  optimizeDeps: { esbuildOptions: { define: { global: "globalThis" } } },

  plugins: [
    cjsInterop({ dependencies: ["lodash", "near-seed-phrase"] }),
    nodePolyfills({ globals: { Buffer: true, global: true, process: true } }),
    react(),
    serveWidgetAssets(),
  ],

  resolve: {
    // Use array form so the longest-prefix workspace aliases are tried first.
    // Object form gets re-sorted alphabetically by the linter, which then matches
    // the bare `@swapkit/ui` prefix before subpaths like `@swapkit/ui/react`.
    alias: [
      // Workspace source resolution for JS/TSX only — `swapkit.css` stays on dist
      // because the source is raw Tailwind that needs the package build pipeline.
      { find: /^@swapkit\/ui\/react\/controls$/, replacement: resolve(uiSrc, "react/controls/index.ts") },
      { find: /^@swapkit\/ui\/react$/, replacement: resolve(uiSrc, "react/index.tsx") },
      { find: /^@swapkit\/ui$/, replacement: resolve(uiSrc, "index.ts") },
      { find: "lodash/isEqual.js", replacement: "lodash-es/isEqual.js" },
      // ESM shim for randomfill to fix "exports is not defined" error in production builds
      { find: "randomfill", replacement: resolve(__dirname, "shims/randomfill.js") },
      {
        find: "vite-plugin-node-polyfills/shims/buffer",
        replacement: resolve(polyfillsPkg, "shims/buffer/dist/index.js"),
      },
      {
        find: "vite-plugin-node-polyfills/shims/global",
        replacement: resolve(polyfillsPkg, "shims/global/dist/index.js"),
      },
      {
        find: "vite-plugin-node-polyfills/shims/process",
        replacement: resolve(polyfillsPkg, "shims/process/dist/index.js"),
      },
    ],
  },
});

function serveWidgetAssets() {
  const widgetDir = join(__dirname, "../../packages/ui/dist/widget");

  return {
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/widget-assets", (req, res, next) => {
        const filePath = join(widgetDir, req.url || "");

        if (!existsSync(filePath)) {
          return next();
        }

        if (filePath.endsWith(".js")) {
          res.setHeader("Content-Type", "application/javascript");
        } else if (filePath.endsWith(".css")) {
          res.setHeader("Content-Type", "text/css");
        }

        createReadStream(filePath).pipe(res);
      });
    },
    name: "serve-widget-assets",
  };
}
