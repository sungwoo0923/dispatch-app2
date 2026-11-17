// ⭐ 2026-11-17 PC 배차 화면 공용 UI — DispatchApp.jsx 안에 2~5번씩 복사돼 있던 팝업 · 도우미를
// 한 곳으로 모았다. 글자 · 동작을 고칠 때는 여기 한 곳만 고치면 모든 화면에 같이 반영된다.
//   · PlaceConflictPopup        거래처 주소 불일치 / 주소 중복 팝업 ("새 주소로 업데이트")
//   · SamePlateConflictPopup    동일 차량번호, 다른 기사 정보 팝업
//   · NewClientModal            거래처 신규등록 팝업 ("새 거래처 정보를 입력하세요")
//   · copyAccountSettleImage · copyBizImage · ImageCopyButtons   계좌 · 사업자등록증 이미지 복사
//   · openDailyWorkReport       일일업무보고(일 일 업 무 보 고) 출력 창
//   · FareNoHistoryConfirm · AddrFareSearchModal · FareResultModal · CtxFareResultModal   운임 이력 조회
import React from "react";
import { EditableText } from "./EditMode";
import { CustomSelect } from "./CustomSelect";
import { imeFocusRef } from "./imeFocus";
import { saveDriverChoice } from "./DriverEditChoice";
import { bizOf, bankForBiz, bizInfoCardBlob } from "./companyBiz";
import { orderProfit, profitTotals } from "./forklift";

// ===================== 1. 거래처 주소 충돌 팝업 =====================
// queue 의 맨 앞 항목을 보여 준다. addrMismatch(같은 이름 · 다른 주소) / addrDuplicate(같은 주소 · 다른 이름).
// editableTitle: "거래처 주소 불일치" 제목을 EditableText(popup.title.거래처 주소 불일치)로 보여 줄지
export function PlaceConflictPopup({ open, queue, setQueue, setOpen, savePlaceSmart, upsertPlace, editableTitle = false }) {
  if (!open || !queue || queue.length === 0) return null;
  const item = queue[0];
  const dismiss = () => {
    setQueue(q => q.slice(1));
    if (queue.length <= 1) setOpen(false);
  };
  const resolve = (resolution) => {
    if (item.type === "addrMismatch") {
      if (resolution === "update") {
        savePlaceSmart(item.name, item.addr, item.manager, item.phone, item.placeId, "update");
      } else if (resolution === "keep") {
        // Keep existing place, save current input as NEW separate record
        savePlaceSmart(item.name, item.addr, item.manager, item.phone, null, "keep_new");
      }
    } else if (item.type === "addrDuplicate") {
      if (resolution === "overwrite") {
        upsertPlace({ _id: item.existingId, 업체명: item.name, 주소: item.addr }).catch(() => {});
      } else if (resolution === "separate") {
        savePlaceSmart(item.name, item.addr, item.manager, item.phone, item.placeId, "separate");
      }
      // "use_existing" → dismiss without saving (do nothing)
    }
    dismiss();
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
      <div className="bg-white rounded-2xl shadow-2xl w-[460px] overflow-hidden border">
        <div className="bg-[#1B2B4B] px-6 py-4">
          <h3 className="text-white font-bold text-[15px]">
            {item.type === "addrMismatch"
              ? (editableTitle ? <EditableText id="popup.title.거래처 주소 불일치" defaultText="거래처 주소 불일치" /> : "거래처 주소 불일치")
              : "주소 중복 거래처"}
          </h3>
          <p className="text-white/60 text-[12px] mt-0.5">
            {item.type === "addrMismatch"
              ? `'${item.name}' 거래처의 기존 주소와 다릅니다`
              : `입력한 주소에 이미 등록된 거래처가 있습니다`}
          </p>
        </div>
        <div className="px-6 py-4 space-y-3 text-[13px]">
          {item.type === "addrMismatch" ? (
            <>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div><span className="text-gray-500">거래처명</span> <b className="ml-2">{item.name}</b></div>
                <div><span className="text-gray-500">기존 주소</span> <span className="ml-2 text-blue-700">{item.existingAddr || "-"}</span></div>
                <div><span className="text-gray-500">새 주소</span> <span className="ml-2 text-orange-600">{item.addr}</span></div>
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => resolve("update")} className="w-full py-2.5 bg-[#1B2B4B] text-white rounded-xl font-bold text-[13px]">새 주소로 업데이트</button>
                <button onClick={() => resolve("keep")} className="w-full py-2.5 bg-gray-100 text-gray-800 rounded-xl font-bold text-[13px]">기존 주소 유지 (별도 저장)</button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div><span className="text-gray-500">입력 거래처명</span> <b className="ml-2">{item.name}</b></div>
                <div><span className="text-gray-500">기존 거래처명</span> <span className="ml-2 text-blue-700">{item.existingName}</span></div>
                <div><span className="text-gray-500">주소</span> <span className="ml-2">{item.addr}</span></div>
              </div>
              <p className="text-gray-600">동일한 주소로 이미 등록된 거래처가 있습니다. 어떻게 처리할까요?</p>
              <div className="flex flex-col gap-2">
                <button onClick={() => resolve("overwrite")} className="w-full py-2.5 bg-[#1B2B4B] text-white rounded-xl font-bold text-[13px]">기존 거래처에 통합 (이름 업데이트)</button>
                <button onClick={() => resolve("separate")} className="w-full py-2.5 bg-gray-100 text-gray-800 rounded-xl font-bold text-[13px]">별도 거래처로 등록</button>
                <button onClick={dismiss} className="w-full py-2 text-gray-500 text-[12px]">기존 데이터 사용</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ===================== 2. 동일 차량번호 · 다른 기사 정보 팝업 =====================
// popup = { existing, input: { plate, name, phone }, setTarget }
// onClose: ✕ 버튼(팝업만 닫기) · onResolved: 버튼으로 고른 뒤(검색어 · 목록 비우기 + 팝업 닫기)
// keepBtnTextId: [기존 정보 사용] 버튼의 EditableText id(화면마다 원래 쓰던 id 그대로)
export function SamePlateConflictPopup({ popup, onClose, onResolved, isViewer, upsertDriver, userCompany, formatPhone, keepBtnTextId }) {
  if (!popup) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999999]">
      <div className="bg-white rounded-2xl shadow-2xl w-[420px] overflow-hidden border">
        <div className="bg-[#1B2B4B] px-6 py-4 flex justify-between items-center">
          <div>
            <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.⚠ 기사 정보 확인" defaultText="⚠ 기사 정보 확인" /></h3>
            <p className="text-white/60 text-[12px] mt-0.5">동일 차량번호, 다른 기사 정보가 감지되었습니다</p>
          </div>
          <button className="text-white/60 hover:text-white text-lg" onClick={onClose}>✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4"><div className="text-[11px] font-semibold text-gray-500 mb-2">기존 등록 정보</div><div className="font-bold text-[14px]">{popup.existing.이름}</div><div className="text-[13px] text-gray-600 mt-1">{popup.existing.차량번호} | {formatPhone(popup.existing.전화번호)}</div></div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4"><div className="text-[11px] font-semibold text-blue-600 mb-2">새로 입력한 정보</div><div className="font-bold text-[14px]">{popup.input.name}</div><div className="text-[13px] text-gray-600 mt-1">{popup.input.plate} | {formatPhone(popup.input.phone)}</div></div>
        </div>
        <div className="px-6 pb-6 grid grid-cols-2 gap-3">
          <button className="py-2.5 rounded-xl bg-white border-2 border-gray-300 text-gray-700 text-[13px] font-semibold" onClick={()=>{ const ex=popup.existing; popup.setTarget(p=>({...p,차량번호:ex.차량번호,이름:ex.이름,전화번호:formatPhone(ex.전화번호),배차상태:"배차완료"})); onResolved(); }}><EditableText id={keepBtnTextId} defaultText="기존 정보 사용" /></button>
          <button className="py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold" onClick={async()=>{ if(isViewer){alert("조회전용 권한으로는 수정할 수 없습니다.");return;} const {plate,name,phone}=popup.input; await saveDriverChoice("update", { existing: popup.existing, plate, name, phone, upsertDriver, company: userCompany }); /* ⭐ 2026-11-05 그 기사 문서(id)를 정확히 */ popup.setTarget(p=>({...p,차량번호:plate,이름:name,전화번호:formatPhone(phone),배차상태:"배차완료"})); onResolved(); }}>새 정보로 업데이트</button>
          <button className="col-span-2 py-2.5 rounded-xl bg-emerald-600 text-white text-[13px] font-bold" onClick={async()=>{ if(isViewer){alert("조회전용 권한으로는 등록할 수 없습니다.");return;} const {plate,name,phone}=popup.input; await saveDriverChoice("add", { plate, name, phone, upsertDriver, company: userCompany }); /* ⭐ 2026-11-05 별도 문서 이름 = 회사__차량번호__x… */ popup.setTarget(p=>({...p,차량번호:plate,이름:name,전화번호:formatPhone(phone),배차상태:"배차완료"})); onResolved(); }}>신규 기사로 별도 등록</button>
        </div>
      </div>
    </div>
  );
}

// ===================== 3. 거래처 신규등록 팝업 =====================
// data = { name, addr, manager, phone, email, grade, memo } · zClass: 화면마다 쓰던 z-index 그대로
// Tab 으로 다음 칸 이동, 메모 칸에서 Enter(Shift+Enter 는 줄바꿈)로 바로 등록.
export function NewClientModal({ open, data, setData, onClose, upsertClient, showAlert, formatPhone, zClass = "z-[99999]" }) {
  if (!open) return null;
  const submit = async () => {
    if (!data.name.trim()) { showAlert("업체명을 입력하세요."); return; }
    await upsertClient({ 거래처명: data.name.trim(), 주소: data.addr, 담당자: data.manager, 연락처: data.phone, 이메일: data.email, 메모: data.memo, 등급: data.grade });
    showAlert("신규 거래처 등록이 완료되었습니다.");
    onClose();
  };
  const tabTo = (id) => (e) => { if (e.key === "Tab") { e.preventDefault(); document.getElementById(id)?.focus(); } };
  return (
    <div className={`fixed inset-0 bg-black/50 flex items-center justify-center ${zClass}`}>
      <div className="bg-white rounded-2xl w-[480px] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-[16px]"><EditableText id="popup.title.거래처 신규등록" defaultText="거래처 신규등록" /></h3>
            <p className="text-white/60 text-[12px] mt-0.5">새 거래처 정보를 입력하세요</p>
          </div>
          <button className="text-white/50 hover:text-white text-xl transition" onClick={onClose}>✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">업체명 <span className="text-red-500">*</span></label>
            <input autoComplete="off"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] focus:ring-1 focus:ring-[#1B2B4B]/20"
              placeholder="업체명 입력"
              value={data.name}
              onChange={e => setData(p => ({ ...p, name: e.target.value }))}
              ref={imeFocusRef}
              onKeyDown={tabTo("nc-addr")}
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5"><EditableText id="client.newRegForm.label.주소" defaultText="주소" /></label>
            <input autoComplete="off"
              id="nc-addr"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] focus:ring-1 focus:ring-[#1B2B4B]/20"
              placeholder="주소 입력 (선택)"
              value={data.addr}
              onChange={e => setData(p => ({ ...p, addr: e.target.value }))}
              onKeyDown={tabTo("nc-manager")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-gray-600 mb-1.5"><EditableText id="client.newRegForm.label.담당자" defaultText="담당자" /></label>
              <input autoComplete="off"
                id="nc-manager"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] focus:ring-1 focus:ring-[#1B2B4B]/20"
                placeholder="담당자명 (선택)"
                value={data.manager}
                onChange={e => setData(p => ({ ...p, manager: e.target.value }))}
                onKeyDown={tabTo("nc-phone")}
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-600 mb-1.5"><EditableText id="client.newRegForm.label.연락처" defaultText="연락처" /></label>
              <input autoComplete="off"
                id="nc-phone"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] focus:ring-1 focus:ring-[#1B2B4B]/20"
                placeholder="010-0000-0000 (선택)"
                value={data.phone}
                onChange={e => setData(p => ({ ...p, phone: formatPhone(e.target.value) }))}
                onKeyDown={tabTo("nc-email")}
              />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5"><EditableText id="client.newRegForm.label.이메일" defaultText="이메일" /></label>
            <input autoComplete="off"
              id="nc-email"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] focus:ring-1 focus:ring-[#1B2B4B]/20"
              placeholder="example@email.com (선택)"
              value={data.email}
              onChange={e => setData(p => ({ ...p, email: e.target.value }))}
              onKeyDown={tabTo("nc-grade")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-gray-600 mb-1.5"><EditableText id="client.newRegForm.label.등급" defaultText="등급" /></label>
              <CustomSelect
                id="nc-grade"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] focus:ring-1 focus:ring-[#1B2B4B]/20 bg-white"
                value={data.grade}
                onChange={e => setData(p => ({ ...p, grade: e.target.value }))}
                onKeyDown={tabTo("nc-memo")}
              >
                <option value="일반">일반</option>
                <option value="블랙">블랙</option>
                <option value="주의">주의</option>
                <option value="이탈">이탈</option>
              </CustomSelect>
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5"><EditableText id="client.newRegForm.label.메모" defaultText="메모" /></label>
            <textarea
              id="nc-memo"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] focus:ring-1 focus:ring-[#1B2B4B]/20 resize-none"
              placeholder="메모 (선택)"
              rows={2}
              value={data.memo}
              onChange={e => setData(p => ({ ...p, memo: e.target.value }))}
              onKeyDown={async e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  await submit();
                }
              }}
            />
          </div>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button
            className="flex-1 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"
            onClick={onClose}>
            취소
          </button>
          <button
            className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition"
            onClick={submit}>
            등록 완료
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================== 4. 계좌 · 사업자등록증 이미지 복사 =====================
// base64 또는 URL → Blob 변환 헬퍼
export const srcToBlob = async (src) => {
  if (src.startsWith("data:")) {
    const [header, b64] = src.split(",");
    const mime = header.match(/:(.*?);/)?.[1] || "image/png";
    const binary = atob(b64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  const res = await fetch(src);
  return res.blob();
};

// 계좌 정산 이미지 복사 — selRow: 고른 오더 · bizList: useCompanyBiz 결과 · bankData: 회사 계좌 정보
// onCopied: 복사가 끝나면(창 닫기 등)
export async function copyAccountSettleImage({ selRow, bizList, bankData, showAlert, onCopied }) {
  // ⭐ 2026-11-03 여러 사업자 — 오더의 청구 사업자가 추가 사업자면 그 사업자 계좌로
  const _bz = bizList.multi && selRow ? bizList.find(bizOf(selRow, bizList.defaultName)) : null;
  const bank = bankForBiz(bankData, _bz);
  if (!bank.계좌번호) { showAlert(_bz ? `'${_bz.name}' 사업자에 계좌 정보가 없습니다. 회사정보 › 사업자 관리에서 등록해 주세요.` : "회사관리에 계좌 정보를 먼저 등록해 주세요."); return; }
  try {
    const 청구 = Number(String(selRow?.청구운임 || "0").replace(/[^\d]/g, ""));
    const 기사 = Number(String(selRow?.기사운임 || "0").replace(/[^\d]/g, ""));
    const 차액 = 청구 - 기사;
    const W = 640, rowsH = 5, rowH = 52, headerH = 64, padding = 24;
    const H = headerH + rowsH * rowH + padding;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f8f9fb"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#1B2B4B"; ctx.fillRect(0, 0, W, headerH);
    ctx.fillStyle = "#fff"; ctx.font = "bold 20px 'Malgun Gothic', sans-serif"; ctx.textAlign = "center";
    ctx.fillText("기사 운임 정산 안내", W / 2, 38);
    const drawRow = (label, val, idx, highlight) => {
      const y = headerH + idx * rowH;
      ctx.fillStyle = highlight ? "#e8ecf5" : (idx % 2 === 0 ? "#fff" : "#fafafa");
      ctx.fillRect(0, y, W, rowH);
      ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y + rowH); ctx.lineTo(W, y + rowH); ctx.stroke();
      ctx.fillStyle = "#6b7280"; ctx.font = "14px 'Malgun Gothic', sans-serif"; ctx.textAlign = "left";
      ctx.fillText(label, 28, y + rowH / 2 + 5);
      ctx.fillStyle = highlight ? "#1B2B4B" : "#111827";
      ctx.font = highlight ? "bold 16px 'Malgun Gothic', sans-serif" : "15px 'Malgun Gothic', sans-serif";
      ctx.textAlign = "right"; ctx.fillText(val, W - 28, y + rowH / 2 + 5);
    };
    drawRow("청구운임", 청구.toLocaleString() + "원", 0, false);
    drawRow("기사운임", 기사.toLocaleString() + "원", 1, false);
    drawRow("기사 입금액 (청구 - 기사)", 차액.toLocaleString() + "원", 2, true);
    drawRow("입금 계좌", `${bank.계좌은행 || ""} ${bank.계좌번호}`, 3, false);
    drawRow("예금주", bank.예금주 || "", 4, false);
    const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    onCopied?.();
    showAlert("계좌 정산 이미지가 복사되었습니다. 카카오톡에 붙여 넣으세요.");
  } catch { showAlert("이미지 복사에 실패했습니다."); }
}

// 사업자등록증 이미지 복사 — 추가 사업자 오더면 그 사업자 정보 카드(상호·사업자번호·대표·주소·계좌·직인) 이미지
export async function copyBizImage({ selRow, bizList, bankData, showAlert, onCopied }) {
  // ⭐ 2026-11-03 여러 사업자
  const _bz = bizList.multi && selRow ? bizList.find(bizOf(selRow, bizList.defaultName)) : null;
  if (_bz) {
    try { const blob = await bizInfoCardBlob(_bz); await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); onCopied?.(); showAlert(`'${_bz.name}' 사업자 정보 이미지가 복사되었습니다. 카카오톡에 붙여 넣으세요.`); }
    catch { showAlert("사업자 정보 복사에 실패했습니다."); }
    return;
  }
  const src = bankData?.사업자등록증Base64;
  if (!src) { showAlert("회사관리에 사업자등록증을 먼저 등록해 주세요."); return; }
  try {
    const blob = await srcToBlob(src);
    const imgType = blob.type.startsWith("image/") ? blob.type : "image/png";
    await navigator.clipboard.write([new ClipboardItem({ [imgType]: blob })]);
    onCopied?.();
    showAlert("사업자등록증 이미지가 복사되었습니다. 카카오톡에 붙여 넣으세요.");
  } catch { showAlert("사업자등록증 복사에 실패했습니다. PDF는 이미지 복사를 지원하지 않습니다."); }
}

// 기사복사 창 아래 [계좌 이미지] [사업자등록증] 버튼 줄
export function ImageCopyButtons({ onAccount, onBiz }) {
  return (
    <div className="px-5 pb-5">
      <div className="text-[12.5px] font-bold text-[#7A8AA8] mb-2">이미지 복사 <span className="font-medium text-[#9AA9C3]">(카카오톡에 붙여 넣기)</span></div>
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={onAccount} className="h-12 flex items-center justify-center gap-2 rounded-xl bg-white border border-[#DCE3EE] text-[#0F1A30] text-[14px] font-black hover:bg-[#F4F6FA] transition">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          계좌 이미지
        </button>
        <button type="button" onClick={onBiz} className="h-12 flex items-center justify-center gap-2 rounded-xl bg-white border border-[#DCE3EE] text-[#0F1A30] text-[14px] font-black hover:bg-[#F4F6FA] transition">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          사업자등록증
        </button>
      </div>
    </div>
  );
}

// ===================== 5. 일일업무보고 출력 창 =====================
// targetDate: 기준일(전일 비교의 기준) · targetRows: 보고서에 넣을 오더 · rowsOfDate(날짜): 전일 오더
// companyInfo · printerInfo: fetchCompanyPrintInfo · fetchPrinterInfo 결과 · printerFallback: 담당자 이름이 없을 때
export function openDailyWorkReport({ targetDate, targetRows, rowsOfDate, companyInfo, printerInfo, userCompany, printerFallback = "" }) {
  const printCo = companyInfo?.companyName || userCompany || "";
  const printPhone = companyInfo?.phone || companyInfo?.연락처 || "";
  const printFax = companyInfo?.fax || companyInfo?.팩스 || companyInfo?.팩스번호 || "";
  const printEmail = companyInfo?.email || "";
  const printAddr = companyInfo?.address || companyInfo?.주소 || "";
  const printerName = printerInfo?.name || printerFallback || "";
  const printerPosition = printerInfo?.position || "";
  const printerLabel = [printerName, printerPosition].filter(Boolean).join(" ") || "-";

  const prevDate = (() => {
    const d = new Date(targetDate);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const prevRows = rowsOfDate(prevDate);

  const calc = (arr) => {
    const charge = arr.reduce((a, r) => a + (Number(String(r.청구운임 || "0").replace(/[^\d-]/g, "")) || 0), 0);
    const pay    = arr.reduce((a, r) => a + (Number(String(r.기사운임  || "0").replace(/[^\d-]/g, "")) || 0), 0);
    const fee    = profitTotals(arr).fee; // ⭐ 2026-11-17 수수료 = 청구 − 기사 − 회사 지급분(지게차·외부 특수운임)
    const margin = charge > 0 ? (fee / charge * 100) : 0;
    return { charge, pay, fee, margin, count: arr.length };
  };

  const cur  = calc(targetRows);
  const prev = calc(prevRows);

  const diff = (a, b) => {
    const d = a - b;
    const pct = b > 0 ? ((d / b) * 100).toFixed(1) : null;
    return { d, pct, sign: d >= 0 ? "▲" : "▼", cls: d >= 0 ? "up" : "down" };
  };
  const dCharge = diff(cur.charge, prev.charge);
  const dPay    = diff(cur.pay,    prev.pay);
  const dFee    = diff(cur.fee,    prev.fee);
  const dMargin = diff(cur.margin, prev.margin);
  const dCount  = diff(cur.count,  prev.count);
  const marginRate = cur.charge > 0 ? (cur.fee / cur.charge * 100).toFixed(1) : "0.0";
  const hasPrev = prev.count > 0;

  const fmtD = (d, unit="원") => !hasPrev
    ? `<span class="neutral">전일 없음</span>`
    : `<span class="${d.cls}">${d.sign} ${Math.abs(d.d).toLocaleString()}${unit}${d.pct !== null ? ` (${d.pct}%)` : ""}</span>`;
  const fmtDC = (d) => !hasPrev
    ? `<span class="neutral">전일 없음</span>`
    : `<span class="${d.cls}">${d.sign} ${Math.abs(d.d)}건${d.pct !== null ? ` (${d.pct}%)` : ""}</span>`;
  const fmtDM = (d) => !hasPrev
    ? `<span class="neutral">전일 없음</span>`
    : `<span class="${d.cls}">${d.sign} ${Math.abs(d.d).toFixed(1)}%pt${d.pct !== null ? ` (${d.pct}%)` : ""}</span>`;

  const dateLabel = targetDate.replace(/-/g, ". ");
  const prevLabel = prevDate.replace(/-/g, ". ");
  const now = new Date();
  const printDate = `${now.getFullYear()}. ${String(now.getMonth()+1).padStart(2,"0")}. ${String(now.getDate()).padStart(2,"0")}`;

  const rows_html = targetRows.map((r, i) => {
    const charge = Number(String(r.청구운임 || "0").replace(/[^\d-]/g, "")) || 0;
    const pay    = Number(String(r.기사운임  || "0").replace(/[^\d-]/g, "")) || 0;
    const fee    = orderProfit(r); // ⭐ 2026-11-17
    const rate   = charge > 0 ? Math.round(fee / charge * 100) : null;
    const rateClass = rate === null ? "" : rate > 0 ? "rate-good" : rate < 0 ? "rate-bad" : ""; // ⭐ 2026-11-17 수수료율 — 플러스 빨강 · 마이너스 파랑
    return `<tr>
      <td class="center">${i + 1}</td>
      <td class="center">${r.상차일 || ""}</td>
      <td class="center">${r.거래처명 || ""}</td>
      <td class="center">${r.화물내용 || ""}</td>
      <td class="center">${r.차량번호 || ""}</td>
      <td class="center">${r.이름 || ""}</td>
      <td class="center">${r.전화번호 || ""}</td>
      <td class="num">${charge ? charge.toLocaleString() : "-"}</td>
      <td class="num">${pay ? pay.toLocaleString() : "-"}</td>
      <td class="num ${fee > 0 ? "rate-good" : fee < 0 ? "rate-bad" : ""}">${fee ? fee.toLocaleString() : "-"}</td>
      <td class="num ${rateClass}">${rate !== null ? rate + "%" : "-"}</td>
      <td class="center">${r.지급방식 || ""}</td>
      <td class="center">${r.배차방식 || ""}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>일일업무보고_${targetDate}</title>
<style id="orient-style">@page { size: A4 landscape; margin: 6mm 8mm; }</style>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Noto Sans KR',sans-serif; font-size:11px; color:#111827; background:#f9fafb; }

  /* ── 툴바 (화면 전용, 인쇄 시 숨김) ── */
  .toolbar {
    position:fixed; top:0; left:0; right:0; z-index:9999;
    background:#1B2B4B; padding:8px 20px;
    display:flex; align-items:center; gap:10px;
    box-shadow:0 2px 8px rgba(0,0,0,0.3);
  }
  .toolbar-title { color:#fff; font-size:12px; font-weight:700; margin-right:auto; letter-spacing:-0.3px; }
  .tb-btn {
    padding:6px 16px; border-radius:6px; border:none; cursor:pointer;
    font-size:11px; font-weight:700; font-family:'Noto Sans KR',sans-serif;
    transition:opacity 0.15s;
  }
  .tb-btn:hover { opacity:0.85; }
  .tb-btn.orient { background:#fff; color:#1B2B4B; }
  .tb-btn.print  { background:#3b82f6; color:#fff; }
  .tb-btn.pdf    { background:#059669; color:#fff; }
  .tb-btn.img    { background:#7c3aed; color:#fff; }
  .orient-label { color:#94a3b8; font-size:10px; }
  .divider { width:1px; height:20px; background:#374151; margin:0 4px; }

  /* ── 본문 ── */
  .page-wrap { padding:28px 28px 20px; max-width:1400px; margin:0 auto; margin-top:48px; }

  /* ── 상단 헤더 ── */
  .top-header { display:flex; justify-content:space-between; align-items:flex-end; padding-bottom:10px; border-bottom:2.5px solid #1B2B4B; margin-bottom:14px; }
  .logo { font-size:24px; font-weight:900; color:#1B2B4B; letter-spacing:-1px; }
  .tagline { font-size:9.5px; color:#9ca3af; margin-top:3px; }
  .contact { text-align:right; font-size:9.5px; color:#6b7280; line-height:1.8; }

  /* ── 타이틀 + 날짜 ── */
  .title-bar { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
  .doc-title { font-size:22px; font-weight:900; color:#111827; letter-spacing:-0.8px; }
  .doc-meta-box {
    background:#1B2B4B; border-radius:8px; padding:7px 16px;
    display:flex; gap:20px; align-items:center;
  }
  .doc-meta-item { display:flex; flex-direction:column; align-items:center; }
  .doc-meta-label { font-size:8.5px; color:#93c5fd; font-weight:700; letter-spacing:0.5px; margin-bottom:2px; }
  .doc-meta-value { font-size:12px; color:#fff; font-weight:700; letter-spacing:0.2px; }
  .doc-meta-divider { width:1px; height:28px; background:#374151; }

  /* ── KPI + 결재 ── */
  .kpi-approval { display:flex; align-items:stretch; gap:14px; margin-bottom:16px; }
  .kpi-grid { display:flex; gap:8px; flex:1; }

  .kpi-card {
    flex:1; border:1px solid #e5e7eb; border-radius:10px;
    padding:10px 14px 10px; background:#fff; position:relative; overflow:hidden;
    box-shadow:0 1px 4px rgba(0,0,0,0.05);
  }
  .kpi-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:#1B2B4B; border-radius:10px 10px 0 0; }
  .kpi-label { font-size:9px; font-weight:700; color:#9ca3af; letter-spacing:0.4px; text-transform:uppercase; margin-bottom:5px; }
  .kpi-value { font-size:18px; font-weight:900; color:#111827; letter-spacing:-0.5px; line-height:1.1; }
  .kpi-value.pos { color:#E5484D; } /* ⭐ 2026-11-17 수수료(이익) 플러스 빨강 */
  .kpi-value.neg { color:#2D6BE0; } /* 마이너스 파랑 */
  .kpi-diff { font-size:9px; font-weight:500; margin-top:6px; padding-top:5px; border-top:1px dashed #f3f4f6; color:#6b7280; }
  .kpi-diff .up   { color:#059669; font-weight:700; }
  .kpi-diff .down { color:#dc2626; font-weight:700; }
  .kpi-diff .neutral { color:#9ca3af; }
  .kpi-sub { font-size:8.5px; color:#d1d5db; margin-top:2px; }

  /* ── 결재란 ── */
  .approval { border:1.5px solid #1B2B4B; border-radius:8px; overflow:hidden; min-width:230px; }
  .approval-title { background:#1B2B4B; color:#fff; font-size:12px; font-weight:700; text-align:center; padding:6px 0; letter-spacing:4px; }
  .approval-row { display:flex; height:80px; }
  .approval-cell { flex:1; border-right:1px solid #cbd5e1; display:flex; flex-direction:column; }
  .approval-cell:last-child { border-right:none; }
  .a-role { background:#f1f5f9; font-size:11px; font-weight:700; color:#1B2B4B; text-align:center; padding:5px 0; border-bottom:1px solid #cbd5e1; }
  .a-sign { flex:1; }

  /* ── 구분 라벨 ── */
  .section-label { font-size:11px; font-weight:700; color:#1B2B4B; padding-left:8px; border-left:3px solid #1B2B4B; margin-bottom:7px; }

  /* ── 테이블 ── */
  table { width:100%; border-collapse:collapse; font-size:10.5px; table-layout:auto; }
  thead tr { background:#1B2B4B; }
  thead th { color:#fff; padding:7px 6px; font-size:10px; font-weight:700; text-align:center; white-space:nowrap; border:1px solid #263f61; }
  tbody td { padding:6px 6px; border-bottom:1px solid #f3f4f6; border-left:1px solid #f3f4f6; border-right:1px solid #f3f4f6; color:#111827; font-size:10.5px; white-space:nowrap; }
  tbody tr:nth-child(even) td { background:#fafafa; }
  td.center { text-align:center; }
  td.num { text-align:right; padding-right:8px; font-variant-numeric:tabular-nums; }
  td.rate-good { color:#E5484D; font-weight:700; }
  td.rate-bad  { color:#2D6BE0; font-weight:700; }
  tr.total-row td { background:#eef2f7 !important; font-weight:900; color:#1B2B4B; font-size:11px; border-top:2px solid #1B2B4B; }

  /* ── 하단 ── */
  .report-footer { margin-top:12px; display:flex; justify-content:space-between; }
  .footer-note { font-size:9px; color:#d1d5db; }
  .footer-right { font-size:9px; color:#9ca3af; text-align:right; line-height:1.8; }

  /* ── 인쇄 시 ── */
@media print {
    .toolbar { display:none !important; }
    body { background:#fff; }
    .page-wrap { margin-top:0; padding:0; max-width:100%; }
    tbody tr:hover td { background:inherit !important; }

    /* 테이블 선 굵게 */
    table { border:2px solid #000 !important; }
    thead th {
      border:1.5px solid #000 !important;
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
    }
    tbody td {
      border:1px solid #555 !important;
      border-bottom:1px solid #555 !important;
    }
    tr.total-row td {
      border-top:2.5px solid #000 !important;
      border-bottom:1.5px solid #000 !important;
    }

    /* 결재란 선 굵게 */
    .approval {
      border:2px solid #000 !important;
    }
    .approval-cell {
      border-right:1.5px solid #000 !important;
    }
    .a-role {
      border-bottom:1.5px solid #000 !important;
      background:#e5e7eb !important;
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
    }
    .approval-row {
      border-top:1.5px solid #000 !important;
    }

    /* KPI 카드 선 */
    .kpi-card {
      border:1.5px solid #555 !important;
    }
    .kpi-card::before {
      background:#000 !important;
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
    }

    /* 구분 라벨 선 */
    .section-label {
      border-left:4px solid #000 !important;
    }

    /* 상단 헤더 선 */
    .top-header {
      border-bottom:2.5px solid #000 !important;
    }

    /* 날짜 박스 */
    .doc-meta-box {
      border:1.5px solid #000 !important;
      background:#e5e7eb !important;
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
    }
    .doc-meta-label { color:#000 !important; }
    .doc-meta-value { color:#000 !important; }
    .doc-meta-divider { background:#000 !important; }
  }
</style>
</head>
<body>

<!-- 툴바 -->
<div class="toolbar" id="toolbar">
  <span class="toolbar-title">일일 업무보고 &nbsp;—&nbsp; ${dateLabel}</span>
  <span class="orient-label">용지 방향</span>
  <button class="tb-btn orient" id="orientBtn" onclick="toggleOrient()">가로형 (현재)</button>
  <div class="divider"></div>
  <button class="tb-btn print" onclick="window.print()">인쇄</button>
  <button class="tb-btn pdf" onclick="savePDF()">PDF 저장</button>
  <button class="tb-btn img" onclick="saveImage()">이미지 저장</button>
</div>

<div class="page-wrap" id="pageWrap">

  <!-- 상단 헤더 -->
  <div class="top-header">
    <div>
      <div class="logo">${printCo}</div>
      <div class="tagline">화물 운송 전문</div>
    </div>
    <div class="contact">
      ${printPhone || "-"}${printFax ? ` &nbsp;|&nbsp; FAX ${printFax}` : ""}<br>
      ${printEmail || ""}<br>
      ${printAddr || ""}
    </div>
  </div>

  <!-- 타이틀 + 날짜 -->
  <div class="title-bar">
    <div class="doc-title">일 일 &nbsp; 업 무 보 고</div>
    <div class="doc-meta-box">
      <div class="doc-meta-item">
        <div class="doc-meta-label">기준일</div>
        <div class="doc-meta-value">${dateLabel}</div>
      </div>
      <div class="doc-meta-divider"></div>
      <div class="doc-meta-item">
        <div class="doc-meta-label">발행일</div>
        <div class="doc-meta-value">${printDate}</div>
      </div>
      <div class="doc-meta-divider"></div>
      <div class="doc-meta-item">
        <div class="doc-meta-label">전일 비교</div>
        <div class="doc-meta-value">${prevLabel}</div>
      </div>
    </div>
  </div>

  <!-- KPI + 결재란 -->
  <div class="kpi-approval">
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">발주건수</div>
        <div class="kpi-value">${cur.count}건</div>
        <div class="kpi-diff">전일 대비 &nbsp;${fmtDC(dCount)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">총 청구운임</div>
        <div class="kpi-value">${cur.charge.toLocaleString()}원</div>
        <div class="kpi-diff">전일 대비 &nbsp;${fmtD(dCharge)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">총 기사운임</div>
        <div class="kpi-value">${cur.pay.toLocaleString()}원</div>
        <div class="kpi-diff">전일 대비 &nbsp;${fmtD(dPay)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">매출이익 (수수료)</div>
        <div class="kpi-value ${cur.fee >= 0 ? "pos" : "neg"}">${cur.fee.toLocaleString()}원</div>
        <div class="kpi-diff">전일 대비 &nbsp;${fmtD(dFee)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">매 익 율</div>
        <div class="kpi-value ${Number(marginRate) >= 20 ? "pos" : Number(marginRate) < 10 ? "neg" : ""}">${marginRate}%</div>
        <div class="kpi-diff">전일 대비 &nbsp;${fmtDM(dMargin)}</div>
        <div class="kpi-sub">목표 20% 이상</div>
      </div>
    </div>
    <div class="approval">
      <div class="approval-title">결 &nbsp; 재</div>
      <div class="approval-row">
        <div class="approval-cell"><div class="a-role">팀 장</div><div class="a-sign"></div></div>
        <div class="approval-cell"><div class="a-role">임 원</div><div class="a-sign"></div></div>
        <div class="approval-cell"><div class="a-role">대 표</div><div class="a-sign"></div></div>
      </div>
    </div>
  </div>

  <!-- 테이블 -->
  <div class="section-label">배차 상세 내역</div>
  <table>
    <thead>
      <tr>
        <th>순번</th><th>상차일</th><th>거래처</th><th>화물내용</th>
        <th>차량번호</th><th>기사명</th><th>전화번호</th>
        <th>청구운임</th><th>기사운임</th><th>수수료</th><th>매익율</th>
        <th>지급방식</th><th>배차방식</th>
      </tr>
    </thead>
    <tbody>
      ${rows_html}
      <tr class="total-row">
        <td colspan="7" class="center">합 &nbsp; 계</td>
        <td class="num">${cur.charge.toLocaleString()}</td>
        <td class="num">${cur.pay.toLocaleString()}</td>
        <td class="num">${cur.fee.toLocaleString()}</td>
        <td class="num">${marginRate}%</td>
        <td colspan="2"></td>
      </tr>
    </tbody>
  </table>

  <div class="report-footer">
    <div class="footer-note">본 보고서는 LogisWeb 배차관리 시스템에서 자동 생성된 문서입니다.</div>
    <div class="footer-right">출력일시: ${printDate} &nbsp;|&nbsp; 담당자: ${printerLabel}</div>
  </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script>
  let isLandscape = true;

  function toggleOrient() {
    isLandscape = !isLandscape;
    const style = document.getElementById('orient-style');
    const btn   = document.getElementById('orientBtn');
    if (isLandscape) {
      style.textContent = '@page { size: A4 landscape; margin: 6mm 8mm; }';
      btn.textContent = '가로형 (현재)';
    } else {
      style.textContent = '@page { size: A4 portrait; margin: 8mm 10mm; }';
      btn.textContent = '세로형 (현재)';
    }
  }

  function savePDF() {
    const toolbar = document.getElementById('toolbar');
    toolbar.style.display = 'none';
    setTimeout(() => {
      window.print();
      toolbar.style.display = 'flex';
    }, 100);
  }

  function saveImage() {
    const toolbar = document.getElementById('toolbar');
    toolbar.style.display = 'none';
    const wrap = document.getElementById('pageWrap');
    html2canvas(wrap, { scale: 2, backgroundColor: '#f9fafb', useCORS: true }).then(canvas => {
      toolbar.style.display = 'flex';
      const a = document.createElement('a');
      a.download = '일일업무보고_${targetDate}.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    });
  }
</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=1280,height=900");
  win.document.write(html);
  win.document.close();
}

// ===================== 6. 운임 이력 조회 =====================
// 6-1. "운임 이력 없음 — 주소로 검색하시겠습니까?" 확인 창 (Enter = 예, Esc = 닫기)
// editableTitle: 제목을 EditableText(popup.title.운임 이력 없음)로 보여 줄지
export function FareNoHistoryConfirm({ open, onClose, onYes, editableTitle = false }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999999]"
      tabIndex={-1}
      ref={el => { if (el) setTimeout(() => el.focus(), 0); }}
      onKeyDown={e => {
        if (e.key === "Enter") { e.preventDefault(); onYes(); }
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-[440px] overflow-hidden">
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
          </div>
          <div>
            <h3 className="text-white font-bold text-[15px]">{editableTitle ? <EditableText id="popup.title.운임 이력 없음" defaultText="운임 이력 없음" /> : "운임 이력 없음"}</h3>
            <p className="text-white/60 text-[12px] mt-0.5">동일 상/하차지 운임 이력이 없습니다</p>
          </div>
        </div>
        <div className="px-6 py-5">
          <p className="text-gray-700 text-[14px] leading-relaxed">동일 상/하차지 운임 이력이 없습니다.<br/>주소로 검색하시겠습니까?</p>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button
            className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-[13px] transition"
            onClick={onClose}>
            아니요
          </button>
          <button
            className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white font-bold text-[13px] transition"
            onClick={onYes}>
            예 (Enter)
          </button>
        </div>
      </div>
    </div>
  );
}

// 6-2. 주소(지역명) 운임 조회 창
// 복사패널용: client · setClient 를 주면 [거래처명] 칸이 생긴다(결과는 결과 창에서).
// 우클릭 운임조회용: allClients · setAllClients 를 주면 [전체 노선 조회] 체크 + results 목록 + [닫기]가 생긴다.
export function AddrFareSearchModal({ open, onClose, pickup, setPickup, drop, setDrop, onSearch, client, setClient, allClients, setAllClients, results }) {
  if (!open) return null;
  const withClient = typeof setClient === "function";
  const withResults = Array.isArray(results);
  const enter = e => { if (e.key === "Enter") onSearch(); };
  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1B2B4B]/30";
  const labelCls = "block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wider";
  const searchBtn = (
    <button
      className="px-5 py-2 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition active:scale-95"
      onClick={onSearch}>
      검색
    </button>
  );
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[999999] p-4"
      onKeyDown={e => { if (e.key === "Escape") onClose(); }}
    >
      <div className="bg-white rounded-2xl w-[520px] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-start justify-between shrink-0">
          <div>
            <div className="text-white font-bold text-[17px] tracking-tight">주소 운임 조회</div>
            <div className="text-white/55 text-[12px] mt-1 font-medium">지역명으로 운임 이력을 검색합니다</div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition mt-0.5">
            ×
          </button>
        </div>
        <div className="px-6 py-5 border-b border-gray-100 space-y-3 shrink-0">
          {withClient && (
            <div>
              <label className={labelCls}>거래처명 (비우면 전체 거래처 대상)</label>
              <input autoComplete="off"
                className={inputCls}
                placeholder="예: ○○물류단지 (비워두면 전체)"
                value={client}
                onChange={e => setClient(e.target.value)}
                onKeyUp={enter}
              />
            </div>
          )}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>{withClient ? "상차지 주소" : "상차 지역"}</label>
              <input autoComplete="off"
                className={inputCls}
                placeholder={withClient ? "예: 인천" : "예: 서울 강남구"}
                value={pickup}
                onChange={e => setPickup(e.target.value)}
                onKeyUp={enter}
              />
            </div>
            <div className="flex-1">
              <label className={labelCls}>{withClient ? "하차지 주소" : "하차 지역"}</label>
              <input autoComplete="off"
                className={inputCls}
                placeholder={withClient ? "예: 화성" : "예: 경기 화성시"}
                value={drop}
                onChange={e => setDrop(e.target.value)}
                onKeyUp={enter}
              />
            </div>
          </div>
          {typeof setAllClients === "function" ? (
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input autoComplete="off"
                  type="checkbox"
                  className="w-4 h-4 accent-[#1B2B4B]"
                  checked={allClients}
                  onChange={e => setAllClients(e.target.checked)}
                />
                <span className="text-[13px] text-gray-600 font-medium">전체 노선 조회 (거래처 무관)</span>
              </label>
              {searchBtn}
            </div>
          ) : (
            <div className="flex justify-end">
              {searchBtn}
            </div>
          )}
        </div>
        {withResults && (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {results.length === 0 ? (
                <div className="text-center text-gray-500 text-[13px] py-8">검색 결과가 없습니다</div>
              ) : (
                <div className="space-y-2">
                  {results.map((rec, idx) => {
                    const fare = Number(String(rec.청구운임 || "0").replace(/[^\d]/g, ""));
                    const isTop = idx === 0;
                    return (
                      <div key={idx} className={`rounded-xl border overflow-hidden ${isTop ? "border-[#1B2B4B]/40" : "border-gray-200"}`}>
                        {isTop && (
                          <div className="bg-[#1B2B4B] px-4 py-1.5">
                            <span className="text-[#8FB0F0] text-[11px] font-black tracking-wide">★ 최근 유사 운송</span>
                          </div>
                        )}
                        <div className="px-4 py-3 bg-white">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[12px] font-bold text-gray-500">{rec.상차일}</span>
                            <div className="flex gap-1">
                              {rec.긴급 === true && <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-[#0F1A30] text-white">긴급</span>}
                              {rec._match?.label === "완전일치" && <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-[#1B2B4B] text-white">완전일치</span>}
                              {rec._match?.label === "부분일치" && <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-[#2D4C82] text-white">부분일치</span>}
                              {rec._match?.label === "톤수일치" && <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-[#1B2B4B] text-white">톤수일치</span>}
                              {rec._match?.label === "경로일치" && <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-[#8FB0F0] text-[#0F1A30]">경로일치</span>}
                            </div>
                          </div>
                          <div className="text-[13px] font-bold text-gray-900 mb-1">{rec.상차지명 || "-"} → {rec.하차지명 || "-"}</div>
                          <div className="text-[12px] text-gray-500 mb-2">{rec.차량종류 || "-"} / {rec.차량톤수 || "-"}{rec.화물내용 ? ` · ${rec.화물내용}` : ""}</div>
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] text-gray-500">기사 <span className="text-gray-700 font-bold">{rec.이름 || "-"}</span></span>
                            <span className="text-[18px] font-extrabold text-[#1B2B4B]">{fare.toLocaleString()}원</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 shrink-0">
              <button onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-gray-200 hover:bg-gray-300 text-[#1B2B4B] text-[14px] font-bold transition">
                닫기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// 6-3. 운임 결과 창 공용 조각
const fareNum = (v) => Number(String(v || "0").replace(/[^\d]/g, ""));
const NUM_FONT = { fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" };

function fareScale(result) {
  const fareMin = result.min;
  const fareMax = result.max;
  const fareAvg = result.avg;
  const fareRange = fareMax - fareMin || 1;
  const getBarPct = (fare) =>
    fareRange > 0 ? Math.min(100, Math.max(0, ((fare - fareMin) / fareRange) * 100)) : 50;
  const getFareTag = (fare) => {
    const pct = getBarPct(fare);
    if (pct <= 33) return { label: "저렴", cls: "text-[#0F1A30] bg-[#EEF2F8] border-[#DCE3EE] font-extrabold" };
    if (pct <= 66) return { label: "보통", cls: "text-white bg-[#2D4C82] border-[#2D4C82] font-extrabold" };
    return { label: "높음", cls: "text-white bg-[#0F1A30] border-[#0F1A30] font-extrabold" };
  };
  return { fareMin, fareMax, fareAvg, getBarPct, getFareTag };
}

// [전체 · 완전일치 · 부분일치 · 톤수일치 · 경로일치] 거르기 탭
function FareFilterTabs({ records, filter, setFilter }) {
  const filterLabels = ["all","완전일치","부분일치","톤수일치","경로일치"];
  const filterCounts = {};
  (records || []).forEach(r => {
    const l = r._match?.label || "경로일치";
    filterCounts[l] = (filterCounts[l] || 0) + 1;
  });
  return (
    <div className="flex gap-1.5 pb-3 flex-wrap">
      {filterLabels.map(l => {
        const cnt = l === "all" ? records.length : (filterCounts[l] || 0);
        if (l !== "all" && cnt === 0) return null;
        return (
          <button key={l}
            onClick={() => setFilter(l)}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-full transition border ${
              filter === l
                ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}>
            {l === "all" ? `전체 ${cnt}건` : `${l} ${cnt}`}
          </button>
        );
      })}
    </div>
  );
}

// 운임 분석(평균 · 최저 · 최고)
function FareAnalysisBox({ records }) {
  const fares = (records || []).map(r => fareNum(r.청구운임)).filter(f => f > 0);
  if (fares.length === 0) return null;
  const avg = Math.round(fares.reduce((a,b)=>a+b,0) / fares.length);
  const mn = Math.min(...fares);
  const mx = Math.max(...fares);
  return (
    <div className="mb-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
      <div className="text-[13px] font-bold text-gray-700 mb-2">운임 분석 ({fares.length}건)</div>
      <div className="flex gap-4 flex-wrap">
        <div><span className="text-[12px] text-gray-500">평균</span><div className="text-[15px] font-extrabold text-[#1B2B4B]">{avg.toLocaleString()}원</div></div>
        <div><span className="text-[12px] text-gray-500">최저</span><div className="text-[15px] font-bold text-gray-700">{mn.toLocaleString()}원</div></div>
        <div><span className="text-[12px] text-gray-500">최고</span><div className="text-[15px] font-bold text-gray-700">{mx.toLocaleString()}원</div></div>
      </div>
    </div>
  );
}

// 과거 운송 기록 한 줄 — onApply 를 주면 오른쪽에 [적용] 버튼
function FareRecordCard({ rec, idx, records, getBarPct, getFareTag, onApply }) {
  const fare = fareNum(rec.청구운임);
  const { label: fareLabel, cls: fareCls } = getFareTag(fare);
  const isTop = idx === 0;
  const barPct = getBarPct(fare);
  const _allFares = (records || []).map(r => fareNum(r.청구운임)).filter(f => f > 0);
  const _avg = _allFares.length ? Math.round(_allFares.reduce((a,b)=>a+b,0)/_allFares.length) : 0;
  const _diff = fare - _avg;
  const fareWithDiff = (
    <div className="flex items-baseline gap-1">
      <span className="text-[20px] font-extrabold text-[#1B2B4B]">{fare.toLocaleString()}원</span>
      {_avg && Math.abs(_diff) >= 1000 ? (
        <span className={`text-[11px] ml-1 font-semibold ${_diff > 0 ? "text-red-500" : "text-blue-500"}`}>
          {_diff > 0 ? `+${_diff.toLocaleString()}` : _diff.toLocaleString()}원
        </span>
      ) : <span className="text-[11px] text-gray-500 ml-1">평균</span>}
    </div>
  );
  return (
    <div className={`rounded-xl border overflow-hidden ${isTop ? "border-[#1B2B4B]/40" : "border-gray-150"}`}>
      {isTop && (
        <div className="bg-[#1B2B4B] px-4 py-1.5">
          <span className="text-[#8FB0F0] text-[11px] font-black tracking-wide">★ 최근 유사 운송</span>
        </div>
      )}
      <div className="px-4 py-3 bg-white">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-bold text-gray-600">{rec.상차일}</span>
          <div className="flex gap-1">
            {rec._reverseRoute && (
              <span className="px-2.5 py-1 text-[11px] font-extrabold rounded-full bg-[#EEF2F8] text-[#1B2B4B] border border-[#DCE3EE]">반대노선</span>
            )}
            {rec.긴급 === true && (
              <span className="px-2.5 py-1 text-[11px] font-extrabold rounded-full bg-[#0F1A30] text-white">긴급</span>
            )}
            {rec._match?.label === "완전일치" && (
              <span className="px-2.5 py-1 text-[11px] font-extrabold rounded-full bg-[#1B2B4B] text-white">완전일치</span>
            )}
            {rec._match?.label === "부분일치" && (
              <span className="px-2.5 py-1 text-[11px] font-extrabold rounded-full bg-[#2D4C82] text-white">부분일치</span>
            )}
            {rec._match?.label === "톤수일치" && (
              <span className="px-2.5 py-1 text-[11px] font-extrabold rounded-full bg-[#1B2B4B] text-white">톤수일치</span>
            )}
            {rec._match?.label === "경로일치" && (
              <span className="px-2.5 py-1 text-[11px] font-extrabold rounded-full bg-[#8FB0F0] text-[#0F1A30]">경로일치</span>
            )}
            <span className={`px-2.5 py-1 text-[11px] font-extrabold rounded-full border ${fareCls}`}>{fareLabel}</span>
          </div>
        </div>
        <div className="text-[14px] font-extrabold text-gray-900 mb-1">
          {rec.상차지명 || "-"} → {rec.하차지명 || "-"}
        </div>
        {(() => {
          const sa=v=>{if(Array.isArray(v))return v;if(typeof v==="string"&&v.trim().startsWith("["))try{const p=JSON.parse(v);return Array.isArray(p)?p:[];}catch{return[];}return[];};
          const toN=s=>typeof s==="string"?s:(s?.업체명||s?.지명||s?.주소||"");
          const parseMainVias=(name)=>{const ms=[...String(name||"").matchAll(/(\d+)\.\s*([^\d\n.]+)/g)];return ms.length>1?ms.sort((a,b)=>+a[1]-+b[1]).slice(1).map(m=>m[2].trim()):[];};
          const pV=[...new Set([...sa(rec.경유상차목록||[]),...sa(rec.경유지_상차||[]),...sa(rec.경유지상차||[])].map(toN).filter(Boolean))];
          const dV=[...new Set([...sa(rec.경유하차목록||[]),...sa(rec.경유지_하차||[]),...sa(rec.경유지하차||[])].map(toN).filter(Boolean))];
          const allPV=pV.length?pV:parseMainVias(rec.상차지명);
          const allDV=dV.length?dV:parseMainVias(rec.하차지명);
          if(!allPV.length&&!allDV.length)return null;
          return(
            <div className="flex items-center gap-1 flex-wrap mb-1">
              <span className="px-2 py-0.5 bg-[#1B2B4B]/10 text-[#1B2B4B] border border-[#1B2B4B]/20 text-[10px] font-bold rounded-full">경유 포함</span>
              {allPV.map((n,i)=><span key={`p${i}`} className="text-[10px] text-[#1B2B4B]/80 bg-[#1B2B4B]/5 border border-[#1B2B4B]/15 px-1.5 py-0.5 rounded font-medium">{n}(상)</span>)}
              {allDV.map((n,i)=><span key={`d${i}`} className="text-[10px] text-[#1B2B4B]/80 bg-[#1B2B4B]/5 border border-[#1B2B4B]/15 px-1.5 py-0.5 rounded font-medium">{n}(하)</span>)}
            </div>
          );
        })()}
        <div className="text-[13px] font-semibold text-gray-600 mb-2">
          {rec.차량종류 || "-"} / {rec.차량톤수 || "-"}
          {rec.화물내용 && <span> · {rec.화물내용}</span>}
        </div>
        <div className="relative h-1.5 bg-gray-100 rounded-full mb-3">
          <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#1B2B4B] border-2 border-white shadow"
            style={{ left: `calc(${barPct}% - 5px)` }} />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <div className="text-[13px] font-bold text-gray-800">
              기사: {rec.이름 || "-"}
            </div>
            <div className="text-[12px] text-gray-500">
              기사운임: <span className="font-bold text-gray-700">{Number(rec.기사운임||0).toLocaleString()}원</span>
            </div>
          </div>
          {onApply ? (
            <div className="flex items-center gap-2">
              {fareWithDiff}
              <button
                onClick={() => onApply(fare)}
                className="px-3 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-bold hover:bg-[#243a60] transition active:scale-95">
                적용
              </button>
            </div>
          ) : fareWithDiff}
        </div>
      </div>
    </div>
  );
}

// 6-4. 운임 조회 결과 창(선택수정 · 오더복사 패널) — 최저/평균/최고 · 기록마다 [적용]
// result = { min, max, avg, count } · records: 정렬된 기록 · sortControl: 정렬 드롭다운
// onApply(금액): 그 금액을 청구운임에 넣기(창 닫기 포함) · zClass: 화면마다 쓰던 z-index 그대로
export function FareResultModal({ result, target, records, sortControl, filter, setFilter, onApply, onClose, zClass = "z-[999999]" }) {
  const { fareMin, fareMax, fareAvg, getBarPct, getFareTag } = fareScale(result);
  return (
    <div className={`fixed inset-0 bg-black/60 flex items-center justify-center ${zClass} p-4`}>
      <div className="bg-white rounded-2xl w-[580px] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">

        {/* 헤더 */}
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-start justify-between shrink-0">
          <div>
            <div className="text-white font-bold text-[17px] tracking-tight">운임 조회 결과</div>
            <div className="text-white/55 text-[12px] mt-1 font-medium">
              {target?.상차지명 || "-"} → {target?.하차지명 || "-"}
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition mt-0.5">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* 운임 범위 요약 */}
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                조회 운임 범위 ({result.count}건)
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-1 mb-4">
              <span className="text-[30px] font-black text-[#1B2B4B] leading-none">{fareMin.toLocaleString()}</span>
              <span className="text-[18px] font-bold text-gray-400">~</span>
              <span className="text-[30px] font-black text-[#1B2B4B] leading-none">{fareMax.toLocaleString()}</span>
              <span className="text-[14px] font-semibold text-gray-500 mb-0.5">원</span>
            </div>
            <div className="relative h-2 bg-gray-100 rounded-full mb-2">
              <div className="absolute inset-0 bg-gray-200 rounded-full" />
              <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#1B2B4B] border-2 border-white shadow-md z-10"
                style={{ left: `calc(${getBarPct(fareAvg)}% - 6px)` }} />
            </div>
            <div className="flex justify-between text-[11px] font-semibold text-gray-500">
              <span>최저 {fareMin.toLocaleString()}원</span>
              <span className="text-[#1B2B4B] font-bold">평균 {fareAvg.toLocaleString()}원</span>
              <span>최고 {fareMax.toLocaleString()}원</span>
            </div>

            {/* 빠른 적용 버튼 */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              {[
                { label: "최저 운임", sub: "가장 저렴한 이력", value: fareMin },
                { label: "평균 운임", sub: "전체 평균 기준",   value: fareAvg },
                { label: "최고 운임", sub: "가장 높은 이력",   value: fareMax },
              ].map(({ label, sub, value }) => (
                <button key={label}
                  onClick={() => onApply(value)}
                  className="rounded-xl border border-gray-200 bg-gray-50 hover:bg-[#1B2B4B] hover:text-white hover:border-[#1B2B4B] px-3 py-3 text-center transition group active:scale-95">
                  <div className="text-[10px] font-bold text-gray-500 group-hover:text-white/60 mb-1">{label}</div>
                  <div className="text-[18px] font-extrabold text-[#1B2B4B] group-hover:text-white leading-none">{value.toLocaleString()}</div>
                  <div className="text-[10px] text-gray-500 group-hover:text-white/50 mt-1">{sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 과거 운송 기록 */}
          <div className="px-6 pt-4 pb-6">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[13px] font-extrabold text-[#1B2B4B]">과거 운송 기록</span>
              {sortControl}
            </div>
            {/* 필터 탭 */}
            <FareFilterTabs records={records} filter={filter} setFilter={setFilter} />
            <FareAnalysisBox records={records} />
            <div className="space-y-2">
              {(records || []).filter(r => filter === "all" || (r._match?.label || "경로일치") === filter).map((rec, idx) => (
                <FareRecordCard key={idx} rec={rec} idx={idx} records={records} getBarPct={getBarPct} getFareTag={getFareTag} onApply={onApply} />
              ))}
            </div>
          </div>
        </div>

        {/* 닫기 */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 shrink-0">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-gray-200 hover:bg-gray-300 text-[#1B2B4B] text-[14px] font-bold transition">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// 6-5. 우클릭 [운임조회] 결과 창(보기 전용 · 새 디자인)
// filter · setFilter 를 안 주면 창 안에서 따로 기억한다. isMoto: 오토바이 노선 안내 문구
export function CtxFareResultModal({ result, target, records, sortControl, filter: filterProp, setFilter: setFilterProp, isMoto = false, onClose }) {
  const [ownFilter, setOwnFilter] = React.useState("all");
  const filter = filterProp !== undefined ? filterProp : ownFilter;
  const setFilter = setFilterProp || setOwnFilter;
  const { fareMin, fareMax, fareAvg, getBarPct, getFareTag } = fareScale(result);
  return (
    <div className="fixed inset-0 bg-[#0B1428]/70 backdrop-blur-[3px] flex items-center justify-center z-[999999] p-4">
      <div className="bg-[#F4F6FA] rounded-[26px] w-[760px] max-w-[96vw] max-h-[90vh] flex flex-col shadow-[0_40px_100px_rgba(0,0,0,0.45)] overflow-hidden">
        <div className="relative px-6 py-5 flex items-start justify-between shrink-0 overflow-hidden" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}><span className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
          <div>
            <div className="relative text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={NUM_FONT}>FARE · HISTORY</div><div className="relative text-white font-black text-[20px] tracking-tight leading-tight">운임 조회 결과</div>
            <div className="relative text-white/65 text-[13px] mt-1 font-bold">
              {target?.상차지명 || "-"} → {target?.하차지명 || "-"}
            </div>
          </div>
          <button onClick={onClose}
            className="relative h-9 px-3.5 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white text-[13px] font-bold flex items-center justify-center transition">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isMoto && (
            <div className="mx-6 mt-5 px-4 py-3 bg-white border border-[#DCE3EE] rounded-xl text-[12.5px] text-[#1B2B4B] font-bold">
              오토바이/바이크 노선은 T-Map 권장 운임을 참고하시기 바랍니다.
            </div>
          )}
          <div className="mx-5 mt-5 px-5 py-5 bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_8px_22px_rgba(16,24,40,0.05)]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                조회 운임 범위 ({result.count}건)
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-1 mb-4">
              <span className="text-[32px] font-black text-[#0F1A30] leading-none tabular-nums" style={NUM_FONT}>{fareMin.toLocaleString()}</span>
              <span className="text-[18px] font-bold text-gray-400">~</span>
              <span className="text-[32px] font-black text-[#0F1A30] leading-none tabular-nums" style={NUM_FONT}>{fareMax.toLocaleString()}</span>
              <span className="text-[14px] font-semibold text-gray-500 mb-0.5">원</span>
            </div>
            <div className="relative h-2 bg-gray-100 rounded-full mb-2">
              <div className="absolute inset-0 bg-gray-200 rounded-full" />
              <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#1B2B4B] border-2 border-white shadow-md z-10"
                style={{ left: `calc(${getBarPct(fareAvg)}% - 6px)` }} />
            </div>
            <div className="flex justify-between text-[11px] font-semibold text-gray-500">
              <span>최저 {fareMin.toLocaleString()}원</span>
              <span className="text-[#1B2B4B] font-bold">평균 {fareAvg.toLocaleString()}원</span>
              <span>최고 {fareMax.toLocaleString()}원</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              {[
                { label: "최저 운임", sub: "가장 저렴한 이력", value: fareMin },
                { label: "평균 운임", sub: "전체 평균 기준",   value: fareAvg },
                { label: "최고 운임", sub: "가장 높은 이력",   value: fareMax },
              ].map(({ label, sub, value }) => (
                <div key={label}
                  className="rounded-xl border border-[#E3E8F0] bg-[#F7F9FC] px-3 py-3 text-center">
                  <div className="text-[10px] font-bold text-gray-500 mb-1">{label}</div>
                  <div className="text-[19px] font-black text-[#0F1A30] leading-none tabular-nums" style={NUM_FONT}>{value.toLocaleString()}</div>
                  <div className="text-[10px] text-gray-500 mt-1">{sub}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="mx-5 mt-4 mb-5 px-5 pt-4 pb-5 bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_8px_22px_rgba(16,24,40,0.05)]">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[15px] font-black text-[#0F1A30]">과거 운송 기록</span>
              {sortControl}
            </div>
            {/* 필터 탭 */}
            <FareFilterTabs records={records} filter={filter} setFilter={setFilter} />
            <FareAnalysisBox records={records} />
            <div className="space-y-2">
              {(records || []).filter(r => filter === "all" || (r._match?.label || "경로일치") === filter).map((rec, idx) => (
                <FareRecordCard key={idx} rec={rec} idx={idx} records={records} getBarPct={getBarPct} getFareTag={getFareTag} />
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 shrink-0">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-gray-200 hover:bg-gray-300 text-[#1B2B4B] text-[14px] font-bold transition">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
