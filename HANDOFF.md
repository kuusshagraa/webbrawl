# Handoff: SplitSmart (for Codex or the next developer)

Read this first. It explains what exists, how it is built, what is in progress and exactly what to do next. Keep it updated when you finish a task.

## What the product is

SplitSmart is a mobile-first, client-only web app for splitting bills with friends (Indian hostel / flatmate use case, ₹ and UPI). Scan a receipt or add an expense, choose who had what, settle up with the fewest payments. No backend: data lives in the browser's `localStorage`. Live at https://super-lebkuchen-c44ad5.netlify.app (Netlify auto-deploys `main`; every PR gets a deploy preview).

## Ground rules

- **No build step.** Plain ES modules in `dist/`, served as static files. Don't add a bundler or framework.
- **Match the existing code style:** small pure modules for logic, views as functions returning HTML strings, `data-act` event delegation. Escape all user text with `esc()`.
- **Money is integer paise** inside the engine (`money()` in `core.js`). Splits must always add up exactly to the total; there is a property test for this.
- **Tests:** `npm test` (Node's built-in test runner, `tests/*.test.js`). Add tests for every pure function. Currently 57 tests pass.
- **Run locally:** `python3 -m http.server 8001 --directory dist`, then open http://localhost:8001. Use a new port or a private window to see onboarding from scratch.
- **Ship:** branch → PR to `main` (repo `kuusshagraa/webbrawl`) → wait for the Netlify deploy preview check to pass → merge. Commit messages end with a `Co-Authored-By` line.
- Design language: lavender/peach gradient background, white cards, primary blue `#4353E6`, Plus Jakarta Sans, torn-receipt card edges, illustrated avatars. Tokens are at the top of `dist/style.css`.

## Code map (`dist/`)

| File | What it does |
|---|---|
| `core.js` | `money`, `fmt`, `allocate` (largest remainder), `settle` (minimum payments), legacy `splitExpense` |
| `fair.js` | `splitBill` fair-split engine (exclusions, diet tags, split by count, per-charge rules, disputes, rounding), `validateBill`, `ledger`, `suggest`, diet rules |
| `parse.js` | `parseText`: receipt/food-app text → items, charges, total, merchant, date |
| `layout.js` | `parseWords`: OCR words with positions → rows (tilt-corrected), fused-number splitting, wrapped names → `parseText` |
| `ocr.js` | PaddleOCR PP-OCRv5 in the browser (onnxruntime-web from jsDelivr, models from mirrors with stall detection, cached), Tesseract fallback, image rotate/crop/enhance, category model |
| `quick.js` | **New:** `parseQuick` sentence parser ("Uber 640 with Rohit and Aman"), `inferCategory`, `templates` (repeat suggestions) |
| `share.js` | Encodes a bill into a URL (`#/s/<payload>`) and back |
| `store.js` | v2 storage, v1 migration, corruption recovery, backups, monthly recurrence, selectors |
| `model.js` | Domain helpers: `makeBill`, `makeItem`, `makePerson`, `tidyBill`, ledgers, share text, CSV, sample bill |
| `ui.js` | `esc`, formatting, avatars, toasts with Undo, stacked sheets with focus trap, `confirmDialog`, `commit()` (mutate + save + render + optional undo), `enter()` for one-time animations |
| `app.js` | Hash router, responsive shell (mobile tab bar / desktop rail + side panel), event delegation (`data-act`, `data-in`, `data-ch`, `data-submit`, `data-go`), focus/scroll preservation across re-renders |
| `views/*.js` | Screens: onboarding, home, scan, bill (items/assign/summary), pass (pass-the-phone), shared, people (friends + avatar studio), groups (groups/settle/UPI), more (history/insights/settings) |
| `sw.js` | Service worker: network-first for app files, cache-first for CDN; OCR models are cached separately by `ocr.js` |
| `models/` | PP-OCRv5 ONNX models (also served from jsDelivr pinned to commit `b8c84bb`) |

Specs: `docs/superpowers/specs/2026-11-01-splitsmart-redesign-design.md` (main app) and `docs/superpowers/specs/2026-11-01-quick-add-delight-design.md` (current work). Read the second one before continuing.

## Current work: "Quick Add + delight" (branch `quick-add`)

Goal: a one-line expense (e.g. "I paid ₹640 for Uber") should take 3–4 taps instead of ~12, plus delight features. The user approved: centre **+** opens a Quick Add sheet (scan inside it), sentence + voice input, keep the scan flow's steps, and all four delight features.

### Status

- [x] Spec written and committed
- [x] `dist/quick.js` sentence parser + `tests/quick.test.js` (8 tests passing)
- [ ] Quick Add sheet UI (`views/quick.js`), wired to the tab bar **+**, desktop rail, Home and keyboard `N`
- [ ] Voice input (Web Speech API, `lang = "en-IN"`, hide the mic when unsupported)
- [ ] Smart paste: one paste box that routes to the receipt parser or the sentence parser
- [ ] WhatsApp nudges (`dist/nudge.js` + optional phone number on people)
- [ ] Payment reminders in the bell (money owed to me for 3+ days)
- [ ] Motion: View Transitions for route changes, spring sheets, count-up totals, receipt "print", confetti, Android haptics
- [ ] Monthly Wrapped (`dist/wrapped.js` stats + story view + share image)
- [ ] Browser test in Chromium and WebKit, overflow check at 360/768/1024/1440 px, update README, PR, merge, check the live site

### How to build each remaining piece

**Quick Add sheet (`views/quick.js`)**
- Open it with `openSheet(render, { label: "Add expense" })` from `ui.js`. Keep a module-level draft: `{ text, amount, title, category, participants, payerId, split: "equal"|"owe", date, groupId }`.
- The smart field (`data-in`) runs `parseQuick(text, { people, groups, meId, today: todayISO(), recentGroupId })` and copies non-empty results into the draft. Show `unknown` names as "Add Priya?" chips that call `makePerson`.
- Default participants: the last quick bill's participants (most recent bill with `source: "quick"`), else empty. Show recent people sorted by how often they appear in bills.
- Custom keypad: buttons 0–9, ".", ⌫, max 2 decimals; amount is a string while typing (see `num()` in `views/bill.js` for why).
- Save: build with `makeBill({ source: "quick", title, category, mode: split === "owe" ? "exact" : "equal", participants, payerId, total: amount, status: "final", items: [], totalSource: "receipt" })`. For "owe" use `mode: "exact"` with `custom = { [eachParticipant]: share }` where shares are an equal split of the total over the others. Run `validateBill` first. If participants exactly equal a group's `memberIds`, set `groupId`.
- After save, re-render the sheet as a success state: animated tick, one line per person who owes ("Rohit owes you ₹213.33") with a WhatsApp button, and Done.
- Tab bar: in `app.js` `tabbar()`, change the centre link to a button `data-act="quick-open"` with the `plus` icon. Desktop rail: a "+ Add expense" button above "Scan a bill". Keyboard `N` → open the sheet (currently it creates a manual bill via `newManualBill`).

**Voice**
- `const SR = window.SpeechRecognition || window.webkitSpeechRecognition`. If missing, don't render the mic. `interimResults = true`, write the transcript into the smart field and run the parser. Pulse animation while listening. Handle `onerror` with a toast.

**Smart paste** (`views/scan.js`, `scan-paste-go`): if the text has 2+ lines ending in a money amount, use `parseText` (receipt flow, existing). Otherwise use `parseQuick` and open the Quick Add sheet prefilled.

**WhatsApp (`dist/nudge.js`, pure, tested)**
- `nudgeText({ name, amount, billTitle, upi, link })` → "Hey Rohit! Your share for Uber 🚗 is ₹213.33. You can pay me at jelly@okaxis. Breakdown: <link>". Leave out the UPI sentence if there is no UPI ID.
- `waLink(text, phone)` → `https://wa.me/91XXXXXXXXXX?text=...` when there is a 10-digit Indian number, else `https://wa.me/?text=...`.
- Add an optional "Phone (for WhatsApp)" field to the person editor in `views/people.js` (validate 10 digits, allow +91).
- Entry points: Quick Add success, each person card in the summary (`personCards` in `views/bill.js`, only when that person owes the current user), Settle up rows ("Remind" next to UPI/Paid), reminder notifications. The bill link comes from `shareUrl(bill)` in `model.js`.

**Reminders**: in `notifications()` (`views/home.js`), for each suggested payment where `to === meId`, find the oldest final bill in that ledger where the person owes me and which is newer than their last settlement with me. If it's 3+ days old, add "Rohit hasn't paid ₹213 for 3 days" with a Remind (WhatsApp) action.

**Motion**
- In `app.js` `route()`, when the path changes and `document.startViewTransition` exists and reduced motion is off, wrap `render()` in it. Set `document.documentElement.dataset.dir = "back"|"forward"` from the history depth so CSS can slide the right way. Add `::view-transition-old(root)` / `::view-transition-new(root)` keyframes in `style.css`.
- Count-up: a helper in `ui.js` that animates elements with `data-count="<paise>"` from 0 to the value over ~600 ms once (use `enter()` so it doesn't replay on re-render).
- Receipt print on the summary right after saving: a `.printing` class with a `clip-path` reveal from top to bottom.
- Confetti: reuse the onboarding confetti markup and CSS as a helper `confetti()` in `ui.js`; trigger on the first saved bill and when the user's last debt is settled (`myPosition().owe === 0 && owed === 0` after recording a payment).
- Haptics: `navigator.vibrate?.(8)` on keypad presses and saves.
- Everything must respect `prefers-reduced-motion` (a global rule already exists at the bottom of `style.css`).

**Wrapped (`dist/wrapped.js` pure + `views/wrapped.js`)**
- `monthStats(state, "2026-10")` → `{ total, count, myShare, topCategory, topPayer, mostSplitItem, dietSaved }`. `dietSaved` = for itemised bills, my would-be equal share of items where I was in `autoExcluded`. Test it.
- Story view at route `#/wrapped/:month`: full-screen slides with progress bars at the top, tap right/left to move, auto-advance every 5 s. The last slide is a share card drawn on a `<canvas>`, shared with `navigator.share({ files })` when available, else downloaded.
- Home card during days 1–7 of a month if last month has 3+ final bills; an entry in Insights.

## Known limitations

- Not yet tested on a physical phone. Live camera needs HTTPS (the Netlify site has it).
- The first scan downloads about 35 MB (OCR engine + models), cached afterwards.
- Dark mode is not built. Remote item claiming through links would need a backend (out of scope).
