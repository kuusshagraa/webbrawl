import test from "node:test";
import assert from "node:assert/strict";
import { monthStats, prevMonth } from "../dist/wrapped.js";

const item = (name, amount, extra = {}) => ({ id: name, name, qty: 1, amount, split: "all", excluded: [], autoExcluded: [], ...extra });
const state = {
  meId: "me",
  bills: [
    { id: "1", title: "Hostel Night", status: "final", date: "2026-10-03", payerId: "r", participants: ["me", "r", "a"], mode: "itemized", total: 900, category: "Food", charges: [], items: [item("Chicken Biryani", 300, { autoExcluded: ["me"] }), item("Butter Naan", 300), item("Lassi", 300, { split: "custom", portions: { a: 1 } })] },
    { id: "2", title: "Uber", status: "final", date: "2026-10-10", payerId: "me", participants: ["me", "r"], mode: "equal", total: 400, category: "Travel", items: [], charges: [] },
    { id: "3", title: "Naan run", status: "final", date: "2026-10-12", payerId: "r", participants: ["me", "r"], mode: "itemized", total: 100, category: "Food", charges: [], items: [item("Butter Naan", 100)] },
    { id: "4", title: "Old", status: "final", date: "2026-09-30", payerId: "me", participants: ["me"], mode: "equal", total: 999, items: [], charges: [] },
    { id: "5", title: "Draft", status: "draft", date: "2026-10-15", payerId: "me", participants: ["me"], mode: "equal", total: 50, items: [], charges: [] },
  ],
};

test("month totals and my share", () => {
  let s = monthStats(state, "2026-10");
  assert.equal(s.count, 3);
  assert.equal(s.total, 140000);
  // Biryani 0 (veg) + Naan 100 + Uber 200 + Naan run 50
  assert.equal(s.myShare, 35000);
  assert.deepEqual(s.biggest, { title: "Hostel Night", amount: 90000 });
});

test("top category, group ATM, crowd favourite and diet savings", () => {
  let s = monthStats(state, "2026-10");
  assert.deepEqual(s.topCategory, { name: "Travel", amount: 20000 });
  assert.deepEqual(s.topPayer, { id: "r", amount: 100000 });
  assert.deepEqual(s.favourite, { name: "Butter Naan", count: 2 });
  // Without the veg tag I'd have paid a third of the ₹300 biryani.
  assert.equal(s.dietSaved, 10000);
});

test("empty months and month arithmetic", () => {
  assert.equal(monthStats(state, "2026-08").count, 0);
  assert.equal(prevMonth("2026-01-05"), "2025-12");
  assert.equal(prevMonth("2026-11-01"), "2026-10");
});
