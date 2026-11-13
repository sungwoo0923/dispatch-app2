// 정산관리를 열 때 처음 보일 탭 — 기본은 정산 홈, 예전처럼 거래처정산부터 보려면 정산 홈 아래에서 체크(이 PC에 기억)
export const START_KEY = "kpSettleStart";
export const settleStartTab = () => { try { return localStorage.getItem(START_KEY) === "거래처정산" ? "거래처정산" : "홈"; } catch { return "홈"; } };
