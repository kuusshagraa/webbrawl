// WhatsApp messages that ask a friend for their share.
import { fmt } from "./core.js";

const EMOJI = { Travel: "🚗", Food: "🍛", Coffee: "☕", Groceries: "🛒", Utilities: "💡", Entertainment: "🎬" };

export function nudgeText({ name, amount, billTitle, category, upi = "", link = "", days = 0 }) {
  let first = String(name || "there").trim().split(/\s+/)[0],
    emoji = EMOJI[category] ? ` ${EMOJI[category]}` : "",
    what = billTitle || "our bill";
  let parts = [
    days >= 2
      ? `Hey ${first}! Just a reminder: your share for ${what}${emoji} is ${fmt(amount)} (${days} days ago).`
      : `Hey ${first}! Your share for ${what}${emoji} is ${fmt(amount)}.`,
  ];
  if (upi) parts.push(`You can pay me at ${upi}.`);
  if (link) parts.push(`Breakdown: ${link}`);
  return parts.join(" ");
}

// Indian mobile numbers become 91XXXXXXXXXX; anything else is dropped.
export function cleanPhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? "91" + d : "";
}

export function waLink(text, phone = "") {
  let p = cleanPhone(phone);
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}
