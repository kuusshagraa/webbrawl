import { S, person, persist, todayISO, nameOf } from "../store.js";
import { money, allocate } from "../core.js";
import { splitBill, validateBill } from "../fair.js";
import { parseQuick, templates } from "../quick.js";
import { nudgeText, waLink } from "../nudge.js";
import { makeBill, makePerson, shareUrl, nowTime } from "../model.js";
import { CATEGORIES } from "../icons.js";
import { av, esc, icon, fmt, openSheet, closeSheet, sheetHead, refresh, commit, toast, go, sheetOpen, firstName, dateLabel, enter, confetti, haptic } from "../ui.js";
import { editPerson } from "./people.js";

const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
let qa = null,
  recognizer = null;

function lastQuick() {
  return [...S().bills].filter((b) => b.status === "final" && b.source === "quick").sort((a, b) => b.createdAt - a.createdAt)[0];
}
// People you split with most often, most frequent first.
function frequentPeople() {
  let s = S(),
    count = {};
  for (let b of s.bills) if (b.status === "final") b.participants.forEach((id) => (count[id] = (count[id] || 0) + 1));
  return s.people.filter((p) => p.id !== s.meId).sort((a, b) => (count[b.id] || 0) - (count[a.id] || 0) || a.name.localeCompare(b.name));
}
function recentGroupId() {
  return [...S().bills].filter((b) => b.groupId).sort((a, b) => b.createdAt - a.createdAt)[0]?.groupId || null;
}

export function openQuick(prefill = null) {
  let s = S(),
    last = lastQuick(),
    alive = (id) => s.people.some((p) => p.id === id);
  qa = {
    text: "",
    amount: "",
    title: "",
    category: "Other",
    catTouched: false,
    pickCat: false,
    others: new Set((last?.participants || []).filter((id) => id !== s.meId && alive(id))),
    payerId: s.meId,
    split: "equal",
    date: todayISO(),
    unknown: [],
    listening: false,
    error: "",
    saved: null,
  };
  if (prefill) applyParsed(prefill, true);
  haptic();
  openSheet(render, { label: "Add expense", onClose: stopVoice, cls: "tall" });
}
export const isQuickOpen = () => !!qa && sheetOpen();

function applyParsed(p, replacePeople = false) {
  let me = S().meId;
  if (p.amount) qa.amount = String(p.amount);
  if (p.title) {
    qa.title = p.title;
    if (!qa.catTouched) qa.category = p.category;
  }
  if (p.participants.length || replacePeople) {
    qa.others = new Set(p.participants.filter((id) => id !== me));
    if (p.payerId && p.payerId !== me) qa.others.add(p.payerId);
  }
  qa.payerId = p.payerId || me;
  qa.split = p.split === "owe" && qa.payerId === me ? "owe" : "equal";
  if (p.date) qa.date = p.date;
  qa.unknown = p.unknown || [];
}
function parseNow() {
  let s = S();
  applyParsed(parseQuick(qa.text, { people: s.people, groups: s.groups, meId: s.meId, today: todayISO(), recentGroupId: recentGroupId() }));
}

function draftBill() {
  let s = S(),
    me = s.meId,
    others = [...qa.others],
    total = Number(qa.amount),
    base = { source: "quick", title: qa.title.trim().replace(/^./, (c) => c.toUpperCase()) || "Expense", category: qa.category, date: qa.date, time: nowTime(), payerId: qa.payerId, total, totalSource: "receipt", items: [], charges: [], status: "final" };
  let bill;
  if (qa.split === "owe") {
    let parts = allocate(money(total), others.map(() => 1));
    bill = makeBill({ ...base, mode: "exact", participants: others, custom: Object.fromEntries(others.map((id, i) => [id, parts[i] / 100])) });
  } else bill = makeBill({ ...base, mode: "equal", participants: [...new Set([qa.payerId, me, ...others])] });
  let set = new Set(bill.participants.concat(bill.payerId)),
    g = s.groups.find((x) => x.memberIds.length === set.size && x.memberIds.every((id) => set.has(id)));
  bill.groupId = g?.id || null;
  return bill;
}

function render() {
  if (!qa) return "";
  return qa.saved ? successView() : formView();
}

function formView() {
  let s = S(),
    me = s.meId,
    amt = Number(qa.amount) || 0,
    people = frequentPeople(),
    shown = [...people.filter((p) => qa.others.has(p.id)), ...people.filter((p) => !qa.others.has(p.id))].slice(0, 12),
    count = qa.split === "owe" ? qa.others.size : qa.others.size + 1,
    each = count && amt ? fmt(allocate(money(amt), Array(count).fill(1))[count - 1]) : "",
    tpl = !qa.text && !qa.amount ? templates(s.bills) : [],
    cats = Object.entries(CATEGORIES),
    ready = amt > 0 && qa.others.size > 0;
  let payerName = qa.payerId === me ? "You" : firstName(nameOf(qa.payerId));
  let saveLabel = !amt ? "Enter an amount" : !qa.others.size ? "Pick who to split with" : qa.split === "owe" ? `Save · ${qa.others.size > 1 ? `${each} each` : `they owe ${fmt(money(amt))}`}` : `Save · ${each} each`;
  return `${sheetHead("Add expense")}
  <div class="qa ${enter("qa-form", qa.openedAt || (qa.openedAt = Date.now()))}">
    <div class="qa-smart ${qa.listening ? "listening" : ""}">
      ${icon("sparkle")}
      <input data-f="qa-text" data-in="qa-text" value="${esc(qa.text)}" placeholder='Try "Uber 640 with Rohit"' autocomplete="off" aria-label="Describe the expense in a sentence">
      ${SR ? `<button class="qa-mic" data-act="qa-voice" aria-label="${qa.listening ? "Stop listening" : "Speak the expense"}" aria-pressed="${qa.listening}">${icon("mic")}</button>` : ""}
    </div>
    ${qa.listening ? `<p class="qa-hint">Listening… say something like “Dinner 1200 with Aman and Kabir”</p>` : ""}
    ${tpl.length ? `<div class="qa-tpl" data-scroll="qa-tpl">${tpl.map((t, i) => `<button class="chip" data-act="qa-template" data-i="${i}">${icon(CATEGORIES[t.category] || "tag")}${esc(t.title)} · ${fmt(money(t.amount))}${t.participants.length > 1 ? ` · ${t.participants.filter((id) => id !== me).map((id) => esc(firstName(nameOf(id, false)))).slice(0, 2).join(", ")}` : ""}</button>`).join("")}</div>` : ""}
    <div class="qa-amount ${amt ? "" : "zero"}" role="status" aria-live="polite" aria-label="Amount ${esc(qa.amount || "0")} rupees"><span>₹</span><b>${esc(qa.amount || "0")}</b><i class="caret"></i></div>
    <div class="qa-what">
      <button class="qa-cat" data-act="qa-cat" aria-label="Category: ${qa.category}">${icon(CATEGORIES[qa.category] || "tag")}</button>
      <input data-f="qa-title" data-in="qa-title" value="${esc(qa.title)}" placeholder="What for?" maxlength="60" autocomplete="off" aria-label="What was it for">
    </div>
    ${qa.pickCat ? `<div class="chips qa-cats">${cats.map(([k, ic]) => `<button class="chip ${qa.category === k ? "on" : ""}" data-act="qa-set-cat" data-cat="${k}">${icon(ic)}${k}</button>`).join("")}</div>` : ""}
    <div class="qa-label"><span>Split with</span>${qa.others.size ? `<small>${qa.others.size + (qa.split === "owe" ? 0 : 1)} people</small>` : ""}</div>
    <div class="qa-people" data-scroll="qa-people">
      ${shown.map((p) => `<button class="qa-person ${qa.others.has(p.id) ? "on" : ""}" data-act="qa-person" data-id="${p.id}" aria-pressed="${qa.others.has(p.id)}">${av(p, 46)}<span>${esc(firstName(p.name))}</span><i>${icon("check")}</i></button>`).join("")}
      <button class="qa-person add" data-act="qa-new-person"><span class="dashed">${icon("plus")}</span><span>New</span></button>
    </div>
    ${qa.unknown.length ? `<div class="chips qa-unknown">${qa.unknown.map((n) => `<button class="chip" data-act="qa-add-unknown" data-name="${esc(n)}">${icon("userPlus")}Add ${esc(n)}</button>`).join("")}</div>` : ""}
    <div class="qa-chips">
      <button class="chip" data-act="qa-payer">${av(qa.payerId, 22)}${qa.payerId === me ? "You paid" : `${esc(payerName)} paid`}${icon("down")}</button>
      <button class="chip" data-act="qa-split" aria-label="Split: ${qa.split === "owe" ? "they owe all" : "equally"}. Tap to change">${icon(qa.split === "owe" ? "arrowRight" : "equal")}${qa.split === "owe" ? "They owe all" : "Equally"}${icon("down")}</button>
      <label class="chip date">${icon("calendar")}<span>${qa.date === todayISO() ? "Today" : esc(dateLabel(qa.date, false))}</span><input type="date" data-ch="qa-date" value="${esc(qa.date)}" max="${todayISO()}" aria-label="Date"></label>
    </div>
    ${qa.error ? `<p class="form-error">${esc(qa.error)}</p>` : ""}
    <div class="qa-pad" role="group" aria-label="Amount keypad">
      ${["1", "2", "3", "back", "4", "5", "6", ".", "7", "8", "9", "0"].map((k) => `<button class="key" data-act="qa-key" data-k="${k}" aria-label="${k === "back" ? "Delete" : k}">${k === "back" ? icon("back") : k}</button>`).join("")}
    </div>
    <div class="qa-actions">
      <button class="btn outline" data-act="qa-scan">${icon("scan")} Scan</button>
      <button class="btn primary grow" data-act="qa-save" ${ready ? "" : "disabled"}>${esc(saveLabel)}</button>
    </div>
  </div>`;
}

function successView() {
  let s = S(),
    b = s.bills.find((x) => x.id === qa.saved);
  if (!b) return sheetHead("Saved");
  let r = splitBill(b),
    me = s.meId,
    lines = Object.entries(r.shares).filter(([id, v]) => v > 0 && id !== b.payerId);
  return `${sheetHead("")}
  <div class="qa-done">
    <div class="tick ${enter("qa-tick", b.id)}">${icon("check")}</div>
    <h2>${esc(b.title)} · <span data-count="${money(b.total)}">${fmt(money(b.total))}</span></h2>
    <p class="muted">Saved${b.groupId ? ` in ${esc(s.groups.find((g) => g.id === b.groupId)?.name || "")}` : ""}. ${b.payerId === me ? "Ask for your money back:" : ""}</p>
    <div class="qa-owes">${lines
      .map(([id, v]) => {
        let p = person(id),
          mine = b.payerId === me;
        return `<div class="qa-owe">${av(id, 40)}<span class="grow"><b>${id === me ? `You owe ${esc(firstName(nameOf(b.payerId, false)))}` : `${esc(firstName(p?.name))} owes ${b.payerId === me ? "you" : esc(firstName(nameOf(b.payerId, false)))}`}</b><small>${fmt(v)}</small></span>${mine && id !== me ? `<button class="btn sm wa" data-act="qa-wa" data-id="${id}">${icon("chat")} WhatsApp</button>` : ""}</div>`;
      })
      .join("")}</div>
    <div class="sheet-actions"><button class="btn outline" data-act="qa-again">Add another</button><button class="btn primary" data-act="qa-done">Done</button></div>
  </div>`;
}

function stopVoice() {
  try {
    recognizer?.stop();
  } catch {}
  recognizer = null;
  if (qa) qa.listening = false;
}

function key(k) {
  let a = qa.amount;
  if (k === "back") a = a.slice(0, -1);
  else if (k === ".") a = a.includes(".") ? a : (a || "0") + ".";
  else if (/^\d$/.test(k)) {
    if (/\.\d{2}$/.test(a) || a.replace(".", "").length >= 8) return;
    a = a === "0" ? k : a + k;
  }
  qa.amount = a;
  qa.error = "";
  haptic(4);
  refresh();
}
// Desktop: number keys type into the amount when no text field is focused.
export function quickKey(e) {
  if (!isQuickOpen() || qa.saved) return false;
  if (/^[0-9.]$/.test(e.key)) key(e.key);
  else if (e.key === "Backspace") key("back");
  else if (e.key === "Enter" && Number(qa.amount) > 0 && qa.others.size) quickActions["qa-save"]();
  else return false;
  return true;
}

async function sendNudge(billId, pid) {
  let s = S(),
    b = s.bills.find((x) => x.id === billId),
    p = person(pid),
    me = person(s.meId),
    share = splitBill(b).shares[pid] || 0,
    link = "";
  try {
    link = await shareUrl(b);
  } catch {}
  window.open(waLink(nudgeText({ name: p?.name, amount: share, billTitle: b.title, category: b.category, upi: me?.upi, link }), p?.phone), "_blank", "noopener");
}
export { sendNudge };

export const quickActions = {
  "quick-open": () => openQuick(),
  "qa-noop": () => {},
  "qa-text": (el) => {
    qa.text = el.value;
    parseNow();
    refresh();
  },
  "qa-title": (el) => {
    qa.title = el.value;
    if (!qa.catTouched) {
      let cat = parseQuick(el.value, { meId: S().meId, today: todayISO() }).category;
      if (cat !== qa.category) {
        qa.category = cat;
        refresh();
      }
    }
  },
  "qa-cat": () => {
    qa.pickCat = !qa.pickCat;
    refresh();
  },
  "qa-set-cat": (el) => {
    qa.category = el.dataset.cat;
    qa.catTouched = true;
    qa.pickCat = false;
    refresh();
  },
  "qa-key": (el) => key(el.dataset.k),
  "qa-person": (el) => {
    let id = el.dataset.id;
    qa.others.has(id) ? qa.others.delete(id) : qa.others.add(id);
    if (!qa.others.has(qa.payerId) && qa.payerId !== S().meId) qa.payerId = S().meId;
    qa.error = "";
    haptic(4);
    refresh();
  },
  "qa-new-person": () => editPerson(null, { after: (pid) => (qa?.others.add(pid), refresh()) }),
  "qa-add-unknown": (el) => {
    let p = makePerson(el.dataset.name);
    commit((s) => s.people.push(p));
    qa.others.add(p.id);
    qa.unknown = qa.unknown.filter((n) => n !== el.dataset.name);
    toast(`${p.name} added to your friends`);
    refresh();
  },
  "qa-payer": () => {
    let opts = [S().meId, ...qa.others],
      i = opts.indexOf(qa.payerId);
    qa.payerId = opts[(i + 1) % opts.length];
    if (qa.payerId !== S().meId) qa.split = "equal";
    refresh();
  },
  // Equally -> They owe all -> Custom… (opens the full split screen)
  "qa-split": () => {
    if (qa.split === "equal" && qa.payerId === S().meId) qa.split = "owe";
    else return quickActions["qa-custom"]();
    refresh();
  },
  "qa-date": (el) => {
    qa.date = el.value || todayISO();
    refresh();
  },
  "qa-template": (el) => {
    let t = templates(S().bills)[Number(el.dataset.i)];
    if (!t) return;
    qa.title = t.title;
    qa.category = t.category || qa.category;
    qa.amount = String(t.amount);
    qa.others = new Set(t.participants.filter((id) => id !== S().meId));
    qa.payerId = t.payerId;
    qa.split = t.mode === "exact" ? "owe" : "equal";
    refresh();
  },
  "qa-voice": () => {
    if (qa.listening) return stopVoice(), refresh();
    try {
      recognizer = new SR();
      recognizer.lang = "en-IN";
      recognizer.interimResults = true;
      recognizer.maxAlternatives = 1;
      recognizer.onresult = (e) => {
        qa.text = [...e.results].map((r) => r[0].transcript).join(" ");
        parseNow();
        refresh();
      };
      recognizer.onerror = (e) => {
        stopVoice();
        refresh();
        toast(e.error === "not-allowed" ? "Microphone access is blocked. Allow it in your browser settings." : "Couldn't hear that. Try again or type it.", { tone: "warn" });
      };
      recognizer.onend = () => {
        if (qa) qa.listening = false;
        refresh();
      };
      recognizer.start();
      qa.listening = true;
      haptic();
      refresh();
    } catch {
      toast("Voice input isn't available in this browser.", { tone: "warn" });
    }
  },
  "qa-save": () => {
    let b = draftBill(),
      errs = validateBill(b, S().people.map((p) => p.id));
    if (errs.length) {
      qa.error = errs[0].msg;
      return refresh();
    }
    stopVoice();
    let first = !S().bills.some((x) => x.status === "final");
    commit((s) => s.bills.push(b));
    qa.saved = b.id;
    haptic(15);
    refresh();
    if (first) confetti();
  },
  "qa-custom": () => {
    if (!(Number(qa.amount) > 0)) {
      qa.error = "Enter the amount first.";
      return refresh();
    }
    let b = draftBill();
    b.status = "draft";
    b.mode = "exact";
    b.participants = [...new Set([S().meId, ...qa.others])];
    b.custom = {};
    commit((s) => s.bills.push(b));
    closeSheet(true);
    go(`bill/${b.id}`);
  },
  "qa-scan": () => {
    closeSheet(true);
    go("scan");
  },
  "qa-wa": (el) => sendNudge(qa.saved, el.dataset.id),
  "qa-again": () => {
    closeSheet(true);
    openQuick();
  },
  "qa-done": () => closeSheet(true),
};
