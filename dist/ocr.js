// On-device OCR (Tesseract.js) plus image clean-up before recognition.
let worker = null,
  classifier = null,
  progressFn = () => {};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    let s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("network"));
    document.head.append(s);
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    let img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

// Applies rotation (degrees, multiple of 90), a crop in 0..1 fractions of the
// rotated image, and optional contrast enhancement. Returns a canvas.
export function processImage(img, { rotation = 0, crop = null, enhance = false, maxSide = 2000 } = {}) {
  let w = img.naturalWidth || img.width,
    h = img.naturalHeight || img.height,
    turn = ((rotation % 360) + 360) % 360,
    rw = turn % 180 ? h : w,
    rh = turn % 180 ? w : h;
  let rot = document.createElement("canvas");
  rot.width = rw;
  rot.height = rh;
  let ctx = rot.getContext("2d");
  ctx.translate(rw / 2, rh / 2);
  ctx.rotate((turn * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2);
  let c = crop || { x: 0, y: 0, w: 1, h: 1 },
    sx = Math.round(c.x * rw),
    sy = Math.round(c.y * rh),
    sw = Math.max(1, Math.round(c.w * rw)),
    sh = Math.max(1, Math.round(c.h * rh)),
    scale = Math.min(1, maxSide / Math.max(sw, sh));
  let out = document.createElement("canvas");
  out.width = Math.round(sw * scale);
  out.height = Math.round(sh * scale);
  let o = out.getContext("2d", { willReadFrequently: enhance });
  o.drawImage(rot, sx, sy, sw, sh, 0, 0, out.width, out.height);
  if (enhance) {
    let data = o.getImageData(0, 0, out.width, out.height),
      d = data.data,
      lo = 255,
      hi = 0;
    // Greyscale, then stretch contrast between the 2nd and 98th percentiles.
    let hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      let g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      d[i] = g;
      hist[g]++;
    }
    let n = d.length / 4,
      acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (lo === 255 && acc > n * 0.02) lo = v;
      if (acc > n * 0.98) {
        hi = v;
        break;
      }
    }
    let range = Math.max(1, hi - lo);
    for (let i = 0; i < d.length; i += 4) {
      let v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / range));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    o.putImageData(data, 0, 0);
  }
  return out;
}

export const onProgress = (fn) => (progressFn = fn);

export async function recognize(canvas) {
  if (!window.Tesseract) {
    progressFn("Downloading the scanner", 0.02);
    await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
  }
  if (!worker)
    worker = await window.Tesseract.createWorker("eng", 1, {
      logger: (m) => {
        let label = /recogniz/.test(m.status) ? "Reading your receipt" : /load|initial/.test(m.status) ? "Preparing the scanner" : m.status;
        progressFn(label, m.progress || 0);
      },
    });
  let result = await worker.recognize(canvas, {}, { text: true, blocks: true });
  let low = [];
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    if (typeof node.confidence === "number" && typeof node.text === "string" && !node.words && node.text.trim() && node.confidence < 65)
      low.push(...node.text.trim().split(/\s+/));
    for (let k of ["blocks", "paragraphs", "lines", "words"]) if (Array.isArray(node[k])) node[k].forEach(walk);
  })(result.data);
  return { text: result.data.text || "", low };
}

export const CATS = ["Food", "Coffee", "Groceries", "Travel", "Utilities", "Entertainment", "Other"];
export async function categorize(text, onStatus = () => {}) {
  if (!classifier) {
    onStatus("Downloading the category model…");
    let { pipeline } = await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");
    classifier = await pipeline("zero-shot-classification", "Xenova/mobilebert-uncased-mnli", {
      progress_callback: (p) => p.status === "progress" && onStatus(`Downloading the category model… ${Math.round(p.progress || 0)}%`),
    });
  }
  onStatus("Thinking…");
  let r = await classifier(text, CATS);
  return r.labels[0];
}
