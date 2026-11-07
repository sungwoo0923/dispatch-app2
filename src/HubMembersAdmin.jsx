// ======================= src/HubMembersAdmin.jsx =======================
// ⭐ 2026-11-06 관리센터 › 고객사 › 허브 회원 승인 — 로지스웹 허브(화물 콜) 가입 신청 심사.
//  허브 사이트(cafe-site/src/hub/HubAdmin.jsx)와 같은 데이터(hubMembers/{uid})·같은 처리.
//  신청서 · 서류(Storage hub/members/{uid}/…) 보기 → 서류별 확인 · 사업자 상태 → 승인 / 거절(사유 필수) / 정지.
//  허브는 따로 빌드되는 사이트라 화면 부품을 서로 가져다 쓰지 않는다(같은 규칙: firestore.rules "로지스웹 허브 콜").
import React from "react";
import { collection, deleteField, doc, limit, onSnapshot, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref as sref } from "firebase/storage";
import { db, storage } from "./firebase";

const ROLE = { driver: "차주", shipper: "화주", carrier: "운송사" };
const SOURCE = { signup: "허브 가입", "logisweb-staff": "로지스웹 운송사", "logisweb-driver": "로지스웹 소속 기사", "logisweb-shipper": "로지스웹 화주사" };
const DOCS = { bizReg: "사업자등록증", cargoLicense: "화물운송종사자격증", carReg: "자동차등록증", driverLicense: "운전면허증", insurance: "적재물배상보험 증권", bankbook: "통장사본", employment: "담당자 재직·위임 확인서", transportPermit: "화물운송사업 허가증" };
const ROLE_DOCS = { driver: ["bizReg", "cargoLicense", "carReg", "driverLicense", "insurance", "bankbook"], shipper: ["bizReg", "employment"], carrier: ["bizReg", "transportPermit", "employment", "bankbook"] };
const ST = { pending: "승인 대기", approved: "승인", rejected: "거절", suspended: "정지" };
const BIZ = ["확인 전", "계속사업자", "휴업자", "폐업자"];
const ms = (t) => (t?.toMillis ? t.toMillis() : 0);
const when = (t) => (ms(t) ? new Date(ms(t)).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const btn = "h-11 px-4 rounded-xl text-[14px] font-black inline-flex items-center justify-center gap-1.5 transition disabled:opacity-50";

function useUrl(path) {
  const [u, setU] = React.useState("");
  React.useEffect(() => { let on = true; if (path) getDownloadURL(sref(storage, path)).then((x) => on && setU(x)).catch(() => {}); return () => { on = false; }; }, [path]);
  return u;
}
function DocBox({ k, d, checked, onCheck }) {
  const url = useUrl(d?.path);
  const img = d?.type?.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(d?.path || "");
  return (
    <div className="rounded-2xl border border-[#E3E8F0] bg-white overflow-hidden" data-testid="pc-hub-doc">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[#EEF1F6]">
        <span className="text-[14px] font-black text-[#0F1A30] flex-1 truncate">{DOCS[k]}</span>
        {d?.path ? <label className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-[#1B2B4B] cursor-pointer"><input type="checkbox" checked={!!checked} onChange={(e) => onCheck(e.target.checked)} className="w-4 h-4 accent-[#1B2B4B]" />확인</label> : <span className="text-[13px] font-bold text-[#9AA9C3]">미제출</span>}
      </div>
      {d?.path && (img && url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={DOCS[k]} className="w-full h-36 object-contain bg-[#F2F5FA]" /></a>
        : <a href={url || "#"} target="_blank" rel="noreferrer" className="block px-3.5 py-3.5 text-[14px] font-bold text-[#2D4C82]">📄 {d.name || "파일 열기"}</a>)}
    </div>
  );
}

function Review({ m, me, onClose }) {
  const keys = ROLE_DOCS[m.role] || [];
  const [verified, setVerified] = React.useState(() => Object.fromEntries(keys.filter((k) => m.docs?.[k]?.path).map((k) => [k, !!m.verified?.[k]])));
  const [biz, setBiz] = React.useState(m.bizStatus || "확인 전");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const photo = useUrl(m.photoPath);
  const act = async (decision) => {
    setErr("");
    if (decision !== "approved" && !reason.trim()) { setErr("거절 · 정지 사유를 적어 주세요."); return; }
    setBusy(decision);
    try {
      const all = Object.values(verified);
      await updateDoc(doc(db, "hubMembers", m.id), {
        status: decision, reviewedAt: serverTimestamp(), reviewedBy: me?.email || me?.uid || "",
        rejectReason: decision === "approved" ? deleteField() : reason.trim(),
        ...(decision === "approved" ? { approvedAt: serverTimestamp(), verified, docsVerified: all.length > 0 && all.every(Boolean), bizStatus: biz } : {}),
      });
      onClose();
    } catch (e) { setErr(e?.message || "처리하지 못했습니다."); } finally { setBusy(""); }
  };
  const rows = [["유형", ROLE[m.role]], ["출처", SOURCE[m.source]], ["이메일", m.email], ["이름", m.name], ["휴대폰", m.phone], ["회사", m.companyName], ["사업자번호", m.bizNo], ["대표자", m.ceoName], ["허가번호", m.permitNo], ["주소", m.bizAddress],
    ...(m.vehicle ? [["차량", `${m.vehicle.plate} · ${m.vehicle.ton} ${m.vehicle.type}`], ["적재함", `${m.vehicle.length || "-"}m × ${m.vehicle.width || "-"}m`]] : []), ["주 운행", (m.regions || []).join(", ")], ["신청", when(m.appliedAt)]].filter(([, v]) => v);
  return (
    <div className="fixed inset-0 z-[9999] bg-[#0B1428]/55 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-[760px] h-full bg-[#EEF1F6] flex flex-col" onClick={(e) => e.stopPropagation()} data-testid="pc-hub-review">
        <div className="h-16 shrink-0 bg-white border-b border-[#E3E8F0] flex items-center gap-3 px-5">
          <button type="button" onClick={onClose} className="w-10 h-10 rounded-xl hover:bg-[#F2F5FA] text-[20px]">‹</button>
          <div className="min-w-0"><div className="text-[17px] font-black text-[#0F1A30] truncate">{m.name || m.email} · {ROLE[m.role]}</div><div className="text-[13px] text-[#7A879C]">{ST[m.status]}{m.rejectReason ? ` · ${m.rejectReason}` : ""}</div></div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4 flex gap-4">
            {photo ? <img src={photo} alt="" className="w-20 h-20 rounded-2xl object-cover" /> : <span className="w-20 h-20 rounded-2xl bg-[#EAF0FA] text-[#1B2B4B] inline-flex items-center justify-center text-[28px] font-black">{(m.name || "?")[0]}</span>}
            <div className="flex-1 min-w-0 divide-y divide-[#EEF1F6]">{rows.map(([k, v]) => <div key={k} className="flex py-1.5 text-[14px]"><span className="w-24 shrink-0 text-[#7A879C] font-bold">{k}</span><span className="font-bold text-[#0F1A30] break-all">{v}</span></div>)}</div>
          </div>
          {m.source === "signup" && <div className="grid grid-cols-2 gap-3">{keys.map((k) => <DocBox key={k} k={k} d={m.docs?.[k]} checked={verified[k]} onCheck={(v) => setVerified((p) => ({ ...p, [k]: v }))} />)}</div>}
          <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4 grid grid-cols-2 gap-3">
            <label className="block text-[13.5px] font-black text-[#3A4A66]">사업자 상태(국세청 조회)
              <select value={biz} onChange={(e) => setBiz(e.target.value)} className="mt-1.5 w-full h-11 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-bold">{BIZ.map((b) => <option key={b}>{b}</option>)}</select>
            </label>
            <label className="block text-[13.5px] font-black text-[#3A4A66]">거절 · 정지 사유
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 보험 증권 기간 만료" className="mt-1.5 w-full h-11 px-3 rounded-xl border border-[#DCE3EE] text-[14px]" data-testid="pc-hub-reason" />
            </label>
            <a href="https://teht.hometax.go.kr/websquare/websquare.html?w2xPath=/ui/ab/a/a/UTEABAAA13.xml" target="_blank" rel="noreferrer" className="text-[13.5px] font-black text-[#2D4C82]">홈택스 사업자 상태 조회 열기 ↗</a>
          </div>
          {err && <div className="rounded-xl bg-white border border-[#C7D3E8] px-4 py-3 text-[14px] font-bold text-[#0F1A30]">⚠ {err}</div>}
        </div>
        <div className="shrink-0 p-4 bg-white border-t border-[#E3E8F0] grid grid-cols-3 gap-2">
          <button type="button" disabled={!!busy} onClick={() => act("rejected")} className={`${btn} bg-white border border-[#0F1A30] text-[#0F1A30]`} data-testid="pc-hub-reject">거절</button>
          <button type="button" disabled={!!busy} onClick={() => act("suspended")} className={`${btn} bg-white border border-[#DCE3EE] text-[#3A4A66]`}>정지</button>
          <button type="button" disabled={!!busy} onClick={() => act("approved")} className={`${btn} text-white`} style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }} data-testid="pc-hub-approve">승인</button>
        </div>
      </div>
    </div>
  );
}

export default function HubMembersAdmin({ me }) {
  const [rows, setRows] = React.useState(null);
  const [tab, setTab] = React.useState("pending");
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState(null);
  React.useEffect(() => onSnapshot(query(collection(db, "hubMembers"), limit(1000)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([])), []);
  const all = rows || [];
  const counts = all.reduce((a, m) => ({ ...a, [m.status]: (a[m.status] || 0) + 1 }), {});
  const list = all.filter((m) => m.status === tab && (!q || `${m.name} ${m.companyName} ${m.email} ${m.phone} ${m.vehicle?.plate || ""}`.includes(q))).sort((a, b) => ms(b.appliedAt || b.createdAt) - ms(a.appliedAt || a.createdAt));
  const selM = sel ? all.find((m) => m.id === sel) : null;
  return (
    <div className="space-y-4" data-testid="pc-hub-members">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Object.entries(ST).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`text-left rounded-2xl px-4 py-3.5 border ${tab === k ? "bg-[#0F1A30] border-[#0F1A30] text-white" : "bg-white border-[#E3E8F0]"}`}>
            <div className={`text-[13.5px] font-bold ${tab === k ? "text-white/65" : "text-[#7A879C]"}`}>{l}</div>
            <div className="text-[26px] font-black">{counts[k] || 0}</div>
          </button>
        ))}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 회사 · 이메일 · 차량번호 검색" className="w-full h-11 px-4 rounded-xl border border-[#DCE3EE] bg-white text-[14px]" />
      {rows === null ? <div className="py-12 text-center text-[#9AA9C3]">불러오는 중…</div> : list.length === 0 ? <div className="py-12 text-center text-[14px] font-bold text-[#7A879C] bg-white rounded-2xl border border-[#E3E8F0]">{ST[tab]} 회원이 없습니다.</div> : (
        <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden">
          <table className="w-full text-[14px]">
            <thead><tr className="bg-[#F5F7FB] text-[#55657F] text-left">{["유형", "이름", "회사", "차량 / 사업자번호", "출처", "서류", "신청"].map((h) => <th key={h} className="px-4 py-3 font-black">{h}</th>)}</tr></thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} onClick={() => setSel(m.id)} className="border-t border-[#EEF1F6] hover:bg-[#F7F9FC] cursor-pointer" data-testid="pc-hub-row">
                  <td className="px-4 py-3 font-black text-[#1B2B4B]">{ROLE[m.role]}</td>
                  <td className="px-4 py-3 font-bold text-[#0F1A30]">{m.name}<div className="text-[12.5px] text-[#9AA9C3] font-semibold">{m.phone}</div></td>
                  <td className="px-4 py-3">{m.companyName}</td>
                  <td className="px-4 py-3">{m.vehicle ? `${m.vehicle.plate} · ${m.vehicle.ton} ${m.vehicle.type}` : m.bizNo}</td>
                  <td className="px-4 py-3 text-[#55657F]">{SOURCE[m.source]}</td>
                  <td className="px-4 py-3">{Object.keys(m.docs || {}).length}개</td>
                  <td className="px-4 py-3 text-[#7A879C]">{when(m.appliedAt || m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selM && <Review key={selM.id} m={selM} me={me} onClose={() => setSel(null)} />}
    </div>
  );
}
