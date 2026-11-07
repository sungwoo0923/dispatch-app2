// ======================= cafe-site/src/hub/HubPlaces.jsx =======================
// ⭐ 2026-11-07 (3차) 고객관리 — 허브 전용 회원(화주 · 운송사)의 상·하차지 목록
//  오더를 올릴 때마다 서버가 상하차지명 · 주소 · 담당자 · 연락처를 자동 저장한다(functions/hubSync.js savePlacesFromOrder).
//  여기서 고치고 · 지우고 · 새로 넣을 수 있고, 화물등록의 상하차지명 칸에서 골라 쓴다.
//  같은 회사(회사 키)끼리만 보이고, 다른 회사는 규칙이 막는다. 로지스웹 계정은 이 메뉴 대신 로지스웹 상하차지거래처를 쓴다.
import React, { useEffect, useMemo, useState } from "react";
import { HI, Btn, Card, Drawer, Empty, Field, inputCls, Confirm } from "./hubUi";
import { fmtPhone, regionFromAddress, ago } from "./hubConstants";
import { subscribeHubPlaces, saveHubPlace, deleteHubPlace } from "./hubApi";
import { AddressInput } from "./hubAddress";

function PlaceEdit({ me, p, onClose, toast }) {
  const [v, setV] = useState({ 이름: p?.이름 || "", 주소: p?.주소 || "", 담당자: p?.담당자 || "", 연락처: p?.연락처 || "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { const r = regionFromAddress(v.주소); await saveHubPlace(me, p?.id, { ...v, 시도: r.sido, 시군구: r.sigungu }); toast?.(p?.id ? "고쳤어요" : "저장했어요"); onClose(); }
    catch (e) { toast?.(e?.message || "저장하지 못했어요"); } finally { setBusy(false); }
  };
  return (
    <Drawer onClose={onClose} title={p?.id ? "고객 정보 고치기" : "고객 추가"} width={520} testid="place-edit">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <Field label="상하차지명"><input className={inputCls} value={v.이름} onChange={(e) => setV((x) => ({ ...x, 이름: e.target.value.slice(0, 60) }))} placeholder="선택 사항" data-testid="pl-name" /></Field>
        <Field label="주소" required><AddressInput value={v.주소} onChange={(a) => setV((x) => ({ ...x, 주소: a }))} testid="pl-addr" /></Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="담당자"><input className={inputCls} value={v.담당자} onChange={(e) => setV((x) => ({ ...x, 담당자: e.target.value.slice(0, 40) }))} data-testid="pl-mgr" /></Field>
          <Field label="연락처"><input className={inputCls} inputMode="numeric" value={v.연락처} onChange={(e) => setV((x) => ({ ...x, 연락처: fmtPhone(e.target.value) }))} data-testid="pl-phone" /></Field>
        </div>
      </div>
      <div className="p-4 bg-white border-t border-[#E2E7EF] pb-[max(16px,env(safe-area-inset-bottom))]"><Btn size="xl" className="w-full" disabled={busy || v.주소.trim().length < 2} onClick={save} data-testid="pl-save">{busy ? "저장하고 있어요" : "저장"}</Btn></div>
    </Drawer>
  );
}

export default function HubPlaces({ me, toast }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [ed, setEd] = useState(null);
  const [del, setDel] = useState(null);
  useEffect(() => subscribeHubPlaces(me, setRows), [me.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => { const k = q.replace(/\s+/g, ""); return (rows || []).filter((p) => !k || `${p.이름}${p.주소}${p.담당자}${p.연락처}`.replace(/\s+/g, "").includes(k)); }, [rows, q]);
  return (
    <div className="space-y-3 max-w-[1100px]" data-testid="places-view">
      <div className="flex gap-2">
        <div className="relative flex-1"><HI name="search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8592A8]" /><input className={`${inputCls} pl-10`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름, 주소, 담당자" data-testid="pl-q" /></div>
        <Btn onClick={() => setEd({})} data-testid="pl-add"><HI name="plus" size={17} />추가</Btn>
      </div>
      <div className="text-[13.5px] text-[#8592A8] px-1">화물을 등록하면 상차지와 하차지가 여기 저장돼요. {rows ? `${rows.length}곳` : ""}</div>
      {rows && shown.length === 0 ? <Empty icon="pin" title={q ? "찾는 곳이 없어요" : "저장한 곳이 없어요"} /> : (
        <div className="grid lg:grid-cols-2 gap-2.5" data-testid="places-list">
          {shown.map((p) => (
            <Card key={p.id} className="p-4 flex items-start gap-3" data-testid="place-row">
              <span className="w-11 h-11 rounded-2xl bg-[#EAF0FA] text-[#1B2B4B] inline-flex items-center justify-center shrink-0"><HI name="pin" size={19} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-extrabold text-[#0F1A30] truncate">{p.이름 || p.주소}</div>
                {p.이름 && <div className="text-[14px] text-[#55657F] truncate">{p.주소}</div>}
                <div className="text-[13.5px] text-[#8592A8] truncate">{[p.담당자, p.연락처].filter(Boolean).join(" ") || "담당자 없음"}{p.count ? `  ${p.count}번 사용` : ""}{p.lastUsedAt ? `  ${ago(p.lastUsedAt)}` : ""}</div>
              </div>
              <div className="flex flex-col gap-1 shrink-0"><Btn kind="ghost" size="md" onClick={() => setEd(p)} data-testid="pl-edit">고치기</Btn><Btn kind="ghost" size="md" onClick={() => setDel(p)} data-testid="pl-del">지우기</Btn></div>
            </Card>
          ))}
        </div>
      )}
      {ed && <PlaceEdit me={me} p={ed.id ? ed : null} onClose={() => setEd(null)} toast={toast} />}
      {del && <Confirm title="지울까요?" body={del.이름 || del.주소} okText="지우기" onCancel={() => setDel(null)} onOk={() => deleteHubPlace(del.id).then(() => { toast?.("지웠어요"); setDel(null); }).catch(() => toast?.("지우지 못했어요"))} />}
    </div>
  );
}
