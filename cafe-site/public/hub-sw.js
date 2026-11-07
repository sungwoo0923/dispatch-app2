// ======================= cafe-site/public/hub-sw.js =======================
// ⭐ 2026-11-06 로지스웹 허브 푸시 서비스워커 — 배차 프로그램(public/sw.js)과 같은 방식:
//  서버(functions/index.js hubNoticeOnCreate → sendPushAndCleanup)는 notification 없이 data(title · body · url)로만 보내고,
//  여기서 push 이벤트를 직접 받아 알림을 하나만 띄운다(브라우저 자동 표시와 겹쳐 두 번 뜨는 문제 방지).
//  누르면 그 오더 화면(/order/{id})을 연다(이미 열린 허브 창이 있으면 그 창으로).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const data = payload.data || {};
  const title = data.title || payload.notification?.title || "로지스웹 허브";
  const body = data.body || payload.notification?.body || "";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/brand/logisweb-mark-square.svg",
    badge: "/favicon.svg",
    vibrate: [220, 120, 220],
    tag: data.tag || `hub-${Date.now()}`,
    renotify: true,
    data,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = String(event.notification?.data?.url || "/") || "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if ("focus" in c) { try { c.navigate(url); } catch { /* 무시 */ } return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
    return undefined;
  }));
});
