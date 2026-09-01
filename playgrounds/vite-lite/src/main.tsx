import * as Sentry from "@sentry/react";
import { NuqsAdapter } from "nuqs/adapters/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

Sentry.init({
  dsn: "https://ede7a7b9b7dd3de03b64903fc5385421@o4511145607036928.ingest.us.sentry.io/4511150591180800",
  environment: import.meta.env.MODE,
  sendDefaultPii: true,
});

// Recover from "stale tab after deploy" errors. When a tab loads an `index.html`
// from build N and later tries to dynamic-import a chunk that build N+1 already
// replaced on the CDN, Vite emits `vite:preloadError`. Reload to pick up the
// fresh `index.html` (and the chunk hashes it references).
//
// Guarded by `sessionStorage` so a *genuinely* missing asset doesn't throw the
// page into a reload loop — we only reload once per session.
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", () => {
    if (sessionStorage.getItem("vite:preload-reloaded") === "true") return;
    sessionStorage.setItem("vite:preload-reloaded", "true");
    window.location.reload();
  });
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <NuqsAdapter>
      <App />
    </NuqsAdapter>
  </StrictMode>,
);
