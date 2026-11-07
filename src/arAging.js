// ======================= src/arAging.js =======================
// 💰 2026-11-07 미수금 연령 공용 계산(화면 없이 숫자만) — 회계관리(미수금 현황·회계 개요)·일일 경영 보고·경영 분석이 같은 방식을 쓴다
//  · 오래된 청구부터 수금된 것으로 보고(선입선출) 남은 청구를 경과일로 나눈다
//  · invoices: [{ d:"YYYY-MM-DD", amt }] · paid: 그 거래처 수금 합계 · today: "YYYY-MM-DD"
//  · 결과 { b30, b60, b90, over, oldest } — oldest = 아직 못 받은 청구 중 가장 오래된 것의 경과일(다 받았으면 0)
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

export function agingOf(invoices, paid, today) {
  let left = Math.max(0, paid || 0);
  const out = { b30: 0, b60: 0, b90: 0, over: 0, oldest: 0 };
  [...(invoices || [])].filter((x) => x && x.d).sort((x, y) => x.d.localeCompare(y.d)).forEach(({ d, amt }) => {
    const use = Math.min(left, amt); left -= use; const rest = amt - use; if (rest <= 0) return;
    const age = Math.max(0, dayDiff(d, today)); out.oldest = Math.max(out.oldest, age);
    if (age <= 30) out.b30 += rest; else if (age <= 60) out.b60 += rest; else if (age <= 90) out.b90 += rest; else out.over += rest;
  });
  return out;
}
