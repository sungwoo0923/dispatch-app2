// ======================= cafe-site/src/hub/HubAdmin.jsx =======================
// ⭐ 2026-11-06 허브 회원 승인(허브 관리자 = 로지스웹 최고관리자 · 부관리자). 관리센터(src/HubMembersAdmin.jsx)와 같은 일.
//  신청서 · 서류 보기 → 서류별 확인 체크 · 사업자 상태 → 승인 / 거절(사유 필수) / 이용 정지. 신고 목록.
import React, { useEffect, useMemo, useState } from "react";
import { HI, Btn, Badge, Card, Drawer, Seg, inputCls, selectCls, Empty } from "./hubUi";
import { ROLES, SOURCE_LABEL, DOC_TYPES, ROLE_DOCS, BIZ_STATUS, ago, tsMs } from "./hubConstants";
import { subscribeAllMembers, subscribeReports, reviewMember, fileUrl } from "./hubApi";

const ST = { pending: "승인 대기", approved: "승인", rejected: "거절", suspended: "정지" };

function DocView({ label, d, checked, onCheck }) {
  const [url, setUrl] = useState("");
  useEffect(() => { let on = true; if (d?.path) fileUrl(d.path).then((u) => on && setUrl(u)).catch(() => {}); return () => { on = false; }; }, [d?.path]);
  const img = d?.type?.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(d?.path || "");
  return (
    <div className="rounded-2xl ring-1 ring-inset ring-[#E2E7EF] bg-white overflow-hidden" data-testid="admin-doc">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[#EEF1F6]">
        <span className="text-[15px] font-bold text-[#0F1A30] flex-1 min-w-0 truncate">{label}</span>
        {d?.path ? (
          <label className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[#1B2B4B] cursor-pointer"><input type="checkbox" checked={!!checked} onChange={(e) => onCheck(e.target.checked)} className="w-5 h-5 accent-[#1B2B4B]" />확인</label>
        ) : <Badge>미제출</Badge>}
      </div>
      {d?.path && (img && url
        ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={label} className="w-full h-40 object-contain bg-[#F2F5FA]" /></a>
        : <a href={url || "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3.5 py-4 text-[15px] font-bold text-[#2D4C82]"><HI name="file" size={18} />{d.name || "파일 열기"}</a>)}
    </div>
  );
}

export function MemberReview({ m, admin, onClose, toast }) {
  const docKeys = [...(ROLE_DOCS[m.role]?.required || []), ...(ROLE_DOCS[m.role]?.optional || [])];
  const [verified, setVerified] = useState(() => Object.fromEntries(docKeys.filter((k) => m.docs?.[k]?.path).map((k) => [k, !!m.verified?.[k]])));
  const [biz, setBiz] = useState(m.bizStatus || "확인 전");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [photo, setPhoto] = useState("");
  useEffect(() => { if (m.photoPath) fileUrl(m.photoPath).then(setPhoto).catch(() => {}); }, [m.photoPath]);
  const act = async (decision) => {
    if ((decision === "rejected" || decision === "suspended") && !reason.trim()) { toast?.("거절 · 정지 사유를 적어 주세요"); return; }
    setBusy(decision);
    try { await reviewMember(m.id, admin, decision, { reason, verified, bizStatus: biz }); toast?.(`${ST[decision]} 처리했습니다`); onClose(); }
    catch (e) { toast?.(e?.message || "처리하지 못했습니다"); } finally { setBusy(""); }
  };
  const rows = [["유형", ROLES[m.role]?.label], ["출처", SOURCE_LABEL[m.source]], ["이메일", m.email], ["이름", m.name], ["휴대폰", m.phone], ["회사", m.companyName], ["사업자번호", m.bizNo], ["대표자", m.ceoName], ["직책", m.managerTitle], ["허가번호", m.permitNo], ["주소", m.bizAddress],
    ...(m.vehicle ? [["차량", `${m.vehicle.plate} · ${m.vehicle.ton} ${m.vehicle.type}`], ["적재함", `${m.vehicle.length || "-"}m × ${m.vehicle.width || "-"}m`]] : []),
    ...(m.home ? [["거주", `${m.home.sido} ${m.home.sigungu || ""}`]] : []), ["주 운행", (m.regions || []).join(", ")], ["신청", m.appliedAt ? new Date(tsMs(m.appliedAt)).toLocaleString("ko-KR") : ""]].filter(([, v]) => v);
  return (
    <Drawer onClose={onClose} title={`${m.name || m.email} · ${ROLES[m.role]?.label || ""}`} sub={`${ST[m.status] || m.status}${m.rejectReason ? ` · ${m.rejectReason}` : ""}`} width={720} testid="member-review">
      <div className="flex-1 overflow-y-auto hub-scroll p-4 lg:p-5 space-y-3.5">
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-2">
            {photo ? <img src={photo} alt="" className="w-16 h-16 rounded-2xl object-cover" /> : <span className="w-16 h-16 rounded-2xl bg-[#EAF0FA] text-[#1B2B4B] inline-flex items-center justify-center text-[24px] font-extrabold">{(m.name || "?")[0]}</span>}
            <div><div className="text-[19px] font-extrabold text-[#0F1A30]">{m.name}</div><div className="text-[14.5px] text-[#8592A8]">{m.companyName}</div></div>
          </div>
          <div className="divide-y divide-[#EEF1F6]">{rows.map(([k, v]) => <div key={k} className="flex py-2 text-[15px]"><span className="w-24 shrink-0 font-semibold text-[#8592A8]">{k}</span><span className="font-bold text-[#0F1A30] break-all">{v}</span></div>)}</div>
        </Card>
        {m.source === "signup" && (
          <div className="grid sm:grid-cols-2 gap-2.5">
            {docKeys.map((k) => <DocView key={k} label={DOC_TYPES[k]} d={m.docs?.[k]} checked={verified[k]} onCheck={(v) => setVerified((p) => ({ ...p, [k]: v }))} />)}
          </div>
        )}
        <Card className="p-4 space-y-3">
          <label className="block"><span className="text-[15px] font-bold text-[#3A4A66]">사업자 상태(국세청 조회 결과)</span>
            <select className={`${selectCls} mt-1.5`} value={biz} onChange={(e) => setBiz(e.target.value)} data-testid="admin-biz">{BIZ_STATUS.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <a href="https://teht.hometax.go.kr/websquare/websquare.html?w2xPath=/ui/ab/a/a/UTEABAAA13.xml" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[14.5px] font-bold text-[#2D4C82]"><HI name="link" size={15} />홈택스 사업자 상태 조회 열기 ↗</a>
          <label className="block"><span className="text-[15px] font-bold text-[#3A4A66]">거절 · 정지 사유</span>
            <input className={`${inputCls} mt-1.5`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 통장사본 이름이 사업자와 다릅니다" data-testid="admin-reason" />
          </label>
        </Card>
      </div>
      <div className="shrink-0 p-4 lg:p-5 bg-white border-t border-[#E2E7EF] grid grid-cols-3 gap-2">
        <Btn kind="ghost" disabled={!!busy} onClick={() => act("rejected")} data-testid="admin-reject">거절</Btn>
        <Btn kind="ghost" disabled={!!busy} onClick={() => act("suspended")}>정지</Btn>
        <Btn disabled={!!busy} onClick={() => act("approved")} data-testid="admin-approve">승인</Btn>
      </div>
    </Drawer>
  );
}

export default function HubAdmin({ admin, toast }) {
  const [rows, setRows] = useState([]);
  const [reports, setReports] = useState([]);
  const [tab, setTab] = useState("pending");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  useEffect(() => subscribeAllMembers(setRows), []);
  useEffect(() => subscribeReports(setReports), []);
  const counts = useMemo(() => rows.reduce((a, m) => ({ ...a, [m.status]: (a[m.status] || 0) + 1 }), {}), [rows]);
  const list = useMemo(() => rows.filter((m) => m.status === tab && (!q || `${m.name} ${m.companyName} ${m.email} ${m.phone} ${m.vehicle?.plate || ""}`.includes(q)))
    .sort((a, b) => tsMs(b.appliedAt || b.createdAt) - tsMs(a.appliedAt || a.createdAt)), [rows, tab, q]);
  const selM = sel ? rows.find((m) => m.id === sel) : null;
  return (
    <div className="space-y-3.5" data-testid="hub-admin">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {Object.entries(ST).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`text-left rounded-[20px] px-4 py-3.5 transition ${tab === k ? "bg-[#0F1A30] text-white" : "bg-white ring-1 ring-inset ring-[#E2E7EF]"}`}>
            <div className={`text-[14px] font-bold ${tab === k ? "text-white/65" : "text-[#8592A8]"}`}>{l}</div>
            <div className="text-[28px] font-extrabold leading-tight">{counts[k] || 0}</div>
          </button>
        ))}
      </div>
      <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 회사 · 이메일 · 차량번호 검색" />
      {list.length === 0 ? <Empty title={`${ST[tab]} 회원이 없습니다`} /> : (
        <div className="grid lg:grid-cols-2 gap-2.5">
          {list.map((m) => (
            <button key={m.id} type="button" onClick={() => setSel(m.id)} data-testid="admin-member-row" className="text-left bg-white rounded-[20px] ring-1 ring-inset ring-[#E2E7EF] p-4 hover:ring-[#2D4C82] flex items-center gap-3">
              <span className="w-12 h-12 rounded-2xl bg-[#EAF0FA] text-[#1B2B4B] inline-flex items-center justify-center shrink-0"><HI name={ROLES[m.role]?.icon || "user"} size={22} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5"><span className="text-[16.5px] font-extrabold text-[#0F1A30] truncate">{m.name || m.email}</span><Badge>{ROLES[m.role]?.label}</Badge>{m.source !== "signup" && <Badge tone="sky">로지스웹</Badge>}</span>
                <span className="block text-[14.5px] text-[#55657F] truncate">{[m.companyName, m.vehicle ? `${m.vehicle.plate} ${m.vehicle.ton} ${m.vehicle.type}` : "", m.phone].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="text-[13.5px] text-[#8592A8] shrink-0">{ago(m.appliedAt || m.createdAt)}</span>
            </button>
          ))}
        </div>
      )}
      <Card className="p-4">
        <div className="text-[16px] font-extrabold text-[#0F1A30] mb-2">신고 · 노쇼 기록 {reports.length ? `(${reports.length})` : ""}</div>
        {reports.length === 0 ? <div className="text-[15px] text-[#8592A8]">접수된 신고가 없습니다.</div> : reports.slice(0, 30).map((r) => (
          <div key={r.id} className="py-2 border-t border-[#EEF1F6] text-[15px] flex gap-2"><Badge>{r.type === "noshow" ? "노쇼" : r.type}</Badge><span className="font-bold text-[#0F1A30]">{rows.find((m) => m.id === r.targetUid)?.name || r.targetUid.slice(0, 6)}</span><span className="text-[#55657F] truncate">{r.reporterName} · {r.text}</span><span className="ml-auto text-[#8592A8] shrink-0">{ago(r.createdAt)}</span></div>
        ))}
      </Card>
      {selM && <MemberReview key={selM.id} m={selM} admin={admin} toast={toast} onClose={() => setSel(null)} />}
    </div>
  );
}
