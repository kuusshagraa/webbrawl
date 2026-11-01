import test from "node:test";
import assert from "node:assert/strict";
import { buildDemo } from "../dist/demo.js";
import { normalize } from "../dist/store.js";
import { validateBill, ledger, suggest } from "../dist/fair.js";
import { overdue } from "../dist/remind.js";
import { monthStats, prevMonth } from "../dist/wrapped.js";
import { templates } from "../dist/quick.js";

for (const today of ["2026-11-01", "2026-11-15", "2027-01-03", "2026-03-31"]) {
  test(`demo data is complete and valid (${today})`, () => {
    let s = buildDemo(today);
    assert.doesNotThrow(() => normalize(JSON.parse(JSON.stringify(s))));
    assert.ok(s.prefs.onboarded && s.meId);
    let ids = s.people.map((p) => p.id);
    for (let b of s.bills.filter((b) => b.status === "final")) assert.deepEqual(validateBill(b, ids), [], b.title);
    // Something to show for every feature.
    assert.ok(s.people.some((p) => p.tags.includes("veg")) && s.people.some((p) => p.tags.includes("no-alcohol")));
    assert.ok(s.bills.some((b) => b.items.some((i) => i.autoExcluded?.length)), "diet exclusion");
    assert.ok(s.bills.some((b) => b.items.some((i) => i.byQty)), "split by count");
    assert.ok(s.bills.some((b) => b.items.some((i) => i.disputed)), "disputed item");
    assert.ok(s.bills.some((b) => b.status === "draft" && b.items.some((i) => i.low)), "draft scan to review");
    assert.ok(s.groups.some((g) => g.recurring.length && g.target), "recurring + target");
    assert.ok(s.settlements.length >= 1);
    assert.ok(overdue(s, today).length >= 1, "someone is overdue");
    assert.ok(monthStats(s, prevMonth(today)).count >= 3, "last month has a Wrapped");
    assert.ok(templates(s.bills).length >= 1, "quick-add suggestions");
    let owedToMe = suggest(ledger(s.bills, s.settlements, s.groups[0].id)).some((t) => t.to === s.meId);
    assert.ok(owedToMe, "settle up has payments to me");
    assert.ok(s.bills.every((b) => b.date <= today), "no future bills");
  });
}
