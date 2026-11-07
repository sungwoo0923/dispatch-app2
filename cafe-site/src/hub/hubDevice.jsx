// ======================= cafe-site/src/hub/hubDevice.jsx =======================
// ⭐ 2026-11-07 허브 차주 — 본인 휴대폰(등록 기기)에서만 · 휴대폰에서만
//  · 기기 번호: 이 휴대폰 브라우저에 한 번 만든 임의 번호(localStorage + IndexedDB 두 곳에 둔다)
//  · 문자 인증: 웹은 유심 번호를 읽을 수 없어서, 입력한 휴대폰번호로 문자(Firebase 전화 인증)를 받아 그 번호를 가진 휴대폰인지 확인
//    처음(가입 · 예전 계정) = 계정에 번호 연결(linkWithPhoneNumber), 다른 휴대폰으로 옮길 때 = 문자로 로그인(signInWithPhoneNumber)
//  · 서버 함수 hubBindDevice(functions/hubDriverAuth.js)가 등록 기기를 정하고, 옮기면 예전 기기를 로그아웃시킨다.
//  한계: 휴대폰 브라우저 저장소를 통째로 복사하면 기기 번호도 따라간다(웹앱이 막을 수 있는 끝). 그래서 기기를 옮기면 예전 기기 로그인을
//  서버에서 끊고(refresh token 폐기), 앱이 켜질 때마다 등록 기기와 비교한다.
import React, { useEffect, useRef, useState } from "react";
import { RecaptchaVerifier, linkWithPhoneNumber, signInWithPhoneNumber, signOut, getAdditionalUserInfo } from "firebase/auth";
import qrcode from "qrcode-generator";
import { auth } from "../firebase";
import { HI, Btn, Field, inputCls, HubMark, NAVY_BG, HUB_CSS } from "./hubUi";
import { callHub } from "./hubApi";

const DEV_KEY = "hubDeviceId";
const newId = () => {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* 아래로 */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};
function idb(mode, fn) {
  return new Promise((res) => {
    try {
      const rq = indexedDB.open("hubDevice", 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore("kv");
      rq.onerror = () => res(null);
      rq.onsuccess = () => {
        try {
          const tx = rq.result.transaction("kv", mode);
          const r = fn(tx.objectStore("kv"));
          tx.oncomplete = () => res(r?.result ?? null);
          tx.onerror = () => res(null);
        } catch { res(null); }
      };
    } catch { res(null); }
  });
}
let cachedId = "";
export async function getDeviceId() {
  if (cachedId) return cachedId;
  let id = "";
  try { id = localStorage.getItem(DEV_KEY) || ""; } catch { /* 무시 */ }
  if (!id) id = String((await idb("readonly", (s) => s.get(DEV_KEY))) || "");
  if (!id) id = newId();
  try { localStorage.setItem(DEV_KEY, id); } catch { /* 무시 */ }
  idb("readwrite", (s) => s.put(id, DEV_KEY));
  cachedId = id;
  return id;
}
export function deviceLabel() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const os = /iPhone/.test(ua) ? `iPhone${(ua.match(/OS (\d+)[._](\d+)/) || []).length ? ` iOS ${ua.match(/OS (\d+)[._](\d+)/)[1]}` : ""}`
    : /Android/.test(ua) ? `Android ${(ua.match(/Android ([\d.]+)/) || [])[1] || ""}${(ua.match(/; ([^;)]+) Build/) || [])[1] ? ` ${(ua.match(/; ([^;)]+) Build/) || [])[1]}` : ""}`
      : /iPad|Macintosh/.test(ua) ? "iPad" : "기타";
  const br = /SamsungBrowser/.test(ua) ? "삼성 인터넷" : /CriOS|Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "브라우저";
  return `${os.trim()}, ${br}`;
}
// 휴대폰인지(PC면 차주 화면을 막는다) — 아이패드(맥 모양 UA + 터치)도 휴대 기기로 본다
export function isMobileDevice() {
  if (typeof navigator === "undefined") return true;
  if (navigator.userAgentData?.mobile) return true;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPod|iPad|Mobile/i.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}
export async function bindDevice() {
  return callHub("hubBindDevice", { deviceId: await getDeviceId(), label: deviceLabel() });
}
const e164 = (v) => { const d = String(v || "").replace(/\D/g, ""); return d ? `+82${d.replace(/^0/, "")}` : ""; };
export const maskPhone = (v) => { const d = String(v || "").replace(/\D/g, ""); return d.length >= 10 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : v; };

function smsErrorText(e) {
  const c = e?.code || "";
  if (e?.hub) return e.message;
  if (c === "auth/invalid-verification-code") return "인증번호가 맞지 않아요";
  if (c === "auth/code-expired") return "인증번호 시간이 지났어요. 다시 받아 주세요";
  if (["auth/credential-already-in-use", "auth/account-exists-with-different-credential", "auth/phone-number-already-exists"].includes(c)) return "다른 계정에 등록된 휴대폰번호예요. 관리자에게 알려 주세요";
  if (c === "auth/too-many-requests" || c === "auth/quota-exceeded") return "잠시 후 다시 시도해 주세요";
  if (c === "auth/invalid-phone-number") return "휴대폰번호를 다시 확인해 주세요";
  if (c === "auth/network-request-failed") return "인터넷 연결을 확인해 주세요";
  return "문자 인증을 하지 못했어요. 잠시 후 다시 시도해 주세요";
}

// 문자 인증 + 기기 등록
//  reason: "need-sms"(번호 연결) · "other-device" · "reset"(이 휴대폰으로 옮기기)
//  uid: 옮기기일 때 원래 계정(문자 로그인 결과가 같은 계정이어야) · relogin: 옮긴 뒤 예전 로그인이 끊기므로 다시 로그인하는 함수
export function HubDeviceGate({ reason: reason0, phone, uid, relogin, onDone, onCancel }) {
  const [reason, setReason] = useState(reason0);
  const [conf, setConf] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const box = useRef(null);
  const ver = useRef(null);
  const move = reason !== "need-sms";
  useEffect(() => () => { try { ver.current?.clear(); } catch { /* 무시 */ } }, []);
  const verifier = () => {
    if (!ver.current) ver.current = new RecaptchaVerifier(auth, box.current, { size: "invisible" });
    return ver.current;
  };
  const finish = async () => {
    setBusy("휴대폰을 등록하고 있어요");
    const r = await bindDevice();
    if (r?.ok) {
      if (r.revoked && relogin) { await new Promise((ok) => setTimeout(ok, 1300)); await relogin(); }
      onDone?.(r);
      return;
    }
    if (r?.reason === "other-device" || r?.reason === "reset") { setReason(r.reason); setConf(null); setCode(""); setErr(""); return; }
    throw Object.assign(new Error(r?.reason === "phone-mismatch" ? "회원 정보의 휴대폰번호와 달라요. 관리자에게 알려 주세요" : "휴대폰을 등록하지 못했어요"), { hub: true });
  };
  const send = async () => {
    setErr(""); setBusy("문자를 보내고 있어요");
    try {
      const num = e164(phone);
      let c;
      if (move) {
        await signOut(auth).catch(() => {});
        c = await signInWithPhoneNumber(auth, num, verifier());
      } else {
        const u = auth.currentUser;
        if (!u) throw Object.assign(new Error("다시 로그인해 주세요"), { hub: true });
        if (u.phoneNumber === num) { await finish(); return; } // 이미 연결된 번호
        c = await linkWithPhoneNumber(u, num, verifier());
      }
      setConf(c);
    } catch (e) { setErr(smsErrorText(e)); try { ver.current?.clear(); } catch { /* 무시 */ } ver.current = null; }
    finally { setBusy(""); }
  };
  const confirm = async () => {
    if (!/^\d{6}$/.test(code)) { setErr("인증번호 6자리를 넣어 주세요"); return; }
    setErr(""); setBusy("확인하고 있어요");
    try {
      const res = await conf.confirm(code);
      if (move && uid && res.user.uid !== uid) {
        // 이 번호가 다른 계정 것이거나 어느 계정에도 없었음(새로 생긴 계정은 지운다)
        if (getAdditionalUserInfo(res)?.isNewUser) await res.user.delete().catch(() => {});
        await signOut(auth).catch(() => {});
        throw Object.assign(new Error("이 휴대폰번호는 이 계정에 등록된 번호가 아니에요"), { hub: true });
      }
      await res.user.getIdToken(true);
      await finish();
    } catch (e) { setErr(smsErrorText(e)); }
    finally { setBusy(""); }
  };

  return (
    <div className="space-y-3.5" data-testid="device-gate" data-reason={reason}>
      <div className={`rounded-2xl px-4 py-3.5 text-[15px] leading-relaxed flex gap-2.5 ${move ? "bg-[#0F1A30] text-white" : "bg-[#F5F8FD] ring-1 ring-inset ring-[#DCE3EE] text-[#1B2B4B]"}`} data-testid={move ? "device-other" : "device-need-sms"}>
        <HI name={move ? "lock" : "shield"} size={19} className={`shrink-0 mt-0.5 ${move ? "text-[#8FB0F0]" : "text-[#2D4C82]"}`} />
        <span>{move
          ? (reason === "reset" ? "관리자가 등록 휴대폰을 지웠어요. 문자 인증을 하면 이 휴대폰이 등록돼요." : "등록된 휴대폰에서만 로그인할 수 있어요. 이 휴대폰으로 바꾸려면 문자 인증을 해 주세요")
          : "본인 휴대폰인지 문자로 확인할게요. 확인한 휴대폰에서만 로그인돼요."}</span>
      </div>
      <Field label="휴대폰번호"><input className={`${inputCls} bg-[#F5F7FB] text-[#55657F]`} value={maskPhone(phone)} readOnly /></Field>
      {conf ? <>
        <Field label="인증번호" hint="문자로 받은 6자리">
          <input className={`${inputCls} tracking-[0.3em] font-extrabold`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" data-testid="sms-code" />
        </Field>
        <Btn size="xl" className="w-full" onClick={confirm} disabled={!!busy} data-testid="sms-confirm">{busy || "확인"}</Btn>
        <button type="button" onClick={() => { setConf(null); setCode(""); }} className="h-10 text-[14.5px] font-semibold text-[#55657F] underline underline-offset-4">인증번호 다시 받기</button>
      </> : (
        <Btn size="xl" className="w-full" onClick={send} disabled={!!busy} data-testid="sms-send">{busy || (move ? "문자 인증하고 이 휴대폰으로 바꾸기" : "인증번호 받기")}</Btn>
      )}
      {err && <div role="alert" data-testid="sms-error" className="rounded-2xl bg-[#F5F8FD] ring-1 ring-inset ring-[#C7D3E8] px-4 py-3 text-[15px] font-bold text-[#0F1A30] flex gap-2"><HI name="alert" size={18} className="shrink-0 mt-0.5 text-[#2D4C82]" />{err}</div>}
      {onCancel && <button type="button" onClick={onCancel} className="w-full h-11 text-[15px] font-semibold text-[#55657F]" data-testid="device-cancel">취소</button>}
      <div ref={box} />
    </div>
  );
}

// QR(이 주소를 휴대폰 카메라로) — qrcode-generator로 그린 SVG
export function QrSvg({ text, size = 200 }) {
  const svg = (() => {
    try { const q = qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch { return ""; }
  })();
  return <div style={{ width: size, height: size }} className="bg-white rounded-2xl p-2 [&>svg]:w-full [&>svg]:h-full" data-testid="pc-qr" dangerouslySetInnerHTML={{ __html: svg }} />;
}
// 차주 화면은 휴대폰에서만 — PC로 들어오면 이 화면(휴대폰으로 열 QR)
export function DriverPcBlock({ onLogout, inline = false }) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/login?role=driver` : "";
  const body = (
    <div className="flex flex-col items-center text-center gap-4" data-testid="driver-pc-block">
      <span className="w-14 h-14 rounded-2xl bg-[#EAF0FA] text-[#1B2B4B] inline-flex items-center justify-center"><HI name="phone" size={26} /></span>
      <div className="text-[22px] font-extrabold text-[#0F1A30] tracking-[-0.02em]">차주 화면은 휴대폰에서만 쓸 수 있어요</div>
      <div className="text-[15px] text-[#55657F] leading-relaxed">휴대폰 카메라로 아래 QR을 찍어 열어 주세요.<br />화주, 운송사 화면은 PC에서도 쓸 수 있어요.</div>
      <div className="ring-1 ring-inset ring-[#E2E7EF] rounded-2xl p-2"><QrSvg text={url} /></div>
      <div className="text-[14px] font-bold text-[#2D4C82] break-all">{url}</div>
      {onLogout && <Btn kind="ghost" onClick={onLogout} data-testid="pc-block-logout">로그아웃</Btn>}
    </div>
  );
  if (inline) return body;
  return (
    <div className="min-h-screen bg-[#EEF1F6] flex flex-col">
      <style>{HUB_CSS}</style>
      <div className="px-6 py-5 text-white" style={NAVY_BG}><HubMark size={36} /></div>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-[26px] shadow-[0_24px_60px_rgba(15,26,48,.12)] ring-1 ring-inset ring-[#E2E7EF] p-8 max-w-[460px] w-full">{body}</div>
      </div>
    </div>
  );
}
