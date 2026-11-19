// ======================= src/placeSearch.js =======================
// 🔎 2026-11-03 상/하차지 검색 공용 — 업체명이 같고 주소·담당자만 다른 곳이 많을 때(예: (도외)위탁 55곳)
//  "도외 목포"처럼 띄어 쓰면 첫 낱말은 업체명, 나머지 낱말은 주소·담당자·전화번호에서 찾아 바로 좁힌다.
//  점수: 업체명 완전일치 > 앞글자 일치 > 포함, 같은 점수는 업체명 → 주소 순.
//  2026-11-19 DispatchApp.jsx 에서 옮김 — 오더등록 폼과 일괄수정 · 복사 창이 같은 검색을 쓴다
const _pqN = (s) => String(s || "").toLowerCase().replace(/[\s()（）\-]/g, "");
export function placeSearch(list, q) {
  const toks = String(q || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  const first = _pqN(toks[0]); const rest = toks.slice(1).map(_pqN).filter(Boolean);
  const out = [];
  (list || []).forEach((p) => {
    if (!p) return;
    const name = _pqN(p.업체명 || p.name || p.거래처명);
    if (!name) return;
    let sc = name === first ? 100 : name.startsWith(first) ? 80 : name.includes(first) ? 50 : 0;
    // 낱말이 하나뿐이면 예전처럼 업체명만, 여러 개면 전체(업체명+주소+담당자)에서도 첫 낱말을 찾는다
    if (rest.length) {
      const hay = name + _pqN([p.주소, p.담당자, p.담당자번호, p.연락처, ...(Array.isArray(p.contacts) ? p.contacts.flatMap((c) => [c?.name, c?.phone]) : [])].join(" "));
      if (!sc && hay.includes(first)) sc = 30;
      if (!sc || !rest.every((t) => hay.includes(t))) {
        // ⭐ 2026-11-03 이름 자체에 띄어쓰기가 있는 경우("삼진 1") — 붙여서 이름에서 찾기
        const whole = first + rest.join("");
        if (name.includes(whole)) out.push({ ...p, __score: name === whole ? 100 : name.startsWith(whole) ? 80 : 50 });
        return;
      }
    }
    if (sc) out.push({ ...p, __score: sc });
  });
  return out.sort((a, b) => b.__score - a.__score || String(a.업체명 || "").localeCompare(String(b.업체명 || ""), "ko") || String(a.주소 || "").localeCompare(String(b.주소 || ""), "ko"));
}
