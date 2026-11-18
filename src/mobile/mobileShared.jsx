// ⭐ 2026-11-17 모바일 공용 조각 — MobileApp.jsx 안에 복사·붙여넣기로 2~3벌씩 있던 화면을
// 한 곳으로 모았다. 문구·동작을 고칠 때 여기 한 번만 고치면 모든 화면에 같이 반영된다.
//  1) 업로드 요청 문자(배차현황 · 미배차 길게 누르기 메뉴)        → buildSingleUploadMsg / sendSingleUploadSms
//  2) 첨부파일 보기 + 업로드 요청 문자 팝업(카드 · 상세보기)        → MobileAttachSheet
//  3) 운임 조회 결과 / 운송 이력 상세(상세보기 · 오더 등록/수정)     → FareHistorySheet / FareHistoryDetailSheet
//  4) 기사 정보 충돌 팝업(빠른 수정 · 상세보기 · 오더 등록/수정)     → DriverConflictSheet
import React, { useState } from "react";
import { Scale, Package } from "lucide-react";
import { withCo } from "../fsTenant";
import { saveDriverChoice } from "../DriverEditChoice";
import { orderProfit } from "../forklift";
import { SpecialFareTag, SpecialFareLine } from "../specialFareTag"; // 🏷 2026-11-18 운임조회 이력 — 특수운임 붙은 오더 표시
import MobileSelect from "./MobileSelect";

// ────────────────────────────────────────────────────────────────
// 1) 업로드 요청 문자
// ────────────────────────────────────────────────────────────────
export const buildSingleUploadMsg = (order) => {
  const baseUrl = window.location.origin;
  const date = (order.상차일 || "").slice(0, 10);
  let dateLabel = "";
  if (date) {
    const [, m, d] = date.split("-");
    if (m && d) dateLabel = `${parseInt(m)}월 ${parseInt(d)}일`;
  }
  const timeLabel = order.상차시간 || "";
  const from = order.상차지명 || "";
  const to = order.하차지명 || "";
  const vehicleType = String(order.차량종류 || order.차종 || "");
  const isCold = vehicleType.includes("냉장") || vehicleType.includes("냉동");
  const cargoLine = isCold
    ? "파렛전표, 거래명세서, 타코기록지 등"
    : "파렛전표, 거래명세서 등";
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  const vehicle = (order.차량번호 || "").replace(/\s/g, "");
  if (vehicle) params.set("vehicle", vehicle);
  const name = (order.이름 || order.기사명 || "").trim();
  if (name) params.set("name", name);
  const url = withCo(`${baseUrl}/driver-upload?${params.toString()}`);
  const header = `안녕하세요. ${[dateLabel, timeLabel, from && to ? `${from} → ${to}` : (from || to)].filter(Boolean).join(" ")}`;
  return [
    header,
    "관련 서류가 아직 업로드되지 않았습니다.",
    "미업로드 시 운임 지급이 지연될 수 있습니다.",
    "",
    "아래 링크에서 업로드 부탁드립니다.",
    cargoLine,
    "서류는 반드시 한 장씩 찍어서 올려주세요.",
    "(전표·명세서가 없는 경우 문자로 '없음'이라고 회신해 주세요)",
    "",
    "여기를 눌러 업로드해주세요",
    url,
  ].join("\n");
};
// 기사 번호가 있으면 문자 앱을 내용까지 채워 열고, 없으면 내용을 복사해 둔다.
export const sendSingleUploadSms = (order) => {
  const phone = (order.전화번호 || "").replace(/[^0-9]/g, "");
  const msg = buildSingleUploadMsg(order);
  if (phone) {
    window.location.href = `sms:${phone}?body=${encodeURIComponent(msg)}`;
  } else {
    navigator.clipboard.writeText(msg).catch(() => {});
  }
};

// ────────────────────────────────────────────────────────────────
// 2) 첨부파일 보기 + 업로드 요청 문자 팝업
//  - 파일 목록 · 저장 상태 · 완료처리는 부르는 쪽이 갖고(Firestore 쓰는 곳이 화면마다 다르다),
//    크게 보기 · 다시 저장 확인 · 문자 확인 같은 화면 안 상태는 여기서 갖는다.
//  - banner: 전체저장 버튼 아래에 끼울 내용(카드 첨부 팝업의 재업로드 허용 줄)
// ────────────────────────────────────────────────────────────────
export function MobileAttachSheet({
  order, items, loading, saveStates,
  onSaveFile,            // (item, filename?) => 실제 저장 + 저장 상태 기록
  isViewed, viewedBusy, onToggleViewed,
  onClose, showToast, showSuccess,
  buildUploadSms,        // (order) => 업로드 요청 문자 내용
  isSignatureItem, buildFileName,
  banner = null,
}) {
  const [selected, setSelected] = useState(null);
  const [confirmItem, setConfirmItem] = useState(null);
  const [smsUploadConfirm, setSmsUploadConfirm] = useState(false);

  const handleSave = (item) => {
    if (saveStates[item.id] === "success") { setConfirmItem(item); return; }
    onSaveFile(item);
  };
  // ✅ 전체저장 (서명 이미지는 제외, PC와 동일한 파일명 규칙)
  const handleSaveAll = () => {
    const targets = items.filter(it => !isSignatureItem(it));
    if (!targets.length) return;
    targets.forEach((item, i) => setTimeout(() => onSaveFile(item, buildFileName(order, item, i, targets.length)), i * 400));
  };
  // ⭐ 첨부파일을 안 올린 기사에게 원버튼으로 업로드 요청 문자를 보낸다. 웹앱은
  // SMS를 직접 발송할 수 없어 sms: 링크로 문자 앱을 내용까지 채워 열어주는
  // 데까지만 가능하다 — 전송은 문자 앱에서 한 번 더 눌러야 한다.
  const handleSendUploadSms = () => {
    const phone = (order.전화번호 || "").replace(/[^0-9]/g, "");
    if (!phone) { showToast?.("기사 전화번호가 없어 문자를 보낼 수 없습니다."); return; }
    const msg = buildUploadSms(order);
    window.location.href = `sms:${phone}?body=${encodeURIComponent(msg)}`;
    (showSuccess || showToast)?.("문자 앱을 열었습니다. 전송 버튼을 눌러 완료해주세요.");
  };
  const saveCls = (id) => saveStates[id] === "success" ? "bg-emerald-500" : saveStates[id] === "fail" ? "bg-red-500" : "bg-[#1B2B4B]";
  const saveLabel = (id) => saveStates[id] === "success" ? "저장완료" : saveStates[id] === "fail" ? "저장실패" : "저장";

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 핸들바 */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#1B2B4B] flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <div>
              <div className="font-bold text-[15px] text-[#1B2B4B]">
                첨부파일
                {!loading && <span className="text-[12px] font-normal text-gray-400 ml-1">{items.length}장</span>}
              </div>
              <div className="text-[11px] text-gray-400 truncate max-w-[220px]">
                {order.상차지명} → {order.하차지명}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-lg font-bold">×</button>
        </div>
        {items.length > 1 && (
          <div className="px-4 pt-3 shrink-0">
            <button
              onClick={handleSaveAll}
              className="w-full py-2 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-bold"
            >
              전체저장 ({items.length}장)
            </button>
          </div>
        )}
        {banner}
        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-[#1B2B4B] rounded-full animate-spin" />
              <span className="text-sm">불러오는 중...</span>
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div className="text-sm text-gray-400 font-medium">업로드된 파일이 없습니다</div>
              <div className="text-xs text-gray-300">기사님께 인수증 업로드를 요청해 주세요.</div>
              <button
                onClick={() => setSmsUploadConfirm(true)}
                className="mt-1 px-4 py-2 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-bold"
              >
                업로드 요청 문자 보내기
              </button>
            </div>
          )}
          {!loading && items.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {items.map(item => (
                <div key={item.id} className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                  <div className="aspect-[4/3] bg-gray-50 cursor-pointer relative" onClick={() => setSelected(item)}>
                    <img
                      src={item.base64 || item.url}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      onError={e => { e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center text-gray-300 text-xs">미리보기 없음</div>'; }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 active:bg-black/10">
                      <span className="text-white text-[10px] font-bold bg-black/40 px-1.5 py-0.5 rounded-full opacity-0 active:opacity-100">확대</span>
                    </div>
                  </div>
                  <div className="px-2.5 py-2 bg-white">
                    <div className="text-[10px] text-gray-400 truncate mb-1.5">{item.name || "파일"}{item.sizeKB ? ` · ${item.sizeKB}KB` : ""}</div>
                    <button
                      onClick={() => handleSave(item)}
                      className={`w-full py-1.5 rounded-lg text-white text-[11px] font-bold transition-colors ${saveCls(item.id)}`}
                    >
                      {saveLabel(item.id)}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* 완료처리/미완료 — 파일을 안 올려도(카톡·이메일 등 다른 경로로 받았을 때)
            수동으로 완료 표시하거나, 되돌릴 수 있다. PC 첨부현황과 같은 attachViewed
            필드라 여기서 바꾸면 PC 화면에도 그대로 반영된다. */}
        <div className="border-t border-gray-100 px-4 py-3 shrink-0 flex items-center justify-between gap-2">
          <span className="text-[11px] text-gray-400">파일 확인 여부를 수동으로 표시할 수 있어요</span>
          <button
            onClick={onToggleViewed}
            disabled={viewedBusy}
            className={`px-4 py-2 rounded-lg text-[12px] font-bold whitespace-nowrap transition disabled:opacity-50 ${
              isViewed ? "bg-[#1B2B4B] text-white" : "bg-white border border-gray-300 text-gray-600"
            }`}
          >
            {viewedBusy ? "처리중..." : isViewed ? "미완료" : "완료처리"}
          </button>
        </div>
      </div>
      {/* 전체화면 이미지 뷰 */}
      {selected && (
        <div className="absolute inset-0 bg-black/95 z-10 flex flex-col items-center justify-center" onClick={() => setSelected(null)}>
          <img src={selected.base64 || selected.url} alt="full" className="max-w-full max-h-[75vh] object-contain" onClick={e => e.stopPropagation()} />
          <button className="absolute top-4 left-4 w-10 h-10 bg-white/15 rounded-full text-white flex items-center justify-center text-sm font-bold" onClick={() => setSelected(null)}>닫기</button>
          <button
            className={`absolute bottom-8 right-6 px-5 py-2.5 text-white rounded-xl text-sm font-bold transition-colors ${saveCls(selected.id)}`}
            onClick={e => { e.stopPropagation(); handleSave(selected); }}
          >
            {saveLabel(selected.id)}
          </button>
        </div>
      )}
      {confirmItem && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50" onClick={() => setConfirmItem(null)}>
          <div className="bg-white rounded-2xl mx-6 p-5 w-full max-w-xs shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div className="text-[15px] font-bold text-[#1B2B4B] mb-1">이미 저장된 파일</div>
            <div className="text-[13px] text-gray-500 mb-4">이미 저장하신 파일입니다.<br />다시 저장하시겠습니까?</div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmItem(null)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-[13px]">취소</button>
              <button onClick={() => { onSaveFile(confirmItem); setConfirmItem(null); }} className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white font-bold text-[13px]">다시 저장</button>
            </div>
          </div>
        </div>
      )}
      {smsUploadConfirm && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50" onClick={() => setSmsUploadConfirm(false)}>
          <div className="bg-white rounded-2xl mx-6 p-5 w-full max-w-xs shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-[15px] font-bold text-[#1B2B4B] mb-2">업로드 요청 문자 발송</div>
            <div className="text-[13px] text-gray-500 mb-4">
              <span className="font-semibold text-[#1B2B4B]">{order.기사명 || order.이름 || "기사"}</span>님에게 서류 업로드 요청 문자를 보내시겠습니까?
            </div>
            <div className="flex gap-2">
              <button onClick={() => setSmsUploadConfirm(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-[13px]">아니오</button>
              <button onClick={() => { handleSendUploadSms(); setSmsUploadConfirm(false); }} className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white font-bold text-[13px]">예</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 3) 운임 조회 결과 / 운송 이력 상세
// ────────────────────────────────────────────────────────────────
// 운임조회 결과 정렬(추천/최신/금액) — PC의 sortFareHistory와 동일한 규칙.
const FARE_SORT_OPTIONS_MOBILE = [
  { value: "relevance", label: "추천순" },
  { value: "latest", label: "최신순" },
  { value: "price_high", label: "금액 높은순" },
  { value: "price_low", label: "금액 낮은순" },
];
export function sortFareHistoryMobile(list, mode, dateKey = "상차일", fareKey = "청구운임") {
  const arr = Array.isArray(list) ? [...list] : [];
  const getDate = (r) => r[dateKey] || r.order?.[dateKey] || "";
  const getFare = (r) => Number(String(r[fareKey] ?? r.claim ?? 0).replace(/[^\d]/g, ""));
  if (mode === "latest") return arr.sort((a, b) => getDate(b).localeCompare(getDate(a)));
  if (mode === "price_high") return arr.sort((a, b) => getFare(b) - getFare(a));
  if (mode === "price_low") return arr.sort((a, b) => getFare(a) - getFare(b));
  return arr;
}
export function FareSortDropdownMobile({ value, onChange }) {
  return (
    <MobileSelect
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-[12px] font-bold text-[#1B2B4B] border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none bg-white"
      compact
      title="정렬"
    >
      {FARE_SORT_OPTIONS_MOBILE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </MobileSelect>
  );
}

// ── 주소에서 지역 키워드 추출 ──
const extractFareArea = (addr = "") => {
  const s = String(addr).trim(); if (!s) return "";
  const metros = ["서울","부산","인천","대구","대전","광주","울산","세종","제주"];
  for (const c of metros) { if (s.startsWith(c)) return c; }
  const parts = s.split(/\s+/);
  if (parts.length >= 2) return parts[1].replace(/[시군구]$/, "");
  return parts[0].replace(/[도시군구]$/, "") || "";
};

// 운임 조회 결과 시트.
//  query: { pickupAddr, dropAddr, carType, cargo, ton, client } — 지금 오더(또는 입력 중인 칸)
//  showCargoTonInHeader: 머리 줄에 화물·톤수도 보여줄지(오더 등록/수정 화면)
//  relaxEmptyInputs: 화물·톤수 칸이 비어 있으면 그 조건은 맞은 걸로 보고 "완전일치"를 따진다(오더 등록/수정 화면)
//  onApply(claim, drv|null, kind, item?) — kind: "quick"(범위·평소 운임 버튼) · "row"(목록 줄) · "detail"(운송 이력 상세)
//  fmtAddr · VehicleIcon — 목록 줄의 짧은 주소 · 차종 아이콘(MobileApp.jsx의 것을 넘겨받는다)
export function FareHistorySheet({
  matches, historyLoading, query, showCargoTonInHeader = false, relaxEmptyInputs = false,
  filter, setFilter, sortMode, setSortMode,
  onClose, onApply, onOpenDetail, fmtAddr, VehicleIcon,
}) {
  const q = query || {};
  const hasClientMatch = matches.some(r => r.isClientMatch);
  const pA = extractFareArea(q.pickupAddr || "");
  const dA = extractFareArea(q.dropAddr || "");
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: "rgba(15,25,50,0.97)" }}>
      <div className="flex-1 min-h-[56px]" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl flex flex-col" style={{ maxHeight: "calc(100dvh - 56px)" }} onClick={e => e.stopPropagation()}>
        {/* 핸들바 */}
        <div className="flex justify-center pt-3 pb-0 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        {/* 헤더 */}
        <div className="bg-[#1B2B4B] px-5 py-4 shrink-0 rounded-t-none">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-white font-bold text-[16px]">운임 조회 결과</div>
              <div className="text-white/60 text-[11px] mt-0.5 flex flex-wrap gap-1 items-center">
                {pA && <span>{pA}</span>}
                {pA && dA && <span className="text-white/30">→</span>}
                {dA && <span>{dA}</span>}
                {q.carType && <><span className="text-white/30">·</span><span>{q.carType}</span></>}
                {showCargoTonInHeader && q.cargo && <><span className="text-white/30">·</span><span>{q.cargo}</span></>}
                {showCargoTonInHeader && q.ton && <><span className="text-white/30">·</span><span>{q.ton}</span></>}
                {q.client && hasClientMatch && <><span className="text-white/30">·</span><span className="text-white/90 font-bold">{q.client}</span></>}
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-lg shrink-0">×</button>
          </div>
        </div>
        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto overscroll-contain" data-fare-scroll>
          {historyLoading > 0 && matches.length === 0 && <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-[#EEF2F8] text-[#1B2B4B] text-[12px] font-bold flex items-center gap-2"><span className="w-3 h-3 border-2 border-[#1B2B4B]/30 border-t-[#1B2B4B] rounded-full animate-spin" />운임 이력을 불러오는 중…</div>}
          {(() => {
            const hasCargoInput = relaxEmptyInputs ? !!(q.cargo || "").trim() : true;
            const hasTonInput = relaxEmptyInputs ? !!(q.ton || "").trim() : true;
            const getLabel = (r) => {
              const ce = r.tags.includes("화물일치");
              const cp = r.tags.includes("화물유사");
              const te = r.tags.includes("톤수일치");
              const re = r.tags.includes("지명일치") || r.tags.includes("거래처일치");
              if ((!hasCargoInput || ce) && (!hasTonInput || te) && re) return "완전일치";
              if (ce || cp) return "부분일치";
              if (te) return "톤수일치";
              return "노선일치";
            };
            const validMatches = matches.filter(r => r.claim > 0);
            const counts = { "완전일치": 0, "부분일치": 0, "톤수일치": 0, "노선일치": 0 };
            validMatches.forEach(r => { const l = getLabel(r); counts[l] = (counts[l] || 0) + 1; });
            const visibleMatches = sortFareHistoryMobile(
              filter === "all"
                ? validMatches
                : validMatches.filter(r => getLabel(r) === filter),
              sortMode, "dateStr", "claim"
            );
            const claims = visibleMatches.map(r => r.claim).filter(v => v > 0);
            const fareMin = claims.length ? Math.min(...claims) : 0;
            const fareMax = claims.length ? Math.max(...claims) : 0;
            const fareRange = fareMax - fareMin || 1;
            const getBarPct = (f) => fareRange > 0 ? Math.min(100, Math.max(0, ((f - fareMin) / fareRange) * 100)) : 50;
            const tabs = ["all", "완전일치", "부분일치", "톤수일치", "노선일치"];

            // ⭐ PC 운임조회와 동일한 로직 — 평균 대신 "대표 운임(최빈값)"을 쓰고,
            // 지금 이 오더(입력한) 톤수 이하 이력만으로 범위를 좁힌다.
            const extractTon = (s = "") => { const m = String(s).replace(/\s+/g, "").match(/(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null; };
            const rangeTonInput = extractTon(q.ton || "");
            const rangeFares = validMatches
              .map(r => ({ fare: r.claim, ton: extractTon(r.order?.차량톤수 || r.order?.톤수 || "") }))
              .filter(x => rangeTonInput == null ? true : (x.ton != null && x.ton <= rangeTonInput));
            const rangeCount = rangeFares.length;
            const rangeMin = rangeCount ? Math.min(...rangeFares.map(x => x.fare)) : null;
            const rangeMax = rangeCount ? Math.max(...rangeFares.map(x => x.fare)) : null;
            let rangeModeFare = null, rangeModeCount = 0;
            if (rangeCount) {
              const freq = new Map();
              rangeFares.forEach(x => freq.set(x.fare, (freq.get(x.fare) || 0) + 1));
              freq.forEach((cnt, fare) => { if (cnt > rangeModeCount) { rangeModeCount = cnt; rangeModeFare = fare; } });
            }
            const getRangeBarPct = (fare) => {
              if (rangeMin == null || rangeMax == null) return 50;
              const range = rangeMax - rangeMin || 1;
              return Math.min(100, Math.max(0, ((fare - rangeMin) / range) * 100));
            };
            // 동일 조건(완전일치)의 평소 운임(최빈값) — 이례적 청구 판별용
            const tier0Rows = validMatches.filter(r => getLabel(r) === "완전일치");
            let modeFare = null, modeCount = 0;
            if (tier0Rows.length) {
              const freq = new Map();
              tier0Rows.forEach(r => freq.set(r.claim, (freq.get(r.claim) || 0) + 1));
              freq.forEach((cnt, fare) => { if (cnt > modeCount) { modeCount = cnt; modeFare = fare; } });
            }
            const modeSharePct = tier0Rows.length > 0 ? Math.round((modeCount / tier0Rows.length) * 100) : 0;
            const isOutlierRow = (r) => {
              if (getLabel(r) !== "완전일치" || !modeFare) return false;
              const freq = tier0Rows.filter(t => t.claim === r.claim).length;
              return freq === 1 && Math.abs(r.claim - modeFare) / modeFare >= 0.05;
            };

            if (validMatches.length === 0) return (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <div className="text-sm">유사한 과거 이력이 없습니다</div>
              </div>
            );

            return (
              <>
                {q.client && !hasClientMatch && (
                  <div className="mx-4 mt-3 mb-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span className="text-[11px] text-gray-600 font-semibold">{q.client} 이력 없음 · 동일 노선 다른 거래처 이력</span>
                  </div>
                )}

                {/* 운임 범위 요약 — 톤수 이하 이력만 */}
                {claims.length > 0 && (
                  <div className="px-5 py-4 border-b border-gray-100">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                      조회 운임 범위 ({rangeCount}건{rangeTonInput != null ? ` · ${q.ton || rangeTonInput + "톤"} 이하` : ""})
                    </div>
                    {rangeCount === 0 ? (
                      <div className="py-4 text-center text-[12px] font-semibold text-gray-400">입력한 톤수 이하의 과거 이력이 없습니다.</div>
                    ) : (
                    <>
                    <div className="flex items-baseline gap-2 mb-3">
                      <span className="text-[26px] font-black text-[#1B2B4B] leading-none">{rangeMin.toLocaleString()}</span>
                      <span className="text-[16px] font-bold text-gray-300">~</span>
                      <span className="text-[26px] font-black text-[#1B2B4B] leading-none">{rangeMax.toLocaleString()}</span>
                      <span className="text-[13px] font-semibold text-gray-400 mb-0.5">원</span>
                    </div>
                    <div className="relative h-2 bg-gray-100 rounded-full mb-1.5">
                      <div className="absolute inset-0 bg-gray-200 rounded-full" />
                      <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#1B2B4B] border-2 border-white shadow-md z-10"
                        style={{ left: `calc(${getRangeBarPct(rangeModeFare)}% - 6px)` }} />
                    </div>
                    <div className="flex justify-between text-[10px] font-semibold text-gray-400">
                      <span>최저 {rangeMin.toLocaleString()}원</span>
                      <span className="text-[#1B2B4B] font-bold">대표 {rangeModeFare.toLocaleString()}원</span>
                      <span>최고 {rangeMax.toLocaleString()}원</span>
                    </div>
                    {/* 빠른 적용 버튼 */}
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {[
                        { label: "최저 운임", sub: "가장 저렴한 이력", value: rangeMin },
                        { label: "대표 운임", sub: `최다 청구(${rangeModeCount}건)`, value: rangeModeFare },
                        { label: "최고 운임", sub: "가장 높은 이력", value: rangeMax },
                      ].map(({ label, sub, value }) => (
                        <button key={label}
                          onClick={() => onApply(value, null, "quick")}
                          className="rounded-xl border border-gray-200 bg-gray-50 py-2.5 text-center active:scale-95 transition">
                          <div className="text-[11px] font-bold text-gray-500 mb-1">{label}</div>
                          <div className="text-[15px] font-extrabold text-[#1B2B4B]">{value.toLocaleString()}</div>
                          <div className="text-[10.5px] text-gray-400 mt-0.5 leading-tight">{sub}</div>
                        </button>
                      ))}
                    </div>
                    </>
                    )}
                  </div>
                )}

                {/* 과거 기록 목록 */}
                <div className="px-4 py-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[13px] font-extrabold text-[#1B2B4B]">과거 운송 기록</span>
                    <FareSortDropdownMobile value={sortMode} onChange={setSortMode} />
                  </div>

                  {/* 대표운임(최빈값) — 지금과 같은 조건에서 가장 자주 청구된 "평소 가격" */}
                  {modeFare != null && (
                    <div className="mb-1 px-4 py-3 bg-[#1B2B4B]/5 border border-[#1B2B4B]/20 rounded-xl flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-bold text-[#1B2B4B]">이 조건의 평소 운임(최빈값)</div>
                        <div className="text-[16px] font-black text-[#1B2B4B] mt-0.5">{modeFare.toLocaleString()}원</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">동일 조건 {tier0Rows.length}건 중 {modeCount}건({modeSharePct}%)이 이 가격</div>
                      </div>
                      <button onClick={() => onApply(modeFare, null, "quick")}
                        className="shrink-0 px-2.5 py-2 text-[11px] font-bold text-white bg-[#1B2B4B] rounded-lg active:opacity-80">
                        적용
                      </button>
                    </div>
                  )}

                  {/* 필터 — 버튼 여러 개 대신 드롭다운 하나 */}
                  <MobileSelect compact title="필터" value={filter} onChange={e => setFilter(e.target.value)}
                    className="text-[12px] font-bold text-[#1B2B4B] border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none bg-white">
                    {tabs.map(t => {
                      const cnt = t === "all" ? validMatches.length : (counts[t] || 0);
                      if (t !== "all" && cnt === 0) return null;
                      return <option key={t} value={t}>{t === "all" ? `전체 ${cnt}건` : `${t} ${cnt}건`}</option>;
                    })}
                  </MobileSelect>

                  {visibleMatches.map((r, i) => {
                    const o = r.order;
                    const tagLabel = getLabel(r);
                    const tagCls = tagLabel === "완전일치" ? "border-[#1B2B4B] text-[#1B2B4B]" : "border-gray-300 text-gray-500";
                    const fare = r.claim;
                    const barPct = getBarPct(fare);
                    const fareLevel = barPct <= 33 ? "저렴" : barPct <= 66 ? "보통" : "높음";
                    const isTop = i === 0;
                    const outlier = isOutlierRow(r);
                    const isModeRow = tagLabel === "완전일치" && modeFare != null && fare === modeFare && modeCount > 1;
                    return (
                      <div key={i} onClick={() => onOpenDetail(o)} className={`bg-white border rounded-2xl overflow-hidden shadow-sm cursor-pointer active:scale-[0.99] transition ${isTop ? "border-[#1B2B4B]/30" : "border-gray-200"}`}>
                        {isTop && (
                          <div className="bg-[#1B2B4B] px-4 py-1 flex items-center gap-1">
                            <span className="text-white text-[10px] font-bold">최근 유사 운송</span>
                          </div>
                        )}
                        <div className="px-4 pt-3 pb-0">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${tagCls}`}>{tagLabel}</span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-gray-300 text-gray-500">{fareLevel}</span>
                                {isModeRow && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-[#1B2B4B] text-[#1B2B4B]">가장 흔한 운임</span>
                                )}
                                {outlier && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-orange-300 text-orange-700">이례적 청구(반복없음)</span>
                                )}
                                {o.긴급 === true && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-orange-300 text-orange-700">긴급</span>
                                )}
                                <SpecialFareTag row={o} size="sm" />
                                <span className="text-[11px] text-gray-400">{o.상차일 || ""}</span>
                              </div>
                              <div className="text-[13px] font-bold text-gray-900 truncate">
                                {o.상차지명 || "-"} → {o.하차지명 || "-"}
                              </div>
                              {(o.상차지주소 || o.하차지주소) && (
                                <div className="text-[11px] text-gray-400 mt-0.5">
                                  {fmtAddr(o.상차지주소)} → {fmtAddr(o.하차지주소)}
                                </div>
                              )}
                              {o.거래처명 && <div className="text-[11px] text-gray-500 mt-0.5">{o.거래처명}</div>}
                              <SpecialFareLine row={o} className="mt-1" />
                              <div className="flex items-center gap-3 mt-1.5 overflow-x-auto whitespace-nowrap">
                                {o.화물내용 && (
                                  <span className="text-[13px] font-bold text-gray-900 inline-flex items-center gap-1 shrink-0">
                                    <Package className="w-3.5 h-3.5 text-gray-400 shrink-0" /> {o.화물내용}
                                  </span>
                                )}
                                {(o.톤수 || o.차량톤수) && (
                                  <span className="text-[13px] font-bold text-gray-900 inline-flex items-center gap-1 shrink-0">
                                    <Scale className="w-3.5 h-3.5 text-gray-500 shrink-0" /> {o.톤수 || o.차량톤수}
                                  </span>
                                )}
                                {(o.차종 || o.차량종류) && (
                                  <span className="text-[13px] font-bold text-gray-900 inline-flex items-center gap-1 shrink-0">
                                    <VehicleIcon type={o.차종 || o.차량종류} className="w-3.5 h-3.5 text-gray-500 shrink-0" /> {o.차종 || o.차량종류}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-[11px] text-gray-400">청구</div>
                              <div className="text-[17px] font-extrabold text-[#1B2B4B]">{fare.toLocaleString()}원</div>
                              <div className="text-[11px] text-gray-400 mt-0.5">기사 {r.drv.toLocaleString()}원</div>
                            </div>
                          </div>
                          {/* 운임 위치 바 */}
                          {claims.length > 1 && (
                            <div className="relative h-1.5 bg-gray-100 rounded-full mb-2.5">
                              <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#1B2B4B] border-2 border-white shadow"
                                style={{ left: `calc(${barPct}% - 5px)` }} />
                            </div>
                          )}
                          {/* 기사 */}
                          {(o.이름 || o.기사명) && (
                            <div className="text-[11px] text-gray-400 mb-2">
                              기사 <span className="text-gray-700 font-semibold">{o.이름 || o.기사명}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex border-t border-gray-100 mt-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onApply(r.claim, null, "row"); }}
                            className="flex-1 py-2.5 bg-[#1B2B4B] text-white text-[12px] font-bold text-center active:opacity-80"
                          >
                            청구운임 적용 ({r.claim.toLocaleString()})
                          </button>
                          {r.drv > 0 && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onApply(r.claim, r.drv, "row"); }}
                              className="flex-1 py-2.5 bg-[#2d4a7a] text-white text-[12px] font-bold text-center active:opacity-80 border-l border-white/20"
                            >
                              기사포함 ({r.drv.toLocaleString()})
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// 운송 이력 상세 — 운임 조회 결과에서 한 줄을 누르면 위에 뜬다(A/B 디자인 색).
export function FareHistoryDetailSheet({ item, cardVersionB, onClose, onApply }) {
  const claim = Number(item.청구운임 || 0);
  const drv = Number(item.기사운임 || 0);
  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className={cardVersionB ? "bg-[#1B2B4B] px-5 py-4" : "bg-blue-600 px-5 py-4"}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="text-white font-bold text-[15px]">운송 이력 상세</div>
              {item.긴급 === true && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-600 text-white">긴급</span>
              )}
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-lg">×</button>
          </div>
          <div className="text-white/60 text-[11px] mt-1">{item.상차일 || ""}</div>
        </div>
        <div className="px-5 py-4 space-y-3">
          <SpecialFareLine row={item} />
          {item.거래처명 && (
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <span className="text-[11px] text-gray-400 w-16 shrink-0">거래처</span>
              <span className={cardVersionB ? "text-[14px] font-bold text-[#1B2B4B]" : "text-[14px] font-bold text-blue-600"}>{item.거래처명}</span>
            </div>
          )}
          <div className="space-y-2">
            <div className="flex gap-3">
              <div className="flex-1 bg-blue-50 rounded-xl p-3">
                <div className="text-[10px] font-bold text-blue-400 mb-1">상차지</div>
                <div className="text-[13px] font-bold text-gray-900">{item.상차지명 || "-"}</div>
                {item.상차지주소 && <div className="text-[11px] text-gray-500 mt-0.5">{item.상차지주소}</div>}
              </div>
              <div className="flex-1 bg-orange-50 rounded-xl p-3">
                <div className="text-[10px] font-bold text-orange-400 mb-1">하차지</div>
                <div className="text-[13px] font-bold text-gray-900">{item.하차지명 || "-"}</div>
                {item.하차지주소 && <div className="text-[11px] text-gray-500 mt-0.5">{item.하차지주소}</div>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {item.화물내용 && (
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-[10px] font-bold text-gray-400 mb-1">화물</div>
                <div className="text-[12px] font-semibold text-gray-800">{item.화물내용}</div>
              </div>
            )}
            {(item.톤수 || item.차량톤수) && (
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-[10px] font-bold text-gray-400 mb-1">톤수</div>
                <div className="text-[12px] font-semibold text-gray-800">{item.톤수 || item.차량톤수}</div>
              </div>
            )}
            {(item.차종 || item.차량종류) && (
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-[10px] font-bold text-gray-400 mb-1">차종</div>
                <div className="text-[12px] font-semibold text-gray-800">{item.차종 || item.차량종류}</div>
              </div>
            )}
          </div>
          <div className={cardVersionB ? "bg-[#1B2B4B] rounded-xl p-4" : "bg-blue-600 rounded-xl p-4"}>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-white/50 text-[10px] mb-1">청구운임</div>
                <div className="text-white font-extrabold text-[16px]">{claim.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-white/50 text-[10px] mb-1">기사운임</div>
                <div className="text-white font-extrabold text-[16px]">{drv.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-white/50 text-[10px] mb-1">수수료</div>
                <div className="text-white font-extrabold text-[16px]">{orderProfit(item).toLocaleString()}</div>
              </div>
            </div>
          </div>
          {(item.이름 || item.기사명) && (
            <div className="text-[12px] text-gray-500">기사 <span className="font-semibold text-gray-700">{item.이름 || item.기사명}</span></div>
          )}
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => onApply(claim, null, "detail", item)}
              className={cardVersionB ? "flex-1 py-3 bg-[#1B2B4B] text-white font-bold rounded-xl text-[13px] active:opacity-80" : "flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl text-[13px] active:opacity-80"}
            >
              청구운임 적용<br/><span className="text-[11px] font-normal">{claim.toLocaleString()}원</span>
            </button>
            {drv > 0 && (
              <button
                onClick={() => onApply(claim, drv, "detail", item)}
                className="flex-1 py-3 bg-[#2d4a7a] text-white font-bold rounded-xl text-[13px] active:opacity-80"
              >
                기사포함 적용<br/><span className="text-[11px] font-normal">{drv.toLocaleString()}원</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 4) 기사 정보 충돌 팝업 — 같은 차량번호에 다른 기사 정보가 있을 때
//  [기존 정보 사용] 칸만 기존 값으로 · [기존 정보 덮어쓰기] 기존 기사 문서를 바꿈(되돌리기 어려워 빨간색) ·
//  [신규 기사로 별도 등록] 별도 문서(회사__차량번호__x…)로 추가
//  conflict: { existing, input: { plate, name, phone } }
//  onUseExisting(existing) — 칸에 기존 값 채우기
//  onApplied(kind, input) — "update" | "add" 저장이 끝난 뒤 칸 채우기(토스트는 여기서 띄운다)
//  zClass — 화면마다 다른 z-index(빠른 수정 창 위에 떠야 하는 곳 등)
//  stopBackdrop — 바깥을 눌러 닫을 때 클릭이 뒤 창까지 전달되지 않게(빠른 수정 창 안)
// ────────────────────────────────────────────────────────────────
export function DriverConflictSheet({ conflict, onClose, onUseExisting, onApplied, upsertDriver, showToast, formatPhone, zClass = "z-50", stopBackdrop = false }) {
  const { existing, input } = conflict;
  const company = () => (localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "");
  const fmt = formatPhone || ((p) => p);
  return (
    <div className={`fixed inset-0 bg-black/50 ${zClass} flex items-end justify-center`} onClick={e => { if (stopBackdrop) e.stopPropagation(); onClose(); }}>
      <div className="bg-white rounded-t-2xl w-full max-w-md pb-6" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="bg-[#1B2B4B] px-5 py-4 rounded-t-2xl flex items-start justify-between">
          <div>
            <div className="text-white font-bold text-sm">기사 정보 충돌</div>
            <div className="text-white/60 text-xs mt-0.5">동일 차량번호에 다른 기사 정보가 감지되었습니다</div>
          </div>
          <button onClick={onClose} className="text-white/50 text-xl leading-none ml-3">✕</button>
        </div>
        <div className="px-5 pt-4 space-y-3">
          {/* 기존 정보 */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <div className="text-xs font-semibold text-gray-500 mb-1">기존 등록 정보</div>
            <div className="text-sm font-bold text-gray-800">{existing.이름}</div>
            <div className="text-xs text-gray-500 mt-0.5">{existing.차량번호} · {fmt(existing.전화번호)}</div>
          </div>
          {/* 새로 입력한 정보 */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <div className="text-xs font-semibold text-blue-600 mb-1">새로 입력한 정보</div>
            <div className="text-sm font-bold text-gray-800">{input.name}</div>
            <div className="text-xs text-gray-500 mt-0.5">{input.plate} · {fmt(input.phone)}</div>
          </div>
        </div>
        <div className="px-5 pt-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              style={{ touchAction: "manipulation" }}
              className="py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold"
              onClick={() => onUseExisting(existing)}
            >기존 정보 사용</button>
            {/* ⚠️ 기존 기사 문서 자체를 바꾸는 버튼 — 신규 등록과 헷갈리지 않게 주의(빨간) 색 */}
            <button
              style={{ touchAction: "manipulation" }}
              className="py-3 rounded-xl bg-red-50 border border-red-300 text-red-600 text-sm font-bold"
              onClick={async () => {
                const { plate, name: nm, phone: ph } = input;
                // ⭐ 2026-11-05 비교한 그 기사 문서(id)를 정확히 바꾼다
                await saveDriverChoice("update", { existing, plate, name: nm, phone: ph, upsertDriver, company: company() });
                onApplied("update", input);
                showToast?.("기사 정보를 덮어썼습니다");
              }}
            >기존 정보 덮어쓰기</button>
          </div>
          <button
            style={{ touchAction: "manipulation" }}
            className="w-full py-3 rounded-xl bg-white border border-[#1B2B4B] text-[#1B2B4B] text-sm font-bold"
            onClick={async () => {
              const { plate, name: nm, phone: ph } = input;
              // ⚠️ 2026-11-05 예전엔 id 없이 불러 기존 기사를 덮어썼다 → 별도 문서(회사__차량번호__x…)로 추가
              await saveDriverChoice("add", { plate, name: nm, phone: ph, upsertDriver, company: company() });
              onApplied("add", input);
              showToast?.(`신규 기사로 별도 등록: ${nm || plate}`);
            }}
          >신규 기사로 별도 등록</button>
        </div>
      </div>
    </div>
  );
}
