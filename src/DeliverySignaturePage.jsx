import React, { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { db } from "./firebase";
import {
  collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp, orderBy, query
} from "firebase/firestore";

// ── 주소 정규화 ───────────────────────────────────────────────────────────
function normalizeAddr(addr = "") {
  return addr
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "")
    .replace(/광역시|특별시|특별자치시|특별자치도$/g, "")
    .toLowerCase();
}

// 주소 유사도 점수 (0~3): 동일 > 부분포함 > 동일치 > 구일치
function addrScore(a, b) {
  const na = normalizeAddr(a);
  const nb = normalizeAddr(b);
  if (!na || !nb) return 0;
  if (na === nb) return 3;
  // 긴 공통 prefix (≥10자)
  if (na.length >= 10 && nb.length >= 10) {
    const shorter = na.length < nb.length ? na : nb;
    const longer  = na.length < nb.length ? nb : na;
    if (longer.includes(shorter.slice(0, 12))) return 2;
    if (longer.includes(shorter.slice(0, 8)))  return 2;
  }
  // 동(洞) 일치
  const dongA = a.match(/([가-힣]+동)/g) || [];
  const dongB = b.match(/([가-힣]+동)/g) || [];
  if (dongA.length && dongB.length && dongA.some(d => dongB.includes(d))) return 2;
  // 구(區) 일치
  const guA = a.match(/([가-힣]+구)/)?.[1] || "";
  const guB = b.match(/([가-힣]+구)/)?.[1] || "";
  if (guA && guA === guB) return 1;
  return 0;
}

// 서명 컬럼에서 기사 정보 추출
function parseSignature(sig = "") {
  const str = String(sig).trim();
  if (!str) return { plate: "", name: "", phone: "" };
  const lines = str.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const plateRe = /(\d{2,3}[가-힣]\s*\d{4}|\d[가-힣]\s*\d{4})/;
  const phoneRe = /(01[0-9]-?\d{3,4}-?\d{4})/;
  let plate = "", name = "", phone = "";
  for (const line of lines) {
    const plateM = line.match(plateRe);
    const phoneM = line.match(phoneRe);
    if (plateM && !plate) plate = plateM[1].replace(/\s/, "");
    if (phoneM && !phone) phone = phoneM[1];
  }
  for (const line of lines) {
    if (plateRe.test(line)) continue;
    if (phoneRe.test(line)) {
      const candidate = line.replace(phoneRe, "").trim();
      if (!name && candidate.length >= 2 && candidate.length <= 6) name = candidate;
      continue;
    }
    if (!name && line.length >= 2 && line.length <= 6) { name = line; break; }
  }
  if (!plate && lines.length > 0) plate = lines[0];
  return { plate, name, phone };
}

// ── Excel 헤더에서 컬럼 인덱스 탐색 ─────────────────────────────────────
function findColIdx(headerRow, ...keywords) {
  return headerRow.findIndex(c =>
    keywords.some(kw => String(c).includes(kw))
  );
}

// 과거 서명 파일에서 학습 데이터 추출
function parseExcelForHistory(buffer) {
  const wb = XLSX.read(buffer, { type: "array" });
  const records = [];

  wb.SheetNames.forEach(sheetName => {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (rows.length < 3) return;

    const title = String(rows[0]?.[0] || "");
    const dateM = title.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    const fileDate = dateM ? `${dateM[1]}-${dateM[2].padStart(2,"0")}-${dateM[3].padStart(2,"0")}` : "";

    // 헤더 행 탐색: "상호" 또는 "업체" 포함
    const headerIdx = rows.findIndex(r => r.some(c => String(c).includes("상호") || String(c).includes("업체")));
    if (headerIdx < 0) return;

    const headerRow = rows[headerIdx];
    const nameColIdx = findColIdx(headerRow, "상호", "업체") ;
    const addrColIdx = findColIdx(headerRow, "주소", "배송지", "상차지");
    const sigColIdx  = findColIdx(headerRow, "서명", "확인", "싸인");

    const effectiveNameCol = nameColIdx >= 0 ? nameColIdx : 1;
    const effectiveAddrCol = addrColIdx >= 0 ? addrColIdx : 5;
    const effectiveSigCol  = sigColIdx  >= 0 ? sigColIdx  : 7;

    const dataRows = rows.slice(headerIdx + 1).filter(r => r[0] && String(r[0]).match(/^\d+$/));
    if (dataRows.length === 0) return;

    // 서명 컬럼을 모든 행에서 탐색 (첫 행만 아님)
    let driver = null;
    for (const row of dataRows) {
      for (let colOff = 0; colOff <= 2; colOff++) {
        const cell = row[effectiveSigCol + colOff];
        if (cell && String(cell).trim()) {
          const parsed = parseSignature(String(cell));
          if (parsed.name) { driver = parsed; break; }
        }
      }
      if (driver) break;
    }
    if (!driver?.name) return;

    const addresses = dataRows.map(r => ({
      상호: String(r[effectiveNameCol] || ""),
      주소: String(r[effectiveAddrCol] || ""),
    })).filter(a => a.주소);

    records.push({ sheetNum: sheetName, fileDate, driver, addresses });
  });

  return records;
}

// 새(빈) 파일에서 시트별 주소 목록 추출
function parseNewExcel(buffer) {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheets = [];

  wb.SheetNames.forEach(sheetName => {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (rows.length < 3) return;

    const title = String(rows[0]?.[0] || "");
    const headerIdx = rows.findIndex(r => r.some(c => String(c).includes("상호") || String(c).includes("업체")));
    if (headerIdx < 0) return;

    const headerRow = rows[headerIdx];
    const nameColIdx = findColIdx(headerRow, "상호", "업체");
    const addrColIdx = findColIdx(headerRow, "주소", "배송지", "상차지");

    const effectiveNameCol = nameColIdx >= 0 ? nameColIdx : 1;
    const effectiveAddrCol = addrColIdx >= 0 ? addrColIdx : 5;

    const dataRows = rows.slice(headerIdx + 1).filter(r => r[0] && String(r[0]).match(/^\d+$/));

    sheets.push({
      sheetNum: sheetName,
      title,
      rawRows: rows,
      headerIdx,
      headerRow,
      addresses: dataRows.map(r => ({
        상호: String(r[effectiveNameCol] || ""),
        주소: String(r[effectiveAddrCol] || ""),
      })),
    });
  });

  return { wb, sheets };
}

// 시트별 기사 매칭 점수 계산
function computeMatchScores(sheets, allRecords) {
  // 기사별로 historical records 묶기
  const driverMap = new Map();
  allRecords.forEach(rec => {
    const k = rec.driver?.name;
    if (!k) return;
    if (!driverMap.has(k)) driverMap.set(k, { ...rec.driver, records: [] });
    driverMap.get(k).records.push(rec);
  });
  const drivers = Array.from(driverMap.values());

  return sheets.map(sheet => {
    const scores = drivers.map(d => {
      let totalScore = 0;
      let matchedAddresses = 0;
      const matchDetails = [];

      sheet.addresses.forEach(newAddr => {
        let bestScore = 0;
        let bestHistAddr = null;

        // 이 기사의 모든 과거 이력을 순회
        d.records.forEach(rec => {
          rec.addresses.forEach(histAddr => {
            const s = addrScore(newAddr.주소, histAddr.주소);
            if (s > bestScore) {
              bestScore = s;
              bestHistAddr = { ...histAddr, date: rec.fileDate, sheetNum: rec.sheetNum };
            }
          });
        });

        if (bestScore > 0) {
          totalScore += bestScore;
          matchedAddresses++;
          matchDetails.push({
            newAddr,
            score: bestScore,
            histAddr: bestHistAddr,
          });
        } else {
          matchDetails.push({ newAddr, score: 0, histAddr: null });
        }
      });

      const confidence = sheet.addresses.length > 0
        ? Math.round((matchedAddresses / sheet.addresses.length) * 100)
        : 0;

      return { driver: d, totalScore, matchedAddresses, confidence, matchDetails };
    });

    // 총점 → 매칭 건수 → 신뢰도 순으로 정렬
    scores.sort((a, b) =>
      b.totalScore - a.totalScore ||
      b.matchedAddresses - a.matchedAddresses ||
      b.confidence - a.confidence
    );

    return {
      sheetNum: sheet.sheetNum,
      title: sheet.title,
      addresses: sheet.addresses,
      scores,
      assigned: scores[0] || null,
    };
  });
}

// 서명 입력된 Excel 생성 — 원본 포맷(병합/스타일/열너비) 유지
function buildOutputExcel(origWb, sheetAssignments) {
  // JSON 깊은 복사로 원본 워크북 구조 전체 보존
  const newWb = {
    SheetNames: [...origWb.SheetNames],
    Sheets: {},
    Props: origWb.Props || {},
  };

  origWb.SheetNames.forEach(sheetName => {
    // 시트 전체 깊은 복사 (셀 데이터·스타일·병합·열너비 모두 보존)
    const origWs = origWb.Sheets[sheetName];
    const ws = JSON.parse(JSON.stringify(origWs));
    newWb.Sheets[sheetName] = ws;

    const assignment = sheetAssignments.find(a => a.sheetNum === sheetName);
    if (!assignment?.assigned?.driver?.name) return;

    const d = assignment.assigned.driver;
    const sigText = `${d.plate}\n${d.name} ${d.phone}`;

    const range = XLSX.utils.decode_range(ws["!ref"] || "A1:Z200");

    // 헤더 행 탐색 (상호 포함 셀 찾기)
    let headerRow = -1;
    let sigCol = 7;

    outer: for (let r = range.s.r; r <= Math.min(range.e.r, 15); r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!cell) continue;
        const v = String(cell.v || "");
        if (v.includes("상호") || v.includes("업체")) { headerRow = r; break outer; }
      }
    }

    // 서명 컬럼 탐색
    if (headerRow >= 0) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
        if (!cell) continue;
        const v = String(cell.v || "");
        if (v.includes("서명") || v.includes("확인") || v.includes("싸인")) { sigCol = c; break; }
      }
    }

    // 데이터 행에 서명 기입 (원본 셀 객체의 값만 교체)
    for (let r = headerRow + 1; r <= range.e.r; r++) {
      const firstCellAddr = XLSX.utils.encode_cell({ r, c: range.s.c });
      const firstCell = ws[firstCellAddr];
      if (firstCell && String(firstCell.v || "").match(/^\d+$/)) {
        const sigAddr = XLSX.utils.encode_cell({ r, c: sigCol });
        const existing = ws[sigAddr] || {};
        ws[sigAddr] = { ...existing, t: "s", v: sigText, w: sigText };
      }
    }
  });

  return newWb;
}

// ── UI 보조 컴포넌트 ──────────────────────────────────────────────────────

function ConfidenceBadge({ pct }) {
  const cls = pct >= 80
    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : pct >= 50 ? "bg-blue-100 text-blue-700 border-blue-200"
    : pct >= 20 ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-gray-100 text-gray-500 border-gray-200";
  const label = pct >= 80 ? "높음" : pct >= 50 ? "보통" : pct >= 20 ? "낮음" : "신규";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${cls}`}>
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "currentColor", opacity: 0.7 }} />
      {pct}% {label}
    </span>
  );
}

function ScoreBadge({ score }) {
  if (score >= 3) return <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">완전</span>;
  if (score >= 2) return <span className="text-[9px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">부분</span>;
  if (score === 1) return <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">구역</span>;
  return <span className="text-[9px] text-gray-300">-</span>;
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────────
export default function DeliverySignaturePage() {
  const [tab, setTab] = useState("learn");
  const [history, setHistory] = useState([]);
  const [histLoading, setHistLoading] = useState(true);

  const [learnUploading, setLearnUploading] = useState(false);
  const [learnDone, setLearnDone] = useState(null);
  const learnInputRef = useRef();

  const [newFileName, setNewFileName] = useState("");
  const [origWb, setOrigWb] = useState(null);
  const [sheetResults, setSheetResults] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [previewSheet, setPreviewSheet] = useState(null);
  const [processing, setProcessing] = useState(false);
  const newInputRef = useRef();

  useEffect(() => { loadHistory(); }, []);

  async function loadHistory() {
    setHistLoading(true);
    try {
      const q = query(collection(db, "deliverySignatureHistory"), orderBy("uploadedAt", "desc"));
      const snap = await getDocs(q);
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setHistLoading(false);
  }

  async function handleLearnUpload(files) {
    if (!files?.length) return;
    setLearnUploading(true);
    setLearnDone(null);
    let totalSheets = 0;
    try {
      for (const file of Array.from(files)) {
        const buf = await file.arrayBuffer();
        const records = parseExcelForHistory(new Uint8Array(buf));
        if (records.length === 0) continue;
        await addDoc(collection(db, "deliverySignatureHistory"), {
          filename: file.name,
          uploadedAt: serverTimestamp(),
          records,
        });
        totalSheets += records.length;
      }
      setLearnDone(`${files.length}개 파일, ${totalSheets}개 시트 학습 완료`);
      await loadHistory();
    } catch (e) { alert("업로드 오류: " + e.message); }
    setLearnUploading(false);
  }

  async function handleDeleteHistory(id) {
    if (!confirm("이 데이터를 삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, "deliverySignatureHistory", id));
    await loadHistory();
  }

  async function handleNewFile(file) {
    if (!file) return;
    setProcessing(true);
    setSheetResults(null);
    setOverrides({});
    setPreviewSheet(null);
    setNewFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const ua = new Uint8Array(buf);
      const { wb, sheets } = parseNewExcel(ua);
      setOrigWb(wb);
      const allRecords = history.flatMap(h => h.records || []);
      setSheetResults(computeMatchScores(sheets, allRecords));
    } catch (e) { alert("파일 처리 오류: " + e.message); }
    setProcessing(false);
  }

  const allDrivers = React.useMemo(() => {
    const map = new Map();
    history.forEach(h => {
      (h.records || []).forEach(r => {
        if (r.driver?.name && !map.has(r.driver.name)) map.set(r.driver.name, r.driver);
      });
    });
    return Array.from(map.values());
  }, [history]);

  function getAssignedDriver(sheetNum) {
    if (overrides[sheetNum]) return allDrivers.find(d => d.name === overrides[sheetNum]) || null;
    const r = sheetResults?.find(s => s.sheetNum === sheetNum);
    return r?.assigned?.driver || null;
  }

  function handleDownload() {
    if (!origWb || !sheetResults) return;
    const assignments = sheetResults.map(s => ({
      sheetNum: s.sheetNum,
      assigned: { driver: getAssignedDriver(s.sheetNum) },
    }));
    const newWb = buildOutputExcel(origWb, assignments);
    XLSX.writeFile(newWb, `${newFileName.replace(/\.xlsx$/i, "")}_서명완료.xlsx`);
  }

  const driverStats = React.useMemo(() => {
    const stats = new Map();
    history.forEach(h => {
      (h.records || []).forEach(r => {
        const k = r.driver?.name;
        if (!k) return;
        if (!stats.has(k)) stats.set(k, { driver: r.driver, totalAddresses: 0, deliveries: 0, lastDate: "" });
        const s = stats.get(k);
        s.totalAddresses += (r.addresses || []).length;
        s.deliveries += 1;
        if (!s.lastDate || r.fileDate > s.lastDate) s.lastDate = r.fileDate;
      });
    });
    return Array.from(stats.values()).sort((a, b) => b.deliveries - a.deliveries);
  }, [history]);

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      <div className="mb-5">
        <h1 className="text-[18px] font-extrabold text-[#1B2B4B] tracking-tight">서명 자동 입력 관리</h1>
        <p className="text-[12px] text-gray-400 mt-0.5">기사별 배송 이력 학습 후 서명 자동 입력</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-0 mb-5 border border-gray-200 rounded-xl overflow-hidden bg-gray-50 p-1">
        {[{ id: "learn", label: "데이터 학습" }, { id: "fill", label: "서명 자동입력" }, { id: "stats", label: "기사 통계" }].map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-2 text-[13px] font-semibold rounded-lg transition ${tab === id ? "bg-[#1B2B4B] text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ─── 데이터 학습 ─── */}
      {tab === "learn" && (
        <div className="space-y-4">
          <div
            className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center cursor-pointer hover:border-[#1B2B4B]/40 hover:bg-[#1B2B4B]/[0.02] transition-all"
            onClick={() => learnInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleLearnUpload(e.dataTransfer.files); }}
          >
            <input ref={learnInputRef} type="file" accept=".xlsx,.xls" multiple className="hidden"
              onChange={e => handleLearnUpload(e.target.files)} />
            <div className="w-12 h-12 bg-[#1B2B4B]/10 rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1B2B4B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div className="text-[14px] font-bold text-[#1B2B4B] mb-1">
              {learnUploading ? "처리 중..." : "과거 서명 완료 파일 업로드"}
            </div>
            <div className="text-[12px] text-gray-400">클릭하거나 드래그 (여러 파일 동시 가능)</div>
            {learnDone && <div className="mt-2 text-[12px] font-semibold text-emerald-600">{learnDone}</div>}
          </div>

          {histLoading ? (
            <div className="text-center py-8 text-gray-400 text-sm">불러오는 중...</div>
          ) : history.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center text-gray-400 text-sm">
              학습된 데이터가 없습니다. 위에서 파일을 업로드하세요.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-[14px] font-bold text-[#1B2B4B]">학습된 파일 ({history.length}개)</span>
                <span className="text-[12px] text-gray-400">
                  총 {history.reduce((s, h) => s + (h.records?.length || 0), 0)}개 시트
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {history.map(h => (
                  <div key={h.id} className="px-5 py-3.5 flex items-start justify-between gap-3 hover:bg-gray-50/50 transition">
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-semibold text-gray-800 truncate">{h.filename}</div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {(h.records || []).map((r, i) => (
                          <span key={i} className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium ${
                            r.addresses?.length > 0
                              ? "bg-[#1B2B4B]/5 text-[#1B2B4B] border-[#1B2B4B]/10"
                              : "bg-amber-50 text-amber-600 border-amber-200"
                          }`}>
                            {r.sheetNum} · {r.driver?.name || "미확인"} · {r.addresses?.length}곳
                            {r.addresses?.length === 0 && " (주소없음)"}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => handleDeleteHistory(h.id)}
                      className="shrink-0 px-2.5 py-1 text-[12px] text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition">
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── 서명 자동입력 ─── */}
      {tab === "fill" && (
        <div className="space-y-4">
          {history.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[13px] text-amber-700 font-medium">
              학습 데이터가 없습니다. 먼저 "데이터 학습" 탭에서 과거 파일을 업로드하세요.
            </div>
          )}
          {history.length > 0 && (() => {
            const zeroAddrDrivers = [];
            const dMap = new Map();
            history.forEach(h => (h.records || []).forEach(r => {
              const k = r.driver?.name;
              if (!k) return;
              if (!dMap.has(k)) dMap.set(k, 0);
              dMap.set(k, dMap.get(k) + (r.addresses?.length || 0));
            }));
            dMap.forEach((cnt, name) => { if (cnt === 0) zeroAddrDrivers.push(name); });
            if (zeroAddrDrivers.length === 0) return null;
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[12px] text-amber-700">
                <span className="font-bold">주의:</span> 다음 기사의 학습 데이터에 주소가 0개입니다 → <span className="font-bold">{zeroAddrDrivers.join(", ")}</span><br/>
                <span className="text-amber-600">데이터 학습 탭에서 해당 파일을 삭제하고 다시 업로드하면 매칭이 개선됩니다.</span>
              </div>
            );
          })()}

          <div
            className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center cursor-pointer hover:border-[#1B2B4B]/40 hover:bg-[#1B2B4B]/[0.02] transition-all"
            onClick={() => newInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleNewFile(e.dataTransfer.files[0]); }}
          >
            <input ref={newInputRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => handleNewFile(e.target.files[0])} />
            <div className="text-[13px] font-bold text-[#1B2B4B] mb-1">
              {processing ? "분석 중..." : newFileName ? `선택됨: ${newFileName}` : "서명 비어있는 새 파일 업로드"}
            </div>
            <div className="text-[12px] text-gray-400">서명 칸이 공란인 팥주문 신청서를 업로드하세요</div>
          </div>

          {sheetResults && (
            <>
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-[#1B2B4B] px-5 py-3 flex items-center justify-between">
                  <span className="text-white font-bold text-[14px]">시트별 기사 배정 결과</span>
                  <span className="text-white/60 text-[12px]">{newFileName}</span>
                </div>

                <div className="divide-y divide-gray-100">
                  {sheetResults.map(sheet => {
                    const currentDriver = getAssignedDriver(sheet.sheetNum);
                    const currentScore = sheet.scores.find(sc => sc.driver.name === currentDriver?.name);
                    const topScore = sheet.scores[0];

                    return (
                      <div key={sheet.sheetNum}>
                        {/* 시트 헤더 */}
                        <div className="px-5 py-3 bg-gray-50/60 flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 bg-[#1B2B4B] text-white rounded-lg text-[13px] font-bold flex items-center justify-center shrink-0">
                              {sheet.sheetNum}
                            </span>
                            <div>
                              <div className="text-[13px] font-semibold text-gray-700">
                                {sheet.title.replace(/\(.*?\)/g, "").trim()}
                              </div>
                              <div className="text-[12px] text-gray-400">{sheet.addresses.length}곳 배송</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {topScore && <ConfidenceBadge pct={topScore.confidence} />}
                            <select
                              value={currentDriver?.name || ""}
                              onChange={e => setOverrides(p => ({ ...p, [sheet.sheetNum]: e.target.value }))}
                              className="text-[12px] border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#1B2B4B]/30"
                            >
                              <option value="">기사 선택</option>
                              {allDrivers.map(d => (
                                <option key={d.name} value={d.name}>{d.name} ({d.plate})</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* 후보 기사 버튼 */}
                        <div className="px-5 py-2 flex flex-wrap gap-2">
                          {sheet.scores.slice(0, 4).map(sc => (
                            <button
                              key={sc.driver.name}
                              onClick={() => setOverrides(p => ({ ...p, [sheet.sheetNum]: sc.driver.name }))}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12px] font-semibold transition ${
                                currentDriver?.name === sc.driver.name
                                  ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                              }`}
                            >
                              <span>{sc.driver.name}</span>
                              <span className={`text-[11px] ${currentDriver?.name === sc.driver.name ? "text-white/70" : "text-gray-400"}`}>
                                {sc.matchedAddresses}/{sheet.addresses.length}건
                              </span>
                            </button>
                          ))}
                          {sheet.scores.length === 0 && (
                            <span className="text-[12px] text-amber-600">학습 데이터 없음 - 수동 지정 필요</span>
                          )}
                        </div>

                        {/* 주소 미리보기 (VS 비교) */}
                        <div className="px-5 pb-3">
                          <button
                            onClick={() => setPreviewSheet(previewSheet === sheet.sheetNum ? null : sheet.sheetNum)}
                            className="text-[11px] text-[#1B2B4B] font-semibold hover:underline"
                          >
                            {previewSheet === sheet.sheetNum
                              ? "주소 목록 닫기"
                              : `주소 목록 열기 (${sheet.addresses.length}곳)`}
                          </button>

                          {previewSheet === sheet.sheetNum && (() => {
                            const activeScore = currentScore || topScore;
                            return (
                              <div className="mt-2 rounded-xl border border-gray-200 overflow-hidden">
                                {/* VS 헤더 */}
                                <div className="grid grid-cols-2 divide-x divide-gray-200">
                                  <div className="bg-[#1B2B4B]/5 px-4 py-2.5 text-[13px] font-bold text-[#1B2B4B]">
                                    과거 이력 ({currentDriver?.name || "미지정"})
                                  </div>
                                  <div className="bg-blue-50 px-4 py-2.5 text-[13px] font-bold text-blue-700">
                                    새 파일 ({sheet.sheetNum}시트)
                                  </div>
                                </div>

                                {/* 주소 행 */}
                                <div className="divide-y divide-gray-100">
                                  {sheet.addresses.map((addr, i) => {
                                    const detail = activeScore?.matchDetails?.[i];
                                    const score = detail?.score || 0;
                                    const histAddr = detail?.histAddr;
                                    const rowBg = score >= 3 ? "bg-emerald-50/60"
                                      : score >= 2 ? "bg-blue-50/40"
                                      : score === 1 ? "bg-amber-50/40"
                                      : "";
                                    return (
                                      <div key={i} className={`grid grid-cols-2 divide-x divide-gray-100 ${rowBg}`}>
                                        {/* 과거 이력 */}
                                        <div className="px-4 py-3">
                                          {histAddr ? (
                                            <>
                                              <div className="flex items-start justify-between gap-2">
                                                <span className="text-[13px] font-semibold text-gray-800 leading-tight">{histAddr.상호}</span>
                                                <ScoreBadge score={score} />
                                              </div>
                                              <div className="text-[12px] text-gray-500 mt-1 leading-snug">{histAddr.주소}</div>
                                              {histAddr.date && (
                                                <div className="text-[11px] text-gray-400 mt-0.5">{histAddr.date}</div>
                                              )}
                                            </>
                                          ) : (
                                            <div className="text-[12px] text-gray-300 italic py-1">이력 없음</div>
                                          )}
                                        </div>
                                        {/* 새 파일 */}
                                        <div className="px-4 py-3">
                                          <div className="text-[13px] font-semibold text-gray-800 leading-tight">{addr.상호}</div>
                                          <div className="text-[12px] text-gray-500 mt-1 leading-snug">{addr.주소}</div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 최종 요약 + 다운로드 */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <div className="text-[13px] font-bold text-[#1B2B4B] mb-3">최종 배정 요약</div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {sheetResults.map(sheet => {
                    const d = getAssignedDriver(sheet.sheetNum);
                    const isManual = !!overrides[sheet.sheetNum];
                    return (
                      <div key={sheet.sheetNum} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                        <span className="w-6 h-6 bg-[#1B2B4B] text-white rounded-md text-[11px] font-bold flex items-center justify-center shrink-0">
                          {sheet.sheetNum}
                        </span>
                        <div className="flex-1 min-w-0">
                          {d ? (
                            <>
                              <div className="text-[12px] font-bold text-gray-800">{d.name}</div>
                              <div className="text-[10px] text-gray-400">{d.plate} · {d.phone}</div>
                            </>
                          ) : (
                            <div className="text-[12px] text-amber-600 font-semibold">미지정</div>
                          )}
                        </div>
                        {isManual && (
                          <span className="text-[9px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded font-bold border border-amber-200">수동</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={handleDownload}
                  disabled={!sheetResults.every(s => getAssignedDriver(s.sheetNum))}
                  className="w-full py-3 bg-[#1B2B4B] text-white text-[14px] font-bold rounded-xl hover:bg-[#243a60] transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  서명 입력된 Excel 다운로드
                </button>
                {!sheetResults.every(s => getAssignedDriver(s.sheetNum)) && (
                  <p className="text-[11px] text-amber-600 text-center mt-2">미지정 시트가 있습니다. 수동으로 기사를 선택해주세요.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── 기사 통계 ─── */}
      {tab === "stats" && (
        <div className="space-y-4">
          {driverStats.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center text-gray-400 text-sm">
              학습 데이터가 없습니다.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                {driverStats.map(s => (
                  <div key={s.driver.name} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="bg-[#1B2B4B] px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-white font-bold text-[14px]">{s.driver.name}</div>
                        <div className="text-white/60 text-[11px]">{s.driver.plate} · {s.driver.phone}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-white text-[22px] font-black leading-none">{s.deliveries}</div>
                        <div className="text-white/50 text-[10px]">배송 횟수</div>
                      </div>
                    </div>
                    <div className="px-4 py-3 grid grid-cols-2 gap-3">
                      <div className="text-center">
                        <div className="text-[20px] font-extrabold text-[#1B2B4B]">{s.totalAddresses}</div>
                        <div className="text-[11px] text-gray-400">총 방문 주소</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[16px] font-extrabold text-[#1B2B4B]">{s.lastDate || "-"}</div>
                        <div className="text-[11px] text-gray-400">최근 배송일</div>
                      </div>
                    </div>
                    <div className="px-4 pb-3">
                      <div className="text-[11px] text-gray-400 mb-1.5">시트별 방문 이력</div>
                      <div className="flex gap-1.5 flex-wrap">
                        {(() => {
                          const sheetCounts = {};
                          history.forEach(h => {
                            (h.records || []).forEach(r => {
                              if (r.driver?.name === s.driver.name) {
                                sheetCounts[r.sheetNum] = (sheetCounts[r.sheetNum] || 0) + 1;
                              }
                            });
                          });
                          return Object.entries(sheetCounts).sort((a,b) => b[1]-a[1]).map(([sn, cnt]) => (
                            <span key={sn} className="text-[10px] px-2 py-0.5 bg-[#1B2B4B]/5 text-[#1B2B4B] rounded-full border border-[#1B2B4B]/10 font-semibold">
                              {sn} {cnt}회
                            </span>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                <div className="text-[13px] font-bold text-[#1B2B4B] mb-3">전체 학습 현황</div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "학습 파일 수", value: history.length },
                    { label: "총 시트 수", value: history.reduce((s,h) => s + (h.records?.length||0), 0) },
                    { label: "총 주소 수", value: history.reduce((s,h) => s + (h.records||[]).reduce((ss,r) => ss + (r.addresses?.length||0), 0), 0) },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center bg-gray-50 rounded-xl py-3">
                      <div className="text-[22px] font-extrabold text-[#1B2B4B]">{value}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
