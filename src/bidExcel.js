// ======================= src/bidExcel.js =======================
// 🧮 2026-11-23 입찰견적 — 업체 견적 엑셀 읽기 · 원본에 단가 써넣기(exceljs — 서식 · 병합 · 메모 그대로)
//  · 읽기: 시트마다 2차원 값(A1 = [0][0]) — 병합 칸은 맨 왼쪽 위 칸에만 값(나머지는 빈칸), 수식은 계산된 값
//  · 쓰기: 받은 파일 그대로 열어 단가 칸 주소(예: "R7")에 숫자만 넣고 다시 저장 — 파일은 서버로 보내지 않는다
//  ⚠ 다른 파일(firebase · 화면)을 가져오지 않는다(node 테스트에서 그대로 읽음)
import ExcelJS from "exceljs";

const valueText = (v) => {
  if (v == null) return "";
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return valueText(v.result);
    if (v.text != null) return String(v.text);
    if (v.error) return "";
    return "";
  }
  return String(v);
};

export async function readWorkbook(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const out = [];
  wb.eachSheet((ws) => {
    if (ws.state && ws.state !== "visible") return;
    const aoa = [];
    const rows = ws.rowCount, cols = Math.min(ws.columnCount, 200);
    for (let r = 1; r <= Math.min(rows, 2000); r++) {
      const row = ws.getRow(r); const a = [];
      for (let c = 1; c <= cols; c++) {
        const cell = row.getCell(c);
        if (cell.isMerged && cell.master && cell.master.address !== cell.address) { a.push(""); continue; }
        a.push(valueText(cell.value).replace(/\r/g, "").trim());
      }
      aoa.push(a);
    }
    out.push({ name: ws.name, aoa });
  });
  return out;
}

// values: { "R7": 100000, ... } — 0 · 빈 값은 건너뛴다. 반환: 새 파일(ArrayBuffer)
export async function writeBids(buf, sheetName, values) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`시트 "${sheetName}"를 찾지 못했어요`);
  let n = 0;
  Object.entries(values || {}).forEach(([addr, v]) => {
    const num = Number(v);
    if (!addr || !Number.isFinite(num) || num <= 0) return;
    ws.getCell(addr).value = num; n++;
  });
  const out = await wb.xlsx.writeBuffer();
  return { buffer: out, count: n };
}
