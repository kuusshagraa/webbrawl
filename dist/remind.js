// Who owes me money, and since when. Pure: works on a state snapshot.
import { ledger, suggest, splitBill } from "./fair.js";

const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00") - Date.parse(a + "T12:00:00")) / 864e5);

export function overdue(state, today, minDays = 3) {
  let me = state.meId,
    out = [],
    ids = [null, ...state.groups.map((g) => g.id)];
  for (let gid of ids) {
    let tx = suggest(ledger(state.bills, state.settlements, gid), state.prefs?.ignoreUnder || 0);
    for (let t of tx) {
      if (t.to !== me) continue;
      let lastPaid = state.settlements
        .filter((s) => (s.groupId || null) === gid && s.from === t.from && s.to === me)
        .reduce((a, s) => (s.date > a ? s.date : a), "");
      let bills = state.bills
        .filter((b) => b.status === "final" && (b.groupId || null) === gid && b.payerId === me && b.date > lastPaid && (splitBill(b).shares[t.from] || 0) > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (!bills.length) continue;
      let days = daysBetween(bills[0].date, today);
      if (days < minDays) continue;
      out.push({ from: t.from, groupId: gid, amount: t.amount, days, what: bills[0].title + (bills.length > 1 ? ` and ${bills.length - 1} more` : ""), billId: bills[bills.length - 1].id });
    }
  }
  return out.sort((a, b) => b.days - a.days);
}
