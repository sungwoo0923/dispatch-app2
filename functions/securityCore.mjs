// ======================= functions/securityCore.mjs =======================
// 🛡 2026-11-09 이상 접속 판정(순수 함수 — 서버 securityPing · 단위 테스트 scripts/security.test.mjs 가 같이 쓴다)
//  · 사람마다 securityProfiles/{uid} = { devices: [{ id, ua, first, last }], countries: [..], dl: [ms..], dlAlertAt, nightAlertDay }
//  · 오탐 줄이기:
//    - 처음 쓰는 계정의 첫 기기는 "새 기기"로 보지 않는다(기기가 1개 이상 등록된 뒤부터)
//    - 국가를 모르면(헤더 없음) 해외로 보지 않는다 · 한국(KR) 외만 해외
//    - 새벽 접속은 사람마다 하루 1번만(00~05시 KST) · 기사 계정은 새벽 운행이 흔해 제외
//    - 대량 다운로드: 10분 안에 5번 이상이면 1건, 같은 사람은 30분에 한 번만
export const DL_WINDOW_MS = 10 * 60 * 1000;
export const DL_LIMIT = 5;
export const DL_COOLDOWN_MS = 30 * 60 * 1000;
export const MAX_DEVICES = 20;

export const EVENT_LABEL = {
  new_device: "새 기기 로그인",
  foreign_ip: "해외 IP 접속",
  night_login: "새벽 접속",
  bulk_download: "짧은 시간 대량 다운로드",
  resign_block: "퇴사자 계정 차단",
  rehire_unblock: "복직 계정 다시 허용",
};
export const LEVEL_LABEL = { high: "높음", medium: "보통", low: "낮음" };

const kstHour = (ms) => new Date(ms + 9 * 3600e3).getUTCHours();
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
export const shortUa = (ua) => {
  const s = String(ua || "");
  const os = /iPhone|iPad/.test(s) ? "iOS" : /Android/.test(s) ? "Android" : /Windows/.test(s) ? "Windows" : /Mac OS X|Macintosh/.test(s) ? "Mac" : /Linux/.test(s) ? "Linux" : "기타";
  const br = /Edg\//.test(s) ? "Edge" : /SamsungBrowser/.test(s) ? "Samsung" : /CriOS|Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : /Firefox\//.test(s) ? "Firefox" : "앱";
  return `${os} · ${br}`;
};

// 로그인 1회 판정 — { events: [{ type, level, detail }], profile }
export function evaluateLogin(profile = {}, { deviceId = "", ua = "", country = "", now = Date.now(), role = "" } = {}) {
  const p = { devices: [], countries: [], ...profile };
  const devices = Array.isArray(p.devices) ? p.devices.slice() : [];
  const events = [];
  const id = String(deviceId || "").slice(0, 80);
  if (id) {
    const known = devices.find((d) => d.id === id);
    if (known) known.last = now;
    else {
      if (devices.length > 0) events.push({ type: "new_device", level: "medium", detail: `처음 보는 기기 · ${shortUa(ua)}` });
      devices.push({ id, ua: shortUa(ua), first: now, last: now });
    }
  }
  devices.sort((a, b) => (b.last || 0) - (a.last || 0));
  const cc = String(country || "").toUpperCase().trim();
  const countries = Array.isArray(p.countries) ? p.countries.slice() : [];
  if (cc && cc !== "KR" && cc !== "ZZ" && cc.length === 2) {
    events.push({ type: "foreign_ip", level: "high", detail: `국가 ${cc}에서 접속` });
  }
  if (cc && !countries.includes(cc)) countries.push(cc);
  const h = kstHour(now);
  let nightAlertDay = p.nightAlertDay || "";
  if (h >= 0 && h < 5 && role !== "driver" && nightAlertDay !== kstDay(now)) {
    events.push({ type: "night_login", level: "low", detail: `새벽 ${String(h).padStart(2, "0")}시 접속` });
    nightAlertDay = kstDay(now);
  }
  return { events, profile: { ...p, devices: devices.slice(0, MAX_DEVICES), countries: countries.slice(-10), nightAlertDay } };
}

// 다운로드 1회 판정
export function evaluateDownload(profile = {}, { now = Date.now(), name = "" } = {}) {
  const p = { ...profile };
  const dl = (Array.isArray(p.dl) ? p.dl : []).filter((t) => now - t < DL_WINDOW_MS);
  dl.push(now);
  const events = [];
  let dlAlertAt = Number(p.dlAlertAt) || 0;
  if (dl.length >= DL_LIMIT && now - dlAlertAt > DL_COOLDOWN_MS) {
    events.push({ type: "bulk_download", level: "high", detail: `10분 안에 ${dl.length}번 내려받기${name ? ` (마지막: ${String(name).slice(0, 60)})` : ""}` });
    dlAlertAt = now;
  }
  return { events, profile: { ...p, dl: dl.slice(-30), dlAlertAt } };
}

// 요청 헤더에서 IP · 국가(Google 앞단이 넣어 주는 헤더만 — 외부 조회 없음)
export function clientNet(headers = {}) {
  const h = (k) => String(headers[k] || headers[k.toLowerCase()] || "");
  const ip = (h("x-forwarded-for").split(",")[0] || h("fastly-client-ip") || "").trim();
  const country = (h("x-appengine-country") || h("x-client-geo-country") || h("cf-ipcountry") || "").trim().toUpperCase();
  return { ip, country: country === "ZZ" ? "" : country };
}
