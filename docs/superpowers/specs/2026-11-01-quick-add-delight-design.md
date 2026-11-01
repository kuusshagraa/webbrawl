# Quick Add, smart input and delight

Date: 2026-11-01 · Status: approved

## Problem
A one-line expense (Uber ₹640) took 4 screens and ~12 taps because every expense went through the itemised receipt flow.

## Decisions
- Centre "+" opens a Quick Add sheet; Scan and voice live inside it. Scan flow keeps every step.
- Sentence and voice entry parsed on device; voice via the Web Speech API (en-IN), hidden when unsupported.
- Delight: motion and transitions, WhatsApp nudges, monthly Wrapped, smart suggestions.

## Quick Add
Sheet with: smart sentence field + mic, suggestion chips, large amount with custom keypad, "what for" with inferred category icon, recent people (last used preselected, sorted by frequency), chips for payer, split (Equally / They owe all / Custom…) and date. Picking exactly a group's members files it in that group. Save stores a normal `mode: "equal"` bill (or `exact` for "They owe all"), then shows a success state with per-person WhatsApp buttons.

## Sentence grammar (`dist/quick.js`, pure)
- Amount: first number; `₹`, `rs`, `k` suffix (1.2k = 1200), commas.
- People: names after/around `with`, `and`, `,`, `&`; matched to people by first name or full name, case-insensitive, edit distance ≤ 1 for names of 4+ letters; group names and "everyone/all of us" expand to group members.
- Payer: `<name> paid`, `paid by <name>`; default me.
- They owe all: `for <name>` (not followed by food words), `<name> owes`.
- Date: today, yesterday, `on <weekday>`.
- Title: remaining words minus stop words; category from a keyword map.
- Output: `{ amount, title, category, peopleIds, payerId, split, date, unknown }` where `unknown` lists names not matched.

## Smart paste
One paste box: several money lines → receipt parser; otherwise → sentence parser → Quick Add prefilled.

## Motion
View Transitions API for route changes (forward/back direction), spring sheets, count-up totals, receipt "print" on the summary after save, confetti on first save and when the user's last debt is settled, `navigator.vibrate` taps on Android. All disabled under reduced motion.

## WhatsApp nudges (`dist/nudge.js`, pure)
Message: share for a bill, payer's UPI ID if set, link to the bill breakdown. `https://wa.me/<91phone>?text=` when the person has a phone number, else `https://wa.me/?text=`. Entry points: Quick Add success, summary person cards, Settle up "Remind", reminder notifications. Person editor gains an optional phone number.

## Wrapped (`dist/wrapped.js`, pure stats)
For a month: total shared, bill count, my share, top category, top payer ("Group ATM"), most-split item, diet-tag savings (my equal share of items I was auto-excluded from). Story view with tap-through slides and progress bars; share card rendered to a canvas and shared as an image. Home card in the first 7 days of a month when last month has ≥ 3 bills; always available in Insights.

## Smart suggestions
Templates from recent quick bills (same title + people), ranked by frequency and time of day; category inference; reminders for money owed to me that is 3+ days old since the oldest unsettled bill with that person.

## Testing
Unit tests for the sentence parser, nudge messages, Wrapped stats and reminders; browser runs for Quick Add (type, sentence, success, WhatsApp link), Wrapped and transitions in Chromium and WebKit; overflow check at 360–1440 px.
