// ⭐ 오더 수정 감지(기사 수락 이후 관리자가 내용을 바꾼 경우)
// 기사가 오더를 수락(또는 수정확인)할 때의 주요 항목 값을 오더 문서의 `기사확인값`에 저장해두고,
// 지금 값과 비교해 바뀐 항목을 찾는다. 기사앱(빨간 깜빡임 + 수정확인 버튼)과
// 관리자 노선관리(기사 확인 여부 표시)가 같은 기준을 쓴다.
export const WATCH_GROUPS = [
  { label: "상차지", fields: ["상차지명", "상차지주소"] },
  { label: "하차지", fields: ["하차지명", "하차지주소"] },
  { label: "상차일시", fields: ["상차일", "상차시간"] },
  { label: "하차일시", fields: ["하차일", "하차시간"] },
  { label: "화물정보", fields: ["화물내용", "차량톤수", "차량종류"] },
  { label: "운임", fields: ["기사운임", "지급방식"] },
  { label: "담당자 연락처", fields: ["상차지담당자", "상차지담당자번호", "하차지담당자", "하차지담당자번호"] },
  { label: "전달사항", fields: ["전달사항"] },
];
export const WATCH_FIELDS = WATCH_GROUPS.flatMap(g => g.fields);

const norm = (v) => (v == null ? "" : String(v).trim());

export function snapshotOrder(o) {
  const snap = {};
  WATCH_FIELDS.forEach(f => { snap[f] = norm(o?.[f]); });
  return snap;
}

// 바뀐 필드 이름 배열(기준값이 없으면 빈 배열 — 비교 불가)
export function changedFields(o) {
  const base = o?.기사확인값;
  if (!base || typeof base !== "object") return [];
  return WATCH_FIELDS.filter(f => f in base && norm(base[f]) !== norm(o?.[f]));
}

export function changedLabels(fields) {
  const set = new Set(fields);
  return WATCH_GROUPS.filter(g => g.fields.some(f => set.has(f))).map(g => g.label);
}

const tsMs = (t) => (t?.toMillis ? t.toMillis() : (t?.seconds ? t.seconds * 1000 : null));

// 관리자 화면용 상태: { kind: "pending", labels } | { kind: "confirmed", at } | null
export function modificationStatus(o) {
  if (!o || (o.기사확인상태 !== "수락" && o.기사확인상태 !== "완료")) return null;
  const fields = changedFields(o);
  if (fields.length) return { kind: "pending", labels: changedLabels(fields) };
  const at = tsMs(o.수정확인일시);
  if (at) return { kind: "confirmed", at, labels: Array.isArray(o.수정확인항목) ? o.수정확인항목 : [] };
  return null;
}
