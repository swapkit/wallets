---
"@swapkit/ui": patch
---

Output token picker falls back to the full asset catalog when swap-to pair data is unavailable (request disabled by missing credentials, failed, or not yet run) instead of rendering an empty "No assets found" list. Token search is enabled in the fallback state so the picker behaves like the input picker. [API-2945]
