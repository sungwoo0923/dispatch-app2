// ======================= src/RateRulesPanel.jsx =======================
// 🧮 2026-11-26 사용자 요청 — 단가표(다목적지 단가표) 화면에서 "청구 규칙"을 같이 정하고 바로 계산해 보기
//  예) 에브리데이 시화 · 5톤 · 야상 = 기본 180,000 + 야상 20,000 + 대행료(지게차) 50,000 = 청구 250,000
//  · 규칙 저장소는 고정노선운임(배차관리 [특수운임 적용] › 고정노선운임)과 같다 — 여기서 고치면 오더 등록 · 구글시트 가져오기에도 그대로 적용
//  · 이 단가표의 거래처(규칙 거래처) 것만 보인다(트레이더스 ○○ = 에브리데이 ○○ · 에이제이 = 제이글로벌)
//  · [계산해 보기]: 하차지 · 톤수 · 도착 구분(당착 · 야상 · 익착 · 월착)을 고르면 단가표 금액 + 규칙 = 청구운임 · 기사운임
import React from "react";
import RouteSpecialPresets from "./RouteSpecialPresets";
import { useRoutePresets } from "./routePreset";
import { applyRoutePresets } from "./routePresetApply";
import { aliasKeys } from "./jyAliases";

const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const num = (v) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// 단가표 이름 → 규칙 거래처(예: "에이제이(제이글로벌)" · "제이글로벌" → "에이제이")
export function ruleClientOf(sheet) {
  if (sheet?.ruleClient) return String(sheet.ruleClient).trim();
  const base = String(sheet?.baseName || "").replace(/[(（].*$/, "").trim();
  if (!base || base === "새 기준지") return "";
  return aliasKeys(base).includes("에이제이") ? "에이제이" : base;
}

const ARR = [["당착", "당착"], ["야상", "야상(야간 상차)"], ["익착", "익착"], ["월착", "월착"]];

export default function RateRulesPanel({ sheet, onPatch }) {
  const myRole = (() => { try { return localStorage.getItem("role") || ""; } catch { return ""; } })();
  const canEdit = !["viewer", "driver", "shipper", "cafeUser"].includes(myRole);
  const canAdmin = ["admin", "allMgr", "test", "totalMaster"].includes(myRole);
  const client = ruleClientOf(sheet);
  const presets = useRoutePresets();
  const rows = (sheet?.rows || []).filter((r) => String(r.name || "").trim());
  const cols = (sheet?.columns || []).filter((c) => /\d/.test(String(c.label || "")));
  const [open, setOpen] = React.useState(false);
  const [rowId, setRowId] = React.useState("");
  const [colId, setColId] = React.useState("");
  const [arr, setArr] = React.useState("당착");
  const row = rows.find((r) => r.id === rowId) || rows[0];
  const col = cols.find((c) => c.id === colId) || cols.find((c) => num(row?.prices?.[c.id]) > 0) || cols[0];
  const base = row && col ? num(row.prices?.[col.id]) : 0;
  const buyBase = row && col ? num(row.buyPrices?.[col.id]) : 0;

  const calc = React.useMemo(() => {
    if (!row || !col || !base || !client) return null;
    const d = new Date();
    if (arr === "월착") while (d.getDay() !== 5) d.setDate(d.getDate() + 1); // 금요일 상차
    const drop = new Date(d);
    if (arr === "익착") drop.setDate(drop.getDate() + 1);
    if (arr === "월착") drop.setDate(drop.getDate() + 3);
    const order = {
      거래처명: client, 상차지명: String(sheet?.baseName || "").replace(/[(（].*$/, "").trim() || client, 하차지명: row.name,
      상차일: ymd(d), 하차일: ymd(drop), 상차시간: arr === "야상" ? "야상" : "", 메모: arr === "당착" || arr === "야상" ? "" : arr,
      차량톤수: col.label, 청구운임: String(base), 기사운임: String(buyBase || 0),
    };
    const out = applyRoutePresets(order, presets);
    const items = [
      ...(num(out.지게차비용) > 0 ? [{ 이름: "지게차비용(대행료)", 금액: num(out.지게차비용), 부담: out.지게차부담 || "기사" }] : []),
      ...(out.특수운임 || []).filter((x) => num(x.금액) > 0).map((x) => ({ 이름: x.이름 || x.종류, 금액: num(x.금액), 부담: x.부담, 받는사람: x.받는사람 })),
    ];
    return { sale: num(out.청구운임), buy: num(out.기사운임), items };
  }, [row, col, base, buyBase, arr, client, presets, sheet?.baseName]);

  if (!sheet) return null;
  const chip = (on) => `h-9 px-3 rounded-lg text-[13px] font-extrabold border ${on ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#1B2B4B] border-[#DCE3EE]"}`;
  const sel = "h-10 px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#0F1A30]";
  const effect = (it) => (it.부담 === "청구" ? (it.받는사람 === "기사" ? "청구 + · 기사운임 +" : "청구 +") : it.부담 === "기사" ? "기사운임에서 차감" : "회사 부담");
  return (
    <div className="bg-white rounded-[20px] border border-[#E3E8F0] p-5" data-rate-rules="1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B]" />
        <span className="text-[10.5px] font-extrabold tracking-[0.22em] text-[#9AA9C3]">RULES</span>
        <span className="text-[15px] font-black text-[#0F1A30]">청구 규칙 · 계산해 보기</span>
        <span className="text-[12.5px] font-bold text-[#7A89A3]">야상 · 대행료(지게차) · 익착 · 월착처럼 단가에 더해지는 금액</span>
        <button type="button" onClick={() => setOpen((v) => !v)} className="ml-auto h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[13px] font-extrabold text-[#1B2B4B]">{open ? "규칙 목록 접기" : "규칙 보기 · 고치기"}</button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] font-bold text-[#3A4A66]">
        규칙 거래처
        <input key={sheet.id + "-rc"} defaultValue={client} placeholder="예: 에이제이" disabled={!canEdit}
          onBlur={(e) => { const v = e.target.value.trim(); if (v !== client) onPatch?.({ ruleClient: v }); }}
          className="h-9 w-40 px-3 rounded-lg border border-[#DCE3EE] text-[14px] font-bold text-[#0F1A30]" />
        <span className="text-[12px] text-[#9AA9C3]">오더 거래처가 이 이름이면 아래 규칙이 붙어요 · 트레이더스 ○○ = 에브리데이 ○○</span>
      </div>

      {/* 계산해 보기 */}
      <div className="mt-4 rounded-2xl bg-[#F5F8FD] border border-[#E3E8F0] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select className={sel} value={row?.id || ""} onChange={(e) => setRowId(e.target.value)} aria-label="하차지">
            {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select className={sel} value={col?.id || ""} onChange={(e) => setColId(e.target.value)} aria-label="톤수">
            {cols.map((c) => <option key={c.id} value={c.id}>{c.label}{num(row?.prices?.[c.id]) ? ` · ${won(row.prices[c.id])}` : " · 단가 없음"}</option>)}
          </select>
          {ARR.map(([k, l]) => <button key={k} type="button" className={chip(arr === k)} onClick={() => setArr(k)}>{l}</button>)}
        </div>
        {!client ? <div className="mt-3 text-[13px] font-bold text-[#B45309]">위 '규칙 거래처'를 넣어 주세요.</div>
          : !base ? <div className="mt-3 text-[13px] font-bold text-[#B45309]">이 하차지 · 톤수에는 단가가 없어요.</div>
          : calc && (
            <div className="mt-3 grid gap-1.5 text-[14px]">
              <div className="flex justify-between"><span className="text-[#5B6B85] font-bold">단가표 금액 ({row.name} · {col.label})</span><b className="tabular-nums">{won(base)}</b></div>
              {calc.items.length === 0 && <div className="text-[13px] font-bold text-[#7A89A3]">붙는 규칙이 없어요.</div>}
              {calc.items.map((it, i) => (
                <div key={i} className="flex justify-between"><span className="text-[#5B6B85] font-bold">+ {it.이름} <span className="text-[12px] text-[#9AA9C3]">({effect(it)})</span></span><b className="tabular-nums">{won(it.금액)}</b></div>
              ))}
              <div className="mt-1 pt-2 border-t border-[#DCE3EE] flex justify-between text-[16px]"><b>청구운임</b><b className="tabular-nums text-[#0F1A30]">{won(calc.sale)}원</b></div>
              {(buyBase > 0 || calc.buy > 0) && <div className="flex justify-between"><span className="text-[#5B6B85] font-bold">기사운임{buyBase ? "" : " (단가표에 기사 단가 없음 → 규칙만)"}</span><b className="tabular-nums">{won(calc.buy)}원</b></div>}
            </div>
          )}
      </div>

      {open && (
        <div className="mt-4">
          <div className="mb-2 text-[12.5px] font-bold text-[#5B6B85]">여기 규칙은 배차관리 [특수운임 적용] › 고정노선운임과 같아요. 상차지 · 하차지를 비우면 이 거래처 모든 노선(예: 야상 +20,000), 하차지를 넣으면 그 하차지만(예: 에브리데이 시화 대행료 50,000).</div>
          <RouteSpecialPresets client={client} canEdit={canEdit} canAdmin={canAdmin} />
        </div>
      )}
    </div>
  );
}
