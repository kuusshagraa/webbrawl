import test from "node:test";
import assert from "node:assert/strict";
import { overdue } from "../dist/remind.js";

const bill = (id, date, total, participants, payerId = "me", groupId = null) => ({ id, title: id, date, total, participants, payerId, groupId, mode: "equal", items: [], charges: [], status: "final" });

test("money owed to me for 3+ days is reported with its bills", () => {
  let s = { meId: "me", prefs: { ignoreUnder: 0 }, groups: [], settlements: [], bills: [bill("Uber", "2026-10-25", 300, ["me", "r"]), bill("Chai", "2026-10-31", 60, ["me", "r"])] };
  let o = overdue(s, "2026-11-01");
  assert.equal(o.length, 1);
  assert.equal(o[0].from, "r");
  assert.equal(o[0].amount, 18000);
  assert.equal(o[0].days, 7);
  assert.equal(o[0].what, "Uber and 1 more");
});

test("recent dues, my own debts and settled people are not reminders", () => {
  let s = { meId: "me", prefs: { ignoreUnder: 0 }, groups: [], settlements: [], bills: [bill("Fresh", "2026-10-31", 100, ["me", "a"]), bill("Theirs", "2026-10-01", 100, ["me", "k"], "k")] };
  assert.deepEqual(overdue(s, "2026-11-01"), []);
  let paid = { ...s, bills: [bill("Old", "2026-10-01", 100, ["me", "a"])], settlements: [{ from: "a", to: "me", amount: 50, date: "2026-10-02", groupId: null }] };
  assert.deepEqual(overdue(paid, "2026-11-01"), []);
});

test("only bills after the last payment count towards the age", () => {
  let s = { meId: "me", prefs: { ignoreUnder: 0 }, groups: [], bills: [bill("Old", "2026-09-01", 100, ["me", "a"]), bill("New", "2026-10-28", 100, ["me", "a"])], settlements: [{ from: "a", to: "me", amount: 50, date: "2026-09-05", groupId: null }] };
  let o = overdue(s, "2026-11-01");
  assert.equal(o[0].days, 4);
  assert.equal(o[0].what, "New");
});
