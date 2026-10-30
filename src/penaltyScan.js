// ======================= src/penaltyScan.js =======================
// 🔎 과태료·범칙금 고지서 스캔 — 사진에서 글자를 읽어(한글 인식) 서류 칸을 자동으로 채운다.
//  읽는 것: 차량번호 · 위반 일시 · 위반 장소 · 위반 내용(속도·신호·주정차 등) · 금액 · 납부 기한 · 고지 기관 · 고지서 번호
import { prepImage } from "./OrderScanModal";

const pad = (n) => String(n).padStart(2, "0");
function findDates(t) {
  const out = [];
  const re = /(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?(?:\s*\(?[월화수목금토일]?\)?)?(?:\s*(\d{1,2})\s*[:시]\s*(\d{1,2})\s*분?)?/g;
  let m;
  while ((m = re.exec(t))) out.push({ i: m.index, date: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, time: m[4] ? `${pad(m[4])}:${pad(m[5])}` : "" });
  return out;
}
const near = (t, label, list) => { const k = t.search(label); if (k < 0) return null; return list.filter((d) => d.i >= k).sort((a, b) => a.i - b.i)[0] || null; };
const lineAfter = (t, label) => { const m = t.match(new RegExp(`(?:${label})\\s*[:：]?\\s*([^\\n]{2,60})`)); return m ? m[1].trim().replace(/\s{2,}/g, " ") : ""; };

export function parsePenaltyText(text) {
  const t = String(text || "").replace(/\r/g, "");
  const flat = t.replace(/\n/g, " ");
  const dates = findDates(flat);
  const occur = near(flat, /위반\s*일시|단속\s*일시|발생\s*일시|일\s*시/, dates) || dates[0] || null;
  const due = near(flat, /납부\s*기한|납기|기한/, dates);
  const plate = (flat.match(/\d{2,3}\s?[가-힣]\s?\d{4}/) || [""])[0].replace(/\s/g, "");
  const amounts = [...flat.matchAll(/(\d{1,3}(?:,\d{3})+|\d{4,7})\s*원/g)].map((m) => Number(m[1].replace(/,/g, ""))).filter((n) => n >= 1000 && n <= 5000000);
  const amtLabel = flat.match(/(?:납부\s*금액|과태료|범칙금|부과\s*금액|금\s*액)[^\d]{0,10}(\d{1,3}(?:,\d{3})+|\d{4,7})/);
  const amount = amtLabel ? Number(amtLabel[1].replace(/,/g, "")) : (amounts.length ? Math.max(...amounts) : 0);
  const kinds = [["속도위반", /속도|과속|km\/h|㎞/], ["신호위반", /신호/], ["주정차 위반", /주\s*정차|주차/], ["통행료 미납", /통행료|하이패스|미납/], ["범칙금", /범칙금/], ["사고 처리", /사고|보험/]];
  const kindHit = kinds.find(([, re]) => re.test(flat));
  const kind = kindHit ? kindHit[0] : /과태료/.test(flat) ? "과태료" : "";
  const place = lineAfter(t, "위반\\s*장소|단속\\s*장소|발생\\s*장소|장\\s*소");
  const detail = lineAfter(t, "위반\\s*내용|위반\\s*사항|단속\\s*내용|내\\s*용") || (flat.match(/제한속도[^\n]{0,40}/) || [""])[0];
  const agency = (flat.match(/[가-힣]{2,10}(?:경찰서|경찰청|시청|군청|구청|도청|한국도로공사|도로공사|자치경찰단)/) || [""])[0];
  const docNo = (flat.match(/(?:고지서\s*번호|납부\s*번호|전자\s*납부\s*번호|고지\s*번호)\s*[:：]?\s*([\d-]{6,30})/) || ["", ""])[1];
  const found = { kind, date: occur?.date || "", time: occur?.time || "", place, detail, amount: amount || "", dueDate: due && due !== occur ? due.date : "", agency, docNo, carNo: plate };
  return { found, count: Object.values(found).filter(Boolean).length };
}

export async function scanPenaltyImage(dataUrl, onProgress) {
  const prep = await prepImage(dataUrl);
  const { createWorker } = await import("tesseract.js");
  onProgress?.("한글 인식 모델 준비 중(처음 한 번은 조금 걸려요)", 0);
  const worker = await createWorker("kor+eng", 1, { logger: (m) => { if (m.status === "recognizing text") onProgress?.("글자 읽는 중", Math.round((m.progress || 0) * 100)); }, errorHandler: () => {} });
  await worker.setParameters({ preserve_interword_spaces: "1" }).catch(() => {});
  const { data } = await worker.recognize(prep.canvas);
  worker.terminate().catch(() => {});
  return { text: String(data.text || ""), ...parsePenaltyText(data.text) };
}
