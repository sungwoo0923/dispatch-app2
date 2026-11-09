// ======================= src/DriverApproveModal.jsx =======================
// ⭐ 2026-11-05 기사 가입 승인 창 — 기사앱 계정 › 가입 승인에서 [승인]/[거절]을 누르면 뜨는 프로그램 창(PC 가운데 · 휴대폰 전체 화면)
//  · 기사가 입력한 정보 전부(이름·연락처·차량·거주지·정산계좌·사업자·사업자등록증·입사일·요청사항·신청일)를 보여 준다
//  · 가입유형(지입·직영·임대) = 기사관리 등급(drivers.등급) — 승인하면 그 등급으로 기사관리·지입차관리에 바로 들어간다
//  · 기사관리에 같은 기사(차량번호 같고 이름/연락처 같음, 또는 사무실이 같은 차량번호로 미리 등록)가 있으면
//    새로 만들지 않고 그 기사 정보에 앱 계정을 연동한다 — 서버 linkDriverSignup(가입 자동 연결)과 같은 방식:
//    기존 문서 내용을 drivers/{기사 uid}로 옮기고(기존 값 유지 · 빈 칸만 채움 · 등급 지정) 예전 문서는 지운다
//  · 후보가 여러 개면 관리자가 고르거나 「새로 등록」, 기존 값과 다른 입력값은 칸마다 「입력값으로 바꾸기」 선택
import React from "react";
import { createPortal } from "react-dom";
import { addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, where, writeBatch, deleteDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { fmtPhone } from "./formatInput";
import { CustomSelect } from "./CustomSelect"; // ⭐ 2026-11-10 가입유형·담당자 드롭다운

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
export const DRIVER_JOIN_TYPES = ["지입", "직영", "임대"]; // 기사관리 등급(일반·직영·지입·임대·블랙) 중 기사앱 가입 기사 구분
const nPlate = (v) => String(v || "").replace(/\s+/g, "").toUpperCase();
const nDigits = (v) => String(v || "").replace(/\D/g, "");
const nText = (v) => String(v || "").replace(/\s+/g, "");
const filled = (v) => {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
};
const tsText = (v) => {
  const ms = v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : v instanceof Date ? v.getTime() : typeof v === "string" ? Date.parse(v) : 0;
  if (!ms) return "";
  const d = new Date(ms + 9 * 3600e3).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 16)}`;
};
const acctText = (a) => (a && (a.acct || a.bank) ? [a.bank, a.acct, a.holder && `(${a.holder})`].filter(Boolean).join(" ") : "");
const bizNoText = (v) => { const d = nDigits(v); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d; };
const phoneText = (v) => (v ? fmtPhone(v) || v : "");

// 기사가 가입 때 입력한 값(users 문서 우선, 비면 가입 때 같이 만든 drivers/{uid} 문서)
export function enteredOf(u, signup) {
  const s = signup || {};
  return {
    이름: u.name || s.이름 || s.name || "",
    전화번호: u.phone || s.전화번호 || s.phone || "",
    차량번호: u.carNo || s.차량번호 || s.carNo || "",
    차량종류: u.차량종류 || s.차량종류 || "",
    차량톤수: u.차량톤수 || s.차량톤수 || "",
    거주지: u.거주지 || s.거주지 || "",
    요청사항: u.요청사항 || s.요청사항 || "",
    정산계좌: (u.정산계좌 && u.정산계좌.acct ? u.정산계좌 : null) || (s.정산계좌 && s.정산계좌.acct ? s.정산계좌 : null),
    사업자번호: u.사업자번호 || s.사업자번호 || "",
    사업자상호: u.사업자상호 || s.사업자상호 || "",
  };
}

// 비교·연동하는 칸 — pair: PC(한글)·기사앱(영문) 짝 필드, locked: 로그인 계정 값이라 항상 입력값
const FIELDS = [
  { key: "이름", label: "이름", pair: "name", norm: nText },
  { key: "전화번호", label: "연락처", pair: "phone", norm: nDigits, show: phoneText },
  { key: "차량번호", label: "차량번호", pair: "carNo", norm: nPlate, locked: true },
  { key: "차량종류", label: "차량종류", norm: nText },
  { key: "차량톤수", label: "톤수", norm: nText },
  { key: "거주지", label: "거주지", norm: nText },
  { key: "정산계좌", label: "정산계좌", norm: (a) => (a ? `${nText(a.bank)}|${nDigits(a.acct)}` : ""), show: acctText },
  { key: "사업자번호", label: "사업자번호", norm: nDigits, show: bizNoText },
  { key: "사업자상호", label: "상호", norm: nText },
];
const existingVal = (x, f) => {
  if (f.key === "정산계좌") return x?.정산계좌 && filled(x.정산계좌.acct) ? x.정산계좌 : ""; // 빈 계좌 객체는 없는 것으로
  return filled(x?.[f.key]) ? x[f.key] : f.pair && filled(x?.[f.pair]) ? x[f.pair] : "";
};

// 기사관리(drivers)에서 이 가입자와 같은 기사 후보 찾기 — 점수 높은 순
//  · 차량번호 같음(+연락처·이름 같으면 점수↑) → 연동 추천
//  · 차량번호는 다르지만 이름·연락처 둘 다 같음(차를 바꾼 기사) → 후보로만 보여 줌(기본 선택 안 함)
//  · 이미 다른 기사앱 계정과 연결된 문서(uid가 다른 사람)는 제외
export function findDriverCandidates(u, signup, drivers) {
  const me = enteredOf(u, signup);
  const plate = nPlate(me.차량번호); const ph = nDigits(me.전화번호); const nm = nText(me.이름);
  return (drivers || [])
    .filter((d) => d.id !== u.id && !(d.data?.uid && d.data.uid !== u.id))
    .map((d) => {
      const x = d.data || {};
      const samePlate = !!plate && nPlate(x.차량번호 || x.carNo) === plate;
      const samePhone = ph.length >= 9 && nDigits(x.전화번호 || x.phone) === ph;
      const sameName = !!nm && nText(x.이름 || x.name) === nm;
      if (!samePlate && !(samePhone && sameName)) return null;
      return { ...d, samePlate, samePhone, sameName, score: (samePlate ? 4 : 0) + (samePhone ? 2 : 0) + (sameName ? 1 : 0) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

const adminName = () => { const c = auth?.currentUser; return c?.displayName || c?.email || "관리자"; };
const STATUS_DEFAULTS = { mainStatus: "대기", subStatus: "대기", status: "대기", state: "대기", goStatus: "대기", active: false, totalDistance: 0 };

// 승인 — target(연동할 기존 기사 문서 {id, data}) 이 있으면 연동, 없으면 가입 문서를 그대로 기사관리에 등록
export async function approveDriverSignup({ u, signup, target, type, useInput = new Set(), company }) {
  const by = adminName();
  const me = enteredOf(u, signup);
  const now = serverTimestamp();
  const b = writeBatch(db);
  const drvRef = doc(db, "drivers", u.id);
  let merged = null;
  if (target) {
    const base = { ...(target.data || {}) };
    merged = { ...STATUS_DEFAULTS, ...(signup || {}), ...base };
    FIELDS.forEach((f) => {
      const v = me[f.key];
      if (!filled(v)) return;
      const cur = existingVal(base, f);
      if (!filled(cur) || f.locked || useInput.has(f.key)) { merged[f.key] = v; if (f.pair) merged[f.pair] = v; }
    });
    if (!filled(merged.요청사항) && filled(me.요청사항)) merged.요청사항 = me.요청사항;
    // 한글/영문 짝 필드는 비어 있는 쪽을 채운다(PC는 한글, 기사앱은 영문 필드를 읽음)
    FIELDS.filter((f) => f.pair).forEach((f) => {
      if (!filled(merged[f.key]) && filled(merged[f.pair])) merged[f.key] = merged[f.pair];
      if (!filled(merged[f.pair]) && filled(merged[f.key])) merged[f.pair] = merged[f.key];
    });
    if (filled(merged.차량종류) || filled(merged.차량톤수)) merged.vehicleType = `${merged.차량종류 || ""} ${merged.차량톤수 || ""}`.trim();
    const driverDoc = {
      ...merged,
      uid: u.id, companyName: company, approved: true, approvalRevoked: false, 등급: type,
      linkedFromDriverId: target.id, linkedAt: now, linkedBy: `가입 승인 연동 · ${by}`,
      approvedAt: now, approvedBy: by,
      createdAt: base.createdAt || signup?.createdAt || now, updatedAt: now,
    };
    if ("id" in base) driverDoc.id = u.id; // {id: 문서이름, ...data}로 읽는 화면이 예전 이름을 쓰지 않게
    b.set(drvRef, driverDoc);
    b.delete(doc(db, "drivers", target.id));
  } else if (signup) {
    b.set(drvRef, { approved: true, approvalRevoked: false, 등급: type, approvedAt: now, approvedBy: by, updatedAt: now }, { merge: true });
  } else {
    // 가입 때 기사 문서가 안 만들어진 경우(중간 실패 등) — 입력값으로 새로 만든다
    b.set(drvRef, {
      ...STATUS_DEFAULTS, uid: u.id, companyName: company,
      이름: me.이름, name: me.이름, 차량번호: me.차량번호, carNo: me.차량번호, 전화번호: me.전화번호, phone: me.전화번호,
      차량종류: me.차량종류, 차량톤수: me.차량톤수, vehicleType: u.vehicleType || `${me.차량종류} ${me.차량톤수}`.trim(),
      거주지: me.거주지, 요청사항: me.요청사항, 정산계좌: me.정산계좌 || null, 사업자번호: me.사업자번호, 사업자상호: me.사업자상호,
      approved: true, 등급: type, approvedAt: now, approvedBy: by, createdAt: u.createdAt || now, updatedAt: now,
    }, { merge: true });
  }
  // users — 승인 + 가입유형. 연동이면 기사관리 값으로 맞춘다
  //  (이름·차량번호는 기사앱 로그인 확인 값이라 그대로 · 입사일도 손대지 않음)
  const userPatch = { approved: true, driverType: type, approvedAt: now, approvedBy: by };
  if (merged) {
    Object.assign(userPatch, {
      phone: merged.전화번호 || u.phone || "",
      차량종류: merged.차량종류 || "", 차량톤수: merged.차량톤수 || "", vehicleType: merged.vehicleType || u.vehicleType || "",
      거주지: merged.거주지 || "", 정산계좌: filled(merged.정산계좌) ? merged.정산계좌 : null,
      사업자번호: merged.사업자번호 || "", 사업자상호: merged.사업자상호 || "",
      linkedFromDriverId: target.id,
    });
  }
  b.set(doc(db, "users", u.id), userPatch, { merge: true });
  await b.commit();
  if (target) {
    // PC에서 예전 문서 이름으로 올려 둔 기사 서류도 새 문서로 옮긴다
    const ds = await getDocs(query(collection(db, "driver_documents"), where("driverId", "==", target.id))).catch(() => null);
    for (const d of ds?.docs || []) await setDoc(doc(db, "driver_documents", d.id), { driverId: u.id }, { merge: true }).catch(() => {});
  }
  await addDoc(collection(db, "driverSignupLogs"), {
    companyName: company, kind: target ? "link" : "approve", uid: u.id, name: me.이름, carNo: me.차량번호, phone: me.전화번호,
    type, linkedFrom: target?.id || "", by, at: now,
  }).catch(() => {});
}

// 거절 — 처리 기록(사유)을 남기고 가입 신청(users·가입 때 만든 drivers/{uid})을 지운다(로그인 계정은 서버가 정리)
export async function rejectDriverSignup({ u, signup, reason, company }) {
  const by = adminName();
  const me = enteredOf(u, signup);
  await addDoc(collection(db, "driverSignupLogs"), {
    companyName: company, kind: "reject", uid: u.id, name: me.이름, carNo: me.차량번호, phone: me.전화번호,
    reason: String(reason || "").trim().slice(0, 500), by, at: serverTimestamp(),
  }).catch(() => {});
  await deleteDoc(doc(db, "users", u.id));
  if (!signup || !signup.uid || signup.uid === u.id) await deleteDoc(doc(db, "drivers", u.id)).catch(() => {});
}

function Info({ k, v, mono, wide }) {
  return (
    <div className={`min-w-0 rounded-xl bg-[#F6F8FC] border border-[#E6EBF3] px-3 py-2 ${wide ? "col-span-2" : ""}`}>
      <div className="text-[11.5px] font-bold text-[#7A879C]">{k}</div>
      <div className={`text-[14.5px] font-black text-[#0F1A30] ${wide ? "whitespace-pre-wrap break-words" : "truncate"}`} style={mono ? { fontFamily: MONO, fontVariantNumeric: "tabular-nums" } : undefined}>{filled(v) ? v : <span className="text-[#B4BFD0] font-bold">미입력</span>}</div>
    </div>
  );
}
const ReasonChip = ({ on, children }) => <span className={`px-1.5 h-[20px] inline-flex items-center rounded-md text-[11px] font-black ${on ? "bg-[#E7F0FF] text-[#2D4C82]" : "bg-[#FFF1E6] text-[#B54708]"}`}>{children}</span>;

export default function DriverApproveModal({ u, signup, candidates = [], bizDoc, company, staff = [], startReject = false, onClose, onDone }) {
  const me = enteredOf(u, signup);
  const first = candidates.find((c) => c.samePlate);
  const [pick, setPick] = React.useState(first ? first.id : "new"); // 연동할 문서 id 또는 "new"
  const target = candidates.find((c) => c.id === pick) || null;
  // ⭐ 2026-11-10 승인할 때 배차담당자(drivers.담당자 — 지입차관리와 같은 칸)도 같이 정한다
  const [mgr, setMgr] = React.useState("__none");
  React.useEffect(() => { const m = target?.data?.담당자?.uid; setMgr(m || "__none"); }, [target?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const tGrade = String(target?.data?.등급 || "").trim();
  const [type, setType] = React.useState(DRIVER_JOIN_TYPES.includes(tGrade) ? tGrade : DRIVER_JOIN_TYPES.includes(u.driverType) ? u.driverType : "지입");
  React.useEffect(() => { if (DRIVER_JOIN_TYPES.includes(tGrade)) setType(tGrade); }, [pick]); // eslint-disable-line react-hooks/exhaustive-deps
  const [useInput, setUseInput] = React.useState(() => new Set());
  React.useEffect(() => { setUseInput(new Set()); }, [pick]);
  const [rejecting, setRejecting] = React.useState(startReject);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [zoom, setZoom] = React.useState(false);
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) { e.stopPropagation(); if (zoom) setZoom(false); else onClose?.(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, zoom, onClose]);

  // 기존 값과 입력값이 다른 칸
  const conflicts = target ? FIELDS.map((f) => {
    const a = existingVal(target.data, f); const v = me[f.key];
    if (!filled(a) || !filled(v) || f.norm(a) === f.norm(v)) return null;
    return { f, old: (f.show || String)(a), neu: (f.show || String)(v) };
  }).filter(Boolean) : [];
  const fills = target ? FIELDS.filter((f) => !filled(existingVal(target.data, f)) && filled(me[f.key])).map((f) => f.label) : [];
  const bizImg = bizDoc && (bizDoc.dataUrl || bizDoc.url || bizDoc.fileUrl || bizDoc.downloadURL);

  const doApprove = async () => {
    setBusy(true); setErr("");
    try {
      await approveDriverSignup({ u, signup, target, type, useInput, company });
      const st = staff.find((x) => x.id === mgr);
      if (mgr !== "__none" || target?.data?.담당자) {
        await setDoc(doc(db, "drivers", u.id), { 담당자: st ? { uid: st.id, name: st.name || st.email || "" } : null }, { merge: true }).catch((e) => console.warn("담당자 지정 실패:", e?.code || e));
      }
      onDone?.({ kind: target ? "link" : "approve", type, target });
    }
    catch (e) { console.error(e); setErr(`승인하지 못했습니다 — ${e?.code === "permission-denied" ? "권한이 없습니다(관리자·인사·경리 계정으로 다시 시도해 주세요)" : e?.message || "잠시 후 다시 시도해 주세요"}`); }
    finally { setBusy(false); }
  };
  const doReject = async () => {
    setBusy(true); setErr("");
    try { await rejectDriverSignup({ u, signup, reason, company }); onDone?.({ kind: "reject" }); }
    catch (e) { console.error(e); setErr(`거절하지 못했습니다 — ${e?.message || "잠시 후 다시 시도해 주세요"}`); }
    finally { setBusy(false); }
  };

  const tx = target?.data || {};
  return createPortal(
    <div className="fixed inset-0 z-[2147482000] flex items-stretch md:items-center justify-center md:p-6 bg-[#0B1428]/60 backdrop-blur-[2px]" onClick={() => !busy && onClose?.()} data-testid="drv-approve-modal">
      <div className="relative w-full md:max-w-[920px] h-full md:h-auto md:max-h-[92vh] flex flex-col bg-white md:rounded-2xl overflow-hidden shadow-[0_30px_80px_rgba(11,20,40,0.45)]" onClick={(e) => e.stopPropagation()}>
        {/* 머리 */}
        <div className="shrink-0 px-5 md:px-6 pt-[calc(14px+env(safe-area-inset-top))] md:pt-5 pb-4 text-white" style={{ background: "linear-gradient(135deg,#0F1A30 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>DRIVER SIGNUP · 가입 승인</div>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className="text-[22px] font-black truncate">{me.이름 || "-"}</span>
                <span className="px-2.5 h-8 inline-flex items-center rounded-lg text-[16px] font-black tracking-[0.1em] text-[#E8F0FF]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", background: "rgba(10,18,34,.6)", boxShadow: "inset 0 0 0 1.5px rgba(143,176,240,.55)" }}>{me.차량번호 || "번호 없음"}</span>
              </div>
              <div className="mt-1 text-[12.5px] font-bold text-white/60">신청일 {tsText(u.createdAt) || "-"}</div>
            </div>
            <button type="button" disabled={busy} onClick={onClose} className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[18px] font-black shrink-0" aria-label="닫기">✕</button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="grid md:grid-cols-[1.15fr_1fr] gap-5 p-5 md:p-6">
            {/* 왼쪽 — 기사가 입력한 정보 */}
            <section className="min-w-0">
              <div className="text-[13px] font-black text-[#2D4C82] mb-2">기사가 입력한 정보</div>
              <div className="grid grid-cols-2 gap-2">
                <Info k="이름" v={me.이름} />
                <Info k="연락처" v={phoneText(me.전화번호)} mono />
                <Info k="차량번호" v={me.차량번호} mono />
                <Info k="차량종류 · 톤수" v={[me.차량종류, me.차량톤수].filter(Boolean).join(" ") || u.vehicleType} />
                <Info k="거주지" v={me.거주지 || u.address} />
                <Info k="입사일" v={u.hireDate} mono />
                <Info k="은행" v={me.정산계좌?.bank} />
                <Info k="예금주" v={me.정산계좌?.holder} />
                <Info k="계좌번호" v={me.정산계좌?.acct} mono wide />
                <Info k="사업자번호" v={bizNoText(me.사업자번호)} mono />
                <Info k="상호" v={me.사업자상호} />
                <Info k="요청사항" v={me.요청사항} wide />
              </div>
              <div className="mt-3 rounded-xl border border-[#E6EBF3] bg-[#F6F8FC] p-3 flex items-center gap-3">
                {bizImg ? (
                  <button type="button" onClick={() => setZoom(true)} className="shrink-0 w-[88px] h-[66px] rounded-lg overflow-hidden border border-[#DCE3EE] bg-white" title="크게 보기">
                    <img src={bizImg} alt="사업자등록증" className="w-full h-full object-cover" />
                  </button>
                ) : <div className="shrink-0 w-[88px] h-[66px] rounded-lg border-2 border-dashed border-[#DCE3EE] grid place-items-center text-[11px] font-bold text-[#B4BFD0]">없음</div>}
                <div className="min-w-0">
                  <div className="text-[13px] font-black text-[#0F1A30]">사업자등록증</div>
                  <div className="text-[12px] font-bold text-[#7A879C]">{bizImg ? "눌러서 크게 보기" : "가입 때 올린 사진이 없습니다"}</div>
                </div>
              </div>
              <div className="mt-2 text-[11.5px] font-bold text-[#9AA9C3]">약관 동의 {u.termsAgreed ? "✓" : "–"} · 개인정보 {u.privacyAgreed ? "✓" : "–"} · 위치(GPS) {u.gpsAgreed ? "✓" : "–"}</div>
            </section>

            {/* 오른쪽 — 연동 · 가입유형 */}
            <section className="min-w-0 flex flex-col gap-4">
              <div className={rejecting ? "hidden" : ""}>
                <div className="text-[13px] font-black text-[#2D4C82] mb-2">기사관리 연동</div>
                {candidates.length ? (
                  <>
                    {target && (
                      <div className="mb-2 rounded-2xl px-3.5 py-3 text-[13.5px] font-black text-[#0F1A30] bg-[#EAF1FF] border border-[#8FB0F0]" data-testid="drv-link-notice">
                        🔗 이미 등록된 기사 정보가 있어 연동합니다
                        <div className="mt-0.5 text-[12px] font-bold text-[#3A4A66]">새 기사를 만들지 않고 아래 기사에 앱 계정을 붙입니다 — 기존 값은 그대로, 빈 칸만 채웁니다</div>
                      </div>
                    )}
                    <div className="space-y-2">
                      {candidates.map((c) => {
                        const x = c.data || {};
                        const on = pick === c.id;
                        return (
                          <label key={c.id} className={`block rounded-2xl border-2 px-3.5 py-3 cursor-pointer transition ${on ? "border-[#2D4C82] bg-white shadow-[0_6px_18px_rgba(45,76,130,0.16)]" : "border-[#E3E8F0] bg-white hover:border-[#B9CBEA]"}`}>
                            <div className="flex items-center gap-2">
                              <input type="radio" name="drv-link" checked={on} onChange={() => setPick(c.id)} className="accent-[#2D4C82] w-4 h-4" />
                              <span className="text-[15px] font-black text-[#0F1A30] truncate">{x.이름 || x.name || "-"}</span>
                              <span className="text-[13px] font-black text-[#1B2B4B]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{x.차량번호 || x.carNo || "-"}</span>
                              {x.등급 && <span className={`ml-auto px-2 h-[22px] inline-flex items-center rounded-md text-[11.5px] font-black ${x.등급 === "블랙" ? "bg-[#FEE4E2] text-[#B42318]" : "bg-[#0F1A30] text-white"}`}>{x.등급}</span>}
                            </div>
                            <div className="mt-1 pl-6 text-[12.5px] font-bold text-[#5B6B85] truncate">{[phoneText(x.전화번호 || x.phone), [x.차량종류, x.차량톤수].filter(Boolean).join(" "), x.담당자?.name && `담당 ${x.담당자.name}`, x.등록자 && `등록 ${x.등록자}`, tsText(x.createdAt).slice(0, 10)].filter(Boolean).join(" · ") || "-"}</div>
                            <div className="mt-1.5 pl-6 flex gap-1 flex-wrap">
                              <ReasonChip on={c.samePlate}>{c.samePlate ? "차량번호 일치" : "차량번호 다름"}</ReasonChip>
                              {c.samePhone && <ReasonChip on>연락처 일치</ReasonChip>}
                              {c.sameName && <ReasonChip on>이름 일치</ReasonChip>}
                              {c.samePlate && !c.samePhone && !c.sameName && <ReasonChip>사무실 선등록 · 이름·연락처 다름</ReasonChip>}
                            </div>
                          </label>
                        );
                      })}
                      <label className={`flex items-center gap-2 rounded-2xl border-2 px-3.5 py-3 cursor-pointer ${pick === "new" ? "border-[#2D4C82] bg-white" : "border-[#E3E8F0] bg-white hover:border-[#B9CBEA]"}`}>
                        <input type="radio" name="drv-link" checked={pick === "new"} onChange={() => setPick("new")} className="accent-[#2D4C82] w-4 h-4" />
                        <span className="text-[14.5px] font-black text-[#0F1A30]">연동하지 않고 새로 등록</span>
                      </label>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-[#E3E8F0] bg-[#F6F8FC] px-3.5 py-3 text-[13px] font-bold text-[#5B6B85]">기사관리에 같은 차량번호·연락처 기사가 없습니다 — 새 기사로 등록됩니다</div>
                )}
                {target && tGrade === "블랙" && <div className="mt-2 rounded-xl bg-[#FEF3F2] border border-[#FDA29B] px-3 py-2 text-[12.5px] font-black text-[#B42318]">⚠ 이 기사는 기사관리에서 「블랙」 등급입니다. 승인하면 아래 가입유형으로 바뀝니다.</div>}
                {target && !target.samePlate && <div className="mt-2 rounded-xl bg-[#FFF8EC] border border-[#F5C98B] px-3 py-2 text-[12.5px] font-bold text-[#8A4B0A]">차량번호가 달라 기사관리 차량번호가 <b style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{me.차량번호}</b>(로그인 차량번호)로 바뀝니다.</div>}
                {conflicts.length > 0 && (
                  <div className="mt-3 rounded-2xl border border-[#F5C98B] bg-[#FFFBF3] p-3" data-testid="drv-conflicts">
                    <div className="text-[12.5px] font-black text-[#8A4B0A] mb-1.5">기존 정보와 다른 입력값 {conflicts.length}개 — 체크한 칸만 입력값으로 바꿉니다</div>
                    <div className="space-y-1.5">
                      {conflicts.map(({ f, old, neu }) => (
                        <label key={f.key} className={`flex items-start gap-2 rounded-xl bg-white border border-[#F1E2C6] px-2.5 py-2 ${f.locked ? "" : "cursor-pointer"}`}>
                          <input type="checkbox" disabled={f.locked} checked={f.locked || useInput.has(f.key)} onChange={(e) => setUseInput((s) => { const n = new Set(s); if (e.target.checked) n.add(f.key); else n.delete(f.key); return n; })} className="mt-0.5 accent-[#2D4C82] w-4 h-4" />
                          <div className="min-w-0 text-[12.5px] leading-snug">
                            <div className="font-black text-[#0F1A30]">{f.label}{f.locked && <span className="ml-1 text-[11px] text-[#2D4C82]">(로그인 값 · 항상 입력값)</span>}{f.key === "이름" && <span className="ml-1 text-[11px] text-[#7A879C]">(기사앱 로그인 이름은 입력값 그대로)</span>}</div>
                            <div className="font-bold text-[#7A879C] break-all">기존 <span className="text-[#3A4A66]">{old}</span> → 입력 <span className="text-[#2D4C82]">{neu}</span></div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {fills.length > 0 && <div className="mt-2 text-[12px] font-bold text-[#5B6B85]">빈 칸 채움: {fills.join(" · ")}</div>}
              </div>

              <div className={rejecting ? "hidden" : ""}>
                <div className="text-[13px] font-black text-[#2D4C82] mb-2">가입유형</div>
                <CustomSelect value={type} onChange={(e) => setType(e.target.value)} data-testid="drv-type" className="w-full h-12 px-3.5 rounded-xl border-2 border-[#DCE3EE] bg-white text-[15.5px] font-black text-[#0F1A30] outline-none focus:border-[#2D4C82]">
                  {DRIVER_JOIN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </CustomSelect>
                <div className="mt-1.5 text-[12px] font-bold text-[#7A879C]">승인하면 기사관리 「{type}」 기사로 들어가고 지입차관리에도 바로 보입니다</div>
                {/* ⭐ 2026-11-10 배차담당자 지정 */}
                <div className="text-[13px] font-black text-[#2D4C82] mb-2 mt-4">배차담당자</div>
                <CustomSelect value={mgr} onChange={(e) => setMgr(e.target.value)} data-testid="drv-mgr-pick" className="w-full h-12 px-3.5 rounded-xl border-2 border-[#DCE3EE] bg-white text-[15px] font-black text-[#0F1A30]">
                  <option value="__none">담당자 미지정(나중에 지정)</option>
                  {staff.map((x) => <option key={x.id} value={x.id}>{x.name || x.email}{x.position ? ` · ${x.position}` : ""}{x.team ? ` · ${x.team}` : ""}</option>)}
                </CustomSelect>
                <div className="mt-1.5 text-[12px] font-bold text-[#7A879C]">지입차관리 · 승인된 기사 카드에서도 언제든 바꿀 수 있습니다</div>
              </div>

              {rejecting && (
                <div className="rounded-2xl border border-[#FDA29B] bg-[#FEF6F5] p-3">
                  <div className="text-[13px] font-black text-[#B42318] mb-1.5">거절 사유 (선택)</div>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} autoFocus placeholder="예) 소속 확인 불가 · 차량번호 오입력 — 다시 가입해 주세요" className="w-full px-3 py-2 rounded-xl border border-[#F4C7C3] bg-white text-[14px] outline-none focus:border-[#B42318] resize-none" />
                  <div className="mt-1 text-[11.5px] font-bold text-[#B42318]/80">거절하면 가입 신청과 기사앱 계정이 삭제됩니다(기사는 다시 가입할 수 있어요). 사유는 처리 기록에 남습니다.</div>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* 아래 버튼 */}
        <div className="shrink-0 border-t border-[#EEF1F6] bg-white px-5 md:px-6 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] md:pb-4">
          {err && <div className="mb-2 rounded-xl bg-[#FEF3F2] px-3 py-2 text-[12.5px] font-black text-[#B42318]">{err}</div>}
          {rejecting ? (
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => setRejecting(false)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] text-[15px] font-black text-[#5B6B85]">취소</button>
              <button type="button" disabled={busy} onClick={doReject} data-testid="drv-reject-confirm" className="flex-1 h-12 rounded-xl bg-[#B42318] text-white text-[15.5px] font-black disabled:opacity-50">{busy ? "처리 중…" : "거절 확정"}</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => setRejecting(true)} data-testid="drv-reject" className="h-12 px-6 rounded-xl border border-[#F4C7C3] text-[15px] font-black text-[#B42318] hover:bg-[#FEF6F5]">거절</button>
              <button type="button" disabled={busy} onClick={doApprove} data-testid="drv-approve" className="flex-1 h-12 rounded-xl text-white text-[15.5px] font-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}>
                {busy ? "처리 중…" : target ? `연동하고 「${type}」로 승인` : `「${type}」 기사로 승인`}
              </button>
            </div>
          )}
        </div>
      </div>
      {zoom && bizImg && (
        <div className="fixed inset-0 z-[2147482001] bg-black/80 grid place-items-center p-4" onClick={(e) => { e.stopPropagation(); setZoom(false); }}>
          <img src={bizImg} alt="사업자등록증" className="max-w-full max-h-full rounded-xl" />
        </div>
      )}
    </div>,
    document.body,
  );
}
