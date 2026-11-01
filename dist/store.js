import { money, allocate } from "./core.js";

export const KEY = "splitsmart-v2";
export const DEMO_KEY = "splitsmart-demo-v2";
const DEMO_FLAG = "splitsmart-demo";
export const V1_KEY = "splitsmart-v1";
const uid = () =>
  globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36);
export const newId = uid;
export const todayISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const emptyState = () => ({
  version: 2,
  meId: null,
  people: [],
  groups: [],
  bills: [],
  settlements: [],
  prefs: { ignoreUnder: 0, roundTo: 0, lastBackup: null, onboarded: false, backupSnooze: null },
});

// v1 stored one ledger per group with members embedded. Each member becomes a
// person, each expense a final bill whose split is unchanged: v1 spread the
// difference between items and total by item subtotals, which is exactly one
// proportional charge over all group members in member order.
export function migrateV1(v1) {
  let s = emptyState();
  for (let g of v1?.groups || []) {
    if (!g || !Array.isArray(g.members)) continue;
    let ids = {};
    for (let m of g.members) {
      let id = uid();
      ids[m.id] = id;
      s.people.push({ id, name: String(m.name || "Friend").slice(0, 40), upi: m.upi || "", tags: [], avatar: { seed: id } });
    }
    let order = g.members.map((m) => ids[m.id]),
      groupId = uid(),
      convert = (e) => {
        let itemized = e.mode === "itemized",
          items = (e.items || []).map((it) => ({
            id: uid(),
            name: it.name || "Item",
            qty: Number(it.qty) || 1,
            amount: money(Number(it.qty) * Number(it.price)) / 100,
            split: "custom",
            portions: Object.fromEntries((it.assigned || []).filter((a) => ids[a]).map((a) => [ids[a], 1])),
            byQty: false,
            category: it.category || "Other",
            low: false,
          })),
          diff = money(e.total) - items.reduce((a, x) => a + money(x.amount), 0),
          labels = (e.charges || []).map((c) => c.name).filter(Boolean).join(" + ");
        return {
          id: uid(),
          title: e.description || "Expense",
          merchant: "",
          date: e.date || todayISO(),
          time: "",
          icon: "",
          payerId: ids[e.payer] || order[0],
          participants: itemized ? order : order.filter((id) => (e.participants || []).some((p) => ids[p] === id)),
          groupId,
          mode: itemized ? "itemized" : e.mode || "equal",
          items: itemized ? items : [],
          charges: itemized && diff ? [{ id: uid(), kind: "other", label: labels || "Taxes & adjustments", amount: diff / 100, rule: "proportional", personId: null }] : [],
          custom: Object.fromEntries(Object.entries(e.values || {}).filter(([k]) => ids[k]).map(([k, v]) => [ids[k], v])),
          total: Number(e.total) || 0,
          roundTo: 0,
          category: e.category || "Other",
          status: "final",
          createdAt: Date.now(),
        };
      };
    s.groups.push({
      id: groupId,
      name: String(g.name || "Group").slice(0, 60),
      memberIds: order,
      target: Number(g.budget) || 0,
      recurring: (g.recurring || []).filter((r) => r?.expense).map((r) => {
        let b = convert(r.expense);
        return { id: uid(), next: r.next, day: Number(String(r.next).slice(8, 10)) || 1, template: b };
      }),
      createdAt: Date.now(),
    });
    for (let e of g.expenses || []) s.bills.push(convert(e));
    for (let t of g.settlements || [])
      if (ids[t.from] && ids[t.to])
        // v1 recorded settlements in paise; v2 stores rupees like every other amount.
        s.settlements.push({ id: uid(), groupId, from: ids[t.from], to: ids[t.to], amount: Math.round(Number(t.amount)) / 100, date: t.date || todayISO() });
  }
  return s;
}

// Throws if the shape is not a usable v2 state; fills optional fields.
export function normalize(raw) {
  if (!raw || typeof raw !== "object" || raw.version !== 2) throw new Error("Not a SplitSmart backup.");
  for (let k of ["people", "groups", "bills", "settlements"])
    if (!Array.isArray(raw[k])) throw new Error(`Backup is missing ${k}.`);
  let s = { ...emptyState(), ...raw, prefs: { ...emptyState().prefs, ...(raw.prefs || {}) } };
  let ids = new Set();
  for (let p of s.people) {
    if (!p || typeof p.id !== "string" || typeof p.name !== "string") throw new Error("A person in the backup is invalid.");
    p.tags = Array.isArray(p.tags) ? p.tags : [];
    p.avatar = p.avatar && typeof p.avatar === "object" ? p.avatar : { seed: p.id };
    p.upi = p.upi || "";
    ids.add(p.id);
  }
  for (let b of s.bills) {
    if (!b || typeof b.id !== "string" || !Array.isArray(b.participants)) throw new Error("A bill in the backup is invalid.");
    b.items = Array.isArray(b.items) ? b.items : [];
    b.charges = Array.isArray(b.charges) ? b.charges : [];
    b.custom = b.custom || {};
    b.mode = b.mode || "itemized";
    b.status = b.status === "draft" ? "draft" : "final";
    for (let it of b.items) {
      it.split = it.split === "custom" ? "custom" : "all";
      it.portions = it.portions || {};
      it.excluded = it.excluded || [];
      it.autoExcluded = it.autoExcluded || [];
    }
    if (b.status === "final" && (!ids.has(b.payerId) || !b.participants.every((id) => ids.has(id))))
      throw new Error(`Bill "${b.title}" refers to someone who isn't in the backup.`);
  }
  for (let g of s.groups) {
    if (!g || typeof g.id !== "string" || !Array.isArray(g.memberIds)) throw new Error("A group in the backup is invalid.");
    g.recurring = Array.isArray(g.recurring) ? g.recurring : [];
  }
  for (let t of s.settlements)
    if (!t || !ids.has(t.from) || !ids.has(t.to) || !Number.isFinite(Number(t.amount)))
      throw new Error("A payment in the backup is invalid.");
  if (s.meId && !ids.has(s.meId)) s.meId = null;
  return s;
}

// Accepts a v2 backup or a v1 single-group export.
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (data?.version === 1 && data.group) {
    let g = data.group;
    if (!Array.isArray(g.members) || !Array.isArray(g.expenses)) throw new Error("This old backup is incomplete.");
    return migrateV1({ groups: [{ settlements: [], ...g }] });
  }
  return normalize(data);
}

// Adds months keeping the anchor day, clamped to the month's length
// (31 Jan -> 28/29 Feb -> 31 Mar).
export function addMonth(iso, day) {
  let [y, m] = iso.split("-").map(Number);
  m += 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  let last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

export function runRecurring(s, today = todayISO()) {
  let made = 0;
  for (let g of s.groups)
    for (let r of g.recurring || []) {
      let guard = 0;
      while (r.next && r.next <= today && guard++ < 36) {
        s.bills.push({ ...structuredClone(r.template), id: uid(), date: r.next, groupId: g.id, status: "final", recurringId: r.id, createdAt: Date.now() });
        r.next = addMonth(r.next, r.day || Number(r.next.slice(8, 10)));
        made++;
      }
    }
  return made;
}

export function load(storage, key = KEY) {
  let notice = null,
    s;
  let raw = storage.getItem(key);
  if (raw) {
    try {
      s = normalize(JSON.parse(raw));
    } catch (e) {
      let key = "splitsmart-corrupt-" + Date.now();
      try {
        storage.setItem(key, raw);
      } catch {}
      s = emptyState();
      notice = { type: "corrupt", key };
    }
  } else if (key === KEY) {
    let old = storage.getItem(V1_KEY);
    s = emptyState();
    if (old) {
      try {
        s = migrateV1(JSON.parse(old));
        notice = s.people.length ? { type: "migrated" } : null;
      } catch {
        notice = { type: "corrupt", key: V1_KEY };
      }
    }
  }
  return { state: s, notice };
}

/* ---------- Live store for the app ---------- */

export const store = { state: emptyState(), notice: null };
let storage = null,
  listeners = [],
  activeKey = KEY;
const session = () => {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
};
// The guided demo runs in its own storage slot; real data is never touched.
export const inDemo = () => activeKey === DEMO_KEY;
export function enterDemo(state) {
  activeKey = DEMO_KEY;
  session()?.setItem(DEMO_FLAG, "1");
  store.state = state;
  store.notice = null;
  persist();
}
export function exitDemo() {
  session()?.removeItem(DEMO_FLAG);
  try {
    storage?.removeItem(DEMO_KEY);
  } catch {}
  activeKey = KEY;
}
export function initStore(st = globalThis.localStorage) {
  storage = st;
  if (session()?.getItem(DEMO_FLAG) && st.getItem(DEMO_KEY)) activeKey = DEMO_KEY;
  let r = load(st, activeKey);
  store.state = r.state;
  store.notice = r.notice;
  if (runRecurring(store.state)) persist();
  return r;
}
export const onPersistError = (fn) => listeners.push(fn);
export function persist() {
  if (!storage) return true;
  try {
    storage.setItem(activeKey, JSON.stringify(store.state));
    return true;
  } catch (e) {
    listeners.forEach((fn) => fn(e));
    return false;
  }
}
export const snapshot = () => JSON.stringify(store.state);
export function restore(snap) {
  store.state = normalize(JSON.parse(snap));
  persist();
}
export function replaceState(s) {
  store.state = s;
  persist();
}

/* ---------- Selectors ---------- */

export const S = () => store.state;
export const person = (id) => store.state.people.find((p) => p.id === id);
export const me = () => person(store.state.meId);
export const bill = (id) => store.state.bills.find((b) => b.id === id);
export const groupOf = (id) => store.state.groups.find((g) => g.id === id);
export const nameOf = (id, you = true) =>
  you && id === store.state.meId ? "You" : person(id)?.name || "Someone";
export function usedPeople() {
  let used = new Set();
  for (let b of store.state.bills) {
    if (b.status !== "final") continue;
    used.add(b.payerId);
    b.participants.forEach((id) => used.add(id));
  }
  for (let t of store.state.settlements) {
    used.add(t.from);
    used.add(t.to);
  }
  return used;
}
// Equal split of a total, used by the sample bill and quick previews.
export const equalParts = (total, n) => allocate(money(total), Array(n).fill(1));
