import { store, S, bill, person, nameOf, groupOf, persist, newId, addMonth } from "../store.js";
import { splitBill, validateBill, itemWeights, CHARGE_KINDS, RULES, defaultRule, DIET } from "../fair.js";
import { tidyBill, makeItem, makeCharge, makePerson, billPeople, shareUrl, summaryText } from "../model.js";
import { session } from "../session.js";
import { CATEGORIES } from "../icons.js";
import { categorize } from "../ocr.js";
import { av, avStack, esc, icon, fmt, money, topbar, iconBtn, openSheet, closeSheet, sheetHead, refresh, commit, toast, go, back, confirmDialog, copyText, dateLabel, timeLabel, toggle, empty, plural, firstName, rupees, enter, confetti } from "../ui.js";
import { editPerson, dietBadges } from "./people.js";

/* ---------- helpers ---------- */

export function missing() {
  return `${topbar("Bill")}<div class="screen-body">${empty(`<div class="empty-art">${icon("receipt")}</div>`, "This bill isn't here anymore", "It may have been deleted or discarded.", `<button class="btn primary sm" data-go="home">Go home</button>`)}</div>`;
}
// Mutates a bill, keeps it consistent, saves and re-renders.
function edit(id, fn, { render = true, undo = null } = {}) {
  let b = bill(id);
  if (!b) return;
  if (!render) {
    fn(b);
    tidyBill(b);
    persist();
    return;
  }
  commit(() => {
    let x = bill(id);
    fn(x);
    tidyBill(x);
  }, undo);
}
// Keeps what the user typed (so "12." survives re-rendering mid-typing),
// minus currency marks. Invalid text is kept as-is and caught by validation.
const num = (v) => {
  let s = String(v).replace(/[₹,\s]/g, "");
  return s === "-" ? "" : s;
};
// Stored numbers render with 2 decimals; strings are mid-typing and stay as typed.
const show = (v) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : v ?? "");
const neg = (v) => (v === "" ? "" : "-" + String(v).replace(/^-/, ""));
const pos = (v) => String(v).replace(/^-/, "");
const dot = '<span class="dot-sep" aria-hidden="true"></span>';
const dateTime = (b) => [dateLabel(b.date), timeLabel(b.time)].filter(Boolean).join(dot);
const isMe = (id) => id === S().meId;
const whose = (id) => (isMe(id) ? "Your" : `${esc(person(id)?.name || "Someone")}’s`);
function ensureTitle(b) {
  if (!String(b.title).trim()) b.title = b.merchant?.trim() || `Bill on ${dateLabel(b.date, false) || "today"}`;
}
const editing = (id) => session.edit?.id === id;

function startEdit(id) {
  let b = bill(id);
  if (b?.status === "final" && !editing(id)) session.edit = { id, json: JSON.stringify(b) };
}
async function leaveEdit(id, fallback) {
  if (editing(id)) {
    let b = bill(id);
    if (b && JSON.stringify(b) !== session.edit.json) {
      let ok = await confirmDialog({ title: "Discard changes?", body: "Your edits to this bill won't be saved.", ok: "Discard", danger: true, cancel: "Keep editing" });
      if (!ok) return;
      let snap = JSON.parse(session.edit.json);
      commit((s) => {
        let i = s.bills.findIndex((x) => x.id === id);
        if (i >= 0) s.bills[i] = snap;
      });
    }
    session.edit = null;
    return go(`bill/${id}`, true);
  }
  back(fallback);
}

/* ---------- Recognized Items / Bill Edit ---------- */

export const Items = {
  title: "Recognized Items",
  render({ id }) {
    let b = bill(id);
    if (!b) return missing();
    let final = b.status === "final",
      bad = session.badFields,
      r = splitBill(b),
      photo = session.photos.get(id),
      receiptMode = b.totalSource === "receipt",
      mismatch = receiptMode && r.diff !== 0 && b.items.length;
    let rows = b.items
      .map(
        (it) => `<div class="edit-row ${it.low ? "low" : ""} ${bad.has("item:" + it.id) ? "err" : ""}">
        <label class="qty-box"><input data-f="q:${it.id}" data-in="item-field" data-k="qty" data-id="${it.id}" value="${esc(it.qty)}" inputmode="numeric" aria-label="Quantity"><span>x</span></label>
        <input class="name-box" data-f="n:${it.id}" data-in="item-name" data-ch="item-name-done" data-id="${it.id}" value="${esc(it.name)}" placeholder="Item Name" maxlength="80" aria-label="Item name">
        <label class="amt-box"><span>₹</span><input data-f="a:${it.id}" data-in="item-field" data-k="amount" data-id="${it.id}" value="${esc(show(it.amount))}" inputmode="decimal" placeholder="0.00" aria-label="Price for ${esc(it.name || "item")}"></label>
        <button class="icon-btn plain sm" data-act="item-remove" data-id="${it.id}" aria-label="Remove ${esc(it.name || "item")}">${icon("trash")}</button>
        ${it.low ? `<small class="row-note">${icon("alert")} The scan wasn't sure about this line. Please check it.</small>` : ""}
      </div>`,
      )
      .join("");
    let charges = b.charges
      .map(
        (c) => `<div class="edit-row charge ${bad.has("charge:" + c.id) ? "err" : ""}">
        <label class="kind-box"><select data-ch="charge-kind" data-id="${c.id}" aria-label="Charge type">${Object.entries(CHARGE_KINDS)
          .map(([k, v]) => `<option value="${k}" ${c.kind === k ? "selected" : ""}>${v.label}</option>`)
          .join("")}</select>${icon("down")}</label>
        <label class="amt-box"><span>${c.kind === "discount" ? "−₹" : "₹"}</span><input data-f="c:${c.id}" data-in="charge-amount" data-id="${c.id}" value="${esc(c.kind === "discount" ? pos(show(c.amount)) : show(c.amount))}" inputmode="decimal" placeholder="0.00" aria-label="${esc(c.label)} amount"></label>
        <button class="icon-btn plain sm" data-act="charge-remove" data-id="${c.id}" aria-label="Remove ${esc(c.label)}">${icon("trash")}</button>
      </div>`,
      )
      .join("");
    return `${topbar(final ? "Bill Edit" : "Recognized Items", { left: iconBtn("back", "items-back", "Back", `data-id="${id}"`), right: iconBtn("info", "items-help", "How this works") })}
    <div class="screen-body">
      ${photo ? `<button class="receipt-peek" data-act="view-receipt" data-id="${id}"><img src="${photo}" alt=""><span><b>Compare with receipt</b><small>Tap to view the photo</small></span>${icon("next")}</button>` : ""}
      ${b.source === "food-app" ? `<div class="notice info">${icon("phone")} Read as a food-delivery order. Fees and discounts are listed separately below.</div>` : ""}
      <section class="paper torn">
        <input class="title-input ${bad.has("title") ? "err" : ""}" data-f="title" data-in="bill-text" data-ch="bill-text-done" data-k="title" value="${esc(b.title)}" placeholder="${esc(b.merchant || "Name this bill")}" maxlength="60" aria-label="Bill name">
        <div class="meta-chips"><label class="chip-input">${icon("calendar")}<input type="date" data-ch="bill-text-done" data-k="date" value="${esc(b.date)}" aria-label="Date"></label><label class="chip-input">${icon("clock")}<input type="time" data-ch="bill-text-done" data-k="time" value="${esc(b.time)}" aria-label="Time"></label></div>
        <div class="edit-list ${bad.has("items") ? "err" : ""}">${rows || `<p class="muted center pad">No items yet. Add what was ordered.</p>`}</div>
        <button class="add-line" data-act="item-add">${icon("plus")}<span>Add Item</span></button>
      </section>
      <section class="card">
        <div class="card-title"><h3>Taxes, fees & discounts</h3><button class="link" data-act="charge-add">${icon("plus")} Add</button></div>
        ${charges ? `<div class="edit-list">${charges}</div>` : `<p class="muted small">GST, delivery, packaging, tips or coupons. They're split fairly on the next step.</p>`}
      </section>
      <section class="card totals">
        <div class="tline"><span>Items</span><span>${fmt(r.items)}</span></div>
        ${b.charges.length ? `<div class="tline"><span>Taxes, fees & discounts</span><span>${fmt(r.charges)}</span></div>` : ""}
        <label class="tline total-input ${bad.has("total") ? "err" : ""}"><span>Total Bill</span><span class="amt-box big"><span>₹</span><input data-f="total" data-in="bill-total" value="${esc(show(b.total))}" inputmode="decimal" aria-label="Bill total"></span></label>
        ${mismatch ? `<div class="notice warn">${icon("alert")}<div><b>${fmt(Math.abs(r.diff))} ${r.diff > 0 ? "more" : "less"} than the items add up to</b><p>Check the prices above, or keep the receipt total and the difference will be shared in proportion.</p><div class="row"><button class="btn sm outline" data-act="total-auto" data-id="${id}">Use ${fmt(r.computed)}</button>${b.diffOk ? "" : `<button class="btn sm ghost" data-act="total-keep" data-id="${id}">Keep ${rupees(b.total)}</button>`}</div></div></div>` : receiptMode && b.items.length ? `<div class="notice ok">${icon("check")} Matches the receipt total</div>` : ""}
      </section>
    </div>
    <div class="cta-bar"><button class="btn primary block" data-act="items-continue" data-id="${id}">${final ? "Save changes" : "Continue to split"}</button></div>`;
  },
};

/* ---------- Assign (who had what) ---------- */

function chipsFor(b, it) {
  let w = itemWeights(it, b.participants),
    inc = b.participants.filter((_, i) => w[i] > 0);
  if (it.disputed) return `<button class="pchip warn" data-act="item-sheet" data-id="${it.id}">${icon("flag")} Disputed${icon("down")}</button>`;
  if (!inc.length) return `<button class="pchip nobody" data-act="item-sheet" data-id="${it.id}">No one yet · splits equally${icon("down")}</button><button class="pchip-add" data-act="item-sheet" data-id="${it.id}" aria-label="Choose who had ${esc(it.name)}">${icon("plus")}</button>`;
  let everyone = inc.length === b.participants.length && b.participants.length > 2 && !it.byQty;
  let chips = everyone
    ? `<button class="pchip" data-act="item-sheet" data-id="${it.id}">${avStack(inc, 3, 26)}<span>Everyone</span>${icon("down")}</button>`
    : inc
        .slice(0, 4)
        .map((pid) => `<button class="pchip" data-act="item-sheet" data-id="${it.id}" aria-label="${esc(nameOf(pid))}${it.byQty ? `, ${w[b.participants.indexOf(pid)]}` : ""}">${av(pid, 26)}${it.byQty ? `<b>${w[b.participants.indexOf(pid)]}</b>` : ""}${icon("down")}</button>`)
        .join("") + (inc.length > 4 ? `<button class="pchip" data-act="item-sheet" data-id="${it.id}">+${inc.length - 4}</button>` : "");
  let addable = inc.length < b.participants.length || it.byQty;
  return chips + (addable ? `<button class="pchip-add" data-act="item-sheet" data-id="${it.id}" aria-label="Change who had ${esc(it.name)}">${icon("plus")}</button>` : "");
}
function dietHint(b, it) {
  if (!it.autoExcluded?.length || it.split === "custom") return "";
  let names = it.autoExcluded.map((id) => {
    let p = person(id),
      tag = (p?.tags || []).find((t) => DIET[t]?.words.test(it.name));
    return `${esc(isMe(id) ? "You" : firstName(p?.name))} (${DIET[tag]?.label.toLowerCase() || "diet"})`;
  });
  return `<p class="diet-hint">${icon("leaf")}<span>${names.join(", ")} left out automatically</span><button class="link" data-act="diet-include" data-bill="${b.id}" data-id="${it.id}">Include</button></p>`;
}

export const Assign = {
  title: "Split",
  render({ id }) {
    let b = bill(id);
    if (!b) return missing();
    let r = splitBill(b),
      equal = b.mode !== "itemized",
      final = b.status === "final";
    let people = b.participants
      .map((pid) => `<button class="person-pill" data-act="participant" data-bill="${id}" data-id="${pid}">${av(pid, 48, pid === b.payerId ? "ring" : "")}<span>${esc(isMe(pid) ? "You" : firstName(nameOf(pid)))}</span>${pid === b.payerId ? "<em>Paid</em>" : ""}</button>`)
      .join("");
    let items = b.items
      .map(
        (it) => `<div class="assign-row ${it.disputed ? "is-disputed" : ""}">
        <div class="line"><span class="q">${esc(it.qty)}x</span><span class="n">${esc(it.name)}</span><span class="p">${rupees(it.amount)}</span></div>
        ${equal ? "" : `<div class="pchips">${chipsFor(b, it)}</div>${dietHint(b, it)}`}
      </div>`,
      )
      .join("");
    let chargeLines = b.charges
      .map((c) => {
        let rule = c.rule || defaultRule(c.kind),
          ruleText = rule === "person" ? `${nameOf(c.personId) || "Choose"} covers it` : rule === "payer" ? `${nameOf(b.payerId)} ${isMe(b.payerId) ? "cover" : "covers"} it` : rule === "equal" ? "Split equally" : "By what each ordered";
        return `<div class="tline"><button class="charge-rule" data-act="charge-sheet" data-bill="${id}" data-id="${c.id}" ${equal ? "disabled" : ""}><span class="${c.kind === "tax" ? "blue" : ""}">${esc(c.label)}</span>${equal ? "" : `<small>${esc(ruleText)} ${icon("down")}</small>`}</button><span class="${c.kind === "tax" ? "blue" : ""}">${fmt(money(c.amount))}</span></div>`;
      })
      .join("");
    let modeBtn = `<button class="mode-btn" data-act="toggle-equal" data-id="${id}" aria-label="Switch split mode">${equal ? "Equal" : "Itemized"}${icon(equal ? "equal" : "split")}</button>`;
    let perHead = equal ? Object.values(r.shares).find((x) => x > 0) || 0 : 0;
    return `${topbar(esc(b.title || "Split"), { left: iconBtn("back", "assign-back", "Back", `data-id="${id}"`), right: modeBtn })}
    <div class="screen-body">
      <section class="people-strip"><div class="strip-head"><b>Who was there?</b><span>${plural(b.participants.length, "person", "people")}</span></div>
        <div class="people-row" data-scroll="people-${id}">${people}<button class="person-pill add" data-act="add-people" data-id="${id}"><span class="dashed">${icon("plus")}</span><span>Add</span></button></div>
      </section>
      ${equal ? `<div class="notice info">${icon("equal")} Everyone pays an equal share${perHead ? `: about <b>${fmt(perHead)}</b> each` : ""}. Switch to <b>Itemized</b> to pay only for what you had.</div>` : b.participants.length < 2 ? `<div class="notice info">${icon("userPlus")} Add the people who were there, then tap the chips under each item.</div>` : ""}
      <section class="paper torn">
        <div class="paper-head"><h2>${esc(b.merchant || b.title)}</h2><p>${dateTime(b)}</p></div>
        <div class="assign-list">${items || `<p class="muted center pad">No items. <a class="link" href="#/bill/${id}/items">Add items</a></p>`}</div>
      </section>
      <section class="card totals">
        <div class="tline"><span class="muted">Subtotal</span><span class="muted">${fmt(r.items)}</span></div>
        ${chargeLines}
        ${r.diff ? `<div class="tline"><span class="muted">Receipt adjustment</span><span class="muted">${fmt(r.diff)}</span></div>` : ""}
        <div class="tline grand"><span>Total Bill</span><span>${fmt(r.total)}</span></div>
      </section>
      ${!equal && b.items.length ? `<p class="fine center">${icon("hand")} Not sure who had what? Pass the phone around and let everyone pick.</p>` : ""}
    </div>
    <div class="cta-bar two">${!equal && b.items.length && b.participants.length > 1 ? `<button class="btn outline" data-act="pass-start" data-id="${id}">${icon("phone")} Pass the phone</button>` : ""}<button class="btn primary ${equal || b.participants.length < 2 || !b.items.length ? "block" : ""}" data-act="assign-confirm" data-id="${id}">${final ? "Save changes" : "Confirm Result"}</button></div>`;
  },
  aside({ id }) {
    let b = bill(id);
    return b ? liveSplit(b) : "";
  },
};

// Desktop side panel: per-person totals updating live.
export function liveSplit(b) {
  let r = splitBill(b),
    ids = Object.keys(r.shares).filter((id) => r.shares[id] || b.participants.includes(id));
  return `<section class="card side-card"><div class="card-title"><h3>Live split</h3><span class="badge">${fmt(r.total)}</span></div>
    ${ids.map((id) => `<div class="side-person">${av(id, 36)}<span class="grow"><b>${esc(nameOf(id))}</b><small>${id === b.payerId ? "Paid the bill" : `Owes ${isMe(b.payerId) ? "you" : esc(nameOf(b.payerId))}`}</small></span><b>${fmt(r.shares[id] || 0)}</b></div>`).join("") || '<p class="muted small">Add people to see the split.</p>'}
    ${r.unclaimed ? `<div class="notice info small">${fmt(r.unclaimed)} unassigned · split equally</div>` : ""}
    ${r.disputed ? `<div class="notice warn small">${fmt(r.disputed)} disputed · held by ${esc(nameOf(b.payerId))}</div>` : ""}
  </section>`;
}

/* ---------- Item sheet ---------- */

let sheetItem = null; // { billId, itemId }
function itemSheet() {
  let b = bill(sheetItem?.billId),
    it = b?.items.find((x) => x.id === sheetItem.itemId);
  if (!it) return sheetHead("Item removed");
  let r = splitBill(b),
    w = itemWeights(it, b.participants),
    claimed = w.reduce((a, x) => a + x, 0),
    qty = Number(it.qty) || 1,
    rows = b.participants
      .map((pid, i) => {
        let line = r.lines[pid]?.items.find((l) => l.id === it.id && !l.extra),
          on = w[i] > 0,
          diet = it.autoExcluded?.includes(pid);
        let control = it.byQty
          ? `<span class="stepper"><button data-act="item-step" data-pid="${pid}" data-d="-1" aria-label="One less for ${esc(nameOf(pid))}" ${w[i] ? "" : "disabled"}>${icon("minus")}</button><b aria-live="polite">${w[i]}</b><button data-act="item-step" data-pid="${pid}" data-d="1" aria-label="One more for ${esc(nameOf(pid))}" ${claimed >= qty ? "disabled" : ""}>${icon("plus")}</button></span>`
          : `<span class="check ${on ? "on" : ""}">${icon("check")}</span>`;
        let tag = it.byQty ? "div" : "button";
        return `<${tag} class="pick-row ${on ? "on" : ""}" ${it.byQty ? "" : `data-act="item-toggle" data-pid="${pid}" role="checkbox" aria-checked="${on}"`}>${av(pid, 40)}<span class="grow"><b>${esc(nameOf(pid))}</b><small>${diet ? `${icon("leaf")} Left out by food preference` : line ? fmt(line.amount) : "Not having this"}</small></span>${control}</${tag}>`;
      })
      .join("");
  return `${sheetHead(`Who had ${esc(it.name)}?`, `${esc(it.qty)}x · ${rupees(it.amount)}`)}
    <div class="quick-row"><button class="chip" data-act="item-quick" data-q="all">Everyone</button>${S().meId && b.participants.includes(S().meId) ? `<button class="chip" data-act="item-quick" data-q="me">Only me</button>` : ""}<button class="chip" data-act="item-quick" data-q="none">Clear</button></div>
    ${qty > 1 ? `<div class="setting-row"><span class="grow"><b>Split by count</b><small>${it.byQty ? `${claimed} of ${qty} claimed${claimed < qty ? ` · ${qty - claimed} left over are split equally` : ""}` : `Had 3 of the ${qty}? Count each person's portion.`}</small></span>${toggle(it.byQty, "item-byqty", "Split by count")}</div>` : ""}
    <div class="pick-list">${rows}</div>
    <div class="setting-row warn-row"><span class="grow"><b>${icon("flag")} Someone says they didn't have this</b><small>Hold it with ${esc(nameOf(b.payerId))} until it's sorted out.</small></span>${toggle(!!it.disputed, "item-dispute", "Mark as disputed")}</div>
    <div class="sheet-actions"><button class="btn primary block" data-act="sheet-close">Done</button></div>`;
}
function editItem(fn) {
  edit(sheetItem.billId, (b) => {
    let it = b.items.find((x) => x.id === sheetItem.itemId);
    if (it) fn(it, b);
  });
}
function toCustom(it, b) {
  if (it.split === "custom") return;
  let w = itemWeights(it, b.participants);
  it.portions = Object.fromEntries(b.participants.map((p, i) => [p, w[i]]).filter(([, v]) => v > 0));
  it.split = "custom";
}

/* ---------- People sheets ---------- */

let peopleFor = null,
  peopleQuery = "";
function peopleSheet() {
  let b = bill(peopleFor);
  if (!b) return sheetHead("Bill removed");
  let s = S(),
    q = peopleQuery.trim().toLowerCase(),
    list = [...s.people].sort((a, c) => (a.id === s.meId ? -1 : c.id === s.meId ? 1 : a.name.localeCompare(c.name))).filter((p) => !q || p.name.toLowerCase().includes(q)),
    exact = s.people.some((p) => p.name.trim().toLowerCase() === q);
  return `${sheetHead("Who was there?", `${plural(b.participants.length, "person", "people")} on this bill`)}
    <form class="add-inline" data-submit="people-add-new"><input data-f="people-q" data-in="people-query" value="${esc(peopleQuery)}" placeholder="Search or add a name" maxlength="40" autocomplete="off" aria-label="Search or add a friend"><button class="btn primary sm" type="submit" ${q && !exact ? "" : "disabled"}>${icon("plus")} Add</button></form>
    ${s.groups.length ? `<div class="quick-row">${s.groups.map((g) => `<button class="chip ${b.groupId === g.id ? "on" : ""}" data-act="people-group" data-id="${g.id}">${icon("users")}${esc(g.name)}</button>`).join("")}</div>` : ""}
    <div class="pick-list">${list
      .map((p) => {
        let on = b.participants.includes(p.id);
        return `<button class="pick-row ${on ? "on" : ""}" data-act="people-toggle" data-id="${p.id}" role="checkbox" aria-checked="${on}">${av(p, 40)}<span class="grow"><b>${esc(p.id === s.meId ? `${p.name} (you)` : p.name)}</b><small>${dietBadges(p.tags) || (p.id === b.payerId ? "Paid this bill" : "&nbsp;")}</small></span><span class="check ${on ? "on" : ""}">${icon("check")}</span></button>`;
      })
      .join("")}${!list.length ? `<p class="muted center pad">No one called “${esc(peopleQuery)}” yet. Tap Add to create them.</p>` : ""}</div>
    <div class="sheet-actions"><button class="btn primary block" data-act="sheet-close">Done</button></div>`;
}
let participantSel = null;
function participantSheet() {
  let b = bill(participantSel?.billId),
    p = person(participantSel?.id);
  if (!b || !p) return sheetHead("Not found");
  let payer = b.payerId === p.id;
  return `${sheetHead(esc(p.id === S().meId ? "You" : p.name))}
    <div class="sheet-person">${av(p, 72)}<div>${dietBadges(p.tags) || '<span class="muted small">No food preferences set</span>'}</div></div>
    <div class="list-actions">
      <button class="list-action" data-act="participant-payer" ${payer ? "disabled" : ""}>${icon("wallet")}<span class="grow">${payer ? `${p.id === S().meId ? "You" : esc(firstName(p.name))} paid this bill` : "Set as the one who paid"}</span>${payer ? icon("check") : ""}</button>
      <button class="list-action" data-act="participant-edit">${icon("edit")}<span class="grow">Edit food preferences & UPI</span>${icon("next")}</button>
      <button class="list-action danger" data-act="participant-remove" ${b.participants.length < 2 ? "disabled" : ""}>${icon("x")}<span class="grow">Remove from this bill</span></button>
    </div>`;
}

/* ---------- Charge rule sheet ---------- */

let chargeSel = null;
function chargeSheet() {
  let b = bill(chargeSel?.billId),
    c = b?.charges.find((x) => x.id === chargeSel.id);
  if (!c) return sheetHead("Charge removed");
  let rule = c.rule || defaultRule(c.kind),
    explain = {
      proportional: "Whoever ordered more pays more. Best for GST, service charge and tips.",
      equal: "Everyone who ordered pays the same. Best for delivery and packaging fees.",
      payer: `${nameOf(b.payerId)} ${isMe(b.payerId) ? "pay" : "pays"} all of it, e.g. when Split Tax is off.`,
      person: "One person covers it, or gets the credit for a coupon they used.",
    };
  return `${sheetHead(`How should we split ${esc(c.label)}?`, fmt(money(c.amount)))}
    <div class="radio-list">${Object.entries(RULES)
      .map(
        ([k, label]) =>
          `<button class="radio ${rule === k ? "on" : ""}" data-act="charge-rule" data-rule="${k}" role="radio" aria-checked="${rule === k}"><span class="radio-dot"></span><span class="grow"><b>${label}</b><small>${esc(explain[k])}</small></span></button>`,
      )
      .join("")}</div>
    ${rule === "person" ? `<div class="field"><span>Who?</span><div class="chips">${[...new Set([...b.participants, b.payerId])].map((pid) => `<button class="chip person ${c.personId === pid ? "on" : ""}" data-act="charge-person" data-id="${pid}">${av(pid, 24)}${esc(nameOf(pid))}</button>`).join("")}</div></div>` : ""}
    <div class="sheet-actions"><button class="btn primary block" data-act="sheet-close">Done</button></div>`;
}

/* ---------- Summary ---------- */

export function personCards(b, r, { getPerson = person, meId = S().meId, interactive = true, payerName } = {}) {
  let ids = [...b.participants, ...(b.participants.includes(b.payerId) ? [] : [b.payerId])].filter((id) => r.shares[id] !== undefined && (r.shares[id] !== 0 || b.participants.includes(id)));
  let pname = (id) => (id === meId ? "You" : esc(getPerson(id)?.name || "Someone"));
  return ids
    .map((id) => {
      let l = r.lines[id] || { items: [], charges: [] },
        open = session.openDetails.has(id) || !interactive,
        share = r.shares[id] || 0,
        paid = id === b.payerId ? money(b.total) : 0,
        net = paid - share,
        p = getPerson(id);
      let itemLines = l.items
        .filter((x) => !x.extra)
        .map((x) => `<div class="pi"><span class="q">${x.units ? x.units + "x" : x.sharers > 1 ? "1/" + x.sharers : esc(x.qty) + "x"}</span><span class="grow">${esc(x.name)}${x.sharers > 1 && !x.units ? ` <small>${Number(x.qty) > 1 ? esc(x.qty) + "x " : ""}shared by ${x.sharers}</small>` : ""}${x.disputed ? ` <small class="warn-text">disputed</small>` : ""}${x.unclaimed ? ` <small>split equally</small>` : ""}</span>${open ? `<span>${fmt(x.amount)}</span>` : ""}</div>`)
        .join("");
      let extraItems = l.items.filter((x) => x.extra).reduce((a, x) => a + x.amount, 0);
      let details = open
        ? `<div class="details">
          ${extraItems ? `<div class="pi muted"><span class="grow">Share of leftover portions</span><span>${fmt(extraItems)}</span></div>` : ""}
          ${l.charges.map((c) => `<div class="pi muted"><span class="grow">${esc(c.label)}</span><span>${fmt(c.amount)}</span></div>`).join("")}
          ${l.adjustment ? `<div class="pi muted"><span class="grow">Receipt adjustment</span><span>${fmt(l.adjustment)}</span></div>` : ""}
          ${l.rounding ? `<div class="pi muted"><span class="grow">Rounding</span><span>${fmt(l.rounding)}</span></div>` : ""}
          ${b.mode !== "itemized" ? `<div class="pi muted"><span class="grow">${{ equal: "Equal share", exact: "Exact amount", percent: `${b.custom?.[id] || 0}% of the bill`, shares: `${b.custom?.[id] || 0} share(s)` }[b.mode]}</span><span>${fmt(share)}</span></div>` : ""}
          <div class="pi net"><span class="grow">${id === b.payerId ? `Paid ${fmt(paid)} · ${net >= 0 ? "gets back" : "owes"}` : `Owes ${id === meId ? "" : ""}${esc(payerName || (b.payerId === meId ? "you" : getPerson(b.payerId)?.name || "the payer"))}`}</span><b>${fmt(Math.abs(id === b.payerId ? net : share))}</b></div>
        </div>`
        : "";
      return `<article class="person-total">
        <header>${av(p || { name: "?" }, 44)}<b class="grow">${id === meId ? "Your Total" : `${pname(id)}’s Total`}</b>${interactive && b.status === "final" && b.payerId === meId && id !== meId && share > 0 ? `<button class="wa-mini" data-act="bill-wa" data-bill="${b.id}" data-id="${id}" aria-label="Ask ${pname(id)} on WhatsApp">${icon("chat")}</button>` : ""}<span class="amt">${fmt(share)}</span></header>
        ${itemLines ? `<div class="pitems">${itemLines}</div>` : ""}
        ${interactive ? `<button class="details-toggle" data-act="toggle-details" data-id="${id}" aria-expanded="${open}"><span>Bill Details</span><span class="chev ${open ? "up" : ""}">${icon("down")}</span></button>` : ""}
        ${details}
      </article>`;
    })
    .join("");
}

const MODES = [
  ["itemized", "Itemized"],
  ["equal", "Equal"],
  ["exact", "Exact ₹"],
  ["percent", "Percent"],
  ["shares", "Shares"],
];
export const Summary = {
  title: "Bill Split Summary",
  render({ id }) {
    let b = bill(id);
    if (!b) return missing();
    let r = splitBill(b),
      final = b.status === "final",
      errors = validateBill(b, S().people.map((p) => p.id)).filter((e) => e.field !== "title"),
      disputedItems = b.items.filter((it) => it.disputed),
      g = groupOf(b.groupId);
    let custom =
      ["exact", "percent", "shares"].includes(b.mode) &&
      `<div class="custom-split">${b.participants
        .map(
          (pid) =>
            `<label class="custom-row">${av(pid, 32)}<span class="grow">${esc(nameOf(pid))}</span><span class="amt-box"><span>${b.mode === "exact" ? "₹" : b.mode === "percent" ? "%" : "×"}</span><input data-f="cu:${pid}" data-in="custom-value" data-bill="${id}" data-id="${pid}" value="${esc(b.custom?.[pid] ?? "")}" inputmode="decimal" placeholder="0" aria-label="${esc(nameOf(pid))} ${b.mode}"></span></label>`,
        )
        .join("")}${errors.find((e) => e.field === "custom") ? `<p class="form-error">${esc(errors.find((e) => e.field === "custom").msg)}</p>` : ""}</div>`;
    let printing = session.justSaved === id ? enter("print", id) && "printing" : "";
    return `${topbar("Bill Split Summary", { left: iconBtn("back", "summary-back", "Back", `data-id="${id}"`), right: iconBtn("share", "share-native", "Share", `data-id="${id}"`) })}
    <div class="screen-body ${printing}">
      <section class="paper torn summary-head">
        <div class="paper-head"><h2>${esc(b.merchant || b.title)}</h2><p>${dateTime(b)}</p></div>
        ${b.merchant && b.title !== b.merchant ? `<p class="center muted small">${esc(b.title)}</p>` : ""}
        <div class="sum-total"><small>Total bill</small><b data-count="${r.total}" data-count-key="${id}">${fmt(r.total)}</b><button class="payer-chip" data-act="payer-sheet" data-id="${id}">${av(b.payerId, 24)}Paid by ${esc(nameOf(b.payerId))}${icon("down")}</button></div>
        ${final && b.recurringId ? `<p class="center badge-line"><span class="badge">${icon("repeat")} Monthly</span></p>` : ""}
      </section>
      ${disputedItems.length ? `<section class="notice warn tray">${icon("flag")}<div class="grow"><b>${plural(disputedItems.length, "disputed item")} · ${fmt(r.disputed)}</b><p>Held with ${esc(nameOf(b.payerId))} until someone claims it.</p>${disputedItems.map((it) => `<button class="tray-item" data-act="resolve-item" data-bill="${id}" data-id="${it.id}">${esc(it.name)} · ${rupees(it.amount)}<span>Resolve ${icon("next")}</span></button>`).join("")}</div></section>` : ""}
      ${r.unclaimed ? `<div class="notice info">${icon("info")} ${fmt(r.unclaimed)} of items had no one assigned, so it's split equally.</div>` : ""}
      ${errors.length && !custom ? `<div class="notice warn">${icon("alert")}<div><b>Almost there</b><p>${esc(errors[0].msg)}</p></div></div>` : ""}
      <section class="person-list">${personCards(b, r)}</section>
      <section class="card options">
        <div class="opt"><span class="opt-label">Split method</span><div class="seg wrap">${MODES.map(([k, l]) => `<button class="${b.mode === k ? "on" : ""}" data-act="set-mode" data-id="${id}" data-mode="${k}" aria-pressed="${b.mode === k}">${l}</button>`).join("")}</div></div>
        ${custom || ""}
        <div class="opt"><span class="opt-label">Round each share</span><div class="seg">${[0, 1, 5, 10].map((v) => `<button class="${(b.roundTo || 0) === v ? "on" : ""}" data-act="set-round" data-id="${id}" data-v="${v}" aria-pressed="${(b.roundTo || 0) === v}">${v ? "₹" + v : "Exact"}</button>`).join("")}</div>${b.roundTo ? `<small class="hint">${esc(nameOf(b.payerId))} ${isMe(b.payerId) ? "cover" : "covers"} the rounding difference.</small>` : ""}</div>
        <div class="opt"><span class="opt-label">Group</span><div class="chips">${[`<button class="chip ${!b.groupId ? "on" : ""}" data-act="set-group" data-id="${id}" data-group="">No group</button>`, ...S().groups.map((x) => `<button class="chip ${b.groupId === x.id ? "on" : ""}" data-act="set-group" data-id="${id}" data-group="${x.id}">${esc(x.name)}</button>`)].join("")}</div></div>
        <div class="opt"><span class="opt-label">Category <button class="link small" data-act="auto-category" data-id="${id}">${icon("sparkle")} Suggest</button></span><div class="chips">${Object.entries(CATEGORIES).map(([k, ic]) => `<button class="chip ${b.category === k ? "on" : ""}" data-act="set-category" data-id="${id}" data-cat="${k}">${icon(ic)}${k}</button>`).join("")}</div><small class="hint" id="cat-status"></small></div>
        ${!final && g ? `<div class="setting-row"><span class="grow"><b>${icon("repeat")} Repeat monthly</b><small>Adds this bill to ${esc(g.name)} every month, like rent or Wi-Fi.</small></span>${toggle(!!b.repeat, "set-repeat", "Repeat monthly", `data-id="${id}"`)}</div>` : ""}
      </section>
      ${final ? `<div class="row center gap"><button class="btn ghost sm" data-act="bill-duplicate" data-id="${id}">${icon("copy")} Duplicate</button><button class="btn ghost sm danger-text" data-act="bill-delete" data-id="${id}">${icon("trash")} Delete</button></div>` : ""}
    </div>
    <div class="cta-bar two">${final ? `<button class="btn outline" data-act="bill-edit" data-id="${id}">${icon("edit")} Edit Bill</button>` : `<button class="btn outline" data-act="bill-save" data-id="${id}">Save Bill</button>`}<button class="btn primary" data-act="copy-link" data-id="${id}">${icon("link")} Copy Link</button></div>`;
  },
  aside({ id }) {
    let b = bill(id);
    return b ? liveSplit(b) : "";
  },
};

function payerSheet(id) {
  return () => {
    let b = bill(id);
    if (!b) return sheetHead("Bill removed");
    let ids = [...new Set([...b.participants, b.payerId])];
    return `${sheetHead("Who paid?")}<div class="pick-list">${ids
      .map((pid) => `<button class="pick-row ${b.payerId === pid ? "on" : ""}" data-act="set-payer" data-bill="${id}" data-id="${pid}" role="radio" aria-checked="${b.payerId === pid}">${av(pid, 40)}<span class="grow"><b>${esc(nameOf(pid))}</b></span><span class="radio-dot"></span></button>`)
      .join("")}</div><p class="fine">Paid but didn't eat? Remove them from the bill on the split screen. They'll still be the payer.</p>`;
  };
}

async function finalize(id) {
  let b = bill(id);
  ensureTitle(b);
  let errors = validateBill(b, S().people.map((p) => p.id));
  if (errors.length) {
    toast(errors[0].msg, { tone: "warn" });
    refresh();
    return false;
  }
  return true;
}

/* ---------- Actions ---------- */

export const billActions = {
  // Items screen
  "bill-text": (el) => {
    let id = currentId();
    edit(id, (b) => (b[el.dataset.k] = el.value), { render: false });
  },
  "bill-text-done": (el) => {
    let id = currentId();
    edit(id, (b) => (b[el.dataset.k] = el.value.trim ? el.value.trim() : el.value));
  },
  "item-field": (el) => {
    let id = currentId(),
      v = num(el.value);
    session.badFields.delete("item:" + el.dataset.id);
    edit(id, (b) => {
      let it = b.items.find((x) => x.id === el.dataset.id);
      if (!it) return;
      it[el.dataset.k] = el.dataset.k === "qty" && v !== "" && Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : v;
      it.low = false;
    });
  },
  "item-name": (el) => {
    edit(currentId(), (b) => {
      let it = b.items.find((x) => x.id === el.dataset.id);
      if (it) {
        it.name = el.value;
        it.low = false;
      }
    }, { render: false });
  },
  "item-name-done": () => refresh(),
  "item-add": () => {
    let id = currentId(),
      item = makeItem("", 1, "");
    edit(id, (b) => b.items.push(item));
    requestAnimationFrame(() => document.querySelector(`[data-f="n:${item.id}"]`)?.focus());
  },
  "item-remove": (el) => {
    let id = currentId(),
      it = bill(id)?.items.find((x) => x.id === el.dataset.id);
    edit(id, (b) => (b.items = b.items.filter((x) => x.id !== el.dataset.id)), { undo: `${it?.name || "Item"} removed` });
  },
  "charge-add": () => {
    let id = currentId(),
      b = bill(id),
      kinds = ["tax", "delivery", "packaging", "service", "tip", "discount", "platform", "other"],
      kind = kinds.find((k) => !b.charges.some((c) => c.kind === k)) || "other",
      c = makeCharge(kind, "");
    edit(id, (x) => x.charges.push(c));
    requestAnimationFrame(() => document.querySelector(`[data-f="c:${c.id}"]`)?.focus());
  },
  "charge-kind": (el) => {
    edit(currentId(), (b) => {
      let c = b.charges.find((x) => x.id === el.dataset.id),
        k = el.value;
      if (!c) return;
      let wasDefaultLabel = Object.values(CHARGE_KINDS).some((v) => v.label === c.label) || !c.label;
      c.kind = k;
      c.rule = defaultRule(k);
      if (wasDefaultLabel) c.label = CHARGE_KINDS[k].label;
      if (c.amount !== "") c.amount = k === "discount" ? neg(c.amount) : pos(c.amount);
    });
  },
  "charge-amount": (el) => {
    edit(currentId(), (b) => {
      let c = b.charges.find((x) => x.id === el.dataset.id),
        v = num(el.value);
      if (!c) return;
      c.amount = c.kind === "discount" ? neg(v) : v;
    });
  },
  "charge-remove": (el) => {
    let id = currentId();
    edit(id, (b) => (b.charges = b.charges.filter((x) => x.id !== el.dataset.id)), { undo: "Charge removed" });
  },
  "bill-total": (el) => {
    let v = num(el.value);
    session.badFields.delete("total");
    edit(currentId(), (b) => {
      b.total = v;
      b.totalSource = "receipt";
      b.diffOk = false;
    });
  },
  "total-auto": (el) => edit(el.dataset.id, (b) => (b.totalSource = "auto")),
  "total-keep": (el) => edit(el.dataset.id, (b) => (b.diffOk = true)),
  "items-help": () =>
    openSheet(
      () => `${sheetHead("Checking scanned items")}<div class="help-list">
      <p>${icon("alert")} <b>Highlighted lines</b> are ones the scanner wasn't sure about. Compare them with the receipt.</p>
      <p>${icon("receipt")} <b>Line prices</b> are the total for that line. 2x Caesar Salad at ₹23.38 means both salads together.</p>
      <p>${icon("tag")} <b>Taxes & fees</b> are split on the next step: tax by what each person ordered, delivery equally. You can change it.</p>
      <p>${icon("check")} If the <b>total</b> doesn't match, fix a price or keep the receipt total. The difference is shared fairly.</p></div>
      <div class="sheet-actions"><button class="btn primary block" data-act="sheet-close">Got it</button></div>`,
      { label: "Help" },
    ),
  "view-receipt": (el) => {
    let src = session.photos.get(el.dataset.id);
    openSheet(() => `${sheetHead("Your receipt")}<img class="receipt-full" src="${src}" alt="Scanned receipt">`, { label: "Receipt", wide: true });
  },
  "items-back": (el) => leaveEdit(el.dataset.id, "home"),
  "items-continue": (el) => {
    let id = el.dataset.id,
      b = bill(id);
    edit(id, (x) => {
      ensureTitle(x);
      x.items = x.items.filter((it) => String(it.name).trim() || money(it.amount));
    });
    b = bill(id);
    let errors = validateBill({ ...b, participants: b.participants.length ? b.participants : ["x"], payerId: b.payerId || "x" }).filter((e) => !["people", "payer", "custom"].includes(e.field));
    session.badFields = new Set(errors.map((e) => e.field));
    if (errors.length) {
      toast(errors[0].msg, { tone: "warn" });
      return refresh();
    }
    if (b.status === "final") {
      session.edit = null;
      toast("Changes saved");
      return go(`bill/${id}`, true);
    }
    go(`bill/${id}/assign`);
  },

  // Assign screen
  "assign-back": (el) => leaveEdit(el.dataset.id, "home"),
  "toggle-equal": (el) => edit(el.dataset.id, (b) => (b.mode = b.mode === "itemized" ? "equal" : "itemized")),
  "item-sheet": (el) => {
    sheetItem = { billId: currentId(), itemId: el.dataset.id };
    openSheet(itemSheet, { label: "Who had this item" });
  },
  "resolve-item": (el) => {
    sheetItem = { billId: el.dataset.bill, itemId: el.dataset.id };
    openSheet(itemSheet, { label: "Resolve disputed item" });
  },
  "item-toggle": (el) =>
    editItem((it, b) => {
      let pid = el.dataset.pid,
        w = itemWeights(it, b.participants)[b.participants.indexOf(pid)];
      if (it.split === "custom") {
        if (w) delete it.portions[pid];
        else it.portions[pid] = 1;
        return;
      }
      if (w) it.excluded = [...new Set([...(it.excluded || []), pid])];
      else {
        it.excluded = (it.excluded || []).filter((x) => x !== pid);
        if (it.autoExcluded?.includes(pid)) it.dietOverride = [...new Set([...(it.dietOverride || []), pid])];
      }
    }),
  "item-quick": (el) =>
    editItem((it, b) => {
      let q = el.dataset.q;
      it.byQty = false;
      if (q === "all") Object.assign(it, { split: "all", excluded: [], portions: {} });
      else if (q === "me") Object.assign(it, { split: "custom", portions: { [S().meId]: 1 } });
      else Object.assign(it, { split: "custom", portions: {} });
    }),
  "item-byqty": () =>
    editItem((it, b) => {
      let qty = Math.max(1, Number(it.qty) || 1);
      if (it.byQty) {
        it.byQty = false;
        it.portions = Object.fromEntries(Object.entries(it.portions).filter(([, v]) => v > 0).map(([k]) => [k, 1]));
        return;
      }
      toCustom(it, b);
      let inc = b.participants.filter((p) => it.portions[p] > 0);
      it.portions = {};
      inc.forEach((p, i) => {
        let n = Math.floor(qty / inc.length) + (i < qty % inc.length ? 1 : 0);
        if (n) it.portions[p] = n;
      });
      it.byQty = true;
    }),
  "item-step": (el) =>
    editItem((it) => {
      let pid = el.dataset.pid,
        d = Number(el.dataset.d),
        sum = Object.values(it.portions).reduce((a, x) => a + x, 0),
        next = (it.portions[pid] || 0) + d;
      if (d > 0 && sum >= (Number(it.qty) || 1)) return;
      if (next <= 0) delete it.portions[pid];
      else it.portions[pid] = next;
    }),
  "item-dispute": () => editItem((it) => (it.disputed = !it.disputed)),
  "diet-include": (el) =>
    edit(el.dataset.bill, (b) => {
      let it = b.items.find((x) => x.id === el.dataset.id);
      if (it) it.dietOverride = [...new Set([...(it.dietOverride || []), ...(it.autoExcluded || [])])];
    }),
  "add-people": (el) => {
    peopleFor = el.dataset.id;
    peopleQuery = "";
    openSheet(peopleSheet, { label: "Who was there" });
  },
  "people-query": (el) => {
    peopleQuery = el.value;
    refresh();
  },
  "people-add-new": () => {
    let name = peopleQuery.trim();
    if (!name || S().people.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) return;
    let p = makePerson(name);
    commit((s) => {
      s.people.push(p);
      let b = s.bills.find((x) => x.id === peopleFor);
      b.participants.push(p.id);
      tidyBill(b);
    });
    peopleQuery = "";
    toast(`${name} added to the bill`);
    refresh();
  },
  "people-toggle": (el) => {
    let pid = el.dataset.id,
      b = bill(peopleFor);
    if (b.participants.includes(pid) && b.participants.length === 1) return toast("A bill needs at least one person.", { tone: "warn" });
    edit(peopleFor, (x) => {
      x.participants = x.participants.includes(pid) ? x.participants.filter((p) => p !== pid) : [...x.participants, pid];
    });
  },
  "people-group": (el) => {
    let g = groupOf(el.dataset.id);
    edit(peopleFor, (b) => {
      b.participants = [...new Set([...b.participants, ...g.memberIds.filter((id) => person(id))])];
      b.groupId = g.id;
    });
    toast(`Added everyone from ${g.name}`);
  },
  participant: (el) => {
    participantSel = { billId: el.dataset.bill, id: el.dataset.id };
    openSheet(participantSheet, { label: "Person on this bill" });
  },
  "participant-payer": () => {
    edit(participantSel.billId, (b) => (b.payerId = participantSel.id));
    closeSheet();
  },
  "participant-edit": () => {
    let pid = participantSel.id;
    closeSheet();
    editPerson(pid, { after: () => refresh() });
  },
  "participant-remove": () => {
    let { billId, id } = participantSel;
    closeSheet();
    edit(billId, (b) => {
      b.participants = b.participants.filter((p) => p !== id);
    }, { undo: `${nameOf(id)} removed from the bill` });
  },
  "charge-sheet": (el) => {
    chargeSel = { billId: el.dataset.bill, id: el.dataset.id };
    openSheet(chargeSheet, { label: "Split a charge" });
  },
  "charge-rule": (el) =>
    edit(chargeSel.billId, (b) => {
      let c = b.charges.find((x) => x.id === chargeSel.id);
      c.rule = el.dataset.rule;
      if (c.rule === "person" && !c.personId) c.personId = c.kind === "discount" ? null : b.payerId;
    }),
  "charge-person": (el) =>
    edit(chargeSel.billId, (b) => {
      b.charges.find((x) => x.id === chargeSel.id).personId = el.dataset.id;
    }),
  "assign-confirm": async (el) => {
    let id = el.dataset.id,
      b = bill(id),
      r = splitBill(b);
    if (b.participants.length < 2) {
      let ok = await confirmDialog({ title: "Just you on this bill?", body: "Add the friends who were there so everyone pays their part.", ok: "Add people", cancel: "Continue anyway" });
      if (ok) return billActions["add-people"]({ dataset: { id } });
    }
    if (b.mode === "itemized" && r.unclaimed && !b.claimAck) {
      let names = b.items.filter((it) => !itemWeights(it, b.participants).some(Boolean) && !it.disputed).map((it) => it.name);
      if (names.length) {
        let ok = await confirmDialog({ title: `${plural(names.length, "item")} with no one assigned`, body: `${esc(names.slice(0, 3).join(", "))}${names.length > 3 ? "…" : ""} will be split equally among everyone.`, ok: "Split equally", cancel: "Assign them" });
        if (!ok) return;
      }
    }
    if (b.status === "final") {
      if (!(await finalize(id))) return;
      session.edit = null;
      toast("Changes saved");
      return go(`bill/${id}`, true);
    }
    go(`bill/${id}`);
  },

  // Summary screen
  "summary-back": (el) => {
    let b = bill(el.dataset.id);
    if (b?.status === "final" && session.justSaved === b.id) {
      session.justSaved = null;
      return go("home");
    }
    if (b?.status === "final") return back("home");
    go(`bill/${el.dataset.id}/assign`, true);
  },
  "toggle-details": (el) => {
    let id = el.dataset.id;
    session.openDetails.has(id) ? session.openDetails.delete(id) : session.openDetails.add(id);
    refresh();
  },
  "payer-sheet": (el) => openSheet(payerSheet(el.dataset.id), { label: "Who paid" }),
  "set-payer": (el) => {
    edit(el.dataset.bill, (b) => (b.payerId = el.dataset.id));
    closeSheet();
  },
  "set-mode": (el) => edit(el.dataset.id, (b) => (b.mode = el.dataset.mode)),
  "custom-value": (el) => edit(el.dataset.bill, (b) => (b.custom = { ...b.custom, [el.dataset.id]: num(el.value) })),
  "set-round": (el) => edit(el.dataset.id, (b) => (b.roundTo = Number(el.dataset.v))),
  "set-group": (el) => edit(el.dataset.id, (b) => (b.groupId = el.dataset.group || null)),
  "set-category": (el) => edit(el.dataset.id, (b) => (b.category = el.dataset.cat)),
  "set-repeat": (el) => edit(el.dataset.id, (b) => (b.repeat = !b.repeat)),
  "auto-category": async (el) => {
    let b = bill(el.dataset.id),
      status = (t) => {
        let x = document.getElementById("cat-status");
        if (x) x.textContent = t;
      };
    try {
      let cat = await categorize(`${b.title}. ${b.merchant}. ${b.items.map((i) => i.name).join(", ")}`, status);
      edit(b.id, (x) => (x.category = cat));
      toast(`Looks like ${cat}. Change it anytime.`);
    } catch {
      status("The category model couldn't load. Pick one yourself.");
    }
  },
  "bill-save": async (el) => {
    let id = el.dataset.id;
    if (!(await finalize(id))) return;
    let b = bill(id);
    commit((s) => {
      let x = s.bills.find((y) => y.id === id);
      x.status = "final";
      x.claim = null;
      if (x.repeat && x.groupId) {
        let g = s.groups.find((y) => y.id === x.groupId),
          rid = newId(),
          { id: _, status, repeat, claim, ...template } = structuredClone(x);
        g.recurring.push({ id: rid, next: addMonth(x.date, Number(x.date.slice(8, 10))), day: Number(x.date.slice(8, 10)), template });
        x.recurringId = rid;
      }
      delete x.repeat;
    });
    session.photos.delete(id);
    session.justSaved = id;
    if (!S().bills.some((x) => x.status === "final" && x.id !== id)) confetti();
    if (session.queue.length) toast(`Saved! ${plural(session.queue.length, "receipt")} left to scan.`, { action: { label: "Scan next", fn: () => go("scan?next=1") } });
    else toast(b.payerId === S().meId && b.participants.length > 1 ? "Saved! Tap the green buttons to ask on WhatsApp." : "Saved! Balances are updated in Settle up.");
    go(`bill/${id}`, true);
  },
  "copy-link": async (el) => {
    let b = bill(el.dataset.id);
    ensureTitle(b);
    try {
      let url = await shareUrl(b);
      (await copyText(url)) ? toast("Link copied. Paste it in your group chat.") : toast("Couldn't copy. Use the share button instead.", { tone: "warn" });
    } catch {
      toast("Couldn't create the link.", { tone: "warn" });
    }
  },
  "share-native": async (el) => {
    let b = bill(el.dataset.id),
      url = await shareUrl(b),
      text = summaryText(b);
    if (navigator.share) {
      try {
        await navigator.share({ title: b.title, text, url });
      } catch {}
    } else {
      (await copyText(`${text}\n\n${url}`)) && toast("Summary and link copied");
    }
  },
  "bill-edit": (el) => {
    startEdit(el.dataset.id);
    go(`bill/${el.dataset.id}/items`);
  },
  "bill-edit-split": (el) => {
    startEdit(el.dataset.id);
    go(`bill/${el.dataset.id}/assign`);
  },
  "bill-duplicate": (el) => {
    let b = structuredClone(bill(el.dataset.id)),
      copy = { ...b, id: newId(), status: "draft", title: b.title + " (copy)", recurringId: undefined, createdAt: Date.now() };
    commit((s) => s.bills.push(copy));
    go(`bill/${copy.id}/items`);
  },
  "bill-delete": async (el) => {
    let b = bill(el.dataset.id);
    let ok = await confirmDialog({ title: "Delete this bill?", body: `“${esc(b.title)}” will be removed and balances recalculated. You can undo right after.`, ok: "Delete", danger: true });
    if (!ok) return;
    go("home", true);
    commit((s) => (s.bills = s.bills.filter((x) => x.id !== b.id)), "Bill deleted");
  },
  "bill-wa": (el) => import("./quick.js").then((m) => m.sendNudge(el.dataset.bill, el.dataset.id)),
  "draft-discard": async (el, e) => {
    e?.preventDefault();
    let b = bill(el.dataset.id);
    commit((s) => (s.bills = s.bills.filter((x) => x.id !== b.id)), "Draft discarded");
  },
};

// The bill id of the current route (bill/:id/...).
export const currentId = () => (location.hash.match(/#\/bill\/([^/?]+)/) || [])[1];
