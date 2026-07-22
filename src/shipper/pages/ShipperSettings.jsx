import { useState } from "react";

import SettingsProfile from "./SettingsProfile";
import SettingsUsers from "./SettingsUsers";
import SettingsTransport from "./SettingsTransport";
import SettingsAddress from "./SettingsAddress";

export default function ShipperSettings() {
  const [menu, setMenu] = useState("profile");

  return (
    <div className="flex h-[calc(100vh-80px)]">

      {/* ===== 좌측 메뉴 ===== */}
      <aside className="w-[220px] bg-white border-r border-gray-200 px-3 py-4">
        <div className="text-xs font-bold text-gray-400 mb-3 px-1">마스터설정</div>

        <SideBtn label="설정" active={menu==="profile"} onClick={()=>setMenu("profile")} />
        <SideBtn label="이용자관리" active={menu==="users"} onClick={()=>setMenu("users")} />
        <SideBtn label="운송사관리" active={menu==="transport"} onClick={()=>setMenu("transport")} />
        <SideBtn label="주소록관리" active={menu==="address"} onClick={()=>setMenu("address")} />
      </aside>

      {/* ===== 우측 ===== */}
      <div className="flex-1 p-6 bg-[#f3f4f6] overflow-auto">

        {menu === "profile" && <SettingsProfile />}
        {menu === "users" && <SettingsUsers />}
        {menu === "transport" && <SettingsTransport />}
       {menu === "address" && <SettingsAddress />}

      </div>
    </div>
  );
}

/* ================= 사이드 버튼 ================= */
function SideBtn({ label, active, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`
        px-3 py-2 rounded-lg cursor-pointer text-sm font-semibold mb-1 transition
        ${active ? "bg-[#1B2B4B] text-white" : "text-gray-600 hover:bg-[#eef1f7] hover:text-[#1B2B4B]"}
      `}
    >
      {label}
    </div>
  );
}