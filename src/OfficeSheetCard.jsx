// ======================= src/OfficeSheetCard.jsx =======================
// 📗 2026-11-07 엑셀(xlsx) 파일 안내 카드 — 배차표(고정노선 › 배차표) · 구글시트 연결 마법사에서 같이 쓴다
//  구글 드라이브에 올린 엑셀 파일은 읽기는 되지만(서버가 파일을 받아 읽음) 프로그램이 시트에 쓸 수는 없다.
//  [구글 시트로 변환] = 서버가 같은 폴더에 구글 시트 사본을 만든다(원본 엑셀은 그대로). 권한이 없으면 직접 바꾸는 방법을 보여 준다.
import React from "react";

const SERVICE_EMAIL = "dispatch-app-9b92f@appspot.gserviceaccount.com";

export default function OfficeSheetCard({ onConvert, onConverted, fileName = "", compact = false, className = "" }) {
  const [busy, setBusy] = React.useState(false);
  const [howOpen, setHowOpen] = React.useState(false);
  const [done, setDone] = React.useState(null); // { url, name }
  const [failed, setFailed] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const convert = async () => {
    if (!onConvert) { setHowOpen(true); return; }
    setBusy(true); setFailed("");
    try {
      const r = await onConvert();
      setDone(r || {});
      onConverted?.(r || {});
    } catch (e) {
      setFailed(e?.code === "convert-denied" ? "자동으로 바꿀 권한이 없어요. 아래 방법으로 직접 바꿔 주세요." : `변환하지 못했어요. ${e?.message || ""}`.trim());
      setHowOpen(true);
    } finally { setBusy(false); }
  };
  const copy = () => { try { navigator.clipboard?.writeText(SERVICE_EMAIL); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* 무시 */ } };

  if (done) {
    return (
      <div className={`rounded-2xl border border-[#BFE5CF] bg-[#F0FAF4] px-4 py-3.5 ${className}`} data-testid="office-card-done">
        <div className="text-[14.5px] font-black text-[#0F5A33]">구글 시트로 바꿨어요</div>
        <div className="text-[13px] text-[#2F6B4A] mt-1 leading-relaxed">이제 새 시트로 연결돼요. 원래 엑셀 파일은 그대로 있어요.
          {done.url && <a href={done.url} target="_blank" rel="noreferrer" className="ml-1.5 underline font-bold">새 시트 열기</a>}</div>
      </div>
    );
  }
  return (
    <div className={`rounded-2xl border border-[#F2D27A] bg-[#FFF9E8] ${compact ? "px-3.5 py-3" : "px-4 py-4"} ${className}`} data-testid="office-card">
      <div className="flex items-start gap-3">
        <span className="shrink-0 mt-0.5 h-6 px-2 rounded-md bg-[#1D6F42] text-white text-[11.5px] font-black flex items-center tracking-wide">XLSX</span>
        <div className="flex-1 min-w-0">
          <div className="text-[14.5px] font-black text-[#0F1A30] leading-snug">엑셀(xlsx) 파일이에요. 읽기는 바로 되고, 프로그램에서 시트에 쓰려면 구글 시트로 바꿔야 해요</div>
          <div className="text-[13px] text-[#6B5A2A] mt-1 leading-relaxed">{fileName ? <><b>{fileName}</b> · </> : null}변환하면 같은 폴더에 구글 시트 사본을 만들어 연결해요. 원래 엑셀 파일은 그대로 있어요.</div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" onClick={convert} disabled={busy} className="h-9 px-4 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black disabled:opacity-50" data-testid="office-convert">{busy ? "바꾸는 중…" : "구글 시트로 변환"}</button>
            <button type="button" onClick={() => setHowOpen((v) => !v)} className="h-9 px-4 rounded-xl border border-[#E5CF8F] bg-white text-[13.5px] font-black text-[#5B4A1A]">{howOpen ? "방법 닫기" : "방법 보기"}</button>
          </div>
          {failed && <div className="mt-2.5 text-[13px] font-bold text-[#B54708]">{failed}</div>}
          {howOpen && (
            <ol className="mt-3 rounded-xl bg-white border border-[#EFE2B8] px-4 py-3 text-[13px] text-[#3A4A66] leading-relaxed list-decimal pl-8 space-y-1">
              <li>구글 드라이브에서 엑셀 파일을 열어요.</li>
              <li>위 메뉴 <b>파일 › Google Sheets로 저장</b>을 눌러요.</li>
              <li>새로 생긴 시트의 <b>공유</b>에 아래 주소를 <b>편집자</b>로 추가해요.
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <code className="px-1.5 py-0.5 rounded bg-[#F3F6FA] text-[12.5px] text-[#1B2B4B] break-all">{SERVICE_EMAIL}</code>
                  <button type="button" onClick={copy} className="px-2 py-0.5 rounded-md border border-[#DCE3EE] text-[12px] font-bold text-[#3A4A66]">{copied ? "복사했어요" : "복사"}</button>
                </div>
              </li>
              <li>새 시트 주소를 복사해 시트 주소 칸에 붙여넣어요.</li>
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
