// ======================= src/mobile/MobileDriverApp.jsx =======================
import React, { useState } from "react";
import DriverHome from "./DriverHome";
import DriverRun from "./DriverRun";
import DriverReport from "./DriverReport";

export default function MobileDriverApp() {
  const [tab, setTab] = useState("home");

  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="flex-1 overflow-y-auto">
        {tab === "home" && <DriverHome />}
        {tab === "run" && <DriverRun />}
        {tab === "report" && <DriverReport />}
        {tab === "profile" && <DriverProfile />}
      </div>

      {/* Bottom Tabs */}
      <div className="grid grid-cols-4 text-center border-t bg-gray-100">
        <button onClick={() => setTab("home")} className={`py-3 ${tab === "home" && "bg-white font-bold"}`}>📌 운행</button>
        <button onClick={() => setTab("run")} className={`py-3 ${tab === "run" && "bg-white font-bold"}`}>🛰 GPS</button>
        <button onClick={() => setTab("report")} className={`py-3 ${tab === "report" && "bg-white font-bold"}`}>📑 리포트</button>
        <button onClick={() => setTab("profile")} className={`py-3 ${tab === "profile" && "bg-white font-bold"}`}>⚙️ 설정</button>
      </div>
    </div>
  );
}
