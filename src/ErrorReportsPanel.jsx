// ======================= src/ErrorReportsPanel.jsx =======================
// 🧯 2026-11-10 관리자 관리센터 › 보안·데이터 › 오류 신고 — 오류 화면의 [오류 보내기]로 들어온 것(errorReports)
//  · 회사·상태·검색으로 거르고, 줄을 누르면 오류 내용(스택)을 펼쳐 본다 · [처리완료]/[다시 열기] · 최고관리자만(보안 규칙)
import React from "react";
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import CustomSelect from "./CustomSelect";
import { errorCode } from "./errorReport";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const ROLE = { admin: "관리자", user: "직원", driver: "기사", shipper: "화주", totalMaster: "최고관리자", viewer: "조회" };
const msOf = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0);
const kst = (ms) => (ms ? new Date(ms + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ") : "");

export default function ErrorReportsPanel() {
  const [rows, setRows] = React.useState(null);
  const [open, setOpen] = React.useState("");
  const [f, setF] = React.useState({ co: "", st: "new", q: "" });
  React.useEffect(() => onSnapshot(query(collection(db, "errorReports"), orderBy("createdAt", "desc"), limit(500)),
    (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([])), []);
  const companies = [...new Set((rows || []).map((r) => r.companyName).filter(Boolean))].sort();
  const q = f.q.trim().toUpperCase();
  const list = (rows || []).filter((r) => (!f.co || r.companyName === f.co) && (!f.st || (f.st === "done" ? r.status === "done" : r.status !== "done"))
    && (!q || [errorCode(r.id), r.name, r.email, r.section, r.message].filter(Boolean).join(" ").toUpperCase().includes(q)));
  const by = auth.currentUser?.email || "";
  const setDone = (r, done) => updateDoc(doc(db, "errorReports", r.id), done ? { status: "done", doneBy: by, doneAt: serverTimestamp() } : { status: "new" }).catch((e) => window.alert(e.message));
  const remove = (r) => { if (window.confirm(`오류 번호 ${errorCode(r.id)}를 지울까요?`)) deleteDoc(doc(db, "errorReports", r.id)).catch((e) => window.alert(e.message)); };
  const openCnt = (rows || []).filter((r) => r.status !== "done").length;
  const sel = "h-9 px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-[13px] font-bold text-[#1B2B4B] min-w-[130px]";
  return (
    <div className="space-y-4">
      <div className="rounded-[20px] px-6 py-5 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 65%,#2D4C82)" }}>
        <div className="text-[10.5px] font-extrabold tracking-[0.28em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>ERRORS · REPORTS</div>
        <div className="text-[20px] font-black mt-1">오류 신고 <span className="text-[14px] text-white/60 ml-1">처리 안 함 {openCnt}건</span></div>
        <div className="text-[13px] text-white/65 mt-1">운송사 직원·기사가 오류 화면에서 [오류 보내기]를 누르면 여기에 들어옵니다. 전화로 오류 번호(6자리)를 들으면 검색칸에 넣어 찾으세요.</div>
      </div>
      <div className="rounded-[18px] bg-white border border-[#E3E8F0]">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#EEF1F6]">
          <CustomSelect className={sel} value={f.st} onChange={(e) => setF((p) => ({ ...p, st: e.target.value }))}><option value="new">처리 안 함</option><option value="done">처리완료</option><option value="">전체 상태</option></CustomSelect>
          <CustomSelect className={sel} value={f.co} onChange={(e) => setF((p) => ({ ...p, co: e.target.value }))}><option value="">전체 회사</option>{companies.map((c) => <option key={c} value={c}>{c}</option>)}</CustomSelect>
          <input value={f.q} onChange={(e) => setF((p) => ({ ...p, q: e.target.value }))} placeholder="오류 번호·이름·화면·오류 내용 검색" className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[13px] flex-1 min-w-[180px]" />
        </div>
        {rows === null ? <div className="py-14 text-center text-[#9AA9C3]">불러오는 중…</div> : list.length === 0 ? <div className="py-14 text-center text-[#9AA9C3]">해당하는 오류 신고가 없습니다.</div> : (
          <div className="overflow-x-auto"><table className="w-full text-[13px]" style={{ minWidth: 980 }}>
            <thead><tr className="bg-[#1B2B4B] text-white">{["오류 번호", "시각", "회사", "보낸 사람", "화면", "오류 내용", "버전", ""].map((h) => <th key={h} className="px-3 py-2.5 text-center font-extrabold whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>{list.map((r) => (
              <React.Fragment key={r.id}>
                <tr className={`border-t border-[#EEF1F6] cursor-pointer hover:bg-[#F7F9FC] ${r.status === "done" ? "opacity-55" : ""}`} onClick={() => setOpen((o) => (o === r.id ? "" : r.id))}>
                  <td className="px-3 py-2 text-center font-black tracking-wider" style={{ fontFamily: "monospace" }}>{errorCode(r.id)}</td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{kst(msOf(r.createdAt))}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.companyName || "-"}</td>
                  <td className="px-3 py-2"><div className="font-bold">{r.name || "-"} <span className="text-[11.5px] text-[#7A879C] font-normal">{ROLE[r.role] || r.role}</span></div><div className="text-[11.5px] text-[#7A879C]">{r.email}</div></td>
                  <td className="px-3 py-2 whitespace-nowrap font-bold">{r.section}</td>
                  <td className="px-3 py-2 break-all">{String(r.message || "").slice(0, 120)}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{r.version}</td>
                  <td className="px-3 py-2 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {r.status === "done"
                      ? <button type="button" onClick={() => setDone(r, false)} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-bold text-[#7A879C]">다시 열기</button>
                      : <button type="button" onClick={() => setDone(r, true)} className="h-8 px-3 rounded-lg bg-[#0F1A30] text-white text-[12px] font-black">처리완료</button>}
                    <button type="button" onClick={() => remove(r)} className="h-8 px-2 ml-1 rounded-lg text-[12px] font-bold text-[#B4342A]">삭제</button>
                  </td>
                </tr>
                {open === r.id && (
                  <tr className="bg-[#F7F9FC]"><td colSpan={8} className="px-4 py-3">
                    <div className="text-[12px] text-[#7A879C] mb-1">주소 {r.url || "-"} · 기기 {r.ua || "-"}{r.status === "done" && r.doneBy ? ` · 처리 ${String(r.doneBy).split("@")[0]} ${kst(msOf(r.doneAt))}` : ""}</div>
                    <pre className="text-[11.5px] text-[#1B2B4B] whitespace-pre-wrap break-all max-h-[280px] overflow-auto bg-white border border-[#E3E8F0] rounded-lg p-3">{r.message}{"\n\n"}{r.stack || "(스택 없음)"}</pre>
                  </td></tr>
                )}
              </React.Fragment>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
