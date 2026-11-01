import { S, store, persist } from "../store.js";
import { decode, unpackBill } from "../share.js";
import { splitBill } from "../fair.js";
import { makePerson, makeBill } from "../model.js";
import { av, esc, icon, fmt, topbar, refresh, commit, toast, go, openSheet, closeSheet, sheetHead, empty, dateLabel, timeLabel } from "../ui.js";
import { personCards } from "./bill.js";
import { setAfterOnboarding } from "./onboarding.js";

const cache = new Map(); // payload -> { packed } | { error }
const key = (payload) => payload.slice(0, 24) + payload.length + payload.slice(-24);

function view(payload) {
  let c = cache.get(payload),
    packed = c.packed,
    ids = packed.people.map((_, i) => "p" + i),
    bill = unpackBill(packed, ids),
    r = splitBill(bill),
    getPerson = (id) => {
      let p = packed.people[Number(id.slice(1))];
      return p && { name: p.name, avatar: { seed: p.seed, look: p.look || undefined } };
    },
    payer = getPerson(bill.payerId),
    imported = S().bills.find((b) => b.importKey === key(payload));
  return { bill, r, getPerson, payer, imported, packed };
}

export const Shared = {
  title: "Shared bill",
  render({ payload }) {
    let c = cache.get(payload),
      onboarded = S().prefs.onboarded,
      left = onboarded ? undefined : '<span class="icon-spacer"></span>';
    if (!c) return `${topbar("Shared bill", { left })}<div class="screen-body center pad"><div class="spinner dark"></div><p class="muted">Opening the bill…</p></div>`;
    if (c.error)
      return `${topbar("Shared bill", { left })}<div class="screen-body">${empty(`<div class="empty-art">${icon("link")}</div>`, "This link doesn't work", "It may have been cut off when it was copied. Ask your friend to share it again.", `<button class="btn primary sm" data-go="${onboarded ? "home" : "welcome"}">Open SplitSmart</button>`)}</div>`;
    let { bill, r, getPerson, payer, imported } = view(payload);
    return `${topbar("Bill Split Summary", { left })}
    <div class="screen-body">
      <div class="notice info">${icon("link")} ${esc(payer?.name || "A friend")} shared this split with you. It's read-only.</div>
      <section class="paper torn summary-head">
        <div class="paper-head"><h2>${esc(bill.merchant || bill.title)}</h2><p>${[dateLabel(bill.date), timeLabel(bill.time)].filter(Boolean).join(' <span class="dot-sep"></span> ')}</p></div>
        <div class="sum-total"><small>Total bill</small><b>${fmt(r.total)}</b><span class="payer-chip static">${av(payer, 24)}Paid by ${esc(payer?.name || "someone")}</span></div>
      </section>
      ${r.disputed ? `<div class="notice warn">${icon("flag")} ${fmt(r.disputed)} is disputed and held with ${esc(payer?.name)} for now.</div>` : ""}
      <section class="person-list">${personCards(bill, r, { getPerson, meId: null, interactive: false, payerName: payer?.name })}</section>
    </div>
    <div class="cta-bar">${imported ? `<button class="btn outline block" data-go="bill/${imported.id}">Already saved · Open it</button>` : `<button class="btn primary block" data-act="shared-import" data-payload="${esc(payload)}">${icon("download")} Save to my SplitSmart</button>`}</div>`;
  },
  async mount({ payload }) {
    if (cache.has(payload)) return;
    try {
      cache.set(payload, { packed: await decode(payload) });
    } catch {
      cache.set(payload, { error: true });
    }
    if (location.hash.includes(payload.slice(0, 40))) refresh();
  },
};

let importing = null;
function whoSheet() {
  let { packed } = importing;
  return `${sheetHead("Which one is you?", "So your share shows up as yours")}
    <div class="pick-list">${packed.people
      .map((p, i) => `<button class="pick-row" data-act="shared-me" data-i="${i}">${av({ name: p.name, avatar: { seed: p.seed, look: p.look || undefined } }, 40)}<span class="grow"><b>${esc(p.name)}</b></span>${icon("next")}</button>`)
      .join("")}<button class="pick-row" data-act="shared-me" data-i="-1"><span class="av-blank">${icon("users")}</span><span class="grow"><b>I'm not on this bill</b></span>${icon("next")}</button></div>`;
}
function doImport(meIndex) {
  let { packed, payload } = importing,
    s = S();
  commit((st) => {
    let ids = packed.people.map((p, i) => {
      if (i === meIndex && st.meId) return st.meId;
      let found = st.people.find((x) => x.id !== st.meId && x.name.trim().toLowerCase() === p.name.trim().toLowerCase());
      if (found) return found.id;
      let np = makePerson(p.name, { avatar: { seed: p.seed, look: p.look || undefined } });
      st.people.push(np);
      return np.id;
    });
    let b = { ...makeBill(), ...unpackBill(packed, ids), status: "final", source: "shared", importKey: key(payload), totalSource: "receipt" };
    b.items = b.items.map((it) => ({ ...it, id: crypto.randomUUID() }));
    b.charges = b.charges.map((c) => ({ ...c, id: crypto.randomUUID() }));
    st.bills.push(b);
    importing.id = b.id;
  });
  let id = importing.id;
  importing = null;
  closeSheet(true);
  toast("Saved to your bills");
  go(`bill/${id}`, true);
}

export const sharedActions = {
  "shared-import": (el) => {
    let payload = el.dataset.payload,
      c = cache.get(payload);
    if (!c?.packed) return;
    importing = { packed: c.packed, payload };
    if (!S().prefs.onboarded) {
      setAfterOnboarding(() => {
        go(`s/${payload}`, true);
        setTimeout(() => openSheet(whoSheet, { label: "Which one is you" }), 50);
      });
      return go("welcome");
    }
    openSheet(whoSheet, { label: "Which one is you" });
  },
  "shared-me": (el) => doImport(Number(el.dataset.i)),
};
