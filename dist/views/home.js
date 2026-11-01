import { S, me, groupOf, store, nameOf } from "../store.js";
import { splitBill } from "../fair.js";
import { myPosition, ledgers, sharingCount } from "../model.js";
import { overdue } from "../remind.js";
import { todayISO } from "../store.js";
import { CATEGORIES } from "../icons.js";
import { av, avStack, esc, icon, fmt, money, iconBtn, firstName, dateLabel, openSheet, sheetHead, closeSheet, go, empty, plural } from "../ui.js";

export const catIcon = (b) => CATEGORIES[b.category] || (b.source === "food-app" ? "bowl" : "receipt");
export function billCard(b) {
  let ids = Object.entries(splitBill(b).shares)
      .filter(([, v]) => v > 0)
      .map(([k]) => k),
    n = ids.length || b.participants.length;
  return `<a class="bill-card" href="#/bill/${b.id}">
    <span class="bill-card-top"><span class="bill-ic">${icon(catIcon(b))}</span><span class="grow"><b>${esc(b.title || "Untitled bill")}</b><small>${dateLabel(b.date)}${b.groupId && groupOf(b.groupId) ? " · " + esc(groupOf(b.groupId).name) : ""}</small></span><span class="amt">${fmt(money(b.total))}</span></span>
    <span class="bill-card-bottom">${avStack(ids.length ? ids : b.participants)}<span class="sharing">Sharing: <b>${plural(n, "Person", "Persons")}</b></span></span>
  </a>`;
}

export function notifications() {
  let s = S(),
    out = [];
  for (let b of s.bills.filter((b) => b.status === "draft"))
    out.push({ icon: "edit", title: `Finish “${b.title || "Untitled bill"}”`, text: "This bill is saved as a draft.", go: `bill/${b.id}/${b.items.length ? "assign" : "items"}` });
  for (let b of s.bills.filter((b) => b.status === "final")) {
    let r = splitBill(b);
    if (r.disputed) out.push({ icon: "flag", title: `Disputed item on ${b.title}`, text: `${fmt(r.disputed)} is waiting to be sorted out.`, go: `bill/${b.id}` });
  }
  for (let o of overdue(s, todayISO()))
    out.push({ icon: "chat", title: `${nameOf(o.from)} hasn't paid ${fmt(o.amount)}`, text: `For ${o.what} · ${o.days} days ago. Tap to remind on WhatsApp.`, act: "tx-remind", from: o.from, group: o.groupId || "" });
  let days = s.prefs.lastBackup ? (Date.now() - s.prefs.lastBackup) / 864e5 : 999;
  if (s.bills.some((b) => b.status === "final") && days > 14 && !(s.prefs.backupSnooze > Date.now()))
    out.push({ icon: "download", title: "Back up your bills", text: "Your data lives only on this device. Export a backup in Settings.", go: "settings" });
  return out;
}

export const Home = {
  tabs: true,
  title: "Home",
  render() {
    let s = S(),
      m = me(),
      { owe, owed } = myPosition(),
      drafts = s.bills.filter((b) => b.status === "draft").sort((a, b) => b.createdAt - a.createdAt),
      recent = s.bills
        .filter((b) => b.status === "final")
        .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time) || b.createdAt - a.createdAt)
        .slice(0, 4),
      notes = notifications(),
      groups = ledgers().filter((l) => l.groupId);
    let message = owe
      ? `You have in total <b class="blue">${fmt(owe)}</b> unpaid bills.`
      : owed
        ? `Friends owe you <b class="blue">${fmt(owed)}</b> in total.`
        : `You're all square. Nothing to pay right now.`;
    let cta = owe ? `<button class="btn primary pill-sm" data-go="settle">Pay Bills</button>` : owed ? `<button class="btn primary pill-sm" data-go="settle">Settle up</button>` : `<button class="btn primary pill-sm" data-act="quick-open">Add expense</button>`;
    return `<header class="home-top">${iconBtn("menu", "drawer", "Menu")}<div class="row-gap">${iconBtn("search", "go-search", "Search bills")}<button class="icon-btn" data-act="notifications" aria-label="Notifications${notes.length ? ` (${notes.length})` : ""}">${icon("bell")}${notes.length ? '<i class="dot"></i>' : ""}</button></div></header>
    <div class="screen-body">
      <section class="card welcome">
        <h2>Welcome back, ${esc(firstName(m?.name))}!</h2>
        <p>${message.replace(/<b class="blue">([^<]+)<\/b>/, (_, v) => `<b class="blue" data-count="${(owe || owed)}">${v}</b>`)}</p>
        ${cta}
      </section>
      ${drafts
        .slice(0, 2)
        .map(
          (b) =>
            `<div class="draft-card"><a class="draft-main" href="#/bill/${b.id}/${b.items.length || b.mode !== "itemized" ? "assign" : "items"}"><span class="draft-ic">${icon("edit")}</span><span class="grow"><b>Continue “${esc(b.title || "Untitled bill")}”</b><small>Draft · ${plural(b.items.length, "item")} · ${fmt(money(b.total))}</small></span></a><button class="icon-btn plain" data-act="draft-discard" data-id="${b.id}" aria-label="Discard draft">${icon("x")}</button></div>`,
        )
        .join("")}
      <div class="section-head"><h3>Recent Bills</h3>${recent.length ? `<a class="see-all" href="#/history">See All</a>` : ""}</div>
      ${recent.length ? `<div class="stack-list">${recent.map(billCard).join("")}</div>` : `<section class="card">${empty(`<div class="empty-art">${icon("receipt")}</div>`, "No bills yet", "Scan a receipt or a food-app screenshot. We'll read the items for you.", `<button class="btn primary sm" data-act="quick-open">${icon("plus")} Add expense</button><button class="btn outline sm" data-go="scan">${icon("scan")} Scan a bill</button><button class="link small" data-go="sample">Try a sample</button>`)}</section>`}
      <div class="section-head"><h3>Your Groups</h3><a class="see-all" href="#/groups">${groups.length ? "See All" : "Create"}</a></div>
      <div class="group-strip" data-scroll="groups">${groups
        .map((l) => {
          let g = groupOf(l.groupId),
            mine = l.balance[s.meId] || 0;
          return `<a class="group-tile" href="#/group/${g.id}"><b>${esc(g.name)}</b>${avStack(g.memberIds, 4, 26)}<small class="${mine < 0 ? "neg" : mine > 0 ? "pos" : ""}">${mine < 0 ? `You owe ${fmt(-mine)}` : mine > 0 ? `You get ${fmt(mine)}` : "All settled"}</small></a>`;
        })
        .join("")}<button class="group-tile add" data-act="group-new">${icon("plus")}<b>New group</b><small>Flatmates, trips…</small></button></div>
      ${!s.people.some((p) => p.tags?.length) && s.people.length > 1 ? `<section class="tip-card"><span class="tip-ic">${icon("leaf")}</span><div class="grow"><b>Fair splits, zero awkward talks</b><p>Tag friends who are veg or don't drink. They'll be left out of chicken and beer automatically.</p><a class="link" href="#/friends">Tag friends ${icon("next")}</a></div></section>` : ""}
    </div>`;
  },
};

function drawerSheet() {
  let m = me(),
    link = (to, ic, label) => `<a class="drawer-link" href="#/${to}" data-act="sheet-close-nav">${icon(ic)}<span>${label}</span>${icon("next")}</a>`;
  return `${sheetHead("Menu")}<a class="drawer-me" href="#/settings" data-act="sheet-close-nav">${av(m, 52)}<span class="grow"><b>${esc(m?.name)}</b><small>View profile & settings</small></span>${icon("next")}</a>
  <nav class="drawer-nav">${link("friends", "users", "Friends")}${link("groups", "wallet", "Groups")}${link("settle", "check", "Settle up")}${link("history", "history", "History")}${link("insights", "chart", "Insights")}${link("settings", "settings", "Settings")}</nav>
  <p class="fine center">${icon("lock")} Private by design. Everything stays on this device.</p>`;
}
function notesSheet() {
  let notes = notifications();
  return `${sheetHead("Notifications")}${
    notes.length
      ? `<div class="notes">${notes.map((n) => n.act ? `<button class="note" data-act="${n.act}" data-from="${n.from}" data-group="${n.group}"><span class="note-ic wa">${icon(n.icon)}</span><span class="grow"><b>${esc(n.title)}</b><small>${esc(n.text)}</small></span>${icon("next")}</button>` : `<a class="note" href="#/${n.go}" data-act="sheet-close-nav"><span class="note-ic">${icon(n.icon)}</span><span class="grow"><b>${esc(n.title)}</b><small>${esc(n.text)}</small></span>${icon("next")}</a>`).join("")}</div>`
      : empty(`<div class="empty-art">${icon("bell")}</div>`, "You're all caught up", "Drafts, disputes and reminders will show up here.")
  }`;
}

export const homeActions = {
  drawer: () => openSheet(drawerSheet, { label: "Menu" }),
  notifications: () => openSheet(notesSheet, { label: "Notifications" }),
  "go-search": () => go("history?focus=1"),
  "sheet-close-nav": () => closeSheet(true),
};
