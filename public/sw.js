// ===================== public/sw.js (PWA INSTALL SAFE) =====================

console.log("[SW] PWA install-safe worker loaded");

// --------------------------------------------------
// INSTALL
// --------------------------------------------------
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// --------------------------------------------------
// ACTIVATE
// --------------------------------------------------
self.addEventListener("activate", (event) => {
  self.clients.claim();
});

// ❗ FETCH 절대 사용하지 않음
// ❗ CACHE 절대 사용하지 않음

// ===================== END =====================
