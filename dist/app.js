import {
  money,
  fmt,
  allocate,
  splitExpense,
  balances,
  settle,
  parseReceipt,
} from "./core.js";
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  uid = () => crypto.randomUUID(),
  today = () => new Date().toISOString().slice(0, 10),
  cats = ["Food", "Groceries", "Travel", "Utilities", "Entertainment", "Other"];
let state;
try {
  state = JSON.parse(localStorage.getItem("splitsmart-v1")) || {
    groups: [],
    active: null,
  };
} catch {
  state = { groups: [], active: null };
}
let page = "overview",
  draft = null,
  editingId = null,
  photo = null,
  rotation = 0,
  scanQueue = [],
  worker = null,
  classifier = null;
const save = () => localStorage.setItem("splitsmart-v1", JSON.stringify(state));
const group = () => state.groups.find((g) => g.id === state.active);
const name = (id) =>
  group()?.members.find((m) => m.id === id)?.name || "Unknown";
const initial = (n) => esc(n.trim().slice(0, 2).toUpperCase());
const toast = (t) => {
  let x = $("#toast");
  x.textContent = t;
  x.style.display = "block";
  setTimeout(() => (x.style.display = "none"), 3500);
};
const download = (filename, data, type) => {
  let a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
function recurrence() {
  let changed = false;
  for (const g of state.groups) {
    for (const r of g.recurring || []) {
      while (r.next <= today()) {
        g.expenses.push({
          ...structuredClone(r.expense),
          id: uid(),
          date: r.next,
          description: r.expense.description + " (recurring)",
        });
        let d = new Date(r.next + "T12:00:00");
        d.setMonth(d.getMonth() + 1);
        r.next = d.toISOString().slice(0, 10);
        changed = true;
      }
    }
  }
  if (changed) save();
}
function render() {
  recurrence();
  let g = group(),
    b = g ? balances(g) : {},
    spent = g ? g.expenses.reduce((a, e) => a + money(e.total), 0) : 0;
  let nav = [
    ["overview", "◫", "Overview"],
    ["expenses", "▤", "Expenses"],
    ["balances", "⇄", "Settle up"],
    ["analytics", "◷", "Insights"],
    ["settings", "⚙", "Group settings"],
  ];
  let menu = nav
    .map(
      ([id, icon, label]) =>
        `<button class="${page === id ? "active" : ""}" data-page="${id}"><span>${icon}</span>${label}</button>`,
    )
    .join("");
  $("#app").innerHTML =
    `<div class="shell"><aside class="sidebar"><div class="logo"><span class="mark">≋</span> SplitSmart<span style="color:#bdf264">.</span></div><div><p class="side-label">Workspace</p><nav class="nav">${menu}</nav></div><div class="side-bottom"><b>✳ &nbsp; Good times, fairly split.</b>Your receipts and data stay on this device.</div></aside><main class="main"><header class="topbar"><div class="crumb">Your workspace &nbsp; / &nbsp; <strong>${g ? esc(g.name) : "Overview"}</strong></div><div class="top-actions"><span class="privacy">◉ &nbsp; Private by design</span><button class="button small" data-action="switch">${g ? esc(g.name) : "Choose a group"} &nbsp;⌄</button><span class="avatar">${g ? initial(g.name) : "S"}</span></div></header><nav class="mobile-nav">${menu}</nav><div class="content">${!g ? welcome() : page === "overview" ? overview(g, b, spent) : page === "expenses" ? expenses(g) : page === "balances" ? balancePage(g, b) : page === "analytics" ? analytics(g) : settings(g)}<p class="footer-note">Made for shared moments, not awkward math. ✳</p></div></main></div>`;
}
function heading(eyebrow, title, subtitle, action = "") {
  return `<div class="heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}
const addButton = `<button class="button dark" data-action="add-expense">＋ &nbsp; Add expense</button>`;
function receiptArt() {
  return `<div class="receipt-art" aria-hidden="true"><div class="receipt-stamp">100%<br><small>ON DEVICE</small></div><div class="paper"><div class="paper-logo">SPLIT / SMART</div><div class="paper-caption">GOOD TIMES. ACCOUNTED FOR.</div><div class="paper-rule"></div><div class="paper-line"><span>Late-night pizza</span><b>480.00</b></div><div class="paper-line"><span>Two bowls of Maggi</span><b>220.00</b></div><div class="paper-line"><span>Cold coffee</span><b>100.00</b></div><div class="paper-line faint"><span>GST · 5%</span><b>40.00</b></div><div class="paper-rule"></div><div class="paper-total"><span>TOTAL</span><b>₹840<span>.00</span></b></div><div class="paper-barcode"></div><div class="paper-caption">FOUR FRIENDS. ZERO AWKWARD MATH.</div></div><div class="receipt-tag"><span>✓</span> Every paisa accounted for</div></div>`;
}
function welcome() {
  return `<section class="landing"><div class="landing-copy"><span class="edition">THE SHARED SPENDING CLUB &nbsp; / &nbsp; EST. 2026</span><h1>Split the bill.<br><em>Keep the vibe.</em></h1><p>From midnight Maggi to your next big trip. Scan a receipt, pick who shared what, and settle up without the awkward group chat.</p><div class="landing-actions"><button class="button dark" data-action="new-group">Start your group <span>↗</span></button><button class="button ghost" data-action="demo">Explore the demo →</button></div><div class="trust-line"><span>◉ No sign-up</span><span>◈ On-device scanning</span><span>✓ Exact to the paisa</span></div></div>${receiptArt()}</section><div class="feature-strip"><div><span>01 / GATHER</span><h2>Your people.<br>Your little universe.</h2><p>One space for the flat, the wing, or that trip you keep planning.</p></div><div><span>02 / DIVIDE</span><h2>Only pay for<br>your slice.</h2><p>Assign each item with a tap. Taxes and discounts follow fairly.</p></div><div><span>03 / DONE</span><h2>Less back-and-forth.<br>More all squared up.</h2><p>Find the fewest payments. Settle directly with UPI.</p></div></div><div class="restore-line"><span>Already part of the club?</span><button class="button small" data-action="import">Import your group backup ↗</button></div>`;
}
function overview(g, b, spent) {
  let recent = [...g.expenses].reverse().slice(0, 4);
  return `${heading("YOUR GROUP AT A GLANCE", esc(g.name), "Small moments. A clear picture.", addButton)}<div class="dashboard"><div><div class="hero dashboard-hero"><div><span class="edition">THE MATH IS ON US</span><h2>Good company.<br><em>Clear balances.</em></h2><p>Your next shared moment starts with a receipt.</p><div class="row"><button class="button primary" data-action="scan">▧ &nbsp; Scan a receipt</button><button class="button hero-secondary" data-action="sample-receipt">Try a sample →</button></div></div><div class="mini-receipt" aria-hidden="true"><span>SPLIT / SMART</span><div>One bill.<br>Everyone’s share.</div><b>₹840<span>.00</span></b><i>✓ SPLIT FAIRLY</i></div></div><div class="grid3"><div class="stat"><span class="label">Total group spending</span><strong>${fmt(spent)}</strong><small>Across all expenses</small></div><div class="stat"><span class="label">Expenses added</span><strong>${g.expenses.length.toString().padStart(2, "0")}</strong><small>Little moments, counted</small></div><div class="stat"><span class="label">Group members</span><strong>${g.members.length.toString().padStart(2, "0")}</strong><small>In this group</small></div></div><div class="card"><div class="card-head"><div><h2>Recent activity</h2><p>The latest from your group</p></div><button class="button small" data-page="expenses">View all ↗</button></div>${recent.length ? recent.map((e) => `<div class="activity"><div class="iconbox">${e.items?.length ? "▤" : "✳"}</div><div class="grow"><b>${esc(e.description)}</b><small>${esc(name(e.payer))} paid · ${esc(e.date)}</small></div><div class="amount">${fmt(money(e.total))}</div></div>`).join("") : '<div class="empty"><span class="emoji">✳</span>No expenses yet. Let’s add the first one.</div>'}</div></div><div class="right-col">${budgetCard(g, spent)}<div class="card"><div class="card-head"><div><h2>Your group</h2><p>Better together</p></div><button class="button small" data-page="settings">Manage</button></div><div class="group-name">${esc(g.name)}</div><div class="muted">${g.members.length} people sharing the good stuff</div><div class="members">${g.members
    .slice(0, 8)
    .map(
      (m) =>
        `<span class="avatar" title="${esc(m.name)}">${initial(m.name)}</span>`,
    )
    .join(
      "",
    )}</div><button class="button" data-page="settings">＋ &nbsp; Add a member</button></div><div class="card"><div class="card-head"><div><h2>Group balances</h2><p>Where everyone stands</p></div><span class="pill">LIVE</span></div>${g.members.map((m) => `<div class="member"><span class="avatar">${initial(m.name)}</span><span class="grow">${esc(m.name)}</span><span class="balance ${b[m.id] > 0 ? "positive" : b[m.id] < 0 ? "negative" : ""}">${b[m.id] > 0 ? "+" : b[m.id] < 0 ? "−" : ""}${fmt(Math.abs(b[m.id]))}</span></div>`).join("")}<hr class="divider"><button class="button" data-page="balances">See settlements &nbsp; →</button></div></div></div>`;
}
function budgetCard(g, spent) {
  let target = money(g.budget || 0),
    percent = target ? Math.round((spent / target) * 100) : 0;
  return `<div class="budget-card"><div class="budget-top"><span class="eyebrow">GROUP SPENDING TARGET</span><button class="budget-edit" data-action="budget">${target ? "Edit" : "Set target"} ↗</button></div>${target ? `<div class="budget-amount">${fmt(spent)} <small>/ ${fmt(target)}</small></div><div class="budget-track" role="progressbar" aria-label="Spending target used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, percent)}"><i style="width:${Math.min(100, percent)}%"></i></div><p>${spent > target ? `${fmt(spent - target)} over your target` : `${fmt(target - spent)} left to spend`} · ${percent}% used</p>` : `<div class="budget-amount">Plan the good stuff.</div><p>Set an optional target to keep group spending in sight.</p>`}</div>`;
}
function expenses(g) {
  return `${heading("THE SHARED STUFF", "Expenses", "Every shared expense, all in one place.", addButton)}<div class="card"><div class="expense-search"><input id="expense-search" type="search" aria-label="Search expenses" placeholder="Search by expense or payer…"><span>YOUR GROUP LEDGER</span></div><div class="card-head"><div><h2>All expenses</h2><p>${g.expenses.length} records in ${esc(g.name)}</p></div><button class="button small" data-action="scan">▧ &nbsp; Scan receipt</button></div>${
    g.expenses.length
      ? [...g.expenses]
          .reverse()
          .map(
            (e) =>
              `<div class="activity"><div class="iconbox">${e.items?.length ? "▤" : "✳"}</div><div class="grow"><b>${esc(e.description)}</b><small>${esc(name(e.payer))} paid · ${esc(e.date)} · ${esc(e.mode)}</small></div><div class="amount">${fmt(money(e.total))}</div><button class="button small" data-detail-expense="${e.id}">Details</button><button class="button small" data-edit-expense="${e.id}">Edit</button><button class="button small danger" data-delete-expense="${e.id}" aria-label="Delete expense">×</button></div>`,
          )
          .join("")
      : '<div class="empty"><span class="emoji">▤</span>No expenses yet. Add one to get started.</div>'
  }</div>`;
}
function balancePage(g, b) {
  let tx = settle(b);
  return `${heading("EVERYTHING ADDS UP", "Settle up", "A clear path to being all square.")}<div class="dashboard"><div class="card"><div class="card-head"><div><h2>Suggested payments</h2><p>Minimum number of payments across the group</p></div><div class="row"><button class="button small" data-action="copy-settlements">⧉ Copy summary</button><button class="button small" data-action="csv">↓ Export CSV</button></div></div>${tx.length ? tx.map((t, i) => `<div class="activity"><span class="avatar">${initial(name(t.from))}</span><div class="grow"><b>${esc(name(t.from))} <span class="muted">pays</span> ${esc(name(t.to))}</b><small>${fmt(t.amount)} · direct settlement</small></div><button class="button small" data-upi="${i}">UPI / QR</button><button class="button small primary" data-settle="${i}">Mark paid</button></div>`).join("") : '<div class="empty"><span class="emoji">✳</span>Everyone is all settled up. Nice!</div>'}<div class="notice">Settlements are recorded on this device. Mark a payment only after it has happened.</div></div><div class="card"><div class="card-head"><div><h2>Net balances</h2><p>After expenses and recorded payments</p></div></div>${g.members.map((m) => `<div class="member"><span class="avatar">${initial(m.name)}</span><span class="grow">${esc(m.name)}<small class="muted" style="display:block">${b[m.id] > 0 ? "is owed" : b[m.id] < 0 ? "owes" : "settled"}</small></span><span class="balance ${b[m.id] >= 0 ? "positive" : "negative"}">${fmt(Math.abs(b[m.id]))}</span></div>`).join("")}<hr class="divider"><h3>Payment history</h3>${
    g.settlements.length
      ? [...g.settlements]
          .reverse()
          .map(
            (s) =>
              `<div class="member"><span class="grow">${esc(name(s.from))} → ${esc(name(s.to))}<br><small class="muted">${esc(s.date)}</small></span>${fmt(s.amount)} <button class="button small" data-undo="${s.id}">Undo</button></div>`,
          )
          .join("")
      : '<p class="muted">No payments recorded yet.</p>'
  }</div></div>`;
}
function analytics(g) {
  let byCat = {},
    byMember = {},
    byDate = {};
  for (const e of g.expenses) {
    let total = money(e.total);
    byMember[name(e.payer)] = (byMember[name(e.payer)] || 0) + total;
    byDate[e.date] = (byDate[e.date] || 0) + total;
    if (e.items?.length) {
      let amounts = allocate(
        total,
        e.items.map((x) => money(x.qty * x.price)),
      );
      e.items.forEach(
        (x, i) => (byCat[x.category] = (byCat[x.category] || 0) + amounts[i]),
      );
    } else
      byCat[e.category || "Other"] =
        (byCat[e.category || "Other"] || 0) + total;
  }
  function chart(obj) {
    let arr = Object.entries(obj).sort((a, b) => b[1] - a[1]),
      max = Math.max(1, ...arr.map((x) => x[1]));
    return arr.length
      ? arr
          .map(
            ([n, v]) =>
              `<div class="chart-row"><span>${esc(n)}</span><div class="bar"><i style="width:${(v / max) * 100}%"></i></div><b>${fmt(v)}</b></div>`,
          )
          .join("")
      : '<div class="empty">Add an expense to see insights.</div>';
  }
  return `${heading("THE BIG PICTURE", "Spending insights", "A little perspective on where it all goes.")}<div class="dashboard"><div class="list"><div class="card"><div class="card-head"><div><h2>Spending by category</h2><p>Where the money went</p></div><span class="pill">BREAKDOWN</span></div>${chart(byCat)}</div><div class="card"><div class="card-head"><div><h2>Spending over time</h2><p>Expenses by date</p></div></div>${chart(byDate)}</div></div><div class="card"><div class="card-head"><div><h2>Paid by member</h2><p>Who covered the bills</p></div></div>${chart(byMember)}</div></div>`;
}
function settings(g) {
  return `${heading("MAKE IT YOURS", "Group settings", "Manage your people and your data.")}<div class="dashboard"><div class="list"><div class="card"><div class="card-head"><div><h2>Group details</h2><p>Give this group a name that feels like yours.</p></div><button class="button small" data-action="rename">Rename</button></div><div class="group-name">${esc(g.name)}</div></div><div class="card"><div class="card-head"><div><h2>Members</h2><p>Add people and their optional UPI IDs.</p></div><button class="button small primary" data-action="add-member">＋ Add member</button></div>${g.members.map((m) => `<div class="member"><span class="avatar">${initial(m.name)}</span><span class="grow"><b>${esc(m.name)}</b><small class="muted" style="display:block">${esc(m.upi || "No UPI ID added")}</small></span><button class="button small" data-edit-member="${m.id}">Edit</button><button class="button small danger" data-remove-member="${m.id}">Remove</button></div>`).join("")}</div></div><div class="right-col"><div class="card"><div class="card-head"><div><h2>Your data</h2><p>Portable, private, and yours.</p></div></div><div class="list"><button class="button" data-action="export">↓ Export group JSON</button><button class="button" data-action="import">↑ Import group JSON</button><button class="button danger" data-action="delete-group">Delete this group</button></div></div><div class="card"><h3>How rounding works</h3><p class="muted">Amounts are stored in paise. Leftover paise go to the largest fractional shares; ties follow member order. Tax and discounts follow each person’s item subtotal.</p></div></div></div>`;
}
function modal(title, body, wide = false) {
  $("#modal").innerHTML =
    `<div class="modal-wrap"><section class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h2>${title}</h2><button class="close" data-action="close" aria-label="Close">×</button></div>${body}</section></div>`;
  document.querySelectorAll("#modal .field").forEach((field, i) => {
    let label = field.querySelector("label"),
      control = field.querySelector("input,select,textarea");
    if (label && control) {
      control.id = control.id || "modal-field-" + i;
      label.htmlFor = control.id;
    }
  });
  $("#modal input, #modal select, #modal button:not(.close)")?.focus();
}
function close() {
  scanQueue = [];
  if (photo) {
    URL.revokeObjectURL(photo);
    photo = null;
  }
  $("#modal").innerHTML = "";
}
function groupForm() {
  modal(
    "Create a group",
    `<form id="group-form"><div class="field"><label for="group-name">Group name</label><input id="group-name" required maxlength="60" placeholder="e.g. Night Canteen Gang"></div><div class="field"><label for="members">Members, separated by commas</label><input id="members" required placeholder="e.g. Riya, Arjun, Meera, Kabir"></div><button class="button dark" type="submit">Create group →</button></form>`,
  );
}
function switcher() {
  modal(
    "Your groups",
    `<div class="list">${state.groups.map((g) => `<button class="button" data-switch="${g.id}">${esc(g.name)} &nbsp; · &nbsp; ${g.members.length} members ${g.id === state.active ? " ✓" : ""}</button>`).join("")}<button class="button primary" data-action="new-group">＋ Create a group</button><button class="button" data-action="import">Import a group</button></div>`,
  );
}
function newDraft(scan = false) {
  editingId = null;
  scanQueue = [];
  let g = group();
  draft = {
    description: "",
    date: today(),
    payer: g.members[0]?.id || "",
    total: "",
    mode: scan ? "itemized" : "equal",
    participants: g.members.map((m) => m.id),
    values: {},
    items: [],
    charges: [],
    category: "Other",
    recurring: false,
  };
  photo = null;
  rotation = 0;
  scan ? scanModal() : expenseModal();
}
function scanModal() {
  modal(
    "Scan a receipt",
    `<div class="notice">Your receipt stays on your device. The OCR model downloads on first use.</div><div class="upload"><div style="font-size:32px">▧</div><b>Choose a receipt to scan</b><p class="muted">JPG or PNG · You can select multiple receipts</p><input id="receipt-file" type="file" accept="image/jpeg,image/png" multiple aria-label="Choose receipt images"><p class="muted">On a phone, choose your camera or photo library. If camera permission is denied, select a saved image instead.</p></div><div id="scan-preview"></div><div id="scan-status" aria-live="polite"></div><div class="row" style="margin-top:18px"><button class="button dark" data-action="run-scan" disabled>Scan receipt →</button><button class="button" data-action="paste-receipt">Paste receipt text</button><button class="button" data-action="manual">Enter manually instead</button></div>`,
    true,
  );
}
function expenseModal() {
  let g = group();
  if (!g) return;
  let itemsTotal = draft.items.reduce((a, x) => a + money(x.qty * x.price), 0),
    chargeTotal = draft.charges.reduce((a, x) => a + money(x.amount), 0),
    computed = itemsTotal + chargeTotal,
    diff = money(draft.total) - computed;
  let isItems = draft.mode === "itemized";
  let participants = g.members
    .map(
      (m) =>
        `<button type="button" class="choice ${draft.participants.includes(m.id) ? "selected" : ""}" data-participant="${m.id}">${initial(m.name)} &nbsp; ${esc(m.name)}</button>`,
    )
    .join("");
  let fields = `<div class="form-grid"><div class="field"><label>Description</label><input data-draft="description" value="${esc(draft.description)}" placeholder="e.g. Late night canteen"></div><div class="field"><label>Date</label><input type="date" data-draft="date" value="${esc(draft.date)}"></div><div class="field"><label>Paid by</label><select data-draft="payer">${g.members.map((m) => `<option value="${m.id}" ${m.id === draft.payer ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></div><div class="field"><label>Total amount (₹)</label><input type="number" min="0" step="0.01" data-draft="total" value="${esc(draft.total)}" placeholder="0.00"></div></div><div class="field"><span class="field-label">Split method</span><div class="choices">${[
    ["itemized", "By item"],
    ["equal", "Equal"],
    ["exact", "Exact amounts"],
    ["percent", "Percentages"],
    ["shares", "Shares"],
  ]
    .map(
      ([id, t]) =>
        `<button type="button" class="choice ${draft.mode === id ? "selected" : ""}" data-mode="${id}">${t}</button>`,
    )
    .join("")}</div></div>`;
  let itemEditor = `<div class="card-head" style="margin-top:20px"><div><h3>Items & assignments</h3><p>Tap everyone who shared each item.</p></div><button class="button small" data-action="add-item">＋ Add item</button></div>${draft.items.map((it, i) => `<div class="item"><div class="item-grid"><input class="${it.low ? "low" : ""}" aria-label="Item name" data-item="${i}" data-key="name" value="${esc(it.name)}" placeholder="Item name"><input aria-label="Quantity" type="number" min="0" step="1" data-item="${i}" data-key="qty" value="${esc(it.qty)}"><input aria-label="Unit price" type="number" min="0" step="0.01" data-item="${i}" data-key="price" value="${esc(it.price)}"><select aria-label="Category" data-item="${i}" data-key="category">${cats.map((c) => `<option ${c === it.category ? "selected" : ""}>${c}</option>`).join("")}</select><button class="button small danger" data-remove-item="${i}" aria-label="Remove item">×</button></div><div class="row" style="margin-top:10px"><span class="field-label">Shared by</span>${g.members.map((m) => `<button class="choice ${it.assigned.includes(m.id) ? "selected" : ""}" data-assign="${i}" data-id="${m.id}">${initial(m.name)}</button>`).join("")}<span class="muted">${fmt(money(it.qty * it.price))}</span>${!it.assigned.length ? '<span class="negative" style="font-size:11px">Assign at least one</span>' : ""}</div></div>`).join("")}<button class="button small" data-action="categorize">✳ Auto-categorize items</button><div id="category-status" class="muted"></div><hr class="divider"><div class="card-head"><div><h3>Taxes, charges & discounts</h3><p>Use a negative amount for discounts.</p></div><button class="button small" data-action="add-charge">＋ Add line</button></div>${draft.charges.map((c, i) => `<div class="row" style="margin-bottom:8px"><input class="grow" aria-label="Charge name" data-charge="${i}" data-key="name" value="${esc(c.name)}"><input style="width:130px" aria-label="Charge amount" type="number" step="0.01" data-charge="${i}" data-key="amount" value="${esc(c.amount)}"><button class="button small danger" data-remove-charge="${i}">×</button></div>`).join("")}<div id="receipt-check" class="notice ${diff ? "warn" : ""}">Items ${fmt(itemsTotal)} + adjustments ${fmt(chargeTotal)} = ${fmt(computed)} ${draft.total !== "" ? (diff ? `· Difference from total: ${fmt(Math.abs(diff))}` : "· Matches total ✓") : "· No total detected; confirm the calculated amount."}</div><button class="button small" data-action="use-computed">Use calculated total</button>`;
  let splitEditor = `<div class="field"><span class="field-label">Participants</span><div class="choices">${participants}</div></div>${
    ["exact", "percent", "shares"].includes(draft.mode)
      ? g.members
          .filter((m) => draft.participants.includes(m.id))
          .map(
            (m) =>
              `<div class="row" style="margin:8px 0"><span class="grow">${esc(m.name)}</span><input style="width:140px" type="number" min="0" step="0.01" aria-label="${esc(m.name)} ${draft.mode}" data-value="${m.id}" value="${esc(draft.values[m.id] ?? "")}" placeholder="${draft.mode === "percent" ? "%" : draft.mode === "shares" ? "Shares" : "₹"}"></div>`,
          )
          .join("")
      : ""
  }<div class="field"><label>Category</label><select data-draft="category">${cats.map((c) => `<option ${c === draft.category ? "selected" : ""}>${c}</option>`).join("")}</select></div>`;
  let preview = photo
    ? `<div><img class="receipt-preview" src="${photo}" alt="Original receipt" style="transform:rotate(${rotation}deg)"><p class="muted">Original receipt for comparison</p><button class="button small" data-action="rotate">↻ Rotate preview</button></div>`
    : "";
  modal(
    "Review & split expense",
    `<div class="${photo ? "review-grid" : ""}">${preview}<div>${fields}${isItems ? itemEditor : splitEditor}<hr class="divider">${editingId ? '<p class="muted">Editing this occurrence does not change its recurring schedule.</p>' : `<label class="row muted"><input type="checkbox" data-draft="recurring" ${draft.recurring ? "checked" : ""}> Repeat monthly starting next month</label>`}<div class="row" style="margin-top:18px"><button class="button dark" data-action="save-expense">Save expense →</button><button class="button" data-action="close">Cancel</button></div><div id="live-split"></div><div id="form-error" class="negative" role="alert" style="margin-top:10px;font-size:13px"></div></div></div>`,
    true,
  );
  updateLiveSplit();
}
async function runScan() {
  let status = $("#scan-status");
  if (!scanQueue.length) return;
  try {
    status.innerHTML =
      '<p class="muted">Loading OCR engine…</p><div class="progress"><div style="width:4%"></div></div>';
    if (!window.Tesseract) {
      await new Promise((resolve, reject) => {
        let s = document.createElement("script");
        s.src =
          "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.append(s);
      });
    }
    if (!worker)
      worker = await Tesseract.createWorker("eng", 1, {
        logger: (m) => {
          let bar = $("#scan-status");
          if (bar)
            bar.innerHTML = `<p class="muted">${esc(m.status)} · ${Math.round((m.progress || 0) * 100)}%</p><div class="progress"><div style="width:${Math.round((m.progress || 0) * 100)}%"></div></div>`;
        },
      });
    let file = scanQueue.shift();
    if (photo) URL.revokeObjectURL(photo);
    photo = URL.createObjectURL(file);
    let result = await worker.recognize(file, {}, { text: true, blocks: true });
    let words = [];
    function collect(node) {
      if (!node || typeof node !== "object") return;
      if (
        typeof node.confidence === "number" &&
        typeof node.text === "string" &&
        node.text.trim() &&
        !node.words &&
        node.confidence < 65
      )
        words.push(...node.text.trim().split(/\s+/));
      for (let k of ["blocks", "paragraphs", "lines", "words"])
        if (Array.isArray(node[k])) node[k].forEach(collect);
    }
    collect(result.data);
    let parsed = parseReceipt(result.data.text, words);
    draft.items = parsed.items;
    draft.charges = parsed.charges;
    draft.total = parsed.total;
    draft.description = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
    if (!parsed.items.length) {
      status.innerHTML =
        '<div class="notice warn">No line items found. Try a clearer or rotated photo, or enter the expense manually.</div>';
      scanQueue.unshift(file);
      return;
    }
    expenseModal();
    if (scanQueue.length)
      toast(
        `${scanQueue.length} more receipt(s) waiting. Save this expense to continue.`,
      );
  } catch (err) {
    console.error(err);
    if (status)
      status.innerHTML =
        '<div class="notice warn">Could not run OCR. Check your connection for the first model download, then try again or enter manually.</div>';
  }
}
async function categorize() {
  let el = $("#category-status");
  try {
    el.textContent =
      "Loading the classification model (first use can take a while)…";
    if (!classifier) {
      let { pipeline } =
        await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");
      classifier = await pipeline(
        "zero-shot-classification",
        "Xenova/mobilebert-uncased-mnli",
        {
          progress_callback: (p) => {
            let x = $("#category-status");
            if (x)
              x.textContent =
                p.status === "progress"
                  ? `Downloading model: ${Math.round(p.progress || 0)}%`
                  : "Loading classification model…";
          },
        },
      );
    }
    for (let i = 0; i < draft.items.length; i++) {
      if (el)
        el.textContent = `Categorizing ${i + 1} of ${draft.items.length}…`;
      let r = await classifier(draft.items[i].name, cats);
      draft.items[i].category = r.labels[0];
    }
    expenseModal();
    toast("Categories added. You can change any of them.");
  } catch (e) {
    console.error(e);
    if (el)
      el.textContent = "Model unavailable. You can choose categories manually.";
  }
}
function validateSave() {
  let g = group(),
    error = "";
  let total = money(draft.total);
  if (!draft.description.trim()) error = "Give this expense a description.";
  else if (!draft.date || !g.members.some((m) => m.id === draft.payer))
    error = "Choose a date and payer.";
  else if (!Number.isFinite(Number(draft.total)) || !(total > 0))
    error = "Enter a total greater than zero.";
  else if (
    draft.mode !== "itemized" &&
    draft.participants.some(
      (id) =>
        draft.mode !== "equal" &&
        (!Number.isFinite(Number(draft.values[id])) ||
          Number(draft.values[id]) < 0),
    )
  )
    error = "Split values must be finite, non-negative numbers.";
  else if (draft.mode === "itemized") {
    let calculated =
      draft.items.reduce((a, x) => a + money(x.qty * x.price), 0) +
      draft.charges.reduce((a, x) => a + money(x.amount), 0);
    if (
      !draft.items.length ||
      draft.items.some(
        (x) =>
          !x.name.trim() ||
          !Number.isFinite(Number(x.qty)) ||
          !Number.isFinite(Number(x.price)) ||
          Number(x.qty) <= 0 ||
          Number(x.price) < 0 ||
          !x.assigned.length,
      )
    )
      error = "Give each item a name, valid amount, and at least one person.";
    else if (calculated !== total)
      error =
        "The items and adjustments must match the total. Correct the values or use the calculated total.";
  } else if (!draft.participants.length)
    error = "Choose at least one participant.";
  else if (
    draft.mode === "exact" &&
    draft.participants.reduce((a, id) => a + money(draft.values[id]), 0) !==
      total
  )
    error = "Exact amounts must add up to the bill total.";
  else if (
    draft.mode === "percent" &&
    Math.abs(
      draft.participants.reduce(
        (a, id) => a + (Number(draft.values[id]) || 0),
        0,
      ) - 100,
    ) > 0.001
  )
    error = "Percentages must add up to 100%.";
  else if (
    ["shares", "percent"].includes(draft.mode) &&
    draft.participants.reduce(
      (a, id) => a + (Number(draft.values[id]) || 0),
      0,
    ) <= 0
  )
    error = "Enter a positive split.";
  if (error) {
    $("#form-error").textContent = error;
    return;
  }
  let e = { ...structuredClone(draft), id: editingId || uid() };
  if (editingId) {
    let index = g.expenses.findIndex((x) => x.id === editingId);
    if (index < 0) {
      $("#form-error").textContent = "This expense no longer exists.";
      return;
    }
    g.expenses[index] = e;
  } else g.expenses.push(e);
  if (draft.recurring && !editingId) {
    let d = new Date(draft.date + "T12:00:00");
    d.setMonth(d.getMonth() + 1);
    g.recurring.push({ next: d.toISOString().slice(0, 10), expense: e });
  }
  save();
  render();
  if (scanQueue.length) {
    draft = {
      description: "",
      date: today(),
      payer: g.members[0].id,
      total: "",
      mode: "itemized",
      participants: g.members.map((m) => m.id),
      values: {},
      items: [],
      charges: [],
      category: "Other",
    };
    scanModal();
    runScan();
  } else close();
  toast("Expense added successfully.");
}

function expenseDetail(e) {
  if (!e) return;
  let g = group(),
    parts = splitExpense(e, g.members);
  modal(
    "Expense breakdown",
    `<div class="detail-banner"><span class="eyebrow">${esc(e.date)} · ${esc(e.mode)}</span><h2>${esc(e.description)}</h2><strong>${fmt(money(e.total))}</strong><p>Paid by ${esc(name(e.payer))}</p></div><div class="card-head" style="margin-top:24px"><div><h3>Everyone’s share</h3><p>Includes their share of any adjustments</p></div></div>${g.members
      .filter((m) => parts[m.id])
      .map(
        (m) =>
          `<div class="member"><span class="avatar">${initial(m.name)}</span><span class="grow">${esc(m.name)}</span><b>${fmt(parts[m.id])}</b></div>`,
      )
      .join(
        "",
      )}${e.items?.length ? `<hr class="divider"><h3>What was shared</h3>${e.items.map((it) => `<div class="member"><span class="grow"><b>${esc(it.name)}</b><small class="muted" style="display:block">${it.assigned.map(name).map(esc).join(", ")}</small></span><b>${fmt(money(it.qty * it.price))}</b></div>`).join("")}` : ""}<div class="notice">Individual shares reconcile to the total in paise.</div>`,
  );
}
function memberForm(id) {
  let m = group().members.find((x) => x.id === id);
  modal(
    m ? "Edit member" : "Add member",
    `<form id="member-form" data-id="${id || ""}"><div class="field"><label>Name</label><input name="name" required maxlength="50" value="${esc(m?.name || "")}" placeholder="Member name"></div><div class="field"><label>UPI ID (optional)</label><input name="upi" value="${esc(m?.upi || "")}" placeholder="name@bank"></div><button class="button dark">Save member</button></form>`,
  );
}
function upiModal(t) {
  let m = group().members.find((x) => x.id === t.to);
  let link = `upi://pay?pa=${encodeURIComponent(m.upi || "")}&pn=${encodeURIComponent(m.name)}&am=${(t.amount / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent("SplitSmart settlement")}`;
  modal(
    "Pay " + esc(m.name),
    m.upi
      ? `<p class="muted">${esc(name(t.from))} pays ${esc(m.name)} ${fmt(t.amount)}</p><div class="upload" style="margin:20px 0"><div id="upi-qr" aria-label="UPI payment QR code" style="display:inline-block"></div><p class="muted">Scan using a UPI app</p></div><a class="button dark" href="${esc(link)}">Open UPI app ↗</a><p class="muted" style="margin-top:16px">The QR generator downloads on first use. The payment link opens your UPI app.</p>`
      : `<div class="notice warn">Add ${esc(m.name)}’s UPI ID in Group settings to create a payment link.</div><button class="button" data-action="close">Got it</button>`,
  );
  if (m.upi) {
    let script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js";
    script.onload = () => {
      if ($("#upi-qr"))
        new QRCode($("#upi-qr"), { text: link, width: 200, height: 200 });
    };
    script.onerror = () => {
      if ($("#upi-qr"))
        $("#upi-qr").textContent =
          "QR unavailable; use the payment link below.";
    };
    document.head.append(script);
  }
}
document.addEventListener("input", (e) => {
  let t = e.target;
  if (t.id === "expense-search") {
    document
      .querySelectorAll(".activity")
      .forEach(
        (row) =>
          (row.hidden = !row.textContent
            .toLowerCase()
            .includes(t.value.toLowerCase())),
      );
    return;
  }
  if (!draft) return;
  if (t.dataset.draft) {
    draft[t.dataset.draft] = t.type === "checkbox" ? t.checked : t.value;
  }
  if (t.dataset.item !== undefined)
    draft.items[+t.dataset.item][t.dataset.key] = t.value;
  if (t.dataset.charge !== undefined)
    draft.charges[+t.dataset.charge][t.dataset.key] = t.value;
  if (t.dataset.value) draft.values[t.dataset.value] = t.value;
  updateLiveSplit();
});
document.addEventListener("change", (e) => {
  let t = e.target;
  if (t.id === "receipt-file") {
    scanQueue = [...t.files].filter((f) => /^image\/(png|jpeg)$/.test(f.type));
    let preview = $("#scan-preview");
    if (scanQueue.length) {
      if (photo) URL.revokeObjectURL(photo);
      photo = URL.createObjectURL(scanQueue[0]);
      preview.innerHTML = `<div style="margin-top:14px"><img class="receipt-preview" src="${photo}" alt="Receipt preview"><p class="muted">${scanQueue.length} receipt(s) selected</p></div>`;
      $('[data-action="run-scan"]').disabled = false;
    } else {
      preview.innerHTML =
        '<div class="notice warn">Choose a JPG or PNG image.</div>';
    }
  }
  if (
    t.dataset.item !== undefined ||
    t.dataset.charge !== undefined ||
    t.dataset.draft === "total" ||
    t.dataset.value
  )
    updateLiveSplit();
});
document.addEventListener("submit", (e) => {
  e.preventDefault();
  let f = e.target;
  if (f.id === "group-form") {
    let ns = $("#members")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ns.length) return;
    let g = {
      id: uid(),
      name: $("#group-name").value.trim(),
      members: ns.map((n) => ({ id: uid(), name: n, upi: "" })),
      expenses: [],
      settlements: [],
      recurring: [],
    };
    state.groups.push(g);
    state.active = g.id;
    save();
    close();
    page = "overview";
    render();
    toast("Your group is ready!");
  }
  if (f.id === "member-form") {
    let data = new FormData(f),
      g = group(),
      m = g.members.find((x) => x.id === f.dataset.id);
    if (m) {
      m.name = data.get("name").trim();
      m.upi = data.get("upi").trim();
    } else
      g.members.push({
        id: uid(),
        name: data.get("name").trim(),
        upi: data.get("upi").trim(),
      });
    save();
    close();
    render();
  }
});
document.addEventListener("click", async (e) => {
  let t = e.target.closest("button");
  if (!t) return;
  let g = group(),
    a = t.dataset.action;
  if (t.dataset.page) {
    page = t.dataset.page;
    render();
    return;
  }
  if (t.dataset.switch) {
    state.active = t.dataset.switch;
    save();
    close();
    page = "overview";
    render();
    return;
  }
  if (t.dataset.mode) {
    draft.mode = t.dataset.mode;
    expenseModal();
    return;
  }
  if (t.dataset.participant) {
    let id = t.dataset.participant;
    draft.participants = draft.participants.includes(id)
      ? draft.participants.filter((x) => x !== id)
      : [...draft.participants, id];
    expenseModal();
    return;
  }
  if (t.dataset.assign !== undefined) {
    let it = draft.items[+t.dataset.assign],
      id = t.dataset.id;
    it.assigned = it.assigned.includes(id)
      ? it.assigned.filter((x) => x !== id)
      : [...it.assigned, id];
    expenseModal();
    return;
  }
  if (t.dataset.removeItem !== undefined) {
    draft.items.splice(+t.dataset.removeItem, 1);
    expenseModal();
    return;
  }
  if (t.dataset.removeCharge !== undefined) {
    draft.charges.splice(+t.dataset.removeCharge, 1);
    expenseModal();
    return;
  }
  if (t.dataset.detailExpense) {
    expenseDetail(g.expenses.find((x) => x.id === t.dataset.detailExpense));
    return;
  }
  if (t.dataset.editExpense) {
    let original = g.expenses.find((x) => x.id === t.dataset.editExpense);
    if (original) {
      editingId = original.id;
      draft = structuredClone(original);
      draft.participants = draft.participants || [];
      draft.values = draft.values || {};
      draft.items = draft.items || [];
      draft.charges = draft.charges || [];
      photo = null;
      expenseModal();
    }
    return;
  }
  if (t.dataset.editMember) {
    memberForm(t.dataset.editMember);
    return;
  }
  if (t.dataset.removeMember) {
    let id = t.dataset.removeMember;
    if (
      g.expenses.some(
        (x) =>
          x.payer === id ||
          x.participants?.includes(id) ||
          x.items?.some((it) => it.assigned.includes(id)),
      ) ||
      g.settlements.some((x) => x.from === id || x.to === id)
    ) {
      toast("This member has expense history and cannot be removed.");
      return;
    }
    if (g.members.length === 1) {
      toast("A group needs at least one member.");
      return;
    }
    if (confirm("Remove this member?")) {
      g.members = g.members.filter((m) => m.id !== id);
      save();
      render();
    }
    return;
  }
  if (t.dataset.deleteExpense) {
    if (confirm("Delete this expense?")) {
      g.expenses = g.expenses.filter((x) => x.id !== t.dataset.deleteExpense);
      save();
      render();
    }
    return;
  }
  if (t.dataset.settle !== undefined) {
    let tx = settle(balances(g))[+t.dataset.settle];
    if (
      tx &&
      confirm(
        `Record ${name(tx.from)} paying ${name(tx.to)} ${fmt(tx.amount)}?`,
      )
    ) {
      g.settlements.push({ ...tx, id: uid(), date: today() });
      save();
      render();
      toast("Payment recorded.");
    }
    return;
  }
  if (t.dataset.undo) {
    g.settlements = g.settlements.filter((x) => x.id !== t.dataset.undo);
    save();
    render();
    return;
  }
  if (t.dataset.upi !== undefined) {
    upiModal(settle(balances(g))[+t.dataset.upi]);
    return;
  }
  if (a === "sample-receipt") {
    newDraft(true);
    draft.description = "Late-night canteen";
    draft.total = 840;
    draft.items = [
      {
        name: "Large pizza",
        qty: 1,
        price: 480,
        category: "Food",
        assigned: g.members.map((m) => m.id),
      },
      {
        name: "Maggi",
        qty: 2,
        price: 110,
        category: "Food",
        assigned: [g.members[0].id],
      },
      {
        name: "Cold coffee",
        qty: 1,
        price: 100,
        category: "Food",
        assigned: [g.members[g.members.length - 1].id],
      },
    ];
    draft.charges = [{ name: "GST 5%", amount: 40 }];
    expenseModal();
    toast("Sample receipt ready. Change the assignments to see the split.");
    return;
  }
  if (a === "budget") {
    let value = prompt(
      "Group spending target in ₹ (enter 0 to remove)",
      g.budget || "",
    );
    if (value !== null) {
      let amount = Number(value);
      if (Number.isFinite(amount) && amount >= 0) {
        g.budget = amount;
        save();
        render();
        toast(amount ? "Spending target saved." : "Spending target removed.");
      } else toast("Enter a valid non-negative amount.");
    }
    return;
  }
  if (a === "copy-settlements") {
    let tx = settle(balances(g));
    let summary =
      `SplitSmart · ${g.name}\n` +
      (tx.length
        ? tx
            .map((x) => `${name(x.from)} pays ${name(x.to)} ${fmt(x.amount)}`)
            .join("\n")
        : "Everyone is settled up.");
    try {
      await navigator.clipboard.writeText(summary);
      toast("Settlement summary copied.");
    } catch {
      modal(
        "Settlement summary",
        `<p class="muted">Select and copy this summary:</p><textarea readonly class="copy-area">${esc(summary)}</textarea>`,
      );
    }
  }
  if (a === "paste-receipt") {
    modal(
      "Paste receipt text",
      `<p class="muted">Paste text from a receipt or another OCR app. You can review every line next.</p><textarea id="receipt-text" class="copy-area" placeholder="Pizza 480.00&#10;GST 24.00&#10;TOTAL 504.00"></textarea><div class="row"><button class="button dark" data-action="parse-pasted">Review items →</button><button class="button" data-action="manual">Enter manually</button></div>`,
    );
  }
  if (a === "parse-pasted") {
    let parsed = parseReceipt($("#receipt-text").value);
    if (!parsed.items.length) {
      toast("No items found. Try one item and amount per line.");
      return;
    }
    draft.items = parsed.items;
    draft.charges = parsed.charges;
    draft.total = parsed.total;
    draft.description = "Receipt";
    expenseModal();
  }
  if (a === "close") close();
  if (a === "new-group") groupForm();
  if (a === "switch") switcher();
  if (a === "add-member") memberForm();
  if (a === "add-expense") newDraft();
  if (a === "scan") newDraft(true);
  if (a === "manual") {
    draft.mode = "equal";
    expenseModal();
  }
  if (a === "run-scan") runScan();
  if (a === "save-expense") validateSave();
  if (a === "categorize") categorize();
  if (a === "add-item") {
    draft.items.push({
      name: "",
      qty: 1,
      price: 0,
      category: "Other",
      assigned: [],
    });
    expenseModal();
  }
  if (a === "add-charge") {
    draft.charges.push({ name: "Tax", amount: 0 });
    expenseModal();
  }
  if (a === "use-computed") {
    draft.total = (
      (draft.items.reduce((s, x) => s + money(x.qty * x.price), 0) +
        draft.charges.reduce((s, x) => s + money(x.amount), 0)) /
      100
    ).toFixed(2);
    expenseModal();
  }
  if (a === "rotate") {
    rotation = (rotation + 90) % 360;
    expenseModal();
  }
  if (a === "rename") {
    let v = prompt("Group name", g.name);
    if (v?.trim()) {
      g.name = v.trim();
      save();
      render();
    }
  }
  if (
    a === "delete-group" &&
    confirm("Delete this group and all its expenses? This cannot be undone.")
  ) {
    state.groups = state.groups.filter((x) => x.id !== g.id);
    state.active = state.groups[0]?.id || null;
    save();
    page = "overview";
    render();
  }
  if (a === "export")
    download(
      "splitsmart-group.json",
      JSON.stringify({ version: 1, group: g }, null, 2),
      "application/json",
    );
  if (a === "import") {
    let input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      try {
        let data = JSON.parse(await input.files[0].text()),
          x = data.group;
        if (
          !x ||
          !Array.isArray(x.members) ||
          !Array.isArray(x.expenses) ||
          !Array.isArray(x.settlements) ||
          !x.name
        )
          throw Error();
        x.id = uid();
        x.recurring = x.recurring || [];
        state.groups.push(x);
        state.active = x.id;
        save();
        page = "overview";
        close();
        render();
        toast("Group imported.");
      } catch {
        toast("That file is not a valid SplitSmart group.");
      }
    };
    input.click();
  }
  if (a === "csv") {
    let tx = settle(balances(g)),
      csv = [
        "From,To,Amount (INR)",
        ...tx.map((x) =>
          [name(x.from), name(x.to), (x.amount / 100).toFixed(2)]
            .map((s) => '"' + String(s).replace(/"/g, '""') + '"')
            .join(","),
        ),
      ].join("\n");
    download("splitsmart-settlements.csv", csv, "text/csv");
  }
  if (a === "demo") {
    let members = ["Riya", "Arjun", "Meera", "Kabir"].map((name) => ({
      id: uid(),
      name,
      upi: "",
    }));
    let id = uid(),
      [r, a, m, k] = members.map((x) => x.id);
    let demo = {
      id,
      name: "Night Canteen Gang",
      members,
      settlements: [],
      recurring: [],
      expenses: [
        {
          id: uid(),
          description: "Late night canteen",
          date: today(),
          payer: r,
          total: 840,
          mode: "itemized",
          participants: [r, a, m, k],
          values: {},
          items: [
            {
              name: "Large pizza",
              qty: 1,
              price: 480,
              category: "Food",
              assigned: [r, a, m, k],
            },
            {
              name: "Maggi",
              qty: 2,
              price: 110,
              category: "Food",
              assigned: [a, k],
            },
            {
              name: "Cold coffee",
              qty: 1,
              price: 100,
              category: "Food",
              assigned: [m],
            },
          ],
          charges: [{ name: "GST", amount: 40 }],
        },
      ],
    };
    state.groups.push(demo);
    state.active = id;
    save();
    render();
    toast("Sample group added. Explore away!");
  }
});
if ("serviceWorker" in navigator && location.protocol !== "file:")
  navigator.serviceWorker.register("./sw.js").catch(() => {});
render();

// Keep the editor stable while providing an immediately inspectable split.
function updateLiveSplit() {
  const target = $("#live-split");
  if (!target || !draft) return;
  const g = group();
  let total = money(draft.total),
    computed =
      draft.items.reduce((v, it) => v + money(it.qty * it.price), 0) +
      draft.charges.reduce((v, c) => v + money(c.amount), 0);
  let check = $("#receipt-check");
  if (check) {
    check.className = "notice " + (computed !== total ? "warn" : "");
    check.textContent = `Items + adjustments = ${fmt(computed)} · ${computed === total ? "Matches total ✓" : "Difference: " + fmt(Math.abs(computed - total))}`;
  }
  let missing =
    draft.mode === "itemized" && draft.items.some((it) => !it.assigned.length);
  if (missing) {
    target.innerHTML =
      '<div class="notice warn">Assign every item to see everyone’s share.</div>';
    return;
  }
  let parts = splitExpense(draft, g.members);
  target.innerHTML = `<div class="split-preview"><div class="split-preview-head"><b>THE SPLIT, LIVE</b><span>${fmt(total)}</span></div>${g.members.map((m) => `<div class="split-person"><span>${esc(m.name)}</span><div><i style="width:${total > 0 ? Math.max(0, Math.min(100, (parts[m.id] / total) * 100)) : 0}%"></i></div><b>${fmt(parts[m.id])}</b></div>`).join("")}${draft.mode === "itemized" && computed !== total ? `<p class="negative">Items + adjustments = ${fmt(computed)}. Difference: ${fmt(Math.abs(computed - total))}.</p>` : ""}</div>`;
}
document.addEventListener("keydown", (e) => {
  const dialog = $("#modal .modal");
  if (dialog) {
    if (e.key === "Escape") {
      close();
      return;
    }
    if (e.key === "Tab") {
      let nodes = [
        ...dialog.querySelectorAll("button,input,select,textarea,a[href]"),
      ].filter((n) => !n.disabled && n.offsetParent !== null);
      if (e.shiftKey && document.activeElement === nodes[0]) {
        e.preventDefault();
        nodes.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
        e.preventDefault();
        nodes[0]?.focus();
      }
    }
    return;
  }
  if (
    e.target.matches("input,textarea,select") ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    !group()
  )
    return;
  if (e.key === "n") newDraft();
  if (e.key === "s") newDraft(true);
});
