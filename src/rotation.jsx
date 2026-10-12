// ⭐ 회전 운행(같은 상/하차지를 2회 이상 반복) — PC/모바일/기사앱 공용
//  - 묶기: 오더 1건에 회전수(N) 저장 → "3회전" 배지, 기사앱에서 회차별 완료 체크(완료회차)
//  - 나누기: 저장할 때 N건으로 분리 → 각 오더에 회전묶음ID / 회차 / 회차총수 저장 → "2/3회차" 배지
import React from "react";

export const ROTATION_MAX = 20;

export const rotationCount = (o) => {
  const n = Number(o?.회전수);
  return Number.isFinite(n) && n > 1 ? Math.floor(n) : 1;
};
export const rotationDone = (o) => Math.min(Number(o?.완료회차) || 0, rotationCount(o));

// 배지 문구: "3회전" (묶기) | "2/3회차" (나누기) | ""
export function rotationLabel(o) {
  const total = Number(o?.회차총수);
  if (total > 1 && o?.회차) return `${o.회차}/${total}회차`;
  const n = rotationCount(o);
  return n > 1 ? `${n}회전` : "";
}

// 기사 전달 문구에 붙는 줄
export function rotationNotice(o) {
  const total = Number(o?.회차총수);
  if (total > 1 && o?.회차) return `\n[회전운행 ${o.회차}/${total}회차]`;
  const n = rotationCount(o);
  return n > 1 ? `\n[${n}회전 운행]` : "";
}

export function RotationBadge({ order, className = "" }) {
  const label = rotationLabel(order);
  if (!label) return null;
  const n = rotationCount(order);
  const done = rotationDone(order);
  return (
    <span className={`inline-flex items-center ml-1 px-2 py-0.5 text-[10px] font-extrabold rounded bg-amber-500 text-white whitespace-nowrap ${className}`}>
      {label}{n > 1 && done > 0 ? ` (${done}/${n})` : ""}
    </span>
  );
}

// ⭐ 메모 자동기입 — "3회전 왕복 오더 입니다" (나누기: "3회전 왕복 중 2회차 오더 입니다")
// 이미 들어간 문구는 새 값으로 바꾸고, 1회(회전 아님)가 되면 지운다.
const ROT_MEMO_RE = /\s*\d+회전 왕복(?: 중 \d+회차)? 오더 입니다\s*/g;
export function withRotationMemo(memo, n, part) {
  const raw = String(memo || "");
  // 기존 문구가 있을 때만 그 부분을 지운다(사용자가 쓴 줄바꿈 등은 그대로 둔다)
  const base = raw.match(ROT_MEMO_RE) ? raw.replace(ROT_MEMO_RE, " ").trim() : raw;
  if (!(Number(n) > 1)) return base;
  const line = part ? `${n}회전 왕복 중 ${part}회차 오더 입니다` : `${n}회전 왕복 오더 입니다`;
  return base ? `${line} ${base}` : line;
}

// 저장 직전 — 나누기 모드면 N건 레코드로 펼친다(묶기/1회면 그대로 1건)
export function expandRotation(rec) {
  // 회전은 왕복일 때만 의미가 있다 — 왕복이 아니면 항상 1회
  const n = rec?.운행유형 === "왕복" ? rotationCount(rec) : 1;
  const { 회전방식, ...base } = rec;
  if (n <= 1) return [{ ...base, 회전수: 1, 메모: withRotationMemo(base.메모, 1) }];
  if (회전방식 !== "분리") return [{ ...base, 회전수: n, 완료회차: 0, 메모: withRotationMemo(base.메모, n) }];
  const gid = `rot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return Array.from({ length: n }, (_, i) => ({ ...base, 회전수: 1, 회전묶음ID: gid, 회차: i + 1, 회차총수: n, 메모: withRotationMemo(base.메모, n, i + 1) }));
}

// 등록폼용 선택기 — [−] 3 [+] 회전  (● 한 오더로 묶기 ○ N건으로 나누기)
export function RotationPicker({ count = 1, mode = "묶기", onChange, accent = "#1B2B4B", size = "md", allowSplit = true }) {
  const n = Math.max(1, Math.min(ROTATION_MAX, Number(count) || 1));
  const sm = size === "sm";
  const btn = `${sm ? "w-6 h-6 text-[13px]" : "w-7 h-7 text-sm"} rounded-md border border-gray-300 bg-white font-bold text-gray-700 active:scale-95`;
  const set = (c, m = mode) => onChange?.(Math.max(1, Math.min(ROTATION_MAX, c)), m);
  return (
    <div className={`inline-flex flex-wrap items-center gap-1.5 ${sm ? "text-[11px]" : "text-[12px]"}`}>
      <span className="font-bold text-gray-600">회전</span>
      <button type="button" className={btn} onClick={() => set(n - 1)}>−</button>
      <span className={`min-w-[22px] text-center font-black ${n > 1 ? "text-amber-600" : "text-gray-500"}`}>{n}</span>
      <button type="button" className={btn} onClick={() => set(n + 1)}>+</button>
      {n > 1 && (
        <>
          {allowSplit && ["묶기", "분리"].map(m => (
            <button key={m} type="button" onClick={() => set(n, m)}
              className={`px-2 py-1 rounded-md border font-bold whitespace-nowrap ${mode === m ? "text-white" : "bg-white text-gray-600 border-gray-300"}`}
              style={mode === m ? { background: accent, borderColor: accent } : undefined}>
              {m === "묶기" ? "한 오더로 묶기" : `${n}건으로 나누기`}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
