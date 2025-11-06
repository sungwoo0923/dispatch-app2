// src/components/ExcelUploader.jsx
import React from "react";
import * as XLSX from "xlsx";

// ✅ 엑셀 날짜/문자 → YYYY-MM-DD 변환기
const fixDate = (v) => {
  if (!v) return "";
  if (typeof v === "number") {
    const base = new Date(1899, 11, 30);
    return new Date(base.getTime() + v * 86400000).toISOString().slice(0, 10);
  }
  const str = String(v).trim()
    .replace(/[./]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : "";
};

const ExcelUploader = ({ onDataLoaded }) => {
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      // ✅ 날짜 자동 정규화 + 지급방식 기본값 적용
      const mapped = json.map((r) => ({
        ...r,
        등록일: fixDate(r.등록일),
        상차일: fixDate(r.상차일),
        하차일: fixDate(r.하차일),
        지급방식: r.지급방식?.trim() || "계산서", // ✅ 빈칸이면 자동 계산서
      }));

      if (onDataLoaded) onDataLoaded(mapped);
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="p-2 border rounded-lg bg-gray-50 text-sm w-full max-w-md">
      <label htmlFor="excelInput" className="font-semibold block mb-1">
        📁 엑셀 파일 업로드
      </label>
      <input
        id="excelInput"
        type="file"
        accept=".xlsx, .xls"
        onChange={handleFileUpload}
        className="block w-full text-sm cursor-pointer"
      />
    </div>
  );
};

export default ExcelUploader;



// src/components/DriverManagement.jsx
import React, { useEffect, useState } from "react";
import ExcelUploader from "./ExcelUploader";

const DriverManagement = () => {
  const [drivers, setDrivers] = useState(() => {
    const saved = localStorage.getItem("drivers");
    return saved ? JSON.parse(saved) : [];
  });

  const handleExcelData = (data) => {
    setDrivers(data);
    localStorage.setItem("drivers", JSON.stringify(data));
    alert(`${data.length}명의 기사 데이터 업로드 완료`);
    window.location.reload();
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-2">기사관리</h2>
      <ExcelUploader onDataLoaded={handleExcelData} />

      <table className="mt-4 w-full border text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2">이름</th>
            <th className="border p-2">차량번호</th>
            <th className="border p-2">전화번호</th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d, i) => (
            <tr key={i}>
              <td className="border p-2">{d.이름 || d.name}</td>
              <td className="border p-2">{d.차량번호 || d.carNo}</td>
              <td className="border p-2">{d.전화번호 || d.phone}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DriverManagement;


// src/components/ClientManagement.jsx
import React, { useEffect, useState } from "react";
import ExcelUploader from "./ExcelUploader";

const ClientManagement = () => {
  const [clients, setClients] = useState(() => {
    const saved = localStorage.getItem("clients");
    return saved ? JSON.parse(saved) : [];
  });

  const handleExcelData = (data) => {
    setClients(data);
    localStorage.setItem("clients", JSON.stringify(data));
    alert(`${data.length}개의 거래처 데이터 업로드 완료`);
    window.location.reload();
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-2">거래처관리</h2>
      <ExcelUploader onDataLoaded={handleExcelData} />

      <table className="mt-4 w-full border text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2">거래처명</th>
            <th className="border p-2">사업자번호</th>
            <th className="border p-2">전화번호</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c, i) => (
            <tr key={i}>
              <td className="border p-2">{c.거래처명 || c.name}</td>
              <td className="border p-2">{c.사업자번호 || c.bizNo}</td>
              <td className="border p-2">{c.전화번호 || c.phone}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ClientManagement;