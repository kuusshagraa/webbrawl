import { icon } from "./icons.js";
import { avatarSvg } from "./avatar.js";
import { fmt, money } from "./core.js";
import { person, persist, restore, snapshot, store } from "./store.js";

export { icon, fmt, money };
export const $ = (s, root = document) => root.querySelector(s);
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const rupees = (v) => fmt(money(v));
export const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "there";
export const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
export const amountText = (paise) => (paise / 100).toFixed(2);

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
export function dateLabel(iso, withYear = true) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  let [y, m, d] = iso.split("-").map(Number);
  return `${MONTH[m - 1]} ${d}${withYear ? ", " + y : ""}`;
}
export function timeLabel(t) {
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return "";
  let [h, m] = t.split(":").map(Number);
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
export const monthLabel = (iso) => {
  let [y, m] = iso.split("-").map(Number);
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${y}`;
};

/* ---------- Avatars ---------- */

export function av(p, size = 40, cls = "") {
  if (typeof p === "string") p = person(p);
  let label = p ? esc(p.name) : "Someone",
    inner = p?.avatar?.photo
      ? `<img src="${esc(p.avatar.photo)}" alt="">`
      : avatarSvg(p?.avatar || { seed: p?.name || "?" });
  return `<span class="av ${cls}" style="--s:${size}px" role="img" aria-label="${label}">${inner}</span>`;
}
export function avStack(ids, max = 3, size = 28) {
  let shown = ids.slice(0, max).map((id) => av(id, size)).join(""),
    more = ids.length - max;
  return `<span class="stack">${shown}${more > 0 ? `<span class="stack-more">+${more}</span>` : ""}</span>`;
}

/* ---------- Render loop ---------- */

// Returns "enter" the first time a slot shows a given key, so entrance
// animations play when content appears, not on every re-render.
const seen = new Map();
export function enter(slot, key) {
  if (seen.get(slot) === key) return "";
  seen.set(slot, key);
  return "enter";
}
// Buttons default to type=submit inside forms; make that explicit opt-in.
export function fixButtons(root = document) {
  root.querySelectorAll("button:not([type])").forEach((b) => (b.type = "button"));
}

let renderer = () => {};
export const setRenderer = (fn) => (renderer = fn);
export const refresh = () => renderer();
export function go(path, replace = false) {
  let hash = "#/" + path.replace(/^#?\/?/, "");
  if (location.hash === hash) return refresh();
  let depth = history.state?.depth || 0;
  replace ? history.replaceState({ depth }, "", hash) : history.pushState({ depth: depth + 1 }, "", hash);
  window.dispatchEvent(new Event("routechange"));
}
export function back(fallback = "home") {
  if (history.state?.depth > 0) history.back();
  else go(fallback, true);
}

/* ---------- Toasts ---------- */

let toastTimer = null;
export function toast(message, { undo = null, action = null, tone = "" } = {}) {
  let el = $("#toast");
  if (!el) return;
  clearTimeout(toastTimer);
  let btn = undo ? `<button data-toast="undo">${icon("undo")} Undo</button>` : action ? `<button data-toast="action">${esc(action.label)}</button>` : "";
  el.className = "toast show " + tone;
  el.innerHTML = `<span>${esc(message)}</span>${btn}`;
  el.onclick = (e) => {
    let b = e.target.closest("[data-toast]");
    if (!b) return;
    hideToast();
    if (b.dataset.toast === "undo") {
      restore(undo);
      refresh();
      toast("Change undone");
    } else action.fn();
  };
  toastTimer = setTimeout(hideToast, undo || action ? 6000 : 3200);
}
export function hideToast() {
  let el = $("#toast");
  if (el) el.className = "toast";
}

// Runs a mutation, saves, re-renders and offers Undo when a label is given.
export function commit(fn, undoLabel = null) {
  let snap = undoLabel ? snapshot() : null,
    result = fn(store.state);
  persist();
  refresh();
  if (undoLabel) toast(undoLabel, { undo: snap });
  return result;
}

/* ---------- Sheets & dialogs ---------- */

const sheets = [];
let lastFocus = null;
export function openSheet(render, { label = "Dialog", onClose = null, wide = false, cls = "" } = {}) {
  if (!sheets.length) lastFocus = document.activeElement;
  sheets.push({ render, label, onClose, wide, cls, fresh: true });
  drawSheets(true);
}
export function closeSheet(all = false) {
  let closing = all ? sheets.splice(0) : [sheets.pop()];
  closing.forEach((s) => s?.onClose?.());
  drawSheets(true);
  if (!sheets.length) lastFocus?.focus?.();
}
export const sheetOpen = () => sheets.length > 0;
export function drawSheets(focus = false) {
  let root = $("#sheet");
  if (!root) return;
  let top = sheets[sheets.length - 1];
  if (!top) {
    root.innerHTML = "";
    document.body.classList.remove("locked");
    return;
  }
  document.body.classList.add("locked");
  let anim = top.fresh ? "enter" : "";
  top.fresh = false;
  root.innerHTML = `<div class="sheet-wrap ${anim}" data-act="sheet-backdrop"><section class="sheet ${top.wide ? "wide" : ""} ${top.cls || ""}" role="dialog" aria-modal="true" aria-label="${esc(top.label)}"><div class="grabber" aria-hidden="true"></div>${top.render()}</section></div>`;
  fixButtons(root);
  countUp(root);
  if (focus) {
    let f = root.querySelector("[autofocus]") || root.querySelector("input, select, textarea, button:not(.sheet-x)") || root.querySelector("button");
    f?.focus({ preventScroll: true });
  }
}
export function sheetHead(title, sub = "") {
  return `<header class="sheet-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div><button class="icon-btn sheet-x" data-act="sheet-close" aria-label="Close">${icon("x")}</button></header>`;
}
export function trapFocus(e) {
  if (e.key !== "Tab" || !sheets.length) return;
  let nodes = [...document.querySelectorAll("#sheet button, #sheet input, #sheet select, #sheet textarea, #sheet a[href]")].filter((n) => !n.disabled && n.offsetParent !== null);
  if (!nodes.length) return;
  let first = nodes[0],
    last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    last.focus();
    e.preventDefault();
  } else if (!e.shiftKey && document.activeElement === last) {
    first.focus();
    e.preventDefault();
  }
}

export function confirmDialog({ title, body = "", ok = "Confirm", danger = false, cancel = "Cancel" }) {
  return new Promise((resolve) => {
    let done = false,
      finish = (v) => {
        if (done) return;
        done = true;
        resolve(v);
      };
    openSheet(
      () => `${sheetHead(title)}<p class="sheet-copy">${body}</p><div class="sheet-actions"><button class="btn outline" data-act="confirm-no">${esc(cancel)}</button><button class="btn ${danger ? "danger" : "primary"}" data-act="confirm-yes" autofocus>${esc(ok)}</button></div>`,
      { label: title, onClose: () => finish(false) },
    );
    confirmResolver = (v) => {
      finish(v);
    };
  });
}
export let confirmResolver = null;
export function resolveConfirm(v) {
  let r = confirmResolver;
  confirmResolver = null;
  sheets.pop();
  drawSheets(true);
  if (!sheets.length) lastFocus?.focus?.();
  r?.(v);
}

/* ---------- Browser helpers ---------- */

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    let t = document.createElement("textarea");
    t.value = text;
    t.setAttribute("readonly", "");
    t.style.cssText = "position:fixed;opacity:0;top:0";
    document.body.append(t);
    t.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    t.remove();
    return ok;
  }
}
export function download(filename, data, type) {
  let a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function pickFile(accept, multiple = false) {
  return new Promise((resolve) => {
    let input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve([...input.files]);
    input.click();
  });
}
// Square-crops and downsizes a photo for a profile picture.
export async function photoToDataUrl(file, size = 192) {
  let url = URL.createObjectURL(file);
  try {
    let img = await new Promise((res, rej) => {
      let i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    let c = document.createElement("canvas"),
      s = Math.min(img.naturalWidth, img.naturalHeight);
    c.width = c.height = size;
    c.getContext("2d").drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    return c.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------- Small components ---------- */

export const iconBtn = (name, act, label, extra = "") =>
  `<button class="icon-btn" data-act="${act}" aria-label="${esc(label)}" ${extra}>${icon(name)}</button>`;
export function topbar(title, { left = iconBtn("back", "back", "Back"), right = "" } = {}) {
  return `<header class="topbar">${left || '<span class="icon-spacer"></span>'}<h1 class="topbar-title">${title}</h1>${right || '<span class="icon-spacer"></span>'}</header>`;
}
export function empty(art, title, text, actions = "") {
  return `<div class="empty-state">${art}<h3>${title}</h3><p>${text}</p>${actions ? `<div class="empty-actions">${actions}</div>` : ""}</div>`;
}
export const toggle = (on, act, label, extra = "") =>
  `<button class="switch ${on ? "on" : ""}" role="switch" aria-checked="${on}" aria-label="${esc(label)}" data-act="${act}" ${extra}><i></i></button>`;

/* ---------- Delight ---------- */

const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
// Light tap feedback on Android (iOS doesn't expose vibration to websites).
export function haptic(ms = 8) {
  if (!calm()) navigator.vibrate?.(ms);
}
// A burst of confetti over everything; removes itself.
export function confetti() {
  if (calm()) return;
  let el = document.createElement("div");
  el.className = "confetti burst";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = Array.from({ length: 28 }, (_, i) => `<i style="--i:${i};--x:${(Math.random() * 100).toFixed(1)}%;--r:${Math.round(Math.random() * 720 - 360)}deg"></i>`).join("");
  document.body.append(el);
  setTimeout(() => el.remove(), 3200);
}
// Counts amounts up from zero the first time they appear.
const counted = new WeakSet();
export function countUp(root = document) {
  if (calm()) return;
  root.querySelectorAll("[data-count]").forEach((el) => {
    let key = el.dataset.count + "|" + (el.dataset.countKey || "");
    if (counted.has(el) || seen.get("count:" + key)) return;
    counted.add(el);
    seen.set("count:" + key, true);
    let target = Number(el.dataset.count),
      start = performance.now(),
      dur = 650;
    let step = (t) => {
      let k = Math.min(1, (t - start) / dur),
        eased = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(target * eased));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
