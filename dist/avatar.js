// Illustrated avatar faces in the reference's style: outlined cartoon faces
// on bold circles. A look is a set of option indexes; a seed picks one.

export const LOOK = {
  bg: ["#2F3A8F", "#F7C948", "#F26B4F", "#4353E6", "#57C4A3", "#F4A3C0", "#8B7CF6", "#FF9F43"],
  skin: ["#FFE1C7", "#F9CFA6", "#EDB98A", "#D08B5B", "#AE5D29", "#7A4421"],
  hairColor: ["#1B1B1F", "#3D2817", "#7B4B2A", "#C8873F", "#F2C14E", "#E06D53", "#5B5FEF"],
  shirt: ["#FFFFFF", "#1B1B1F", "#F26B4F", "#F7C948", "#4353E6", "#57C4A3"],
  hair: ["short", "spiky", "curly", "bob", "bun", "side", "long", "buzz", "cap", "afro"],
  eyes: ["dots", "happy", "wink", "round"],
  mouth: ["smile", "open", "grin", "small"],
  acc: ["none", "glasses", "shades", "blush", "earrings"],
};
export const LOOK_LABELS = { bg: "Background", skin: "Skin", hair: "Hair", hairColor: "Hair colour", eyes: "Eyes", mouth: "Smile", acc: "Extras", shirt: "Top" };

function rng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (let i = 0; i < String(seed).length; i++) {
    h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function lookFromSeed(seed) {
  let r = rng(seed),
    pick = (k) => Math.floor(r() * LOOK[k].length),
    look = {};
  for (let k of ["bg", "skin", "hairColor", "hair", "eyes", "mouth", "acc", "shirt"]) look[k] = pick(k);
  if (LOOK.shirt[look.shirt] === LOOK.bg[look.bg]) look.shirt = (look.shirt + 1) % LOOK.shirt.length;
  if (r() < 0.45) look.acc = 0;
  return look;
}

export const resolveLook = (avatar = {}) => ({ ...lookFromSeed(avatar.seed ?? "x"), ...(avatar.look || {}) });

const INK = "#1B1B1F";
const st = `stroke="${INK}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"`;

function hairBack(style, c) {
  if (style === "bob")
    return `<path d="M22 38C20 22 30 15 40 15s20 7 18 23l1 16c-4 3-9 2-11 0V40H32v14c-2 2-7 3-11 0z" fill="${c}" ${st}/>`;
  if (style === "long")
    return `<path d="M21 40C19 22 29 14 40 14s21 8 19 26l2 22c-7 4-13 0-14-4H33c-1 4-7 8-14 4z" fill="${c}" ${st}/>`;
  if (style === "afro") return `<circle cx="40" cy="31" r="21" fill="${c}" ${st}/>`;
  return "";
}
function hairFront(style, c, accent) {
  switch (style) {
    case "short":
      return `<path d="M24.5 36C23 24 31 18 40 18s17 6 15.5 18c-3.5-6-8.5-9-14.5-9s-13 2-16.5 9z" fill="${c}" ${st}/>`;
    case "spiky":
      return `<path d="M24 35l-1-9 5 2 1-9 5 5 4-8 4 7 5-6 2 8 6-4v9l1 5c-5-6-11-8-16-8-6 0-12 3-16 8z" fill="${c}" ${st}/>`;
    case "curly":
      return `<g fill="${c}" ${st}><circle cx="27" cy="31" r="6"/><circle cx="31.5" cy="24" r="6.5"/><circle cx="40" cy="21" r="7"/><circle cx="48.5" cy="24" r="6.5"/><circle cx="53" cy="31" r="6"/></g>`;
    case "bob":
      return `<path d="M25 33c1-10 8-14 15-14s14 4 15 14c-5-5-11-6-15-3-4-3-10-2-15 3z" fill="${c}" ${st}/>`;
    case "bun":
      return `<circle cx="40" cy="13.5" r="6" fill="${c}" ${st}/><path d="M24.5 36C23 24 31 19 40 19s17 5 15.5 17c-3-5-8-8-15.5-8s-12.5 3-15.5 8z" fill="${c}" ${st}/>`;
    case "side":
      return `<path d="M24.5 37C22 23 33 17 42 18s15 7 13.5 18c-3.5-5-5.5-8-9.5-10-6 3-15 4-21.5 11z" fill="${c}" ${st}/>`;
    case "long":
      return `<path d="M25 34c2-11 9-15 15-15s13 4 15 15c-7-2-12-6-14-10-3 5-10 8-16 10z" fill="${c}" ${st}/>`;
    case "buzz":
      return `<path d="M25.5 33c.5-9 6.5-12.5 14.5-12.5S54 24 54.5 33c-4.5-4-9.5-5-14.5-5s-10 1-14.5 5z" fill="${c}" ${st}/>`;
    case "cap":
      return `<path d="M24 32c0-10 7-15 16-15s16 5 16 15z" fill="${accent}" ${st}/><path d="M40 30l24 1c0 3-6 4-12 3l-12-1z" fill="${accent}" ${st}/>`;
    case "afro":
      return `<path d="M25 33c2-8 8-11 15-11s13 3 15 11c-5-3-10-4-15-4s-10 1-15 4z" fill="${c}" ${st}/>`;
  }
  return "";
}
function eyes(kind) {
  switch (kind) {
    case "happy":
      return `<path d="M31.5 39.5q2.5-3 5 0M43.5 39.5q2.5-3 5 0" fill="none" ${st}/>`;
    case "wink":
      return `<circle cx="34" cy="39" r="1.9" fill="${INK}"/><path d="M43.5 39.5q2.5-3 5 0" fill="none" ${st}/>`;
    case "round":
      return `<circle cx="34" cy="39" r="2.8" fill="#fff" ${st}/><circle cx="46" cy="39" r="2.8" fill="#fff" ${st}/><circle cx="34.6" cy="39.4" r="1.2" fill="${INK}"/><circle cx="46.6" cy="39.4" r="1.2" fill="${INK}"/>`;
  }
  return `<circle cx="34" cy="39" r="1.9" fill="${INK}"/><circle cx="46" cy="39" r="1.9" fill="${INK}"/>`;
}
function mouth(kind) {
  switch (kind) {
    case "open":
      return `<path d="M35 45.5h10q-1 6-5 6t-5-6z" fill="#B23A3A" ${st}/>`;
    case "grin":
      return `<path d="M34.5 45.5h11q-1.5 5.5-5.5 5.5t-5.5-5.5z" fill="#fff" ${st}/>`;
    case "small":
      return `<path d="M37.5 47q2.5 2 5 0" fill="none" ${st}/>`;
  }
  return `<path d="M35 46q5 4.5 10 0" fill="none" ${st}/>`;
}
function extras(kind) {
  switch (kind) {
    case "glasses":
      return `<g fill="none" ${st}><circle cx="34" cy="39" r="4.6"/><circle cx="46" cy="39" r="4.6"/><path d="M38.6 39h2.8"/></g>`;
    case "shades":
      return `<g ${st}><rect x="28.5" y="35.5" width="10" height="6.5" rx="3" fill="${INK}"/><rect x="41.5" y="35.5" width="10" height="6.5" rx="3" fill="${INK}"/><path d="M38.5 38h3" fill="none"/></g>`;
    case "blush":
      return `<ellipse cx="29.5" cy="44" rx="2.6" ry="1.6" fill="#F26B4F" opacity=".45"/><ellipse cx="50.5" cy="44" rx="2.6" ry="1.6" fill="#F26B4F" opacity=".45"/>`;
    case "earrings":
      return `<circle cx="25" cy="45" r="1.8" fill="#F7C948" ${st}/><circle cx="55" cy="45" r="1.8" fill="#F7C948" ${st}/>`;
  }
  return "";
}

const cache = new Map();
export function avatarSvg(avatar = {}) {
  let look = resolveLook(avatar),
    key = JSON.stringify(look);
  if (cache.has(key)) return cache.get(key);
  let g = (k) => LOOK[k][look[k]] ?? LOOK[k][0],
    skin = g("skin"),
    hc = g("hairColor"),
    style = g("hair"),
    accent = g("shirt") === "#FFFFFF" ? "#F26B4F" : g("shirt");
  let svg = `<svg viewBox="0 0 80 80" aria-hidden="true" focusable="false"><g><rect width="80" height="80" fill="${g("bg")}"/>${hairBack(style, hc)}<path d="M13 82c2-17 13-24 27-24s25 7 27 24z" fill="${g("shirt")}" ${st}/><path d="M35 50h10v9c-3 2-7 2-10 0z" fill="${skin}" ${st}/><circle cx="25" cy="40" r="3.2" fill="${skin}" ${st}/><circle cx="55" cy="40" r="3.2" fill="${skin}" ${st}/><ellipse cx="40" cy="38" rx="15" ry="17" fill="${skin}" ${st}/>${hairFront(style, hc, accent)}${eyes(g("eyes"))}${mouth(g("mouth"))}${extras(g("acc"))}</g></svg>`;
  if (cache.size > 300) cache.clear();
  cache.set(key, svg);
  return svg;
}
