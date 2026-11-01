import test from "node:test";
import assert from "node:assert/strict";
import { nudgeText, waLink, cleanPhone } from "../dist/nudge.js";

test("message includes share, UPI and breakdown link", () => {
  assert.equal(
    nudgeText({ name: "Rohit Mehra", amount: 21333, billTitle: "Uber", category: "Travel", upi: "jelly@okaxis", link: "https://x/#/s/abc" }),
    "Hey Rohit! Your share for Uber 🚗 is ₹213.33. You can pay me at jelly@okaxis. Breakdown: https://x/#/s/abc",
  );
  assert.equal(nudgeText({ name: "Aman", amount: 5000, billTitle: "Dinner", category: "Food" }), "Hey Aman! Your share for Dinner 🍛 is ₹50.00.");
});

test("reminder wording for older dues", () => {
  assert.match(nudgeText({ name: "Aman", amount: 5000, billTitle: "Dinner", days: 4 }), /^Hey Aman! Just a reminder: your share for Dinner is ₹50.00 \(4 days ago\)\.$/);
});

test("WhatsApp links use the number when there is one", () => {
  assert.equal(cleanPhone("+91 98765 43210"), "919876543210");
  assert.equal(cleanPhone("09876543210"), "919876543210");
  assert.equal(cleanPhone("12345"), "");
  assert.equal(waLink("Hi there", "9876543210"), "https://wa.me/919876543210?text=Hi%20there");
  assert.equal(waLink("Hi & bye", ""), "https://wa.me/?text=Hi%20%26%20bye");
});
