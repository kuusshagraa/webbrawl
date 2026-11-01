import { S, persist, store } from "../store.js";
import { parseText } from "../parse.js";
import { parseWords } from "../layout.js";
import { money } from "../core.js";
import { makeBill, makeItem, makeCharge, tidyBill } from "../model.js";
import { defaultRule } from "../fair.js";
import { loadImage, processImage, recognize, onProgress } from "../ocr.js";
import { session } from "../session.js";
import { esc, icon, fmt, toast, go, back, refresh, openSheet, closeSheet, sheetHead, pickFile, toggle, dateLabel, commit, plural, enter } from "../ui.js";

const sc = {
  phase: "camera", // camera | denied | review | reading | result
  stream: null,
  torch: false,
  torchOk: false,
  img: null,
  preview: "",
  rotation: 0,
  crop: { x: 0, y: 0, w: 1, h: 1 },
  enhance: false,
  cropping: false,
  parsed: null,
  splitTax: true,
  error: "",
  progress: ["", 0],
  name: "",
  run: 0,
};

function reset() {
  sc.run++;
  Object.assign(sc, { phase: "camera", img: null, preview: "", rotation: 0, crop: { x: 0, y: 0, w: 1, h: 1 }, cropping: false, parsed: null, splitTax: true, error: "", name: "" });
}
async function startCamera() {
  if (sc.stream) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    sc.phase = "denied";
    sc.error = "This browser can't open the camera. Pick a photo instead.";
    return refresh();
  }
  try {
    sc.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    let track = sc.stream.getVideoTracks()[0];
    sc.torchOk = !!track?.getCapabilities?.().torch;
    if (location.hash.startsWith("#/scan") && sc.phase === "camera") refresh();
    else stopCamera();
  } catch (e) {
    sc.phase = "denied";
    sc.error = e?.name === "NotAllowedError" ? "Camera access was blocked. You can allow it in your browser settings, or pick a photo instead." : "We couldn't open a camera on this device. Pick a photo instead.";
    refresh();
  }
}
function stopCamera() {
  sc.stream?.getTracks().forEach((t) => t.stop());
  sc.stream = null;
  sc.torch = false;
}
async function makePreview() {
  let c = processImage(sc.img, { rotation: sc.rotation, enhance: sc.enhance, maxSide: 1400 });
  sc.preview = c.toDataURL("image/jpeg", 0.85);
}
async function useImage(src, name = "") {
  try {
    sc.img = await loadImage(src);
    sc.name = /whatsapp|^img|image|photo|screenshot|scan|^dsc|^pxl|^\W*\w?\d[\d\s_-]*$/i.test(name) ? "" : name;
    sc.rotation = 0;
    sc.crop = { x: 0, y: 0, w: 1, h: 1 };
    await makePreview();
    stopCamera();
    sc.phase = "review";
    refresh();
  } catch {
    toast("That file couldn't be opened as an image.", { tone: "warn" });
  }
}
async function useFile(file) {
  let url = URL.createObjectURL(file);
  await useImage(url, file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function showResult(parsed) {
  sc.parsed = parsed;
  sc.splitTax = true;
  sc.phase = "result";
  refresh();
}

function cornerFrame() {
  return `<span class="frame tl"></span><span class="frame tr"></span><span class="frame bl"></span><span class="frame br"></span>`;
}

export const Scan = {
  full: true,
  dark: true,
  title: "Scan",
  render() {
    let top = `<header class="scan-top"><button class="icon-btn glass" data-act="scan-close" aria-label="Close scanner">${icon("x")}</button><b>${sc.phase === "review" ? "Adjust photo" : sc.phase === "result" ? "Receipt found" : "Scan receipt"}</b><button class="icon-btn glass" data-act="scan-help" aria-label="Scanning tips">${icon("info")}</button></header>`;
    if (sc.phase === "camera" || sc.phase === "denied") {
      let denied = sc.phase === "denied";
      return `<div class="scanner">${top}
        <div class="viewfinder">${denied ? `<div class="cam-off">${icon("camera", "big")}<p>${esc(sc.error)}</p></div>` : `<video id="cam" playsinline muted autoplay></video>${sc.stream ? "" : `<div class="cam-off"><div class="spinner"></div><p>Opening camera…</p></div>`}`}${cornerFrame()}${denied ? "" : '<div class="scanline"></div>'}</div>
        <p class="scan-hint">${denied ? "Use a photo from your gallery, or type the bill in." : "Fit the whole receipt inside the frame. Flat and well lit works best."}</p>
        <div class="scan-controls">
          <button class="round-btn glass" data-act="scan-gallery" aria-label="Choose from gallery">${icon("image")}</button>
          <button class="shutter" data-act="scan-capture" aria-label="Take photo" ${denied || !sc.stream ? "disabled" : ""}><i></i></button>
          <button class="round-btn glass ${sc.torch ? "on" : ""}" data-act="scan-torch" aria-label="Flash" aria-pressed="${sc.torch}" ${sc.torchOk ? "" : "disabled"}>${icon("flash")}</button>
        </div>
        <div class="scan-alt"><button class="link light" data-act="scan-paste">Paste text</button><span aria-hidden="true">·</span><button class="link light" data-act="scan-manual">Type it in</button><span aria-hidden="true">·</span><button class="link light" data-go="sample">Try a sample</button></div>
      </div>`;
    }
    if (sc.phase === "review" || sc.phase === "reading") {
      let reading = sc.phase === "reading",
        c = sc.crop;
      return `<div class="scanner">${top}
        <div class="viewfinder still"><div class="still-wrap" id="still"><img src="${sc.preview}" alt="Receipt photo">${
          sc.cropping && !reading
            ? `<div class="crop" id="crop" style="left:${c.x * 100}%;top:${c.y * 100}%;width:${c.w * 100}%;height:${c.h * 100}%">${["tl", "tr", "bl", "br"].map((h) => `<span class="handle ${h}" data-handle="${h}"></span>`).join("")}</div>`
            : ""
        }${reading ? `<div class="scanline"></div>` : ""}</div>${!sc.cropping ? cornerFrame() : ""}</div>
        ${
          reading
            ? `<div class="read-card"><div class="read-head"><div class="spinner"></div><b id="scan-label">${esc(sc.progress[0] || "Starting the scanner")}</b></div><div class="bar"><i id="scan-bar" style="width:${Math.round(sc.progress[1] * 100)}%"></i></div><p>The first scan downloads the scanner once (about 25 MB). After that it's quick and works offline.</p></div>`
            : `<div class="tools">
              <button class="tool" data-act="scan-rotate">${icon("rotate")}<span>Rotate</span></button>
              <button class="tool ${sc.cropping ? "on" : ""}" data-act="scan-crop" aria-pressed="${sc.cropping}">${icon("crop")}<span>${sc.cropping ? "Done" : "Crop"}</span></button>
              <button class="tool ${sc.enhance ? "on" : ""}" data-act="scan-enhance" aria-pressed="${sc.enhance}">${icon("sparkle")}<span>Enhance</span></button>
              <button class="tool" data-act="scan-retake">${icon("camera")}<span>Retake</span></button>
            </div>
            <div class="scan-cta"><button class="btn primary block" data-act="scan-read">${icon("scan")} Read receipt</button></div>`
        }
      </div>`;
    }
    // result
    let p = sc.parsed,
      tax = p.charges.filter((c) => c.kind === "tax").reduce((a, c) => a + money(c.amount), 0),
      itemsSum = p.items.reduce((a, x) => a + money(x.amount), 0) + p.charges.reduce((a, c) => a + money(c.amount), 0),
      total = p.total !== "" ? money(p.total) : itemsSum,
      none = !p.items.length;
    return `<div class="scanner">${top}
      <div class="viewfinder still dim">${sc.preview ? `<div class="still-wrap"><img src="${sc.preview}" alt="Receipt photo"></div>` : `<div class="cam-off">${icon("receipt", "big")}</div>`}${cornerFrame()}</div>
      ${
        none
          ? `<div class="result-card solo ${enter("scan-result", sc.run)}"><div class="rc-main"><b>We couldn't find any items</b><p>Try a sharper, flatter photo with good light, crop to just the receipt, or type the items in.</p><div class="row"><button class="btn primary sm" data-act="scan-retake">${icon("camera")} Try again</button><button class="btn outline sm" data-act="scan-to-items" data-empty="1">Type it in</button></div></div></div>`
          : `<div class="result-card ${enter("scan-result", sc.run)}">
          <div class="rc-main"><b class="rc-title">${esc(p.merchant || sc.name || (p.source === "food-app" ? "Food order" : "Receipt"))}</b><small>${plural(p.items.length, "item")} found${p.source === "food-app" ? " · food app" : ""}</small><div class="rc-bottom"><span class="rc-total">${fmt(total)}</span><small>${dateLabel(p.date) || "Today"}</small></div></div>
          <div class="rc-tax ${tax ? "" : "off"}"><small>${fmt(tax)}</small><b>Split Tax</b>${toggle(sc.splitTax && !!tax, "scan-splittax", "Split tax among everyone", tax ? "" : "disabled")}</div>
        </div>
        <p class="scan-hint">${sc.splitTax || !tax ? "Tax is shared by what each person ordered." : "The person who paid covers the tax."}</p>
        <div class="scan-cta"><button class="btn primary block" data-act="scan-to-items">Review items</button><button class="link light center" data-act="scan-retake">Retake photo</button></div>`
      }
    </div>`;
  },
  mount() {
    if (sc.phase === "camera") startCamera();
    let next = /[?&]next=1/.test(location.hash);
    if (next && session.queue.length) useFile(session.queue.shift());
  },
  after() {
    let v = document.getElementById("cam");
    if (v && sc.stream && v.srcObject !== sc.stream) {
      v.srcObject = sc.stream;
      v.play?.().catch(() => {});
    }
    let crop = document.getElementById("crop");
    if (crop) bindCrop(crop);
  },
  unmount() {
    stopCamera();
    reset();
  },
};

function bindCrop(box) {
  let wrap = document.getElementById("still");
  box.querySelectorAll("[data-handle]").forEach((h) => {
    h.onpointerdown = (e) => {
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      let rect = wrap.getBoundingClientRect(),
        kind = h.dataset.handle,
        c = { ...sc.crop },
        right = c.x + c.w,
        bottom = c.y + c.h,
        min = 0.15;
      h.onpointermove = (ev) => {
        let fx = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)),
          fy = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
        if (kind.includes("l")) c.x = Math.min(fx, right - min);
        if (kind.includes("r")) right = Math.max(fx, c.x + min);
        if (kind.includes("t")) c.y = Math.min(fy, bottom - min);
        if (kind.includes("b")) bottom = Math.max(fy, c.y + min);
        if (kind.includes("l")) c.w = right - c.x;
        else c.w = right - c.x;
        c.h = bottom - c.y;
        sc.crop = { ...c };
        Object.assign(box.style, { left: c.x * 100 + "%", top: c.y * 100 + "%", width: c.w * 100 + "%", height: c.h * 100 + "%" });
      };
      h.onpointerup = h.onpointercancel = () => (h.onpointermove = null);
    };
  });
}

// "Add a bill" from a group page opens #/scan?group=<id>: start with its members.
function withGroup(bill) {
  let gid = new URLSearchParams(location.hash.split("?")[1] || "").get("group"),
    g = S().groups.find((x) => x.id === gid);
  if (g) {
    bill.groupId = g.id;
    bill.participants = [...new Set([S().meId, ...g.memberIds].filter((id) => S().people.some((p) => p.id === id)))];
  }
  return tidyBill(bill);
}

function draftFromParsed(p) {
  let items = p.items.map((x) => makeItem(x.name, x.qty, x.amount, { low: x.low })),
    charges = p.charges.map((c) => {
      let ch = makeCharge(c.kind, c.amount, c.label);
      if (c.kind === "tax" && !sc.splitTax) ch.rule = "payer";
      return ch;
    });
  let bill = makeBill({
    title: p.merchant || sc.name || "",
    merchant: p.merchant || "",
    date: p.date || makeBill().date,
    time: p.time || makeBill().time,
    items,
    charges,
    source: p.source === "food-app" ? "food-app" : "scan",
    category: p.source === "food-app" ? "Food" : "Food",
  });
  if (p.total !== "") {
    bill.total = p.total;
    bill.totalSource = "receipt";
  }
  return withGroup(bill);
}

export const scanActions = {
  "scan-close": () => {
    stopCamera();
    reset();
    back("home");
  },
  "scan-help": () =>
    openSheet(
      () => `${sheetHead("Tips for a great scan")}<div class="help-list">
      <p>${icon("sun")} <b>Good light, no shadows.</b> Turn on the flash in dim restaurants.</p>
      <p>${icon("receipt")} <b>Flat and straight.</b> Smooth out folds and fit the whole receipt in the frame.</p>
      <p>${icon("phone")} <b>Swiggy or Zomato?</b> Take a screenshot of the order details and pick it from your gallery.</p>
      <p>${icon("lock")} <b>Private.</b> Photos are read on this device and never uploaded.</p></div>
      <div class="sheet-actions"><button class="btn primary block" data-act="sheet-close">Got it</button></div>`,
      { label: "Scanning tips" },
    ),
  "scan-gallery": async () => {
    let files = await pickFile("image/*", true);
    if (!files.length) return;
    session.queue = files.slice(1);
    if (session.queue.length) toast(`${plural(files.length, "receipt")} selected. We'll go one at a time.`);
    useFile(files[0]);
  },
  "scan-capture": async () => {
    let v = document.getElementById("cam");
    if (!v?.videoWidth) return;
    let c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    await useImage(c.toDataURL("image/jpeg", 0.92), "");
  },
  "scan-torch": async () => {
    let track = sc.stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !sc.torch }] });
      sc.torch = !sc.torch;
      refresh();
    } catch {
      toast("Flash isn't available on this camera.");
    }
  },
  "scan-rotate": async () => {
    sc.rotation = (sc.rotation + 90) % 360;
    sc.crop = { x: 0, y: 0, w: 1, h: 1 };
    await makePreview();
    refresh();
  },
  "scan-crop": () => {
    sc.cropping = !sc.cropping;
    refresh();
  },
  "scan-enhance": async () => {
    sc.enhance = !sc.enhance;
    await makePreview();
    refresh();
  },
  "scan-retake": () => {
    reset();
    refresh();
    startCamera();
  },
  "scan-read": async () => {
    sc.phase = "reading";
    sc.cropping = false;
    let run = sc.run;
    sc.progress = ["Starting the scanner", 0.02];
    refresh();
    onProgress((label, pct) => {
      sc.progress = [label, pct];
      let l = document.getElementById("scan-label"),
        b = document.getElementById("scan-bar");
      if (l) l.textContent = label;
      if (b) b.style.width = Math.round(pct * 100) + "%";
    });
    try {
      let canvas = processImage(sc.img, { rotation: sc.rotation, crop: sc.crop, enhance: sc.enhance });
      sc.preview = canvas.toDataURL("image/jpeg", 0.85);
      let r = await recognize(canvas);
      if (run !== sc.run) return;
      showResult(r.engine === "paddle" ? parseWords(r.words) : parseText(r.text, r.low));
    } catch (e) {
      console.error(e);
      if (run !== sc.run) return;
      sc.phase = "review";
      refresh();
      toast(navigator.onLine ? "The scanner couldn't read this photo. Try again or type it in." : "You're offline. The first scan needs internet to download the reader.", { tone: "warn" });
    }
  },
  "scan-splittax": () => {
    sc.splitTax = !sc.splitTax;
    refresh();
  },
  "scan-to-items": (el) => {
    let bill = el.dataset.empty ? withGroup(makeBill({ source: "manual", items: [makeItem()] })) : draftFromParsed(sc.parsed);
    commit((s) => s.bills.push(bill));
    if (sc.preview && !el.dataset.empty) session.photos.set(bill.id, sc.preview);
    reset();
    go(`bill/${bill.id}/items`, true);
  },
  "scan-manual": () => {
    let bill = withGroup(makeBill({ source: "manual", items: [makeItem()] }));
    commit((s) => s.bills.push(bill));
    stopCamera();
    reset();
    go(`bill/${bill.id}/items`, true);
  },
  "scan-paste": () =>
    openSheet(
      () => `${sheetHead("Paste receipt text", "From a PDF bill, an email or a food-app order")}<form class="form" data-submit="scan-paste-go"><label class="field"><span class="sr">Receipt text</span><textarea id="paste-text" rows="9" placeholder="Paneer Tikka x 1 ₹240&#10;Butter Naan x 4 ₹160&#10;GST ₹20&#10;Total ₹420" autofocus></textarea></label><p class="form-error" id="paste-error" role="alert"></p><div class="sheet-actions"><button class="btn primary block" type="submit">Read text</button></div></form>`,
      { label: "Paste receipt text" },
    ),
  "scan-paste-go": () => {
    let text = document.getElementById("paste-text")?.value || "",
      parsed = parseText(text);
    if (!parsed.items.length) {
      let err = document.getElementById("paste-error");
      if (err) err.textContent = "No items found. Each line should have a name and a price, like “Masala Dosa 120”.";
      return;
    }
    closeSheet();
    stopCamera();
    sc.preview = "";
    showResult(parsed);
  },
};
