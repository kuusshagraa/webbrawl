import { store, S, person, usedPeople, newId } from "../store.js";
import { LOOK, LOOK_LABELS, lookFromSeed, resolveLook } from "../avatar.js";
import { DIET } from "../fair.js";
import { makePerson } from "../model.js";
import { av, esc, icon, topbar, iconBtn, openSheet, closeSheet, sheetHead, refresh, commit, toast, confirmDialog, pickFile, photoToDataUrl, empty } from "../ui.js";

/* ---------- Avatar studio (shared with onboarding) ---------- */

export const studio = { tab: "suggest", trait: "hair", seeds: [], target: null };
const freshSeeds = () => Array.from({ length: 12 }, () => newId().slice(0, 8));

export function bindStudio(target) {
  studio.target = target;
  studio.tab = target.avatar?.photo ? "photo" : "suggest";
  if (!studio.seeds.length) studio.seeds = freshSeeds();
  if (!target.avatar) target.avatar = { seed: studio.seeds[0], look: lookFromSeed(studio.seeds[0]) };
}

const SWATCH = ["bg", "skin", "hairColor", "shirt"];
export function avatarStudio(compact = false) {
  let t = studio.target,
    look = resolveLook(t.avatar),
    tabs = [
      ["suggest", "Suggestions"],
      ["custom", "Customise"],
      ["photo", "Photo"],
    ]
      .map(([k, l]) => `<button role="tab" aria-selected="${studio.tab === k}" class="${studio.tab === k ? "on" : ""}" data-act="studio-tab" data-tab="${k}">${l}</button>`)
      .join("");
  let body = "";
  if (studio.tab === "suggest")
    body = `<div class="ava-grid">${studio.seeds
      .map((seed) => {
        let sel = !t.avatar.photo && t.avatar.seed === seed;
        return `<button class="ava-opt ${sel ? "on" : ""}" data-act="studio-pick" data-seed="${seed}" aria-label="Avatar option" aria-pressed="${sel}">${av({ name: "", avatar: { seed, look: lookFromSeed(seed) } }, compact ? 52 : 60)}</button>`;
      })
      .join("")}</div><button class="btn ghost sm center" data-act="studio-more">${icon("shuffle")} Show me more</button>`;
  else if (studio.tab === "custom") {
    let traits = Object.keys(LOOK_LABELS)
      .map((k) => `<button class="trait ${studio.trait === k ? "on" : ""}" data-act="studio-trait" data-trait="${k}">${LOOK_LABELS[k]}</button>`)
      .join("");
    let k = studio.trait,
      opts = LOOK[k]
        .map((v, i) => {
          let on = look[k] === i;
          if (SWATCH.includes(k))
            return `<button class="swatch ${on ? "on" : ""}" style="--c:${v}" data-act="studio-set" data-k="${k}" data-v="${i}" aria-label="${LOOK_LABELS[k]} ${i + 1}" aria-pressed="${on}"></button>`;
          return `<button class="ava-opt sm ${on ? "on" : ""}" data-act="studio-set" data-k="${k}" data-v="${i}" aria-label="${LOOK_LABELS[k]} ${esc(v)}" aria-pressed="${on}">${av({ name: "", avatar: { seed: t.avatar.seed, look: { ...look, [k]: i } } }, 48)}</button>`;
        })
        .join("");
    body = `<div class="traits" data-scroll="traits">${traits}</div><div class="trait-opts ${SWATCH.includes(k) ? "swatches" : ""}">${opts}</div>`;
  } else
    body = `<div class="photo-pane">${t.avatar.photo ? `<p>Looking good! Your photo stays on this device.</p><div class="row center"><button class="btn outline sm" data-act="studio-photo">${icon("image")} Change photo</button><button class="btn ghost sm" data-act="studio-photo-remove">Use an avatar</button></div>` : `<p>Use a photo from your gallery. It's cropped to a circle and stored only on this device.</p><button class="btn primary sm" data-act="studio-photo">${icon("image")} Choose a photo</button>`}</div>`;
  return `<div class="studio ${compact ? "compact" : ""}"><div class="ava-preview">${av(t, compact ? 96 : 128, "ring")}<button class="ava-shuffle" data-act="studio-shuffle" aria-label="Surprise me">${icon("shuffle")}</button></div><div class="seg" role="tablist">${tabs}</div>${body}</div>`;
}

export const studioActions = {
  "studio-tab": (el) => {
    studio.tab = el.dataset.tab;
    refresh();
  },
  "studio-pick": (el) => {
    let seed = el.dataset.seed;
    studio.target.avatar = { seed, look: lookFromSeed(seed) };
    refresh();
  },
  "studio-more": () => {
    studio.seeds = freshSeeds();
    refresh();
  },
  "studio-shuffle": () => {
    let seed = newId().slice(0, 8);
    studio.target.avatar = { seed, look: lookFromSeed(seed) };
    if (studio.tab === "photo") studio.tab = "suggest";
    refresh();
  },
  "studio-trait": (el) => {
    studio.trait = el.dataset.trait;
    refresh();
  },
  "studio-set": (el) => {
    let a = studio.target.avatar,
      look = resolveLook(a);
    look[el.dataset.k] = Number(el.dataset.v);
    studio.target.avatar = { seed: a.seed, look };
    refresh();
  },
  "studio-photo": async () => {
    let [file] = await pickFile("image/*");
    if (!file) return;
    try {
      let photo = await photoToDataUrl(file);
      studio.target.avatar = { ...studio.target.avatar, photo };
      refresh();
    } catch {
      toast("That image couldn't be opened. Try a JPG or PNG.", { tone: "warn" });
    }
  },
  "studio-photo-remove": () => {
    let { photo, ...rest } = studio.target.avatar;
    studio.target.avatar = rest;
    studio.tab = "suggest";
    refresh();
  },
};

/* ---------- Diet chips ---------- */

const DIET_ICON = { veg: "leaf", "no-egg": "egg", "no-alcohol": "glass" };
export function dietChips(tags, act, extra = "") {
  return `<div class="chips">${Object.entries(DIET)
    .map(([k, d]) => `<button class="chip ${tags.includes(k) ? "on" : ""}" data-act="${act}" data-tag="${k}" aria-pressed="${tags.includes(k)}" ${extra}>${icon(DIET_ICON[k])}${d.label}</button>`)
    .join("")}</div>`;
}
export const dietBadges = (tags = []) =>
  tags.map((t) => (DIET[t] ? `<span class="badge diet">${icon(DIET_ICON[t])}${DIET[t].label}</span>` : "")).join("");

/* ---------- Person editor sheet ---------- */

let editing = null,
  onSaved = null;
export function editPerson(id = null, { name = "", after = null } = {}) {
  let p = id ? person(id) : null;
  editing = p ? structuredClone(p) : makePerson(name || "");
  editing._new = !p;
  onSaved = after;
  bindStudio(editing);
  studio.tab = editing.avatar.photo ? "photo" : "suggest";
  openSheet(personSheet, { label: p ? "Edit friend" : "Add a friend", onClose: () => (editing = null) });
}
function personSheet() {
  if (!editing) return "";
  let isMe = editing.id === S().meId;
  return `${sheetHead(editing._new ? "Add a friend" : isMe ? "Your profile" : "Edit friend")}
  <form class="form" data-submit="person-save" novalidate>
    ${avatarStudio(true)}
    <label class="field"><span>Name</span><input data-f="p-name" data-in="person-field" data-k="name" value="${esc(editing.name)}" maxlength="40" placeholder="e.g. Aman Verma" autocomplete="off" required ${editing._new ? "autofocus" : ""}></label>
    <label class="field"><span>UPI ID <em>optional</em></span><input data-f="p-upi" data-in="person-field" data-k="upi" value="${esc(editing.upi)}" maxlength="60" placeholder="name@okbank" autocomplete="off" inputmode="email"></label>
    <div class="field"><span>Food & drink</span><small class="hint">They'll be left out of matching items automatically. You can always undo it on a bill.</small>${dietChips(editing.tags, "person-tag")}</div>
    <p class="form-error" role="alert" id="person-error"></p>
    <div class="sheet-actions">${!editing._new && !isMe ? `<button type="button" class="btn danger-outline" data-act="person-delete">Delete</button>` : ""}<button class="btn primary" type="submit">${editing._new ? "Add friend" : "Save"}</button></div>
  </form>`;
}
const UPI = /^[\w.\-]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/;
export const personActions = {
  "person-field": (el) => {
    editing[el.dataset.k] = el.value;
  },
  "person-tag": (el) => {
    let t = el.dataset.tag;
    editing.tags = editing.tags.includes(t) ? editing.tags.filter((x) => x !== t) : [...editing.tags, t];
    refresh();
  },
  "person-save": () => {
    let name = editing.name.trim(),
      upi = editing.upi.trim(),
      err = document.getElementById("person-error");
    if (!name) return (err.textContent = "Please add a name.");
    if (upi && !UPI.test(upi)) return (err.textContent = "That UPI ID doesn't look right. It should look like name@bank.");
    let dupe = S().people.find((p) => p.id !== editing.id && p.name.trim().toLowerCase() === name.toLowerCase());
    if (dupe && editing._new) return (err.textContent = `You already have a friend called ${dupe.name}. Add a surname or nickname to tell them apart.`);
    let { _new, ...clean } = { ...editing, name, upi };
    delete clean.sample;
    let after = onSaved;
    closeSheet();
    commit((s) => {
      let i = s.people.findIndex((p) => p.id === clean.id);
      if (i >= 0) s.people[i] = { ...s.people[i], ...clean };
      else s.people.push(clean);
    });
    toast(_new ? `${name} added` : "Saved");
    after?.(clean.id);
  },
  "person-delete": async () => {
    let p = editing;
    if (usedPeople().has(p.id)) {
      toast(`${p.name} is on saved bills or payments, so they can't be deleted.`, { tone: "warn" });
      return;
    }
    let ok = await confirmDialog({ title: `Delete ${esc(p.name)}?`, body: "They'll be removed from your friends and any unsaved drafts.", ok: "Delete", danger: true });
    if (!ok) return;
    closeSheet();
    commit((s) => removePeople(s, [p.id]), `${p.name} deleted`);
  },
};
function removePeople(s, ids) {
  let set = new Set(ids);
  s.people = s.people.filter((p) => !set.has(p.id));
  for (let g of s.groups) g.memberIds = g.memberIds.filter((id) => !set.has(id));
  for (let b of s.bills)
    if (b.status === "draft") {
      b.participants = b.participants.filter((id) => !set.has(id));
      if (set.has(b.payerId)) b.payerId = s.meId;
    }
}

/* ---------- Friends screen ---------- */

let query = "";
export const Friends = {
  tabs: true,
  title: "Friends",
  render() {
    let s = S(),
      q = query.trim().toLowerCase(),
      list = s.people.filter((p) => p.id !== s.meId && (!q || p.name.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name)),
      groups = {};
    for (let p of list) {
      let k = /[a-z]/i.test(p.name[0]) ? p.name[0].toUpperCase() : "#";
      (groups[k] ||= []).push(p);
    }
    let meP = person(s.meId),
      used = usedPeople();
    let rows = Object.entries(groups)
      .map(
        ([letter, ps]) =>
          `<div class="az-letter">${letter}</div>${ps
            .map(
              (p) =>
                `<button class="contact" data-act="person-open" data-id="${p.id}">${av(p, 44)}<span class="grow"><b>${esc(p.name)}</b><small>${p.upi ? esc(p.upi) : "No UPI ID"}</small></span><span class="badges">${p.sample ? '<span class="badge">Sample</span>' : ""}${dietBadges(p.tags)}</span></button>`,
            )
            .join("")}`,
      )
      .join("");
    let removable = s.people.filter((p) => p.id !== s.meId && !used.has(p.id)).length;
    return `${topbar("Friends", { right: iconBtn("userPlus", "person-new", "Add a friend") })}
    <div class="screen-body">
      ${meP ? `<button class="contact me-row card" data-act="person-open" data-id="${meP.id}">${av(meP, 52)}<span class="grow"><b>${esc(meP.name)}</b><small>You${meP.upi ? " · " + esc(meP.upi) : ""}</small></span><span class="badges">${dietBadges(meP.tags)}</span>${icon("next")}</button>` : ""}
      <label class="search">${icon("search")}<input type="search" data-f="friend-q" data-in="friend-search" value="${esc(query)}" placeholder="Search friends" aria-label="Search friends"></label>
      <section class="card contacts">${rows || empty(`<div class="empty-art">${icon("users")}</div>`, q ? "No matches" : "No friends yet", q ? "Try a different name." : "Add the people you split with. You can tag who's veg or doesn't drink.", q ? "" : `<button class="btn primary sm" data-act="person-new">${icon("userPlus")} Add a friend</button>`)}</section>
      ${list.length && !q ? `<div class="pair-actions"><button class="btn danger-outline" data-act="friends-delete-all" ${removable ? "" : "disabled"}>Delete All</button><button class="btn primary" data-act="person-new">Add Friend</button></div><p class="fine">Delete All removes friends who aren't on any saved bill or payment.</p>` : ""}
    </div>`;
  },
};
export const friendActions = {
  "friend-search": (el) => {
    query = el.value;
    refresh();
  },
  "person-new": () => editPerson(),
  "person-open": (el) => editPerson(el.dataset.id),
  "friends-delete-all": async () => {
    let s = S(),
      used = usedPeople(),
      ids = s.people.filter((p) => p.id !== s.meId && !used.has(p.id)).map((p) => p.id);
    if (!ids.length) return;
    let kept = s.people.length - 1 - ids.length;
    let ok = await confirmDialog({
      title: `Delete ${ids.length} friend${ids.length > 1 ? "s" : ""}?`,
      body: `Friends who aren't on any saved bill will be removed.${kept ? ` ${kept} friend${kept > 1 ? "s" : ""} on saved bills will be kept.` : ""}`,
      ok: "Delete",
      danger: true,
    });
    if (ok) commit((st) => removePeople(st, ids), `${ids.length} friend${ids.length > 1 ? "s" : ""} deleted`);
  },
};
