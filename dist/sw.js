const CACHE = "splitsmart-v7";
self.addEventListener("install", (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c.addAll([
          "./",
          "index.html",
          "style.css",
          "app.js",
          "core.js",
          "fair.js",
          "parse.js",
          "layout.js",
          "share.js",
          "store.js",
          "model.js",
          "session.js",
          "ui.js",
          "icons.js",
          "avatar.js",
          "ocr.js",
          "views/home.js",
          "views/onboarding.js",
          "views/people.js",
          "views/bill.js",
          "views/pass.js",
          "views/scan.js",
          "views/shared.js",
          "views/groups.js",
          "views/more.js",
          "icon.svg",
          "manifest.json",
        ]),
      ),
  ),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k.startsWith("splitsmart-") && k !== CACHE && !k.startsWith("splitsmart-models-"))
              .map((k) => caches.delete(k)),
          ),
        ),
      self.clients.claim(),
    ]),
  ),
);
// App files: network first so updates arrive immediately, cache when offline.
// Third-party libraries and fonts: cache first, they are versioned URLs.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  let url = new URL(e.request.url);
  // OCR models are cached by ocr.js in their own cache; don't duplicate them.
  if (/\/models\/|\.onnx$|ppocrv5_dict/.test(url.pathname)) return;
  let same = url.origin === location.origin,
    put = (response) => {
      if (response.ok && (same || response.type === "cors")) {
        let copy = response.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      }
      return response;
    };
  e.respondWith(
    same
      ? fetch(e.request).then(put).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
      : caches.match(e.request).then((cached) => cached || fetch(e.request).then(put)),
  );
});
