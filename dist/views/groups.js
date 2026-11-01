import { S, person, groupOf, nameOf, newId, todayISO } from "../store.js";
import { money } from "../core.js";
import { ledgers, shareUrl, myPosition } from "../model.js";
import { nudgeText, waLink } from "../nudge.js";
import { overdue } from "../remind.js";
import { av, avStack, esc, icon, fmt, topbar, iconBtn, openSheet, closeSheet, sheetHead, refresh, commit, toast, go, confirmDialog, copyText, empty, plural, dateLabel, toggle, firstName, confetti } from "../ui.js";
import { billCard } from "./home.js";
import { editPerson } from "./people.js";

/* ---------- Group editor ---------- */

let gEdit = null;
export function editGroup(id = null) {
  let g = id ? groupOf(id) : null,
    s = S();
  gEdit = g ? { ...structuredClone(g), _new: false, q: "" } : { id: newId(), name: "", memberIds: s.meId ? [s.meId] : [], target: 0, recurring: [], createdAt: Date.now(), _new: true, q: "" };
  openSheet(groupSheet, { label: g ? "Edit group" : "New group", onClose: () => (gEdit = null) });
}
function groupSheet() {
  if (!gEdit) return "";
  let s = S(),
    q = gEdit.q.trim().toLowerCase(),
    list = [...s.people].sort((a, b) => (a.id === s.meId ? -1 : b.id === s.meId ? 1 : a.name.localeCompare(b.name))).filter((p) => !q || p.name.toLowerCase().includes(q));
  return `${sheetHead(gEdit._new ? "New group" : "Edit group", gEdit._new ? "A group keeps a running balance across many bills." : "")}
  <form class="form" data-submit="group-save" novalidate>
    <label class="field"><span>Group name</span><input data-f="g-name" data-in="group-field" data-k="name" value="${esc(gEdit.name)}" maxlength="60" placeholder="e.g. Hostel Wing B, Goa Trip" required ${gEdit._new ? "autofocus" : ""}></label>
    <div class="field"><span>Members <em>${gEdit.memberIds.length} selected</em></span>
      <label class="search sm">${icon("search")}<input data-f="g-q" data-in="group-field" data-k="q" value="${esc(gEdit.q)}" placeholder="Search friends" aria-label="Search friends"></label>
      <div class="pick-list compact">${list
        .map((p) => {
          let on = gEdit.memberIds.includes(p.id);
          return `<button type="button" class="pick-row ${on ? "on" : ""}" data-act="group-member" data-id="${p.id}" role="checkbox" aria-checked="${on}">${av(p, 36)}<span class="grow"><b>${esc(p.id === s.meId ? p.name + " (you)" : p.name)}</b></span><span class="check ${on ? "on" : ""}">${icon("check")}</span></button>`;
        })
        .join("")}</div>
      <button type="button" class="link" data-act="group-new-friend">${icon("userPlus")} Add someone new</button>
    </div>
    <label class="field"><span>Monthly spending target <em>optional</em></span><span class="amt-box wide"><span>₹</span><input data-f="g-target" data-in="group-field" data-k="target" value="${esc(gEdit.target || "")}" inputmode="decimal" placeholder="0"></span></label>
    <p class="form-error" id="group-error" role="alert"></p>
    <div class="sheet-actions">${!gEdit._new ? `<button type="button" class="btn danger-outline" data-act="group-delete">Delete</button>` : ""}<button class="btn primary" type="submit">${gEdit._new ? "Create group" : "Save"}</button></div>
  </form>`;
}

/* ---------- UPI ---------- */

function upiLink(t) {
  let to = person(t.to);
  return `upi://pay?pa=${encodeURIComponent(to?.upi || "")}&pn=${encodeURIComponent(to?.name || "")}&am=${(t.amount / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent("SplitSmart settle-up")}`;
}
let upiTx = null;
function upiSheet() {
  let t = upiTx,
    to = person(t.to);
  if (!to?.upi)
    return `${sheetHead(`Pay ${esc(to?.name)}`)}<p class="sheet-copy">Add ${esc(firstName(to?.name))}'s UPI ID to create a payment link and QR code.</p><div class="sheet-actions"><button class="btn primary block" data-act="upi-add-id" data-id="${to?.id}">Add UPI ID</button></div>`;
  return `${sheetHead(`${t.from === S().meId ? "Pay" : `${esc(firstName(nameOf(t.from)))} pays`} ${esc(to.name)}`, `${fmt(t.amount)} to ${esc(to.upi)}`)}
    <div class="qr-box"><div id="upi-qr" aria-label="UPI QR code"><div class="spinner"></div></div><small>Scan with any UPI app</small></div>
    <div class="sheet-actions"><button class="btn outline" data-act="upi-copy">${icon("copy")} Copy UPI ID</button><a class="btn primary" href="${esc(upiLink(t))}">Open UPI app</a></div>
    <p class="fine center">Mark it as paid once the money has actually moved.</p>`;
}
export function redrawQr() {
  drawQr();
}
function drawQr() {
  let box = document.getElementById("upi-qr");
  if (!box || !upiTx) return;
  let render = () => {
    box.innerHTML = "";
    new window.QRCode(box, { text: upiLink(upiTx), width: 200, height: 200, correctLevel: window.QRCode.CorrectLevel.M });
  };
  if (window.QRCode) return render();
  let sc = document.createElement("script");
  sc.src = "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js";
  sc.onload = render;
  sc.onerror = () => (box.innerHTML = '<p class="muted small">QR needs internet the first time. Use "Open UPI app" instead.</p>');
  document.head.append(sc);
}

/* ---------- Settle up ---------- */

function txRow(t, groupId, i) {
  let me = S().meId,
    mine = t.from === me || t.to === me;
  return `<div class="tx ${mine ? "mine" : ""}">${av(t.from, 40)}<span class="tx-arrow">${icon("arrowRight")}</span>${av(t.to, 40)}<span class="grow"><b>${esc(nameOf(t.from))} ${t.from === me ? "pay" : "pays"} ${esc(t.to === me ? "you" : nameOf(t.to))}</b><small>${fmt(t.amount)}</small></span><span class="tx-actions">${t.to === me ? `<button class="btn sm wa icon-only" data-act="tx-remind" data-group="${groupId || ""}" data-from="${t.from}" aria-label="Remind ${esc(nameOf(t.from))} on WhatsApp">${icon("chat")}</button>` : ""}<button class="btn sm outline" data-act="upi-open" data-group="${groupId || ""}" data-i="${i}" aria-label="Pay with UPI">${icon("qr")}</button><button class="btn sm primary" data-act="tx-paid" data-group="${groupId || ""}" data-i="${i}">Paid</button></span></div>`;
}
const findTx = (groupId, i) => ledgers().find((l) => (l.groupId || "") === (groupId || ""))?.tx[Number(i)];

export const Settle = {
  tabs: true,
  title: "Settle up",
  render() {
    let s = S(),
      all = ledgers(),
      any = all.some((l) => l.tx.length),
      hidden = s.prefs.ignoreUnder;
    return `${topbar("Settle up")}
    <div class="screen-body">
      ${
        any
          ? all
              .filter((l) => l.tx.length)
              .map(
                (l) => `<section class="card"><div class="card-title"><h3>${esc(l.name)}</h3><span class="badge">${plural(l.tx.length, "payment")}</span></div>${l.tx.map((t, i) => txRow(t, l.groupId, i)).join("")}</section>`,
              )
              .join("")
          : `<section class="card">${empty(`<div class="empty-art ok">${icon("check")}</div>`, "Everyone's square", "No one owes anything right now. Enjoy it!", `<button class="btn primary sm" data-go="scan">${icon("scan")} Scan a bill</button>`)}</section>`
      }
      <section class="card"><div class="setting-row"><span class="grow"><b>Ignore tiny amounts</b><small>${hidden ? `Payments under ₹${hidden} are hidden.` : "Show every payment, even ₹1."}</small></span><div class="seg small">${[0, 10, 50].map((v) => `<button class="${hidden === v ? "on" : ""}" data-act="set-ignore" data-v="${v}">${v ? "<₹" + v : "Off"}</button>`).join("")}</div></div></section>
      <p class="fine center">${icon("info")} We suggest the fewest payments needed. Payments are recorded only when you tap Paid.</p>
      ${historyCard(s.settlements)}
    </div>`;
  },
};
function historyCard(list) {
  if (!list.length) return "";
  return `<section class="card"><div class="card-title"><h3>Payment history</h3></div>${[...list]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20)
    .map((t) => `<div class="tx small">${av(t.from, 32)}<span class="grow"><b>${esc(nameOf(t.from))} paid ${esc(nameOf(t.to))}</b><small>${dateLabel(t.date)}${t.groupId && groupOf(t.groupId) ? " · " + esc(groupOf(t.groupId).name) : ""}</small></span><b>${fmt(money(t.amount))}</b><button class="icon-btn plain sm" data-act="tx-undo" data-id="${t.id}" aria-label="Remove this payment">${icon("trash")}</button></div>`)
    .join("")}</section>`;
}

/* ---------- Groups ---------- */

export const Groups = {
  tabs: true,
  title: "Groups",
  render() {
    let s = S(),
      all = ledgers().filter((l) => l.groupId);
    return `${topbar("Groups", { right: iconBtn("plus", "group-new", "New group") })}
    <div class="screen-body">${
      all.length
        ? all
            .map((l) => {
              let g = groupOf(l.groupId),
                mine = l.balance[s.meId] || 0,
                count = s.bills.filter((b) => b.groupId === g.id && b.status === "final").length;
              return `<a class="group-card card" href="#/group/${g.id}"><div class="gc-top"><b>${esc(g.name)}</b><span class="${mine < 0 ? "neg" : mine > 0 ? "pos" : "muted"}">${mine < 0 ? `You owe ${fmt(-mine)}` : mine > 0 ? `You get ${fmt(mine)}` : "Settled"}</span></div><div class="gc-bottom">${avStack(g.memberIds, 5, 30)}<small>${plural(g.memberIds.length, "member")} · ${plural(count, "bill")}</small></div></a>`;
            })
            .join("")
        : `<section class="card">${empty(`<div class="empty-art">${icon("users")}</div>`, "No groups yet", "Make one for your flatmates, hostel wing or a trip. Balances carry over from bill to bill.", `<button class="btn primary sm" data-act="group-new">${icon("plus")} New group</button>`)}</section>`
    }</div>`;
  },
};

export const Group = {
  title: "Group",
  render({ id }) {
    let g = groupOf(id);
    if (!g) return `${topbar("Group")}<div class="screen-body">${empty(`<div class="empty-art">${icon("users")}</div>`, "Group not found", "It may have been deleted.", `<button class="btn primary sm" data-go="groups">All groups</button>`)}</div>`;
    let s = S(),
      l = ledgers().find((x) => x.groupId === id),
      bills = s.bills.filter((b) => b.groupId === id && b.status === "final").sort((a, b) => b.date.localeCompare(a.date)),
      month = todayISO().slice(0, 7),
      spent = bills.filter((b) => b.date.startsWith(month)).reduce((a, b) => a + money(b.total), 0),
      target = money(g.target || 0),
      pct = target ? Math.min(100, Math.round((spent / target) * 100)) : 0;
    return `${topbar(esc(g.name), { right: iconBtn("settings", "group-edit", "Edit group", `data-id="${id}"`) })}
    <div class="screen-body">
      <section class="card group-hero"><div class="members-row">${g.memberIds.map((m) => `<span class="member">${av(m, 44)}<small>${esc(m === s.meId ? "You" : firstName(nameOf(m)))}</small><b class="${(l.balance[m] || 0) < 0 ? "neg" : (l.balance[m] || 0) > 0 ? "pos" : "muted"}">${(l.balance[m] || 0) === 0 ? "—" : ((l.balance[m] > 0 ? "+" : "−") + fmt(Math.abs(l.balance[m])))}</b></span>`).join("")}</div>
        <div class="row"><button class="btn primary sm" data-act="group-scan" data-id="${id}">${icon("scan")} Add a bill</button><button class="btn outline sm" data-act="group-edit" data-id="${id}">${icon("userPlus")} Members</button></div></section>
      ${target ? `<section class="card target"><div class="card-title"><h3>This month</h3><span class="${spent > target ? "neg" : "muted"}">${fmt(spent)} of ${fmt(target)}</span></div><div class="meter" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Spending target used"><i class="${spent > target ? "over" : ""}" style="width:${pct}%"></i></div><small class="muted">${spent > target ? `${fmt(spent - target)} over target` : `${fmt(target - spent)} left`}</small></section>` : ""}
      <section class="card"><div class="card-title"><h3>Settle up</h3>${l.tx.length ? `<span class="badge">${plural(l.tx.length, "payment")}</span>` : ""}</div>${l.tx.length ? l.tx.map((t, i) => txRow(t, id, i)).join("") : `<p class="muted small">${icon("check")} Everyone in ${esc(g.name)} is square.</p>`}</section>
      ${g.recurring.length ? `<section class="card"><div class="card-title"><h3>Monthly bills</h3></div>${g.recurring.map((r) => `<div class="tx small"><span class="bill-ic sm">${icon("repeat")}</span><span class="grow"><b>${esc(r.template.title)}</b><small>Next on ${dateLabel(r.next)} · ${fmt(money(r.template.total))}</small></span><button class="btn sm ghost danger-text" data-act="recurring-stop" data-group="${id}" data-id="${r.id}">Stop</button></div>`).join("")}</section>` : ""}
      <div class="section-head"><h3>Bills</h3><span class="muted small">${plural(bills.length, "bill")}</span></div>
      ${bills.length ? `<div class="stack-list">${bills.map(billCard).join("")}</div>` : `<section class="card">${empty(`<div class="empty-art">${icon("receipt")}</div>`, "No bills in this group yet", "Scan one, or pick this group on a bill's summary.")}</section>`}
    </div>`;
  },
};

export const groupActions = {
  "group-new": () => editGroup(),
  "group-edit": (el) => editGroup(el.dataset.id),
  "group-field": (el) => {
    gEdit[el.dataset.k] = el.value;
    if (el.dataset.k === "q") refresh();
  },
  "group-member": (el) => {
    let id = el.dataset.id;
    gEdit.memberIds = gEdit.memberIds.includes(id) ? gEdit.memberIds.filter((x) => x !== id) : [...gEdit.memberIds, id];
    refresh();
  },
  "group-new-friend": () => editPerson(null, { name: gEdit.q, after: (pid) => {
    if (gEdit && !gEdit.memberIds.includes(pid)) gEdit.memberIds.push(pid);
    if (gEdit) gEdit.q = "";
    refresh();
  } }),
  "group-save": () => {
    let name = gEdit.name.trim(),
      err = document.getElementById("group-error"),
      target = Number(String(gEdit.target || "").replace(/[₹,\s]/g, "")) || 0;
    if (!name) return (err.textContent = "Give the group a name.");
    if (gEdit.memberIds.length < 2) return (err.textContent = "Pick at least two members.");
    if (target < 0) return (err.textContent = "The target can't be negative.");
    let { _new, q, ...g } = { ...gEdit, name, target };
    closeSheet();
    commit((s) => {
      let i = s.groups.findIndex((x) => x.id === g.id);
      if (i >= 0) s.groups[i] = g;
      else s.groups.push(g);
    });
    toast(_new ? `${name} created` : "Group saved");
    if (_new) go(`group/${g.id}`);
  },
  "group-delete": async () => {
    let g = groupOf(gEdit.id),
      count = S().bills.filter((b) => b.groupId === g.id).length;
    let ok = await confirmDialog({ title: `Delete ${esc(g.name)}?`, body: count ? `Its ${plural(count, "bill")} will stay in History as personal bills, and their balances move to Personal bills.` : "This group has no bills.", ok: "Delete group", danger: true });
    if (!ok) return;
    closeSheet(true);
    go("groups", true);
    commit((s) => {
      s.groups = s.groups.filter((x) => x.id !== g.id);
      s.bills.forEach((b) => b.groupId === g.id && (b.groupId = null));
      s.settlements.forEach((t) => t.groupId === g.id && (t.groupId = null));
    }, `${g.name} deleted`);
  },
  "group-scan": (el) => go(`scan?group=${el.dataset.id}`),
  "recurring-stop": async (el) => {
    let ok = await confirmDialog({ title: "Stop this monthly bill?", body: "Bills already added stay. No new ones will be created.", ok: "Stop", danger: true });
    if (ok) commit((s) => {
      let g = s.groups.find((x) => x.id === el.dataset.group);
      g.recurring = g.recurring.filter((r) => r.id !== el.dataset.id);
    }, "Monthly bill stopped");
  },
  "upi-open": (el) => {
    upiTx = findTx(el.dataset.group, el.dataset.i);
    if (!upiTx) return;
    openSheet(upiSheet, { label: "Pay with UPI" });
    setTimeout(drawQr, 0);
  },
  "upi-copy": async () => {
    (await copyText(person(upiTx.to).upi)) && toast("UPI ID copied");
  },
  "upi-add-id": (el) => {
    closeSheet();
    editPerson(el.dataset.id, { after: () => {
      openSheet(upiSheet, { label: "Pay with UPI" });
      setTimeout(drawQr, 0);
    } });
  },
  "tx-paid": async (el) => {
    let t = findTx(el.dataset.group, el.dataset.i);
    if (!t) return;
    let ok = await confirmDialog({ title: "Mark as paid?", body: `${esc(nameOf(t.from))} paid ${esc(nameOf(t.to, true) === "You" ? "you" : nameOf(t.to))} <b>${fmt(t.amount)}</b>.`, ok: "Yes, paid" });
    if (!ok) return;
    commit((s) => s.settlements.push({ id: newId(), groupId: el.dataset.group || null, from: t.from, to: t.to, amount: t.amount / 100, date: todayISO() }), "Payment recorded");
    let pos = myPosition();
    if ((t.from === S().meId || t.to === S().meId) && !pos.owe && !pos.owed) {
      confetti();
      toast("All square! Nobody owes anybody. 🎉");
    }
  },
  "tx-undo": async (el) => {
    let ok = await confirmDialog({ title: "Remove this payment?", body: "Balances will go back to how they were before it.", ok: "Remove", danger: true });
    if (ok) commit((s) => (s.settlements = s.settlements.filter((t) => t.id !== el.dataset.id)), "Payment removed");
  },
  "tx-remind": (el) => remind(el.dataset.from, el.dataset.group || null),
  "set-ignore": (el) => commit((s) => (s.prefs.ignoreUnder = Number(el.dataset.v))),
};

// Opens WhatsApp with a friendly ask for what `from` owes me in one ledger.
export async function remind(from, groupId) {
  let s = S(),
    t = ledgers().find((l) => (l.groupId || null) === (groupId || null))?.tx.find((x) => x.from === from && x.to === s.meId);
  if (!t) return;
  let due = overdue(s, todayISO(), 0).find((o) => o.from === from && (o.groupId || null) === (groupId || null)),
    bill = due && s.bills.find((b) => b.id === due.billId),
    link = "";
  if (bill && !due.what.includes(" more")) link = await shareUrl(bill).catch(() => "");
  let p = person(from),
    text = nudgeText({ name: p?.name, amount: t.amount, billTitle: due?.what || groupOf(groupId)?.name || "our bills", category: bill?.category, upi: person(s.meId)?.upi, link, days: due?.days || 0 });
  window.open(waLink(text, p?.phone), "_blank", "noopener");
}
