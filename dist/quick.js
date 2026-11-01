// Turns a sentence like "Uber 640 with Rohit and Aman, Rohit paid" into a
// quick expense. Pure: everything it needs is passed in.

const CATEGORY_WORDS = {
  Travel: /\b(uber|ola|rapido|auto|rickshaw|cab|taxi|metro|bus|train|irctc|flight|indigo|petrol|diesel|fuel|toll|parking|bike|scooty|travel|trip)\b/i,
  Food: /\b(swiggy|zomato|dinner|lunch|breakfast|brunch|pizza|burger|biryani|dosa|thali|maggi|momos|food|restaurant|dhaba|canteen|mess|snacks?|kfc|mcd|mcdonalds|dominos|eat|party|cake)\b/i,
  Coffee: /\b(chai|tea|coffee|starbucks|ccd|cafe|juice|shake)\b/i,
  Groceries: /\b(blinkit|zepto|instamart|bigbasket|dmart|grocer(y|ies)|vegetables?|sabzi|milk|fruits?|kirana|supermarket)\b/i,
  Utilities: /\b(wifi|wi-fi|internet|broadband|electricity|bijli|water|gas|cylinder|rent|recharge|maintenance|laundry|dhobi|bill)\b/i,
  Entertainment: /\b(movie|movies|pvr|inox|netflix|prime|hotstar|spotify|bowling|gaming|concert|show|tickets?|club|drinks|beer|bar)\b/i,
};
export function inferCategory(text) {
  for (let [cat, re] of Object.entries(CATEGORY_WORDS)) if (re.test(text || "")) return cat;
  return "Other";
}

const STOP = new Set("paid pay by for with and the a an on at to rs rupees inr split equally between among of each".split(" "));
const ME = new Set(["me", "i", "myself", "my", "we", "us"]);
const EVERYONE = /\b(everyone|everybody|all of us|the gang|whole gang|all)\b/i;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function editDistance(a, b) {
  let d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const shiftDay = (iso, days) => {
  let d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const titleCase = (s) => s.replace(/\b([a-z])/g, (c) => c.toUpperCase());

export function parseQuick(text, { people = [], groups = [], meId = null, today, recentGroupId = null } = {}) {
  let out = { amount: null, title: "", category: "Other", participants: [], payerId: meId, split: "equal", date: today, groupId: null, unknown: [] };
  let s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return out;

  // Date words.
  if (/\byesterday\b/i.test(s)) {
    out.date = shiftDay(today, -1);
    s = s.replace(/\byesterday\b/i, " ");
  } else if (/\btoday\b/i.test(s)) s = s.replace(/\btoday\b/i, " ");
  let wd = s.match(/\b(?:on|last)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (wd) {
    let target = WEEKDAYS.indexOf(wd[1].toLowerCase()),
      now = new Date(today + "T12:00:00").getDay(),
      back = (now - target + 7) % 7 || 7;
    out.date = shiftDay(today, -back);
    s = s.replace(wd[0], " ");
  }

  // Amount: first number, with ₹/rs/inr and a k suffix.
  let m = s.match(/(?:₹|\brs\.?|\binr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/i);
  if (m) {
    let n = Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
    if (Number.isFinite(n) && n > 0) out.amount = Math.round(n * 100) / 100;
    s = s.replace(m[0], " ");
  }
  s = s.replace(/\b(rs\.?|inr|rupees?)\b|₹/gi, " ");

  let words = s.split(/[\s,&]+/).filter(Boolean),
    used = new Array(words.length).fill(false),
    lower = words.map((w) => w.toLowerCase().replace(/[^a-z0-9'-]/g, "")),
    others = new Set(),
    mention = (id) => id && id !== meId && others.add(id);

  // Group names ("hostel wing" matches "Hostel Wing B").
  for (let g of groups) {
    let gw = g.name.toLowerCase().split(/\s+/);
    for (let len = gw.length; len >= Math.min(2, gw.length); len--) {
      let phrase = gw.slice(0, len);
      let at = lower.findIndex((_, i) => phrase.every((p, k) => lower[i + k] === p));
      if (at >= 0) {
        for (let k = 0; k < len; k++) used[at + k] = true;
        out.groupId = g.id;
        g.memberIds.forEach(mention);
        break;
      }
    }
    if (out.groupId) break;
  }
  if (!out.groupId && EVERYONE.test(lower.join(" "))) {
    let g = groups.find((x) => x.id === recentGroupId) || (groups.length === 1 ? groups[0] : null);
    if (g) {
      out.groupId = g.id;
      g.memberIds.forEach(mention);
    }
    lower.forEach((w, i) => /^(everyone|everybody|gang|all)$/.test(w) && (used[i] = true));
  }

  // People: full names first, then first names, then near misses.
  let who = new Array(words.length).fill(null);
  let first = (p) => p.name.toLowerCase().split(/\s+/)[0];
  for (let p of people) {
    let full = p.name.toLowerCase().split(/\s+/);
    if (full.length < 2) continue;
    lower.forEach((_, i) => {
      if (full.every((f, k) => lower[i + k] === f)) {
        full.forEach((_, k) => (used[i + k] = true));
        who[i] = p.id;
      }
    });
  }
  lower.forEach((w, i) => {
    if (used[i] || STOP.has(w) || w.length < 2) return;
    if (ME.has(w)) {
      used[i] = true;
      who[i] = meId;
      return;
    }
    let exact = people.find((p) => first(p) === w || p.name.toLowerCase() === w),
      near = !exact && w.length >= 4 ? people.find((p) => first(p).length >= 4 && editDistance(first(p), w) <= 1) : null,
      p = exact || near;
    if (p) {
      used[i] = true;
      who[i] = p.id;
    }
  });

  // Payer and "they owe" phrases, read from the words around each name.
  who.forEach((id, i) => {
    if (!id) return;
    let next = lower[i + 1],
      prev = lower[i - 1],
      prev2 = lower[i - 2];
    if (next === "paid" || (prev === "by" && prev2 === "paid")) {
      out.payerId = id;
      if (next === "paid") used[i + 1] = true;
    } else if (next === "owes" || next === "owe") {
      out.split = "owe";
      used[i + 1] = true;
      mention(id);
    } else if (prev === "for") {
      out.split = "owe";
      mention(id);
    } else mention(id);
  });

  // Names after "with" that we couldn't match are reported, not guessed.
  let w = lower.indexOf("with");
  if (w >= 0)
    for (let i = w + 1; i < words.length; i++) {
      if (used[i] || STOP.has(lower[i]) || !lower[i]) continue;
      if (inferCategory(lower[i]) !== "Other") break;
      out.unknown.push(titleCase(lower[i]));
      used[i] = true;
    }

  out.title = titleCase(
    words
      .filter((_, i) => !used[i] && !STOP.has(lower[i]) && !/^(owes?|paid)$/.test(lower[i]) && lower[i])
      .join(" ")
      .toLowerCase(),
  );
  out.category = inferCategory(out.title || String(text));

  let payer = out.payerId;
  if (out.split === "owe") out.participants = [...others].filter((id) => id !== payer);
  else if (others.size || payer !== meId) out.participants = [...new Set([payer, ...(payer !== meId ? [meId] : []), ...others])].filter(Boolean);
  return out;
}

// Repeated quick expenses become one-tap suggestions, ranked by how often
// they happen and whether they usually happen around this hour.
export function templates(bills, { hour = new Date().getHours(), limit = 3 } = {}) {
  let map = new Map();
  for (let b of bills) {
    if (b.status !== "final" || b.source !== "quick" || !b.title) continue;
    let key = b.title.toLowerCase() + "|" + [...b.participants].sort().join(",") + "|" + b.payerId;
    let t = map.get(key) || { title: b.title, participants: b.participants, payerId: b.payerId, mode: b.mode, category: b.category, count: 0, last: 0, amount: 0, hours: [] };
    t.count++;
    t.hours.push(Number(String(b.time || "12").slice(0, 2)));
    if ((b.createdAt || 0) >= t.last) {
      t.last = b.createdAt || 0;
      t.amount = Number(b.total);
    }
    map.set(key, t);
  }
  return [...map.values()]
    .map((t) => ({ ...t, score: t.count + (t.hours.some((h) => Math.abs(h - hour) <= 2) ? 0.5 : 0) + t.last / 1e14 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ hours, score, last, ...t }) => t);
}
