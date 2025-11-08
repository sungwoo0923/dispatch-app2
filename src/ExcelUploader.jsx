// src/components/ExcelUploaderClients.jsx
import React from "react";
import * as XLSX from "xlsx";

/** 거래처 엑셀 업로드 전용
 *  기대 컬럼: 거래처명, 사업자번호, 대표자, 업태, 종목, 주소, 담당자, 연락처
 *  - 공백/널 안전 처리
 *  - 헤더 한글 그대로 매핑
 */
export default function ExcelUploaderClients({ onParsed }) {
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: "" });

        const mapped = json.map((r) => ({
          거래처명: String(r.거래처명 || "").trim(),
          사업자번호: String(r.사업자번호 || "").trim(),
          대표자: String(r.대표자 || "").trim(),
          업태: String(r.업태 || "").trim(),
          종목: String(r.종목 || "").trim(),
          주소: String(r.주소 || "").trim(),
          담당자: String(r.담당자 || "").trim(),
          연락처: String(r.연락처 || "").trim(),
        })).filter(r => r.거래처명);

        onParsed && onParsed(mapped);
      } catch (err) {
        console.error(err);
        alert("엑셀 파싱 중 오류가 발생했습니다.");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium">📁 엑셀 업로드</label>
      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFile}
        className="block text-sm"
      />
    </div>
  );
}

