// src/driver/driverLoginKey.js
// 🔒 2026-11-27 기사 로그인 열쇠(기기에 저장하는 무작위 비밀번호)
//  [왜] 기사 계정이 "차량번호@driver.run25.kr / 비밀번호 = 차량번호"라 번호판만 알면 누구나 그 기사로 로그인할 수 있었다
//       (이름 · 운송사 확인은 로그인 뒤 화면에서만 한다).
//  [어떻게] 새로 가입하는 기사는 비밀번호를 이 기기에서 만든 무작위 값(열쇠)으로 정하고 기기에 저장한다.
//       기사님은 지금처럼 운송사 · 휴대폰번호(또는 차량번호) · 이름만 넣으면 되고(열쇠는 화면이 알아서 넣음),
//       새 휴대폰 · 앱 재설치로 열쇠가 없으면 [문자 인증으로 로그인]에서 가입 휴대폰 문자 인증 → 새 열쇠로 바꾼다(서버 resetPasswordSms).
//  · 예전 기사(비밀번호 = 차량번호)는 그대로 로그인된다 — 열쇠를 먼저, 안 되면 차량번호로 시도(driverEmail.js).
//  · 열쇠는 계정 메일과 따로 둔다(차량 변경으로 메일이 바뀌어도 비밀번호는 그대로라 같은 열쇠로 들어간다).
//  · 한 기기에 여러 기사가 번갈아 쓸 수 있어 최근 것부터 몇 개만 남긴다.
const STORE_KEY = "driverLoginKeys";
const MAX_KEYS = 4;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // 헷갈리는 글자(0 O 1 l I) 뺌 — 사람이 볼 일은 없지만 기록에 남을 때 대비

const storeOf = (store) => {
  if (store) return store;
  try { return globalThis.localStorage || null; } catch { return null; }
};

// 32자 무작위(약 186비트) — 추측 불가. 열쇠라는 표시로 앞에 "k1."(차량번호 · 휴대폰번호와 절대 겹치지 않음)
export function newDriverKey(cryptoImpl) {
  const c = cryptoImpl || globalThis.crypto;
  if (!c?.getRandomValues) throw new Error("이 기기에서 안전한 무작위 값을 만들 수 없어요");
  const buf = new Uint32Array(32);
  c.getRandomValues(buf);
  let out = "";
  for (const n of buf) out += ALPHABET[n % ALPHABET.length];
  return `k1.${out}`;
}

export const isDriverKey = (v) => /^k1\.[A-Za-z0-9]{32}$/.test(String(v || ""));

export function driverKeys(store) {
  const s = storeOf(store);
  if (!s) return [];
  try {
    const v = JSON.parse(s.getItem(STORE_KEY) || "[]");
    return Array.isArray(v) ? v.filter(isDriverKey).slice(0, MAX_KEYS) : [];
  } catch { return []; }
}

// 새 열쇠를 맨 앞에 — 계정을 만들거나 비밀번호를 바꾸기 "전에" 저장한다(바꾼 직후 앱이 꺼져도 열쇠는 남게)
export function saveDriverKey(key, store) {
  const s = storeOf(store);
  if (!s || !isDriverKey(key)) return false;
  try {
    s.setItem(STORE_KEY, JSON.stringify([key, ...driverKeys(s).filter((k) => k !== key)].slice(0, MAX_KEYS)));
    return true;
  } catch { return false; }
}

// 계정을 못 만들었거나 비밀번호를 못 바꿨으면 그 열쇠는 뺀다(쓸모없는 열쇠가 쓸 열쇠를 밀어내지 않게)
export function forgetDriverKey(key, store) {
  const s = storeOf(store);
  if (!s) return;
  try { s.setItem(STORE_KEY, JSON.stringify(driverKeys(s).filter((k) => k !== key))); } catch { /* 무시 */ }
}
