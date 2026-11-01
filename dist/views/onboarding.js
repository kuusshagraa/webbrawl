import { store, S, person, persist } from "../store.js";
import { makePerson } from "../model.js";
import { av, esc, icon, refresh, go, toast, firstName, enter } from "../ui.js";
import { avatarStudio, bindStudio, studioActions, dietChips, dietBadges } from "./people.js";
import { lookFromSeed } from "../avatar.js";

// Onboarding keeps its own draft and writes to the store only at the end,
// so quitting halfway never leaves a half-made profile behind.
const ob = { step: 0, slide: 0, me: null, crew: [], crewName: "", groupName: "", claimId: null, error: "" };
const STEPS = ["intro", "name", "avatar", "prefs", "crew", "done"];

function ensureDraft() {
  if (ob.me) return;
  let s = S(),
    existing = person(s.meId);
  ob.me = existing ? structuredClone(existing) : makePerson("");
  bindStudio(ob.me);
}

const SLIDES = [
  {
    title: "Scan any bill in seconds",
    text: "Point your camera at a receipt or a Swiggy/Zomato screenshot. Items, taxes and fees are read on your phone. Nothing is uploaded.",
    art: () => `<div class="art art-scan"><div class="art-receipt"><i></i><i></i><i></i><i class="short"></i><b></b></div><div class="art-beam"></div><span class="art-corner tl"></span><span class="art-corner tr"></span><span class="art-corner bl"></span><span class="art-corner br"></span></div>`,
  },
  {
    title: "Pay only for what you had",
    text: "Aman's veg? He's left out of the chicken automatically. Had 3 of the 6 rotis? Split by count. Delivery fee is shared equally, tax by what you ordered.",
    art: () => `<div class="art art-split">${["a1", "b7", "c3"].map((s, i) => `<span class="art-av av${i}">${av({ name: "", avatar: { seed: s, look: lookFromSeed(s) } }, 64)}</span>`).join("")}<div class="art-plate">${icon("bowl")}</div><span class="art-tag t1">${icon("leaf")} Veg</span><span class="art-tag t2">3× Roti</span></div>`,
  },
  {
    title: "Settle up without the awkward chat",
    text: "Pass the phone around so everyone taps what they ate, share a link with the breakdown, and pay over UPI with the fewest payments.",
    art: () => `<div class="art art-settle"><div class="art-card"><span>${icon("check")}</span><b>All square!</b><small>2 payments · ₹1,240</small></div><div class="art-coin c1">₹</div><div class="art-coin c2">₹</div></div>`,
  },
];

function progress() {
  let n = ob.step;
  return `<div class="ob-progress" role="progressbar" aria-valuemin="1" aria-valuemax="4" aria-valuenow="${n}" aria-label="Setup progress">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</div>`;
}
function head(skippable = false) {
  return `<header class="ob-head"><button class="icon-btn" data-act="ob-back" aria-label="Back">${icon("back")}</button>${progress()}${skippable ? `<button class="link" data-act="ob-next" data-skip="1">Skip</button>` : '<span class="icon-spacer"></span>'}</header>`;
}

export const Onboarding = {
  full: true,
  title: "Welcome",
  render() {
    let step = STEPS[ob.step];
    if (step !== "intro") ensureDraft();
    if (step === "intro") {
      let s = SLIDES[ob.slide],
        last = ob.slide === SLIDES.length - 1,
        migrated = store.notice?.type === "migrated" && S().people.length;
      return `<div class="ob ob-intro">
        <header class="ob-brand"><span class="logo-mark">${icon("receipt")}</span><b>SplitSmart</b>${!last ? `<button class="link" data-act="ob-skip-intro">Skip</button>` : ""}</header>
        <div class="ob-slide ${enter("ob", "slide" + ob.slide)}" aria-live="polite">${s.art()}<h1>${s.title}</h1><p>${s.text}</p></div>
        <div class="dots">${SLIDES.map((_, i) => `<button class="${i === ob.slide ? "on" : ""}" data-act="ob-slide" data-i="${i}" aria-label="Slide ${i + 1}" aria-current="${i === ob.slide}"></button>`).join("")}</div>
        <div class="ob-foot">${last ? `<button class="btn primary block" data-act="ob-start">Get started</button>${migrated ? `<p class="fine">We found your groups from the previous version. They'll be right there.</p>` : `<p class="fine">${icon("lock")} No sign-up. Your data stays on this device.</p>`}` : `<button class="btn primary block" data-act="ob-slide" data-i="${ob.slide + 1}">Next</button>`}</div>
      </div>`;
    }
    if (step === "name") {
      let s = S(),
        candidates = store.notice?.type === "migrated" ? s.people : [];
      return `<div class="ob">${head()}
        <form class="ob-body ${enter("ob", "step" + ob.step)}" data-submit="ob-name">
          <h1>What should we call you?</h1>
          <p class="lede">Your name shows up on bills and links you share with friends.</p>
          <label class="field big"><span class="sr">Your name</span><input data-f="ob-name" data-in="ob-name-input" value="${esc(ob.me.name)}" maxlength="40" placeholder="Your name" autocomplete="given-name" autocapitalize="words" enterkeyhint="next" autofocus></label>
          ${ob.error ? `<p class="form-error" role="alert">${esc(ob.error)}</p>` : ""}
          ${candidates.length ? `<div class="claim"><p>Or pick yourself from your existing groups:</p><div class="chips">${candidates.map((p) => `<button type="button" class="chip person ${ob.claimId === p.id ? "on" : ""}" data-act="ob-claim" data-id="${p.id}">${av(p, 24)}${esc(p.name)}</button>`).join("")}</div></div>` : ""}
          <div class="ob-foot"><button class="btn primary block" type="submit">Continue</button></div>
        </form></div>`;
    }
    if (step === "avatar")
      return `<div class="ob">${head()}
        <div class="ob-body ${enter("ob", "step" + ob.step)}">
          <h1>Pick your look, ${esc(firstName(ob.me.name))}</h1>
          <p class="lede">Friends spot you faster on a busy bill. Change it anytime.</p>
          ${avatarStudio()}
          <div class="ob-foot"><button class="btn primary block" data-act="ob-next">Looks good</button></div>
        </div></div>`;
    if (step === "prefs")
      return `<div class="ob">${head(true)}
        <form class="ob-body ${enter("ob", "step" + ob.step)}" data-submit="ob-prefs" novalidate>
          <h1>Never pay for what you didn't have</h1>
          <p class="lede">Tell us what you skip. We'll leave you out of matching items on every bill.</p>
          <div class="field">${dietChips(ob.me.tags, "ob-tag")}</div>
          <label class="field"><span>Your UPI ID <em>optional</em></span><input data-f="ob-upi" data-in="ob-upi" value="${esc(ob.me.upi)}" placeholder="yourname@okbank" inputmode="email" autocomplete="off"><small class="hint">Friends can pay you back in one tap. It's only in links you choose to share.</small></label>
          ${ob.error ? `<p class="form-error" role="alert">${esc(ob.error)}</p>` : ""}
          <div class="ob-foot"><button class="btn primary block" type="submit">Continue</button></div>
        </form></div>`;
    if (step === "crew") {
      let existing = S().people.filter((p) => p.id !== ob.me.id && p.id !== ob.claimId);
      return `<div class="ob">${head(true)}
        <div class="ob-body ${enter("ob", "step" + ob.step)}">
          <h1>Who do you usually split with?</h1>
          <p class="lede">Roommates, your hostel wing, the office lunch gang. You can add more later.</p>
          <form class="add-inline" data-submit="ob-crew-add"><input data-f="ob-crew" data-in="ob-crew-input" value="${esc(ob.crewName)}" placeholder="Friend's name" maxlength="40" autocomplete="off" autocapitalize="words" enterkeyhint="done" aria-label="Friend's name"><button class="btn primary sm" type="submit" ${ob.crewName.trim() ? "" : "disabled"}>${icon("plus")} Add</button></form>
          ${ob.error ? `<p class="form-error" role="alert">${esc(ob.error)}</p>` : ""}
          <div class="crew">${ob.crew
            .map(
              (p, i) => `<div class="crew-row ${enter("crew" + p.id, 1)}">${av(p, 44)}<div class="grow"><b>${esc(p.name)}</b>${dietChips(p.tags, "ob-crew-tag", `data-i="${i}"`)}</div><button class="icon-btn plain" data-act="ob-crew-remove" data-i="${i}" aria-label="Remove ${esc(p.name)}">${icon("x")}</button></div>`,
            )
            .join("")}${existing.length ? `<p class="fine">Already here from your old groups: ${existing.map((p) => esc(p.name)).join(", ")}</p>` : ""}</div>
          ${ob.crew.length >= 2 ? `<label class="field"><span>Name this crew as a group <em>optional</em></span><input data-f="ob-group" data-in="ob-group-input" value="${esc(ob.groupName)}" placeholder="e.g. Hostel Wing B" maxlength="60"></label>` : ""}
          <div class="ob-foot"><button class="btn primary block" data-act="ob-next">${ob.crew.length ? "Continue" : "I'll do this later"}</button></div>
        </div></div>`;
    }
    let me = ob.me;
    return `<div class="ob ob-done">
      <div class="confetti" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>
      <div class="ob-body center ${enter("ob", "step" + ob.step)}">
        ${av(me, 132, "ring " + enter("ob-done", me.id) )}
        <h1>You're all set, ${esc(firstName(me.name))}!</h1>
        <p class="lede">${ob.crew.length ? `${ob.crew.length} friend${ob.crew.length > 1 ? "s" : ""} added. ` : ""}Scan your next bill and split it fairly in under a minute.</p>
        ${me.tags.length ? `<div class="badges center">${dietBadges(me.tags)}</div>` : ""}
      </div>
      <div class="ob-foot"><button class="btn primary block" data-act="ob-finish" data-to="scan">${icon("scan")} Scan your first bill</button><button class="btn outline block" data-act="ob-finish" data-to="sample">Try a sample bill</button><button class="link center" data-act="ob-finish" data-to="home">Go to home</button></div>
    </div>`;
  },
};

function nextStep() {
  ob.error = "";
  ob.step = Math.min(STEPS.length - 1, ob.step + 1);
  refresh();
  window.scrollTo(0, 0);
}
function addCrew() {
  let name = ob.crewName.trim();
  if (!name) return;
  let all = [ob.me.name, ...ob.crew.map((p) => p.name), ...S().people.map((p) => p.name)].map((n) => n.trim().toLowerCase());
  if (all.includes(name.toLowerCase())) {
    ob.error = `${name} is already on your list.`;
    return refresh();
  }
  ob.error = "";
  ob.crew.push(makePerson(name));
  ob.crewName = "";
  refresh();
}

export let afterOnboarding = null;
export const setAfterOnboarding = (fn) => (afterOnboarding = fn);

export const onboardingActions = {
  ...studioActions,
  "ob-slide": (el) => {
    ob.slide = Number(el.dataset.i);
    refresh();
  },
  "ob-skip-intro": () => {
    ob.slide = SLIDES.length - 1;
    refresh();
  },
  "ob-start": () => nextStep(),
  "ob-back": () => {
    ob.error = "";
    if (ob.step === 1) ob.slide = SLIDES.length - 1;
    ob.step = Math.max(0, ob.step - 1);
    refresh();
  },
  "ob-next": () => {
    if (STEPS[ob.step] === "crew" && ob.crewName.trim()) addCrew();
    nextStep();
  },
  "ob-name-input": (el) => {
    ob.me.name = el.value;
    if (ob.error) {
      ob.error = "";
      refresh();
    }
  },
  "ob-name": () => {
    let n = ob.me.name.trim();
    if (!n) {
      ob.error = "Please enter your name so friends know it's you.";
      return refresh();
    }
    if (n.length < 2) {
      ob.error = "That's a bit short. Use at least 2 letters.";
      return refresh();
    }
    ob.me.name = n;
    nextStep();
  },
  "ob-claim": (el) => {
    let p = person(el.dataset.id);
    if (ob.claimId === p.id) {
      ob.claimId = null;
      ob.me = makePerson(ob.me.name === p.name ? "" : ob.me.name);
    } else {
      ob.claimId = p.id;
      ob.me = structuredClone(p);
    }
    bindStudio(ob.me);
    refresh();
  },
  "ob-tag": (el) => {
    let t = el.dataset.tag;
    ob.me.tags = ob.me.tags.includes(t) ? ob.me.tags.filter((x) => x !== t) : [...ob.me.tags, t];
    refresh();
  },
  "ob-upi": (el) => (ob.me.upi = el.value),
  "ob-prefs": () => {
    let upi = ob.me.upi.trim();
    if (upi && !/^[\w.\-]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/.test(upi)) {
      ob.error = "That UPI ID doesn't look right. It should look like name@bank, or leave it empty.";
      return refresh();
    }
    ob.me.upi = upi;
    nextStep();
  },
  "ob-crew-input": (el) => {
    let had = !!ob.crewName.trim();
    ob.crewName = el.value;
    if (had !== !!el.value.trim() || ob.error) {
      ob.error = "";
      refresh();
    }
  },
  "ob-crew-add": () => addCrew(),
  "ob-crew-remove": (el) => {
    ob.crew.splice(Number(el.dataset.i), 1);
    refresh();
  },
  "ob-crew-tag": (el) => {
    let p = ob.crew[Number(el.dataset.i)],
      t = el.dataset.tag;
    p.tags = p.tags.includes(t) ? p.tags.filter((x) => x !== t) : [...p.tags, t];
    refresh();
  },
  "ob-group-input": (el) => (ob.groupName = el.value),
  "ob-finish": (el) => {
    let s = S(),
      me = { ...ob.me, name: ob.me.name.trim() };
    let i = s.people.findIndex((p) => p.id === me.id);
    if (i >= 0) s.people[i] = me;
    else s.people.push(me);
    s.meId = me.id;
    s.people.push(...ob.crew);
    if (ob.groupName.trim() && ob.crew.length >= 2)
      s.groups.push({ id: crypto.randomUUID(), name: ob.groupName.trim(), memberIds: [me.id, ...ob.crew.map((p) => p.id)], target: 0, recurring: [], createdAt: Date.now() });
    s.prefs.onboarded = true;
    if (!s.prefs.lastBackup) s.prefs.lastBackup = Date.now();
    store.notice = null;
    if (!persist()) toast("Your browser storage is full, so this couldn't be saved.", { tone: "warn" });
    let to = el.dataset.to;
    Object.assign(ob, { step: 0, slide: 0, me: null, crew: [], crewName: "", groupName: "", claimId: null, error: "" });
    if (afterOnboarding) {
      let fn = afterOnboarding;
      afterOnboarding = null;
      return fn();
    }
    if (to === "sample") return go("sample", true);
    go(to === "scan" ? "scan" : "home", true);
    toast(`Welcome to SplitSmart, ${firstName(me.name)}!`);
  },
};
