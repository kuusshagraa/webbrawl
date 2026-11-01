// Rebuilds receipt lines from positioned OCR words.
// Phone photos are tilted, so words are grouped into rows after undoing the
// tilt; fused number columns are split using qty x rate = amount; item names
// that wrap onto a second line are joined back to their item.
import { chargeKind, parseText } from "./parse.js";

const median = (a) => {
  if (!a.length) return 0;
  let s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const NUMERIC = /^-?[\d.,]+$/;
const MONEY = /-?\d[\d,]*\.\d{2}/;
const KEYWORD = /total|subtotal|amount|tax|gst|cgst|sgst|igst|vat|cess|round|discount|thank|visit|feedback|scan|qty|item|price|rate|cashier|bill|table|date|time|invoice|phone|gstin|paid|balance|change|payment|upi|cash|card/i;

// OCR often reads 0 as O/C/o and 1 as l/I inside numbers.
function fixDigits(tok) {
  if (!/\d/.test(tok) || !/^[-\d.,OoCcIl|SB]+$/.test(tok)) return tok;
  return tok.replace(/[OoCc]/g, "0").replace(/[Il|]/g, "1").replace(/S/g, "5").replace(/B/g, "8");
}

// Splits "1194.00194.00" -> ["1", "194.00", "194.00"] when the arithmetic fits.
export function splitNumbers(text) {
  let s = text
      .replace(/(^|\s)[^\w\s-]+(?=\d)/g, "$1") // ")1122.00" -> "1122.00"
      // A decimal GST rate fused to the tax amount: "2.511.38" -> "2.5 11.38"
      .replace(/(gst|tax|vat)([^\d]*?)(\d?\d\.\d)(\d+\.\d{2})\b/i, "$1$2$3 $4")
      .replace(/(\d\.\d{2})(?=\d)/g, "$1 ")
      .replace(/\s+/g, " ")
      .trim(),
    parts = s.split(" "),
    nums = [];
  while (parts.length && NUMERIC.test(parts[parts.length - 1])) nums.unshift(parts.pop());
  let name = parts.join(" ");
  // "Masala Chai 3 x 30.00 90.00": the quantity sits before an x/@ marker.
  let marked = name.match(/^(.*?)\s+(\d{1,3})\s*[x×@*]$/i);
  if (marked && nums.length === 2) return { name: marked[1].trim(), nums: [marked[2], ...nums] };
  // A trailing integer glued to the name ("Coffee3") is a quantity.
  let glued = name.match(/^(.*[a-z)])(\d{1,2})$/i);
  if (glued && nums.length >= 2) {
    name = glued[1];
    nums.unshift(glued[2]);
  }
  let amount = nums.length ? Number(nums[nums.length - 1].replace(/,/g, "")) : NaN;
  if (nums.length >= 2 && Number.isFinite(amount) && amount > 0) {
    let rateTok = nums[nums.length - 2],
      rate = Number(rateTok.replace(/,/g, "")),
      close = (a, b) => Math.abs(a - b) < 0.02;
    if (nums.length === 2 && close(rate, amount) && /\./.test(rateTok)) nums = ["1", ...nums];
    else if (nums.length === 2) {
      // Quantity fused into the rate: "2212.00 424.00" -> 2, 212.00
      let fixed = false;
      for (let k = 1; k <= 2 && !fixed; k++) {
        let q = Number(rateTok.slice(0, k)),
          r = Number(rateTok.slice(k));
        if (q > 0 && r > 0 && close(q * r, amount)) {
          nums = [String(q), rateTok.slice(k), nums[1]];
          fixed = true;
        }
      }
      // Quantity missing entirely: "230.00 690.00" -> 3, 230.00 (or 1 when equal)
      if (!fixed && close(rate, amount)) nums = ["1", rateTok, nums[1]];
      else if (!fixed && rate > 0) {
        let q = amount / rate;
        if (Number.isInteger(Math.round(q * 1000) / 1000) && q >= 2 && q <= 50) nums = [String(Math.round(q)), rateTok, nums[1]];
      }
    }
  }
  return { name: name.trim(), nums };
}

export function linesFromWords(words) {
  let ws = words
    .filter((w) => w && String(w.text || "").trim() && Array.isArray(w.pts) && w.pts.length === 4)
    .map((w) => {
      let [tl, tr, br, bl] = w.pts,
        width = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]),
        height = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]);
      return { text: String(w.text).trim(), tl, tr, br, bl, width, height, conf: w.conf ?? 1 };
    });
  if (!ws.length) return [];
  let angle = median(ws.filter((w) => w.width > w.height * 2).map((w) => Math.atan2(w.tr[1] - w.tl[1], w.tr[0] - w.tl[0]))),
    cos = Math.cos(-angle),
    sin = Math.sin(-angle);
  for (let w of ws) {
    let cx = (w.tl[0] + w.tr[0] + w.br[0] + w.bl[0]) / 4,
      cy = (w.tl[1] + w.tr[1] + w.br[1] + w.bl[1]) / 4;
    w.x = cx * cos - cy * sin;
    w.y = cx * sin + cy * cos;
    w.left = w.x - w.width / 2;
  }
  let h = median(ws.map((w) => w.height)) || 10,
    rows = [];
  for (let w of [...ws].sort((a, b) => a.y - b.y)) {
    let row = rows[rows.length - 1];
    if (row && Math.abs(w.y - row.y) < h * 0.55) {
      row.words.push(w);
      row.y = row.words.reduce((a, x) => a + x.y, 0) / row.words.length;
    } else rows.push({ y: w.y, words: [w] });
  }
  let lines = rows.map((r) => {
    let text = r.words
      .sort((a, b) => a.left - b.left)
      .map((w) => w.text.split(/\s+/).map(fixDigits).join(" "))
      .join(" ");
    let { name, nums } = splitNumbers(text);
    return { y: r.y, text, name, nums, low: r.words.some((w) => w.conf < 0.75) };
  });
  // Join wrapped item names ("Kalmi Vada Dahi" / "Chaat") onto their item.
  let out = [];
  for (let l of lines) {
    let prev = out[out.length - 1],
      isItem = (x) => x && x.nums.length >= 1 && MONEY.test(x.nums[x.nums.length - 1]) && /[a-z]{2}/i.test(x.name) && !KEYWORD.test(x.name) && !chargeKind(x.name);
    let wrap = prev && isItem(prev) && !l.nums.length && /[a-z]{2}/i.test(l.text) && !KEYWORD.test(l.text) && !/\d{3,}/.test(l.text) && l.y - prev.y < h * 2.2 && l.text.length <= 30;
    if (wrap) {
      prev.name = `${prev.name} ${l.text}`.trim();
      prev.y = l.y;
      prev.low ||= l.low;
      continue;
    }
    out.push({ ...l });
  }
  return out.map((l) => ({ text: l.nums.length ? `${l.name} ${l.nums.join(" ")}`.trim() : l.text, low: l.low }));
}

// OCR words -> bill draft (same shape as parseText).
export function parseWords(words) {
  let lines = linesFromWords(words),
    low = words.filter((w) => (w.conf ?? 1) < 0.75).flatMap((w) => String(w.text).split(/\s+/));
  return parseText(lines.map((l) => l.text).join("\n"), low);
}
