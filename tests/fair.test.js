import test from "node:test";
import assert from "node:assert/strict";
import { splitBill, validateBill, ledger, suggest, dietMatches, syncDiet, itemWeights } from "../dist/fair.js";
import { splitExpense } from "../dist/core.js";

const base = (over = {}) => ({
  title: "Dinner",
  payerId: "a",
  participants: ["a", "b", "c"],
  mode: "itemized",
  items: [],
  charges: [],
  total: 0,
  roundTo: 0,
  ...over,
});
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

test("excluded person pays nothing for that item", () => {
  let r = splitBill(base({ total: 300, items: [{ id: "1", name: "Chicken", qty: 1, amount: 300, split: "all", excluded: ["c"] }] }));
  assert.deepEqual(r.shares, { a: 15000, b: 15000, c: 0 });
});

test("diet auto-exclusion is honoured like a manual one", () => {
  let r = splitBill(base({ total: 90, items: [{ id: "1", name: "Beer", qty: 1, amount: 90, split: "all", autoExcluded: ["b"] }] }));
  assert.equal(r.shares.b, 0);
  assert.equal(sum(r.shares), 9000);
});

test("quantity split charges by units claimed", () => {
  let r = splitBill(base({ total: 60, items: [{ id: "1", name: "Roti", qty: 6, amount: 60, split: "custom", byQty: true, portions: { a: 3, b: 2, c: 1 } }] }));
  assert.deepEqual(r.shares, { a: 3000, b: 2000, c: 1000 });
});

test("unclaimed units are split equally across everyone", () => {
  let r = splitBill(base({ total: 60, items: [{ id: "1", name: "Roti", qty: 6, amount: 60, split: "custom", byQty: true, portions: { a: 3 } }] }));
  // 3 claimed rotis = 30 to a; 3 unclaimed = 30 split equally
  assert.deepEqual(r.shares, { a: 4000, b: 1000, c: 1000 });
  assert.equal(r.unclaimed, 3000);
});

test("item nobody claimed is split equally and reported", () => {
  let r = splitBill(base({ total: 100, items: [{ id: "1", name: "Fries", qty: 1, amount: 100, split: "custom", portions: {} }] }));
  assert.deepEqual(r.shares, { a: 3334, b: 3333, c: 3333 });
  assert.equal(r.unclaimed, 10000);
});

test("delivery fee is equal among people who ordered only", () => {
  let r = splitBill(
    base({
      total: 230,
      items: [
        { id: "1", name: "Pizza", qty: 1, amount: 150, split: "custom", portions: { a: 1 } },
        { id: "2", name: "Pasta", qty: 1, amount: 50, split: "custom", portions: { b: 1 } },
      ],
      charges: [{ id: "c", kind: "delivery", amount: 30 }],
    }),
  );
  assert.deepEqual(r.shares, { a: 16500, b: 6500, c: 0 });
});

test("tax follows what each person ordered", () => {
  let r = splitBill(
    base({
      total: 110,
      items: [
        { id: "1", name: "A", qty: 1, amount: 60, split: "custom", portions: { a: 1 } },
        { id: "2", name: "B", qty: 1, amount: 40, split: "custom", portions: { b: 1 } },
      ],
      charges: [{ id: "t", kind: "tax", amount: 10 }],
    }),
  );
  assert.deepEqual(r.shares, { a: 6600, b: 4400, c: 0 });
});

test("split tax off makes the payer cover tax", () => {
  let r = splitBill(
    base({
      total: 110,
      items: [{ id: "1", name: "A", qty: 1, amount: 100, split: "custom", portions: { b: 1 } }],
      charges: [{ id: "t", kind: "tax", amount: 10, rule: "payer" }],
    }),
  );
  assert.deepEqual(r.shares, { a: 1000, b: 10000, c: 0 });
});

test("coupon can be credited to its owner", () => {
  let r = splitBill(
    base({
      total: 200,
      items: [{ id: "1", name: "Thali", qty: 2, amount: 300, split: "custom", portions: { b: 1, c: 1 } }],
      charges: [{ id: "d", kind: "discount", amount: -100, rule: "person", personId: "b" }],
    }),
  );
  assert.deepEqual(r.shares, { a: 0, b: 5000, c: 15000 });
});

test("disputed item sits with the payer", () => {
  let r = splitBill(
    base({
      total: 100,
      items: [
        { id: "1", name: "A", qty: 1, amount: 60, split: "all" },
        { id: "2", name: "Mystery", qty: 1, amount: 40, split: "all", disputed: true },
      ],
    }),
  );
  assert.deepEqual(r.shares, { a: 6000, b: 2000, c: 2000 });
  assert.equal(r.disputed, 4000);
});

test("receipt total difference is reconciled proportionally", () => {
  let r = splitBill(
    base({
      total: 105,
      items: [
        { id: "1", name: "A", qty: 1, amount: 60, split: "custom", portions: { a: 1 } },
        { id: "2", name: "B", qty: 1, amount: 40, split: "custom", portions: { b: 1 } },
      ],
    }),
  );
  assert.deepEqual(r.shares, { a: 6300, b: 4200, c: 0 });
  assert.equal(r.lines.a.adjustment, 300);
  assert.equal(r.diff, 500);
});

test("rounding: payer absorbs the difference, total is preserved", () => {
  let r = splitBill(base({ total: 100, roundTo: 5, items: [{ id: "1", name: "Cake", qty: 1, amount: 100, split: "all" }] }));
  // 33.34/33.33/33.33 -> others round to 35, payer takes 30
  assert.deepEqual(r.shares, { a: 3000, b: 3500, c: 3500 });
  assert.equal(r.lines.a.rounding, -334);
});

test("payer outside the bill still gets disputed items and rounding", () => {
  let r = splitBill(base({ payerId: "z", total: 100, roundTo: 10, items: [{ id: "1", name: "X", qty: 1, amount: 100, split: "all" }] }));
  assert.equal(sum(r.shares), 10000);
  assert.equal(r.shares.a, 3000);
  assert.equal(r.shares.z, 1000);
});

test("equal mode matches the existing engine", () => {
  let bill = base({ mode: "equal", total: 100, participants: ["a", "b", "c"] });
  assert.deepEqual(splitBill(bill).shares, splitExpense({ total: 100, mode: "equal", participants: ["a", "b", "c"], values: {} }, [{ id: "a" }, { id: "b" }, { id: "c" }]));
});

test("property: shares always add up and excluded people never pay for items", () => {
  let rnd = (() => {
    let s = 42;
    return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  })();
  let ids = ["a", "b", "c", "d", "e"];
  for (let n = 0; n < 500; n++) {
    let people = ids.slice(0, 1 + Math.floor(rnd() * 5));
    let items = Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, i) => {
      let custom = rnd() < 0.5;
      return {
        id: "i" + i,
        name: "x",
        qty: 1 + Math.floor(rnd() * 4),
        amount: Math.round(rnd() * 50000) / 100,
        split: custom ? "custom" : "all",
        byQty: custom && rnd() < 0.5,
        portions: Object.fromEntries(people.filter(() => rnd() < 0.6).map((p) => [p, 1 + Math.floor(rnd() * 3)])),
        excluded: people.filter(() => rnd() < 0.3),
        disputed: rnd() < 0.1,
      };
    });
    let charges = Array.from({ length: Math.floor(rnd() * 3) }, (_, i) => ({
      id: "c" + i,
      kind: ["tax", "delivery", "discount", "packaging"][Math.floor(rnd() * 4)],
      amount: (rnd() < 0.3 ? -1 : 1) * Math.round(rnd() * 5000) / 100,
    }));
    let itemsSum = items.reduce((a, x) => a + Math.round(x.amount * 100), 0) + charges.reduce((a, x) => a + Math.round(x.amount * 100), 0);
    let total = Math.max(1, itemsSum + Math.round((rnd() - 0.5) * 1000)) / 100;
    let bill = base({ participants: people, payerId: people[0], items, charges, total, roundTo: [0, 0, 1, 5, 10][Math.floor(rnd() * 5)] });
    let r = splitBill(bill);
    assert.equal(sum(r.shares), Math.round(total * 100), `bill ${n} sums`);
    if (!charges.length && r.diff === 0 && !bill.roundTo)
      for (let it of items) {
        let w = itemWeights(it, people);
        people.forEach((p, i) => {
          if (w[i] || it.disputed || !w.some(Boolean) || it.byQty) return;
          let line = r.lines[p].items.find((l) => l.id === it.id);
          assert.ok(!line, `bill ${n}: ${p} charged for excluded item`);
        });
      }
  }
});

test("validation explains what is missing", () => {
  let errs = validateBill(base({ title: "", total: 0, items: [{ id: "1", name: "", qty: 1, amount: 10 }] }));
  let fields = errs.map((e) => e.field);
  assert.ok(fields.includes("title") && fields.includes("total") && fields.includes("item:1"));
  assert.deepEqual(validateBill(base({ total: 10, items: [{ id: "1", name: "Tea", qty: 1, amount: 10 }] })), []);
  assert.equal(validateBill(base({ mode: "percent", total: 10, custom: { a: 50, b: 30 } }))[0].field, "custom");
});

test("ledger and suggestions settle a bill and hide tiny payments", () => {
  let bills = [{ ...base({ total: 90, items: [{ id: "1", name: "X", qty: 1, amount: 90, split: "all" }] }), status: "final", groupId: null }];
  let b = ledger(bills, []);
  assert.deepEqual(b, { a: 6000, b: -3000, c: -3000 });
  assert.equal(suggest(b).length, 2);
  assert.equal(suggest(b, 50).length, 0);
  let paid = ledger(bills, [{ from: "b", to: "a", amount: 30, groupId: null }]);
  assert.equal(paid.b, 0);
});

test("diet matching is word-aware", () => {
  assert.deepEqual(dietMatches("Chicken Biryani", ["veg"]), ["veg"]);
  assert.deepEqual(dietMatches("Veg Biryani", ["veg"]), []);
  assert.deepEqual(dietMatches("Non Veg Thali", ["veg"]), ["veg"]);
  assert.deepEqual(dietMatches("Eggless Cake", ["veg", "no-egg"]), []);
  assert.deepEqual(dietMatches("Masala Omelette", ["no-egg"]), ["no-egg"]);
  assert.deepEqual(dietMatches("Ginger Beer", ["no-alcohol"]), []);
  assert.deepEqual(dietMatches("Kingfisher Beer", ["no-alcohol"]), ["no-alcohol"]);
  assert.deepEqual(dietMatches("Rumali Roti", ["no-alcohol"]), []);
  assert.deepEqual(dietMatches("Hamburger", ["veg"]), []);
});

test("syncDiet respects overrides and custom items", () => {
  let bill = base({
    items: [
      { id: "1", name: "Chicken Tikka", qty: 1, amount: 10, split: "all" },
      { id: "2", name: "Chicken Roll", qty: 1, amount: 10, split: "all", dietOverride: ["b"] },
      { id: "3", name: "Chicken Soup", qty: 1, amount: 10, split: "custom", portions: { b: 1 } },
    ],
  });
  syncDiet(bill, [{ id: "a" }, { id: "b", tags: ["veg"] }, { id: "c" }]);
  assert.deepEqual(bill.items.map((i) => i.autoExcluded), [["b"], [], []]);
});
