// 급여명세서 상단의 "근로자 정보"/"지급 정보" 구획 — 예전엔 grid-cols-2로
// 두 칸씩 우겨넣어서 칸마다 라벨 길이가 달라 값 시작 위치가 줄마다
// 들쭉날쭉해 보였다. 소제목으로 의미상 구분하고, 라벨 폭을 고정한 한
// 줄짜리 표처럼 배치해 값이 항상 같은 위치에서 시작하도록 한다. PC/모바일
// 관리자 미리보기와 근로자 명세서 화면이 모두 이 컴포넌트를 함께 쓴다.
export default function PayslipInfoGroup({ title, rows }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-primary/70">{title}</p>
      <div className="space-y-1 rounded-lg bg-slate-50 px-3 py-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center gap-2 text-sm">
            <span className="w-20 shrink-0 text-xs text-muted">{label}</span>
            <span className="flex-1 truncate text-right font-semibold text-ink">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
