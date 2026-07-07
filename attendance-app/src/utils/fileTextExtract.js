// 업로드한 문서에서 텍스트를 최대한 뽑아내기 위한 유틸.
// txt/csv는 그대로, xlsx/xls는 셀 텍스트를 이어붙여서, pdf는 pdfjs로 페이지별
// 텍스트를 추출한다. hwp(한글)·docx 등 다른 바이너리 포맷은 이 앱에 파서가
// 없어 지원하지 않는다 — 업로드 자체는 막지 않지만 텍스트 인식에 실패했다는
// 것을 호출부가 알 수 있도록 빈 문자열을 반환한다.
export async function extractTextFromFile(file) {
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf")) {
    try {
      const pdfjsLib = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((it) => it.str).join("\n") + "\n";
      }
      return text;
    } catch {
      return "";
    }
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      return wb.SheetNames.map((sheetName) => XLSX.utils.sheet_to_csv(wb.Sheets[sheetName])).join("\n");
    } catch {
      return "";
    }
  }

  if (name.endsWith(".txt") || name.endsWith(".csv")) {
    return file.text();
  }

  // .hwp, .docx, .doc 등은 클라이언트에서 신뢰성 있게 파싱할 방법이 없다.
  return "";
}

export const UPLOAD_ACCEPT = ".txt,.csv,.pdf,.xlsx,.xls,.hwp,.docx,.doc";
