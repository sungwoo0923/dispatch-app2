// src/DriverAppGuide.jsx
// ⭐ 2026-11-06 기사앱 안내 보내기 — 지입·직영·임대 기사님에게 기사앱 설치·로그인·사용 안내를 보낸다
//  · DriverGuidePage: 공개 페이지 /driver-guide — 안내 그림(public/guide/driver-*.jpg)을 크게, 휴대폰에 맞게
//    한 개의 짧은 주소로 설치(안드로이드·아이폰) · 로그인 · 메뉴 설명 · 오더 받기/취소까지 모두 본다
//  · DriverGuideSendModal: 기사관리 / 지입차관리 › 기사 등록 관리의 [앱 안내 보내기]
//    문자 보내기(sms: 링크) · 카카오톡 공유(휴대폰 공유창) · 복사 — 보내면 기사 문서에 "안내 보냄" 시각을 남긴다
import React from "react";
import { createPortal } from "react-dom";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "./firebase";

export const SITE = "https://app.logisweb.co.kr";
export const APK_URL = "https://github.com/sungwoo0923/dispatch-app2/releases/download/driver-apk-latest/LogisWeb-Driver.apk";
export const IPHONE_URL = `${SITE}/driver-login`;
export const GUIDE_URL = `${SITE}/driver-guide`;

export const GUIDE_SECTIONS = [
  { id: "android", title: "기사앱 설치 · 안드로이드(갤럭시)", img: "/guide/driver-install-android.jpg" },
  { id: "iphone", title: "기사앱 설치 · 아이폰", img: "/guide/driver-install-iphone.jpg" },
  { id: "login-android", title: "로그인 · 안드로이드", img: "/guide/driver-login-android.jpg" },
  { id: "login-iphone", title: "로그인 · 아이폰", img: "/guide/driver-login-iphone.jpg" },
  { id: "menu", title: "기사앱 메뉴 설명", img: "/guide/driver-menu.jpg" },
  { id: "orders", title: "오더 받기 · 취소", img: "/guide/driver-orders.jpg" },
];

const FLEET = ["지입", "직영", "임대"];
export const isFleetGrade = (g) => FLEET.includes(String(g || "").trim());
const digits = (p) => String(p || "").replace(/\D/g, "");
const isIOS = () => { try { return /iPhone|iPad|iPod/i.test(navigator.userAgent); } catch { return false; } };
const isPhone = () => { try { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); } catch { return false; } };

export function buildGuideMessage({ company = "", name = "" } = {}) {
  const co = String(company || "").trim() || "운송사";
  const who = String(name || "").trim();
  return [
    `[${co}] 기사앱 설치 안내`,
    "",
    `안녕하세요${who ? `, ${who} 기사님` : ", 기사님"}. ${co}입니다.`,
    "배차 받기·운행 보고를 위해 기사앱을 설치해 주세요.",
    "",
    "▶ 설치·로그인·사용법 그림 안내(한 번에 보기)",
    GUIDE_URL,
    "",
    "▶ 안드로이드(갤럭시) 앱 받기",
    APK_URL,
    `  설치 그림: ${GUIDE_URL}#android`,
    "",
    "▶ 아이폰은 아래 주소로 접속 → 공유 → '홈 화면에 추가'",
    IPHONE_URL,
    `  설치 그림: ${GUIDE_URL}#iphone`,
    "",
    `가입할 때 회사명은 "${co}"로 입력해 주세요.`,
    "승인되면 차량번호로 로그인됩니다.",
  ].join("\n");
}

export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch { /* 아래로 */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}
export function smsHref(phone, body) {
  const n = digits(phone);
  return `sms:${n}${isIOS() ? "&" : "?"}body=${encodeURIComponent(body)}`;
}

// 기사 문서에 "안내 보냄" 기록
export async function markGuideSent(ids, how) {
  const by = (() => { try { return localStorage.getItem("userName") || auth.currentUser?.email || ""; } catch { return ""; } })();
  await Promise.all((ids || []).filter(Boolean).map((id) => updateDoc(doc(db, "drivers", id), { 앱안내보냄At: serverTimestamp(), 앱안내보냄방법: how, 앱안내보냄By: by }).catch(() => {})));
}
export function guideSentLabel(d) {
  const t = d?.앱안내보냄At;
  const ms = t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : typeof t === "number" ? t : 0;
  if (!ms) return "";
  const k = new Date(ms + 9 * 3600e3).toISOString();
  return `${k.slice(5, 7)}/${k.slice(8, 10)} ${k.slice(11, 16)}${d.앱안내보냄방법 ? ` · ${d.앱안내보냄방법}` : ""}`;
}

// 작은 [앱 안내] 버튼 공용 스타일
export const GUIDE_BTN = "h-11 px-4 rounded-[13px] bg-white border border-[#2D4C82] text-[#1B2B4B] text-[14px] font-black hover:bg-[#EEF3FC] transition whitespace-nowrap";

// ── [앱 안내 보내기] 창 ──
//  drivers: [{ id, 이름, 전화번호, 차량번호, 등급, 앱안내보냄At }]
export function DriverGuideSendModal({ drivers = [], company = "", onClose }) {
  const list = drivers.filter(Boolean);
  const single = list.length === 1;
  const [text, setText] = React.useState(() => buildGuideMessage({ company, name: single ? (list[0].이름 || "") : "" }));
  const [done, setDone] = React.useState({}); // id → true(문자 연 기사)
  const [toast, setToast] = React.useState("");
  const show = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };
  const textFor = (d) => (single ? text : text.replace(/안녕하세요, 기사님\./, `안녕하세요, ${d.이름 || ""} 기사님.`));
  const withPhone = list.filter((d) => digits(d.전화번호).length >= 9);
  const next = withPhone.find((d) => !done[d.id]);

  const sendSms = async (d) => {
    if (!d || digits(d.전화번호).length < 9) { show("전화번호가 없는 기사님입니다"); return; }
    window.location.href = smsHref(d.전화번호, textFor(d));
    setDone((p) => ({ ...p, [d.id]: true }));
    await markGuideSent([d.id], "문자");
  };
  const share = async () => {
    const t = single ? text : text;
    if (navigator.share && isPhone()) {
      try {
        await navigator.share({ title: "기사앱 설치 안내", text: t });
        await markGuideSent(list.map((d) => d.id), "카카오톡");
        show("공유했습니다");
        return;
      } catch (e) { if (e && e.name === "AbortError") return; }
    }
    const ok = await copyText(t);
    if (ok) { await markGuideSent(list.map((d) => d.id), "카카오톡"); show("복사했습니다 · 카카오톡 대화창에 붙여넣어 보내 주세요"); }
    else show("복사하지 못했습니다 · 글을 길게 눌러 직접 복사해 주세요");
  };
  const copy = async () => {
    const ok = await copyText(text);
    if (ok) { await markGuideSent(list.map((d) => d.id), "복사"); show("안내 문구를 복사했습니다"); } else show("복사하지 못했습니다");
  };
  const copyPhones = async () => {
    const ok = await copyText(withPhone.map((d) => digits(d.전화번호)).join(","));
    show(ok ? `전화번호 ${withPhone.length}개를 복사했습니다` : "복사하지 못했습니다");
  };

  return createPortal(
    <div className="fixed inset-0 z-[100005] bg-[#0B1428]/55 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-[600px] max-h-[94vh] bg-[#F3F6FA] rounded-t-[22px] sm:rounded-[22px] shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 text-white flex items-start gap-3" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-extrabold tracking-[0.14em] text-[#8FB0F0]">DRIVER APP GUIDE</div>
            <div className="text-[19px] font-black mt-0.5">기사앱 안내 보내기</div>
            <div className="text-[14px] text-white/80 mt-0.5 break-words">{single ? `${list[0].이름 || "-"} · ${list[0].차량번호 || "-"} · ${list[0].전화번호 || "번호 없음"}` : `선택한 기사님 ${list.length}명 (번호 있는 분 ${withPhone.length}명)`}</div>
          </div>
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black shrink-0">닫기</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="rounded-2xl bg-white border border-[#E3E8F0] p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[15px] font-black text-[#0F1A30]">보낼 안내 문구</span>
              <span className="text-[14px] text-[#5B6B85]">고쳐서 보낼 수 있습니다</span>
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9}
              className="w-full rounded-xl border border-[#DCE3EE] bg-[#F8FAFD] px-3 py-2.5 text-[14px] leading-relaxed text-[#0F1A30] outline-none focus:border-[#2D4C82]" />
            <a href="/driver-guide" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center h-9 px-3 rounded-lg bg-[#EEF3FC] text-[#1B2B4B] text-[14px] font-black">안내 그림 페이지 미리보기 ↗</a>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => (single ? sendSms(list[0]) : sendSms(next))} disabled={!withPhone.length || (!single && !next)}
              className="h-14 rounded-2xl text-white text-[15px] font-black disabled:opacity-40" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>
              {single ? "문자 보내기" : next ? `문자 ${Object.keys(done).length + 1}/${withPhone.length}` : "문자 완료"}
            </button>
            <button type="button" onClick={share} className="h-14 rounded-2xl bg-[#FEE500] text-[#191919] text-[15px] font-black">카카오톡 공유</button>
            <button type="button" onClick={copy} className="h-14 rounded-2xl bg-white border border-[#DCE3EE] text-[#0F1A30] text-[15px] font-black">복사</button>
          </div>
          <div className="text-[14px] text-[#5B6B85] leading-relaxed">
            {single ? "문자 보내기를 누르면 휴대폰 문자 앱이 이 기사님 번호와 안내 문구로 열립니다. PC에서는 [복사] 후 문자·카카오톡에 붙여넣어 주세요."
              : "문자는 한 분씩 차례로 열립니다(보내고 돌아와서 다시 누르면 다음 기사님). 카카오톡은 공유창에서 대화방을 고르면 됩니다."}
          </div>

          {!single && (
            <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden">
              <div className="px-3 py-2.5 flex items-center gap-2 border-b border-[#EEF1F6]">
                <span className="text-[15px] font-black text-[#0F1A30]">받는 기사님</span>
                <button type="button" onClick={copyPhones} disabled={!withPhone.length} className="ml-auto h-9 px-3 rounded-lg border border-[#DCE3EE] text-[14px] font-black text-[#1B2B4B] disabled:opacity-40">번호 전체 복사</button>
              </div>
              <div className="max-h-[260px] overflow-y-auto divide-y divide-[#EEF1F6]">
                {list.map((d) => {
                  const ok = digits(d.전화번호).length >= 9;
                  const sent = guideSentLabel(d);
                  return (
                    <div key={d.id} className="px-3 py-2.5 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-black text-[#0F1A30] break-words">{d.이름 || "-"} <span className="text-[14px] font-bold text-[#5B6B85]">{d.차량번호 || ""}</span>{d.등급 && <span className="ml-1.5 text-[14px] font-black text-[#2D4C82]">{d.등급}</span>}</div>
                        <div className="text-[14px] text-[#5B6B85]">{ok ? d.전화번호 : "전화번호 없음"}{sent ? ` · 지난 안내 ${sent}` : ""}</div>
                      </div>
                      {done[d.id] ? <span className="text-[14px] font-black text-[#2D4C82]">문자 열었음</span>
                        : <button type="button" disabled={!ok} onClick={() => sendSms(d)} className="h-10 px-3.5 rounded-lg bg-[#1B2B4B] text-white text-[14px] font-black disabled:opacity-30">문자</button>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {single && guideSentLabel(list[0]) && <div className="text-[14px] font-bold text-[#2D4C82]">지난 안내: {guideSentLabel(list[0])}</div>}
        </div>
        {toast && <div className="fixed left-1/2 -translate-x-1/2 bottom-8 z-[100006] px-4 py-2.5 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black shadow-xl max-w-[90vw] text-center">{toast}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ── 공개 페이지 /driver-guide — 로그인 없이 누구나 ──
export function DriverGuidePage() {
  React.useEffect(() => {
    const prev = document.title;
    document.title = "기사앱 설치·사용 안내 | LogisWeb";
    const h = decodeURIComponent((window.location.hash || "").slice(1));
    if (h) setTimeout(() => { const el = document.getElementById(`g-${h}`); if (el) el.scrollIntoView({ block: "start" }); }, 300);
    return () => { document.title = prev; };
  }, []);
  const co = (() => { try { return new URLSearchParams(window.location.search).get("co") || ""; } catch { return ""; } })();
  const android = (() => { try { return /Android/i.test(navigator.userAgent); } catch { return false; } })();
  const ios = isIOS();
  const btn = "flex items-center justify-center h-14 rounded-2xl text-[16px] font-black";
  return (
    <div className="min-h-screen bg-[#EEF2F8] text-[#0F1A30]" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕',sans-serif" }}>
      <div className="max-w-[720px] mx-auto pb-16">
        <header className="px-5 pt-7 pb-6 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 65%,#2D4C82)" }}>
          <div className="text-[13px] font-extrabold tracking-[0.2em] text-[#8FB0F0]">LOGISWEB · DRIVER APP</div>
          <h1 className="text-[24px] font-black mt-1 leading-tight">{co ? `${co} ` : ""}기사앱 설치·사용 안내</h1>
          <p className="text-[15px] text-white/80 mt-1.5 leading-relaxed">아래 순서대로 따라 하시면 됩니다. 그림을 누르면 크게 볼 수 있어요.</p>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <a href={APK_URL} className={`${btn} bg-white text-[#0F1A30] ${android ? "ring-4 ring-[#8FB0F0]" : ""}`}>안드로이드 앱 받기</a>
            <a href={IPHONE_URL} className={`${btn} bg-white/10 border border-white/30 text-white ${ios ? "ring-4 ring-[#8FB0F0]" : ""}`}>아이폰으로 접속</a>
          </div>
        </header>
        <nav className="px-4 py-3 flex flex-wrap gap-2 bg-white border-b border-[#E3E8F0]">
          {GUIDE_SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`g-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); try { history.replaceState(null, "", `#${s.id}`); } catch { /* 무시 */ } }}
              className="h-10 px-3.5 inline-flex items-center rounded-xl bg-[#EEF3FC] text-[#1B2B4B] text-[14px] font-black">{s.title.replace("기사앱 ", "")}</a>
          ))}
        </nav>
        {GUIDE_SECTIONS.map((s, i) => (
          <section key={s.id} id={`g-${s.id}`} className="px-3 pt-6 scroll-mt-2">
            <h2 className="px-1 mb-2 flex items-center gap-2 text-[18px] font-black">
              <span className="w-8 h-8 rounded-lg bg-[#1B2B4B] text-white grid place-items-center text-[15px]">{i + 1}</span>{s.title}
            </h2>
            <a href={s.img} target="_blank" rel="noreferrer" className="block rounded-2xl overflow-hidden bg-white border border-[#E3E8F0] shadow-sm">
              <img src={s.img} alt={s.title} loading={i < 2 ? "eager" : "lazy"} className="w-full h-auto block" />
            </a>
          </section>
        ))}
        <footer className="px-5 pt-8 text-center text-[14px] text-[#5B6B85] leading-relaxed">
          설치가 어려우면 배차 담당자에게 전화 주세요.<br />알림·위치 권한은 꼭 "허용"을 눌러 주세요.
        </footer>
      </div>
    </div>
  );
}
export default DriverGuidePage;
