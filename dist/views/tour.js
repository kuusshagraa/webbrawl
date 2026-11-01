// Guided demo: loads sample data in a sandbox and walks a reviewer through
// every feature with a spotlight and a short explanation per step.
import { S, inDemo, enterDemo, exitDemo, todayISO } from "../store.js";
import { buildDemo } from "../demo.js";
import { prevMonth } from "../wrapped.js";
import { shareUrl } from "../model.js";
import { esc, icon, go, closeSheet, refresh, openSheet } from "../ui.js";
import { openQuick, quickActions } from "./quick.js";
import { editPerson } from "./people.js";

const T = { active: false, i: 0, busy: false, token: 0 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const billId = (title, status = "final") => S().bills.find((b) => b.title === title && b.status === status)?.id;
const notesSheet = () => document.querySelector('[data-act="notifications"]')?.click();

async function typeInto(selector, text) {
  let el = document.querySelector(selector);
  if (!el) return;
  el.focus({ preventScroll: true });
  for (let i = 1; i <= text.length; i++) {
    el = document.querySelector(selector);
    if (!el || !T.active) return;
    el.value = text.slice(0, i);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(38);
  }
  el.blur();
}

// Each step: optional route, optional action, the element to spotlight, and copy.
const STEPS = [
  { title: "Welcome to the SplitSmart demo 👋", body: "This is a guided tour with sample data: Aarav, four friends, a hostel group and a Goa trip. Your own data is untouched, and you can exit any time. Tap <b>Next</b> or use the → key.", route: "home" },
  { route: "home", target: ".welcome", title: "Your balance at a glance", body: "Home shows what you owe or are owed across every group and bill, with one tap to settle up." },
  { route: "home", target: ".bill-card", title: "Recent bills", body: "Each bill shows its total, who shared it and how many people. Tap one to see the full breakdown." },
  { route: "home", target: ".tab.add, .rail-scan", title: "Add an expense in seconds", body: "The <b>+</b> button is the fastest way in: about 3–4 taps for a one-line expense like a cab, instead of going through a receipt." },
  { route: "home", action: async () => { openQuick(); await frame(); await sleep(250); await typeInto('[data-f="qa-text"]', "Dinner 1200 with Aman and Kabir"); }, target: ".qa-smart", sheet: true, title: "Just type it, or say it 🎙", body: "Write a sentence and everything fills in: amount, what it was for, the right icon and the people. The mic does the same by voice. Try “Rohit paid 1.2k dinner with everyone” or “auto 80 for Aman”." },
  { target: ".qa-people", sheet: true, title: "Faces, not forms", body: "The people you split with most are one tap away. Chips below change who paid, split equally or “they owe all”, and the date." },
  { action: async () => { quickActions["qa-save"](); await sleep(400); }, target: ".qa-owes", sheet: true, title: "Saved, now get paid back", body: "Each person gets a green <b>WhatsApp</b> button with a ready message: their share, your UPI ID and a link to the breakdown. No awkward chasing." },
  { route: "scan?demo=1", target: ".tools, .read-card, .result-card", title: "Scan a real receipt", body: "The scanner reads receipts and Swiggy/Zomato screenshots <b>on the phone</b> with PaddleOCR. Nothing is uploaded. We've loaded a sample bill: tap <b>Read receipt</b> to try it (the first scan downloads the reader once, then it works offline). Rotate, crop and enhance are here too." },
  { route: () => `bill/${billId("Gourmet Coffee", "draft")}/items`, target: ".edit-row.low", title: "Check what was read", body: "Every item, quantity and price can be edited. Lines the scanner wasn't sure about are highlighted, and taxes, fees and discounts are kept separate." },
  { target: ".totals", title: "Totals always add up", body: "The app compares the items with the printed total and tells you if anything's off, so mistakes get caught before anyone pays." },
  { route: () => `bill/${billId("Hostel Night Order")}/assign`, target: ".diet-hint", title: "Fair by default 🌱", body: "Aman is tagged veg and Kabir doesn't drink, so they're left out of the chicken and the beer automatically. One tap on <b>Include</b> undoes it." },
  { target: ".assign-row:nth-child(3)", title: "Split by count", body: "Had 2 of the 6 naans? Each person's count is tracked (2/2/1/1 here), and any leftovers are split equally." },
  { target: ".charge-rule", title: "A fair rule for every charge", body: "Delivery and packaging are shared equally by the people who ordered; tax follows what each person ordered. Each rule can be changed, or a coupon credited to its owner." },
  { target: '[data-act="pass-start"]', title: "Pass the phone", body: "Not sure who ate what? Hand the phone around the table: each person taps their own items, and whatever nobody claims is split equally." },
  { route: () => `bill/${billId("Pizza Friday")}`, target: ".tray", title: "Disputes without drama", body: "Someone says they didn't have the garlic bread? It's held with the payer until it's sorted out, and everything else is final." },
  { target: ".person-total:nth-child(2)", title: "Everyone's share, itemised", body: "Each person sees exactly what they had, plus their part of every tax and fee under <b>Bill Details</b>. The green button asks them on WhatsApp." },
  { target: ".options", title: "Flexible when you need it", body: "Switch to equal, exact amounts, percentages or shares; round to ₹1/₹5/₹10 (the payer covers the difference); file it in a group; set a category." },
  { route: "settle", target: ".tx", title: "Settle up in the fewest payments", body: "SplitSmart finds the minimum number of payments. Pay with a <b>UPI</b> link or QR code, send a <b>Remind</b> on WhatsApp, and mark it paid. Settle everything and there's confetti 🎉." },
  { route: "home", action: async () => { notesSheet(); await sleep(300); }, target: ".notes", sheet: true, title: "Gentle reminders", body: "The bell lists drafts to finish, disputed items and anyone who hasn't paid for 3+ days, with a one-tap WhatsApp reminder." },
  { route: "group/demo-hostel", target: ".members-row", title: "Groups for flatmates and trips", body: "Each group keeps a running balance across bills, a monthly spending target and repeating bills like Wi-Fi or rent." },
  { route: "friends", target: ".contacts", title: "Friends and food preferences", body: "Tag who's veg, no egg or no alcohol once, and it applies to every bill. Add a UPI ID and phone number for one-tap payments and WhatsApp." },
  { route: "friends", action: async () => { editPerson(S().meId); await sleep(300); }, target: ".studio", sheet: true, title: "The avatar studio", body: "During onboarding everyone picks a cartoon face (or a photo), customising hair, skin, colours and extras, so friends spot each other quickly on a bill." },
  { route: () => `wrapped/${prevMonth(todayISO())}`, target: ".wr-body", title: "Monthly Wrapped ✨", body: "Every month gets a story: total shared, top category, the group's “ATM”, the crowd-favourite dish and what your food tags saved you, ending in a shareable image." },
  { action: async () => go("s/" + (await shareUrl(S().bills.find((b) => b.title === "Hostel Night Order"))).split("#/s/")[1]), wait: 900, target: ".person-list", title: "Share links, no sign-up", body: "<b>Copy Link</b> puts the whole bill into a link. Friends see this read-only breakdown and can save it to their own app. No account or server needed." },
  { route: "settings", target: ".list-card:nth-of-type(2), .list-card", title: "Private and portable", body: "Everything stays on the device. Back up to a file, restore it, or export bills as CSV. Old data is migrated automatically." },
  { route: "home", title: "That's the tour! 🎉", body: "You've seen every feature. Keep exploring the demo freely (tap the <b>Demo</b> pill to restart the tour), or exit to start fresh.", finish: true },
];

function find(selector) {
  if (!selector) return null;
  for (let el of document.querySelectorAll(selector)) {
    let r = el.getBoundingClientRect();
    if (r.width && r.height && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

function draw(scroll = false) {
  let root = document.getElementById("tour");
  if (!root) return;
  if (!T.active) {
    root.innerHTML = inDemo() ? `<div class="demo-pill" role="region" aria-label="Demo mode"><b>Demo</b><button data-act="tour-start">${icon("hand")} Tour</button><button data-act="demo-exit">Exit</button></div>` : "";
    return;
  }
  let st = STEPS[T.i],
    el = T.busy ? null : find(st.target);
  if (el && scroll) el.scrollIntoView({ block: "center", behavior: "instant" });
  let r = el?.getBoundingClientRect(),
    vw = innerWidth,
    vh = innerHeight,
    pad = 8,
    spot = r ? `<div class="tour-spot" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></div>` : `<div class="tour-dim"></div>`,
    below = r ? r.top + r.height / 2 < vh / 2 : true,
    w = Math.min(380, vw - 24),
    left = r ? Math.max(12, Math.min(vw - w - 12, r.left + r.width / 2 - w / 2)) : (vw - w) / 2,
    pos = !r ? `top:50%;transform:translateY(-50%)` : below ? `top:${Math.min(vh - 220, r.bottom + pad + 12)}px` : `bottom:${Math.min(vh - 220, vh - r.top + pad + 12)}px`;
  if (r && vw < 640) pos = below ? `bottom:calc(14px + var(--host-inset, 0px))` : `top:14px`;
  root.innerHTML = `${spot}<section class="tour-card" role="dialog" aria-live="polite" aria-label="Demo step ${T.i + 1}" style="left:${left}px;width:${w}px;${pos}">
    <div class="tour-top"><span class="tour-count">${T.i + 1} / ${STEPS.length}</span><button class="tour-skip" data-act="tour-stop">Skip tour</button></div>
    <h3>${st.title}</h3><p>${st.body}</p>
    ${T.busy ? `<div class="tour-progress"><i></i></div>` : ""}
    <div class="tour-actions">${st.finish ? `<button class="btn outline sm" data-act="demo-exit">Exit demo</button><button class="btn primary sm" data-act="tour-stop">Keep exploring</button>` : `${T.i ? `<button class="btn ghost sm" data-act="tour-prev">${icon("back")} Back</button>` : `<span></span>`}<button class="btn primary sm" data-act="tour-next" ${T.busy ? "disabled" : ""}>Next ${icon("next")}</button>`}</div>
  </section>`;
}

async function show(i) {
  let token = ++T.token;
  T.i = Math.max(0, Math.min(STEPS.length - 1, i));
  T.busy = true;
  draw();
  let st = STEPS[T.i];
  if (!st.sheet || st.route) closeSheet(true);
  if (st.route) {
    let r = typeof st.route === "function" ? st.route() : st.route;
    if (location.hash !== "#/" + r) go(r);
  }
  await frame();
  try {
    await st.action?.();
  } catch (e) {
    console.warn("Tour step action failed", e);
  }
  await sleep(st.wait ?? 450);
  if (token !== T.token) return;
  T.busy = false;
  draw(true);
}

export function startTour(i = 0) {
  T.active = true;
  show(i);
}
export function stopTour() {
  T.active = false;
  T.token++;
  draw();
}
export const tourActive = () => T.active;
// Called after every app render so the spotlight follows the content.
export function tourRefresh() {
  if (!T.busy) draw();
}
export function tourKey(e) {
  if (!T.active) return false;
  if (e.key === "ArrowRight" && !T.busy) show(T.i + 1);
  else if (e.key === "ArrowLeft" && !T.busy) show(T.i - 1);
  else if (e.key === "Escape") stopTour();
  else return false;
  return true;
}

export async function startDemo() {
  enterDemo(buildDemo(todayISO()));
  closeSheet(true);
  go("home", true);
  refresh();
  await frame();
  startTour(0);
}
export function leaveDemo() {
  stopTour();
  exitDemo();
  location.hash = "#/home";
  location.reload();
}

export const tourActions = {
  "demo-start": () => startDemo(),
  "demo-exit": () => leaveDemo(),
  "tour-start": () => startTour(0),
  "tour-stop": () => stopTour(),
  "tour-next": () => !T.busy && show(T.i + 1),
  "tour-prev": () => !T.busy && show(T.i - 1),
};
addEventListener("resize", () => T.active && !T.busy && draw());
addEventListener("scroll", () => T.active && !T.busy && draw(), { passive: true });
