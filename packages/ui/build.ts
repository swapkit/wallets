import { $, type BunPlugin } from "bun";
import { buildPackage } from "../../tools/builder";

// Tailwind core plugins (borderSpacing, ring, filter, etc.) seed their --tw-* variables
// onto unscoped `*,::before,::after` and `::backdrop` rules that tailwindcss-scoped-preflight
// does not touch. Rewrite those two rules so the seeding only applies inside .swapkit-ui-preflight.
const scopeTailwindDefaults = (css: string) => {
  return css
    .replace(
      /(^|\})\*,:after,:before\{/g,
      "$1:where(.swapkit-ui-preflight,.swapkit-ui-preflight *,.swapkit-ui-preflight :after,.swapkit-ui-preflight :before){",
    )
    .replace(/(^|\})::backdrop\{/g, "$1.swapkit-ui-preflight ::backdrop{");
};

const bunTailwind3Plugin: BunPlugin = {
  name: "bun-plugin-tailwind-3",
  setup: (build) => {
    build.onLoad({ filter: /\.css$/ }, async (_args) => {
      const cssFileInput = "./src/swapkit.css";
      const cssFileOutput = "./dist/swapkit.css";

      // Bare `tailwindcss` — bun's $ prepends both workspace and root
      // node_modules/.bin to PATH, so this works regardless of which
      // .bin location the install ended up in.
      await $`tailwindcss -i ${cssFileInput} -o ${cssFileOutput} --minify`;

      const scoped = scopeTailwindDefaults(await Bun.file(cssFileOutput).text());
      await Bun.write(cssFileOutput, scoped);

      return { contents: scoped, loader: "css" };
    });
  },
};

void buildPackage({
  evmOnly: true,
  external: ["react", "react-dom"],
  plugins: [bunTailwind3Plugin],
  target: "browser",
});
