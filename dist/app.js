import { initStore, onPersistError, store, S, me, bill, persist, restore } from "./store.js";
import { validateBill } from "./fair.js";
import { myPosition, ledgers, makeBill, makeItem, sampleBill, tidyBill } from "./model.js";
import { session } from "./session.js";
import { av, esc, icon, fmt, fixButtons, countUp, setRenderer, go, back, toast, drawSheets, closeSheet, sheetOpen, trapFocus, resolveConfirm, openSheet, sheetHead, download, commit, firstName } from "./ui.js";
import { Onboarding, onboardingActions } from "./views/onboarding.js";
import { Home, homeActions } from "./views/home.js";
import { Scan, scanActions } from "./views/scan.js";
import { Items, Assign, Summary, billActions, liveSplit } from "./views/bill.js";
import { Pass, passActions } from "./views/pass.js";
import { Shared, sharedActions } from "./views/shared.js";
import { Friends, friendActions, personActions, studioActions } from "./views/people.js";
import { Groups, Group, Settle, groupActions } from "./views/groups.js";
import { History, Insights, Settings, moreActions } from "./views/more.js";
import { quickActions, openQuick, quickKey } from "./views/quick.js";

const actions = {
  ...studioActions,
  ...onboardingActions,
  ...homeActions,
  ...scanActions,
  ...billActions,
  ...passActions,
  ...sharedActions,
  ...friendActions,
  ...personActions,
  ...groupActions,
  ...moreActions,
  ...quickActions,
  back: () => back("home"),
  "sheet-close": () => closeSheet(),
  "confirm-yes": () => resolveConfirm(true),
  "confirm-no": () => resolveConfirm(false),
  "new-bill": () => newManualBill(),
};

const ROUTES = [
  [/^welcome$/, Onboarding],
  [/^home$/, Home],
  [/^scan$/, Scan],
  [/^bill\/([^/]+)\/(?:items|edit)$/, Items, ["id"]],
  [/^bill\/([^/]+)\/assign$/, Assign, ["id"]],
  [/^bill\/([^/]+)\/pass$/, Pass, ["id"]],
  [/^bill\/([^/]+)$/, Summary, ["id"]],
  [/^s\/(.+)$/, Shared, ["payload"]],
  [/^friends$/, Friends],
  [/^groups$/, Groups],
  [/^group\/([^/]+)$/, Group, ["id"]],
  [/^settle$/, Settle],
  [/^history$/, History],
  [/^insights$/, Insights],
  [/^settings$/, Settings],
];

let current = { view: null, params: {}, path: "" };

function parseHash() {
  let raw = location.hash.replace(/^#\/?/, ""),
    [path] = raw.split("?");
  return path || "home";
}

function newManualBill() {
  let b = makeBill({ items: [makeItem()] });
  commit((s) => s.bills.push(b));
  go(`bill/${b.id}/items`);
}

// Leaving a saved bill's edit screens through browser Back keeps valid
// changes and rolls back broken ones, so balances never use a half-edit.
function closeEditSession(path) {
  let ed = session.edit;
  if (!ed || path.startsWith(`bill/${ed.id}/`)) return;
  session.edit = null;
  let b = bill(ed.id);
  if (!b || JSON.stringify(b) === ed.json) return;
  if (validateBill(b, S().people.map((p) => p.id)).length) {
    let i = S().bills.findIndex((x) => x.id === ed.id);
    S().bills[i] = JSON.parse(ed.json);
    persist();
    toast("Unfinished changes to the bill were discarded.");
  } else toast("Changes saved");
}

function route() {
  let path = parseHash(),
    s = S();
  if (!s.prefs.onboarded && !/^(welcome|s\/)/.test(path)) return go("welcome", true);
  if (s.prefs.onboarded && path === "welcome") return go("home", true);
  if (path === "sample") {
    let { bill: b, created } = sampleBill();
    commit((st) => {
      st.people.push(...created);
      st.bills.push(tidyBill(b));
    });
    toast(created.length ? "Sample bill with demo friends. Aman is veg and Kabir doesn't drink." : "Here's a sample bill to play with.");
    return go(`bill/${b.id}/assign`, true);
  }
  if (path === "new") {
    history.replaceState(history.state, "", "#/home");
    go("home", true);
    return openQuick();
  }
  let view = null,
    params = {};
  for (let [re, v, keys = []] of ROUTES) {
    let m = path.match(re);
    if (m) {
      view = v;
      keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      break;
    }
  }
  if (!view) return go("home", true);
  closeEditSession(path);
  let changed = path !== current.path;
  if (changed) {
    current.view?.unmount?.(current.params);
    if (sheetOpen()) closeSheet(true);
    if (current.params.id !== params.id) {
      session.badFields = new Set();
      session.openDetails = new Set();
    }
  }
  current = { view, params, path };
  render();
  if (changed) {
    window.scrollTo(0, 0);
    view.mount?.(params);
    document.title = `${view.title || "SplitSmart"} · SplitSmart`;
  }
}

/* ---------- Shell ---------- */

const NAV = [
  ["home", "home", "Home"],
  ["history", "history", "History"],
  ["friends", "users", "Friends"],
  ["groups", "wallet", "Groups"],
  ["settle", "check", "Settle up"],
  ["insights", "chart", "Insights"],
  ["settings", "settings", "Settings"],
];
const section = (path) => (path.startsWith("group") ? "groups" : path.split("/")[0]);

function rail(path) {
  let m = me(),
    sec = section(path);
  return `<aside class="rail" aria-label="Main navigation">
    <a class="brand" href="#/home"><span class="logo-mark">${icon("receipt")}</span><b>SplitSmart</b></a>
    <button class="btn primary block rail-scan" data-act="quick-open">${icon("plus")} Add expense</button>
    <button class="btn outline block rail-scan2" data-go="scan">${icon("scan")} Scan a bill</button>
    <nav>${NAV.map(([to, ic, label]) => `<a class="rail-link ${sec === to ? "on" : ""}" href="#/${to}" ${sec === to ? 'aria-current="page"' : ""}>${icon(ic)}<span>${label}</span></a>`).join("")}</nav>
    <a class="rail-me" href="#/settings">${av(m, 40)}<span class="grow"><b>${esc(m?.name)}</b><small>${icon("lock")} Data stays on device</small></span></a>
  </aside>`;
}
function tabbar(path) {
  let sec = section(path);
  return `<nav class="tabbar" aria-label="Main">
    <a class="tab ${sec === "home" ? "on" : ""}" href="#/home" aria-label="Home" ${sec === "home" ? 'aria-current="page"' : ""}>${icon("home")}</a>
    <button class="tab add" data-act="quick-open" aria-label="Add an expense">${icon("plus")}</button>
    <a class="tab ${sec === "history" ? "on" : ""}" href="#/history" aria-label="History" ${sec === "history" ? 'aria-current="page"' : ""}>${icon("history")}</a>
  </nav>`;
}
function defaultAside() {
  let s = S(),
    m = me(),
    { owe, owed } = myPosition(),
    mine = ledgers().flatMap((l) => l.tx.map((t) => ({ ...t, group: l.name }))).filter((t) => t.from === s.meId || t.to === s.meId).slice(0, 5),
    name = (id) => (id === s.meId ? "You" : esc(s.people.find((p) => p.id === id)?.name || "Someone"));
  return `<section class="card side-card me-card">${av(m, 56)}<b>${esc(m?.name)}</b><div class="me-stats"><div><small>You owe</small><b class="${owe ? "neg" : ""}">${fmt(owe)}</b></div><div><small>You're owed</small><b class="${owed ? "pos" : ""}">${fmt(owed)}</b></div></div></section>
  <section class="card side-card"><div class="card-title"><h3>Your payments</h3><a class="see-all" href="#/settle">All</a></div>${mine.length ? mine.map((t) => `<div class="side-person">${av(t.from === s.meId ? t.to : t.from, 36)}<span class="grow"><b>${t.from === s.meId ? `You pay ${name(t.to)}` : `${name(t.from)} pays you`}</b><small>${esc(t.group)}</small></span><b class="${t.from === s.meId ? "neg" : "pos"}">${fmt(t.amount)}</b></div>`).join("") : `<p class="muted small">${icon("check")} You're all square.</p>`}</section>
  <section class="card side-card tip"><b>${icon("hand")} Tip</b><p class="muted small">Not sure who ate what? Open a bill and tap <b>Pass the phone</b>. Everyone picks their own items.</p></section>`;
}

function render() {
  let { view, params, path } = current;
  if (!view) return;
  // Remember focus, caret and scroll so re-rendering feels seamless.
  let a = document.activeElement,
    fkey = a?.dataset?.f,
    sel = null,
    scrolls = {},
    sheetTop = document.querySelector(".sheet")?.scrollTop || 0,
    y = window.scrollY;
  try {
    sel = a && "selectionStart" in a ? [a.selectionStart, a.selectionEnd] : null;
  } catch {}
  document.querySelectorAll("[data-scroll]").forEach((el) => (scrolls[el.dataset.scroll] = [el.scrollLeft, el.scrollTop]));

  let html = view.render(params, path),
    app = document.getElementById("app");
  if (view === Onboarding) app.innerHTML = `<main class="solo">${html}</main>`;
  else {
    let showRail = S().prefs.onboarded,
      aside = view.aside?.(params) ?? (view.full ? "" : defaultAside());
    app.innerHTML = `<div class="shell ${view.full ? "full" : ""} ${view.dark ? "dark" : ""} ${showRail ? "" : "no-rail"}">
      ${showRail ? rail(path) : ""}
      <main class="main" id="main"><div class="screen ${view.tabs ? "has-tabs" : ""}">${html}</div>${view.tabs && showRail ? tabbar(path) : ""}</main>
      ${aside && showRail ? `<aside class="side" aria-label="Summary">${aside}</aside>` : ""}
    </div>`;
  }
  fixButtons(app);
  drawSheets(false);
  countUp(document);

  document.querySelectorAll("[data-scroll]").forEach((el) => {
    let v = scrolls[el.dataset.scroll];
    if (v) [el.scrollLeft, el.scrollTop] = v;
  });
  let sh = document.querySelector(".sheet");
  if (sh) sh.scrollTop = sheetTop;
  if (window.scrollY !== y) window.scrollTo(0, y);
  if (fkey) {
    let el = document.querySelector(`[data-f="${CSS.escape(fkey)}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      try {
        if (sel && sel[0] != null) el.setSelectionRange(sel[0], sel[1]);
      } catch {}
    }
  }
  if (document.querySelector("#upi-qr .spinner")) import("./views/groups.js").then((m) => m.redrawQr?.());
  view.after?.(params);
}

/* ---------- Events ---------- */

function run(name, el, e) {
  let fn = actions[name];
  if (!fn) return console.warn("No action", name);
  try {
    let r = fn(el, e);
    if (r?.catch) r.catch(fail);
  } catch (err) {
    fail(err);
  }
}
function fail(err) {
  console.error(err);
  toast("Something went wrong. Your data is safe. Please try again.", { tone: "warn" });
}

document.addEventListener("click", (e) => {
  let actEl = e.target.closest("[data-act]");
  if (actEl && !actEl.disabled) {
    if (actEl.dataset.act === "sheet-backdrop") {
      if (e.target === actEl) closeSheet();
    } else {
      if (actEl.tagName === "BUTTON" && actEl.type === "submit" && actEl.form) return;
      run(actEl.dataset.act, actEl, e);
    }
  }
  let goEl = e.target.closest("[data-go]");
  if (goEl && !goEl.disabled && !e.defaultPrevented) {
    e.preventDefault();
    if (sheetOpen()) closeSheet(true);
    return go(goEl.dataset.go);
  }
  let link = e.target.closest('a[href^="#/"]');
  if (link && !e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    if (sheetOpen()) closeSheet(true);
    go(link.getAttribute("href").slice(2));
  }
});
document.addEventListener("input", (e) => {
  let el = e.target.closest("[data-in]");
  if (el) run(el.dataset.in, el, e);
});
document.addEventListener("change", (e) => {
  let el = e.target.closest("[data-ch]");
  if (el) run(el.dataset.ch, el, e);
});
document.addEventListener("submit", (e) => {
  let form = e.target.closest("form[data-submit]");
  if (!form) return;
  e.preventDefault();
  run(form.dataset.submit, form, e);
});
document.addEventListener("keydown", (e) => {
  trapFocus(e);
  if (e.key === "Escape" && sheetOpen()) {
    e.preventDefault();
    return closeSheet();
  }
  let typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (!typing && !e.metaKey && !e.ctrlKey && quickKey(e)) return e.preventDefault();
  if (typing || sheetOpen() || e.metaKey || e.ctrlKey || e.altKey || !S().prefs.onboarded) return;
  if (e.key === "n" || e.key === "N") {
    e.preventDefault();
    openQuick();
  } else if (e.key === "s" || e.key === "S") {
    e.preventDefault();
    go("scan");
  }
});
window.addEventListener("popstate", route);
window.addEventListener("hashchange", route);
window.addEventListener("routechange", route);

/* ---------- Boot ---------- */

setRenderer(render);
let { notice } = initStore();
onPersistError(() => toast("Storage is full, so the last change couldn't be saved. Back up and delete old bills to free space.", { tone: "warn" }));
if (!location.hash) history.replaceState({ depth: 0 }, "", S().prefs.onboarded ? "#/home" : "#/welcome");
else if (!history.state) history.replaceState({ depth: 0 }, "", location.hash);
route();

if (notice?.type === "corrupt") {
  openSheet(
    () => `${sheetHead("We couldn't read your saved data")}<p class="sheet-copy">Something damaged the app's storage, so we started fresh instead of crashing. A copy of the damaged data was kept. Download it and send it to whoever helps you, or restore a backup from Settings.</p><div class="sheet-actions"><button class="btn outline" data-act="sheet-close">Not now</button><button class="btn primary" data-act="download-corrupt">Download copy</button></div>`,
    { label: "Data problem" },
  );
  actions["download-corrupt"] = () => download("splitsmart-damaged-data.txt", localStorage.getItem(notice.key) || "", "text/plain");
}

if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
