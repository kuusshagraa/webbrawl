import { S, bill, person, nameOf, persist } from "../store.js";
import { money } from "../core.js";
import { tidyBill } from "../model.js";
import { av, avStack, esc, icon, fmt, topbar, iconBtn, refresh, commit, go, confirmDialog, firstName, rupees, plural, enter } from "../ui.js";
import { missing } from "./bill.js";

// Claim state lives on the bill (bill.claim) so a refresh mid-round is safe:
// { order: [ids], i: index, phase: "intro"|"hand"|"pick"|"recap", picks: {pid: {itemId: n}}, leftover: {itemId: "equal"|"payer"} }
const claimed = (c, itemId, except = null) =>
  Object.entries(c.picks).reduce((a, [pid, p]) => a + (pid === except ? 0 : p[itemId] || 0), 0);
const claimers = (c, itemId) => Object.keys(c.picks).filter((pid) => c.picks[pid][itemId] > 0);
function unclaimedAmount(b, c) {
  let t = 0;
  for (let it of b.items) {
    let q = Number(it.qty) || 1,
      n = claimed(c, it.id);
    if (q > 1) t += Math.round((money(it.amount) * Math.max(0, q - n)) / q);
    else if (!n) t += money(it.amount);
  }
  return t;
}
const save = () => (persist(), refresh());

export const Pass = {
  title: "Pass the phone",
  full: false,
  render({ id }) {
    let b = bill(id);
    if (!b) return missing();
    let c = b.claim;
    if (!c || c.phase === "intro") {
      let had = b.items.some((it) => it.split === "custom" || it.excluded?.length);
      return `${topbar("Pass the phone", { left: iconBtn("back", "pass-exit", "Back", `data-id="${id}"`) })}
      <div class="screen-body pass-intro">
        <div class="pass-art">${icon("phone", "big")}<div class="orbit">${b.participants.slice(0, 6).map((pid, i) => `<span style="--i:${i};--n:${Math.min(6, b.participants.length)}">${av(pid, 44)}</span>`).join("")}</div></div>
        <h2>Everyone picks what they had</h2>
        <p class="lede center">Hand the phone around the table. Each person taps only their own items. Whatever nobody claims gets split equally at the end.</p>
        <ol class="steps"><li>${icon("hand")} Pass it to the next person</li><li>${icon("check")} They tap what they ate</li><li>${icon("split")} Review and confirm</li></ol>
        ${had ? `<div class="notice info">${icon("info")} This replaces who had what on this bill.</div>` : ""}
      </div>
      <div class="cta-bar"><button class="btn primary block" data-act="pass-begin" data-id="${id}">Start with ${esc(b.participants[0] === S().meId ? "you" : firstName(nameOf(b.participants[0])))}</button></div>`;
    }
    let pid = c.order[c.i],
      p = person(pid),
      nextPid = c.order[c.i + 1];
    if (c.phase === "hand")
      return `<div class="pass-hand">
        <button class="icon-btn ghost-light" data-act="pass-exit" data-id="${id}" aria-label="Stop">${icon("x")}</button>
        <p class="step-count">${c.i + 1} of ${c.order.length}</p>
        ${av(p, 140, "ring " + enter("pass", id + c.i))}
        <p class="muted-light">Pass the phone to</p>
        <h1>${esc(pid === S().meId ? "You" : p?.name)}</h1>
        <button class="btn light block" data-act="pass-ready" data-id="${id}">I'm ${esc(pid === S().meId ? "ready" : firstName(p?.name))}, show my items</button>
        <button class="link light" data-act="pass-skip" data-id="${id}">Skip ${esc(pid === S().meId ? "me" : firstName(p?.name))}</button>
      </div>`;
    if (c.phase === "pick") {
      let mine = c.picks[pid] || {},
        rows = b.items
          .map((it) => {
            let q = Number(it.qty) || 1,
              n = mine[it.id] || 0,
              others = claimers(c, it.id).filter((x) => x !== pid),
              left = q - claimed(c, it.id, pid);
            let sub = others.length ? `${avStack(others, 3, 20)}<small>${q > 1 ? `${claimed(c, it.id, pid)} of ${q} taken` : "also had this"}</small>` : `<small>${q > 1 ? `${q} in total` : "Not picked yet"}</small>`;
            if (q > 1)
              return `<div class="claim-card ${n ? "on" : ""}"><div class="grow"><b>${esc(it.name)}</b><span class="claim-sub">${sub}</span></div><span class="p">${rupees(it.amount)}</span><span class="stepper"><button data-act="pass-step" data-bill="${id}" data-item="${it.id}" data-d="-1" aria-label="One less ${esc(it.name)}" ${n ? "" : "disabled"}>${icon("minus")}</button><b>${n}</b><button data-act="pass-step" data-bill="${id}" data-item="${it.id}" data-d="1" aria-label="One more ${esc(it.name)}" ${left > n ? "" : "disabled"}>${icon("plus")}</button></span></div>`;
            return `<button class="claim-card ${n ? "on" : ""}" data-act="pass-toggle" data-bill="${id}" data-item="${it.id}" role="checkbox" aria-checked="${!!n}"><span class="grow"><b>${esc(it.name)}</b><span class="claim-sub">${sub}</span></span><span class="p">${rupees(it.amount)}</span><span class="check ${n ? "on" : ""}">${icon("check")}</span></button>`;
          })
          .join("");
      let count = Object.values(mine).filter(Boolean).length;
      return `${topbar(`${esc(pid === S().meId ? "Your" : firstName(p?.name) + "’s")} picks`, { left: iconBtn("x", "pass-exit", "Stop", `data-id="${id}"`), right: `<span class="step-pill">${c.i + 1}/${c.order.length}</span>` })}
      <div class="screen-body">
        <div class="pick-hello">${av(p, 44)}<div><b>${pid === S().meId ? "What did you have?" : `What did you have, ${esc(firstName(p?.name))}?`}</b><small>Shared something? Tap it too. It'll be split between everyone who did.</small></div></div>
        <div class="claim-list">${rows}</div>
      </div>
      <div class="cta-bar"><div class="unclaimed-pill">${fmt(unclaimedAmount(b, c))} not picked yet</div><button class="btn primary block" data-act="pass-done" data-id="${id}">${count ? "" : "Nothing for me · "}${nextPid ? `Pass to ${esc(nextPid === S().meId ? "you" : firstName(nameOf(nextPid)))}` : "Finish"}</button></div>`;
    }
    // recap
    let left = b.items.filter((it) => {
      let q = Number(it.qty) || 1;
      return claimed(c, it.id) < q && (q > 1 ? true : !claimed(c, it.id));
    });
    return `${topbar("Everyone's picks", { left: iconBtn("back", "pass-recap-back", "Back", `data-id="${id}"`) })}
    <div class="screen-body">
      <section class="card">${c.order
        .map((pid) => {
          let picks = b.items.filter((it) => c.picks[pid]?.[it.id]);
          return `<div class="recap-row">${av(pid, 40)}<div class="grow"><b>${esc(nameOf(pid))}</b><small>${picks.length ? picks.map((it) => `${(Number(it.qty) || 1) > 1 ? c.picks[pid][it.id] + "× " : ""}${esc(it.name)}`).join(", ") : "Didn't pick anything"}</small></div></div>`;
        })
        .join("")}</section>
      ${
        left.length
          ? `<section class="card"><div class="card-title"><h3>Nobody claimed these</h3></div>${left
              .map((it) => {
                let q = Number(it.qty) || 1,
                  n = claimed(c, it.id),
                  choice = c.leftover?.[it.id] || "equal";
                return `<div class="left-row"><div class="grow"><b>${q > 1 ? `${q - n} of ${q}× ` : ""}${esc(it.name)}</b><small>${rupees(it.amount)}${q > 1 ? " for all" : ""}</small></div><div class="seg small"><button class="${choice === "equal" ? "on" : ""}" data-act="pass-leftover" data-bill="${id}" data-item="${it.id}" data-v="equal">Split equally</button><button class="${choice === "payer" ? "on" : ""}" data-act="pass-leftover" data-bill="${id}" data-item="${it.id}" data-v="payer">${esc(b.payerId === S().meId ? "I'll cover" : firstName(nameOf(b.payerId)) + " covers")}</button></div></div>`;
              })
              .join("")}</section>`
          : `<div class="notice ok">${icon("check")} Every item was claimed. Nice!</div>`
      }
    </div>
    <div class="cta-bar"><button class="btn primary block" data-act="pass-apply" data-id="${id}">Apply & see the split</button></div>`;
  },
};

export const passActions = {
  "pass-start": (el) => go(`bill/${el.dataset.id}/pass`),
  "pass-begin": (el) => {
    let b = bill(el.dataset.id);
    let order = [...b.participants];
    b.claim = { order, i: 0, phase: "hand", picks: Object.fromEntries(order.map((p) => [p, {}])), leftover: {} };
    save();
  },
  "pass-ready": (el) => {
    bill(el.dataset.id).claim.phase = "pick";
    save();
    window.scrollTo(0, 0);
  },
  "pass-skip": (el) => passActions["pass-done"](el),
  "pass-toggle": (el) => {
    let c = bill(el.dataset.bill).claim,
      mine = c.picks[c.order[c.i]];
    mine[el.dataset.item] = mine[el.dataset.item] ? 0 : 1;
    save();
  },
  "pass-step": (el) => {
    let b = bill(el.dataset.bill),
      c = b.claim,
      pid = c.order[c.i],
      mine = c.picks[pid],
      it = b.items.find((x) => x.id === el.dataset.item),
      q = Number(it.qty) || 1,
      n = (mine[it.id] || 0) + Number(el.dataset.d);
    if (n < 0 || n + claimed(c, it.id, pid) > q) return;
    mine[it.id] = n;
    save();
  },
  "pass-done": (el) => {
    let c = bill(el.dataset.id).claim;
    if (c.i + 1 < c.order.length) Object.assign(c, { i: c.i + 1, phase: "hand" });
    else c.phase = "recap";
    save();
    window.scrollTo(0, 0);
  },
  "pass-recap-back": (el) => {
    let c = bill(el.dataset.id).claim;
    Object.assign(c, { i: c.order.length - 1, phase: "pick" });
    save();
  },
  "pass-leftover": (el) => {
    let c = bill(el.dataset.bill).claim;
    c.leftover = { ...c.leftover, [el.dataset.item]: el.dataset.v };
    save();
  },
  "pass-exit": async (el) => {
    let b = bill(el.dataset.id);
    if (b?.claim && b.claim.phase !== "intro") {
      let ok = await confirmDialog({ title: "Stop passing the phone?", body: "Picks so far won't be applied.", ok: "Stop", cancel: "Keep going", danger: true });
      if (!ok) return;
      b.claim = null;
      persist();
    }
    go(`bill/${el.dataset.id}/assign`, true);
  },
  "pass-apply": (el) => {
    let id = el.dataset.id;
    commit((s) => {
      let b = s.bills.find((x) => x.id === id),
        c = b.claim;
      for (let it of b.items) {
        let q = Number(it.qty) || 1,
          who = claimers(c, it.id),
          choice = c.leftover?.[it.id] || "equal";
        it.disputed = false;
        it.excluded = [];
        it.dietOverride = [];
        if (!who.length) {
          if (choice === "payer") Object.assign(it, { split: "custom", byQty: false, portions: { [b.payerId]: 1 } });
          else Object.assign(it, { split: "all", byQty: false, portions: {} });
        } else if (q > 1) {
          let portions = Object.fromEntries(who.map((pid) => [pid, c.picks[pid][it.id]])),
            rest = q - Object.values(portions).reduce((a, x) => a + x, 0);
          // Leftover units the payer chose to cover go to the payer's count.
          if (rest > 0 && choice === "payer") portions[b.payerId] = (portions[b.payerId] || 0) + rest;
          Object.assign(it, { split: "custom", byQty: true, portions });
        } else Object.assign(it, { split: "custom", byQty: false, portions: Object.fromEntries(who.map((pid) => [pid, 1])) });
      }
      b.claim = null;
      b.claimAck = true;
      tidyBill(b);
    });
    go(`bill/${id}`, true);
  },
};
