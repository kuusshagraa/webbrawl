# SplitSmart: report source notes

> **For Codex (or whoever writes the report):** This file is the factual source for the project report. Every number below was measured during development. Turn it into a report with these sections: Problem identified → Research and insights → Solution → How it works → Results → Testing → Limitations and next steps. Use the screenshots listed in section 12 (all in `docs/screens/`). Section 13 holds the team's phone test results; include them once filled in. Don't invent numbers; if something isn't here, leave it out or mark it as future work.

## 1. Project snapshot

| | |
|---|---|
| Product | SplitSmart: a mobile-first app for splitting bills fairly among friends, flatmates and hostel groups |
| Live app | https://super-lebkuchen-c44ad5.netlify.app |
| **Guided demo for evaluators** | https://super-lebkuchen-c44ad5.netlify.app/#/demo (26-step tour with sample data; also on the first screen and in Settings) |
| Code | https://github.com/kuusshagraa/webbrawl (pull requests #1–#6) |
| Platform | Web app installable on phones (PWA), works in Safari (iPhone) and Chrome (Android), with a desktop layout |
| Backend | None. All data stays on the user's device; receipts are read on the phone |
| Size | ~7,500 lines of JavaScript/CSS, 70 automated tests |
| Currency / payments | Indian rupees, UPI payment links and QR codes |

## 2. Problems identified

### P1. Equal splits are unfair, especially in hostels
When a group orders food or goes out, splitting equally is unfair to someone almost every time, and nobody wants to argue over ₹40. We broke the unfairness into six concrete causes:

1. **Some people didn't eat an item**: the vegetarian didn't touch the chicken; the non-drinker skipped the beer.
2. **People ate different amounts**: 6 rotis, one person had 3.
3. **Extra charges are split badly**: an equal delivery fee feels fair, but tax should follow what each person ordered.
4. **Coupons**: one person's coupon or card discount.
5. **People join late or leave early.**
6. **The payer doesn't know who had what**, and asking in the group chat is awkward. (This was the biggest one.)

### P2. Too much effort to record a simple expense
Recording "I paid ₹640 for an Uber" took **4 screens and about 12 taps** (scan screen → type it in → items screen → split screen → summary → save), because every expense went through the itemised-receipt flow. Most real expenses are a single amount (cab, groceries, Wi-Fi).

### P3. Receipt scanning gave wrong results on real photos
The first version used Tesseract OCR. On a real phone photo of a 14-item restaurant bill (₹4,770), it returned **"a Dine Tm 2 & \e", 1 item, ₹1.00**. Tested separately, it got about 4 of 14 item names right on the photo and stopped after 4 lines on a clean digital bill.

### P4. Asking friends for money back is awkward
Even when the split is right, people avoid chasing friends for small amounts, so money goes unpaid.

### P5. The previous version's design didn't fit how the app is used
It was a desktop dashboard built around groups (dark sidebar, lime accents), with no proper onboarding, while people actually use bill splitting on their phones, one bill at a time.

### P6. Reliability problems found while testing (and fixed)
- The hosting provider served the 16.5 MB OCR model at ~50 KB/s and dropped the connection after about a minute, so the first scan on the live site hung.
- Netlify's free plan adds a "Powered by Netlify" badge that covered the main **+** button, the History tab and right-hand buttons on phones.
- Smooth screen transitions (View Transitions API) crashed Chrome on the second screen change.
- Several layout bugs appeared only in Safari (WebKit).

## 3. Research and insights

The design was approached as a product manager and UI designer, using well-known behavioural principles:

| Principle | What it means here |
|---|---|
| **Defaults beat questions** | "Paid by you", "split equally", "today" and "same people as last time" are right ~80% of the time, so they're pre-filled and only changed when needed. |
| **Recognition over recall** | Show the people you split with most as tappable faces instead of a search box. |
| **The fastest input is a sentence** | "Uber 640 with Rohit and Aman" already contains the amount, the purpose and the people. |
| **Progressive disclosure** | Rounding, group and category are useful but stay behind optional controls. |
| **Peak–end rule** | People remember the end of a task, so saving and settling end on a rewarding moment (animation, confetti, one-tap WhatsApp ask). |
| **Remove social friction** | Let the app do the awkward parts: excluding veg friends from chicken, asking for money with a polite pre-written message. |

Reference design: a modern bill-split mobile UI (lavender/peach gradient, white cards, one strong blue, illustrated avatars, torn-receipt cards, floating bottom navigation). It was replicated and extended with a desktop layout.

## 4. Solutions

### S1. Fair-split engine (solves P1)
- **Leave people out of items**: every item starts shared by everyone; tap a face to remove someone.
- **Food & drink tags**: mark a friend as Veg, No egg or No alcohol once; matching items (chicken, egg, beer…) leave them out automatically, shown with an "Include" undo. Word-aware: "Veg Biryani" doesn't exclude a vegetarian, "Eggless cake" doesn't exclude a no-egg friend, "Ginger beer" isn't alcohol.
- **Split by count**: "3 of the 6 rotis"; leftover portions are split equally.
- **A rule for each charge**: delivery/packaging/platform fees split equally among people who ordered; tax/service/tip by what each person ordered; the payer can cover tax ("Split Tax" off); a coupon can be credited to its owner.
- **Disputes**: "I didn't have this" holds an item with the payer until someone claims it.
- **Rounding**: round shares to ₹1/₹5/₹10, with the payer covering the difference.
- **Pass the phone** (solves cause 6): the phone goes round the table; each person taps what they ate; whatever nobody claims is split equally.
- **Exactness guarantee**: money is computed in paise, and every person's share always adds up exactly to the bill total (checked by a test on 500 random bills).
- **Fewest payments**: settle-up finds the minimum number of payments and, among those, moves the least money.

### S2. Quick Add: a 3–4 tap expense (solves P2)
- The centre **+** button opens a sheet with: a sentence field with a microphone, repeat suggestions, a big amount keypad, "what for" with an automatic icon, recent people pre-selected, and chips for payer, split and date.
- **Sentence and voice entry**, understood on the phone:
  - "Uber 640 with Rohit and Aman" → ₹640, Uber, Travel, Rohit + Aman, paid by me
  - "Rohit paid 1.2k dinner with everyone" → ₹1,200, Rohit paid, whole group
  - "auto 80 for Aman" → Aman owes the full ₹80
  - "yesterday swiggy 450 with hostel wing" → yesterday's date, group matched by name
  - Misspelled or misheard names ("Rohith") still match; unknown names offer "Add Priya?"
- **Smart suggestions** for things you add often ("Uber · ₹640 · Rohit, Aman"), ranked by frequency and time of day.
- **Smart paste**: paste a receipt or a sentence into one box.
- Result: **~12 taps → 3–4 taps** for a one-line expense (open, amount, people, save), or 2 taps plus a spoken sentence.

### S3. On-device OCR that works on real photos (solves P3)
- Replaced Tesseract with **PaddleOCR PP-OCRv5 (mobile)**, an open-source OCR model, running in the browser with ONNX Runtime Web. Receipts never leave the phone and there is no API cost.
- Added a **layout-aware parser** (`dist/layout.js`): it straightens tilted photos, groups words into rows, splits run-together number columns ("2212.00424.00" → qty 2, ₹212, ₹424) using qty × rate = amount, joins item names that wrap onto two lines, separates items from taxes, fees, discounts and round-off, and ignores everything printed after the grand total.
- Models (21 MB) are cached after the first scan, so **scanning works offline** afterwards. Tesseract remains as a fallback for devices that can't run PaddleOCR.
- Food-delivery screenshots (Swiggy/Zomato) are recognised, including delivery, packaging and platform fees.

### S4. Getting paid back without awkwardness (solves P4)
- After saving, a green **WhatsApp** button per person opens a ready message: "Hey Rohit! Your share for Uber 🚗 is ₹213.33. You can pay me at jelly@okaxis. Breakdown: [link]". It also appears on bill summaries and as **Remind** in Settle up.
- **Reminders**: the bell lists people who haven't paid for 3+ days, with a one-tap reminder.
- **Share links** carry the whole bill inside the URL (no server); friends see a read-only breakdown and can save it to their own app.
- **UPI**: pay with a UPI link or QR code; payments are recorded only when marked paid.

### S5. A redesigned, phone-first experience (solves P5)
- Replicated the reference design, bill-first, with a desktop layout (sidebar, centre panel, live side panel).
- **Play Store-style onboarding**: intro slides → name → avatar studio (generated cartoon faces with customisable hair, skin, colours, extras, or a photo) → food preferences + UPI → add your crew → done.
- **Delight**: screen slide-ins, count-up totals, a receipt "print" animation on save, confetti when everyone is square, light haptics on Android.
- **Monthly Wrapped**: an Instagram-style story of the month (total shared, top category, the group's "ATM", crowd-favourite dish, money saved by food tags) with a shareable image card.
- **Robustness**: Undo on deletes and edits, confirmations for risky actions, recovery from corrupted storage, backups (JSON/CSV), automatic migration of old data with identical splits.

### S6. Reliability fixes (solves P6)
- OCR models load from fast CDN mirrors (jsDelivr at ~4 MB/s, Hugging Face at ~1.6 MB/s) with automatic fallback if a download stalls for 15 seconds or arrives incomplete.
- The app detects hosting badges and lifts its bottom controls above them instead of hiding them.
- View Transitions were replaced with a plain CSS slide-in after reproducing the Chrome crash.
- Safari-only layout bugs were fixed (class-name clashes, a sheet too tall for an iPhone screen).

### S7. Guided demo mode for evaluators
- A reviewer can open `/#/demo`, or tap "Take the guided demo" on the first screen, and see **every feature in about 3 minutes** without creating an account or entering data.
- It loads rich sample data (5 friends with food tags, a hostel group and a Goa trip, bills across two months, a payment, a monthly Wi-Fi bill, a disputed item, an overdue friend and a scanned receipt waiting for review) in a **separate sandbox**. Real data is never touched, and exiting restores the app exactly as it was.
- A **26-step spotlight tour** highlights each feature with a short explanation and moves between screens automatically. It types a sentence into Quick Add and saves it, opens the scanner on a bundled sample receipt (tap Read receipt to run the real on-device OCR), and visits the review screen, fair-split rules, pass the phone, disputes, summaries, settle up, reminders, groups, friends, the avatar studio, Wrapped, share links and backups.
- Next/Back buttons, arrow keys, Skip, and a "Demo" pill to restart the tour or exit. Tested end to end in Safari's and Chrome's engines on phone and desktop sizes.

## 5. OCR benchmark (real receipts)

Test images: a tilted phone photo of a 14-item restaurant bill (₹4,770 incl. 2 × 2.5% GST and a ₹0.16 round-off), a digital restaurant bill (3 items, ₹472.50), and a printed café receipt (4 items, ₹477.76).

| Engine | Restaurant photo: item names | Prices and totals | Time per scan |
|---|---|---|---|
| Tesseract 5 (old) | ~4 of 14, garbled ("Kali Vacs Dani") | lines scattered; app showed 1 item / ₹1.00 | ~3 s |
| PaddleOCR v4 (RapidOCR) | 13 of 14 | numbers fused, needed layout fixes | ~1.0 s |
| **PaddleOCR v5 + layout parser (shipped)** | **14 of 14** | **items + taxes + round-off = ₹4,770 exactly** | **1–5 s in the browser** |

Other results with the shipped engine: the digital bill came out with all 3 items, both GST lines and ₹472.50; the café receipt with all 4 items, quantities, GST, date and time. Remaining errors are single letters (e.g. "Maaala Chai"), which are flagged as low-confidence for review.

First-time setup downloads about 35 MB (engine + models) once; a fresh browser completed its first scan, downloads included, in 8.6–10.8 s. A second scan with the network switched off took 4.1 s.

## 6. Fairness rules (reference table)

| Situation | Rule |
|---|---|
| Item shared by some people | Split equally among those who had it |
| Split by count | Charged per unit; unclaimed units split equally among everyone |
| Nobody claimed an item | Split equally among everyone on the bill |
| Delivery, packaging, platform fees | Equally among people who ordered something |
| Tax, service charge, tip, discounts | In proportion to what each person ordered |
| Split Tax off | The payer covers the tax |
| Coupon owner | Discount credited to one person |
| Disputed item | Held with the payer until claimed |
| Receipt total differs from items | Difference shared in proportion, shown as an adjustment |
| Rounding to ₹1/₹5/₹10 | Others rounded; payer absorbs the difference |

## 7. Architecture and technology

- **Static web app, no build step, no server**: plain JavaScript modules served by Netlify; data in the browser's localStorage; installable (PWA) with offline support.
- **Privacy by design**: receipts are processed on the device; nothing is uploaded; share links carry only the bill the user chooses to share.
- **Key modules**: `fair.js` (split engine), `parse.js` + `layout.js` (receipt understanding), `ocr.js` (PaddleOCR/ONNX), `quick.js` (sentence parser), `nudge.js` (WhatsApp messages), `remind.js` (overdue dues), `wrapped.js` (monthly stats), `share.js` (links), `store.js` (storage, migration, recovery), `views/` (screens).
- **Open-source components**: PaddleOCR PP-OCRv5 models, ONNX Runtime Web, the `paddleocr` JS runtime (MIT), Tesseract.js (fallback), Transformers.js (optional category suggestion), qrcodejs.

## 8. Quality and testing

- **70 automated tests**, including:
  - a property test on 500 random bills (shares always add up exactly; excluded people never pay for an item)
  - three real receipts stored as OCR fixtures
  - the sentence parser, WhatsApp messages, reminders, Wrapped statistics, migration, corruption recovery, share links
- **Browser tests** in Chromium (Chrome's engine) and WebKit (Safari's engine) covering onboarding, scanning (real OCR), item assignment, pass the phone, saving, settle up, undo, share-link import by a new user, Quick Add by sentence and keypad, WhatsApp links, reminders and Wrapped.
- **Layout**: no horizontal overflow on 15 screens at 360, 768, 1024 and 1440 px; Quick Add fits a 700 px-tall iPhone viewport.
- **Live checks** on the production site: real OCR scans, Quick Add, and all bottom controls reachable with the hosting badge present.

## 9. Delivery timeline (all on 1 Nov 2026)

| PR | What shipped |
|---|---|
| #1 | Bill-first redesign, fair-split engine, onboarding, on-device PaddleOCR with the layout parser |
| #2 | Fast CDN mirrors for OCR models (fixes hanging first scans on the live site) |
| #3 | Quick Add, sentence + voice entry, WhatsApp asks, reminders, smart paste, motion, Wrapped |
| #4, #6 | Handoff documentation |
| #5 | Bottom controls kept clear of the hosting badge |
| #7 | Report notes and screenshots |
| #8 | Guided demo mode for evaluators |

## 10. Results at a glance

| Measure | Before | After |
|---|---|---|
| Taps to record a one-line expense | ~12 (4 screens) | 3–4 (one sheet) |
| Restaurant photo, items read correctly | ~4 of 14 (app showed 1 item, ₹1.00) | 14 of 14, totals exact |
| Scan time | ~3 s (wrong) | 1–5 s, works offline after first use |
| First-scan model download on live site | stalled at ~50 KB/s | 2–4 MB/s with fallback |
| Unfair-split causes handled | equal / manual only | 6 causes handled (exclusions, diet tags, count, charge rules, coupons, disputes, pass the phone) |
| Following up for money | manual | one-tap WhatsApp asks and overdue reminders |
| Automated tests | 8 | 70 |

## 11. Limitations and next steps

- Not yet verified on physical phones (voice input, live camera, haptics); see the checklist in section 13.
- The first scan needs about 35 MB of downloads.
- OCR still makes occasional single-letter mistakes; users fix them on the review screen.
- Voice input depends on the browser's speech recognition (hidden where unsupported).
- No dark mode yet.
- Friends can't claim items remotely from a shared link (would need a small backend).
- Push notifications for reminders would need a server.

## 12. Screenshot index (`docs/screens/`)

| File | Caption |
|---|---|
| `onboarding-avatar.png` | Onboarding: pick your avatar (generated faces, customise, or photo) |
| `home.png` | Home: what you owe or are owed, recent bills, groups |
| `quick-add-sentence.png` | Quick Add filled from the sentence "Uber 640 with Rohit and Aman" |
| `quick-add-saved.png` | Saved: per-person amounts with WhatsApp buttons |
| `scan-real-restaurant-bill.png` | Real restaurant photo read on the phone: 14 items, ₹4,770, Split Tax toggle |
| `scan-result.png` | Printed receipt read on the phone |
| `assign.png` | Who had what: avatar chips per item, veg friend left out automatically |
| `split-by-count.png` | Split by count: 6 butter naan split 2/2/1/1 |
| `pass-the-phone.png` | Pass the phone: each person taps what they had |
| `summary-whatsapp.png` | Bill summary after saving, with WhatsApp asks |
| `settle-up.png` | Settle up: fewest payments, Remind, UPI, mark paid |
| `shared-link.png` | What a friend sees when opening a shared link |
| `wrapped-intro.png` | Monthly Wrapped story |
| `wrapped-card.png` | Wrapped share card |
| `../dashboard-desktop.png` | Desktop layout |
| `demo-tour-step.png` | Guided demo: spotlight on the automatic veg exclusion |



## 14. Glossary

- **OCR**: optical character recognition, reading text from an image.
- **PP-OCRv5**: the latest PaddleOCR model family by Baidu's PaddlePaddle team.
- **ONNX Runtime Web**: runs AI models inside the browser with WebAssembly.
- **PWA**: progressive web app, a website that can be installed and used offline.
- **UPI**: India's instant payment system.
- **Paise**: 1/100 of a rupee; all money is computed in paise so totals are exact.
