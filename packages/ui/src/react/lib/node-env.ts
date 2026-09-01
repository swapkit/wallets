/**
 * True when the consuming bundler's NODE_ENV is anything but "production".
 *
 * `process.env.NODE_ENV` is statically replaced at build time: the package
 * build (tools/builder) and the CDN widget build both inline "production",
 * so dist/CDN consumers never see dev-only affordances. The vite-lite
 * playground aliases @swapkit/ui to src, so its own mode applies there
 * ("development" under `vite dev`, "production" in deployed builds). The
 * try/catch covers consumers where neither a define nor a process global
 * exists — hidden is the safe default.
 */
export function isNonProductionNodeEnv(): boolean {
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

// The deployed dev/stage studios are production Vite builds, so the NODE_ENV
// check alone hides the request-params tooling exactly where the team tests
// it. These SwapKit-owned hosts opt in explicitly; the prod studio and
// customer embeds are never in this list.
const DEV_TOOLING_HOSTS = ["widget-dev.swapkit.dev", "widget-stage.swapkit.dev"];

/**
 * Gate for developer request tooling (extra quote/swap params): any
 * non-production build, plus the deployed dev/stage studio hosts.
 */
export function isDevToolingEnabled(): boolean {
  if (isNonProductionNodeEnv()) return true;
  return typeof window !== "undefined" && DEV_TOOLING_HOSTS.includes(window.location.hostname);
}
