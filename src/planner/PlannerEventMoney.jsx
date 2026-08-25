// src/planner/PlannerEventMoney.jsx — "경조사" 메뉴 (PC/모바일 공용).
// 결혼식/장례식 등에서 누구에게 얼마를 냈는지, 누구에게 얼마를 받았는지 기록해두고
// 이름으로 검색하면 그 사람과 주고받은 내역과 잔액(누가 줄 차례인지)을 보여준다.
// 한국 가정에 실제로 필요한데 캘린더/가계부 앱엔 잘 없는 기능.
import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  usePlannerEntries, addPlannerEntry, deletePlannerEntry, fmtWon, todayStr,
  formatAmountInput, parseAmountInput, eventMoneyBalanceByPerson,
  EVENT_MONEY_TYPES, EVENT_MONEY_RELATIONS, mergeEventMoneyRelationOptions, mergeEventMoneyTypeOptions,
} from "../adminPlannerData";
import PlannerDatePicker from "./PlannerDatePicker";
import PlannerCategorySelect from "./PlannerCategorySelect";
import useBodyScrollLock from "./useBodyScrollLock";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

function fieldStyle() {
  return { borderColor: ACCENT_BORDER };
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
function dateLabelKo(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${dateStr} (${WEEKDAY_KO[d.getDay()]})`;
}
function groupRecordsByDate(records) {
  const map = new Map();
  records.forEach((r) => {
    const d = r.date || "날짜없음";
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(r);
  });
  return Array.from(map.entries()); // records가 이미 날짜 내림차순으로 들어와 순서 유지
}

function AddModal({ groupId, actorUid, actorName, entries, onClose }) {
  useBodyScrollLock();
  const modalRef = React.useRef(null);
  React.useEffect(() => { modalRef.current?.focus(); }, []);

  const relationOptions = useMemo(() => mergeEventMoneyRelationOptions(entries), [entries]);
  const typeOptions = useMemo(() => mergeEventMoneyTypeOptions(entries), [entries]);

  const [personName, setPersonName] = useState("");
  const [relation, setRelation] = useState(EVENT_MONEY_RELATIONS[0]);
  const [eventType, setEventType] = useState(EVENT_MONEY_TYPES[0]);
  const [direction, setDirection] = useState("give");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!personName.trim() || !parseAmountInput(amount)) { alert("이름과 금액을 입력해 주세요."); return; }
    setSaving(true);
    try {
      await addPlannerEntry({
        type: "eventMoney", companyName: groupId,
        personName: personName.trim(), relation: relation.trim() || "기타", eventType: eventType.trim() || "기타", direction,
        amount: Number(parseAmountInput(amount)), date, memo: memo.trim(),
        createdByUid: actorUid, createdByName: actorName || "",
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10010] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div ref={modalRef} tabIndex={-1} className="relative bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full sm:w-[420px] max-h-[88vh] overflow-y-auto overscroll-contain outline-none">
        <div className="text-[15px] font-extrabold text-gray-800 mb-4">경조사 기록 추가</div>

        <div className="flex gap-2 mb-3">
          {[["give", "내가 냈어요"], ["receive", "내가 받았어요"]].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setDirection(v)}
              className="flex-1 py-2.5 rounded-lg text-[12.5px] font-bold border"
              style={direction === v ? { background: ACCENT, color: "#fff", borderColor: ACCENT } : { color: ACCENT, borderColor: ACCENT_BORDER }}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-[11.5px] font-semibold text-gray-600 mb-1">이름</div>
            <input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="예: 김철수" className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none" style={fieldStyle()} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11.5px] font-semibold text-gray-600 mb-1">관계</div>
              <PlannerCategorySelect value={relation} onChange={setRelation} options={relationOptions} placeholder="직접 입력 가능" className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none bg-white" />
            </div>
            <div>
              <div className="text-[11.5px] font-semibold text-gray-600 mb-1">경조사 종류</div>
              <PlannerCategorySelect value={eventType} onChange={setEventType} options={typeOptions} placeholder="직접 입력 가능" className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none bg-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11.5px] font-semibold text-gray-600 mb-1">금액</div>
              <input
                value={amount}
                onChange={(e) => setAmount(formatAmountInput(parseAmountInput(e.target.value)))}
                placeholder="0"
                inputMode="numeric"
                className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none text-right"
                style={fieldStyle()}
              />
            </div>
            <div>
              <div className="text-[11.5px] font-semibold text-gray-600 mb-1">날짜</div>
              <PlannerDatePicker value={date} onChange={setDate} />
            </div>
          </div>
          <div>
            <div className="text-[11.5px] font-semibold text-gray-600 mb-1">메모 (선택)</div>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 큰이모 아들 결혼식" className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none" style={fieldStyle()} />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border text-gray-600 text-[13px] font-semibold" style={fieldStyle()}>취소</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-lg text-white text-[13px] font-bold disabled:opacity-50" style={{ background: ACCENT }}>
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

const TEMPLATE_HEADERS = ["이름", "관계", "종류", "방향(냈어요/받았어요)", "금액", "날짜(YYYY-MM-DD)", "메모"];
const DIRECTION_OPTIONS = ["냈어요", "받았어요"];

// ⭐ 그냥 텍스트 예시만 넣어주던 걸, "관계/종류/방향" 칸은 실제 엑셀 드롭다운
// (데이터 유효성 검사)으로 눌러서 고를 수 있게 바꿨다. 이건 읽기용 xlsx 패키지로는
// 못 만들어서(데이터 유효성 검사 쓰기 미지원), 쓰기 전용으로 exceljs를 쓴다 —
// 업로드된 파일을 읽는 쪽은 그대로 xlsx를 쓰므로 셀 값이 일반 텍스트로만
// 들어오는 한 아무 문제 없다. exceljs는 용량이 커서, 이 버튼을 실제로 누를 때만
// 동적으로 불러온다(정적 import하면 KP-Planner 첫 화면 번들이 900KB 넘게 커짐).
async function downloadTemplate() {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("경조사");
  ws.columns = TEMPLATE_HEADERS.map((h, i) => ({ header: h, key: `c${i}`, width: i === 6 ? 22 : i === 3 ? 22 : 14 }));
  ws.addRow(["김철수", "친구", "결혼식", "냈어요", 50000, todayStr(), ""]);
  ws.getRow(1).font = { bold: true };

  const relationList = `"${EVENT_MONEY_RELATIONS.join(",")}"`;
  const typeList = `"${EVENT_MONEY_TYPES.join(",")}"`;
  const directionList = `"${DIRECTION_OPTIONS.join(",")}"`;
  for (let r = 2; r <= 200; r++) {
    ws.getCell(`B${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [relationList] };
    ws.getCell(`C${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [typeList] };
    ws.getCell(`D${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [directionList] };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "경조사_업로드양식.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ⭐ PC는 엑셀 양식을, 모바일은 카톡/메일로 받은 파일이나 파일 앱에 저장해둔 파일을
// 그대로 선택하면 되므로, 별도의 "모바일 전용" 업로드 방식을 따로 만들 필요 없이
// 이 파일 선택 하나로 PC/모바일 둘 다 대응한다(모바일 브라우저도 표준 파일
// 선택기를 통해 xlsx를 그대로 읽을 수 있다).
function BulkUploadModal({ groupId, actorUid, actorName, onClose }) {
  useBodyScrollLock();
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [templating, setTemplating] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const handleDownloadTemplate = async () => {
    setTemplating(true);
    try { await downloadTemplate(); } finally { setTemplating(false); }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(""); setRows([]); setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const parsed = json.map((row) => {
        const personName = String(row["이름"] || "").trim();
        const relation = String(row["관계"] || "기타").trim() || "기타";
        const eventType = String(row["종류"] || "기타").trim() || "기타";
        const dirRaw = String(row["방향(냈어요/받았어요)"] || row["방향"] || "").trim();
        const direction = /받/.test(dirRaw) ? "receive" : "give";
        const amount = Number(String(row["금액"] || "").toString().replace(/[^0-9.-]/g, "")) || 0;
        let date = row["날짜(YYYY-MM-DD)"] || row["날짜"] || "";
        if (date instanceof Date) {
          const p = (n) => String(n).padStart(2, "0");
          date = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
        } else {
          date = String(date).trim();
        }
        const memo = String(row["메모"] || "").trim();
        return { personName, relation, eventType, direction, amount, date: date || todayStr(), memo, valid: !!personName && amount > 0 };
      });
      setRows(parsed);
      if (parsed.length === 0) setError("업로드할 내용이 없어요. 양식을 확인해 주세요.");
    } catch {
      setError("엑셀 파일을 읽지 못했어요. 양식을 확인해 주세요.");
    }
  };

  const validRows = rows.filter((r) => r.valid);

  const doImport = async () => {
    if (validRows.length === 0) return;
    setUploading(true);
    try {
      for (const r of validRows) {
        await addPlannerEntry({
          type: "eventMoney", companyName: groupId,
          personName: r.personName, relation: r.relation, eventType: r.eventType, direction: r.direction,
          amount: r.amount, date: r.date, memo: r.memo,
          createdByUid: actorUid, createdByName: actorName || "",
        });
      }
      onClose();
    } catch (err) {
      setError("업로드 중 오류가 발생했어요: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10011] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full sm:w-[440px] max-h-[88vh] overflow-y-auto overscroll-contain">
        <div className="text-[15px] font-extrabold text-gray-800 mb-1.5">엑셀로 한번에 등록</div>
        <div className="text-[12px] text-gray-500 leading-relaxed mb-4">
          여러 명 경조사비를 한 번에 등록할 수 있어요. 양식을 내려받아 채운 뒤 업로드해 주세요.
          모바일에서도 카카오톡·메일로 받은 파일이나 파일 앱에 저장된 엑셀 파일을 그대로 선택하면 돼요.
        </div>
        <button onClick={handleDownloadTemplate} disabled={templating} className="w-full py-2.5 rounded-lg border text-[12.5px] font-bold mb-2 disabled:opacity-60" style={fieldStyle()}>
          {templating ? "양식 만드는 중..." : "양식 다운로드"}
        </button>
        <button onClick={() => inputRef.current?.click()} className="w-full py-2.5 rounded-lg text-white text-[12.5px] font-bold" style={{ background: ACCENT }}>
          엑셀 파일 선택
        </button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
        {fileName && <div className="text-[11px] text-gray-400 mt-2">{fileName}</div>}
        {error && <div className="text-[11.5px] text-red-500 mt-2">{error}</div>}
        {rows.length > 0 && (
          <div className="mt-3 border rounded-lg overflow-hidden" style={fieldStyle()}>
            <div className="px-3 py-2 text-[11.5px] font-bold text-gray-600" style={{ background: ACCENT_SOFT }}>
              총 {rows.length}건 중 {validRows.length}건 등록 가능
            </div>
            <div className="max-h-[180px] overflow-y-auto divide-y divide-gray-50">
              {rows.map((r, i) => (
                <div key={i} className="px-3 py-1.5 text-[11.5px] flex items-center justify-between">
                  <span className={r.valid ? "text-gray-700" : "text-red-400"}>{r.personName || "(이름없음)"} · {r.date}</span>
                  <span className="text-gray-400">{fmtWon(r.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border text-gray-600 text-[13px] font-semibold" style={fieldStyle()}>취소</button>
          <button onClick={doImport} disabled={uploading || validRows.length === 0} className="flex-1 py-2.5 rounded-lg text-white text-[13px] font-bold disabled:opacity-50" style={{ background: ACCENT }}>
            {uploading ? "등록 중..." : `${validRows.length}건 등록`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlannerEventMoney({ account }) {
  const { entries } = usePlannerEntries(account.groupId);
  const [keyword, setKeyword] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [openPerson, setOpenPerson] = useState(null);
  const [filters, setFilters] = useState({ start: "", end: "" });

  const eventEntries = useMemo(() => entries.filter((e) => e.type === "eventMoney"), [entries]);
  const dateFiltered = useMemo(
    () => eventEntries.filter((e) => (!filters.start || (e.date || "") >= filters.start) && (!filters.end || (e.date || "") <= filters.end)),
    [eventEntries, filters]
  );

  const people = useMemo(() => eventMoneyBalanceByPerson(dateFiltered), [dateFiltered]);
  const filtered = useMemo(
    () => (keyword.trim() ? people.filter((p) => p.personName.includes(keyword.trim())) : people),
    [people, keyword]
  );

  const remove = async (id) => {
    if (!confirm("이 기록을 삭제할까요?")) return;
    await deletePlannerEntry(id);
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="text-[12.5px] text-gray-500 leading-relaxed">
        경조사비를 주고받은 내역을 이름별로 기록해두면, 나중에 그 사람에게 경조사가 생겼을 때 얼마를 줬었는지 바로 확인할 수 있어요.
      </div>

      <div className="flex gap-2">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="이름으로 검색"
          className="flex-1 min-w-0 border rounded-full px-4 py-2.5 text-[13px] focus:outline-none"
          style={fieldStyle()}
        />
        <button onClick={() => setShowBulk(true)} className="shrink-0 whitespace-nowrap px-3.5 rounded-full border text-[12.5px] font-bold" style={{ color: ACCENT, borderColor: ACCENT_BORDER }}>
          엑셀 일괄 등록
        </button>
        <button onClick={() => setShowAdd(true)} className="shrink-0 whitespace-nowrap px-4 rounded-full text-white text-[12.5px] font-bold" style={{ background: ACCENT }}>
          + 기록 추가
        </button>
      </div>

      <div className="flex items-end gap-2 bg-white border rounded-xl p-2.5" style={fieldStyle()}>
        <div className="flex-1 min-w-0">
          <div className="text-[10.5px] font-semibold text-gray-400 mb-1">시작일</div>
          <PlannerDatePicker value={filters.start} onChange={(v) => setFilters((d) => ({ ...d, start: v }))} className="w-full text-left border rounded-lg px-2.5 py-1.5 text-[12px]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10.5px] font-semibold text-gray-400 mb-1">종료일</div>
          <PlannerDatePicker value={filters.end} onChange={(v) => setFilters((d) => ({ ...d, end: v }))} className="w-full text-left border rounded-lg px-2.5 py-1.5 text-[12px]" />
        </div>
        {(filters.start || filters.end) && (
          <button onClick={() => setFilters({ start: "", end: "" })} className="shrink-0 px-3 py-1.5 rounded-lg border text-[11.5px] font-semibold text-gray-500" style={fieldStyle()}>전체</button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-[12.5px] text-gray-400 text-center py-10 bg-white border rounded-xl" style={fieldStyle()}>
          {keyword || filters.start || filters.end ? "해당하는 기록이 없어요." : "아직 등록된 경조사 기록이 없어요."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const open = openPerson === p.personName;
            // ⭐ "OOO원 줄 차례"처럼 앞으로 갚아야 할 의무처럼 표현하던 문구 대신,
            // 그동안 실제로 있었던 일을 그대로 알려주는 문구로 바꿨다.
            const balanceLabel = p.balance > 0 ? `${fmtWon(p.balance)} 냈었어요` : p.balance < 0 ? `${fmtWon(-p.balance)} 받았었어요` : "정산 완료";
            const balanceColor = p.balance > 0 ? "#2563eb" : p.balance < 0 ? "#dc2626" : "#6b7280";
            const dateGroups = groupRecordsByDate(p.records);
            return (
              <div key={p.personName} className="bg-white border rounded-xl overflow-hidden" style={fieldStyle()}>
                <button onClick={() => setOpenPerson(open ? null : p.personName)} className="w-full flex items-center justify-between px-4 py-3">
                  <div className="text-left">
                    <div className="text-[13.5px] font-bold text-gray-800">{p.personName}</div>
                    <div className="text-[10.5px] text-gray-400 mt-0.5">{p.records.length}건 · 낸 {fmtWon(p.gave)} · 받은 {fmtWon(p.received)}</div>
                  </div>
                  <div className="text-[12px] font-bold" style={{ color: balanceColor }}>{balanceLabel}</div>
                </button>
                {open && (
                  <div className="border-t px-4 py-2.5 space-y-3" style={{ borderColor: ACCENT_SOFT }}>
                    {dateGroups.map(([date, items]) => (
                      <div key={date}>
                        <div className="text-[10.5px] font-bold text-gray-400 mb-1">{dateLabelKo(date)}</div>
                        <div className="space-y-1.5">
                          {items.map((r) => (
                            <div key={r.id} className="flex items-center justify-between py-1 text-[12px]">
                              <div className="min-w-0">
                                <span className="text-gray-500">{r.eventType} · {r.relation}</span>
                                {r.memo && <span className="text-gray-400 ml-2">{r.memo}</span>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-bold" style={{ color: r.direction === "give" ? "#dc2626" : "#2563eb" }}>
                                  {r.direction === "give" ? "-" : "+"}{fmtWon(r.amount)}
                                </span>
                                <button onClick={() => remove(r.id)} className="text-gray-300 hover:text-gray-500 text-[11px]">삭제</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && <AddModal groupId={account.groupId} actorUid={account.uid} actorName={account.name} entries={entries} onClose={() => setShowAdd(false)} />}
      {showBulk && <BulkUploadModal groupId={account.groupId} actorUid={account.uid} actorName={account.name} onClose={() => setShowBulk(false)} />}
    </div>
  );
}
