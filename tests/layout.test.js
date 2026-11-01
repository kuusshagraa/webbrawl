import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseWords, splitNumbers } from "../dist/layout.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const sum = (xs) => Math.round(xs.reduce((a, x) => a + x * 100, 0)) / 100;

test("fused number columns are split using qty x rate = amount", () => {
  assert.deepEqual(splitNumbers("Masala Dosa 2212.00424.00"), { name: "Masala Dosa", nums: ["2", "212.00", "424.00"] });
  assert.deepEqual(splitNumbers("Badam Milk (Cold) 1122.00122.00"), { name: "Badam Milk (Cold)", nums: ["1", "122.00", "122.00"] });
  assert.deepEqual(splitNumbers("Thatte Idli 167.00167.00"), { name: "Thatte Idli", nums: ["1", "167.00", "167.00"] });
  assert.deepEqual(splitNumbers("Ghee Podi Masala 230.00 690.00"), { name: "Ghee Podi Masala", nums: ["3", "230.00", "690.00"] });
  assert.deepEqual(splitNumbers("Filter Coffee 1 95.0095.00"), { name: "Filter Coffee", nums: ["1", "95.00", "95.00"] });
});

test("tilted restaurant photo: every item, wrapped names, taxes and total", () => {
  let r = parseWords(fixture("restaurant-photo.v5.json"));
  assert.equal(r.items.length, 14, r.items.map((i) => i.name).join(" | "));
  assert.equal(sum(r.items.map((i) => i.amount)), 4543);
  assert.equal(r.total, 4770);
  assert.deepEqual(r.charges.filter((c) => c.kind === "tax").map((c) => c.amount), [113.58, 113.58]);
  let byName = Object.fromEntries(r.items.map((i) => [i.name, i]));
  assert.equal(byName["Kalmi Vada Dahi Chaat"]?.qty, 3);
  assert.equal(byName["Garlic Roast Masala Dosa"]?.amount, 460);
  assert.equal(byName["The OG Cold Coffee"]?.qty, 3);
  assert.ok(r.items.some((i) => /^Kokum Cooler/.test(i.name) && /Real Fruit/.test(i.name)));
  assert.equal(byName["Thatte Idli"]?.amount, 167);
  // Items + charges reconcile with the printed total.
  assert.equal(sum([...r.items.map((i) => i.amount), ...r.charges.map((c) => c.amount)]), 4770);
});

test("digital bill: items only, nothing from after the total", () => {
  let r = parseWords(fixture("digital-bill.v5.json"));
  assert.deepEqual(r.items.map((i) => [i.qty, i.amount]), [[2, 240], [1, 90], [2, 120]]);
  assert.equal(r.items[0].name, "Paneer Tikka");
  assert.equal(r.items[1].name, "Butter Naan");
  assert.equal(r.total, 472.5);
  assert.deepEqual(r.charges.map((c) => [c.kind, c.amount]), [["tax", 11.25], ["tax", 11.25]]);
  assert.equal(r.merchant, "Tasty Forks");
  assert.equal(r.date, "2026-02-06");
});

test("stray punctuation glued to a price is not part of the name", () => {
  assert.deepEqual(splitNumbers("Badam Milk (Cold) )1122.00122.00"), { name: "Badam Milk (Cold)", nums: ["1", "122.00", "122.00"] });
});

test("printed receipt: 'qty x rate amount', glued date/time and fused tax rate", () => {
  let r = parseWords(fixture("printed-receipt.v5.json"));
  assert.deepEqual(r.items.map((i) => [i.qty, i.name, i.amount]), [
    [3, "Masala Chai", 90],
    [1, "Veg Sandwich", 120],
    [2, "Chicken Roll", 170],
    [1, "Brownie", 75],
  ]);
  assert.deepEqual(r.charges.map((c) => [c.label, c.amount]), [["CGST 2.5%", 11.38], ["SGST 2.5%", 11.38]]);
  assert.equal(r.total, 477.76);
  assert.equal(r.date, "2025-10-12");
  assert.equal(r.time, "19:45");
  assert.equal(r.merchant, "Chai Point Cafe");
});
