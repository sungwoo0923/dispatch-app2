// ======================= src/pastStats.js =======================
// ⚡ 2026-11-24 LTE 속도 — 지난 기간 일별 매출·수익 집계(buildPastStats)만 따로 뗀 작은 파일.
//  예전엔 HomeDeck.jsx(차트 라이브러리 recharts 포함)에 있어서, 일일 경영 보고(dailyReportCore)가 이 함수 하나 때문에
//  모바일 첫 화면에서 차트 라이브러리(약 110KB)까지 같이 받았다. 계산은 HomeDeck과 똑같다(HomeDeck은 여기서 다시 내보낸다).
import { creatorOf } from "./monthCompare";
import { orderProfit, fkNum } from "./forkliftCore"; // ⭐ 2026-11-17 수익 = 청구 − 기사 − 회사가 따로 지급(지게차·외부 특수운임) — 배차표 수수료와 같은 식

const toWon = (v) => fkNum(v); // 🛠 2026-11-25 수익(orderProfit)과 같은 금액 읽기 — 예전엔 소수점을 지워 200000.4 → 2,000,004
const dateOf = (r) => String(r?.상차일자 || r?.상차일 || r?.상차 || "").slice(0, 10);

// ─── 지난 기간 집계(하루 1번) — 일별 / 이번 달 담당자별 / 이번 달 거래처별 ─────────────
export function buildPastStats(rows, thisMonth) {
  const days = {}, staff = {}, clients = {};
  for (const r of rows) {
    const d = dateOf(r);
    if (!d) continue;
    const s = toWon(r.청구운임), p = orderProfit(r); // ⭐ 2026-11-17
    const e = days[d] || (days[d] = [0, 0, 0]);
    e[0] += s; e[1] += p; e[2] += 1;
    if (d.startsWith(thisMonth)) {
      const k = creatorOf(r) || "미지정";
      const st = staff[k] || (staff[k] = [0, 0, 0]);
      st[0] += s; st[1] += p; st[2] += 1;
      const cn = String(r.거래처명 || "").trim();
      if (cn) clients[cn] = (clients[cn] || 0) + s;
    }
  }
  return { days, staff, clients, month: thisMonth };
}
