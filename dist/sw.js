const CACHE = "splitsmart-v4";
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
              .filter((k) => k.startsWith("splitsmart-") && k !== CACHE)
              .map((k) => caches.delete(k)),
          ),
        ),
      self.clients.claim(),
    ]),
  ),
);
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(
      (cached) =>
        cached ||
        fetch(e.request).then((response) => {
          if (
            response.ok &&
            (new URL(e.request.url).origin === location.origin ||
              response.type === "cors")
          ) {
            let copy = response.clone();
            caches
              .open(CACHE)
              .then((c) => c.put(e.request, copy))
              .catch(() => {});
          }
          return response;
        }),
    ),
  );
});
