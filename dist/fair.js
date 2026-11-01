import { money, allocate, splitExpense, settle } from "./core.js";

// Default rule per charge kind: fixed fees are shared equally by the people
// who ordered, percentage-like charges follow what each person ordered.
export const CHARGE_KINDS = {
  tax: { label: "Tax", rule: "proportional" },
  service: { label: "Service charge", rule: "proportional" },
  delivery: { label: "Delivery fee", rule: "equal" },
  packaging: { label: "Packaging", rule: "equal" },
  platform: { label: "Platform fee", rule: "equal" },
  tip: { label: "Tip", rule: "proportional" },
  discount: { label: "Discount", rule: "proportional" },
  other: { label: "Other charge", rule: "proportional" },
};
export const RULES = {
  proportional: "By what each person ordered",
  equal: "Equally, among people who ordered",
  payer: "Payer covers it",
  person: "One person covers it",
};
export const defaultRule = (kind) => (CHARGE_KINDS[kind] || CHARGE_KINDS.other).rule;
export const itemTotal = (bill) =>
  (bill.items || []).reduce((a, x) => a + money(x.amount), 0);
export const chargeTotal = (bill) =>
  (bill.charges || []).reduce((a, x) => a + money(x.amount), 0);

// Weights for an item across `ids`. "all" items include every participant
// except manual and diet exclusions; "custom" items use explicit portions.
export function itemWeights(item, ids) {
  if (item.split === "custom")
    return ids.map((id) => Math.max(0, Number(item.portions?.[id]) || 0));
  let out = new Set([...(item.excluded || []), ...(item.autoExcluded || [])]);
  return ids.map((id) => (out.has(id) ? 0 : 1));
}

const oneHot = (n, i) => Array.from({ length: n }, (_, j) => (j === i ? 1 : 0));

export function splitBill(bill) {
  let ids = [...(bill.participants || [])],
    payer = bill.payerId,
    all = !payer || ids.includes(payer) ? ids : [...ids, payer],
    n = all.length,
    idx = Object.fromEntries(all.map((id, i) => [id, i])),
    inBill = all.map((_, i) => (i < ids.length ? 1 : 0)),
    total = money(bill.total),
    shares = all.map(() => 0),
    lines = Object.fromEntries(
      all.map((id) => [id, { items: [], charges: [], adjustment: 0, rounding: 0 }]),
    ),
    disputed = 0,
    unclaimed = 0,
    items = 0,
    charges = 0;
  let add = (part, fn) =>
    part.forEach((x, i) => {
      if (!x) return;
      shares[i] += x;
      fn(lines[all[i]], x);
    });
  if (!ids.length) return { shares: {}, lines: {}, disputed, unclaimed, items, charges, computed: 0, diff: total, total };
  if ((bill.mode || "itemized") !== "itemized") {
    let s = splitExpense(
      { total: bill.total, mode: bill.mode, participants: ids, values: bill.custom || {} },
      ids.map((id) => ({ id })),
    );
    ids.forEach((id) => (shares[idx[id]] = s[id]));
    items = total;
  } else {
    let sub = all.map(() => 0);
    for (let item of bill.items || []) {
      let amount = money(item.amount);
      items += amount;
      if (!amount) continue;
      let w = itemWeights(item, ids).concat(all.slice(ids.length).map(() => 0)),
        sum = w.reduce((a, b) => a + b, 0),
        units = Number(item.qty) || 0,
        part,
        meta = { id: item.id, name: item.name, qty: item.qty };
      if (item.disputed && payer) {
        part = oneHot(n, idx[payer]).map((x) => x * amount);
        disputed += amount;
        meta.disputed = true;
      } else if (!sum) {
        part = allocate(amount, inBill);
        unclaimed += amount;
        meta.unclaimed = true;
      } else if (item.split === "custom" && item.byQty && units > 0 && sum < units) {
        let [claimed, rest] = allocate(amount, [sum, units - sum]),
          a = allocate(claimed, w),
          b = allocate(rest, inBill);
        part = a.map((x, i) => x + b[i]);
        unclaimed += rest;
      } else part = allocate(amount, w);
      let sharers = w.filter((x) => x > 0).length;
      part.forEach((x, i) => {
        if (!x) return;
        sub[i] += x;
        shares[i] += x;
        lines[all[i]].items.push({
          ...meta,
          amount: x,
          units: item.split === "custom" && item.byQty ? w[i] : null,
          sharers: meta.disputed || meta.unclaimed ? 0 : sharers,
          extra: !w[i] && !meta.disputed && !meta.unclaimed,
        });
      });
    }
    let ordered = sub.map((x) => (x > 0 ? 1 : 0));
    if (!ordered.some(Boolean)) ordered = inBill;
    for (let c of bill.charges || []) {
      let amount = money(c.amount);
      charges += amount;
      if (!amount) continue;
      let rule = c.rule || defaultRule(c.kind),
        w;
      if (rule === "payer" && payer) w = oneHot(n, idx[payer]);
      else if (rule === "person" && c.personId in idx) w = oneHot(n, idx[c.personId]);
      else if (rule === "equal") w = ordered;
      else w = sub.some((x) => x > 0) ? sub.map((x) => Math.max(0, x)) : inBill;
      let label = c.label || CHARGE_KINDS[c.kind]?.label || "Charge";
      add(allocate(amount, w), (l, x) => l.charges.push({ id: c.id, label, kind: c.kind, amount: x }));
    }
    let diff = total - items - charges;
    if (diff) {
      let w = shares.map((x) => Math.max(0, x));
      if (!w.some(Boolean)) w = inBill;
      add(allocate(diff, w), (l, x) => (l.adjustment += x));
    }
  }
  let step = Math.round((Number(bill.roundTo) || 0) * 100);
  if (step > 0 && payer) {
    let p = idx[payer],
      others = 0;
    all.forEach((id, i) => {
      if (i === p) return;
      let r = Math.round(shares[i] / step) * step;
      lines[id].rounding = r - shares[i];
      shares[i] = r;
      others += r;
    });
    lines[payer].rounding = total - others - shares[p];
    shares[p] = total - others;
  }
  let computed = (bill.mode || "itemized") === "itemized" ? items + charges : total;
  return {
    shares: Object.fromEntries(all.map((id, i) => [id, shares[i]])),
    lines,
    disputed,
    unclaimed,
    items,
    charges,
    computed,
    diff: total - computed,
    total,
  };
}

// Returns a list of problems; an empty list means the bill can be saved.
export function validateBill(bill, peopleIds = null) {
  let errors = [],
    err = (field, msg) => errors.push({ field, msg }),
    total = Number(bill.total);
  if (!String(bill.title || "").trim()) err("title", "Give this bill a name.");
  if (!bill.participants?.length) err("people", "Add at least one person to the bill.");
  if (!bill.payerId || (peopleIds && !peopleIds.includes(bill.payerId)))
    err("payer", "Choose who paid.");
  if (!Number.isFinite(total) || money(total) <= 0) err("total", "The bill total must be more than ₹0.");
  let mode = bill.mode || "itemized";
  if (mode === "itemized") {
    if (!bill.items?.length) err("items", "Add at least one item.");
    for (let it of bill.items || []) {
      if (!String(it.name || "").trim()) err("item:" + it.id, "Every item needs a name.");
      else if (!(Number(it.qty) > 0) || !Number.isFinite(Number(it.qty)))
        err("item:" + it.id, `Check the quantity of ${it.name}.`);
      else if (!Number.isFinite(Number(it.amount)) || Number(it.amount) < 0)
        err("item:" + it.id, `Check the price of ${it.name}.`);
    }
    for (let c of bill.charges || [])
      if (!Number.isFinite(Number(c.amount))) err("charge:" + c.id, "Check the charge amounts.");
  } else {
    let vals = (bill.participants || []).map((id) => Number(bill.custom?.[id]) || 0);
    if (vals.some((v) => v < 0)) err("custom", "Split values can't be negative.");
    let sum = vals.reduce((a, b) => a + b, 0);
    if (mode === "exact" && vals.reduce((a, v) => a + money(v), 0) !== money(total))
      err("custom", "Exact amounts must add up to the bill total.");
    if (mode === "percent" && Math.abs(sum - 100) > 0.001) err("custom", "Percentages must add up to 100%.");
    if (mode === "shares" && sum <= 0) err("custom", "Give at least one person a share.");
  }
  return errors;
}

// Net balance per person (paise; positive = is owed) for one ledger.
// groupId null is the ledger of bills outside any group.
export function ledger(bills, settlements, groupId = null) {
  let b = {},
    inc = (id, x) => (b[id] = (b[id] || 0) + x);
  for (let bill of bills) {
    if (bill.status !== "final" || (bill.groupId || null) !== groupId) continue;
    let { shares } = splitBill(bill);
    inc(bill.payerId, money(bill.total));
    for (let id in shares) inc(id, -shares[id]);
  }
  for (let s of settlements) {
    if ((s.groupId || null) !== groupId) continue;
    inc(s.from, money(s.amount));
    inc(s.to, -money(s.amount));
  }
  return b;
}

// Minimum payments, hiding payments smaller than `ignoreUnder` rupees.
export function suggest(balance, ignoreUnder = 0) {
  let min = money(ignoreUnder);
  return settle(balance).filter((t) => t.amount >= Math.max(1, min));
}

// Diet tags: words that exclude a tagged person from an item, and words
// that cancel the match (e.g. "eggless", "ginger beer").
export const DIET = {
  veg: {
    label: "Veg",
    words: /\b(chicken|chikken|mutton|lamb|goat|fish|prawns?|shrimps?|crab|lobster|eggs?|omelett?e|anda|keema|beef|pork|bacon|ham|salami|pepperoni|sausages?|meat|tuna|salmon|seafood|wings|nuggets|non[\s-]?veg)\b/i,
    except: /\begg[\s-]?less\b/i,
  },
  "no-egg": {
    label: "No egg",
    words: /\b(eggs?|omelett?e|anda|mayo|mayonnaise|bhurji)\b/i,
    except: /\begg[\s-]?less\b|\bveg\s+mayo\b/i,
  },
  "no-alcohol": {
    label: "No alcohol",
    words: /\b(beers?|wine|whisk(e)?y|vodka|rum|gin|tequila|cocktails?|pints?|breezer|champagne|brandy|lager|sangria|margarita|mojito|shots?)\b/i,
    except: /\b(root|ginger)\s+beer\b|\bnon[\s-]?alcoholic\b|\bmocktail\b|\bvirgin\b|\b0\.0\b/i,
  },
};

export function dietMatches(name, tags = []) {
  let s = String(name || "");
  return tags.filter((t) => DIET[t] && DIET[t].words.test(s) && !DIET[t].except.test(s));
}

// Recompute diet exclusions on "all" items of a bill. Mutates and returns it.
export function syncDiet(bill, people) {
  let tags = Object.fromEntries(people.map((p) => [p.id, p.tags || []]));
  for (let item of bill.items || []) {
    if (item.split === "custom") {
      item.autoExcluded = [];
      continue;
    }
    let keep = item.dietOverride || [];
    item.autoExcluded = (bill.participants || []).filter(
      (id) => !keep.includes(id) && dietMatches(item.name, tags[id]).length,
    );
  }
  return bill;
}
