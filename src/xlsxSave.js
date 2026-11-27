// ======================= src/xlsxSave.js =======================
// 🛠 2026-11-27 엑셀 내려받기 — 받은 파일 이름이 'download'(확장자 없음)로 저장되던 문제.
//  XLSX.writeFile 은 링크를 만들자마자 지우고 파일 종류를 application/octet-stream 으로 줘서 브라우저 · 환경에 따라 이름을 잃었다.
//  → 엑셀 파일 종류(xlsx)로 만들고, 링크를 잠깐 붙여 둔 채 누른 뒤 지운다. 이름 끝에 .xlsx 가 없으면 붙인다.
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function saveWorkbook(XLSX, wb, fileName) {
  const name = /\.xlsx$/i.test(fileName) ? fileName : `${fileName}.xlsx`;
  try {
    const data = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const url = URL.createObjectURL(new Blob([data], { type: XLSX_MIME }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { try { a.remove(); } catch { /* 무시 */ } }, 1500);
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* 무시 */ } }, 60000);
  } catch {
    XLSX.writeFile(wb, name); // 예전 방식으로라도
  }
}

// 오늘 날짜(한국 시간) YYYY-MM-DD — 파일 이름용
export const kstFileDate = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
