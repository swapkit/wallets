---
"@swapkit/ui": patch
---

Move `@swapkit/ui` and the vite-lite playground into the `swapkit/wallets` monorepo. `@swapkit/ui` now consumes `@swapkit/wallets` via the workspace instead of the published package; releases of `@swapkit/ui` ship from this repo going forward. Deployment/infra config (terraform, cloudbuild) intentionally stays out of this repo — it lives in the devops repo.
