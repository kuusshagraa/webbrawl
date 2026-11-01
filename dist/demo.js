// Sample data for the guided demo: enough to show every feature. Pure, so
// it can be tested; dates are placed relative to `today`.
import { emptyState, addMonth } from "./store.js";
import { syncDiet, defaultRule, CHARGE_KINDS } from "./fair.js";
import { lookFromSeed } from "./avatar.js";
import { prevMonth } from "./wrapped.js";

const shift = (iso, days) => {
  let d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function buildDemo(today) {
  let s = emptyState(),
    pm = prevMonth(today),
    day = (n) => `${pm}-${String(n).padStart(2, "0")}`,
    seq = 0,
    id = (p) => `demo-${p}-${++seq}`;
  let person = (key, name, extra = {}) => ({ id: "demo-" + key, name, upi: "", tags: [], phone: "", avatar: { seed: key, look: lookFromSeed(key + "-look") }, createdAt: 0, ...extra });
  let me = person("me", "Aarav Sharma", { upi: "aarav@okaxis", avatar: { seed: "me", look: { bg: 3, skin: 2, hairColor: 0, hair: 1, eyes: 1, mouth: 2, acc: 0, shirt: 3 } } }),
    rohit = person("rohit", "Rohit Mehra", { upi: "rohit@okhdfc", phone: "9876543210" }),
    aman = person("aman", "Aman Gupta", { tags: ["veg"] }),
    kabir = person("kabir", "Kabir Singh", { tags: ["no-alcohol"] }),
    meera = person("meera", "Meera Iyer", { tags: ["veg", "no-egg"] }),
    priya = person("priya", "Priya Nair");
  s.people = [me, rohit, aman, kabir, meera, priya];
  s.meId = me.id;
  s.prefs = { ...s.prefs, onboarded: true, lastBackup: Date.parse(today), roundTo: 0, ignoreUnder: 0 };

  let hostel = { id: "demo-hostel", name: "Hostel Wing B", memberIds: [me.id, rohit.id, aman.id, kabir.id], target: 6000, recurring: [], createdAt: 0 },
    goa = { id: "demo-goa", name: "Goa Trip", memberIds: [me.id, rohit.id, meera.id, priya.id], target: 0, recurring: [], createdAt: 0 };
  s.groups = [hostel, goa];

  let item = (name, qty, amount, extra = {}) => ({ id: id("item"), name, qty, amount, split: "all", portions: {}, excluded: [], autoExcluded: [], dietOverride: [], byQty: false, disputed: false, low: false, ...extra });
  let charge = (kind, amount, extra = {}) => ({ id: id("charge"), kind, label: CHARGE_KINDS[kind].label, amount, rule: defaultRule(kind), personId: null, ...extra });
  let at = 0;
  let bill = (o) => {
    let b = { id: id("bill"), merchant: "", time: "20:30", payerId: me.id, groupId: null, mode: "itemized", items: [], charges: [], custom: {}, total: 0, totalSource: "auto", roundTo: 0, category: "Food", status: "final", source: "manual", createdAt: Date.parse(o.date + "T12:00:00") + at++, ...o };
    if (b.mode === "itemized" && b.totalSource === "auto") b.total = (b.items.reduce((a, x) => a + Math.round(x.amount * 100), 0) + b.charges.reduce((a, x) => a + Math.round(x.amount * 100), 0)) / 100;
    syncDiet(b, s.people);
    s.bills.push(b);
    return b;
  };
  let hostelIds = hostel.memberIds;

  // Last month: an itemised hostel night showing every fairness rule.
  bill({
    title: "Hostel Night Order",
    merchant: "Biryani Blues",
    date: day(5),
    groupId: hostel.id,
    participants: hostelIds,
    source: "scan",
    items: [
      item("Chicken Dum Biryani", 1, 320),
      item("Paneer Butter Masala", 1, 260),
      item("Butter Naan", 6, 240, { split: "custom", byQty: true, portions: { [me.id]: 2, [rohit.id]: 2, [aman.id]: 1, [kabir.id]: 1 } }),
      item("Kingfisher Beer", 2, 300),
      item("Gulab Jamun", 4, 120),
    ],
    charges: [charge("delivery", 40), charge("packaging", 30), charge("tax", 62)],
  });
  bill({ title: "Shack lunch", merchant: "Curlies, Anjuna", date: day(12), groupId: goa.id, payerId: rohit.id, participants: goa.memberIds, mode: "equal", total: 2400, totalSource: "receipt", category: "Food" });
  bill({ title: "Scooter rental", date: day(13), groupId: goa.id, payerId: me.id, participants: goa.memberIds, mode: "shares", custom: { [me.id]: 1, [rohit.id]: 1, [meera.id]: 2, [priya.id]: 2 }, total: 1800, totalSource: "receipt", category: "Travel" });
  bill({ title: "Uber", date: day(18), time: "21:10", participants: [me.id, rohit.id, aman.id], mode: "equal", total: 640, totalSource: "receipt", category: "Travel", source: "quick" });
  bill({ title: "Uber", date: day(22), time: "21:40", participants: [me.id, rohit.id, aman.id], mode: "equal", total: 610, totalSource: "receipt", category: "Travel", source: "quick" });
  let wifi = { id: "demo-wifi", next: addMonth(day(25), 25), day: 25, template: null };
  let w = bill({ title: "Wi-Fi", date: day(25), time: "10:00", groupId: hostel.id, participants: hostelIds, mode: "equal", total: 999, totalSource: "receipt", category: "Utilities", recurringId: wifi.id });
  let { id: _, status, ...template } = structuredClone(w);
  wifi.template = template;
  if (wifi.next <= today) wifi.next = addMonth(wifi.next, 25);
  hostel.recurring.push(wifi);
  s.settlements.push({ id: "demo-settle-1", groupId: hostel.id, from: aman.id, to: me.id, amount: 300, date: day(27) });

  // This month: an unpaid pizza night (5 days ago) with a disputed item.
  bill({
    title: "Pizza Friday",
    merchant: "La Pino'z",
    date: shift(today, -5),
    groupId: hostel.id,
    participants: hostelIds,
    items: [item("Farmhouse Pizza", 1, 459), item("Chicken Tikka Pizza", 1, 529), item("Garlic Bread", 1, 149, { disputed: true }), item("Cold Coffee", 2, 238)],
    charges: [charge("tax", 69), charge("discount", -100, { label: "Coupon PIZZA100", rule: "person", personId: rohit.id })],
    category: "Food",
  });
  bill({ title: "Chai & Samosa", date: shift(today, -2), time: "17:15", payerId: kabir.id, participants: [kabir.id, me.id], mode: "equal", total: 120, totalSource: "receipt", category: "Coffee", source: "quick" });
  bill({ title: "Auto", date: shift(today, -1), time: "09:20", participants: [aman.id], mode: "exact", custom: { [aman.id]: 80 }, total: 80, totalSource: "receipt", category: "Travel", source: "quick" });

  // A scanned receipt waiting for review, with lines the scanner wasn't sure about.
  bill({
    title: "Gourmet Coffee",
    merchant: "Gourmet Coffee",
    date: today,
    time: "08:36",
    status: "draft",
    source: "scan",
    participants: [me.id],
    totalSource: "receipt",
    items: [item("Capuccino", 1, 5.4), item("Chocolate Donut", 1, 8.13, { low: true }), item("Caesar Salad", 2, 23.38), item("Iced Tea", 1, 4.6)],
    charges: [charge("tax", 3.1)],
    total: 44.61,
    category: "Coffee",
  });
  return s;
}
