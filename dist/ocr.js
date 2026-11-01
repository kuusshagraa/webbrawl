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

/* ---------- PaddleOCR PP-OCRv5 (primary) ---------- */

// Pinned versions: the runtime is tested with these exact builds.
const ORT_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/";
const PADDLE = "https://cdn.jsdelivr.net/npm/paddleocr@1.2.0/dist/index.mjs";
const MODELS = new URL("./models/", import.meta.url).href;
const MODEL_CACHE = "splitsmart-models-v1";
let paddle = null,
  paddleLoading = null;

// Fetches a file once, then serves it from Cache Storage (works offline).
async function cachedBytes(url, label, weight, base) {
  let cache = await caches.open(MODEL_CACHE).catch(() => null),
    hit = await cache?.match(url);
  if (hit) return new Uint8Array(await hit.arrayBuffer());
  let res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  let total = Number(res.headers.get("content-length")) || 0,
    reader = res.body?.getReader(),
    chunks = [],
    got = 0;
  if (!reader) return new Uint8Array(await res.arrayBuffer());
  for (;;) {
    let { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (total) progressFn(label, base + (got / total) * weight);
  }
  let bytes = new Uint8Array(got),
    at = 0;
  for (let c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  cache?.put(url, new Response(bytes, { headers: { "content-type": "application/octet-stream" } })).catch(() => {});
  return bytes;
}

async function loadPaddle() {
  if (paddle) return paddle;
  if (paddleLoading) return paddleLoading;
  paddleLoading = (async () => {
    progressFn("Getting the scanner ready", 0.02);
    let ort = await import(ORT_BASE + "ort.wasm.min.mjs");
    ort.env.wasm.wasmPaths = ORT_BASE;
    // Threads need cross-origin isolation, which static hosting doesn't give.
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    let { PaddleOcrService } = await import(PADDLE);
    let label = "Downloading the scanner (first time only)";
    let [det, rec, dict] = await Promise.all([
      cachedBytes(MODELS + "PP-OCRv5_mobile_det_infer.onnx", label, 0.18, 0.05),
      cachedBytes(MODELS + "PP-OCRv5_mobile_rec_infer.onnx", label, 0.6, 0.23),
      cachedBytes(MODELS + "ppocrv5_dict.txt", label, 0.01, 0.83),
    ]);
    progressFn("Getting the scanner ready", 0.86);
    // PaddleOCR appends the space character after the dictionary entries.
    let chars = [...new TextDecoder().decode(dict).replace(/\r?\n$/, "").split(/\r?\n/), " "];
    paddle = await PaddleOcrService.createInstance({
      ort,
      modelPreset: "PP-OCRv5_mobile",
      detection: { modelBuffer: det.buffer },
      recognition: { modelBuffer: rec.buffer, charactersDictionary: chars },
    });
    return paddle;
  })();
  try {
    return await paddleLoading;
  } finally {
    paddleLoading = null;
  }
}

async function paddleWords(canvas) {
  let ocr = await loadPaddle(),
    ctx = canvas.getContext("2d", { willReadFrequently: true }),
    img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  progressFn("Reading your receipt", 0.9);
  let res = await ocr.recognize({ width: img.width, height: img.height, data: new Uint8Array(img.data.buffer) });
  progressFn("Reading your receipt", 1);
  return res
    .filter((r) => r?.text?.trim() && r.box?.points?.length === 4)
    .map((r) => ({ text: r.text, pts: r.box.points.map((p) => [p.x, p.y]), conf: r.confidence ?? 1 }));
}

/* ---------- Tesseract (fallback) ---------- */

async function tesseractText(canvas) {
  if (!window.Tesseract) {
    progressFn("Downloading the backup scanner", 0.02);
    await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
  }
  if (!worker)
    worker = await window.Tesseract.createWorker("eng", 1, {
      logger: (m) => {
        let label = /recogniz/.test(m.status) ? "Reading your receipt" : /load|initial/.test(m.status) ? "Preparing the backup scanner" : m.status;
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

// Returns { engine, words } from PaddleOCR, or { engine, text, low } from
// Tesseract when PaddleOCR can't run on this device.
export async function recognize(canvas) {
  try {
    return { engine: "paddle", words: await paddleWords(canvas) };
  } catch (e) {
    console.warn("PaddleOCR unavailable, using Tesseract", e);
    if (!navigator.onLine && !window.Tesseract) throw e;
    return { engine: "tesseract", ...(await tesseractText(canvas)) };
  }
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
