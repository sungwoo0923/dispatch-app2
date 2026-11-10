// ======================= src/driver/DriverUpdateBanner.jsx =======================
// ⭐ 2026-11-05 기사앱 업데이트 안내 — 📱 2026-11-11 상단 띠에서 화면 가운데 팝업으로
//  1) 웹 새 버전 — 화면을 켜 둔 사이 새로 배포되면(VersionCheck가 /version.json을 비교) "새 버전이 있어요 [업데이트]"
//     → 누르면 캐시를 비우고 새로 불러온다. 아이폰 홈 화면 앱(PWA)·안드로이드 APK(서비스 주소를 여는 방식) 모두 같다.
//  2) APK 새 버전 — 설치된 APK의 versionCode(Capacitor App 플러그인)와 GitHub 릴리즈(driver-apk-latest) 본문의
//     "versionCode: N"을 비교해 더 새 APK가 있으면 "앱 업데이트가 있어요 [설치]" → APK 파일 다운로드.
//     (안드로이드는 Play 스토어 밖 앱을 몰래 자동 설치할 수 없다 — 기사님이 받은 파일을 눌러 [업데이트]를 눌러야 한다)
//     APK는 이제 웹 화면을 서비스 주소에서 바로 불러오므로, APK 업데이트는 네이티브 기능이 바뀐 경우에만 필요하다.
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { registerPlugin } from "@capacitor/core";
import { useNewVersion } from "../VersionCheck";
import { hardReloadForUpdate } from "../UpdateBanner";

// FleetDriverExtra.jsx의 DRIVER_APK_URL과 같은 주소(누르면 바로 APK 파일 다운로드)
const APK_URL = "https://github.com/sungwoo0923/dispatch-app2/releases/download/driver-apk-latest/LogisWeb-Driver.apk";
const RELEASE_API = "https://api.github.com/repos/sungwoo0923/dispatch-app2/releases/tags/driver-apk-latest";
const CACHE_KEY = "kpApkLatest";
const CACHE_MS = 6 * 3600e3; // GitHub API 호출 제한(시간당 60회/IP) — 6시간에 한 번만 확인
const NativeApp = registerPlugin("App");
const isNative = () => typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();

async function latestApkCode() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (c && Date.now() - c.at < CACHE_MS) return c.code;
  } catch { /* 무시 */ }
  const r = await fetch(RELEASE_API, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
  if (!r.ok) return 0;
  const j = await r.json();
  const m = /versionCode\s*[:=]\s*(\d+)/.exec(String(j?.body || ""));
  const code = m ? Number(m[1]) : 0;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), code })); } catch { /* 무시 */ }
  return code;
}

export default function DriverUpdateBanner() {
  const webNew = useNewVersion();
  const [apkNew, setApkNew] = useState(false);
  const [hide, setHide] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!isNative() || !window.Capacitor?.isPluginAvailable?.("App")) return undefined;
    let off = false;
    (async () => {
      try {
        const info = await NativeApp.getInfo(); // { version: versionName, build: versionCode(문자열) }
        const mine = Number(info?.build || 0);
        if (!mine) return;
        const latest = await latestApkCode();
        if (!off && latest > mine) setApkNew(true);
      } catch { /* 오프라인 등 — 조용히 넘어간다 */ }
    })();
    return () => { off = true; };
  }, []);

  const kind = apkNew && hide !== "apk" ? "apk" : webNew && hide !== "web" ? "web" : "";
  if (!kind) return null;
  const isApk = kind === "apk";
  // 📱 2026-11-11 상단 띠 → 화면 가운데 팝업. [업데이트]를 누르면 바로 새 화면으로 바뀐다(캐시 비우고 새로 불러오기).
  const go = () => { if (isApk) { window.location.href = APK_URL; return; } setBusy(true); hardReloadForUpdate(); };
  return createPortal(
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "rgba(11,20,40,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 22, fontFamily: '"Noto Sans KR", sans-serif' }}>
      <div style={{ width: "100%", maxWidth: 360, background: "#fff", borderRadius: 24, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,.4)" }}>
        <div style={{ padding: "26px 22px 20px", textAlign: "center", color: "#fff", background: "linear-gradient(135deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
          <div style={{ width: 60, height: 60, margin: "0 auto 12px", borderRadius: 20, background: "rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></svg>
          </div>
          <div style={{ fontSize: 23, fontWeight: 900 }}>{isApk ? "앱 업데이트가 있어요" : "새 버전이 나왔어요"}</div>
        </div>
        <div style={{ padding: "18px 20px 20px" }}>
          <div style={{ fontSize: 17.5, fontWeight: 700, color: "#0F1A30", textAlign: "center", lineHeight: 1.5 }}>
            {isApk ? <>[설치]를 누른 뒤<br />받은 파일을 눌러 주세요</> : <>[업데이트]를 누르면<br />바로 새 화면으로 바뀝니다</>}
          </div>
          <button type="button" onClick={go} disabled={busy}
            style={{ marginTop: 16, width: "100%", height: 58, borderRadius: 18, border: "none", background: "linear-gradient(120deg,#0F1A30,#2D4C82)", color: "#fff", fontSize: 21, fontWeight: 900, cursor: "pointer", fontFamily: "inherit", opacity: busy ? 0.7 : 1 }}>
            {busy ? "업데이트 중…" : isApk ? "설치" : "업데이트"}
          </button>
          {!busy && <button type="button" onClick={() => setHide(kind)}
            style={{ marginTop: 8, width: "100%", height: 46, borderRadius: 14, border: "none", background: "transparent", color: "#3A4A66", fontSize: 17, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>나중에</button>}
        </div>
      </div>
    </div>,
    document.body);
}
