// ======================= src/xlsxParseWorker.js =======================
// ⭐ 2026-11-03 큰 엑셀(탭 수백 개) 읽기를 화면 밖(백그라운드)에서 — 화면에서 바로 읽으면 브라우저가 "응답 없는 페이지"로 멈췄다.
//  받은 파일(ArrayBuffer) → 탭마다 상하차지·기사 후보만 뽑아서 돌려준다(칸 값 전체는 돌려주지 않음).
import * as XLSX from "xlsx";
import { parsePlacesFromGrid, parseDriversFromGrid } from "./placeDriverParse";

self.onmessage = (e) => {
  try {
    const wb = XLSX.read(e.data, { type: "array", dense: true, cellStyles: false, cellHTML: false, cellFormula: false, cellNF: false, sheetStubs: false, bookVBA: false });
    const places = []; const drivers = [];
    const total = wb.SheetNames.length;
    wb.SheetNames.forEach((name, i) => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "" });
      places.push(...parsePlacesFromGrid(rows, name));
      drivers.push(...parseDriversFromGrid(rows, name));
      delete wb.Sheets[name]; // 메모리 바로 비우기
      if (i % 10 === 9) self.postMessage({ progress: i + 1, total });
    });
    self.postMessage({ done: true, tabs: wb.SheetNames, places, drivers });
  } catch (err) {
    self.postMessage({ error: String(err?.message || err) });
  }
};
