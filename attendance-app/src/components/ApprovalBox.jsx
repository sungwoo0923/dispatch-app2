// 프로그램 전체에서 결재라인을 표시할 때 쓰는 공용 위젯. steps는
// [{ role: "담당", name, signatureDataUrl, result: "approved"|"rejected"|null }] 형태이며
// role은 "결재자" 같은 일반 명칭이 아니라 실제 결재 라인의 직급/역할을 그대로 표기한다.
export default function ApprovalBox({ steps }) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-center text-xs">
      <div className="flex w-12 shrink-0 items-center justify-center border-r border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-muted">
        결재
      </div>
      {steps.map((s, i) => (
        <div key={i} className="flex w-20 shrink-0 flex-col border-r border-slate-200 last:border-r-0">
          <div className="border-b border-slate-200 bg-slate-50 py-1 font-semibold text-muted">{s.role}</div>
          <div className="relative flex h-14 items-center justify-center">
            {s.signatureDataUrl && <img src={s.signatureDataUrl} alt="서명" className="h-8 max-w-[90%] object-contain" />}
            {s.result && (
              <span
                className={`pointer-events-none absolute inset-0 m-auto flex h-9 w-9 -rotate-12 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                  s.result === "approved" ? "border-danger text-danger" : "border-slate-400 text-slate-400"
                }`}
              >
                {s.result === "approved" ? "승인" : "반려"}
              </span>
            )}
          </div>
          <div className="truncate border-t border-slate-100 px-1 py-1 text-[10px] text-muted">{s.name || ""}</div>
        </div>
      ))}
    </div>
  );
}
