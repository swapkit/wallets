import type { Config } from "tailwindcss";

import tailwindCssAnimatePlugin from "tailwindcss-animate";
import { isolateInsideOfContainer, scopedPreflightStyles } from "tailwindcss-scoped-preflight";

const config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  plugins: [
    tailwindCssAnimatePlugin,
    scopedPreflightStyles({ isolationStrategy: isolateInsideOfContainer(".swapkit-ui-preflight") }),
  ],
  prefix: "sk-ui-",
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      animation: {
        // With `prefix: "sk-ui-"` set globally, Tailwind auto-prepends `sk-ui-`
        // to both the utility class name AND the `@keyframes` identifier it
        // references — so the keys here stay unprefixed and the compiled CSS
        // ends up with `sk-ui-animate-accordion-down` pointing at
        // `@keyframes sk-ui-accordion-down` (namespaced, no global leak).
        "accordion-down": "accordion-down 280ms cubic-bezier(.4,0,.2,1)",
        "accordion-up": "accordion-up 220ms cubic-bezier(.4,0,.2,1)",
      },
      borderRadius: {
        "2xl": "var(--sk-ui-radius)",
        DEFAULT: "var(--sk-ui-radius)",
        lg: "var(--sk-ui-radius)",
        md: "var(--sk-ui-radius)",
        sm: "var(--sk-ui-radius)",
        xl: "var(--sk-ui-radius)",
      },

      // biome-ignore assist/source/useSortedKeys: sort by use case, not alphabetically
      colors: {
        background: "hsl(var(--sk-ui-background))",
        foreground: "hsl(var(--sk-ui-foreground))",

        // Background system - user customizable
        "bg-base": "hsl(var(--sk-bg))",
        "bg-surface": "hsl(var(--sk-bg-surface))",
        "bg-hover": "hsl(var(--sk-bg-hover))",
        "bg-active": "hsl(var(--sk-bg-active))",
        "bg-overlay": "hsl(var(--sk-bg-overlay))",

        primary: { DEFAULT: "hsl(var(--sk-ui-primary))", foreground: "hsl(var(--sk-ui-primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--sk-ui-secondary))", foreground: "hsl(var(--sk-ui-secondary-foreground))" },
        tertiary: { DEFAULT: "hsl(var(--sk-ui-tertiary))", foreground: "hsl(var(--sk-ui-tertiary-foreground))" },

        accent: { DEFAULT: "hsl(var(--sk-ui-accent))", foreground: "hsl(var(--sk-ui-accent-foreground))" },
        muted: { DEFAULT: "hsl(var(--sk-ui-muted))", foreground: "hsl(var(--sk-ui-muted-foreground))" },

        "primary-button": {
          DEFAULT: "hsl(var(--sk-ui-primary-button))",
          foreground: "hsl(var(--sk-ui-primary-button-foreground))",
        },

        destructive: {
          DEFAULT: "hsl(var(--sk-ui-destructive))",
          foreground: "hsl(var(--sk-ui-destructive-foreground))",
        },
        success: { DEFAULT: "hsl(var(--sk-ui-success))", foreground: "hsl(var(--sk-ui-success-foreground))" },

        border: "hsl(var(--sk-ui-border))",
        ring: "hsl(var(--sk-ui-ring))",
        input: "hsl(var(--sk-ui-input))",

        card: { DEFAULT: "hsl(var(--sk-ui-card))", foreground: "hsl(var(--sk-ui-card-foreground))" },
        popover: { DEFAULT: "hsl(var(--sk-ui-popover))", foreground: "hsl(var(--sk-ui-popover-foreground))" },
        sidebar: {
          accent: "hsl(var(--sk-ui-sidebar-accent))",
          "accent-foreground": "hsl(var(--sk-ui-sidebar-accent-foreground))",
          border: "hsl(var(--sk-ui-sidebar-border))",
          DEFAULT: "hsl(var(--sk-ui-sidebar-background))",
          foreground: "hsl(var(--sk-ui-sidebar-foreground))",
          primary: "hsl(var(--sk-ui-sidebar-primary))",
          "primary-foreground": "hsl(var(--sk-ui-sidebar-primary-foreground))",
          ring: "hsl(var(--sk-ui-sidebar-ring))",
        },
      },
      keyframes: {
        // Radix exposes the resolved height as `--radix-accordion-content-height`.
        // Keys are unprefixed — Tailwind's `prefix` config namespaces both the
        // keyframe identifier (`@keyframes sk-ui-accordion-down`) and the
        // animation references that point at it.
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
    },
  },
} satisfies Config;

export default config;
