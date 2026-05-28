import React, { useState, useRef, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { db } from "./firebase";
import {
  collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp, orderBy, query
} from "firebase/firestore";

// ── 주소 정규화: 핵심 키워드만 추출 ──────────────────────────────────────
function normalizeAddr(addr = "") {
  return addr
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "")
    .replace(/광역시|특별시|특별자치시|도$/g, "")
    .toLowerCase();
}

// 주소 유사도 점수 (0~3)
function addrScore(a, b) {
  const na = normalizeAddr(a);
  const nb = normalizeAddr(b);
  if (na === nb) return 3;
  if (na.length > 6 && nb.length > 6 && (na.includes(nb.slice(0, 10)) || nb.includes(na.slice(0, 10)))) return 2;
  // 시장명/동명 공통
  const guA = a.match(/([가-힣]+구)/)?.[1] || "";
  const guB = b.match(/([가-힣]+구)/)?.[1] || "";
  if (guA && guA === guB) return 1;
  return 0;
}

// 서명 컬럼에서 기사 정보 추출
function parseSignature(sig = "") {
  const lines = String(sig).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const plate = lines[0] || "";
  const rest = lines[1] || "";
  const phoneM = rest.match(/(01[0-9]-?\d{3,4}-?\d{4})/);
  const phone = phoneM ? phoneM[1] : "";
  const name = rest.replace(phone, "").trim();
  return { plate, name, phone };
}

// Excel 파일에서 학습 데이터 추출
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

    // 헤더 row 찾기
    const headerIdx = rows.findIndex(r => String(r[1]||"").includes("상호"));
    if (headerIdx < 0) return;

    const dataRows = rows.slice(headerIdx + 1).filter(r => r[0] && String(r[0]).match(/^\d+$/));

    if (dataRows.length === 0) return;

    // 서명 컬럼에서 기사 정보
    const firstSig = dataRows[0]?.[7];
    if (!firstSig) return;
    const driver = parseSignature(firstSig);
    if (!driver.name) return;

    const addresses = dataRows.map(r => ({
      상호: String(r[1] || ""),
      주소: String(r[5] || ""),
    })).filter(a => a.주소);

    records.push({ sheetNum: sheetName, fileDate, driver, addresses });
  });

  return records;
}

// 빈 Excel에서 시트별 주소 목록 추출
function parseNewExcel(buffer) {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheets = [];

  wb.SheetNames.forEach(sheetName => {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (rows.length < 3) return;

    const title = String(rows[0]?.[0] || "");
    const headerIdx = rows.findIndex(r => String(r[1]||"").includes("상호"));
    if (headerIdx < 0) return;

    const dataRows = rows.slice(headerIdx + 1).filter(r => r[0] && String(r[0]).match(/^\d+$/));

    sheets.push({
      sheetNum: sheetName,
      title,
      rawRows: rows,
      headerIdx,
      addresses: dataRows.map(r => ({
        상호: String(r[1] || ""),
        주소: String(r[5] || ""),
        수량: r[6],
      })),
    });
  });

  return { wb, sheets };
}

// 기사별로 각 시트의 매칭 점수 계산
function computeMatchScores(sheets, history) {
  // 기사 목록
  const driverMap = new Map();
  history.forEach(rec => {
    const k = rec.driver.name;
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
        let bestMatch = null;

        d.records.forEach(rec => {
          rec.addresses.forEach(histAddr => {
            const s = addrScore(newAddr.주소, histAddr.주소);
            if (s > bestScore) {
              bestScore = s;
              bestMatch = { ...histAddr, date: rec.fileDate };
            }
          });
        });

        if (bestScore > 0) {
          totalScore += bestScore;
          matchedAddresses++;
          matchDetails.push({ addr: newAddr.주소, score: bestScore, match: bestMatch });
        }
      });

      const confidence = sheet.addresses.length > 0
        ? Math.round((matchedAddresses / sheet.addresses.length) * 100)
        : 0;

      return {
        driver: d,
        totalScore,
        matchedAddresses,
        confidence,
        matchDetails,
      };
    });

    scores.sort((a, b) => b.totalScore - a.totalScore || b.confidence - a.confidence);

    return {
      sheetNum: sheet.sheetNum,
      title: sheet.title,
      addresses: sheet.addresses,
      scores,
      assigned: scores[0] || null,
    };
  });
}

// 처리된 Excel 파일 생성
function buildOutputExcel(origWb, sheetAssignments) {
  const newWb = XLSX.utils.book_new();

  origWb.SheetNames.forEach(sheetName => {
    const origWs = origWb.Sheets[sheetName];
    const assignment = sheetAssignments.find(a => a.sheetNum === sheetName);

    // 시트를 배열로 변환
    const rows = XLSX.utils.sheet_to_json(origWs, { header: 1, defval: "" });

    if (assignment?.assigned?.driver?.name) {
      const d = assignment.assigned.driver;
      const sigText = `${d.plate}\n${d.name} ${d.phone}`;

      // 서명 컬럼(7번)에 기사 정보 기입
      rows.forEach((row, i) => {
        if (i < 2) return;
        if (row[0] && String(row[0]).match(/^\d+$/)) {
          rows[i][7] = sigText;
        }
      });
    }

    const newWs = XLSX.utils.aoa_to_sheet(rows);
    // 원본 컬럼 너비 복사
    if (origWs["!cols"]) newWs["!cols"] = origWs["!cols"];
    if (origWs["!rows"]) newWs["!rows"] = origWs["!rows"];
    if (origWs["!merges"]) newWs["!merges"] = origWs["!merges"];

    XLSX.utils.book_append_sheet(newWb, newWs, sheetName);
  });

  return newWb;
}

// ── UI 컴포넌트 ──────────────────────────────────────────────────────────

function ConfidenceBadge({ pct }) {
  const cls = pct >= 80 ? "bg-emerald-100 text-emerald-700 border-emerald-200"
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

function DriverSelector({ drivers, value, onChange }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-[12px] border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#1B2B4B]/30"
    >
      {drivers.map(d => (
        <option key={d.name} value={d.name}>{d.name} ({d.plate})</option>
      ))}
    </select>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────────
export default function DeliverySignaturePage() {
  const [tab, setTab] = useState("learn"); // "learn" | "fill"
  const [history, setHistory] = useState([]); // Firestore 학습 데이터
  const [histLoading, setHistLoading] = useState(true);

  // 학습 탭
  const [learnUploading, setLearnUploading] = useState(false);
  const [learnDone, setLearnDone] = useState(null);
  const learnInputRef = useRef();

  // 자동입력 탭
  const [newFile, setNewFile] = useState(null);
  const [newFileName, setNewFileName] = useState("");
  const [origWb, setOrigWb] = useState(null);
  const [sheetResults, setSheetResults] = useState(null); // computeMatchScores 결과
  const [overrides, setOverrides] = useState({}); // { sheetNum: driverName }
  const [previewSheet, setPreviewSheet] = useState(null);
  const [processing, setProcessing] = useState(false);
  const newInputRef = useRef();

  // 학습 데이터 로드
  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    setHistLoading(true);
    try {
      const q = query(collection(db, "deliverySignatureHistory"), orderBy("uploadedAt", "desc"));
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setHistory(docs);
    } catch (e) {
      console.error(e);
    }
    setHistLoading(false);
  }

  // 학습 파일 업로드
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
    } catch (e) {
      alert("업로드 오류: " + e.message);
    }
    setLearnUploading(false);
  }

  // 학습 데이터 삭제
  async function handleDeleteHistory(id) {
    if (!confirm("이 데이터를 삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, "deliverySignatureHistory", id));
    await loadHistory();
  }

  // 새 파일 처리
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
      setNewFile(ua);

      // 학습 데이터 병합
      const allRecords = history.flatMap(h => h.records || []);
      const results = computeMatchScores(sheets, allRecords);
      setSheetResults(results);
    } catch (e) {
      alert("파일 처리 오류: " + e.message);
    }
    setProcessing(false);
  }

  // 기사 목록 (학습 데이터에서 추출)
  const allDrivers = React.useMemo(() => {
    const map = new Map();
    history.forEach(h => {
      (h.records || []).forEach(r => {
        if (r.driver?.name && !map.has(r.driver.name)) {
          map.set(r.driver.name, r.driver);
        }
      });
    });
    return Array.from(map.values());
  }, [history]);

  // 최종 시트별 기사 결정
  function getAssignedDriver(sheetNum) {
    if (overrides[sheetNum]) {
      return allDrivers.find(d => d.name === overrides[sheetNum]) || null;
    }
    const r = sheetResults?.find(s => s.sheetNum === sheetNum);
    return r?.assigned?.driver || null;
  }

  // 다운로드
  function handleDownload() {
    if (!origWb || !sheetResults) return;
    const assignments = sheetResults.map(s => ({
      sheetNum: s.sheetNum,
      assigned: { driver: getAssignedDriver(s.sheetNum) },
    }));
    const newWb = buildOutputExcel(origWb, assignments);
    const baseName = newFileName.replace(/\.xlsx$/i, "");
    XLSX.writeFile(newWb, `${baseName}_서명완료.xlsx`);
  }

  // 학습 통계 계산
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
      {/* 페이지 헤더 */}
      <div className="mb-5">
        <h1 className="text-[18px] font-extrabold text-[#1B2B4B] tracking-tight">서명 자동 입력 관리</h1>
        <p className="text-[12px] text-gray-400 mt-0.5">팥주문 신청서 기사 서명 자동 학습 및 입력 시스템</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-0 mb-5 border border-gray-200 rounded-xl overflow-hidden bg-gray-50 p-1">
        {[
          { id: "learn", label: "데이터 학습" },
          { id: "fill", label: "서명 자동입력" },
          { id: "stats", label: "기사 통계" },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-2 text-[13px] font-semibold rounded-lg transition ${tab === id ? "bg-[#1B2B4B] text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ─── TAB 1: 데이터 학습 ─── */}
      {tab === "learn" && (
        <div className="space-y-4">
          {/* 업로드 영역 */}
          <div
            className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center cursor-pointer hover:border-[#1B2B4B]/40 hover:bg-[#1B2B4B]/[0.02] transition-all"
            onClick={() => learnInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); }}
            onDrop={e => { e.preventDefault(); handleLearnUpload(e.dataTransfer.files); }}
          >
            <input
              ref={learnInputRef}
              type="file"
              accept=".xlsx,.xls"
              multiple
              className="hidden"
              onChange={e => handleLearnUpload(e.target.files)}
            />
            <div className="w-12 h-12 bg-[#1B2B4B]/10 rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1B2B4B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div className="text-[14px] font-bold text-[#1B2B4B] mb-1">
              {learnUploading ? "처리 중..." : "과거 서명 완료 파일 업로드"}
            </div>
            <div className="text-[12px] text-gray-400">클릭하거나 파일을 드래그하여 놓으세요 (여러 파일 동시 가능)</div>
            {learnDone && (
              <div className="mt-2 text-[12px] font-semibold text-emerald-600">{learnDone}</div>
            )}
          </div>

          {/* 학습된 데이터 목록 */}
          {histLoading ? (
            <div className="text-center py-8 text-gray-400 text-sm">불러오는 중...</div>
          ) : history.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center text-gray-400 text-sm">
              학습된 데이터가 없습니다. 위에서 파일을 업로드하세요.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-[13px] font-bold text-[#1B2B4B]">학습된 파일 ({history.length}개)</span>
                <span className="text-[11px] text-gray-400">
                  총 {history.reduce((s, h) => s + (h.records?.length || 0), 0)}개 시트 학습됨
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {history.map(h => (
                  <div key={h.id} className="px-5 py-3 flex items-start justify-between gap-3 hover:bg-gray-50/50 transition">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-gray-800 truncate">{h.filename}</div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {(h.records || []).map((r, i) => (
                          <span key={i} className="text-[10px] bg-[#1B2B4B]/5 text-[#1B2B4B] px-2 py-0.5 rounded-full border border-[#1B2B4B]/10">
                            {r.sheetNum}시트 · {r.driver?.name} · {r.addresses?.length}곳
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteHistory(h.id)}
                      className="shrink-0 px-2.5 py-1 text-[11px] text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: 서명 자동입력 ─── */}
      {tab === "fill" && (
        <div className="space-y-4">
          {history.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[12px] text-amber-700 font-medium">
              학습 데이터가 없습니다. 먼저 "데이터 학습" 탭에서 과거 파일을 업로드하세요.
            </div>
          )}

          {/* 새 파일 업로드 */}
          <div
            className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center cursor-pointer hover:border-[#1B2B4B]/40 hover:bg-[#1B2B4B]/[0.02] transition-all"
            onClick={() => newInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleNewFile(e.dataTransfer.files[0]); }}
          >
            <input
              ref={newInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => handleNewFile(e.target.files[0])}
            />
            <div className="text-[13px] font-bold text-[#1B2B4B] mb-1">
              {processing ? "분석 중..." : newFileName ? `선택됨: ${newFileName}` : "서명 비어있는 새 파일 업로드"}
            </div>
            <div className="text-[12px] text-gray-400">서명 칸이 공란인 팥주문 신청서를 업로드하세요</div>
          </div>

          {/* 매칭 결과 */}
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
                    const topScore = sheet.scores[0];

                    return (
                      <div key={sheet.sheetNum}>
                        {/* 시트 헤더 */}
                        <div className="px-5 py-3 bg-gray-50/60 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 bg-[#1B2B4B] text-white rounded-lg text-[13px] font-bold flex items-center justify-center shrink-0">
                              {sheet.sheetNum}
                            </span>
                            <div>
                              <div className="text-[12px] font-semibold text-gray-700">{sheet.title.replace(/\(.*?\)/g, "").trim()}</div>
                              <div className="text-[11px] text-gray-400">{sheet.addresses.length}곳 배송</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {topScore && <ConfidenceBadge pct={topScore.confidence} />}
                            <DriverSelector
                              drivers={allDrivers}
                              value={currentDriver?.name || ""}
                              onChange={v => setOverrides(p => ({ ...p, [sheet.sheetNum]: v }))}
                            />
                          </div>
                        </div>

                        {/* 후보 기사 점수 */}
                        <div className="px-5 py-2 flex flex-wrap gap-2">
                          {sheet.scores.slice(0, 4).map(sc => (
                            <button
                              key={sc.driver.name}
                              onClick={() => setOverrides(p => ({ ...p, [sheet.sheetNum]: sc.driver.name }))}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-semibold transition ${
                                currentDriver?.name === sc.driver.name
                                  ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                              }`}
                            >
                              <span>{sc.driver.name}</span>
                              <span className={`text-[10px] ${currentDriver?.name === sc.driver.name ? "text-white/70" : "text-gray-400"}`}>
                                {sc.matchedAddresses}/{sheet.addresses.length}건 매칭
                              </span>
                            </button>
                          ))}
                          {sheet.scores.length === 0 && (
                            <span className="text-[11px] text-amber-600">학습 데이터 없음 - 수동 지정 필요</span>
                          )}
                        </div>

                        {/* 주소 미리보기 토글 */}
                        <div className="px-5 pb-3">
                          <button
                            onClick={() => setPreviewSheet(previewSheet === sheet.sheetNum ? null : sheet.sheetNum)}
                            className="text-[11px] text-[#1B2B4B] font-semibold hover:underline"
                          >
                            {previewSheet === sheet.sheetNum ? "주소 목록 닫기" : `주소 목록 보기 (${sheet.addresses.length}곳)`}
                          </button>

                          {previewSheet === sheet.sheetNum && (
                            <div className="mt-2 rounded-xl border border-gray-100 overflow-hidden">
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr className="bg-gray-50 text-gray-500">
                                    <th className="px-3 py-1.5 text-left font-semibold w-6">NO</th>
                                    <th className="px-3 py-1.5 text-left font-semibold">상호</th>
                                    <th className="px-3 py-1.5 text-left font-semibold">주소</th>
                                    <th className="px-3 py-1.5 text-left font-semibold w-12">매칭</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                  {sheet.addresses.map((addr, i) => {
                                    const matchDetail = topScore?.matchDetails?.find(m => m.addr === addr.주소);
                                    const score = matchDetail?.score || 0;
                                    return (
                                      <tr key={i} className={score > 0 ? "bg-emerald-50/40" : ""}>
                                        <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                                        <td className="px-3 py-1.5 font-medium text-gray-700">{addr.상호}</td>
                                        <td className="px-3 py-1.5 text-gray-500 max-w-[300px] truncate">{addr.주소}</td>
                                        <td className="px-3 py-1.5">
                                          {score >= 3 ? (
                                            <span className="text-emerald-600 font-bold text-[10px]">완전</span>
                                          ) : score >= 2 ? (
                                            <span className="text-blue-500 font-bold text-[10px]">부분</span>
                                          ) : score === 1 ? (
                                            <span className="text-amber-500 font-bold text-[10px]">구역</span>
                                          ) : (
                                            <span className="text-gray-300 text-[10px]">-</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
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

      {/* ─── TAB 3: 기사 통계 ─── */}
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
                        <div className="text-[20px] font-extrabold text-[#1B2B4B]">{s.lastDate || "-"}</div>
                        <div className="text-[11px] text-gray-400">최근 배송일</div>
                      </div>
                    </div>

                    {/* 방문한 시트 분포 */}
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
                          return Object.entries(sheetCounts).sort((a,b) => b[1]-a[1]).map(([sheet, cnt]) => (
                            <span key={sheet} className="text-[10px] px-2 py-0.5 bg-[#1B2B4B]/5 text-[#1B2B4B] rounded-full border border-[#1B2B4B]/10 font-semibold">
                              {sheet}시트 {cnt}회
                            </span>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 학습 데이터 요약 */}
              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                <div className="text-[13px] font-bold text-[#1B2B4B] mb-3">전체 학습 현황</div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "학습 파일 수", value: history.length },
                    { label: "총 시트 수", value: history.reduce((s,h)=>s+(h.records?.length||0),0) },
                    { label: "총 주소 수", value: history.reduce((s,h)=>s+(h.records||[]).reduce((ss,r)=>ss+(r.addresses?.length||0),0),0) },
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
