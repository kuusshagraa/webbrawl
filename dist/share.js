// Encodes a bill and its people into a URL-safe string, so a link can carry
// the whole split without a server. People ids are replaced by indexes.

const LIMIT = 60000;

function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64(s) {
  let b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
async function pipe(bytes, stream) {
  let out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export function packBill(bill, people) {
  let ids = [...new Set([...(bill.participants || []), bill.payerId].filter(Boolean))],
    map = Object.fromEntries(ids.map((id, i) => [id, i])),
    m = (id) => map[id],
    mapObj = (o) =>
      Object.fromEntries(Object.entries(o || {}).filter(([k]) => k in map).map(([k, v]) => [map[k], v]));
  return {
    v: 1,
    title: bill.title,
    merchant: bill.merchant || "",
    date: bill.date || "",
    time: bill.time || "",
    total: bill.total,
    mode: bill.mode || "itemized",
    roundTo: bill.roundTo || 0,
    payer: m(bill.payerId),
    participants: (bill.participants || []).map(m),
    custom: mapObj(bill.custom),
    people: ids.map((id) => {
      let p = people.find((x) => x.id === id) || { name: "Someone" };
      return { name: p.name, seed: p.avatar?.seed || p.name, look: p.avatar?.look || null };
    }),
    items: (bill.items || []).map((it) => ({
      name: it.name,
      qty: it.qty,
      amount: it.amount,
      split: it.split || "all",
      portions: mapObj(it.portions),
      excluded: (it.excluded || []).filter((id) => id in map).map(m),
      autoExcluded: (it.autoExcluded || []).filter((id) => id in map).map(m),
      byQty: !!it.byQty,
      disputed: !!it.disputed,
    })),
    charges: (bill.charges || []).map((c) => ({
      kind: c.kind,
      label: c.label,
      amount: c.amount,
      rule: c.rule,
      person: c.personId in map ? m(c.personId) : null,
    })),
  };
}

const str = (v, max = 120) => typeof v === "string" && v.length <= max;
const num = (v) => typeof v === "number" ? Number.isFinite(v) : typeof v === "string" && v !== "" && Number.isFinite(Number(v));
const idxOk = (v, n) => Number.isInteger(v) && v >= 0 && v < n;

export function validatePacked(p) {
  if (!p || p.v !== 1 || !Array.isArray(p.people) || !Array.isArray(p.items) || !Array.isArray(p.charges)) return false;
  let n = p.people.length;
  if (n < 1 || n > 100 || p.items.length > 300 || p.charges.length > 50) return false;
  if (!str(p.title) || !num(p.total) || !idxOk(p.payer, n)) return false;
  if (!Array.isArray(p.participants) || !p.participants.every((x) => idxOk(x, n))) return false;
  if (!p.people.every((x) => x && str(x.name, 60))) return false;
  if (!p.items.every((it) => it && str(it.name) && num(it.qty) && num(it.amount))) return false;
  if (!p.charges.every((c) => c && num(c.amount) && (c.person === null || c.person === undefined || idxOk(c.person, n)))) return false;
  return ["itemized", "equal", "exact", "percent", "shares"].includes(p.mode);
}

// Rebuilds a bill using the given ids for people (index -> id).
export function unpackBill(p, ids) {
  let id = (i) => ids[i],
    obj = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [id(+k), v]));
  return {
    title: p.title,
    merchant: p.merchant || "",
    date: p.date || "",
    time: p.time || "",
    total: p.total,
    mode: p.mode,
    roundTo: Number(p.roundTo) || 0,
    payerId: id(p.payer),
    participants: p.participants.map(id),
    custom: obj(p.custom),
    items: p.items.map((it, i) => ({
      id: "i" + i,
      name: it.name,
      qty: Number(it.qty),
      amount: Number(it.amount),
      split: it.split === "custom" ? "custom" : "all",
      portions: obj(it.portions),
      excluded: (it.excluded || []).map(id),
      autoExcluded: (it.autoExcluded || []).map(id),
      byQty: !!it.byQty,
      disputed: !!it.disputed,
    })),
    charges: p.charges.map((c, i) => ({
      id: "c" + i,
      kind: c.kind || "other",
      label: c.label || "",
      amount: Number(c.amount),
      rule: c.rule,
      personId: c.person === null || c.person === undefined ? null : id(c.person),
    })),
  };
}

export async function encode(packed) {
  let bytes = new TextEncoder().encode(JSON.stringify(packed));
  if (typeof CompressionStream === "function") {
    try {
      return "z" + toB64(await pipe(bytes, new CompressionStream("deflate-raw")));
    } catch {}
  }
  return "j" + toB64(bytes);
}

export async function decode(s) {
  if (typeof s !== "string" || s.length < 2 || s.length > LIMIT) throw new Error("bad-link");
  let bytes = fromB64(s.slice(1));
  if (s[0] === "z") bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
  else if (s[0] !== "j") throw new Error("bad-link");
  let packed = JSON.parse(new TextDecoder().decode(bytes));
  if (!validatePacked(packed)) throw new Error("bad-link");
  return packed;
}
