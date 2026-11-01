import { money, fmt } from "./core.js";
import { splitBill, ledger, suggest, syncDiet, defaultRule, CHARGE_KINDS } from "./fair.js";
import { store, newId, todayISO, person, nameOf, groupOf } from "./store.js";
import { packBill, encode } from "./share.js";
import { lookFromSeed } from "./avatar.js";

export const nowTime = () => {
  let d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function makePerson(name, extra = {}) {
  let id = newId();
  return { id, name: String(name).trim().slice(0, 40), upi: "", tags: [], avatar: { seed: id, look: lookFromSeed(id) }, createdAt: Date.now(), ...extra };
}

export function makeItem(name = "", qty = 1, amount = "", extra = {}) {
  return { id: newId(), name, qty, amount, split: "all", portions: {}, excluded: [], autoExcluded: [], dietOverride: [], byQty: false, disputed: false, low: false, ...extra };
}
export function makeCharge(kind = "tax", amount = "", label = "") {
  return { id: newId(), kind, label: label || CHARGE_KINDS[kind]?.label || "Charge", amount, rule: defaultRule(kind), personId: null };
}

export function makeBill(extra = {}) {
  let s = store.state;
  return {
    id: newId(),
    title: "",
    merchant: "",
    date: todayISO(),
    time: nowTime(),
    payerId: s.meId,
    participants: s.meId ? [s.meId] : [],
    groupId: null,
    mode: "itemized",
    items: [],
    charges: [],
    custom: {},
    total: "",
    totalSource: "auto",
    roundTo: s.prefs.roundTo || 0,
    category: "Food",
    status: "draft",
    source: "manual",
    createdAt: Date.now(),
    ...extra,
  };
}

// Keeps derived bill fields consistent after any edit.
export function tidyBill(bill) {
  let ids = new Set(bill.participants);
  if (bill.payerId && !store.state.people.some((p) => p.id === bill.payerId)) bill.payerId = bill.participants[0] || null;
  for (let it of bill.items) {
    it.excluded = (it.excluded || []).filter((id) => ids.has(id));
    it.dietOverride = (it.dietOverride || []).filter((id) => ids.has(id));
    for (let k of Object.keys(it.portions || {})) if (!ids.has(k)) delete it.portions[k];
  }
  for (let c of bill.charges) if (c.rule === "person" && !ids.has(c.personId) && c.personId !== bill.payerId) c.personId = null;
  if (bill.totalSource === "auto") {
    let t = bill.items.reduce((a, x) => a + money(x.amount), 0) + bill.charges.reduce((a, x) => a + money(x.amount), 0);
    bill.total = t / 100;
  }
  syncDiet(bill, store.state.people);
  return bill;
}

export const billPeople = (bill) => bill.participants.map(person).filter(Boolean);
export const sharingCount = (bill) => {
  let { shares } = splitBill(bill);
  return Object.values(shares).filter((x) => x > 0).length || bill.participants.length;
};

/* ---------- Ledgers ---------- */

export function ledgers() {
  let s = store.state,
    out = [];
  let make = (groupId, name) => {
    let balance = ledger(s.bills, s.settlements, groupId),
      tx = suggest(balance, s.prefs.ignoreUnder);
    return { groupId, name, balance, tx };
  };
  for (let g of s.groups) out.push(make(g.id, g.name));
  let personal = make(null, "Personal bills");
  if (Object.keys(personal.balance).length) out.unshift(personal);
  return out;
}
export function myPosition() {
  let me = store.state.meId,
    owe = 0,
    owed = 0;
  for (let l of ledgers())
    for (let t of l.tx) {
      if (t.from === me) owe += t.amount;
      if (t.to === me) owed += t.amount;
    }
  return { owe, owed };
}
// What `id` owes (-) or is owed (+) on one bill, from the bill's own split.
export function netOnBill(bill, id) {
  let { shares } = splitBill(bill);
  return (bill.payerId === id ? money(bill.total) : 0) - (shares[id] || 0);
}

/* ---------- Sharing ---------- */

export async function shareUrl(bill) {
  let code = await encode(packBill(bill, store.state.people));
  return `${location.origin}${location.pathname}#/s/${code}`;
}
export function summaryText(bill) {
  let r = splitBill(bill),
    lines = [`${bill.title || "Bill"} · ${fmt(money(bill.total))}`, `Paid by ${nameOf(bill.payerId, false)}`, ""];
  for (let id of Object.keys(r.shares)) {
    if (!r.shares[id] || id === bill.payerId) continue;
    lines.push(`${nameOf(id, false)} owes ${fmt(r.shares[id])}`);
  }
  if (r.disputed) lines.push("", `${fmt(r.disputed)} is still disputed`);
  return lines.join("\n");
}

/* ---------- Export ---------- */

export function csvAll() {
  let s = store.state,
    q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`,
    rows = [["Date", "Bill", "Group", "Paid by", "Total", "Person", "Share"]];
  for (let b of s.bills.filter((b) => b.status === "final")) {
    let { shares } = splitBill(b);
    for (let id in shares)
      if (shares[id]) rows.push([b.date, b.title, groupOf(b.groupId)?.name || "", nameOf(b.payerId, false), (money(b.total) / 100).toFixed(2), nameOf(id, false), (shares[id] / 100).toFixed(2)]);
  }
  for (let t of s.settlements) rows.push([t.date, "Payment", groupOf(t.groupId)?.name || "", nameOf(t.from, false), Number(t.amount).toFixed(2), nameOf(t.to, false), ""]);
  return rows.map((r) => r.map(q).join(",")).join("\n");
}

/* ---------- Sample bill ---------- */

export function sampleBill() {
  let s = store.state,
    friends = s.people.filter((p) => p.id !== s.meId).slice(0, 3),
    created = [];
  if (friends.length < 2) {
    let demo = [
      ["Aman", ["veg"]],
      ["Rohit", []],
      ["Kabir", ["no-alcohol"]],
    ];
    for (let [name, tags] of demo.slice(0, 3 - friends.length)) {
      let p = makePerson(name, { tags, sample: true });
      created.push(p);
      friends.push(p);
    }
  }
  let bill = makeBill({
    title: "Hostel Night Order",
    merchant: "Biryani Blues",
    source: "sample",
    participants: [s.meId, ...friends.map((f) => f.id)].filter(Boolean),
    items: [
      makeItem("Chicken Dum Biryani", 1, 320),
      makeItem("Paneer Butter Masala", 1, 260),
      makeItem("Butter Naan", 6, 240),
      makeItem("Kingfisher Beer", 2, 300),
      makeItem("Gulab Jamun", 4, 120),
    ],
    charges: [makeCharge("delivery", 40), makeCharge("packaging", 30), makeCharge("tax", 62)],
  });
  bill.title = "Hostel Night Order";
  return { bill, created };
}
