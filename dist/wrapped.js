// Month-in-review numbers for the Wrapped story. Pure.
import { money } from "./core.js";
import { splitBill, itemWeights } from "./fair.js";

export function prevMonth(iso) {
  let [y, m] = iso.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
const top = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

export function monthStats(state, ym) {
  let me = state.meId,
    bills = state.bills.filter((b) => b.status === "final" && String(b.date).startsWith(ym)),
    s = { month: ym, count: bills.length, total: 0, myShare: 0, topCategory: null, topPayer: null, favourite: null, dietSaved: 0, biggest: null },
    byCat = {},
    byPayer = {},
    byItem = {};
  for (let b of bills) {
    let amount = money(b.total),
      mine = splitBill(b).shares[me] || 0;
    s.total += amount;
    s.myShare += mine;
    if (mine) byCat[b.category || "Other"] = (byCat[b.category || "Other"] || 0) + mine;
    byPayer[b.payerId] = (byPayer[b.payerId] || 0) + amount;
    if (!s.biggest || amount > s.biggest.amount) s.biggest = { title: b.title, amount };
    if ((b.mode || "itemized") !== "itemized") continue;
    for (let it of b.items || []) {
      let w = itemWeights(it, b.participants),
        sharers = w.filter((x) => x > 0).length;
      if (sharers > 1) byItem[it.name] = (byItem[it.name] || 0) + 1;
      if (it.split !== "custom" && (it.autoExcluded || []).includes(me) && !(it.dietOverride || []).includes(me))
        s.dietSaved += Math.round(money(it.amount) / (sharers + 1));
    }
  }
  let c = top(byCat),
    p = top(byPayer),
    f = top(byItem);
  if (c) s.topCategory = { name: c[0], amount: c[1] };
  if (p) s.topPayer = { id: p[0], amount: p[1] };
  if (f && f[1] > 1) s.favourite = { name: f[0], count: f[1] };
  return s;
}
