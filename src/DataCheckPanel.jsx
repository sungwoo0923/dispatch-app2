// ======================= src/DataCheckPanel.jsx =======================
// 🩺 2026-11-10 관리자메뉴 › 운영 관리 › 데이터 점검 — 엑셀 가져오기·예전 버전·직접 수정으로 들어온 "모양이 이상한 값"을 찾아 한 번에 고친다
//  · 기사(drivers) : 이름·차량번호·전화번호가 숫자 / 출근일(workDate)·키로수 기록일(care.odometerAt)·정비 날짜가 날짜 객체·숫자
//                    · 근무요일이 목록이 아님
//  · 지입 차량관리대장(vehicleLedger) : sanitizeLedger(화면이 불러올 때 쓰는 정리)와 다른 칸 — 글자 칸 숫자, 만기일 날짜 객체, 이력이 목록 아님
//  · 거래처(clients) : 거래처명·연락처·담당자 등이 숫자
//  · 우리 회사(companyName) 문서만 — 보안 규칙상 같은 회사 직원이 고칠 수 있는 것만 · 고치기 전에 확인창 · 400개씩 나눠 저장
import React from "react";
import { collection, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { kpConfirm } from "./kpDialog";
import { toYmd, arr } from "../functions/fleetCareCore.mjs";
import { VL_COL, sanitizeLedger, fmtPhone } from "./vehicleLedgerData";

const isTs = (v) => !!v && typeof v === "object" && (typeof v.toDate === "function" || "seconds" in v || v instanceof Date);
const show = (v) => (v == null ? "(없음)" : isTs(v) ? `날짜 형식(${toYmd(v) || "?"})` : Array.isArray(v) ? `목록 ${v.length}개` : typeof v === "object" ? "묶음(객체)" : typeof v === "number" ? `숫자 ${v}` : String(v).slice(0, 40));
const toText = (v) => (typeof v === "number" || typeof v === "boolean" ? String(v) : isTs(v) ? toYmd(v) : v);
const badDate = (v) => v != null && v !== "" && typeof v !== "string";
const DAY_SPLIT = /[,\s·/]+/;

// 기사 한 명 — 고칠 칸 { path: [옛 값, 새 값] }
function driverFixes(d) {
  const out = {};
  ["이름", "차량번호", "전화번호", "연락처", "차량종류", "차량톤수"].forEach((k) => {
    const v = d[k];
    if (typeof v === "number" || typeof v === "boolean") out[k] = [v, k === "전화번호" || k === "연락처" ? fmtPhone(String(v)) : String(v)];
    else if (isTs(v)) out[k] = [v, toYmd(v)];
  });
  if (badDate(d.workDate)) out.workDate = [d.workDate, toYmd(d.workDate)];
  if (d.근무요일 != null && d.근무요일 !== "" && !Array.isArray(d.근무요일)) out.근무요일 = [d.근무요일, String(typeof d.근무요일 === "object" ? Object.values(d.근무요일).join(",") : d.근무요일).split(DAY_SPLIT).filter(Boolean)];
  const c = d.care;
  if (c && typeof c === "object") {
    if (badDate(c.odometerAt)) out["care.odometerAt"] = [c.odometerAt, toYmd(c.odometerAt)];
    if (typeof c.odometer === "string" && c.odometer.trim() !== "" && Number.isFinite(Number(c.odometer.replace(/,/g, "")))) out["care.odometer"] = [c.odometer, Number(c.odometer.replace(/,/g, ""))];
    Object.entries(c.dates && typeof c.dates === "object" ? c.dates : {}).forEach(([k, v]) => { if (badDate(v)) out[`care.dates.${k}`] = [v, toYmd(v)]; });
    Object.entries(c.items && typeof c.items === "object" ? c.items : {}).forEach(([k, v]) => { if (v && badDate(v.date)) out[`care.items.${k}.date`] = [v.date, toYmd(v.date)]; });
  }
  if (d.careLogs != null && !Array.isArray(d.careLogs)) out.careLogs = [d.careLogs, arr(d.careLogs)];
  return out;
}
// 차량관리대장 한 대 — 화면이 불러올 때 하는 정리(sanitizeLedger)와 비교
function ledgerFixes(d) {
  const { id, ...raw } = d;
  const clean = sanitizeLedger(raw);
  const out = {};
  Object.keys(clean).forEach((k) => { if (JSON.stringify(clean[k]) !== JSON.stringify(raw[k]) && !(raw[k] === undefined && Array.isArray(clean[k]) && !clean[k].length)) out[k] = [raw[k], clean[k]]; });
  return out;
}
function clientFixes(d) {
  const out = {};
  ["거래처명", "업체명", "상호", "연락처", "전화번호", "담당자", "담당자연락처", "사업자번호", "주소", "메모"].forEach((k) => {
    const v = d[k];
    if (typeof v === "number" || typeof v === "boolean" || isTs(v)) out[k] = [v, /연락처|전화/.test(k) ? fmtPhone(String(toText(v))) : toText(v)];
  });
  return out;
}

const SRC = [
  { key: "drivers", label: "기사", col: "drivers", name: (d) => `${toText(d.이름) || "-"} · ${toText(d.차량번호) || ""}`, fixes: driverFixes },
  { key: "ledger", label: "차량관리대장", col: VL_COL, name: (d) => toText(d.차량번호) || d.id, fixes: ledgerFixes },
  { key: "clients", label: "거래처", col: "clients", name: (d) => toText(d.거래처명 || d.업체명) || d.id, fixes: clientFixes },
];

export default function DataCheckPanel({ company }) {
  const [res, setRes] = React.useState(null); // { rows:[{src,id,name,fixes}], counts }
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const scan = async () => {
    if (!company) return;
    setBusy("scan"); setMsg("");
    const rows = []; const counts = {}; const errs = [];
    for (const s of SRC) {
      try {
        const snap = await getDocs(query(collection(db, s.col), where("companyName", "==", company)));
        counts[s.key] = { total: snap.size, bad: 0 };
        snap.docs.forEach((x) => {
          const d = { id: x.id, ...x.data() };
          const f = s.fixes(d);
          if (Object.keys(f).length) { counts[s.key].bad++; rows.push({ src: s, id: x.id, name: s.name(d), fixes: f }); }
        });
      } catch (e) { counts[s.key] = { total: 0, bad: 0, err: e?.code || "error" }; errs.push(`${s.label}: ${e?.code || e?.message}`); }
    }
    setRes({ rows, counts, at: Date.now() });
    if (errs.length) setMsg(`일부를 읽지 못했어요 — ${errs.join(" · ")}`);
    setBusy("");
  };
  const fixAll = async () => {
    const rows = res?.rows || [];
    if (!rows.length) return;
    const fieldCnt = rows.reduce((n, r) => n + Object.keys(r.fixes).length, 0);
    if (!(await kpConfirm(`${rows.length}개 문서 · ${fieldCnt}칸을 고칠까요?\n\n값의 모양만 바꿉니다(숫자 → 글자, 날짜 형식 → "YYYY-MM-DD", 목록 정리). 내용은 그대로예요.`))) return;
    setBusy("fix"); setMsg("");
    let ok = 0, fail = 0;
    for (let i = 0; i < rows.length; i += 400) {
      const chunk = rows.slice(i, i + 400);
      const b = writeBatch(db);
      chunk.forEach((r) => b.update(doc(db, r.src.col, r.id), Object.fromEntries(Object.entries(r.fixes).map(([k, [, nv]]) => [k, nv]))));
      try { await b.commit(); ok += chunk.length; } catch (e) {
        // 한 묶음이 거절되면(권한 등) 하나씩 다시 — 되는 것만이라도 고친다
        for (const r of chunk) {
          const b1 = writeBatch(db);
          b1.update(doc(db, r.src.col, r.id), Object.fromEntries(Object.entries(r.fixes).map(([k, [, nv]]) => [k, nv])));
          try { await b1.commit(); ok++; } catch { fail++; }
        }
      }
    }
    setBusy("");
    setMsg(`고침 ${ok}개${fail ? ` · 실패 ${fail}개(권한이 없는 문서일 수 있어요)` : ""}`);
    await scan();
    setMsg((m) => m || `고침 ${ok}개${fail ? ` · 실패 ${fail}개` : ""}`);
  };
  const btn = "h-10 px-4 rounded-xl text-[13.5px] font-black disabled:opacity-50";
  return (
    <div className="space-y-4">
      <div className="rounded-[18px] bg-white border border-[#E3E8F0] px-5 py-4">
        <div className="text-[17px] font-black text-[#0F1A30]">데이터 점검</div>
        <div className="text-[13px] text-[#6B7890] mt-1 leading-relaxed">엑셀로 올렸거나 예전 버전에서 저장된 값 중 <b>모양이 이상한 값</b>(숫자로 저장된 전화번호·차량번호, 날짜 형식이 다른 출근일·만기일, 목록이 아닌 정비 이력)을 찾습니다. 이런 값은 지입차관리·차량관리 화면 오류의 원인이 됩니다. 내용은 바꾸지 않고 모양만 고칩니다.</div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button type="button" onClick={scan} disabled={!!busy || !company} className={`${btn} bg-[#1B2B4B] text-white`}>{busy === "scan" ? "점검 중…" : res ? "다시 점검" : "점검 시작"}</button>
          {res && res.rows.length > 0 && <button type="button" onClick={fixAll} disabled={!!busy} className={`${btn} bg-[#2F6BFF] text-white`}>{busy === "fix" ? "고치는 중…" : `한 번에 고치기 · ${res.rows.length}개`}</button>}
        </div>
        {msg && <div className="mt-2 text-[12.5px] font-bold text-[#9A5B00]">{msg}</div>}
      </div>
      {res && (
        <div className="grid grid-cols-3 gap-3">
          {SRC.map((s) => { const c = res.counts[s.key] || {}; return (
            <div key={s.key} className="rounded-[16px] bg-white border border-[#E3E8F0] px-4 py-3">
              <div className="text-[12.5px] font-bold text-[#7A879C]">{s.label} · 전체 {c.total || 0}</div>
              <div className={`text-[22px] font-black tabular-nums ${c.bad ? "text-[#B4342A]" : "text-[#1F7A4D]"}`}>{c.err ? "읽기 실패" : c.bad ? `${c.bad}개 이상` : "이상 없음"}</div>
            </div>); })}
        </div>
      )}
      {res && res.rows.length > 0 && (
        <div className="rounded-[18px] bg-white border border-[#E3E8F0] overflow-x-auto">
          <table className="w-full text-[13px]" style={{ minWidth: 760 }}>
            <thead><tr className="bg-[#1B2B4B] text-white">{["구분", "이름 · 차량", "칸", "지금 값", "고친 값"].map((h) => <th key={h} className="px-3 py-2.5 text-center font-extrabold whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>{res.rows.slice(0, 300).flatMap((r) => Object.entries(r.fixes).map(([k, [ov, nv]], i) => (
              <tr key={`${r.src.key}${r.id}${k}`} className="border-t border-[#EEF1F6]">
                <td className="px-3 py-1.5 text-center whitespace-nowrap">{i === 0 ? r.src.label : ""}</td>
                <td className="px-3 py-1.5 font-bold whitespace-nowrap">{i === 0 ? r.name : ""}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{k}</td>
                <td className="px-3 py-1.5 text-[#B4342A]">{show(ov)}</td>
                <td className="px-3 py-1.5 text-[#1F7A4D]">{show(nv)}</td>
              </tr>)))}</tbody>
          </table>
          {res.rows.length > 300 && <div className="px-4 py-2 text-[12px] text-[#7A879C]">앞의 300개만 보여 줍니다. [한 번에 고치기]는 {res.rows.length}개 모두 고칩니다.</div>}
        </div>
      )}
      {res && res.rows.length === 0 && !msg && <div className="rounded-[18px] bg-white border border-[#E3E8F0] py-12 text-center text-[#1F7A4D] font-bold">모양이 이상한 값이 없습니다.</div>}
    </div>
  );
}
