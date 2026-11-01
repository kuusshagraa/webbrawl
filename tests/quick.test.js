import test from "node:test";
import assert from "node:assert/strict";
import { parseQuick, inferCategory, templates } from "../dist/quick.js";

const people = [
  { id: "me", name: "Jelly Sharma" },
  { id: "r", name: "Rohit Mehra" },
  { id: "a", name: "Aman" },
  { id: "k", name: "Kabir Singh" },
];
const groups = [{ id: "g", name: "Hostel Wing B", memberIds: ["me", "r", "a", "k"] }];
const ctx = { people, groups, meId: "me", today: "2026-11-01" };
const q = (text) => parseQuick(text, ctx);

test("amount, title, category and people from one sentence", () => {
  let r = q("Uber 640 with Rohit and Aman");
  assert.equal(r.amount, 640);
  assert.equal(r.title, "Uber");
  assert.equal(r.category, "Travel");
  assert.deepEqual(r.participants, ["me", "r", "a"]);
  assert.equal(r.payerId, "me");
  assert.equal(r.split, "equal");
  assert.deepEqual(r.unknown, []);
});

test("someone else paid, k amounts and everyone", () => {
  let r = q("Rohit paid 1.2k dinner with everyone");
  assert.equal(r.amount, 1200);
  assert.equal(r.payerId, "r");
  assert.equal(r.title, "Dinner");
  assert.equal(r.category, "Food");
  assert.deepEqual(r.participants.sort(), ["a", "k", "me", "r"]);
  assert.equal(r.groupId, "g");
});

test("for a person means they owe the whole amount", () => {
  let r = q("auto 80 for Aman");
  assert.equal(r.split, "owe");
  assert.deepEqual(r.participants, ["a"]);
  assert.equal(r.payerId, "me");
  assert.equal(r.title, "Auto");
  assert.equal(r.category, "Travel");
  assert.equal(q("Aman owes 300 for movie tickets").split, "owe");
});

test("dates, group names and currency formats", () => {
  let r = q("yesterday swiggy ₹1,250.50 with hostel wing");
  assert.equal(r.date, "2026-10-31");
  assert.equal(r.amount, 1250.5);
  assert.equal(r.groupId, "g");
  assert.equal(r.category, "Food");
  assert.equal(r.title, "Swiggy");
  assert.equal(q("rs 99 chai").amount, 99);
});

test("names are matched loosely and unknown names reported", () => {
  assert.deepEqual(q("chai 60 with rohith").participants, ["me", "r"]);
  assert.deepEqual(q("chai 60 with kabir singh").participants, ["me", "k"]);
  let r = q("movie 500 with priya and aman");
  assert.deepEqual(r.participants, ["me", "a"]);
  assert.deepEqual(r.unknown, ["Priya"]);
  assert.equal(r.category, "Entertainment");
});

test("missing pieces stay empty instead of guessing", () => {
  let r = q("groceries with kabir");
  assert.equal(r.amount, null);
  assert.equal(r.title, "Groceries");
  assert.equal(q("").title, "");
  assert.deepEqual(q("640").participants, []);
});

test("category inference", () => {
  assert.equal(inferCategory("Ola to airport"), "Travel");
  assert.equal(inferCategory("Blinkit order"), "Groceries");
  assert.equal(inferCategory("Starbucks"), "Coffee");
  assert.equal(inferCategory("Wifi bill"), "Utilities");
  assert.equal(inferCategory("Something random"), "Other");
});

test("templates rank repeated quick expenses", () => {
  let mk = (title, amount, participants, date, hour = 20) => ({ status: "final", source: "quick", title, total: amount, participants, payerId: "me", mode: "equal", date, time: `${hour}:00`, createdAt: Date.parse(date) });
  let bills = [mk("Uber", 640, ["me", "r", "a"], "2026-10-01"), mk("Uber", 610, ["me", "r", "a"], "2026-10-05"), mk("Chai", 60, ["me", "k"], "2026-10-06", 9)];
  let t = templates(bills, { hour: 21 });
  assert.equal(t[0].title, "Uber");
  assert.equal(t[0].amount, 610);
  assert.deepEqual(t[0].participants, ["me", "r", "a"]);
  assert.equal(t.length, 2);
});
