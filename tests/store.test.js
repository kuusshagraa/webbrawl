import test from "node:test";
import assert from "node:assert/strict";
import { migrateV1, normalize, parseBackup, load, addMonth, runRecurring, emptyState, KEY, V1_KEY } from "../dist/store.js";
import { splitExpense } from "../dist/core.js";
import { splitBill, ledger } from "../dist/fair.js";
import { encode, decode, packBill, unpackBill } from "../dist/share.js";

const v1 = {
  groups: [
    {
      id: "g1",
      name: "Night Canteen",
      budget: 5000,
      members: [
        { id: "m1", name: "Riya", upi: "riya@upi" },
        { id: "m2", name: "Arjun" },
        { id: "m3", name: "Meera" },
      ],
      expenses: [
        {
          id: "e1",
          description: "Dinner",
          date: "2025-01-02",
          payer: "m1",
          total: 1003.37,
          mode: "itemized",
          items: [
            { name: "Biryani", qty: 2, price: 250.5, assigned: ["m1", "m2"] },
            { name: "Kebab", qty: 1, price: 333.33, assigned: ["m2", "m3"] },
            { name: "Lassi", qty: 3, price: 40, assigned: ["m3"] },
          ],
          charges: [{ name: "GST", amount: 49 }],
        },
        { id: "e2", description: "Cab", date: "2025-01-03", payer: "m2", total: 100, mode: "shares", participants: ["m3", "m1"], values: { m1: 2, m3: 1 } },
      ],
      settlements: [{ id: "s1", from: "m3", to: "m1", amount: 12345, date: "2025-01-04" }],
      recurring: [],
    },
  ],
  active: "g1",
};

test("v1 migration keeps every person's share identical", () => {
  let s = migrateV1(v1),
    g = v1.groups[0],
    byName = Object.fromEntries(s.people.map((p) => [p.name, p.id]));
  for (let [i, e] of g.expenses.entries()) {
    let old = splitExpense(e, g.members),
      fresh = splitBill(s.bills[i]).shares;
    for (let m of g.members) assert.equal(fresh[byName[m.name]] || 0, old[m.id], `${e.description} ${m.name}`);
  }
  assert.equal(s.settlements[0].amount, 123.45);
  assert.equal(s.groups[0].target, 5000);
  assert.equal(s.people.find((p) => p.name === "Riya").upi, "riya@upi");
  let b = ledger(s.bills, s.settlements, s.groups[0].id);
  assert.equal(Object.values(b).reduce((a, x) => a + x, 0), 0);
});

test("migrated state survives normalize", () => {
  let s = migrateV1(v1);
  assert.doesNotThrow(() => normalize(JSON.parse(JSON.stringify(s))));
});

test("load recovers from corrupted storage without losing the raw data", () => {
  let mem = { [KEY]: "{not json" },
    st = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => (mem[k] = v) };
  let r = load(st);
  assert.equal(r.notice.type, "corrupt");
  assert.equal(mem[r.notice.key], "{not json");
  assert.deepEqual(r.state.bills, []);
});

test("load migrates v1 when no v2 data exists", () => {
  let mem = { [V1_KEY]: JSON.stringify(v1) },
    st = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => (mem[k] = v) };
  let r = load(st);
  assert.equal(r.notice.type, "migrated");
  assert.equal(r.state.bills.length, 2);
});

test("import rejects broken backups with a reason", () => {
  assert.throws(() => parseBackup("nope"), /valid JSON/);
  assert.throws(() => parseBackup(JSON.stringify({ version: 2, people: [] })), /missing/);
  let bad = { ...emptyState(), bills: [{ id: "b", title: "X", participants: ["ghost"], payerId: "ghost", status: "final" }] };
  assert.throws(() => parseBackup(JSON.stringify(bad)), /isn't in the backup/);
  assert.equal(parseBackup(JSON.stringify({ version: 1, group: v1.groups[0] })).bills.length, 2);
});

test("monthly recurrence clamps to month length and catches up", () => {
  assert.equal(addMonth("2025-01-31", 31), "2025-02-28");
  assert.equal(addMonth("2025-02-28", 31), "2025-03-31");
  assert.equal(addMonth("2025-12-15", 15), "2026-01-15");
  let s = emptyState();
  s.groups.push({ id: "g", memberIds: [], recurring: [{ id: "r", next: "2025-01-31", day: 31, template: { title: "Rent", participants: [], items: [], charges: [] } }] });
  assert.equal(runRecurring(s, "2025-04-01"), 3);
  assert.deepEqual(s.bills.map((b) => b.date), ["2025-01-31", "2025-02-28", "2025-03-31"]);
  assert.equal(s.groups[0].recurring[0].next, "2025-04-30");
});

test("share link round-trips a bill and recomputes the same split", async () => {
  let s = migrateV1(v1),
    bill = s.bills[0];
  let link = await encode(packBill(bill, s.people));
  assert.match(link, /^[zj][A-Za-z0-9_-]+$/);
  let packed = await decode(link),
    ids = packed.people.map((_, i) => "p" + i),
    copy = unpackBill(packed, ids);
  let a = Object.values(splitBill(bill).shares),
    b = Object.values(splitBill(copy).shares);
  assert.deepEqual(b, a);
  assert.equal(packed.people[0].name, "Riya");
});

test("share link rejects tampered input", async () => {
  await assert.rejects(decode("zAAAA"));
  await assert.rejects(decode("x123"));
  let bogus = "j" + Buffer.from(JSON.stringify({ v: 1, people: [], items: [], charges: [] })).toString("base64url");
  await assert.rejects(decode(bogus), /bad-link/);
});
