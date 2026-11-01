# SplitSmart

A client-side receipt splitting app for shared expenses. Create a group, scan or enter a bill, assign items, and settle up. Receipt images and group data are processed and stored on the device; there is no application backend.

## Run locally

Requires Node.js 18+ for tests. Serve the `dist` directory with any static server (for example `npx serve dist` or `python -m http.server 8000 --directory dist`) and open the printed URL. HTTPS or localhost is required for service workers and installability. Run `npm test` for the calculation and parser tests. No build step or API key is needed.

## Features

- **Tier 1:** multiple groups and members; receipt image selection and preview; Tesseract.js OCR with progress; editable items, quantities, prices, taxes and total; low-confidence highlighting; receipt comparison; total mismatch warning; manual expenses; balances.
- **Tier 2:** item assignment; equal, exact, percentage and share splits; proportional adjustments; paise reconciliation; minimum-transaction settlement and payment history; optional lazy zero-shot categorization; local persistence.
- **Tier 3:** UPI links and locally generated QR codes; category/member/date spending charts; JSON export/import; installable app shell and offline saved data; monthly recurring expenses; a group spending target; editable expense history and detailed per-member breakdowns; copyable settlement summaries; pasted receipt text; CSV export; sequential multi-receipt scanning; keyboard-accessible controls and mobile layouts.

The model and third-party libraries download only on first use. First-time OCR, categorization and QR generation require a network connection. Offline access to downloaded model assets depends on the browser's cache and upstream cross-origin response policy; it is not guaranteed. Images are never sent to an OCR server. The UPI QR is rendered in the browser after the QR library loads; payment itself happens in the user's UPI app. The app records a settlement only when the user marks it paid.

## Models

- OCR: Tesseract.js 5 with its English language pack, running in a browser worker.
- Categorization: `Xenova/mobilebert-uncased-mnli` through Transformers.js, loaded on demand. Categories can be changed manually.

No model is trained or fine-tuned. OCR is heuristic and should always be reviewed; images with no recognized items can be entered manually. The rotate button rotates the review preview; for a rotated scan, rotate the source image before selecting it.

## Calculation rules

Money is stored and computed as integer paise. Each item's total is divided among assigned members. The difference between the item subtotal and the bill total (tax, charges and discounts) is allocated in proportion to those item subtotals. Each allocation uses the largest-remainder method: floor each exact share, then give remaining paise to the largest fractional remainders; equal remainders follow group member order. Thus ₹100 split three ways is ₹33.34, ₹33.33, ₹33.33.

Group balances aggregate all expenses and recorded settlements. The settlement engine searches distinct opposite-sign balance pairings with backtracking, pruning paths that cannot beat the best answer. This finds the minimum number of payments, rather than merely relying on a greedy approximation. Its worst-case runtime is exponential, so it is best suited to the small groups in the brief.

## Data and limitations

Group data is stored in localStorage in the current browser, not synced between devices. Export JSON before clearing browser storage or moving devices. Imported JSON should be trusted. Recurring expenses are generated when the app is opened, not while it is closed; monthly dates currently follow JavaScript date rollover rules. Deleting a historical member is prevented to preserve balances. QR generation and model downloads depend on third-party CDNs. CSV export covers current suggested settlements. The app is a static site and can be deployed by pointing a static host at `dist/`.

## Suggested submission description (under 100 words)

SplitSmart scans receipts privately on-device, supports item assignments and four split modes, and computes minimum-payment settlements with exact paise reconciliation. Extras include UPI links and QR codes, spending insights, portable JSON backups, recurring expenses, CSV settlement export, batch receipt scanning, an installable offline-capable app shell, and keyboard-friendly responsive layouts. OCR uses Tesseract.js and categorization uses Xenova/mobilebert-uncased-mnli; no models were trained.


## Club edition update

- Receipt-inspired visual identity, responsive desktop sidebar and mobile navigation.
- Sample receipt editor: open a group and choose **Try a sample** to demonstrate item assignments without waiting for model downloads.
- Live per-member split with proportional adjustments and mismatch feedback.
- Search expenses by description or payer.
- Keyboard shortcuts: **N** for an expense, **S** for scanning, **Escape** to close a dialog. Dialogs trap Tab focus.
- Tested in the browser at 360 px, 768 px and 1440 px. Sample receipt saving verified; no horizontal overflow at phone and tablet widths.
- New OCR/model downloads were not exercised in this design pass.

![Desktop dashboard](docs/dashboard-desktop.png)
