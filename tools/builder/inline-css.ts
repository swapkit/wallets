import { dirname } from "node:path";
import type { BunPlugin } from "bun";

// Stylesheets imported from dependencies get embedded and injected into the page
// at runtime, so consumers don't need a bundler that understands CSS imports.
export const inlineCssPlugin: BunPlugin = {
  name: "swapkit-inline-css",
  setup(build) {
    build.onResolve({ filter: /\.css$/ }, (args) => ({
      namespace: "swapkit-inline-css",
      path: Bun.resolveSync(args.path, dirname(args.importer)),
    }));

    build.onLoad({ filter: /.*/, namespace: "swapkit-inline-css" }, async (args) => {
      const css = await Bun.file(args.path).text();
      const id = args.path.replace(/^.*node_modules\//, "");

      return {
        contents: `
          if (typeof document !== "undefined" && !document.querySelector('style[data-swapkit-styles=${JSON.stringify(id)}]')) {
            const style = document.createElement("style");
            style.dataset.swapkitStyles = ${JSON.stringify(id)};
            style.textContent = ${JSON.stringify(css)};
            document.head.appendChild(style);
          }
        `,
        loader: "js",
      };
    });
  },
};
