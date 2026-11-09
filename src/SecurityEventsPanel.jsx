// ======================= src/SecurityEventsPanel.jsx =======================
// 🛡 2026-11-09 관리자 관리센터 › 보안·데이터 › 보안 알림 — 서버(securityPing · 퇴사 트리거)가 남긴 securityEvents
//  · 새 기기 로그인 · 해외 IP 접속 · 새벽 접속 · 짧은 시간 대량 다운로드 · 퇴사자 계정 차단/복직
//  · 위험도·종류·회사·확인 여부로 거르고 [확인] 처리(최고관리자·부관리자만 — 보안 규칙)
import React from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { auth, db } from "./firebase";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const TYPE = { new_device: "새 기기 로그인", foreign_ip: "해외 IP 접속", night_login: "새벽 접속", bulk_download: "대량 다운로드", resign_block: "퇴사자 차단", rehire_unblock: "복직 허용" };
const LEVEL = { high: ["높음", "bg-[#FDECEC] text-[#B4342A] border-[#F5C2BD]"], medium: ["보통", "bg-[#FFF4E0] text-[#9A5B00] border-[#F3D9A4]"], low: ["낮음", "bg-[#EEF3FA] text-[#2D4C82] border-[#D5E0F1]"] };
const kst = (ms) => (ms ? new Date(ms + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ") : "");

export default function SecurityEventsPanel() {
  const [rows, setRows] = React.useState(null);
  const [f, setF] = React.useState({ level: "", type: "", co: "", unacked: true, q: "" });
  React.useEffect(() => onSnapshot(query(collection(db, "securityEvents"), orderBy("atMs", "desc"), limit(500)),
    (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([])), []);
  const list = (rows || []).filter((r) => (!f.level || r.level === f.level) && (!f.type || r.type === f.type) && (!f.co || r.company === f.co)
    && (!f.unacked || !r.ack) && (!f.q || [r.name, r.email, r.ip, r.detail].filter(Boolean).join(" ").includes(f.q)));
  const companies = [...new Set((rows || []).map((r) => r.company).filter(Boolean))].sort();
  const by = auth.currentUser?.email || "";
  const ack = (r) => updateDoc(doc(db, "securityEvents", r.id), { ack: true, ackBy: by, ackAt: serverTimestamp() }).catch((e) => window.alert(e.message));
  const ackAll = async () => {
    const t = list.filter((r) => !r.ack).slice(0, 400);
    if (!t.length) return;
    const b = writeBatch(db);
    t.forEach((r) => b.update(doc(db, "securityEvents", r.id), { ack: true, ackBy: by, ackAt: serverTimestamp() }));
    await b.commit().catch((e) => window.alert(e.message));
  };
  const cnt = (lv) => (rows || []).filter((r) => !r.ack && r.level === lv).length;
  const sel = "h-9 px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-[13px] font-bold text-[#1B2B4B]";
  return (
    <div className="space-y-4">
      <div className="rounded-[20px] px-6 py-5 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 65%,#2D4C82)" }}>
        <div className="text-[10.5px] font-extrabold tracking-[0.28em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>SECURITY · THREATS</div>
        <div className="text-[20px] font-black mt-1">보안 알림</div>
        <div className="text-[13px] text-white/65 mt-1">새 기기 로그인 · 해외 IP · 새벽 접속 · 10분 안 대량 다운로드 · 퇴사자 계정 차단. 높음·보통은 최고관리자 휴대폰으로 푸시가 갑니다. AI 팀 › 보안팀도 이 기록을 봅니다.</div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {["high", "medium", "low"].map((lv) => (
          <button key={lv} type="button" onClick={() => setF((p) => ({ ...p, level: p.level === lv ? "" : lv }))}
            className={`rounded-[16px] px-4 py-3.5 text-left border ${f.level === lv ? "border-[#1B2B4B] ring-2 ring-[#1B2B4B]/15" : "border-[#E3E8F0]"} bg-white`}>
            <div className="text-[12.5px] font-bold text-[#7A879C]">확인 안 함 · 위험도 {LEVEL[lv][0]}</div>
            <div className="text-[22px] font-black text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO }}>{cnt(lv)}<span className="text-[12px] ml-1 text-[#9AA9C3]">건</span></div>
          </button>
        ))}
      </div>
      <div className="rounded-[18px] bg-white border border-[#E3E8F0]">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#EEF1F6]">
          <select className={sel} value={f.type} onChange={(e) => setF((p) => ({ ...p, type: e.target.value }))}><option value="">전체 종류</option>{Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select className={sel} value={f.co} onChange={(e) => setF((p) => ({ ...p, co: e.target.value }))}><option value="">전체 회사</option>{companies.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <label className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#1B2B4B]"><input type="checkbox" checked={f.unacked} onChange={(e) => setF((p) => ({ ...p, unacked: e.target.checked }))} />확인 안 한 것만</label>
          <input value={f.q} onChange={(e) => setF((p) => ({ ...p, q: e.target.value }))} placeholder="이름·이메일·IP 검색" className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[13px] flex-1 min-w-[160px]" />
          <button type="button" onClick={ackAll} className="h-9 px-3 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black">보이는 것 모두 확인</button>
        </div>
        {rows === null ? <div className="py-14 text-center text-[#9AA9C3]">불러오는 중…</div> : list.length === 0 ? <div className="py-14 text-center text-[#9AA9C3]">해당하는 보안 알림이 없습니다.</div> : (
          <div className="overflow-x-auto"><table className="w-full text-[13px]" style={{ minWidth: 980 }}>
            <thead><tr className="bg-[#1B2B4B] text-white">{["시각", "위험도", "종류", "회사", "사람", "IP · 국가", "기기", "내용", ""].map((h) => <th key={h} className="px-3 py-2.5 text-center font-extrabold whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>{list.map((r) => { const lv = LEVEL[r.level] || LEVEL.low; return (
              <tr key={r.id} className={`border-t border-[#EEF1F6] ${r.ack ? "opacity-55" : ""}`}>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{kst(Number(r.atMs) || 0)}</td>
                <td className="px-3 py-2 text-center"><span className={`inline-block px-2 py-0.5 rounded-md border text-[11.5px] font-black ${lv[1]}`}>{lv[0]}</span></td>
                <td className="px-3 py-2 font-bold whitespace-nowrap">{TYPE[r.type] || r.type}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.company || "-"}</td>
                <td className="px-3 py-2"><div className="font-bold">{r.name || "-"}</div><div className="text-[11.5px] text-[#7A879C]">{r.email}</div></td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{r.ip || "-"}{r.country ? ` · ${r.country}` : ""}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.ua || "-"}</td>
                <td className="px-3 py-2">{r.detail}</td>
                <td className="px-3 py-2 text-center">{r.ack ? <span className="text-[11.5px] text-[#7A879C]">확인 · {String(r.ackBy || "").split("@")[0]}</span> : <button type="button" onClick={() => ack(r)} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-black text-[#1B2B4B] hover:border-[#4B6CB7]">확인</button>}</td>
              </tr>); })}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
