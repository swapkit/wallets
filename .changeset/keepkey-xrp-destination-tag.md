---
"@swapkit/wallet-hardware": patch
---

KeepKey XRP sends now carry the destination tag passed to `transfer`. Before, the tag was dropped and every payment went out with tag 0, so a deposit to an exchange was not credited.
