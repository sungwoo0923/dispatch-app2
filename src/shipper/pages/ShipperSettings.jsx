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
      <aside className="w-[220px] bg-white border-r px-3 py-4">
        <div className="text-xs text-gray-400 mb-3">설정</div>

        <SideBtn label="설정" active={menu==="profile"} onClick={()=>setMenu("profile")} />
        <SideBtn label="이용자관리" active={menu==="users"} onClick={()=>setMenu("users")} />
        <SideBtn label="운송사관리" active={menu==="transport"} onClick={()=>setMenu("transport")} />
        <SideBtn label="주소록관리" active={menu==="address"} onClick={()=>setMenu("address")} />
      </aside>

      {/* ===== 우측 ===== */}
      <div className="flex-1 p-6 bg-[#f5f6f8] overflow-auto">

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
        px-3 py-2 rounded-md cursor-pointer text-sm mb-1
        ${active ? "bg-gray-200 font-semibold" : "hover:bg-gray-100"}
      `}
    >
      {label}
    </div>
  );
}