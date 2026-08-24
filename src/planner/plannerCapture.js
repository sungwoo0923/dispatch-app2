// src/planner/plannerCapture.js — "지금 보고 있는 화면 그대로" 이미지로 저장하는 공용 헬퍼.
// 모바일 수입/지출 화면의 "이미지저장" 버튼 등에서 쓴다.
import html2canvas from "html2canvas";

export async function captureNodeAsImage(node, filename) {
  if (!node) return;
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
