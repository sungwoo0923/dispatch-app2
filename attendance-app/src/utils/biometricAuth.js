// 지문/Face ID 등 기기 자체의 생체인증으로 앱을 다시 여는 잠금화면(BiometricGate)을
// 지원하기 위한 유틸. 실제로는 Firebase 세션이 이미 기기에 로그인되어 있는
// 상태에서 "이 사람이 맞는지" 브라우저의 WebAuthn 플랫폼 인증기(Face ID/지문)로
// 재확인하는 용도다 — 서버가 서명을 검증하는 진짜 패스키 로그인은 별도 백엔드가
// 필요해 범위 밖이며, 여기서는 기기별 로컬 잠금 해제로 동작한다.
const CRED_KEY_PREFIX = "kpwork_biometric_cred_";
const METHOD_KEY_PREFIX = "kpwork_login_method_";

export function isBiometricSupported() {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;
}

export async function isPlatformAuthenticatorAvailable() {
  if (!isBiometricSupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function randomBytes(len) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return arr;
}

function toB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromB64(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

export async function registerBiometric(uid, label) {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: "KP-Work" },
      user: { id: randomBytes(16), name: label || uid, displayName: label || uid },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
      timeout: 60000,
      attestation: "none",
    },
  });
  if (!cred) throw new Error("등록에 실패했습니다.");
  localStorage.setItem(CRED_KEY_PREFIX + uid, toB64(cred.rawId));
  localStorage.setItem(METHOD_KEY_PREFIX + uid, "biometric");
  return true;
}

export function hasBiometricRegistered(uid) {
  return typeof window !== "undefined" && !!localStorage.getItem(CRED_KEY_PREFIX + uid);
}

export function removeBiometric(uid) {
  localStorage.removeItem(CRED_KEY_PREFIX + uid);
  localStorage.removeItem(METHOD_KEY_PREFIX + uid);
}

export async function verifyBiometric(uid) {
  const rawIdB64 = localStorage.getItem(CRED_KEY_PREFIX + uid);
  if (!rawIdB64) return false;
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ id: fromB64(rawIdB64), type: "public-key" }],
      userVerification: "required",
      timeout: 60000,
    },
  });
  return !!assertion;
}

export function getLoginMethod(uid) {
  if (typeof window === "undefined") return "password";
  return localStorage.getItem(METHOD_KEY_PREFIX + uid) || "password";
}

export function setLoginMethod(uid, method) {
  localStorage.setItem(METHOD_KEY_PREFIX + uid, method);
}
