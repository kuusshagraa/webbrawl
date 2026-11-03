# SplitSmart
Initial Base Code is written by me with Ai enhancing it all ideation is done by me code setup. Ai is extensively used for coding reptitive code. However All code is reviewed by me.

Scan a bill, pay only for what you had, and settle up without the awkward group chat. A mobile-first, client-side web app: receipts are read on the device, data stays in the browser, and there is no backend.

![Desktop home](docs/dashboard-desktop.png)

## Guided demo for reviewers

Open **https://super-lebkuchen-c44ad5.netlify.app/#/demo** (or tap "Take the guided demo" on the first screen, or Settings → Guided demo). It loads sample data in a separate sandbox and walks through all 26 steps of the product: balances, Quick Add by sentence, WhatsApp asks, on-device receipt scanning with a bundled sample bill, the review screen, fair-split rules (diet tags, split by count, charge rules), pass the phone, disputes, summaries, settle up with UPI and reminders, groups, friends, the avatar studio, monthly Wrapped, share links and backups. Use Next/Back or the arrow keys; the "Demo" pill restarts the tour or exits. Exiting restores the app exactly as it was.

## Run locally

Requires Node.js 18+ for tests. Serve `dist/` with any static server (`npx serve dist` or `python3 -m http.server 8000 --directory dist`) and open the URL. HTTPS or localhost is needed for the camera, service worker and install prompt. `npm test` runs the engine, parser, sharing and storage tests. No build step or API key.

## Adding an expense in seconds

Tap **+** and either type or say a sentence such as "Uber 640 with Rohit and Aman" ("Rohit paid 1.2k dinner with everyone", "auto 80 for Aman", "yesterday swiggy 450 with hostel wing" also work), or use the keypad: amount, what for, tap faces, Save. Recent repeats appear as one-tap suggestions. After saving, WhatsApp buttons send each person a ready-made message with their share, your UPI ID and a link to the breakdown. Receipts still go through the scanner below.

Extras: reminders in the bell when someone hasn't paid for 3+ days, a monthly **Wrapped** story (total shared, top category, the group's "ATM", crowd favourite, what your food tags saved you) with a shareable image, screen slide-ins, a receipt "print" when you save, and confetti when everyone is square.

## How it works

1. **Onboarding:** your name, an illustrated avatar (or a photo), food preferences (veg, no egg, no alcohol), an optional UPI ID and your usual crew.
2. **Scan:** camera with a receipt frame, or a gallery photo, pasted text, or manual entry. Rotate, crop and enhance before reading. Printed receipts and Swiggy/Zomato screenshots are both understood.
3. **Recognized Items:** edit names, quantities and line prices; taxes, fees and discounts are listed separately; a live check compares the items against the receipt total.
4. **Split:** pick who was there, then who had each item. Diet tags leave people out of matching items automatically (with an Include override). Items with a quantity can be split by count. Unsure who ate what? **Pass the phone** and everyone taps their own items.
5. **Summary:** each person's items and every fee as a separate line, disputed items, rounding, split method, group and category. Save the bill, copy a link, or share.
6. **Settle up:** the fewest payments across each group and your personal bills, with UPI links and QR codes. Payments are recorded only when marked paid.

## Fairness rules

Money is computed in integer paise and every split adds up exactly to the bill total (largest-remainder allocation).

| Situation | Rule |
|---|---|
| Item shared by some people | Split equally among those who had it |
| Split by count (e.g. 3 of 6 rotis) | Charged per unit; unclaimed units are split equally among everyone |
| Nobody claimed an item | Split equally among everyone on the bill |
| Delivery, packaging, platform fees | Equally among people who ordered something |
| Tax, service charge, tip, discounts | In proportion to what each person ordered |
| Split Tax off | The payer covers the tax |
| Coupon owner | A discount can be credited to one person |
| Disputed item | Held with the payer until someone claims it |
| Receipt total differs from items | Difference shared in proportion, shown as an adjustment |
| Rounding to ₹1/₹5/₹10 | Everyone else is rounded; the payer absorbs the difference |

Settlement uses a backtracking search for the minimum number of payments, preferring the answer that moves the least money. Tiny payments can be hidden.

## Sharing

A shared link carries the whole bill, compressed into the URL, so no server is needed. Friends see a read-only breakdown and can save it to their own SplitSmart; they choose which person they are.

## Data and robustness

- Data lives in `localStorage` (`splitsmart-v2`). Data from the previous version is migrated on first launch with identical splits; the old copy is kept.
- Corrupted storage never crashes the app: the raw data is kept aside and can be downloaded.
- Deletes and edits offer Undo; destructive actions ask first. Backups are JSON; bills export as CSV; imports are validated.
- A full-storage error is reported instead of silently losing a change.
- Optional category suggestions use `Xenova/mobilebert-uncased-mnli` via Transformers.js. No model is trained.

## OCR

Receipts are read on the device with **PaddleOCR PP-OCRv5 (mobile)** running in WebAssembly through ONNX Runtime Web and the MIT-licensed `paddleocr` runtime. The detection and recognition models (about 21 MB) are self-hosted in `dist/models/` and cached after the first scan, so later scans work offline. If the device can't run it, the app falls back to Tesseract.js.

The words come back with their positions, and `dist/layout.js` rebuilds the receipt: it undoes the photo's tilt, groups words into rows, splits fused number columns using qty × rate = amount, and joins item names that wrap onto a second line. The parser then separates items from taxes, fees, discounts and round-off, and ignores everything printed after the grand total.

Benchmark on a tilted restaurant photo (14 items, ₹4,770):

| Engine | Item names right | Totals reconcile |
|---|---|---|
| Tesseract 5 (previous) | about 4 of 14 | no |
| PaddleOCR v4 | 13 of 14 | with layout fixes |
| **PaddleOCR v5 + layout** | **14 of 14** | **yes, to the paisa** |

Both test receipts are in `tests/fixtures/` as real OCR output.

## Code map

`dist/core.js` money and settlement · `fair.js` fair-split engine · `parse.js` receipt and food-app parser · `quick.js` sentence parser · `nudge.js` WhatsApp messages · `remind.js` overdue dues · `wrapped.js` monthly stats · `share.js` links · `store.js` storage, migration, recurrence · `model.js` domain helpers · `ui.js`, `icons.js`, `avatar.js` UI kit · `views/` screens · `app.js` router and shell.

Verified in the browser at 360, 768, 1024 and 1440 px with no horizontal overflow, including real OCR of a test receipt.
