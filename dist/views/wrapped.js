import { S, person, todayISO } from "../store.js";
import { monthStats, prevMonth } from "../wrapped.js";
import { CATEGORIES } from "../icons.js";
import { av, esc, icon, fmt, refresh, back, toast, download, enter, monthLabel, firstName, plural } from "../ui.js";

const EMOJI = { Travel: "🚗", Food: "🍛", Coffee: "☕", Groceries: "🛒", Utilities: "💡", Entertainment: "🎬", Other: "✨" };
const ws = { month: "", i: 0, timer: null, card: "" };
const monthName = (ym) => monthLabel(ym + "-01").split(" ")[0];

function slides(st) {
  let s = S(),
    me = s.meId,
    m = monthName(st.month),
    out = [{ theme: "a", html: `<small>SplitSmart Wrapped</small><h1>Your ${m}<br>in splits</h1><p class="wr-big" data-count="${st.total}" data-count-key="wr-${st.month}">${fmt(st.total)}</p><p>shared across ${plural(st.count, "bill")}</p>` }];
  if (st.topCategory)
    out.push({ theme: "b", html: `<small>Your share</small><p class="wr-big">${fmt(st.myShare)}</p><div class="wr-emoji">${EMOJI[st.topCategory.name] || "✨"}</div><h2>Mostly on ${esc(st.topCategory.name)}</h2><p>${fmt(st.topCategory.amount)} of it</p>` });
  if (st.topPayer)
    out.push({ theme: "c", html: `<small>The group ATM 🏧</small>${av(st.topPayer.id, 128, "ring")}<h2>${st.topPayer.id === me ? "That's you!" : esc(person(st.topPayer.id)?.name || "Someone")}</h2><p>paid ${fmt(st.topPayer.amount)} upfront this month</p>` });
  if (st.favourite) out.push({ theme: "d", html: `<small>Crowd favourite</small><div class="wr-emoji">🍽️</div><h2>${esc(st.favourite.name)}</h2><p>shared ${st.favourite.count} times</p>` });
  if (st.dietSaved) out.push({ theme: "e", html: `<small>Fair splits pay off</small><div class="wr-emoji">🌱</div><h2>Your food tags saved you</h2><p class="wr-big">${fmt(st.dietSaved)}</p><p>by leaving you out of what you didn't eat</p>` });
  else if (st.biggest) out.push({ theme: "e", html: `<small>Biggest bill</small><div class="wr-emoji">🧾</div><h2>${esc(st.biggest.title)}</h2><p class="wr-big">${fmt(st.biggest.amount)}</p>` });
  out.push({ theme: "f", share: true, html: `<small>Share your month</small>${ws.card ? `<img class="wr-card" src="${ws.card}" alt="Your ${m} Wrapped card">` : `<div class="spinner"></div>`}<div class="wr-actions"><button class="btn light" data-act="wr-share">${icon("share")} Share</button><button class="btn ghost-light" data-act="wr-close">Done</button></div>` });
  return out;
}

function drawCard(st) {
  let c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1350;
  let x = c.getContext("2d"),
    g = x.createLinearGradient(0, 0, 1080, 1350);
  g.addColorStop(0, "#4353E6");
  g.addColorStop(0.55, "#8B7CF6");
  g.addColorStop(1, "#F26B4F");
  x.fillStyle = g;
  x.fillRect(0, 0, 1080, 1350);
  let font = (w, px) => `${w} ${px}px "Plus Jakarta Sans", system-ui, sans-serif`;
  x.fillStyle = "rgba(255,255,255,0.75)";
  x.font = font(600, 40);
  x.fillText("SPLITSMART WRAPPED", 90, 150);
  x.fillStyle = "#fff";
  x.font = font(700, 96);
  x.fillText(monthLabel(st.month + "-01"), 90, 270);
  x.font = font(700, 150);
  x.fillText(fmt(st.total), 90, 470);
  x.font = font(500, 44);
  x.fillStyle = "rgba(255,255,255,0.85)";
  x.fillText(`shared across ${plural(st.count, "bill")}`, 90, 540);
  let rows = [
    ["My share", fmt(st.myShare)],
    st.topCategory && ["Top category", `${EMOJI[st.topCategory.name] || ""} ${st.topCategory.name}`],
    st.topPayer && ["Group ATM", st.topPayer.id === S().meId ? "Me 🏧" : `${firstName(person(st.topPayer.id)?.name)} 🏧`],
    st.favourite && ["Crowd favourite", st.favourite.name],
    st.dietSaved && ["Food tags saved me", fmt(st.dietSaved)],
  ].filter(Boolean);
  rows.forEach(([k, v], i) => {
    let y = 700 + i * 120;
    x.fillStyle = "rgba(255,255,255,0.16)";
    x.beginPath();
    x.roundRect?.(70, y - 70, 940, 100, 28);
    x.fill();
    x.fillStyle = "rgba(255,255,255,0.8)";
    x.font = font(500, 38);
    x.fillText(k, 110, y - 8);
    x.fillStyle = "#fff";
    x.font = font(700, 42);
    let w = x.measureText(v).width;
    x.fillText(v, 970 - w, y - 8);
  });
  x.fillStyle = "rgba(255,255,255,0.7)";
  x.font = font(500, 34);
  x.fillText("Split bills fairly · SplitSmart", 90, 1290);
  return c;
}

export const Wrapped = {
  full: true,
  dark: true,
  title: "Wrapped",
  render({ month }) {
    let st = monthStats(S(), month);
    if (!st.count)
      return `<div class="wr wr-a"><button class="icon-btn ghost-light wr-x" data-act="wr-close" aria-label="Close">${icon("x")}</button><div class="wr-body"><small>SplitSmart Wrapped</small><h1>Nothing to wrap yet</h1><p>Save a few bills in ${monthName(month)} and come back.</p></div></div>`;
    let list = slides(st),
      i = Math.min(ws.i, list.length - 1),
      sl = list[i];
    return `<div class="wr wr-${sl.theme}">
      <div class="wr-bars">${list.map((_, k) => `<i class="${k < i ? "done" : k === i ? "now" : ""}" ${k === i && !sl.share ? 'style="--dur:5s"' : ""}></i>`).join("")}</div>
      <button class="icon-btn ghost-light wr-x" data-act="wr-close" aria-label="Close">${icon("x")}</button>
      <div class="wr-body ${enter("wr", month + i)}">${sl.html}</div>
      ${sl.share ? "" : `<button class="wr-tap prev" data-act="wr-prev" aria-label="Previous"></button><button class="wr-tap next" data-act="wr-next" aria-label="Next"></button>`}
    </div>`;
  },
  mount({ month }) {
    ws.month = month;
    ws.i = 0;
    ws.card = "";
  },
  after({ month }) {
    clearTimeout(ws.timer);
    let st = monthStats(S(), month),
      list = st.count ? slides(st) : [];
    if (!list.length) return;
    if (list[Math.min(ws.i, list.length - 1)].share) {
      if (!ws.card) {
        ws.card = drawCard(st).toDataURL("image/png");
        refresh();
      }
      return;
    }
    ws.timer = setTimeout(() => {
      ws.i++;
      refresh();
    }, 5000);
  },
  unmount() {
    clearTimeout(ws.timer);
  },
};

export const wrappedActions = {
  "wr-next": () => {
    ws.i++;
    refresh();
  },
  "wr-prev": () => {
    ws.i = Math.max(0, ws.i - 1);
    refresh();
  },
  "wr-close": () => back("insights"),
  "wr-share": async () => {
    let blob = await (await fetch(ws.card)).blob(),
      file = new File([blob], `splitsmart-${ws.month}-wrapped.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "My SplitSmart Wrapped" });
      } catch {}
    } else {
      download(file.name, blob, "image/png");
      toast("Image saved");
    }
  },
};

// Home shows a Wrapped card in the first week of a month.
export function wrappedTeaser() {
  let today = todayISO();
  if (Number(today.slice(8, 10)) > 7) return "";
  let ym = prevMonth(today),
    st = monthStats(S(), ym);
  if (st.count < 3) return "";
  return `<a class="wr-teaser" href="#/wrapped/${ym}"><span class="wr-teaser-ic">✨</span><span class="grow"><b>Your ${monthName(ym)} Wrapped is ready</b><small>${fmt(st.total)} shared · tap to watch</small></span>${icon("next")}</a>`;
}
