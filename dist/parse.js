// Turns OCR or pasted text into a bill draft. Handles printed receipts
// (QTY DESC AMT layouts, qty x rate) and Swiggy/Zomato order screenshots.

export function chargeKind(label) {
  let s = String(label).toLowerCase();
  if (/discount|coupon|offer|promo|saving|cashback|\boff\b/.test(s)) return "discount";
  if (/deliver/.test(s)) return "delivery";
  if (/packag|packing|container/.test(s)) return "packaging";
  if (/platform|convenience|handling|small cart|surge|rain fee|late night fee/.test(s)) return "platform";
  if (/\btip\b|gratuity/.test(s)) return "tip";
  if (/service/.test(s)) return "service";
  if (/cgst|sgst|igst|utgst|\bgst\b|\btax|\bvat\b|\bcess\b|restaurant charges/.test(s)) return "tax";
  if (/round(ing)?\s*off|surcharge|\bcharges?\b|\bfees?\b/.test(s)) return "other";
  return null;
}

export function detectSource(text) {
  let s = String(text).toLowerCase();
  if (/swiggy|zomato|item total|to pay|delivery partner|order #|order id/.test(s)) return "food-app";
  return "receipt";
}

const titleCase = (s) =>
  s === s.toUpperCase() && /[A-Z]/.test(s)
    ? s.toLowerCase().replace(/(^|[\s(&/-])([a-z])/g, (_, a, b) => a + b.toUpperCase())
    : s;
const cleanName = (s) =>
  titleCase(
    s
      .replace(/([a-z]{3,})([A-Z][a-z]{2,})/g, "$1 $2") // "PaneerTikka" -> "Paneer Tikka"
      .replace(/\b([A-Za-z]{2,})([01]+)\b/g, (_, a, d) => a + d.replace(/1/g, "l").replace(/0/g, "o")) // "Ro11" -> "Roll"
      .replace(/[|•·®™*_~]+/g, " ")
      .replace(/^[^a-z0-9(]+/i, "")
      .replace(/[\s.:,-]+$/, "")
      .replace(/\s{2,}/g, " ")
      .trim(),
  );

const SKIP =
  /gstin|fssai|phone|\btel\b|mobile|address|street|road|thank|visit again|invoice|bill\s*no|order\s*(no|id|#)|receipt\s*no|cashier|server|\btable\b|\bhost\b|\babn\b|\bpan\b|www\.|\.com|^qty\b|^desc|^item\s+(qty|name)|^(s\.?\s*no|sr)\b|change\s*due|tendered|\bcash\b|\bcard\b|\bupi\b|paid\s*via|payment|txn|rate\s+amount/i;
const TOTAL =
  /^(grand\s*total|total(\s*(amount|bill|payable|due))?|amount(\s*(due|payable|paid))?|net\s*(amount|total|payable)|bill\s*(total|amount)|to\s*pay|balance\s*due|paid)$/i;
const SUBTOTAL = /^(sub\s*-?\s*total|item\s*total|items?\s*total|total\s*before\s*tax|taxable\s*(amount|value))$/i;
// Phrases that mark the final payable amount wherever they appear in a line.
const STRONG_TOTAL = /grand\s*total|net\s*(amount|payable|total)|amount\s*payable|total\s*payable|to\s*pay\b|bill\s*amount/i;
const TAX_WORD = /\b(c|s|i|ut)?gst(?=\b|\d)|\bvat\b|\bcess\b|\b(sales?\s*)?tax\b/i;
const NOT_TOTAL = /total\s*(qty|quantity|items?|savings?|discount)|no\.?\s*of\s*items/i;
const DATE = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2}(?!\d))|\b(\d{4})[-/.](\d{2})[-/.](\d{2})/;
const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const DATE_WORDS = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s+(\d{4})\b/i;
const TIME = /\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\b/i;
// "name ... [-]₹ 1,234.50" with optional currency marks around the amount.
const LINE = /^(.*?)[\s:=]*(-|−)?\s*(?:₹|rs\.?|inr|\$|€|£)?\s*(-?\d[\d,]*(?:\.\d{1,2})?)\s*(?:\/-|cr|dr)?$/i;

const pad = (n) => String(n).padStart(2, "0");
function findDate(text) {
  let m = text.match(DATE);
  if (m) {
    if (m[4]) return `${m[4]}-${m[5]}-${m[6]}`;
    let a = +m[1],
      b = +m[2],
      y = +m[3];
    if (y < 100) y += 2000;
    let [d, mo] = a > 12 ? [a, b] : b > 12 ? [b, a] : [a, b];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y > 2000 && y < 2100) return `${y}-${pad(mo)}-${pad(d)}`;
  }
  m = text.match(DATE_WORDS);
  if (m) return `${m[3]}-${pad(MONTHS.indexOf(m[2].toLowerCase().slice(0, 3)) + 1)}-${pad(m[1])}`;
  return "";
}
function findTime(text) {
  // Also finds a time glued to a date ("12/10/20257:45PM").
  let m = text.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i);
  if (!m) return "";
  let h = +m[1],
    min = +m[2];
  if (h > 23 && m[1].length === 2) h = +m[1][1];
  if (m[3]) {
    let pm = m[3].toLowerCase() === "pm";
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : "";
}

export function parseText(text, low = []) {
  let source = detectSource(text),
    lines = String(text)
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean),
    items = [],
    charges = [],
    total = "",
    subtotal = "",
    merchant = "";
  for (let line of lines.slice(0, 4)) {
    if (merchant || SKIP.test(line) || DATE.test(line) || TIME.test(line)) continue;
    if (/[a-z]{3}/i.test(line) && !/\d{3,}/.test(line) && line.length <= 40 && !/swiggy|zomato|order|\b(qty|price|amount|amt|rate|desc|item|total)\b/i.test(line) && (line.match(/,/g) || []).length < 2 && !/\d\.\d{2}\s*$/.test(line))
      merchant = cleanName(line);
  }
  let lowSet = low.map((w) => String(w).toLowerCase()).filter((w) => w.length > 1),
    afterTotal = false,
    sawRoundOff = false;
  for (let raw of lines) {
    let line = raw.replace(/[₹$]\s+/g, (m) => m.trim());
    if (/\bfree\b/i.test(line) && !/\d+\.\d{2}\s*$/.test(line)) continue;
    if (/r\w?\w?nd(ing)?\s*off/i.test(line) && !/\d\.\d{2}\s*$/.test(line)) {
      sawRoundOff = true;
      continue;
    }
    let m = line.match(LINE);
    if (!m) continue;
    let name = m[1].trim(),
      value = Number(m[3].replace(/,/g, "")),
      negative = Boolean(m[2]) || value < 0;
    value = Math.abs(value);
    if (!Number.isFinite(value) || !/[a-z]/i.test(name)) continue;
    if (DATE.test(line) || (TIME.test(line) && !/\d\.\d{2}\s*$/.test(line))) continue;
    let label = cleanName(name.replace(/[:=]+$/, ""));
    if (STRONG_TOTAL.test(label) && !/sub\s*-?\s*total|item\s*total/i.test(label)) {
      total = value;
      afterTotal = true;
      continue;
    }
    // Payment mode, amount tendered, change and UPI lines follow the total.
    if (afterTotal) continue;
    if (SKIP.test(name)) continue;
    // A tax line can be glued to other text on a messy photo
    // ("Total Qty: 23 Total CGST@2.5 2.5% 113.58"); keep the tax.
    if (TAX_WORD.test(label) && value) {
      let short = (label.match(/\b((c|s|i|ut)?gst|vat|cess|(sales?\s*)?tax)(?=\b|\d)[^a-z]*/i) || [label])[0].trim().replace(/[@(（]?\s*$/, "");
      let word = (short.match(/(c|s|i|ut)?gst|vat|cess/i) || [""])[0].toUpperCase(),
        pct = (label.match(/@\s*(\d{1,2}(?:\.\d)?)/) || label.match(/[(（](\d{1,2}(?:\.\d{1,2})?)/) || label.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%/) || label.match(/(?:gst|vat)\s*(\d{1,2}(?:\.\d{1,2})?)\s*$/i) || [])[1];
      if (pct && !(Number(pct) > 0 && Number(pct) <= 28)) pct = "";
      charges.push({ kind: "tax", label: word ? `${word}${pct ? ` ${pct}%` : ""}` : short, amount: negative ? -value : value });
      continue;
    }
    if (NOT_TOTAL.test(label)) continue;
    if (SUBTOTAL.test(label)) {
      subtotal = value;
      continue;
    }
    if (TOTAL.test(label)) {
      // The last total-like line usually wins (e.g. "To Pay" after "Total").
      total = value;
      continue;
    }
    if (SKIP.test(name)) continue;
    let kind = chargeKind(label);
    if (kind) {
      if (value) charges.push({ kind, label, amount: kind === "discount" || negative ? -value : value });
      continue;
    }
    let qty = 1,
      q,
      qtyFound = false;
    // "Paneer Tikka 2 x 120.00" / "Naan x 2" / "Naan 4 40.00" / "2 x Naan" / "2 Naan"
    if ((q = name.match(/^(.*?)\s+(\d{1,3})\s*[x×@*]\s*(\d+(?:\.\d{1,2})?)$/i))) {
      name = q[1];
      qty = +q[2];
    } else if ((q = name.match(/^(.*?)\s*[x×]\s*(\d{1,3})$/i))) {
      name = q[1];
      qty = +q[2];
    } else if ((q = name.match(/^(.*?)\s+(\d{1,3})\s+(\d+\.\d{1,2})$/))) {
      if (Math.abs(+q[2] * +q[3] - value) < 1) {
        name = q[1];
        qty = +q[2];
      }
    } else if ((q = name.match(/^(\d{1,3})\s*[x×]?\s+(?=[a-z(])(.*)$/i))) {
      qty = +q[1];
      name = q[2];
    } else if ((q = name.match(/^(.*[a-z)])\s+(\d{1,2})$/i))) {
      name = q[1];
      qty = +q[2];
    }
    qtyFound = qty !== 1 || cleanName(name) !== cleanName(m[1].trim());
    name = cleanName(name);
    if (!name || !/[a-z]{2}/i.test(name) || qty <= 0 || !value) continue;
    // Bill numbers, tables and phone digits are whole numbers; prices
    // carry paise, a currency mark or a quantity.
    if (!/\.\d{2}\s*(\/-)?$/.test(line) && !/[₹$€£]|rs\.?\s*\d|inr/i.test(line) && !qtyFound) continue;
    let lower = name.toLowerCase();
    items.push({
      name,
      qty,
      amount: negative ? -value : value,
      low: lowSet.some((w) => lower.includes(w)),
    });
  }
  // An unreadable round-off line: the small leftover to the printed total.
  if (sawRoundOff && total !== "") {
    let gap = Math.round(total * 100) - [...items, ...charges].reduce((a, x) => a + Math.round(x.amount * 100), 0);
    if (gap && Math.abs(gap) < 100) charges.push({ kind: "other", label: "Round off", amount: gap / 100 });
  }
  return {
    source,
    merchant,
    date: findDate(text),
    time: findTime(text),
    items,
    charges,
    total,
    subtotal,
  };
}
