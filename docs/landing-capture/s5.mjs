import { clickText, clickHas, sub, seq, sleep } from "./lib.mjs";
export default { steps: [
  { run: seq(clickText("지입차관리"), sleep(3000), clickText("관제현황")), shot: "c-control.png", after: 8000 },
  { run: seq(clickText("HOME"), clickText("결재함"), sleep(3000), clickHas("인천→평택 11톤 운임 변경")), shot: "c-approval.png", after: 4000 },
  { run: seq(clickText("HOME"), clickText("대시보드")), shot: "c-home.png", after: 5000 },
  { run: clickText("실시간배차현황"), shot: "c-board.png", after: 5000 },
] };
