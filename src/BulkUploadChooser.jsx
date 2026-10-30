// ======================= src/BulkUploadChooser.jsx =======================
// 📥 배차현황 › 대용량 업로드 — "양식 다운로드 / 엑셀 업로드" 중 고르는 창
import React from "react";

const MONO = "'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace";

const DEFAULT_TEXT = {
  title: "대용량 업로드",
  subtitle: "엑셀로 오더를 한꺼번에 등록합니다. 처음이면 양식부터 받아 주세요.",
  templateDesc: "열 이름과 예시 2줄, 작성 안내가 들어 있는 엑셀 파일을 받습니다.",
  templateTips: ['시간은 "오전 9시", "오후 3시 30분"', "차량번호·기사명·전화번호 입력 시 배차완료"],
  uploadDesc: "작성한 양식(.xlsx)을 고르면 건수·기간·운임 합계를 먼저 보여드리고, 확인 후 등록합니다.",
  uploadTips: ["빈 줄은 자동으로 건너뜀", "수수료(청구-기사운임) 자동 계산"],
};

// 기사관리·거래처관리 등 다른 화면에서도 같은 창을 쓴다 — 문구만 바꿔 넘기면 된다
export default function BulkUploadChooser({ onClose, onTemplate, onFile, ...text }) {
  const T = { ...DEFAULT_TEXT, ...Object.fromEntries(Object.entries(text).filter(([, v]) => v != null)) };
  const fileRef = React.useRef(null);
  React.useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const card = "group relative text-left rounded-[22px] p-6 border transition-all duration-200 overflow-hidden";
  return (
    <div className="fixed inset-0 z-[100040] bg-[#0B1428]/70 backdrop-blur-[3px] flex items-center justify-center p-4">
      <div className="relative w-full max-w-[780px] rounded-[28px] overflow-hidden text-white shadow-[0_40px_100px_rgba(0,0,0,0.5)]" style={{ background: "linear-gradient(135deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <span className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "24px 24px" }} />
        <div className="relative px-8 pt-7 pb-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>BULK · IMPORT</div>
              <div className="text-[24px] font-black mt-1">{T.title}</div>
              <div className="text-[13px] text-white/60 mt-1">{T.subtitle}</div>
            </div>
            <button type="button" onClick={onClose} className="h-9 px-3.5 rounded-xl bg-white/10 border border-white/20 text-[12.5px] font-bold hover:bg-white/20">닫기 ✕</button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mt-6">
            <button type="button" onClick={onTemplate} className={`${card} bg-white/[0.04] border-white/15 hover:bg-white/[0.08] hover:border-[#8FB0F0]/60`}>
              <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>STEP 01 · TEMPLATE</div>
              <div className="text-[19px] font-black mt-1.5">양식 다운로드</div>
              <div className="text-[12.5px] text-white/60 mt-1 leading-relaxed">{T.templateDesc}</div>
              <ul className="mt-4 space-y-1.5 text-[12.5px] font-semibold text-white/85">
                {T.templateTips.map((t) => <li key={t} className="flex gap-2"><span className="mt-[6px] w-1.5 h-1.5 rotate-45 bg-[#8FB0F0] shrink-0" />{t}</li>)}
              </ul>
              <div className="mt-5 inline-flex h-10 items-center px-4 rounded-xl border border-white/25 text-[13px] font-black group-hover:bg-white group-hover:text-[#0F1A30] transition">⤓ 양식 받기</div>
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className={`${card} bg-white text-[#0F1A30] border-white hover:-translate-y-0.5 shadow-[0_18px_40px_rgba(0,0,0,0.3)]`}>
              <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#2D4C82]" style={{ fontFamily: MONO }}>STEP 02 · UPLOAD</div>
              <div className="text-[19px] font-black mt-1.5">엑셀 업로드</div>
              <div className="text-[12.5px] text-[#5B6B85] mt-1 leading-relaxed">{T.uploadDesc}</div>
              <ul className="mt-4 space-y-1.5 text-[12.5px] font-semibold text-[#1B2B4B]">
                {T.uploadTips.map((t) => <li key={t} className="flex gap-2"><span className="mt-[6px] w-1.5 h-1.5 rotate-45 bg-[#2D4C82] shrink-0" />{t}</li>)}
              </ul>
              <div className="mt-5 inline-flex h-10 items-center px-4 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black">⤒ 파일 선택</div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={onFile} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 양식 엑셀 만들기(오더 외 화면 공용) — cols: 열 이름, samples: 예시 줄, guide: [항목, 설명] 목록
export function downloadTemplateXlsx(XLSX, fileName, sheetName, cols, samples = [], guide = []) {
  const ws = XLSX.utils.aoa_to_sheet([cols, ...samples]);
  ws["!cols"] = cols.map((c) => ({ wch: /주소|메모|사항/.test(c) ? 32 : Math.max(12, c.length * 2 + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  if (guide.length) {
    const g = XLSX.utils.aoa_to_sheet([["항목", "작성 방법"], ...guide]);
    g["!cols"] = [{ wch: 24 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, g, "작성 안내");
  }
  XLSX.writeFile(wb, fileName);
}
