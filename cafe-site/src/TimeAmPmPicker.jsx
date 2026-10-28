// ======================= cafe-site/src/TimeAmPmPicker.jsx =======================
// 운송 프로그램(DispatchApp.jsx)의 TimeAmPmPicker와 동일한 오전/오후 버튼 +
// 30분 단위 시간 선택. 배차마당은 본체 소스를 import하지 않는 독립 프로젝트라
// 여기 그대로 옮겨왔다(값 형식도 "오전 9시", "오후 2시 30분" 등으로 동일).
import React from "react";
import CustomSelect from "./CustomSelect";

export default function TimeAmPmPicker({ value, onChange, disabled = false }) {
  const [ampm, setAmpm] = React.useState(() => {
    if (value && value.startsWith("오후")) return "오후";
    if (value && value.startsWith("오전")) return "오전";
    return null;
  });
  React.useEffect(() => {
    if (value && value.startsWith("오전")) setAmpm("오전");
    else if (value && value.startsWith("오후")) setAmpm("오후");
    else if (!value) setAmpm(null);
  }, [value]);

  const times = React.useMemo(() => {
    const list = [];
    for (let h = 0; h < 12; h++) {
      const hh = h === 0 ? 12 : h;
      if (ampm) {
        list.push(`${ampm} ${hh}시`);
        list.push(`${ampm} ${hh}시 30분`);
      } else {
        list.push(`${hh}시`);
        list.push(`${hh}시 30분`);
      }
    }
    return list;
  }, [ampm]);

  const handleAmpm = (ap) => {
    setAmpm(ap);
    if (value) {
      const part = value.replace(/^오전 |^오후 /, "");
      onChange(`${ap} ${part}`);
    }
  };

  const btnBase = "h-11 px-2.5 text-[12.5px] font-black rounded-xl border transition";
  const act = "bg-[#0F1A30] text-white border-[#0F1A30]";
  const inact = "bg-white text-[#5B6B85] border-[#DCE3EE] hover:border-[#4B6CB7] hover:text-[#0F1A30]";

  return (
    <div className="flex items-center gap-1.5 flex-nowrap">
      <button type="button" disabled={disabled} onClick={() => handleAmpm("오전")}
        className={`${btnBase} shrink-0 whitespace-nowrap ${ampm === "오전" ? act : inact} disabled:opacity-40`}>오전</button>
      <button type="button" disabled={disabled} onClick={() => handleAmpm("오후")}
        className={`${btnBase} shrink-0 whitespace-nowrap ${ampm === "오후" ? act : inact} disabled:opacity-40`}>오후</button>
      <CustomSelect
        value={value || ""}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        className="h-11 border border-[#DCE3EE] rounded-xl px-3 text-[13.5px] font-semibold outline-none focus:border-[#4B6CB7] flex-1 min-w-0 disabled:bg-[#F5F7FA] disabled:text-[#9AA9C3] bg-white"
      >
        <option value="">시간 선택</option>
        {times.map(t => (
          <option key={t} value={t}>{t.replace(/^오전 |^오후 /, "")}</option>
        ))}
      </CustomSelect>
    </div>
  );
}
