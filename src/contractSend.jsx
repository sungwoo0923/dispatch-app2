// ======================= src/contractSend.jsx =======================
// ⭐ 2026-11-10 운송계약서 → 기사앱으로 여러 명에게 한 번에 발송
//  · 저장: driverContracts/{id} = { companyName, driverId(기사앱 uid), driverDocId, driverName, 차량번호, kind, sub, title, vals, clauses,
//          status: "sent" | "read" | "signed", sentAt, readAt, signedAt, signImage(도장·서명 이미지), signMethod("stamp" | "draw"), signName, by }
//  · 기사는 기사앱 › 서류함 › 계약서에서 열어 도장 사진을 올리거나 손으로 서명한다(src/driver/DriverContractSign.jsx)
//  · 서버(functions › driverContractPush)가 새 계약서를 기사 휴대폰으로 푸시 알림
import React from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, where } from "firebase/firestore";
import { db } from "./firebase";
import { kpAlert, kpConfirm } from "./kpDialog";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
export const DC_STATUS = { sent: "발송", read: "열람", signed: "서명 완료" };
const toMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0);
const fmtT = (v) => { const ms = toMs(v); if (!ms) return "-"; const d = new Date(ms + 9 * 3600e3); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };

// ⭐ 2026-11-10 전송 실패 이유를 알기 쉽게
function sendErrText(e) {
  const c = String(e?.code || "");
  if (c === "permission-denied") return "권한이 없어요(서버 보안 규칙이 아직 배포되지 않았거나, 이 계정이 같은 회사 직원이 아니에요). 관리자에게 'firestore:rules 배포'를 요청해 주세요";
  if (c === "unavailable" || c === "deadline-exceeded") return "인터넷 연결이 불안정해요. 잠시 후 다시 보내 주세요";
  if (c === "invalid-argument" || /Unsupported field value/i.test(String(e?.message || ""))) return "계약서 내용에 저장할 수 없는 값이 있어요. 칸을 다시 확인해 주세요";
  if (c === "unauthenticated") return "로그인이 풀렸어요. 다시 로그인해 주세요";
  return `보내지 못했어요${c ? ` (${c})` : ""}`;
}
// 발송 버튼 — targets: 고른 기사 목록, valsFor(d): 그 기사 정보로 채운 입력값
export function DriverContractSendBar({ company, me = {}, targets = [], valsFor, kind, sub, title, clauses, missingFor, onMissing }) {
  const [busy, setBusy] = React.useState(false);
  const noApp = targets.filter((d) => !d.appUid);
  const send = async () => {
    if (!targets.length) return kpAlert("발송할 기사님을 먼저 고르세요.");
    const ok = targets.filter((d) => d.appUid);
    if (!ok.length) return kpAlert("고른 기사님이 모두 기사앱에 가입하지 않았습니다.\n기사앱 가입 후 보낼 수 있어요.");
    const miss = ok.map((d) => ({ d, m: missingFor?.(valsFor(d)) || [] })).filter((x) => x.m.length);
    if (miss.length) { await kpAlert(`필수 입력이 비어 있습니다.\n${miss.slice(0, 5).map((x) => `· ${x.d.이름}: ${x.m.join(", ")}`).join("\n")}\n\n[확인]을 누르면 그 칸으로 이동합니다.`); onMissing?.(miss[0].d, miss[0].m[0]); return; } // ⭐ 2026-11-10 빈 칸으로 이동·표시
    if (!(await kpConfirm(`「${title}」을 기사님 ${ok.length}명에게 기사앱으로 보낼까요?\n\n· 기사님마다 각자 정보(성명·차량번호·연락처 등)로 따로 만들어집니다\n· 기사님은 기사앱 › 서류함 › 계약서에서 도장 사진 또는 손서명으로 서명합니다${noApp.length ? `\n· 기사앱 미가입 ${noApp.length}명은 빠집니다(${noApp.slice(0, 3).map((d) => d.이름).join(", ")}${noApp.length > 3 ? " 외" : ""})` : ""}`, { title: "운송계약서 발송", okText: `${ok.length}명에게 발송` }))) return;
    if (!String(company || "").trim()) return kpAlert("회사 정보를 찾지 못해 보낼 수 없습니다. 새로고침 후 다시 시도해 주세요.");
    setBusy(true);
    let sent = 0; const fail = [];
    // ⭐ 2026-11-10 저장할 수 없는 값(undefined 등)을 미리 걸러 낸다 — 예전엔 빈 칸 하나 때문에 전송 전체가 실패할 수 있었다
    const clean = (o) => JSON.parse(JSON.stringify(o ?? null));
    for (const d of ok) {
      try {
        await addDoc(collection(db, "driverContracts"), {
          companyName: String(company || "").trim(), driverId: d.appUid, driverDocId: d.id, driverName: d.이름 || "", 차량번호: d.차량번호 !== "-" ? d.차량번호 : "",
          kind, sub: sub || "", title: title || "", vals: clean(valsFor(d)) || {}, clauses: clean(clauses) || [], status: "sent", sentAt: serverTimestamp(), by: me.name || "",
        });
        sent += 1;
      } catch (e) { fail.push(`${d.이름} — ${sendErrText(e)}`); }
    }
    setBusy(false);
    kpAlert(`${sent}명에게 보냈습니다.${fail.length ? `\n\n보내지 못한 기사님:\n${fail.map((f) => `· ${f}`).join("\n")}` : ""}\n진행 상황은 아래 '기사앱 발송 현황'에서 볼 수 있어요.`);
  };
  return (
    <button type="button" onClick={send} disabled={busy || !targets.length}
      className="h-10 px-4 rounded-xl bg-[#2D4C82] text-white text-[13.5px] font-black disabled:opacity-40 whitespace-nowrap" title="고른 기사님마다 각자 정보로 계약서를 만들어 기사앱으로 보냅니다">
      {busy ? "보내는 중…" : `기사앱으로 발송${targets.length ? ` · ${targets.length}명` : ""}`}
    </button>
  );
}

// 발송 현황 — 발송 · 열람 · 서명 완료, 눌러서 서명된 계약서 보기
export function DriverContractStatus({ company, Paper, specOf }) {
  const co = String(company || "").trim();
  const [rows, setRows] = React.useState([]);
  const [filter, setFilter] = React.useState("all");
  const [view, setView] = React.useState(null);
  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(query(collection(db, "driverContracts"), where("companyName", "==", co)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => toMs(b.sentAt) - toMs(a.sentAt))), () => setRows([]));
  }, [co]);
  const cnt = (k) => rows.filter((r) => (k === "all" ? true : r.status === k)).length;
  const list = rows.filter((r) => filter === "all" || r.status === filter);
  const remove = async (r) => {
    if (!(await kpConfirm(`${r.driverName}님에게 보낸 「${r.title}」을 지울까요?${r.status === "signed" ? "\n서명이 끝난 계약서입니다. 지우면 기사앱에서도 사라집니다." : "\n기사앱에서도 사라집니다."}`, { title: "발송 계약서 삭제", okText: "삭제", danger: true }))) return;
    await deleteDoc(doc(db, "driverContracts", r.id)).catch((e) => kpAlert(`삭제하지 못했어요: ${e?.message || e}`));
  };
  return (
    <div className="rounded-[18px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_20px_rgba(16,24,40,0.05)] p-5">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>SENT · DRIVER APP</span>
        <span className="text-[16px] font-black text-[#0F1A30]">기사앱 발송 현황</span>
        <div className="ml-auto inline-flex gap-1 p-1 rounded-xl bg-[#EEF2F8]">
          {[["all", "전체"], ["sent", "발송"], ["read", "열람"], ["signed", "서명 완료"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={`h-8 px-2.5 rounded-lg text-[12.5px] font-black ${filter === k ? "bg-[#0F1A30] text-white" : "text-[#3A4A66]"}`}>{l} {cnt(k)}</button>
          ))}
        </div>
      </div>
      {!list.length ? <div className="py-8 text-center text-[13.5px] font-bold text-[#8E9BB2]">{rows.length ? "이 상태의 계약서가 없습니다" : "기사앱으로 보낸 계약서가 없습니다"}</div> : (
        <div className="divide-y divide-[#EEF1F6] max-h-[360px] overflow-y-auto overscroll-contain">
          {list.map((r) => (
            <div key={r.id} className="flex items-center gap-2.5 py-2.5">
              <span className={`shrink-0 h-7 px-2 rounded-lg text-[12px] font-black inline-flex items-center ${r.status === "signed" ? "bg-[#0F1A30] text-white" : r.status === "read" ? "bg-[#EEF3FC] text-[#2D4C82]" : "bg-[#F3F5F9] text-[#5B6B85]"}`}>{DC_STATUS[r.status] || r.status}</span>
              <button type="button" onClick={() => setView(r)} className="min-w-0 flex-1 text-left">
                <div className="text-[14px] font-black text-[#0F1A30] truncate">{r.driverName} <span className="text-[12.5px] font-bold text-[#5B6B85]">{r.차량번호}</span></div>
                <div className="text-[12px] font-semibold text-[#7A89A3] truncate">{r.title} · 발송 {fmtT(r.sentAt)}{r.readAt ? ` · 열람 ${fmtT(r.readAt)}` : ""}{r.signedAt ? ` · 서명 ${fmtT(r.signedAt)}` : ""}</div>
              </button>
              <button type="button" onClick={() => setView(r)} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] text-[12px] font-black text-[#1B2B4B]">보기</button>
              <button type="button" onClick={() => remove(r)} className="h-8 w-8 rounded-lg text-[#7A879C] hover:bg-[#F3F5F9]" aria-label="삭제">✕</button>
            </div>
          ))}
        </div>
      )}
      {view && (
        <div className="fixed inset-0 z-[99990] bg-[#0B1428]/60 flex items-center justify-center p-4" onClick={() => setView(null)}>
          <div className="w-full max-w-[880px] max-h-[92vh] flex flex-col rounded-[22px] bg-[#E9EDF3] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3.5 flex items-center gap-2 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
              <div className="min-w-0">
                <div className="text-[15.5px] font-black truncate">{view.driverName} · {view.title}</div>
                <div className="text-[12px] text-white/60">{DC_STATUS[view.status]}{view.signedAt ? ` · ${fmtT(view.signedAt)} ${view.signMethod === "stamp" ? "도장" : "손서명"}` : ""}</div>
              </div>
              <button type="button" onClick={() => setView(null)} className="ml-auto h-9 px-3.5 rounded-xl bg-white/10 border border-white/20 text-[13px] font-bold">닫기</button>
            </div>
            <div className="overflow-auto overscroll-contain p-4">
              <div className="mx-auto [&_.kp-a4page]:shadow-[0_10px_30px_rgba(15,26,48,.18)]" style={{ width: 794 }}>
                <Paper title={view.title} spec={specOf(view.kind, view.sub)} vals={view.vals || {}} clauses={view.clauses || []} signs={{ right: view.signImage || "" }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
