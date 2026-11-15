// ======================= src/lossReason.js =======================
// 📑 2026-11-15 손실(역마진) 오더의 손실 사유 — 배차현황 · 실시간 배차현황에서 빨간 수수료(손실 금액)를 누르면 적는 창
//  · 저장: orders(또는 dispatch)/{id}.손실사유
//  · 보고서(팀 실적 보고서 › 리스크 점검)에 들어가는 사유 = 손실사유가 있으면 그것, 없으면 메모(둘 다 있으면 손실사유가 먼저)
import { kpPrompt } from "./kpDialog";

export const lossReasonOf = (r) => String(r?.손실사유 || "").trim() || String(r?.메모 || "").trim();

// fee: 손실 금액(음수) · save(text): 저장 함수(화면마다 patchDispatch)
export async function editLossReason(row, fee, save) {
  const memo = String(row?.메모 || "").trim();
  const v = await kpPrompt(
    `이 오더는 ${Math.abs(Number(fee) || 0).toLocaleString("ko-KR")}원 손실이에요. 손실 사유를 적어 주세요.\n비워 두면 ${memo ? `메모("${memo.slice(0, 30)}${memo.length > 30 ? "…" : ""}")가` : "메모가"} 손실 사유로 쓰여요.`,
    String(row?.손실사유 || ""),
    { title: "손실 사유", placeholder: "예) 긴급 배차로 기사운임 인상 · 거래처 단가 미반영", okText: "저장" },
  );
  if (v === null || v === undefined || v === false) return false;
  await save(String(v).trim().slice(0, 300));
  return true;
}
