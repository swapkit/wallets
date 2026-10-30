---
"@swapkit/wallet-hardware": patch
---

Sign Zcash sends and swaps on Ledger again. The connector told the device that change returns to the account's receive address, and the Zcash app only accepts a change path on the internal chain (`…/1/x`), so every transaction was refused with status `6986` before the review screen. Change on a receive address is now left for the device to show as a regular output, which you approve along with the payment.
