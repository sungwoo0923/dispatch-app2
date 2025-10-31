// src/components/ExcelUploader.jsx
import React from "react";
import * as XLSX from "xlsx";

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

      if (onDataLoaded) onDataLoaded(json);
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