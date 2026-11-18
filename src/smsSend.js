// ======================= src/smsSend.js =======================
// 💬 2026-11-10 PC 문자 보내기 — 회사 설정(회사정보 › 문자 보내기)에 따라
//   · phone(휴대폰과 연결)  지금처럼 sms: 주소 → PC에 연결된 휴대폰이 보낸다(무료 · 기사님께 내 휴대폰 번호로)
//   · popbill(회사 번호 문자) 서버(smsSend)가 팝빌로 회사 번호에서 보낸다(사용한 만큼 월말 로지스웹 청구)
//   · auto(자동)            팝빌이 연결돼 있으면 회사 번호로, 아니면 휴대폰과 연결로
//   · qr(QR로 내 폰에서)     📱 2026-11-18 PC에 QR → 업무폰 카메라로 찍으면 문자 앱이 내용까지 채워 열린다(설치 없음 · 무료)
//  '휴대폰과 연결' · 'QR로 내 폰에서'는 보낼 때마다 고른다(지난번 고른 것을 이 PC에 기억해 먼저 골라 둔다 — Enter면 그대로)
//  모바일 앱은 휴대폰에서 바로 보내므로 지금처럼 sms: 를 쓴다(이 파일은 PC 화면만).
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { pdCall } from "./publicDataMain";
import { kpConfirm, kpAlert } from "./kpDialog";

const digits = (v) => String(v ?? "").replace(/[^\d]/g, "");
export const SMS_MODES = [
  ["phone", "휴대폰과 연결", "PC에 연결된 휴대폰으로 · 무료"],
  ["popbill", "회사 번호 문자", "팝빌로 회사 번호에서 · 사용한 만큼 월말 청구"],
  ["qr", "QR로 내 폰에서", "PC에 뜬 QR을 업무폰 카메라로 찍어 내 번호로 · 무료(보낼 때 처음에 QR이 골라져 있음)"],
  ["auto", "자동", "팝빌이 연결돼 있으면 회사 번호, 아니면 휴대폰과 연결"],
];
// 이 PC에서 '휴대폰으로' 보낼 때 쓰는 길 — "phone"(휴대폰과 연결) · "qr"(QR로 내 폰에서) · ""(아직 안 고름)
const PC_WAY_KEY = "kpSmsPcWay";
export const getPcSmsWay = () => { try { const v = localStorage.getItem(PC_WAY_KEY) || ""; return v === "phone" || v === "qr" ? v : ""; } catch { return ""; } };
export const setPcSmsWay = (v) => { try { if (v === "phone" || v === "qr") localStorage.setItem(PC_WAY_KEY, v); else localStorage.removeItem(PC_WAY_KEY); } catch { /* 무시 */ } };
export const smsBytes = (s) => [...String(s || "")].reduce((a, ch) => a + (ch.charCodeAt(0) > 127 ? 2 : 1), 0);

// 회사 설정 구독(한 번만) — popbillSettings/{회사}.sms
let _co = ""; let _unsub = null; let _set = { mode: "phone", senderNumber: "" };
export function watchSmsSettings(co) {
  const c = String(co || "").trim();
  if (!c || c === _co) return;
  _co = c; if (_unsub) _unsub();
  try {
    _unsub = onSnapshot(doc(db, "popbillSettings", c), (s) => {
      const d = s.exists() ? s.data() || {} : {};
      const m = d.sms?.mode;
      _set = { mode: ["phone", "popbill", "auto", "qr"].includes(m) ? m : "phone", senderNumber: digits(d.sms?.senderNumber || d.alimtalk?.senderNumber || "") };
    }, () => {});
  } catch { /* 무시 */ }
}
export const smsSettingsNow = () => _set;

const openSms = (phones, body) => { window.location.href = `sms:${phones.join(",")}?body=${encodeURIComponent(body || "")}`; };
// 휴대폰으로 보내기 — 보낼 때마다 '휴대폰과 연결 / QR로 내 폰에서'를 고른다(이 PC가 지난번 고른 것이 먼저 · 처음엔 회사 설정)
async function openPhone(list, body, companyMode) {
  const { chooseSmsWay, openSmsQr } = await import("./SmsQrModal");
  const way = await chooseSmsWay(list, getPcSmsWay() || (companyMode === "qr" ? "qr" : "phone"));
  if (!way) return "cancel";
  setPcSmsWay(way);
  if (way === "qr") {
    const r = await openSmsQr(list, body);
    if (r === "phone") { setPcSmsWay("phone"); openSms(list.map((x) => x.phone), body); }
    return "phone";
  }
  openSms(list.map((x) => x.phone), body);
  return "phone";
}

/**
 * 문자 보내기 — phones: 번호 배열(또는 { phone, name } 배열) · body: 내용
 * @returns {Promise<"phone"|"sent"|"partial"|"failed"|"cancel">}
 */
const myCompany = () => { try { return localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || ""; } catch { return ""; } };
export async function sendText({ company, phones, body, title = "문자 보내기" }) {
  watchSmsSettings(company || myCompany());
  const list = [];
  const seen = new Set();
  (phones || []).forEach((p) => { const o = typeof p === "object" ? p : { phone: p }; const n = digits(o.phone); if (n && !seen.has(n)) { seen.add(n); list.push({ phone: n, name: o.name || "" }); } });
  if (!list.length) { await kpAlert("전화번호가 없습니다."); return "cancel"; }
  const mode = _set.mode;
  if (mode === "phone" || mode === "qr") return openPhone(list, body, mode);
  const kind = smsBytes(body) > 90 ? "장문(LMS)" : "단문(SMS)";
  const sender = _set.senderNumber ? _set.senderNumber.replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, "$1-$2-$3") : "회사 번호";
  const go = await kpConfirm(`${list.length}명에게 ${kind}를 보낼까요?\n보내는 번호: ${sender}\n\n${String(body || "").slice(0, 160)}${String(body || "").length > 160 ? "…" : ""}\n\n※ 보낸 건수만큼 월말에 로지스웹이 청구합니다`, { title, okText: "보내기" });
  if (!go) return "cancel";
  let r = null;
  try { r = await pdCall("smsSend", { to: list, content: body }, 120000); } catch (e) {
    if (mode === "auto") return openPhone(list, body, mode);
    await kpAlert(`문자를 보내지 못했어요\n${e?.message || e}`); return "failed";
  }
  if (r?.status === "off") {
    if (mode === "auto") return openPhone(list, body, mode);
    await kpAlert(`${r.reason || "팝빌 연결 전이에요"}\n회사정보 › 문자 보내기에서 '휴대폰과 연결'로 바꾸면 지금처럼 보낼 수 있어요.`); return "failed";
  }
  if (r?.status === "sent") await kpAlert(`${r.sent}명에게 보냈습니다`, { title: "문자 보냄" });
  else await kpAlert(`${r?.sent || 0}명 보냄 · ${r?.failed || 0}명 실패\n${(r?.items || []).filter((x) => !x.ok).slice(0, 5).map((x) => `${x.to} ${x.error}`).join("\n")}`, { title: "문자 결과" });
  return r?.status || "failed";
}

// 이번 달 사용량 · 단가(회사정보 화면)
export const smsInfo = (month) => pdCall("smsInfo", month ? { month } : {}, 30000);
