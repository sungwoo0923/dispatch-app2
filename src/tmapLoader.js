// ⭐ 로딩 속도 개선 — Tmap 지도 SDK를 index.html <head>에서 "동기"로 불러오고 있어서,
// 프로그램을 처음 열 때 지도 SDK(수백 KB, 외부 서버)를 다 받을 때까지 화면 자체가
// 그려지지 않았다(특히 컴퓨터를 막 켰을 때 = 캐시가 없을 때 가장 느림).
// 이제는 화면을 먼저 띄우고, 지도는 필요할 때(또는 화면이 다 뜬 뒤 여유 시간에) 불러온다.
//
// Tmap 로더 스크립트(jsv2)는 내부에서 document.write로 실제 SDK 파일을 추가하는데,
// 페이지가 이미 다 그려진 뒤 document.write를 호출하면 화면이 통째로 지워진다.
// 그래서 로딩하는 동안만 document.write를 "스크립트 태그 추가"로 바꿔치기한다.
const TMAP_URL = "https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=rmzwkLwH9N4i9ayxDj9GR6l8hyFDaEk52ZQs4yer&libraries=services";

let loading = null;

export function isTmapReady() {
  return !!(typeof window !== "undefined" && window.Tmapv2 && window.Tmapv2.Map);
}

export function loadTmap() {
  if (isTmapReady()) return Promise.resolve(window.Tmapv2);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const origWrite = document.write;
    const origWriteln = document.writeln;
    const shim = function (html) {
      const text = String(html || "");
      let m;
      const scriptRe = /<script[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
      while ((m = scriptRe.exec(text))) {
        const s = document.createElement("script");
        s.src = m[1];
        s.async = false; // 순서 유지
        document.head.appendChild(s);
      }
      const linkRe = /<link[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
      while ((m = linkRe.exec(text))) {
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = m[1];
        document.head.appendChild(l);
      }
    };
    document.write = shim;
    document.writeln = shim;
    const restore = () => { document.write = origWrite; document.writeln = origWriteln; };

    const s = document.createElement("script");
    s.src = TMAP_URL;
    s.async = true;
    s.onerror = () => { restore(); loading = null; reject(new Error("Tmap SDK 로드 실패")); };
    document.head.appendChild(s);

    const started = Date.now();
    const timer = setInterval(() => {
      if (isTmapReady()) {
        clearInterval(timer);
        restore();
        resolve(window.Tmapv2);
      } else if (Date.now() - started > 20000) {
        clearInterval(timer);
        restore();
        loading = null;
        reject(new Error("Tmap SDK 로드 시간 초과"));
      }
    }, 50);
  });
  return loading;
}

// 화면이 다 뜬 뒤 여유 시간에 미리 받아두기(지도 열 때 기다림 최소화)
export function preloadTmapWhenIdle(delayMs = 2500) {
  if (typeof window === "undefined") return;
  const go = () => loadTmap().catch(() => {});
  setTimeout(() => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 5000 });
    else go();
  }, delayMs);
}
