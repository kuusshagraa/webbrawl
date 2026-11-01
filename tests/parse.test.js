import test from "node:test";
import assert from "node:assert/strict";
import { parseText, chargeKind, detectSource } from "../dist/parse.js";

test("printed receipt with QTY DESC AMT layout", () => {
  let r = parseText(`GOURMET COFFEE
ADDRESS, STREET LOCATION
4/09/2024 8:36:18 AM
TABLE 3 HOST: JAMES
TAX INVOICE: ABN: 11346093268
QTY DESC AMT
1 CAPUCCINO $5.40
1 CHOCOLATE DONUT $8.13
2 CAESAR SALAD $23.38
1 ICED TEA $4.60
SUBTOTAL: $41.51
SALE TAX: $3.10
AMOUNT $44.61
*** THANK YOU ***`);
  assert.equal(r.source, "receipt");
  assert.equal(r.merchant, "Gourmet Coffee");
  assert.equal(r.date, "2024-09-04");
  assert.equal(r.time, "08:36");
  assert.deepEqual(
    r.items.map((i) => [i.qty, i.name, i.amount]),
    [
      [1, "Capuccino", 5.4],
      [1, "Chocolate Donut", 8.13],
      [2, "Caesar Salad", 23.38],
      [1, "Iced Tea", 4.6],
    ],
  );
  assert.deepEqual(r.charges, [{ kind: "tax", label: "Sale Tax", amount: 3.1 }]);
  assert.equal(r.total, 44.61);
  assert.equal(r.subtotal, 41.51);
});

test("Indian restaurant bill with rate and amount columns", () => {
  let r = parseText(`Hotel Saravana Bhavan
GSTIN 33AAACH1234F1Z5
Date: 12/08/2025
Masala Dosa 2 x 90.00 180.00
Filter Coffee 3 40.00 120.00
Butter Naan x 4 160
CGST 2.5% 11.50
SGST 2.5% 11.50
Round Off 0.00
Grand Total ₹ 483.00`);
  assert.equal(r.merchant, "Hotel Saravana Bhavan");
  assert.equal(r.date, "2025-08-12");
  assert.deepEqual(r.items.map((i) => [i.qty, i.name, i.amount]), [
    [2, "Masala Dosa", 180],
    [3, "Filter Coffee", 120],
    [4, "Butter Naan", 160],
  ]);
  assert.deepEqual(r.charges.map((c) => [c.kind, c.amount]), [["tax", 11.5], ["tax", 11.5]]);
  assert.equal(r.total, 483);
});

test("Swiggy order screenshot", () => {
  let r = parseText(`Order #1234567890
Paneer Butter Masala x 1 ₹240
Garlic Naan x 2 ₹ 120
Item Total ₹360
Delivery partner fee ₹35
Platform fee ₹5
GST and Restaurant Charges ₹22.50
Item Discount - ₹50
To Pay ₹362.50`);
  assert.equal(r.source, "food-app");
  assert.deepEqual(r.items.map((i) => [i.qty, i.name, i.amount]), [
    [1, "Paneer Butter Masala", 240],
    [2, "Garlic Naan", 120],
  ]);
  assert.deepEqual(r.charges.map((c) => [c.kind, c.amount]), [
    ["delivery", 35],
    ["platform", 5],
    ["tax", 22.5],
    ["discount", -50],
  ]);
  assert.equal(r.total, 362.5);
});

test("Zomato order screenshot with coupon and free delivery", () => {
  let r = parseText(`zomato
1 x Chicken Biryani ₹299
2 x Butter Naan ₹110
Item total ₹409
Taxes ₹20.45
Delivery charge ₹40 FREE
Packaging charge ₹15
Coupon (ZOMATO50) -₹50
Grand Total ₹394.45`);
  assert.deepEqual(r.items.map((i) => [i.qty, i.name, i.amount]), [
    [1, "Chicken Biryani", 299],
    [2, "Butter Naan", 110],
  ]);
  assert.deepEqual(r.charges.map((c) => [c.kind, c.amount]), [
    ["tax", 20.45],
    ["packaging", 15],
    ["discount", -50],
  ]);
  assert.equal(r.total, 394.45);
});

test("charge kinds and sources", () => {
  assert.equal(chargeKind("Delivery Fee"), "delivery");
  assert.equal(chargeKind("Service Charge 10%"), "service");
  assert.equal(chargeKind("Tip"), "tip");
  assert.equal(chargeKind("Paneer Tikka"), null);
  assert.equal(detectSource("Swiggy order"), "food-app");
});

test("low confidence words flag items", () => {
  let r = parseText("Cold Coffe 120.00\nTea 20.00", ["Coffe"]);
  assert.deepEqual(r.items.map((i) => i.low), [true, false]);
});

test("merged words are split and column headers are not the merchant", () => {
  let r = parseText("tem Qty. Price Amount\nPaneerTikka 2 120.00 240.00\nGrand Total 240.00");
  assert.equal(r.merchant, "");
  assert.equal(r.items[0].name, "Paneer Tikka");
});

test("address lines are not the merchant and tax labels are tidy", () => {
  let r = parseText("Market,Faridabad, Haryana\nDosa 1 100.00 100.00\nCGST@2.52.5% 2.50\nSGST（2.5) 2.50\nGrand Total 105.00");
  assert.equal(r.merchant, "");
  assert.deepEqual(r.charges.map((c) => c.label), ["CGST 2.5%", "SGST 2.5%"]);
});

test("dates and times glued together are still found", () => {
  let r = parseText("Date:2026-02-0619:32\nTea 20.00");
  assert.equal(r.date, "2026-02-06");
  assert.equal(r.time, "19:32");
});
