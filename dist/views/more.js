import { S, store, person, groupOf, nameOf, parseBackup, replaceState, todayISO, KEY, V1_KEY, inDemo } from "../store.js";
import { money } from "../core.js";
import { splitBill } from "../fair.js";
import { csvAll } from "../model.js";
import { CATEGORIES } from "../icons.js";
import { av, esc, icon, fmt, topbar, refresh, commit, toast, go, confirmDialog, download, pickFile, empty, plural, dateLabel, monthLabel, toggle } from "../ui.js";
import { billCard } from "./home.js";
import { editPerson, dietBadges } from "./people.js";

/* ---------- History ---------- */

let hq = "",
  hFilter = "all";
export const History = {
  tabs: true,
  title: "History",
  render() {
    let s = S(),
      q = hq.trim().toLowerCase(),
      bills = s.bills
        .filter((b) => (hFilter === "drafts" ? b.status === "draft" : b.status === "final"))
        .filter((b) => hFilter === "all" || hFilter === "drafts" || (hFilter === "personal" ? !b.groupId : b.groupId === hFilter))
        .filter((b) => !q || [b.title, b.merchant, nameOf(b.payerId, false), ...b.items.map((i) => i.name), ...b.participants.map((p) => nameOf(p, false))].join(" ").toLowerCase().includes(q))
        .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time) || b.createdAt - a.createdAt),
      months = {};
    for (let b of bills) (months[b.date.slice(0, 7)] ||= []).push(b);
    let drafts = s.bills.filter((b) => b.status === "draft").length;
    let filters = [["all", "All"], ["personal", "Personal"], ...s.groups.map((g) => [g.id, g.name]), ...(drafts ? [["drafts", `Drafts (${drafts})`]] : [])];
    return `${topbar("History", { left: '<span class="icon-spacer"></span>' })}
    <div class="screen-body">
      <label class="search">${icon("search")}<input type="search" id="history-search" data-f="hq" data-in="history-search" value="${esc(hq)}" placeholder="Search bills, items or people" aria-label="Search bills"></label>
      <div class="chips scroll" data-scroll="hfilters">${filters.map(([k, l]) => `<button class="chip ${hFilter === k ? "on" : ""}" data-act="history-filter" data-k="${k}">${esc(l)}</button>`).join("")}</div>
      ${
        bills.length
          ? Object.entries(months)
              .map(([m, list]) => `<div class="section-head"><h3>${monthLabel(m + "-01")}</h3><span class="muted small">${fmt(list.reduce((a, b) => a + money(b.total), 0))}</span></div><div class="stack-list">${list.map(billCard).join("")}</div>`)
              .join("")
          : `<section class="card">${empty(`<div class="empty-art">${icon(q ? "search" : "history")}</div>`, q ? "Nothing found" : "No bills here yet", q ? `No bills match “${esc(hq)}”.` : "Saved bills show up here, grouped by month.", q ? "" : `<button class="btn primary sm" data-go="scan">${icon("scan")} Scan a bill</button>`)}</section>`
      }
    </div>`;
  },
  mount() {
    if (/focus=1/.test(location.hash)) setTimeout(() => document.getElementById("history-search")?.focus(), 50);
  },
};

/* ---------- Insights ---------- */

function bars(entries, { color = "", money: isMoney = true } = {}) {
  let max = Math.max(1, ...entries.map((e) => e[1]));
  return entries.length
    ? `<div class="bars">${entries.map(([label, v, ic]) => `<div class="bar-row">${ic || ""}<span class="bar-label">${esc(label)}</span><div class="bar-track"><i class="${color}" style="width:${Math.max(2, (v / max) * 100)}%"></i></div><b>${isMoney ? fmt(v) : v}</b></div>`).join("")}</div>`
    : `<p class="muted small">Nothing to show yet.</p>`;
}
let range = "6m";
export const Insights = {
  tabs: true,
  title: "Insights",
  render() {
    let s = S(),
      me = s.meId,
      since = range === "all" ? "" : (() => {
        let d = new Date();
        d.setMonth(d.getMonth() - (range === "1m" ? 1 : 6));
        return todayISO(d);
      })(),
      bills = s.bills.filter((b) => b.status === "final" && b.date >= since),
      myShare = 0,
      paid = 0,
      byCat = {},
      byMonth = {},
      byPerson = {};
    for (let b of bills) {
      let r = splitBill(b),
        mine = r.shares[me] || 0;
      myShare += mine;
      if (b.payerId === me) paid += money(b.total);
      let cat = b.category || "Other";
      byCat[cat] = (byCat[cat] || 0) + mine;
      let m = b.date.slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + mine;
      byPerson[b.payerId] = (byPerson[b.payerId] || 0) + money(b.total);
    }
    let cats = Object.entries(byCat).filter((e) => e[1] > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v, `<span class="bar-ic">${icon(CATEGORIES[k] || "tag")}</span>`]),
      months = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => [monthLabel(k + "-01").replace(/ \d+$/, ""), v]),
      people = Object.entries(byPerson).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [nameOf(k), v, av(k, 24)]);
    return `${topbar("Insights", { left: '<span class="icon-spacer"></span>' })}
    <div class="screen-body">
      ${(() => {
        let now = todayISO().slice(0, 7),
          prev = (() => { let [y, mo] = now.split("-").map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`; })(),
          has = (ym) => s.bills.some((b) => b.status === "final" && b.date.startsWith(ym));
        return has(now) || has(prev) ? `<div class="wr-links">${has(prev) ? `<a class="wr-teaser" href="#/wrapped/${prev}"><span class="wr-teaser-ic">✨</span><span class="grow"><b>${monthLabel(prev + "-01")} Wrapped</b><small>Your month in splits</small></span>${icon("next")}</a>` : ""}${has(now) ? `<a class="wr-teaser soft" href="#/wrapped/${now}"><span class="wr-teaser-ic">📈</span><span class="grow"><b>This month so far</b><small>${monthLabel(now + "-01")}</small></span>${icon("next")}</a>` : ""}</div>` : "";
      })()}
      <div class="seg">${[["1m", "Last month"], ["6m", "6 months"], ["all", "All time"]].map(([k, l]) => `<button class="${range === k ? "on" : ""}" data-act="insight-range" data-k="${k}">${l}</button>`).join("")}</div>
      ${
        bills.length
          ? `<div class="stat-grid"><div class="stat card"><small>Your share</small><b>${fmt(myShare)}</b><span>${plural(bills.length, "bill")}</span></div><div class="stat card"><small>You paid upfront</small><b>${fmt(paid)}</b><span>for everyone</span></div></div>
      <section class="card"><div class="card-title"><h3>Where your money goes</h3></div>${bars(cats)}</section>
      <section class="card"><div class="card-title"><h3>Your share by month</h3></div>${bars(months, { color: "soft" })}</section>
      <section class="card"><div class="card-title"><h3>Who usually pays</h3></div>${bars(people, { color: "alt" })}</section>`
          : `<section class="card">${empty(`<div class="empty-art">${icon("chart")}</div>`, "No insights yet", "Save a few bills and you'll see where the money goes.")}</section>`
      }
    </div>`;
  },
};

/* ---------- Settings ---------- */

export const Settings = {
  tabs: true,
  title: "Settings",
  render() {
    let s = S(),
      me = person(s.meId),
      backupAge = s.prefs.lastBackup ? Math.floor((Date.now() - s.prefs.lastBackup) / 864e5) : null,
      size = new Blob([localStorage.getItem(KEY) || ""]).size;
    return `${topbar("Settings", { left: '<span class="icon-spacer"></span>' })}
    <div class="screen-body">
      <button class="card profile-card" data-act="person-open" data-id="${me?.id}">${av(me, 64)}<span class="grow"><b>${esc(me?.name)}</b><small>${me?.upi ? esc(me.upi) : "Add your UPI ID so friends can pay you"}</small><span class="badges">${dietBadges(me?.tags)}</span></span>${icon("edit")}</button>
      <section class="card list-card">
        <div class="setting-row"><span class="grow"><b>Default rounding</b><small>For new bills. The payer covers the difference.</small></span><div class="seg small">${[0, 1, 5, 10].map((v) => `<button class="${(s.prefs.roundTo || 0) === v ? "on" : ""}" data-act="pref-round" data-v="${v}">${v ? "₹" + v : "Exact"}</button>`).join("")}</div></div>
        <a class="setting-link" href="#/friends">${icon("users")}<span class="grow">Friends & food preferences</span>${icon("next")}</a>
        <a class="setting-link" href="#/groups">${icon("wallet")}<span class="grow">Groups</span>${icon("next")}</a>
        <a class="setting-link" href="#/insights">${icon("chart")}<span class="grow">Insights</span>${icon("next")}</a>
        ${inDemo() ? `<button class="setting-link" data-act="tour-start">${icon("hand")}<span class="grow">Restart the guided tour</span>${icon("next")}</button><button class="setting-link danger" data-act="demo-exit">${icon("x")}<span class="grow">Exit demo mode</span></button>` : `<button class="setting-link" data-act="demo-start">${icon("hand")}<span class="grow">Guided demo with sample data</span>${icon("next")}</button>`}
      </section>
      <section class="card list-card">
        <div class="card-title"><h3>Your data</h3><span class="muted small">${(size / 1024).toFixed(1)} KB on this device</span></div>
        <p class="muted small">${backupAge === null ? "You haven't made a backup yet." : backupAge === 0 ? "Backed up today." : `Last backup ${plural(backupAge, "day")} ago.`} Your bills live only in this browser, so back up before clearing data or switching phones.</p>
        <button class="setting-link" data-act="data-export">${icon("download")}<span class="grow">Back up everything (JSON)</span>${icon("next")}</button>
        <button class="setting-link" data-act="data-import">${icon("upload")}<span class="grow">Restore from a backup</span>${icon("next")}</button>
        <button class="setting-link" data-act="data-csv">${icon("receipt")}<span class="grow">Export bills as CSV</span>${icon("next")}</button>
        <button class="setting-link danger" data-act="data-reset">${icon("trash")}<span class="grow">Erase all data</span></button>
      </section>
      <section class="card about"><b>SplitSmart</b><p class="muted small">Receipts are read on your device with Tesseract.js. Money is counted in paise, so every split adds up exactly. No accounts, no servers.</p></section>
    </div>`;
  },
};

export const moreActions = {
  "history-search": (el) => {
    hq = el.value;
    refresh();
  },
  "history-filter": (el) => {
    hFilter = el.dataset.k;
    refresh();
  },
  "insight-range": (el) => {
    range = el.dataset.k;
    refresh();
  },
  "pref-round": (el) => commit((s) => (s.prefs.roundTo = Number(el.dataset.v))),
  "data-export": () => {
    download(`splitsmart-backup-${todayISO()}.json`, JSON.stringify(S(), null, 2), "application/json");
    commit((s) => (s.prefs.lastBackup = Date.now()));
    toast("Backup downloaded. Keep it somewhere safe.");
  },
  "data-csv": () => download(`splitsmart-bills-${todayISO()}.csv`, csvAll(), "text/csv"),
  "data-import": async () => {
    let [file] = await pickFile(".json,application/json");
    if (!file) return;
    let next;
    try {
      next = parseBackup(await file.text());
    } catch (e) {
      return toast(e.message || "That backup couldn't be read.", { tone: "warn" });
    }
    let s = S(),
      ok = await confirmDialog({
        title: "Restore this backup?",
        body: `It has ${plural(next.bills.length, "bill")}, ${plural(next.people.length, "person", "people")} and ${plural(next.groups.length, "group")}. It replaces what's on this device now. You can undo right after.`,
        ok: "Restore",
      });
    if (!ok) return;
    let snap = JSON.stringify(s);
    if (!next.meId) next.meId = s.meId && next.people.some((p) => p.id === s.meId) ? s.meId : null;
    if (!next.meId) {
      let mine = person(s.meId);
      if (mine) {
        next.people.push(mine);
        next.meId = mine.id;
      }
    }
    next.prefs.onboarded = true;
    replaceState(next);
    refresh();
    toast("Backup restored", { undo: snap });
  },
  "data-reset": async () => {
    let ok = await confirmDialog({ title: "Erase everything?", body: "All bills, friends, groups and payments on this device will be deleted. Download a backup first if you might need them.", ok: "Erase all", danger: true });
    if (!ok) return;
    let again = await confirmDialog({ title: "Are you sure?", body: "This can't be undone.", ok: "Yes, erase", danger: true });
    if (!again) return;
    // Also drop the v1 copy, or the next launch would migrate it back in.
    localStorage.removeItem(KEY);
    localStorage.removeItem(V1_KEY);
    location.hash = "#/welcome";
    location.reload();
  },
};
