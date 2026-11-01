# SplitSmart redesign: bill-first, fair splits

Date: 2026-11-01 · Status: approved

## Goal

Rebuild SplitSmart's UI to match the reference "bill split" mobile design (lavender/peach gradient, white cards, blue `#4353E6`, illustrated avatars, torn-receipt edges, floating bottom nav), add a full desktop layout, and solve the hostel fairness problem: people should pay for what they actually had, without awkward arguments.

## Decisions

| Topic | Decision |
|---|---|
| Model | Hybrid: bills are primary; friends are chosen per bill; groups are optional presets that keep running balances and settle-up |
| Platform | Mobile pixel-match plus a full desktop layout (≥1024 px) |
| Stack | Vanilla ES modules, no build step, `dist/` deployed to Netlify unchanged |
| Locale | ₹ and UPI kept; avatars generated in code (illustrated faces on blue/yellow/coral) |
| Sharing | Bill summary compressed into the URL hash; read-only page with "Import"; native share sheet |
| Claiming | Pass-the-phone mode on one device; links are read-only |
| Existing features | All kept (four split modes, insights, target, recurring, JSON/CSV export, UPI/QR, OCR, categorization) and reorganised |

## Architecture

```
dist/
  index.html, style.css (tokens + components), sw.js, manifest.json
  core.js            pure money engine (existing, extended)
  fair.js            splitBill, dietary rules, rounding (pure)
  parse.js           parseReceipt (moved), charge detection, parseFoodApp
  share.js           encode/decode bill <-> URL-safe string (pure)
  store.js           versioned storage v2, migration from v1, recovery, undo stack
  router.js          hash router (#/home, #/scan, #/bill/:id/items, ...)
  ui/                components: avatar, card, button, toast, sheet, nav
  views/             home, scan, items, assign, pass, summary, shared, friends,
                     edit, groups, history, insights, settings, onboarding
  app.js             bootstraps store, router, layout
```

Pure modules (`core`, `fair`, `parse`, `share`, store migration) are unit-tested with `node --test`. Views render HTML strings with `esc()` and use event delegation, as the current app does.

## Data model (storage key `splitsmart-v2`)

```js
{
  version: 2,
  meId,
  people: [{ id, name, avatarSeed, upi, tags: ["veg"|"no-egg"|"no-alcohol"] }],
  groups: [{ id, name, memberIds, target, recurring: [...], createdAt }],
  bills: [{
    id, title, merchant, date, time, icon, payerId, participants: [ids],
    groupId|null, mode: "itemized"|"equal"|"exact"|"percent"|"shares",
    items: [{ id, qty, name, price, portions: {pid: weight}, autoExcluded: [pid],
              disputed: bool, low: bool }],
    charges: [{ id, kind, label, amount, rule, personId }],
    custom: {pid: number},            // exact/percent/shares modes
    total, roundTo: 0|1|5|10, category, status: "draft"|"final", createdAt
  }],
  settlements: [{ id, groupId|null, from, to, amount, date }],
  prefs: { ignoreUnder: 0, lastBackup, onboarded },
}
```

Money is stored in rupees in the data and converted to integer paise inside the engine, as the current app does.

### Migration from v1

- Each v1 group member becomes a person. Members are deduplicated only within a group, never across groups.
- Each v1 expense becomes a final bill with `groupId`.
  - `assigned` lists become portions of weight 1.
  - The difference between the item subtotal and the total becomes a single `proportional` "other" charge, so the split stays identical.
  - Non-itemized expenses keep their mode and `custom`.
- v1 settlements are kept.
- `splitsmart-v1` is kept untouched as a backup.
- The first person in the first group is offered as "me" during onboarding.

### Robustness

- Corrupt JSON: the raw data is saved to `splitsmart-corrupt-<ts>` and the app starts empty, with a banner offering a download.
- Every write is checked for quota errors and shows a warning toast.
- Imports are schema-validated, and an invalid file is rejected with a reason.
- Undo stack: every destructive action stores a snapshot, and the toast shows *Undo* for 6 seconds.
- Confirmation is required before Delete All, group deletion and import-overwrite.
- A backup reminder appears 14 days after `lastBackup` if there are any bills.

## Fairness engine: `splitBill(bill, people) -> { shares, lines, disputed, unclaimed }`

The result has these parts:

- `shares`: `{pid: paise}`. The values add up to `money(bill.total)` exactly.
- `lines[pid]`: a breakdown for each person, `{items: [{name, qty, amount}], charges: [{label, amount}], rounding}`.

Steps:

1. **Items.** `amount = money(qty*price)`.
   - Disputed items go to the payer and count towards `disputed`.
   - Items with no positive weights (unclaimed) are split equally among the participants and count towards `unclaimed`.
   - Otherwise the amount is `allocate(amount, weights)`.
2. **Item subtotals per person** are the base for proportional charges.
3. **Charges.** Each charge is allocated by its rule:
   - `equal`: weight 1 for each participant with item subtotal > 0, or all participants if nobody has one.
   - `proportional`: weighted by item subtotals.
   - `payer`: the whole amount goes to the payer.
   - `person`: the whole amount goes to `personId`.

   Discounts are negative amounts.
4. **Reconcile.** `money(total) − (items + charges)` is allocated proportionally, so OCR totals stay authoritative. This is shown as an "Adjustment" line.
5. **Rounding** (`roundTo > 0`): each non-payer share is rounded to the nearest step, and the payer's share = total − sum of the others.
6. **Default rules by kind:** delivery, packaging and platform → `equal`; tax, service and tip → `proportional`; discount → `proportional`; other → `proportional`.

The **Split Tax toggle** sets the rule on tax-kind charges: `proportional` when on, `payer` when off.

Non-itemized modes (`equal`, `exact`, `percent`, `shares`) reuse the existing `splitExpense` logic.

### Dietary rules

- `DIET = { veg: [chicken, mutton, fish, prawn, egg, omelette, keema, beef, pork, bacon, ham, meat, kebab (non-veg qualifiers)], "no-egg": [egg, omelette, mayo], "no-alcohol": [beer, wine, whisky, vodka, rum, gin, cocktail, pint, breezer] }`.
- `applyDiet(item, people)` sets weight 0 for tagged people when the name matches on word boundaries, case-insensitive, and records them in `autoExcluded`.
- "Veg" names (paneer, veg, dal…) override the non-veg match only when the word "veg" is present: "veg biryani" doesn't exclude, "chicken biryani" does.
- The UI shows "Aman excluded · veg — Undo" for each item.

### Settlement

`balances()` now takes final bills plus settlements. `settle(b, ignoreUnder)` drops people whose |balance| < `ignoreUnder` before it searches for payments. Home shows an "unpaid" total: the amount "me" owes, summed across groups, and across standalone bills where someone else paid.

## Parsing

- `parseReceipt` gains charge detection: lines matching delivery, packaging, platform/convenience fee, GST/CGST/SGST/tax, service charge, tip and discount/coupon/offer become `charges` instead of items.
- `parseFoodApp(text)` handles Swiggy/Zomato screenshots:
  - Item lines like `1 x Paneer Tikka ₹240` or `Paneer Tikka x 2 ₹480`.
  - A "Bill details"/"Bill summary" block containing item total, fees, taxes and discounts.
  - "To pay"/"Grand total"/"Paid" as the total.
- `detectSource(text)` picks the parser using keywords (swiggy, zomato, "item total", "to pay").

## Sharing (`share.js`)

- The link encodes a compact bill payload: title, merchant, date, people names and avatar seeds, items with portions, charges, total, and computed shares.
- The JSON is compressed with `CompressionStream('deflate-raw')` and base64url-encoded, then placed at `#/s/<payload>`. Where `CompressionStream` isn't available, it falls back to plain base64url.
- Decoding validates the payload's shape. A bad link shows a friendly error.
- "Import" adds the bill as a standalone bill and maps people to existing friends by exact name match, otherwise creating new ones.

## Screens

Visual tokens:

- Background gradient: `linear-gradient(160deg,#E4E6F7 0%,#F3E5EA 55%,#F7EFE0 100%)`.
- Surfaces: phone surface `#F5F5F8`, cards `#FFF` with radius 28 (inner rows 20).
- Colours: primary `#4353E6`, ink `#1B1B1F`, muted `#8A8A93`, line `#ECECF1`, danger `#E5484D`, warning `#F5A524`, success `#2E9E6A`.
- Avatar backgrounds: `#2F3A8F`, `#F7C948`, `#F26B4F`, `#4353E6`.
- Type: Plus Jakarta Sans 400/500/600, base 15px. Titles are 22px/500.
- Pill buttons are 48px tall; circular icon buttons are 44px.
- The torn edge is an SVG zig-zag mask on bill cards.

Mobile screens, by route:

- **Home `#/home`**: top bar (menu, search, bell). Welcome card with the unpaid total and *Settle up*. Recent Bills (avatar stack, "Sharing: N Persons"). Groups strip. Floating nav: Home · Scan (blue circle) · History.
- **Scan `#/scan`**: camera (`getUserMedia`) with the corner frame, or a file input as fallback. Gallery, shutter and torch buttons.
  - Before OCR: crop, rotate and enhance. Rotation is applied to the canvas sent to OCR.
  - Result card: merchant, place, total, date, and the blue Split Tax panel with a toggle.
  - Paste text and a sample bill are offered as alternatives.
- **Recognized Items `#/bill/:id/items`**: editable qty/name/price rows, low-confidence highlight, a Charges section (kind select, amount), and a live total check (✓ or "₹X off"). *Continue*.
- **Assign `#/bill/:id/assign`**: header title with an Equal/Itemized switch.
  - Each item row has avatar chips; ▾ opens a sheet with a qty stepper, "remove" and a dispute flag. A dashed + adds a person.
  - "Everyone" is the default. Diet hints appear on items.
  - Totals card. *Pass the phone* and *Confirm Result*.
- **Pass `#/bill/:id/pass`**: a "Hand the phone to {name}" interstitial. The person taps items they had (with a qty stepper for multi-quantity items) while an unclaimed ₹ counter runs. Then the next person, then a recap that splits unclaimed items equally.
- **Summary `#/bill/:id/summary`**: a card per person (total, items, expandable Bill Details listing charges, adjustment and rounding), a disputed tray, rounding selector, payer selector, *Save Bill*, *Copy Link* and Share.
- **Shared `#/s/:payload`**: a read-only summary and *Import*.
- **Friends `#/friends`**: A–Z sections, add/edit sheet (name, UPI, diet tags), Delete All (confirmation required).
- **Bill Edit `#/bill/:id/edit`**: the reference's form (title, date and time chips, qty/name/price rows, Add Item, totals).
- **Groups `#/groups`, `#/group/:id`**: members, balances, minimum settle-up with UPI/QR and mark paid, target, recurring.
- **History `#/history`**: search and filter over bills and settlements.
- **Insights `#/insights`**: category, person and month charts.
- **Settings `#/settings`**: profile, import/export JSON/CSV, ignore-under threshold, backup.
- **Onboarding**: your name, then add friends (with diet tags), then a "Try a sample bill" option.

**Desktop ≥1024 px:** a 240 px left rail (logo, nav, scan CTA) on the gradient, then the main content column (max 720), then a 360 px right panel showing the live split for the selected or editing bill (on Home: unpaid summary and group balances). The bill flow uses two panes: items on the left, per-person totals on the right.

**Accessibility:** focus rings, aria labels on icon buttons, dialogs that trap focus, Escape closes sheets, and keyboard shortcuts N (new bill) and S (scan) are kept. Text contrast is at least 4.5:1 (muted text `#6F6F78` on white).

## Testing

- `tests/fair.test.js`:
  - Excluding someone means they pay 0 for that item.
  - Quantity weights.
  - Equal delivery fee only among people who ordered.
  - Proportional tax.
  - Coupon credited to its owner.
  - Disputed items go to the payer.
  - Unclaimed items are split equally.
  - Rounding: the payer absorbs the difference and the sum still equals the total.
  - Reconcile adjustment.
  - Property test: 500 random bills where the shares add up to the total and are never charged to someone with weight 0 and no charges.
- `tests/diet.test.js`: matching on word boundaries, "veg biryani" not excluded.
- `tests/parse.test.js`: charge detection; Swiggy and Zomato samples.
- `tests/share.test.js`: round trip; corrupt input rejected.
- `tests/store.test.js`: v1→v2 migration keeps the split amounts identical; corrupt recovery; import validation.
- Existing `core.test.js` stays green.
- Manual checks in the browser at 360, 768 and 1440 px for each phase.

## Out of scope

Backend, accounts, remote claim merging, multi-currency, push notifications, referral/"buzz level" marketing cards.
