// ======================= cafe-site/src/BizNumberInput.jsx =======================
// 사업자등록번호 입력 — 하이픈 자동입력(000-00-00000) + 체크섬 검증 + "조회" 버튼.
// 조회는 배차마당에 이미 등록된 같은 사업자번호 기록(bizDirectory 컬렉션, 신규가입 시
// 자동으로 쌓인다)에서 회사명을 찾아 보여주고, 클릭하면 회사명 입력칸에 자동으로
// 채워준다. 국세청 실시간 진위확인 API는 별도 서비스키 발급이 필요해 이 사이트에는
// 아직 연동하지 않았고, 대신 표준 체크섬 알고리즘으로 "형식이 유효한 번호인지"는
// 즉시 검증해준다.
import React, { useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export function formatBizNumber(v) {
  const d = (v || "").replace(/[^\d]/g, "").slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

// 사업자등록번호 표준 체크섬(공개 알고리즘) — 형식상 유효한 번호인지만 확인한다.
export function isValidBizNumber(v) {
  const d = (v || "").replace(/[^\d]/g, "");
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * w[i];
  sum += Math.floor((Number(d[8]) * 5) / 10);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(d[9]);
}

export const BIZ_DIRECTORY_COL = "bizDirectory";

export default function BizNumberInput({ value, onChange, onPick, label = "사업자등록번호" }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null); // { found: bool, companyName?, checksumOk }

  const digits = (value || "").replace(/[^\d]/g, "");
  const checksumOk = digits.length === 10 ? isValidBizNumber(value) : null;

  const lookup = async () => {
    if (digits.length !== 10) { setResult({ error: "10자리 숫자를 입력해주세요." }); return; }
    setChecking(true);
    setResult(null);
    try {
      const snap = await getDoc(doc(db, BIZ_DIRECTORY_COL, digits));
      if (snap.exists()) {
        setResult({ found: true, companyName: snap.data().companyName, checksumOk: isValidBizNumber(value) });
      } else {
        setResult({ found: false, checksumOk: isValidBizNumber(value) });
      }
    } catch {
      setResult({ found: false, checksumOk: isValidBizNumber(value), error: "조회 중 문제가 발생했습니다. 형식 검증 결과만 표시합니다." });
    } finally {
      setChecking(false);
    }
  };

  const field = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] text-gray-900 outline-none focus:border-[#1B2B4B] transition";

  return (
    <div>
      <label className="text-[12px] font-bold text-gray-500 mb-1 block">{label}</label>
      <div className="flex gap-2">
        <input
          className={field}
          value={value}
          placeholder="000-00-00000"
          inputMode="numeric"
          onChange={e => { onChange(formatBizNumber(e.target.value)); setResult(null); }}
        />
        <button type="button" onClick={lookup} disabled={checking || digits.length !== 10}
          className="shrink-0 px-4 py-2.5 rounded-lg border border-[#1B2B4B] text-[#1B2B4B] text-[12.5px] font-bold hover:bg-[#1B2B4B]/5 transition disabled:opacity-40 disabled:cursor-not-allowed">
          {checking ? "조회 중..." : "조회"}
        </button>
      </div>
      {checksumOk === false && digits.length === 10 && (
        <div className="text-[11.5px] text-red-500 font-semibold mt-1">사업자등록번호 형식이 올바르지 않습니다.</div>
      )}
      {result && (
        <div className="mt-1.5 text-[12px]">
          {result.error && <div className="text-amber-600 font-semibold">{result.error}</div>}
          {result.found ? (
            <button type="button" onClick={() => onPick?.(result.companyName)}
              className="w-full text-left px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold hover:bg-emerald-100 transition">
              ✓ 등록된 사업자입니다: <b>{result.companyName}</b> — 클릭하면 회사명이 자동입력됩니다
            </button>
          ) : !result.error ? (
            <div className="text-gray-400">배차마당에 처음 등록되는 사업자번호입니다{result.checksumOk ? " (형식 검증 통과)" : ""}.</div>
          ) : null}
        </div>
      )}
    </div>
  );
}
