// ======================= src/dispatch/DriverManagement.jsx =======================
// 🧩 2026-11-27 src/DispatchApp.jsx 에서 그대로 옮긴 코드(동작 · 화면 그대로) — 큰 파일을 화면별로 나눠 로그인 직후 받는 JS 를 줄였다.
import { useCompanyFleetGrades } from "../fleetGrades";
import { FleetDispatchWayButton } from "../fleetDispatchWay";
import { kpConfirm } from "../kpDialog";
import { runBulkTask, runUpload } from "../DeleteProgress";
import BulkUploadChooser, { downloadTemplateXlsx } from "../BulkUploadChooser";
import ToolMenuButton from "../toolMenu";
import React from "react";
import { VehicleTypePicker, VT_DEFAULTS } from "../vehicleTypes";
import { createPortal } from "react-dom";
import DriverContextMenu, { copyToClipboard, driverCopyText } from "../DriverContextMenu";
import { subscribeUsersLive } from "../usersLive";
import FleetExtraFields, { DriverPayFields } from "../FleetDriverExtra";
import { formatAccountView as fmtAcctByBank } from "../bankUtil";
import { fmtBizNo } from "../formatInput";
import DriverVehicleChangeModal, { DriverMergeModal } from "../DriverVehicleChange";
import { isPendingSignupDriver } from "../pendingSignups";
import { EditableText } from "../EditMode";
import { CustomSelect } from "../CustomSelect";
import { useTableSort, sortRows, SortTh } from "../tableSort";
import { DriverPayImportModal } from "../PrepayImport";
import { isPrepaySheet, parsePrepayRows } from "../prepayCore";
import { isFleetGrade, GUIDE_BTN, guideSentLabel, DriverGuideSendModal } from "../DriverAppGuide";
import { CARGO_VEHICLE_SPEC_TABLE, KP_MONO, displayRegDate, formatPhone, loadXLSX } from "./shared/dispatchCommon.jsx";


// ⭐ PC 길게 눌러 선택 모드(2026-10-27) — 오더 줄을 마우스로 0.5초 이상 누르고 있으면 선택 모드가 켜지고,
//    그 뒤로는 줄 어디를 눌러도 체크된다(입력칸·버튼은 그대로 동작). 아래 가운데 막대로 지금 모드를 표시, ESC로 끝.
// ⭐ 2026-11-02 기사 등록·수정 — 차량종류 드롭다운 + "직접입력"(목록에 없는 값은 글자 칸으로 적는다)
function DriverVehicleTypeField({ value, onChange, className = "" }) {
  // 🚚 2026-11-02 회사 공용 차량종류 — 목록에서 고르거나 맨 아래 [＋ 차량종류 추가]로 새 이름을 넣으면 모든 화면 목록에 추가된다
  return <VehicleTypePicker className={className} value={value} onChange={onChange} base={VT_DEFAULTS} placeholder="선택" noneLabel="선택 안 함" />;
}

// ⭐ 2026-11-02 기사관리 표 — 차량종류(암롤·윙바디 등)를 한눈에 · 한 가지 색(네이비 톤)으로 깔끔하게 + 톤수(숫자 글꼴)
function VehicleTypeBadge({ type, ton }) {
  // 예전에 "직접입력"이라는 글자 자체가 저장된 기사는 차종이 없는 것과 같다 → 미지정
  const t0 = String(type || "").trim();
  const t = t0 === "직접입력" ? "" : t0;
  const tn = String(ton || "").trim();
  if (!t && !tn) return <span className="text-gray-300">-</span>;
  return (
    <span className="inline-flex items-stretch h-[27px] rounded-md overflow-hidden border border-[#C9D5EA] bg-white text-[14px] leading-none">
      <span className={`inline-flex items-center px-2.5 font-extrabold ${t ? "text-[#0F1A30]" : "text-[#B4BFD0]"}`}>{t || "미지정"}</span>
      {tn && <span className="inline-flex items-center px-2 bg-[#1B2B4B] text-white font-bold tabular-nums" style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>{tn}</span>}
    </span>
  );
}
// ===================== DispatchApp.jsx (PART 9/9) — END =====================
// ===================== DispatchApp.jsx (PART 10/10) — START =====================
export default function DriverManagement({ drivers: driversRaw, upsertDriver, removeDriver, showAlert = (m) => alert(m), userCompany = "", grade = "", onGrade, mobile = false, canEditFleetWay = false }) {
  // ⭐ 2026-11-06 mobile — 모바일 앱(기사관리)에서: 버튼은 기사등록·기사정리·선택삭제만, 표 대신 카드 목록(누르면 상세 시트)
  const extraFleet = useCompanyFleetGrades(userCompany); // 🚛 2026-11-12 회사 전용 지입차 구분(분양 등) — 그 회사만 선택 목록에
  const [guideFor, setGuideFor] = React.useState(null); // ⭐ 2026-11-06 [앱 안내 보내기] 대상 기사 배열
  const [mSheet, setMSheet] = React.useState(null); // 모바일 카드 상세 시트
  // 이름·차량번호·연락처가 모두 빈 문서(예전 직원 승인 때 잘못 생긴 빈 기사)는 목록에서 뺀다
  // ⭐ 2026-11-05 가입 승인 전 기사(기사앱 가입 문서)는 기사관리 목록에서 뺀다 — 기사 앱 계정 › 가입 승인에서 승인하면 들어온다
  const drivers = React.useMemo(() => (driversRaw || []).filter((r) => !isPendingSignupDriver(r) && (String(r.이름 || r.name || "").trim() || String(r.차량번호 || "").trim() || String(r.전화번호 || r.phone || "").trim())), [driversRaw]);
  // ⭐ 사용자 요청 — PC 기사 수정 모달에서도 담당자(위임 대상)를 바로 지정할 수
  // 있어야 한다. 지입차관리(FleetManagement)와 동일한 기준(같은 회사의
  // totalMaster/admin/user)으로 배차자 목록을 가져온다.
  const [companyStaff, setCompanyStaff] = React.useState([]);
  React.useEffect(() => {
    // ⭐ 2026-11-02 속도 — 앱 공용 users 구독(usersLive)을 같이 쓴다(받는 데이터 동일)
    const unsub = subscribeUsersLive((all) => {
      const list = all
        .filter(u => ["totalMaster", "admin", "user"].includes(u.role) && (!userCompany || u.companyName === userCompany))
        .map(u => ({ id: u.id, name: u.name || u.email || "이름없음" }))
        .sort((a, b) => a.name.localeCompare(b.name, "ko"));
      setCompanyStaff(list);
    });
    return unsub;
  }, [userCompany]);
  const [q, setQ] = React.useState("");
  const [qField, setQField] = React.useState("전체");
  const [searched, setSearched] = React.useState(false);
  const [selected, setSelected] = React.useState(new Set());
  const [gradeFilter, setGradeFilter] = React.useState(grade || "전체");
  // 🚚 기사관리 허브의 왼쪽 메뉴(전체·일반·직영·지입·임대·블랙)와 위 카드 선택을 서로 맞춘다
  React.useEffect(() => { if (grade && grade !== gradeFilter) setGradeFilter(grade); }, [grade]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (onGrade && gradeFilter !== grade) onGrade(gradeFilter); }, [gradeFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [newForm, setNewForm] = React.useState({ 차량번호:"", 이름:"", 전화번호:"", 메모:"", 등급:"일반", 거주지:"", 차량종류:"", 차량톤수:"", 요청사항:"", 담당자:null, 근무요일:[] });
  const WEEKDAYS = ["월","화","수","목","금","토","일"];
  const [showAll, setShowAll] = React.useState(true); // 들어오면 바로 전체 목록
  const [page, setPage] = React.useState(1);
  const perPage = 20;
  const [editDriverModal, setEditDriverModal] = React.useState(null); // 더블클릭 수정 팝업
  const [vehicleChangeFor, setVehicleChangeFor] = React.useState(null); // ⭐ 2026-11-11 차량 변경 창(계정은 그대로, 차량만)
  const [mergeFor, setMergeFor] = React.useState(null); // ⭐ 2026-11-11 기사 합치기 창(최고관리자만)
  const isTotalMasterUser = React.useMemo(() => { try { return localStorage.getItem("role") === "totalMaster"; } catch { return false; } }, []);
  const [drvCtx, setDrvCtx] = React.useState(null); // 🖱 2026-11-10 오른쪽 클릭 메뉴 { x, y, rows }
  const [drvToast, setDrvToast] = React.useState("");
  // 체크한 기사 — 화면 표 순서대로(검색으로 안 보이는 체크 기사는 뒤에)
  const selectedInOrder = () => { const seen = new Set(); const out = []; [...filtered, ...drivers].forEach((d) => { if (d?.id && selected.has(d.id) && !seen.has(d.id)) { seen.add(d.id); out.push(d); } }); return out; };
  // ⌨ 체크한 기사가 있으면 Ctrl+C = "차량번호 이름 전화번호" 한 줄에 한 명(입력칸에 커서가 있거나 글자를 드래그했으면 평소처럼)
  React.useEffect(() => {
    if (mobile) return undefined;
    const k = async (e) => {
      if (!(e.ctrlKey || e.metaKey) || String(e.key).toLowerCase() !== "c" || !selected.size) return;
      const a = document.activeElement; if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) return;
      if (String(window.getSelection?.() || "").trim()) return;
      const rows = selectedInOrder(); if (!rows.length) return;
      e.preventDefault();
      const ok = await copyToClipboard(driverCopyText(rows, "all"));
      setDrvToast(ok ? `복사했습니다 · 차량번호 · 이름 · 전화번호 ${rows.length}명` : "복사하지 못했어요");
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  React.useEffect(() => { if (!drvToast) return undefined; const t = setTimeout(() => setDrvToast(""), 2200); return () => clearTimeout(t); }, [drvToast]);

  // 🪪 2026-11-20 [정산정보 가져오기] — 선정산 파일(여러 개)에서 차량번호로 기사를 찾아 사업자번호 · 계좌만 채운다
  const [payInfoImport, setPayInfoImport] = React.useState(null); // { fileNames, items }
  const onPayInfoFiles = async (e) => {
    const XLSX = await loadXLSX(); // ⚡ 엑셀 라이브러리는 누를 때 받는다
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    const items = []; const names = []; const skipped = [];
    for (const f of files) {
      try {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
        if (!isPrepaySheet(raw)) { skipped.push(f.name); continue; }
        const its = parsePrepayRows(raw);
        its.forEach((it) => { it.key = `${f.name}:${it.key}`; });
        items.push(...its); names.push(f.name);
      } catch { skipped.push(f.name); }
    }
    if (!items.length) return showAlert(`선정산 마감 파일(국세청승인번호 · 차량번호 · 사업자번호가 있는 양식)을 골라 주세요.${skipped.length ? `\n\n읽지 못한 파일: ${skipped.join(", ")}` : ""}`);
    if (skipped.length) showAlert(`이 파일은 선정산 양식이 아니라 빼고 읽었어요: ${skipped.join(", ")}`);
    setPayInfoImport({ fileNames: names, items });
  };
  // 기사관리에 없는 차량 → 대용량 업로드 양식 열 그대로(+ 정산 정보) 엑셀
  const downloadMissingPayInfo = async (its) => {
    const XLSX = await loadXLSX(); // ⚡ 엑셀 라이브러리는 누를 때 받는다
    const rows = its.map((it) => ({ 차량번호: it.plate, 이름: it.ceo || "", 전화번호: it.phone || "", 등급: "일반", 메모: it.company || "",
      사업자번호: it.bizNo ? fmtBizNo(it.bizNo) : "", 상호: it.company || "", 대표자: it.ceo || "", 은행: it.bank || "", 계좌번호: it.acct || "", 예금주: it.holder || "" }));
    const ws = XLSX.utils.json_to_sheet(rows);
    rows.forEach((_, i) => { const c = ws[XLSX.utils.encode_cell({ r: i + 1, c: 9 })]; if (c) { c.t = "s"; c.v = String(c.v); } }); // 계좌번호 앞자리 0 보존
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "기사관리에 없는 차량");
    XLSX.writeFile(wb, `기사관리_미등록차량_${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)}.xlsx`);
  };

  // 기사정리 팝업 상태
  const [cleanupOpen, setCleanupOpen] = React.useState(false);
  const [cleanupTab, setCleanupTab] = React.useState("연락처정규화"); // "연락처정규화" | "중복기사정리"
  const [cleanupQ, setCleanupQ] = React.useState("");
  const [cleanupQField, setCleanupQField] = React.useState("전체");
  const [cleanupSelected, setCleanupSelected] = React.useState(new Set()); // ids to delete (duplicates)
  const [cleanupDone, setCleanupDone] = React.useState(false);

  // 전화번호 정규화: 010-XXXX-XXXX 형식으로 변환
  const normalizePhone = (raw) => {
    const d = String(raw || "").replace(/\D/g, "");
    if (!d) return raw;
    // 앞에 0 없는 경우 (예: 1044683752 → 01044683752)
    const digits = d.startsWith("0") ? d : "0" + d;
    if (digits.length === 11 && digits.startsWith("010")) {
      return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
    }
    if (digits.length === 11) {
      return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10 && digits.startsWith("010")) {
      // 010-XXX-XXXX (구형)
      return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
    }
    if (digits.length === 10) {
      return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
    }
    return raw; // 변환 불가 시 원본 반환
  };

  const bulkNormalizePhones = async () => {
    const targets = drivers.filter(d => {
      if (!d.전화번호) return false;
      const normalized = normalizePhone(d.전화번호);
      return normalized !== d.전화번호;
    });
    if (!targets.length) return showAlert("변환할 번호가 없습니다. 이미 모두 정규화되어 있습니다.");
    if (!await kpConfirm(`${targets.length}건의 전화번호를 자동 정규화하시겠습니까?\n\n예시:\n${targets.slice(0,3).map(d=>`${d.이름}: ${d.전화번호} → ${normalizePhone(d.전화번호)}`).join("\n")}`)) return;
    await runBulkTask({ count: targets.length, label: "기사 전화번호", verb: "정리", task: async (progress) => { let k = 0; for (const d of targets) { await upsertDriver({ ...d, 전화번호: normalizePhone(d.전화번호) }); progress(++k); } } });
    showAlert(`전화번호 ${targets.length}건을 정규화했습니다.`);
  };

  const norm = (s="") => String(s).toLowerCase().replace(/\s+/g,"");

  const filtered = React.useMemo(() => {
    if (q.trim() && searched) {
      const nq = norm(q);
      const fields = qField === "전체" ? ["차량번호","이름","전화번호","메모","사업자상호","사업자대표"] : [qField === "기사명" ? "이름" : qField === "연락처" ? "전화번호" : qField];
      // 💳 2026-11-20 전체 검색 — 사업자번호 · 계좌번호(하이픈 무시) · 상호 · 대표자 · 예금주로도 찾는다
      const nqDigits = String(q).replace(/\D/g, "");
      const payHit = (r) => qField === "전체" && ((nqDigits.length >= 6 && [r.사업자번호, r.정산계좌?.acct].some((v) => String(v || "").replace(/\D/g, "").includes(nqDigits))) || norm(r.정산계좌?.holder || "").includes(nq));
      let list = drivers.filter(r => fields.some(k => norm(r[k]||"").includes(nq)) || payHit(r));
      if (gradeFilter !== "전체") list = list.filter(r => (r.등급||"일반") === gradeFilter);
      return list;
    }
    if (showAll) {
      if (gradeFilter !== "전체") return drivers.filter(r => (r.등급||"일반") === gradeFilter);
      return drivers;
    }
    return [];
  }, [drivers, q, qField, searched, gradeFilter, showAll]);

  // ★ 연락처 정규화 대상
  const phoneNormTargets = React.useMemo(() => {
    const cq = norm(cleanupQ);
    return drivers
      .filter(d => {
        if (!d.전화번호) return false;
        if (normalizePhone(d.전화번호) === d.전화번호) return false;
        if (!cq) return true;
        const fields = cleanupQField === "전체" ? ["차량번호","이름","전화번호"] : [cleanupQField === "기사명" ? "이름" : cleanupQField === "연락처" ? "전화번호" : cleanupQField];
        return fields.some(k => norm(d[k]||"").includes(cq));
      });
  }, [drivers, cleanupQ, cleanupQField]);

  // ★ 중복기사 그룹 (차량번호 기준, 동일 차량번호 2개 이상)
  const dupGroups = React.useMemo(() => {
    const cq = norm(cleanupQ);
    const map = new Map();
    for (const d of drivers) {
      const key = norm(d.차량번호 || "");
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    }
    let groups = [...map.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([, list]) => list);
    if (cq) {
      groups = groups.filter(list =>
        list.some(d => {
          const fields = cleanupQField === "전체" ? ["차량번호","이름","전화번호"] : [cleanupQField === "기사명" ? "이름" : cleanupQField === "연락처" ? "전화번호" : cleanupQField];
          return fields.some(k => norm(d[k]||"").includes(cq));
        })
      );
    }
    return groups;
  }, [drivers, cleanupQ, cleanupQField]);

  React.useEffect(() => setPage(1), [q, gradeFilter, showAll, searched]);

  // ⭐ 2026-11-02 담당자 칸 머리를 누르면 담당자 목록 → 고른 담당자의 차량이 맨 위로(줄 강조) · 다시 고르면 해제
  const [mgrFocus, setMgrFocus] = React.useState("");
  const [mgrMenu, setMgrMenu] = React.useState(null); // { left, top }
  // 📱 2026-11-11 휴대폰 — 팝업을 화면 맨 위(body)에 직접 그린다. 글자 크기를 키우면(#root zoom) 아이폰에서 화면 안 팝업(position: fixed)이
  //  본문 길이만큼만 그려져 아래가 잘렸다. PC는 그대로.
  const mPop = (node) => (mobile ? createPortal(<div className="kp-m-pc kp-m-cm">{node}</div>, document.body) : node);
  const mgrOf = (r) => String(r?.담당자?.name || "").trim();
  const mgrCounts = React.useMemo(() => {
    const m = new Map();
    for (const r of filtered) { const n = mgrOf(r); if (n) m.set(n, (m.get(n) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
  }, [filtered]);
  // ⭐ 머리글 클릭 정렬(▲→▼→해제, 담당자 칸은 위 담당자 목록 기능 그대로) — 이 브라우저에만 기억
  const drvSort = useTableSort("drivers");
  const drvOnSort = React.useCallback((k) => { drvSort.toggle(k); setPage(1); }, [drvSort.toggle]);
  const sortedDrivers = React.useMemo(() => sortRows(filtered, drvSort.sort, (r, key, i) => {
    const g = r.등급 || "일반";
    const fleet = isFleetGrade(g);
    switch (key) {
      case "순번": return i;
      case "등록일": return displayRegDate(r);
      case "거주지": return fleet ? r.거주지 : "";
      case "근무가능요일": return fleet && Array.isArray(r.근무요일) ? r.근무요일.join(",") : "";
      case "등급": return g;
      case "정산계좌": return r.정산계좌?.acct ? `${r.정산계좌.bank || ""} ${r.정산계좌.acct}` : "";
      case "팝업": return !(r.메모 || "").trim() ? "" : (g === "블랙" ? "ON" : r.팝업표시 === true ? "ON" : "OFF");
      default: return r[key];
    }
  }), [filtered, drvSort.sort]);
  const ordered = React.useMemo(() => {
    if (!mgrFocus) return sortedDrivers;
    const top = [], rest = [];
    for (const r of sortedDrivers) (mgrOf(r) === mgrFocus ? top : rest).push(r);
    return [...top, ...rest];
  }, [sortedDrivers, mgrFocus]);
  React.useEffect(() => { setPage(1); }, [mgrFocus]);
  React.useEffect(() => {
    if (!mgrMenu) return undefined;
    const close = (e) => { if (e.target.closest && e.target.closest("[data-mgr-menu]")) return; setMgrMenu(null); };
    const onScroll = (e) => { if (e.target?.closest && e.target.closest("[data-mgr-menu]")) return; setMgrMenu(null); };
    const t = setTimeout(() => document.addEventListener("mousedown", close), 0);
    window.addEventListener("scroll", onScroll, true);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", close); window.removeEventListener("scroll", onScroll, true); };
  }, [mgrMenu]);
  const paged = React.useMemo(() => ordered.slice((page-1)*perPage, page*perPage), [ordered, page]);
  const totalPages = Math.ceil(filtered.length / perPage);

  const toggleOne = (id) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleAll = () => {
    const ids = filtered.map(r => r.id).filter(Boolean);
    setSelected(selected.size === ids.length ? new Set() : new Set(ids));
  };

  const saveEditDriver = async () => {
    if (!editDriverModal) return;
    if (!editDriverModal.id) return showAlert("기사 정보를 찾을 수 없어 수정할 수 없습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.");
    if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;
    // 블랙 등급은 메모가 있으면 무조건 팝업이 뜨도록 별도로 처리되므로(팝업표시 값과 무관),
    // 저장 시점에도 사용자에게 혼란을 주지 않도록 항상 팝업표시:true로 맞춰 저장한다.
    const 팝업표시 = editDriverModal.등급 === "블랙" ? true : editDriverModal.팝업표시 === true;
    // 차량 기본정보(vehicle·care)는 마법사가 따로 저장하므로 여기서 옛 값으로 덮어쓰지 않는다
    const { vehicle: _v, care: _c, careLogs: _cl, ...rest } = editDriverModal;
    await upsertDriver({ ...rest, 팝업표시 });
    setEditDriverModal(null);
    showAlert("수정 완료");
  };

  const addNew = async () => {
    const 차량번호 = (newForm.차량번호||"").replace(/\s+/g,"");
    if (!차량번호) return showAlert("차량번호는 필수입니다.");
    const isFleet = isFleetGrade(newForm.등급);
    // ⭐ 버그수정 — 여기서 항상 새 랜덤 id를 강제로 지정했더니, 이미 기사앱으로
    // 가입해 실제 위치/상태가 쌓이고 있는 기사의 차량번호를 여기서 다시 입력하면
    // (예: 지입 등급만 뒤늦게 지정) 완전히 별개의 빈 문서가 하나 더 생겼다 —
    // 지입차관리(실시간 GPS)는 가입 당시 문서(uid)를 보는데, 등급은 이 새 고아
    // 문서에만 붙어서 "지입으로 지정했는데 지입차관리에 안 보인다" 사고로 이어짐.
    // id를 넘기지 않으면 upsertDriver가 차량번호로 기존 문서를 먼저 찾아
    // 재사용한다(4012번 줄 부근 로직) — 신규 차량일 때만 새 문서가 생긴다.
    await upsertDriver({
      차량번호,
      이름: newForm.이름,
      전화번호: (newForm.전화번호||"").replace(/\D/g,""),
      메모: newForm.메모,
      등급: newForm.등급 || "일반",
      거주지: isFleet ? (newForm.거주지||"") : "",
      차량종류: isFleet ? (newForm.차량종류||"") : "",
      차량톤수: isFleet ? (newForm.차량톤수||"") : "",
      요청사항: isFleet ? (newForm.요청사항||"") : "",
      담당자: isFleet ? (newForm.담당자||null) : null,
      근무요일: isFleet ? (newForm.근무요일||[]) : [],
    });
    setNewForm({ 차량번호:"", 이름:"", 전화번호:"", 메모:"", 등급:"일반", 거주지:"", 차량종류:"", 차량톤수:"", 요청사항:"", 담당자:null, 근무요일:[] });
    setShowAddForm(false);
    showAlert("등록 완료");
  };

  const removeSelected = async () => {
    if (!selected.size) return showAlert("선택된 항목이 없습니다.");
    if (!await kpConfirm(`${selected.size}건 삭제할까요?`)) return;
    await removeDriver([...selected]); // ⭐ 2026-11-05 한 번에 삭제 + 진행 창
    setSelected(new Set());
    showAlert("삭제 완료");
  };

  const downloadExcel = async () => {
    const XLSX = await loadXLSX(); // ⚡ 엑셀 라이브러리는 누를 때 받는다
    if (!filtered.length) return showAlert("내보낼 데이터가 없습니다.");
    const rows = filtered.map((r,i) => ({
      순번:i+1, 차량번호:r.차량번호||"", 이름:r.이름||"",
      전화번호:r.전화번호||"", 등급:r.등급||"일반", 메모:r.메모||"",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "기사관리");
    XLSX.writeFile(wb, "기사관리.xlsx");
  };

  const [driverBulkOpen, setDriverBulkOpen] = React.useState(false);
  const onExcel = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const XLSX = await loadXLSX(); // ⚡ 엑셀 라이브러리는 누를 때 받는다
      try {
        const wb = XLSX.read(new Uint8Array(evt.target.result), { type:"array" });
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval:"" });
        let ok = 0;
        const valid = json.filter((r) => String(r.차량번호||r["차량 번호"]||"").replace(/\s+/g,""));
        if (!valid.length) { showAlert("등록할 기사님이 없습니다. (차량번호 열을 확인해 주세요)"); return; }
        if (!await kpConfirm(`기사 ${valid.length}명을 등록·갱신할까요?${json.length - valid.length ? `\n(차량번호가 없는 ${json.length - valid.length}줄은 건너뜁니다)` : ""}`)) return;
        // 📥 2026-11-12 한 명씩 툭툭 생기지 않게 — 가운데 로딩 창 + 묶음으로 동시에 등록(src/DeleteProgress.jsx runUpload)
        const upD = await runUpload({ items: valid, label: "기사", each: async (r) => {
          const 차량번호 = String(r.차량번호||r["차량 번호"]||"").replace(/\s+/g,"");
          if (!차량번호) return false;
          // ⭐ addNew와 동일한 이유로 id를 강제로 새로 만들지 않는다 — 이미 기사앱으로
          // 가입된 차량번호면 그 문서를 그대로 재사용(merge)해야 등급이 실제 위치/상태가
          // 쌓이는 문서에 붙는다.
          // ⭐ 2026-11-02 점검 — 빈 칸은 보내지 않음(기존 이름·전화·메모 유지). 등급 칸이 비면 기존 기사 등급(블랙·지입·직영) 유지, 새 기사만 '일반'
          const pick = (v) => String(v ?? "").trim();
          const normP = (s = "") => String(s).replace(/\s+/g, "").toUpperCase();
          const patch = { 차량번호 };
          const nm = pick(r.이름 || r["기사명"]); if (nm) patch.이름 = nm;
          const ph = pick(r.전화번호 || r["전화"] || r["휴대폰"]); if (ph) patch.전화번호 = ph;
          const mm = pick(r.메모 || r["비고"]); if (mm) patch.메모 = mm;
          const gr = pick(r.등급);
          if (gr) patch.등급 = gr;
          else if (!(driversRaw || []).some((d) => normP(d.차량번호) === normP(차량번호))) patch.등급 = "일반";
          await upsertDriver(patch);
        } });
        ok = upD.ok;
        showAlert(`총 ${ok}건을 반영했습니다.`);
      } catch(err) {
        console.error(err); showAlert("엑셀 처리 중 오류가 발생했습니다. 파일 형식을 확인해 주세요.");
      } finally { e.target.value = ""; }
    };
    reader.readAsArrayBuffer(file);
  };

  const gradeBadge = (g) => {
    if (g === "블랙") return "bg-gray-900 text-white";
    if (g === "직영") return "bg-[#1B2B4B] text-white";
    if (g === "지입") return "bg-[#1B2B4B]/20 text-[#1B2B4B]";
    if (g === "임대") return "bg-[#2D4C82]/15 text-[#2D4C82]";
    return "bg-gray-100 text-gray-500";
  };

  const kpi = React.useMemo(() => ({
    전체: drivers.length,
    일반: drivers.filter(d=>(d.등급||"일반")==="일반").length,
    직영: drivers.filter(d=>d.등급==="직영").length,
    지입: drivers.filter(d=>d.등급==="지입").length,
    임대: drivers.filter(d=>d.등급==="임대").length,
    분양: drivers.filter(d=>d.등급==="분양").length, // 🚛 2026-11-12 회사 전용 구분(켠 회사만 카드로 보임)
    블랙: drivers.filter(d=>d.등급==="블랙").length,
  }), [drivers]);

  // 🧰 2026-11-23 [검색] — 칸이 비어 있으면 전체 기사(예전 [전체보기] 대신)
  const runDriverSearch = () => {
    if (!q.trim()) { setShowAll(true); setGradeFilter("전체"); setSearched(false); return; }
    setSearched(true);
  };
  // 🧰 2026-11-23 [등록·정리] 목록 — 예전 [+ 기사 등록] · [기사정리] 버튼과 같은 동작
  const driverRegItems = [
    { key: "add", label: "기사 등록", desc: "새 기사님을 한 명 등록해요", onClick: () => setShowAddForm(true) },
    { key: "clean", label: "기사 정리", desc: "전화번호를 한 모양으로 맞추고, 겹친 기사를 정리해요", onClick: () => { setCleanupOpen(true); setCleanupQ(""); setCleanupQField("전체"); setCleanupSelected(new Set()); setCleanupDone(false); } },
  ];

  return (
    <div className={mobile ? "p-1" : "p-4"}>

      {/* ⭐ 2026-10-28 디지털 리디자인 — 숫자 타일(누르면 등급별 보기) + 한 줄 검색바 + 오른쪽 작업 버튼 */}
      <div className={`grid ${mobile ? "grid-cols-3 gap-2 mb-3" : `${extraFleet.includes("분양") ? "grid-cols-7" : "grid-cols-6"} gap-3 mb-4`}`}>
        {[
          {label:"전체", en:"ALL", val:kpi.전체, key:"전체"},
          {label:"일반", en:"GENERAL", val:kpi.일반, key:"일반"},
          {label:"직영", en:"DIRECT", val:kpi.직영, key:"직영"},
          {label:"지입", en:"CONSIGNED", val:kpi.지입, key:"지입"},
          {label:"임대", en:"LEASE", val:kpi.임대, key:"임대"},
          ...(extraFleet.includes("분양") ? [{label:"분양", en:"SOLD", val:kpi.분양, key:"분양"}] : []),
          {label:"블랙", en:"BLOCKED", val:kpi.블랙, key:"블랙"},
        ].map(({label,en,val,key}) => {
          const on = gradeFilter===key && (showAll || searched);
          return (
            <button key={key} onClick={() => { setGradeFilter(key); if (!(q.trim() && searched)) setShowAll(true); }}
              className={`relative overflow-hidden rounded-[20px] px-5 py-4 text-left transition ${on ? "text-white shadow-[0_14px_30px_rgba(15,26,48,0.28)]" : "bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_20px_rgba(16,24,40,0.05)] hover:border-[#4B6CB7]"}`}
              style={on ? { background: "linear-gradient(125deg,#0B1428,#0F1A30 45%,#1B2B4B 80%,#2D4C82)" } : undefined}>
              {on && <span className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "18px 18px" }} />}
              <div className={`relative text-[10px] font-extrabold tracking-[0.24em] ${on ? "text-[#8FB0F0]" : "text-[#9AA9C3]"}`} style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>{en}</div>
              <div className="relative flex items-end justify-between mt-1">
                <span className={`text-[14px] font-black ${on ? "text-white" : "text-[#0F1A30]"}`}><EditableText id={`driver.kpi.${label}`} defaultText={label} /></span>
                <span className={`text-[28px] font-black leading-none tabular-nums ${on ? "text-white" : "text-[#0F1A30]"}`} style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>{val}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 검색바 + 작업 버튼 */}
      <div className={`flex flex-wrap items-center ${mobile ? "gap-2 mb-3" : "gap-2.5 mb-4"}`}>
        <div className={`flex items-center h-12 flex-1 ${mobile ? "w-full min-w-0 basis-full" : "min-w-[420px] max-w-[720px]"} rounded-[16px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_20px_rgba(16,24,40,0.05)] focus-within:border-[#4B6CB7] focus-within:ring-4 focus-within:ring-[#4B6CB7]/10 overflow-hidden`}>
          <CustomSelect className={`h-full ${mobile ? "pl-3 pr-1 text-[14px] shrink-0" : "pl-4 pr-2 text-[13.5px]"} bg-transparent font-black text-[#0F1A30] outline-none border-r border-[#EEF1F6] cursor-pointer`}
            value={qField} onChange={e => { setQField(e.target.value); setSearched(false); }}>
            {["전체","차량번호","기사명","연락처"].map(o => <option key={o} value={o}>{o}</option>)}
          </CustomSelect>
          <svg className={`${mobile ? "hidden" : "ml-3"} shrink-0 text-[#9AA9C3]`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-5-5" /></svg>
          <input autoComplete="off"
            className="flex-1 min-w-0 h-full px-2.5 bg-transparent text-[14.5px] font-bold text-[#0F1A30] outline-none placeholder:text-[#A7B3C6] placeholder:font-medium"
            placeholder={mobile ? "차량번호·기사명·연락처" : "차량번호 · 기사명 · 연락처로 찾기 (Enter)"}
            value={q}
            onChange={e => { setQ(e.target.value); setSearched(false); }}
            onKeyUp={e => { if (e.key==="Enter") runDriverSearch(); }}
          />
          <button onClick={runDriverSearch} className={`h-9 mr-1.5 ${mobile ? "px-3.5 text-[14px]" : "px-5 text-[13.5px]"} shrink-0 rounded-[12px] bg-[#0F1A30] text-white font-black hover:bg-[#1B2B4B]`}>검색</button>
        </div>
        {/* 🔁 2026-11-07 중복 정리 — 검색줄 옆 등급 버튼(전체·일반·직영·지입·임대·블랙)은 바로 위 숫자 타일 · 왼쪽 메뉴와 같은 거르기라 뺐다.
             숫자 타일이 검색 중에는 검색 결과 안에서만 거르도록(예전 등급 버튼 동작) 맞췄다 */}
        <span className={`${mobile ? "text-[14px]" : "text-[13px]"} font-bold text-[#5B6B85] px-1 whitespace-nowrap`}>총 <b className="text-[#0F1A30] tabular-nums">{filtered.length}</b>명{mobile && selected.size > 0 && <> · 선택 <b className="text-[#2D4C82] tabular-nums">{selected.size}</b></>}</span>
        {mobile && (
          <div className="ml-auto flex items-center gap-1.5">
            <ToolMenuButton label="등록·정리" testId="driver-reg-menu" items={driverRegItems}
              className="h-11 px-3.5 rounded-[13px] text-[14px] font-black text-white whitespace-nowrap" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }} />
            <button onClick={removeSelected} className="h-11 px-3 rounded-[13px] bg-white border border-[#0F1A30] text-[#0F1A30] text-[14px] font-black whitespace-nowrap">선택삭제</button>
          </div>
        )}
        {mobile && selected.size > 0 && (
          <div className="basis-full flex items-center gap-2 rounded-[14px] bg-[#EEF3FC] border border-[#C9D6EE] px-3 py-2">
            <span className="text-[14px] font-black text-[#1B2B4B]">선택 {selected.size}명</span>
            <button type="button" onClick={() => setSelected(new Set())} className="h-9 px-3 rounded-lg bg-white border border-[#DCE3EE] text-[14px] font-bold text-[#3A4A66]">선택 해제</button>
            <button type="button" onClick={() => setGuideFor(drivers.filter((d) => selected.has(d.id)))} className="ml-auto h-9 px-3 rounded-lg bg-[#1B2B4B] text-white text-[14px] font-black">앱 안내 보내기</button>
          </div>
        )}
        {!mobile && <div className="ml-auto flex items-center gap-2">
          <FleetDispatchWayButton company={userCompany} isMaster={canEditFleetWay} />{/* 🚛 2026-11-23 지입차 배차방식 자동 */}
          <button type="button" className={GUIDE_BTN} title="선택한 기사님(없으면 지입·직영·임대 전체)에게 기사앱 설치 안내를 보냅니다"
            onClick={() => { const sel = drivers.filter((d) => selected.has(d.id)); const list = sel.length ? sel : filtered.filter((d) => isFleetGrade(d.등급)); if (!list.length) { showAlert("안내를 보낼 기사님을 선택해 주세요."); return; } setGuideFor(list); }}>
            앱 안내 보내기{selected.size ? ` (${selected.size})` : ""}
          </button>
          {/* 🧰 2026-11-23 툴바 정리 — [전체보기]·[닫기]는 뺐다(빈 칸으로 [검색]하면 전체) · 엑셀 버튼 3개 → [엑셀 관리] · 기사 등록 + 기사 정리 → [등록·정리] */}
          <ToolMenuButton label="엑셀 관리" testId="driver-excel-menu" menuTitle="엑셀로 가져오기 · 내보내기" minWidth={260} items={[
            { key: "bulk", label: "대용량 업로드", desc: "엑셀로 기사를 한꺼번에 등록 · 수정해요(양식 받기 포함)", onClick: () => setDriverBulkOpen(true) },
            { key: "payinfo", label: "정산정보 가져오기", desc: "선정산 마감 파일로 사업자번호 · 계좌를 채워요", file: { accept: ".xlsx,.xls", multiple: true, onChange: onPayInfoFiles } },
            { key: "down", label: "엑셀 다운로드", desc: "지금 목록을 엑셀로 받아요", onClick: downloadExcel },
          ]} />
          {driverBulkOpen && (
            <BulkUploadChooser
              title="기사 대용량 업로드" subtitle="엑셀로 기사를 한꺼번에 등록·수정합니다. 처음이면 양식부터 받아 주세요."
              templateDesc="차량번호·이름·전화번호·등급·메모 열과 예시, 작성 안내가 들어 있는 양식을 받습니다."
              templateTips={["차량번호는 필수 (없는 줄은 건너뜀)", "등급: 일반 / 직영 / 지입 / 블랙"]}
              uploadDesc="작성한 양식을 고르면 등록할 건수를 먼저 보여드리고, 확인 후 반영합니다."
              uploadTips={["이미 있는 차량번호는 내용만 갱신", "기사앱 가입 차량도 같은 기사로 합쳐짐"]}
              onClose={() => setDriverBulkOpen(false)}
              onTemplate={async () => downloadTemplateXlsx(await loadXLSX(), "기사관리_양식.xlsx", "기사관리", ["차량번호", "이름", "전화번호", "등급", "메모"],
                [["경기12가3456", "김기사", "010-1234-5678", "일반", ""], ["서울34나5678", "이기사", "010-9876-5432", "지입", "평일만 가능"]],
                [["예시 2줄", "예시 줄은 지우고 기사를 한 줄에 한 명씩 입력하세요."], ["차량번호", "필수. 띄어쓰기는 자동으로 지웁니다."], ["등급", "일반 / 직영 / 지입 / 블랙 중 하나 (비우면 일반)"], ["이미 등록된 기사", "같은 차량번호가 있으면 새로 만들지 않고 내용만 고칩니다."]])}
              onFile={(e) => { setDriverBulkOpen(false); onExcel(e); }}
            />
          )}
          {payInfoImport && <DriverPayImportModal fileNames={payInfoImport.fileNames} items={payInfoImport.items} drivers={drivers} onDownloadMissing={downloadMissingPayInfo} onClose={() => setPayInfoImport(null)} />}
          <ToolMenuButton label="등록·정리" testId="driver-reg-menu" items={driverRegItems}
            className="h-11 px-4 rounded-[13px] text-[13.5px] font-black text-white shadow-[0_10px_22px_rgba(15,26,48,0.25)] hover:brightness-110 transition whitespace-nowrap" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }} />
          <button onClick={removeSelected} className="h-11 px-4 rounded-[13px] bg-white border border-[#0F1A30] text-[#0F1A30] text-[13px] font-black hover:bg-[#0F1A30] hover:text-white transition">
            <EditableText id="driver.toolbar.선택삭제" defaultText="선택 삭제" />
          </button>
        </div>}
      </div>

      {/* 신규 등록 팝업 */}
      {showAddForm && mPop(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[600px] max-w-[94vw] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-[15px]"><EditableText id="driver.addPopup.title" defaultText="신규 기사 등록" /></h3>
              <button onClick={() => setShowAddForm(false)} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className={`${mobile ? "px-4 grid-cols-1" : "px-6 grid-cols-2"} py-5 grid gap-4`}>
              {[
                {label:"차량번호 *", key:"차량번호", placeholder:"예: 서울12가3456", border:"border-[#1B2B4B]"},
                {label:"이름", key:"이름", placeholder:"기사명"},
                {label:"전화번호", key:"전화번호", placeholder:"010-0000-0000"},
                {label:"메모", key:"메모", placeholder:"메모"},
              ].map(({label,key,placeholder,border}) => (
                <div key={key}>
                  <label className="text-[11px] font-semibold text-gray-500 mb-1 block"><EditableText id={`driver.addForm.label.${key}`} defaultText={label} /></label>
                  <input autoComplete="off"
                    className={`border-2 ${border||"border-gray-200"} rounded-lg px-3 py-2 w-full text-[13px] outline-none focus:border-[#1B2B4B]`}
                    placeholder={placeholder}
                    value={newForm[key]}
                    onChange={e => setNewForm(p => ({
                      ...p,
                      [key]: key==="전화번호" ? formatPhone(e.target.value) : e.target.value
                    }))}
                  />
                </div>
              ))}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 mb-1 block"><EditableText id="driver.addForm.label.등급" defaultText="등급" /></label>
                <CustomSelect className="border-2 border-gray-200 rounded-lg px-3 py-2 w-full text-[13px] outline-none focus:border-[#1B2B4B]"
                  value={newForm.등급} onChange={e=>setNewForm(p=>({...p,등급:e.target.value}))}>
                  <option value="일반">일반</option>
                  <option value="지입">지입</option>
                  <option value="직영">직영</option>
                  <option value="임대">임대</option>
                  {extraFleet.map((g) => <option key={g} value={g}>{g}</option>)}
                  <option value="블랙">블랙</option>
                </CustomSelect>
              </div>
              {/* 지입/직영 기사 전용 — 거주지 / 근무가능요일 (노선관리 관제에 연동) */}
              {isFleetGrade(newForm.등급) && (
                <>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 mb-1 block"><EditableText id="driver.addForm.label.거주지" defaultText="거주지" /></label>
                    <input autoComplete="off"
                      className="border-2 border-gray-200 rounded-lg px-3 py-2 w-full text-[13px] outline-none focus:border-[#1B2B4B]"
                      placeholder="예: 경기 김포시"
                      value={newForm.거주지}
                      onChange={e => setNewForm(p => ({ ...p, 거주지: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 mb-1 block">차량종류</label>
                    {/* ⭐ 2026-11-02 차량종류 "직접입력" — 고르면 글자 칸이 열려 직접 적는다 */}
                    <DriverVehicleTypeField className="border-2 border-gray-200 rounded-lg px-3 py-2 w-full text-[13px] outline-none focus:border-[#1B2B4B]"
                      value={newForm.차량종류 || ""} onChange={(v) => setNewForm(p => ({ ...p, 차량종류: v }))} />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 mb-1 block">톤수</label>
                    <CustomSelect className="border-2 border-gray-200 rounded-lg px-3 py-2 w-full text-[13px] outline-none focus:border-[#1B2B4B]"
                      value={newForm.차량톤수 || ""} onChange={e => setNewForm(p => ({ ...p, 차량톤수: e.target.value }))}>
                      <option value="">선택</option>
                      {CARGO_VEHICLE_SPEC_TABLE.map(v => v.name).map(t => <option key={t} value={t}>{t}</option>)}
                    </CustomSelect>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 mb-1 block">요청사항</label>
                    <input autoComplete="off"
                      className="border-2 border-gray-200 rounded-lg px-3 py-2 w-full text-[13px] outline-none focus:border-[#1B2B4B]"
                      value={newForm.요청사항 || ""}
                      onChange={e => setNewForm(p => ({ ...p, 요청사항: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 mb-1 block">담당자</label>
                    <CustomSelect className="border-2 border-gray-200 rounded-lg px-3 py-2 w-full text-[13px] outline-none focus:border-[#1B2B4B]"
                      value={newForm.담당자?.uid || ""}
                      onChange={e => {
                        const s = companyStaff.find(x => x.id === e.target.value);
                        setNewForm(p => ({ ...p, 담당자: s ? { uid: s.id, name: s.name } : null }));
                      }}>
                      <option value="">미지정</option>
                      {companyStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </CustomSelect>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[11px] font-semibold text-gray-500 mb-1 block"><EditableText id="driver.addForm.label.근무가능요일" defaultText="근무가능요일" /></label>
                    <div className="flex gap-1.5">
                      {WEEKDAYS.map(d => {
                        const on = (newForm.근무요일 || []).includes(d);
                        return (
                          <button key={d} type="button"
                            onClick={() => setNewForm(p => {
                              const cur = p.근무요일 || [];
                              return { ...p, 근무요일: cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d] };
                            })}
                            className={`w-9 h-9 rounded-lg text-[12px] font-bold border transition ${on ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-500 border-gray-200 hover:border-[#1B2B4B]"}`}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={()=>setShowAddForm(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"><EditableText id="driver.addForm.취소" defaultText="취소" /></button>
              <button onClick={addNew} className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition"><EditableText id="driver.addForm.등록" defaultText="등록" /></button>
            </div>
          </div>
        </div>
      )}

      {/* 결과 (검색은 위 검색바) */}
      <div className="flex flex-col gap-4">
        {/* ───────── 오른쪽: 검색 결과 ───────── */}
        <div className="min-w-0">
          {/* 미조회 상태 */}
          {!showAll && !searched && (
            <div className="relative overflow-hidden rounded-[22px] flex flex-col items-center justify-center py-20 text-white" style={{ background: "radial-gradient(90% 80% at 50% 0%, #22396A 0%, #0F1A30 60%, #0B1428 100%)" }}>
              <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "28px 28px" }} />
              <div className="relative text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0] mb-2" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>DRIVER SEARCH</div>
              <div className="relative text-[16px] font-black">위 검색바에 차량번호·기사명·연락처를 입력하세요</div>
              <div className="relative text-[13px] text-white/55 mt-1">숫자 타일을 누르면 등급별 기사님이 바로 보입니다</div>
            </div>
          )}

          {/* 테이블 */}
          {mgrMenu && (
            <div data-mgr-menu="1" style={{ position: "fixed", left: mgrMenu.left, top: mgrMenu.top, width: 240, zIndex: 99990 }}
              className="rounded-2xl bg-white border border-[#E3E8F0] shadow-[0_18px_44px_rgba(15,26,48,0.22)] overflow-hidden">
              <div className="px-3.5 pt-2.5 pb-2 border-b border-[#EEF2F7] bg-[#F7F9FC]">
                <div className="flex items-baseline gap-1.5"><span className="text-[14px] font-black text-[#0F1A30]">담당자별 보기</span><span className="text-[10.5px] font-extrabold tracking-[0.12em] text-[#4B6CB7]">MANAGER</span></div>
                <div className="text-[12.5px] font-bold text-[#5B6B85] mt-0.5">고른 담당자의 차량이 맨 위로 모입니다</div>
              </div>
              <div className="max-h-[300px] overflow-y-auto py-1">
                <button type="button" onClick={() => { setMgrFocus(""); setMgrMenu(null); }}
                  className={`w-[calc(100%-8px)] mx-1 px-2.5 h-9 rounded-xl flex items-center text-[13px] font-bold hover:bg-[#EEF3FC] ${!mgrFocus ? "text-[#1B2B4B]" : "text-[#8E9BB2]"}`}>기본 순서{!mgrFocus ? " ✓" : ""}</button>
                {mgrCounts.length === 0 && <div className="px-3.5 py-3 text-[12px] font-bold text-[#9AA9C3]">담당자가 지정된 차량이 없습니다 (지입·직영·임대)</div>}
                {mgrCounts.map(([n, c]) => (
                  <button key={n} type="button" onClick={() => { setMgrFocus(f => f === n ? "" : n); setMgrMenu(null); }}
                    className={`w-[calc(100%-8px)] mx-1 px-2.5 h-10 rounded-xl flex items-center gap-2 hover:bg-[#EEF3FC] ${mgrFocus === n ? "bg-[#FFF8E6]" : ""}`}>
                    <span className="w-7 h-7 rounded-full grid place-items-center bg-[#1B2B4B] text-white text-[11.5px] font-black shrink-0">{n.slice(0, 1)}</span>
                    <span className="flex-1 text-left text-[13.5px] font-extrabold text-[#0F1A30] truncate">{n}</span>
                    <span className="tabular-nums px-2 h-[22px] inline-flex items-center rounded-full bg-[#EEF3FC] text-[#2D4C82] text-[11.5px] font-black">{c}대</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* ⭐ 2026-11-06 모바일 — 카드 목록(누르면 상세 시트 · 수정·전화·앱 안내·삭제) */}
          {mobile && (showAll || searched) && (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 px-1 text-[14px] font-bold text-[#3A4A66]">
                <input type="checkbox" className="w-5 h-5" onChange={toggleAll} checked={filtered.length > 0 && selected.size === filtered.length} />
                전체 선택
              </label>
              {paged.length === 0 && <div className="rounded-[18px] bg-white border border-[#E3E8F0] py-14 text-center text-[14px] font-bold text-[#5B6B85]">{q.trim() ? "검색 결과가 없습니다." : "데이터가 없습니다."}</div>}
              {paged.map((r) => {
                const g = r.등급 || "일반";
                const fleet = isFleetGrade(g);
                const on = selected.has(r.id);
                const sent = guideSentLabel(r);
                return (
                  <div key={r.id} role="button" tabIndex={0} onClick={() => setMSheet(r)}
                    className={`rounded-[18px] bg-white border px-3.5 py-3 ${on ? "border-[#2D4C82] ring-2 ring-[#2D4C82]/20" : g === "블랙" ? "border-gray-300 bg-gray-50" : "border-[#E3E8F0]"}`}>
                    <div className="flex items-center gap-2.5">
                      <input type="checkbox" className="w-5 h-5 shrink-0" checked={on} onClick={(e) => e.stopPropagation()} onChange={() => toggleOne(r.id)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[16px] font-black text-[#0F1A30] break-all">{r.차량번호 || "-"}</span>
                          <span className="text-[15px] font-bold text-[#0F1A30] break-all">{r.이름 || "-"}</span>
                          <span className={`px-2 py-0.5 rounded-lg text-[14px] font-bold ${gradeBadge(g)}`}>{g}</span>
                        </div>
                        <div className="mt-0.5 text-[14px] text-[#5B6B85] break-words">
                          {formatPhone(r.전화번호) || "번호 없음"}{(r.차량톤수 || r.차량종류) ? ` · ${[r.차량톤수, r.차량종류].filter(Boolean).join(" ")}` : ""}{fleet && r.담당자?.name ? ` · 담당 ${r.담당자.name}` : ""}
                        </div>
                        {(r.메모 || sent) && <div className="mt-0.5 text-[14px] text-[#3A4A66] break-words">{r.메모 ? `메모 ${r.메모}` : ""}{r.메모 && sent ? " · " : ""}{sent ? `앱 안내 ${sent}` : ""}</div>}
                      </div>
                      <svg className="shrink-0 text-[#9AA9C3]" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m9 6 6 6-6 6" /></svg>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {mobile && mSheet && (() => {
            const r = drivers.find((d) => d.id === mSheet.id) || mSheet;
            const g = r.등급 || "일반";
            const fleet = isFleetGrade(g);
            const ph = String(r.전화번호 || "").replace(/\D/g, "");
            const rows = [["차량번호", r.차량번호], ["이름", r.이름], ["전화번호", formatPhone(r.전화번호)], ["등급", g], ["차량", [r.차량톤수, r.차량종류].filter(Boolean).join(" ")], ["등록일", displayRegDate(r)],
              ...(fleet ? [["담당자", r.담당자?.name], ["거주지", r.거주지], ["근무요일", Array.isArray(r.근무요일) ? r.근무요일.join(",") : ""], ["요청사항", r.요청사항]] : []),
              ["메모", r.메모], ["메모 팝업", (r.메모 || "").trim() ? (g === "블랙" || r.팝업표시 === true ? "ON" : "OFF") : ""], ["앱 안내", guideSentLabel(r)]].filter(([, v]) => String(v || "").trim());
            return mPop(
              <div className="fixed inset-0 z-[99990] bg-[#0B1428]/50 flex items-end" onClick={() => setMSheet(null)}>
                <div className="w-full max-h-[88vh] overflow-y-auto rounded-t-[22px] bg-white" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-4 text-white flex items-start gap-3" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-extrabold tracking-[0.14em] text-[#8FB0F0]">DRIVER</div>
                      <div className="text-[19px] font-black break-all">{r.차량번호 || "-"} · {r.이름 || "-"}</div>
                    </div>
                    <button type="button" onClick={() => setMSheet(null)} className="h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black shrink-0">닫기</button>
                  </div>
                  <div className="px-4 py-3 divide-y divide-[#EEF1F6]">
                    {rows.map(([k, v]) => (
                      <div key={k} className="py-2 flex gap-3"><span className="w-[78px] shrink-0 text-[14px] font-bold text-[#5B6B85]">{k}</span><span className="flex-1 min-w-0 text-[15px] font-bold text-[#0F1A30] break-words whitespace-pre-wrap">{v}</span></div>
                    ))}
                  </div>
                  <div className="kp-sheet-grid px-4 pb-24 pt-1 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => { setMSheet(null); setEditDriverModal({ ...r }); }} className="h-12 rounded-2xl text-white text-[15px] font-black" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>수정</button>
                    <button type="button" onClick={() => { setMSheet(null); setGuideFor([r]); }} className="h-12 rounded-2xl bg-[#EEF3FC] border border-[#C9D6EE] text-[#1B2B4B] text-[15px] font-black">앱 안내 보내기</button>
                    {ph ? <a href={`tel:${ph}`} className="h-12 rounded-2xl bg-white border border-[#DCE3EE] text-[#0F1A30] text-[15px] font-black flex items-center justify-center">전화</a> : <span className="h-12 rounded-2xl bg-[#F3F6FA] text-[#9AA9C3] text-[15px] font-black flex items-center justify-center">번호 없음</span>}
                    <button type="button" onClick={async () => { if (!await kpConfirm(`${r.이름 || r.차량번호} 기사님을 삭제할까요?`)) return; setMSheet(null); await removeDriver(r.id); }} className="h-12 rounded-2xl bg-white border border-[#0F1A30] text-[#0F1A30] text-[15px] font-black">삭제</button>
                  </div>
                </div>
              </div>
            );
          })()}
          {!mobile && (showAll || searched) && (
            <div className="bg-white rounded-[22px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_30px_rgba(16,24,40,0.07)] overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-[#1B2B4B]">
                    <th className="px-3 py-3 text-white text-center w-10">
                      <input autoComplete="off"
                        type="checkbox"
                        onChange={toggleAll}
                        checked={filtered.length > 0 && selected.size === filtered.length}
                      />
                    </th>
                    {[["순번",""],["담당자",""],["차량번호","w-[92px]"],["차량종류",""],["이름",""],["전화번호",""],["사업자번호",""],["정산계좌",""],["등록일",""],["거주지",""],["근무가능요일",""],["등급",""],["메모",""],["팝업",""],["삭제",""]].map(([h,w]) => (
                      h === "담당자" ? (
                        <th key={h} className={`px-2 py-2 text-white font-bold text-center whitespace-nowrap ${w}`}>
                          {/* ⭐ 2026-11-02 누르면 담당자 목록 — 고른 담당자의 차량이 맨 위로 */}
                          <button type="button" data-mgr-menu="1"
                            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMgrMenu(m => m ? null : { left: Math.min(r.left, window.innerWidth - 248), top: r.bottom + 6 }); }}
                            className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full transition ${mgrFocus ? "bg-[#E9C46A] text-[#0F1A30]" : "hover:bg-white/10"}`}
                            title="담당자별로 모아 보기">
                            {mgrFocus ? `담당 ${mgrFocus}` : <EditableText id={`driver.table.header.${h}`} defaultText={h} />}
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                          </button>
                        </th>
                      ) : (
                      <SortTh key={h} k={h === "삭제" ? "" : h} sort={drvSort.sort} onSort={drvOnSort} className={`px-3 py-3 text-white font-bold text-center whitespace-nowrap ${w}`}><EditableText id={`driver.table.header.${h}`} defaultText={h} /></SortTh>
                      )
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.length === 0 ? (
                    <tr>
                      <td colSpan={16} className="text-center py-16 text-gray-500 text-[14px]">
                        {q.trim() ? "검색 결과가 없습니다." : "데이터가 없습니다."}
                      </td>
                    </tr>
                  ) : paged.map((r, i) => {
                    const docId = r.id;
                    if (!docId) return null;
                    const grade = r.등급 || "일반";
                    const memoPopupOn = grade === "블랙" ? !!(r.메모 && String(r.메모).trim()) : r.팝업표시 === true;
                    const mgrHit = !!mgrFocus && mgrOf(r) === mgrFocus;
                    const mgrLast = mgrHit && !(paged[i + 1] && mgrOf(paged[i + 1]) === mgrFocus);
                    return (
                      <tr key={`${docId}_${i}`}
                        className={`transition hover:bg-blue-50/40 cursor-pointer ${mgrLast ? "border-b-2 border-[#1B2B4B]/30" : "border-b border-gray-100"} ${mgrHit ? "kp-row-hit" : grade==="블랙" ? "bg-gray-100" : i%2===0 ? "bg-white" : "bg-gray-50/50"}`}
                        onDoubleClick={() => setEditDriverModal({ ...r })}
                        onContextMenu={(e) => {
                          // 🖱 2026-11-10 오른쪽 클릭 — 체크한 기사 위에서 누르면 체크한 기사 전부, 아니면 이 기사만
                          e.preventDefault();
                          const _z = parseFloat(document.getElementById("root")?.style.zoom) || 1;
                          const rows = selected.has(docId) && selected.size > 1 ? selectedInOrder() : [r];
                          setDrvCtx({ x: e.clientX / _z, y: e.clientY / _z, rows });
                        }}>
                        <td className="px-3 py-2.5 text-center" style={mgrHit ? { boxShadow: "inset 4px 0 0 #E9C46A" } : undefined}>
                          <input autoComplete="off" type="checkbox" checked={selected.has(docId)} onChange={(e) => { e.stopPropagation(); toggleOne(docId); }} onClick={e => e.stopPropagation()} />
                        </td>
                        <td className="px-3 py-2.5 text-center text-gray-500">{(page-1)*perPage+i+1}</td>
                        <td className={`px-3 py-2.5 text-center whitespace-nowrap ${mgrHit ? "font-black text-[#0F1A30]" : "text-gray-500"}`}>{(grade==="지입"||grade==="직영"||grade==="임대") ? (r.담당자?.name || "-") : "-"}</td>
                        <td className="px-2 py-2.5 text-center font-semibold text-[#1B2B4B] whitespace-nowrap w-[92px] overflow-hidden text-ellipsis">{r.차량번호||"-"}</td>
                        <td className="px-2 py-2.5 text-center whitespace-nowrap"><VehicleTypeBadge type={r.차량종류} ton={r.차량톤수} /></td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">{r.이름||"-"}</td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">{formatPhone(r.전화번호)||"-"}</td>
                        {/* 💳 2026-11-20 정산정보 — 사업자번호 · 은행 계좌(예금주는 마우스를 올리면 · 상호도) */}
                        <td className="px-2 py-2.5 text-center whitespace-nowrap text-[12px] text-gray-600" style={{ fontVariantNumeric: "tabular-nums" }} title={[r.사업자상호, r.사업자대표].filter(Boolean).join(" · ") || undefined}>{r.사업자번호 ? fmtBizNo(r.사업자번호) : "-"}</td>
                        <td className="px-2 py-2.5 text-center whitespace-nowrap text-[12px] text-gray-600" style={{ fontVariantNumeric: "tabular-nums" }} title={r.정산계좌?.holder ? `예금주 ${r.정산계좌.holder}` : undefined}>
                          {r.정산계좌?.acct ? <><span className="font-bold text-[#1B2B4B]">{r.정산계좌.bank || ""}</span> {fmtAcctByBank(r.정산계좌.bank, r.정산계좌.acct)}{r.정산계좌.holder ? <span className="text-gray-400"> · {r.정산계좌.holder}</span> : null}</> : "-"}
                        </td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap text-gray-500 text-[12px]">{displayRegDate(r) || "-"}</td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap text-gray-500">{(grade==="지입"||grade==="직영"||grade==="임대") ? (r.거주지 || "-") : "-"}</td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap text-gray-500 text-[12px]">{(grade==="지입"||grade==="직영"||grade==="임대") ? (Array.isArray(r.근무요일) && r.근무요일.length ? r.근무요일.join(",") : (typeof r.근무요일 === "string" && r.근무요일.trim()) || "-") : "-"}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2.5 py-1 rounded-lg text-[12px] font-bold ${gradeBadge(grade)}`}>{grade}</span>
                        </td>
                        <td className="px-2 py-2.5 text-center max-w-[200px]">
                          {(r.메모 || "").length > 18 ? (
                            <span className="text-[13px] text-gray-500">
                              {(r.메모 || "").slice(0, 18)}…
                            </span>
                          ) : (
                            <span className="text-[13px] text-gray-500">{r.메모 || ""}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {(r.메모 || "").trim() && (
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${memoPopupOn ? "bg-[#1B2B4B] text-white" : "bg-gray-100 text-gray-500"}`}>
                              {memoPopupOn ? "ON" : "OFF"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          {/* ⭐ 2026-11-06 지입·직영·임대 기사님 — 기사앱 안내 보내기(보낸 시각은 마우스를 올리면) */}
                          {(grade==="지입"||grade==="직영"||grade==="임대") && (
                            <button type="button" title={guideSentLabel(r) ? `지난 안내 ${guideSentLabel(r)}` : "기사앱 설치 안내 보내기"}
                              className={`mr-1 px-2.5 py-1 rounded-lg text-[12px] font-bold border transition ${guideSentLabel(r) ? "bg-[#EEF3FC] border-[#C9D6EE] text-[#1B2B4B]" : "bg-white border-[#2D4C82] text-[#1B2B4B] hover:bg-[#EEF3FC]"}`}
                              onClick={(e) => { e.stopPropagation(); setGuideFor([r]); }}>{guideSentLabel(r) ? "안내 보냄" : "앱 안내"}</button>
                          )}
                          <button
                            className="px-3 py-1 rounded-lg bg-red-600 text-white text-[11px] font-bold hover:bg-red-700 transition"
                            onClick={async (e)=>{ e.stopPropagation(); if (await kpConfirm("이 기사를 삭제할까요?", { title: "기사 삭제", okText: "삭제", danger: true })) removeDriver(docId); }}>
                            삭제
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* 페이지네이션 — 표 아래 */}
          {(showAll || searched) && totalPages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <button disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition ${page===1 ? "bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed" : "bg-white text-[#1B2B4B] border-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white"}`}>
                이전
              </button>
              <span className="text-[12px] font-semibold text-gray-600 whitespace-nowrap">
                {page} <span className="text-gray-500">/ {totalPages}</span>
              </span>
              <button disabled={page===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition ${page===totalPages ? "bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed" : "bg-white text-[#1B2B4B] border-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white"}`}>
                다음
              </button>
            </div>
          )}
        </div>
      </div>

      {guideFor && <DriverGuideSendModal drivers={guideFor} company={userCompany} onClose={() => setGuideFor(null)} />}
      {/* ⭐ 2026-11-11 차량 변경 창 — 끝나면 수정 팝업의 값도 새 차량으로 맞춘다(저장 때 예전 번호로 덮어쓰지 않게) */}
      {vehicleChangeFor && mPop(
        <DriverVehicleChangeModal driver={vehicleChangeFor} onClose={() => setVehicleChangeFor(null)}
          onDone={(patch, r) => {
            setEditDriverModal(p => (p && p.id === vehicleChangeFor.id ? { ...p, ...patch } : p));
            setVehicleChangeFor(null);
            showAlert(`차량을 ${patch.차량번호}(으)로 바꿨습니다.${r?.holder ? `\n${r.holder.name || "기존"} 기사님은 ${r.holder.carNo || "차량미배정"}(으)로 바뀌었습니다.` : ""}${r?.account ? "\n기사님 폰은 로그아웃되지 않습니다. 다음 로그인은 휴대폰번호로 하면 됩니다." : ""}`);
          }} />
      )}
      {/* ⭐ 2026-11-11 기사 합치기(최고관리자) — 같은 기사 두 줄을 하나로. 끝나면 수정 팝업의 차량이력을 맞춘다 */}
      {mergeFor && isTotalMasterUser && mPop(
        <DriverMergeModal driver={mergeFor} drivers={driversRaw} onClose={() => setMergeFor(null)}
          onDone={(patch, old) => {
            setEditDriverModal(p => (p && p.id === mergeFor.id ? { ...p, ...patch } : p));
            setMergeFor(null);
            showAlert(`${old?.이름 || ""} · ${old?.차량번호 || ""} 줄을 합쳤습니다.\n예전 차량 배차기록은 그대로 남고, 정산은 이 기사로 묶입니다.`);
          }} />
      )}
      {/* ===== 기사 수정 팝업 (더블클릭) ===== */}
      {editDriverModal && mPop(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40">
          <div className={`bg-white rounded-2xl shadow-2xl ${isFleetGrade(editDriverModal.등급) ? "w-[640px]" : "w-[480px]"} max-w-[96vw] max-h-[92vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 flex items-center justify-between sticky top-0 z-10" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
              <h3 className="text-white font-bold text-[15px]">기사 수정 · {editDriverModal.차량번호}{isFleetGrade(editDriverModal.등급) ? <span className="ml-2 px-2 py-0.5 rounded-md bg-white/15 text-[11.5px] font-black">{editDriverModal.등급}</span> : null}</h3>
              <div className="flex items-center gap-2">
                {/* ⭐ 2026-11-09 차량관리로 바로 가기 — 지입차관리 › 차량 관리에서 이 차량 정보를 연다 */}
                {String(editDriverModal.차량번호 || "").trim() && (
                  <button type="button" title="지입차관리 › 차량 관리에서 이 차량 정보 열기"
                    onClick={() => {
                      const plate = String(editDriverModal.차량번호 || "").trim();
                      setEditDriverModal(null);
                      window.__kpVlOpenPlate = plate;
                      try { sessionStorage.setItem("fm_tab", JSON.stringify("vehicle")); } catch { /* 무시 */ }
                      window.dispatchEvent(new CustomEvent("kp-go-menu", { detail: "지입차관리" }));
                      setTimeout(() => { window.dispatchEvent(new Event("kp-fm-vehicle")); window.dispatchEvent(new Event("kp-vl-open")); }, 60);
                    }}
                    className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 border border-white/25 text-white text-[12.5px] font-bold whitespace-nowrap inline-flex items-center gap-1.5"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1" y="6" width="14" height="10" rx="1.5" /><path d="M15 10h4l3 3v3h-7z" /><circle cx="6" cy="18" r="1.8" /><circle cx="18" cy="18" r="1.8" /></svg>차량관리</button>
                )}
                {/* ⭐ 2026-11-11 기사 합치기 — 최고관리자에게만 보인다(같은 기사가 두 줄일 때) */}
                {isTotalMasterUser && editDriverModal.id && (
                  <button type="button" data-testid="open-driver-merge" title="같은 기사가 두 줄일 때 하나로 합치기(최고관리자)" onClick={() => setMergeFor(editDriverModal)}
                    className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 border border-white/25 text-white text-[12.5px] font-bold whitespace-nowrap">기사 합치기</button>
                )}
                <button onClick={() => setEditDriverModal(null)} className="text-white/60 hover:text-white text-xl">✕</button>
              </div>
            </div>
            <div className={`${mobile ? "px-4 grid-cols-1" : "px-6 grid-cols-2"} py-5 grid gap-4`}>
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">차량번호 *</label>
                {/* ⭐ 2026-11-11 기사앱 가입 기사 · 지입/직영/임대 기사는 [차량 변경]으로 바꾼다 — 로그인 계정·차량이력(정산)이 같이 맞춰진다.
                    (예전엔 여기서 번호만 고치면 기사앱은 예전 차량번호로만 로그인되고 정산도 차량번호별로 갈렸다) */}
                {(editDriverModal.uid || isFleetGrade(editDriverModal.등급)) ? (
                  <div className="flex gap-2">
                    <input readOnly className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full min-w-0 bg-gray-50 text-gray-700 font-bold outline-none"
                      value={editDriverModal.차량번호 || "차량미배정"} />
                    <button type="button" data-testid="open-vehicle-change" onClick={() => setVehicleChangeFor(editDriverModal)}
                      className="shrink-0 h-[38px] px-3 rounded-lg text-white text-[12.5px] font-bold whitespace-nowrap" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>차량 변경</button>
                  </div>
                ) : (
                  <input autoComplete="off" className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none"
                    value={editDriverModal.차량번호||""}
                    onChange={(e) => setEditDriverModal(p => ({ ...p, 차량번호: e.target.value }))} />
                )}
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">이름</label>
                <input autoComplete="off" className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none"
                  value={editDriverModal.이름||""}
                  onChange={(e) => setEditDriverModal(p => ({ ...p, 이름: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">전화번호</label>
                <input autoComplete="off" className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none"
                  value={formatPhone(editDriverModal.전화번호)||""}
                  onChange={(e) => setEditDriverModal(p => ({ ...p, 전화번호: e.target.value.replace(/[^\d]/g,"") }))} />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">등급</label>
                <CustomSelect className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none bg-white"
                  value={editDriverModal.등급||"일반"}
                  onChange={(e) => setEditDriverModal(p => ({ ...p, 등급: e.target.value }))}>
                  <option value="일반">일반</option>
                  <option value="지입">지입</option>
                  <option value="직영">직영</option>
                  <option value="임대">임대</option>
                  {extraFleet.map((g) => <option key={g} value={g}>{g}</option>)}
                  <option value="블랙">블랙</option>
                </CustomSelect>
              </div>
              {/* 지입/직영 기사 전용 — 거주지 / 근무가능요일 (노선관리 관제에 연동) */}
              {isFleetGrade(editDriverModal.등급) && (
                <>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1">거주지</label>
                    <input autoComplete="off" className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none"
                      placeholder="예: 경기 김포시"
                      value={editDriverModal.거주지||""}
                      onChange={(e) => setEditDriverModal(p => ({ ...p, 거주지: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1">차량종류</label>
                    {/* ⭐ 2026-11-02 차량종류 "직접입력" — 고르면 글자 칸이 열려 직접 적는다 */}
                    <DriverVehicleTypeField className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none bg-white"
                      value={editDriverModal.차량종류||""}
                      onChange={(v) => setEditDriverModal(p => ({ ...p, 차량종류: v }))} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1">톤수</label>
                    <CustomSelect className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none bg-white"
                      value={editDriverModal.차량톤수||""}
                      onChange={(e) => setEditDriverModal(p => ({ ...p, 차량톤수: e.target.value }))}>
                      <option value="">선택</option>
                      {CARGO_VEHICLE_SPEC_TABLE.map(v => v.name).map(t => <option key={t} value={t}>{t}</option>)}
                    </CustomSelect>
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1">요청사항</label>
                    <input autoComplete="off" className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none"
                      value={editDriverModal.요청사항||""}
                      onChange={(e) => setEditDriverModal(p => ({ ...p, 요청사항: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1">담당자</label>
                    <CustomSelect className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none bg-white"
                      value={editDriverModal.담당자?.uid || ""}
                      onChange={(e) => {
                        const s = companyStaff.find(x => x.id === e.target.value);
                        setEditDriverModal(p => ({ ...p, 담당자: s ? { uid: s.id, name: s.name } : null }));
                      }}>
                      <option value="">미지정</option>
                      {companyStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </CustomSelect>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1">근무가능요일</label>
                    <div className="flex gap-1.5">
                      {WEEKDAYS.map(d => {
                        const on = (editDriverModal.근무요일 || []).includes(d);
                        return (
                          <button key={d} type="button"
                            onClick={() => setEditDriverModal(p => {
                              const cur = Array.isArray(p.근무요일) ? p.근무요일 : String(p.근무요일 || "").split(/[,\s·]+/).filter(Boolean);
                              return { ...p, 근무요일: cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d] };
                            })}
                            className={`w-9 h-9 rounded-lg text-[12px] font-bold border transition ${on ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-500 border-gray-200 hover:border-[#1B2B4B]"}`}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <FleetExtraFields value={editDriverModal} onChange={setEditDriverModal} company={userCompany} />
                </>
              )}
              {/* 💳 2026-11-20 용차 기사 정산정보(지입 · 직영 · 임대는 위 지입 기본정보 칸에 있음) */}
              {!isFleetGrade(editDriverModal.등급) && <DriverPayFields value={editDriverModal} onChange={setEditDriverModal} />}
              {/* ⭐ 2026-11-07 세금계산서 발행 기사 — 켜면 이 기사 운임의 10%를 회계관리 예상 부가세의 매입세액으로 뺀다 */}
              <div className="col-span-2 flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                <div>
                  <div className="text-[13px] font-semibold text-gray-700">세금계산서 발행 기사</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">운임을 줄 때 세금계산서를 받는 기사예요. 회계관리 예상 부가세의 매입세액에 들어가요</div>
                </div>
                <button type="button" role="switch" aria-checked={editDriverModal.세금계산서발행 === true} data-testid="driver-tax-invoice"
                  onClick={() => setEditDriverModal(p => ({ ...p, 세금계산서발행: p.세금계산서발행 !== true }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${editDriverModal.세금계산서발행 === true ? "bg-[#1B2B4B]" : "bg-gray-300"}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editDriverModal.세금계산서발행 === true ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              <div className="col-span-2">
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">메모</label>
                <input autoComplete="off" className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none"
                  value={editDriverModal.메모||""}
                  onChange={(e) => setEditDriverModal(p => ({ ...p, 메모: e.target.value }))} />
              </div>
              {(editDriverModal.메모||"").trim() && (
                editDriverModal.등급 === "블랙" ? (
                  <div className="col-span-2 flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                    <div>
                      <div className="text-[13px] font-semibold text-gray-700">등록 시 메모/등급 팝업 표시</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">블랙 등급은 메모가 있으면 항상 켜져 있으며 끌 수 없습니다</div>
                    </div>
                    <span className="relative inline-flex h-6 w-11 items-center rounded-full bg-[#1B2B4B] shrink-0">
                      <span className="inline-block h-4 w-4 translate-x-6 transform rounded-full bg-white" />
                    </span>
                  </div>
                ) : (
                  <div className="col-span-2 flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                    <div>
                      <div className="text-[13px] font-semibold text-gray-700">등록 시 메모/등급 팝업 표시</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">켜두면 이 기사를 어디서 선택하든 메모 안내 팝업이 뜹니다 (기본값: 꺼짐)</div>
                    </div>
                    <button type="button"
                      onClick={() => setEditDriverModal(p => ({ ...p, 팝업표시: p.팝업표시 === true ? false : true }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${editDriverModal.팝업표시 === true ? "bg-[#1B2B4B]" : "bg-gray-300"}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editDriverModal.팝업표시 === true ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>
                )
              )}
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => setEditDriverModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"><EditableText id="misc.btn.53340.취소" defaultText="취소" /></button>
              <button onClick={saveEditDriver}
                className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition"><EditableText id="misc.btn.53342.저장" defaultText="저장" /></button>
            </div>
          </div>
        </div>
      )}

      {/* 🖱 2026-11-10 기사 오른쪽 클릭 메뉴 · 복사 알림 */}
      {drvCtx && (
        <DriverContextMenu x={drvCtx.x} y={drvCtx.y} rows={drvCtx.rows} readOnly={false /* 조회전용은 upsertDriverSafe · removeDriverSafe가 막는다 */} onClose={() => setDrvCtx(null)}
          onCopied={(ok, t, label) => setDrvToast(ok ? `복사했습니다 · ${label}${drvCtx.rows.length > 1 ? ` ${drvCtx.rows.length}명` : ""}` : "복사하지 못했어요")}
          onEdit={(r) => setEditDriverModal({ ...r })}
          onGuide={(rows) => setGuideFor(rows)}
          onGrade={async (rows, g) => {
            if (!(await kpConfirm(rows.length > 1 ? `${rows.length}명의 등급을 「${g}」(으)로 바꿀까요?` : "수정하시겠습니까?", { okText: rows.length > 1 ? "확인" : "저장" }))) return; // ✅ 2026-11-23 한 명일 때도 묻기
            for (const r of rows) { const { vehicle: _v, care: _c, careLogs: _cl, ...rest } = r; await upsertDriver({ ...rest, 등급: g, ...(g === "블랙" ? { 팝업표시: true } : {}) }); }
            setDrvToast(`등급을 「${g}」(으)로 바꿨습니다${rows.length > 1 ? ` · ${rows.length}명` : ""}`);
          }}
          onDelete={async (rows) => {
            if (!(await kpConfirm(`${rows.length > 1 ? `${rows.length}명을` : `${rows[0]?.차량번호 || ""} ${rows[0]?.이름 || ""} 기사를`} 삭제할까요?`))) return;
            await removeDriver(rows.map((r) => r.id));
            setSelected((prev) => { const n = new Set(prev); rows.forEach((r) => n.delete(r.id)); return n; });
          }} />
      )}
      {drvToast && <div data-kp="drv-toast" className="fixed left-1/2 -translate-x-1/2 bottom-8 z-[999999] px-4 h-11 rounded-xl bg-[#0F1A30] text-white text-[14px] font-bold flex items-center gap-2 shadow-[0_12px_30px_rgba(11,20,40,0.35)]"><span className="w-1.5 h-1.5 rounded-full bg-[#8FB0F0]" />{drvToast}</div>}

      {/* ===== 기사정리 팝업 ===== */}
      {cleanupOpen && mPop(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-[820px] max-w-[96vw] max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-white font-bold text-[16px]"><EditableText id="driver.cleanup.title" defaultText="기사정리" /></h3>
                <p className="text-white/50 text-[12px] mt-0.5"><EditableText id="driver.cleanup.subtitle" defaultText="연락처 정규화 및 중복 기사 통합 관리" /></p>
              </div>
              <button onClick={() => setCleanupOpen(false)} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
            </div>
            {/* 탭 */}
            <div className="flex border-b border-gray-200 shrink-0">
              {["연락처정규화","중복기사정리"].map(tab => (
                <button key={tab} onClick={() => { setCleanupTab(tab); setCleanupQ(""); setCleanupQField("전체"); setCleanupSelected(new Set()); setCleanupDone(false); }}
                  className={`px-6 py-3 text-[13px] font-bold transition border-b-2 ${cleanupTab === tab ? "border-[#1B2B4B] text-[#1B2B4B]" : "border-transparent text-gray-500 hover:text-gray-600"}`}>
                  <EditableText id={`driver.cleanup.tab.${tab}`} defaultText={tab} />
                </button>
              ))}
            </div>
            {/* 검색바 */}
            <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center border-2 border-[#1B2B4B] rounded-lg overflow-hidden h-[34px] max-w-full">
                <CustomSelect className="px-2 h-full text-[13px] bg-[#1B2B4B]/5 border-r border-[#1B2B4B]/30 outline-none text-[#1B2B4B] font-semibold"
                  value={cleanupQField} onChange={e => setCleanupQField(e.target.value)}>
                  <option value="전체">전체</option>
                  <option value="차량번호">차량번호</option>
                  <option value="기사명">기사명</option>
                  <option value="연락처">연락처</option>
                </CustomSelect>
                <input autoComplete="off" className="px-3 h-full text-[13px] w-44 min-w-0 outline-none"
                  placeholder="검색어 입력..."
                  value={cleanupQ}
                  onChange={e => setCleanupQ(e.target.value)} />
              </div>
              {cleanupTab === "연락처정규화" && phoneNormTargets.length > 0 && (
                <button
                  onClick={async () => {
                    await runBulkTask({ count: phoneNormTargets.length, label: "기사 전화번호", verb: "정리", task: async (progress) => { let k = 0; for (const d of phoneNormTargets) { await upsertDriver({ ...d, 전화번호: normalizePhone(d.전화번호) }); progress(++k); } } });
                    setCleanupDone(true);
                    showAlert(`전화번호 ${phoneNormTargets.length}건을 정규화했습니다.`);
                  }}
                  className="ml-auto px-4 py-1.5 bg-[#1B2B4B] text-white text-[13px] font-bold rounded-lg hover:bg-[#243a60] transition">
                  <EditableText id="driver.cleanup.전체정규화" defaultText="전체 정규화" /> ({phoneNormTargets.length}건)
                </button>
              )}
              {cleanupTab === "중복기사정리" && cleanupSelected.size > 0 && (
                <button
                  onClick={async () => {
                    if (!await kpConfirm(`선택한 ${cleanupSelected.size}건의 중복 기사를 삭제하시겠습니까?`)) return;
                    await removeDriver([...cleanupSelected]); // ⭐ 2026-11-05 한 번에 삭제 + 진행 창
                    setCleanupSelected(new Set());
                    setCleanupDone(true);
                    showAlert(`${cleanupSelected.size}건 삭제 완료`);
                  }}
                  className="ml-auto px-4 py-1.5 bg-red-600 text-white text-[13px] font-bold rounded-lg hover:bg-red-700 transition">
                  <EditableText id="driver.cleanup.선택삭제" defaultText="선택 삭제" /> ({cleanupSelected.size}건)
                </button>
              )}
            </div>
            {/* 본문 */}
            <div className="overflow-y-auto flex-1">
              {cleanupTab === "연락처정규화" && (
                phoneNormTargets.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-[13px] text-gray-500">
                    {cleanupDone ? "모든 연락처가 정규화되었습니다." : "정규화가 필요한 연락처가 없습니다."}
                  </div>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 bg-[#1B2B4B]">
                      <tr>
                        {["차량번호","기사명","현재 연락처","정규화 후"].map(h => (
                          <th key={h} className="px-4 py-3 text-white font-bold text-left whitespace-nowrap"><EditableText id={`driver.table.header.${h}`} defaultText={h} /></th>
                        ))}
                        <th className="px-4 py-3 text-white font-bold text-center whitespace-nowrap"><EditableText id="driver.table.header.개별 정규화" defaultText="개별 정규화" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {phoneNormTargets.map((d, i) => (
                        <tr key={d.id || i} className={`border-b border-gray-100 ${i%2?"bg-gray-50/50":"bg-white"}`}>
                          <td className="px-4 py-3 text-[13px] font-semibold text-[#1B2B4B] whitespace-nowrap">{d.차량번호 || "-"}</td>
                          <td className="px-4 py-3 text-[13px] text-gray-800 whitespace-nowrap">{d.이름 || "-"}</td>
                          <td className="px-4 py-3 text-[13px] text-gray-500 whitespace-nowrap">{formatPhone(d.전화번호)}</td>
                          <td className="px-4 py-3 text-[13px] font-semibold text-[#1B2B4B] whitespace-nowrap">{normalizePhone(d.전화번호)}</td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={async () => {
                              if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;
                              await upsertDriver({ ...d, 전화번호: normalizePhone(d.전화번호) });
                              showAlert("전화번호를 정규화했습니다.");
                            }} className="px-3 py-1 rounded-lg border border-[#1B2B4B] text-[#1B2B4B] text-[12px] font-semibold hover:bg-[#1B2B4B] hover:text-white transition">
                              정규화
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}

              {cleanupTab === "중복기사정리" && (
                dupGroups.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-[13px] text-gray-500">
                    {cleanupDone ? "중복 기사님이 정리되었습니다." : "중복된 기사님이 없습니다."}
                  </div>
                ) : (
                  <div className="p-4 space-y-4">
                    {dupGroups.map((group, gi) => {
                      // 가장 최신 (updatedAt 기준) 을 대표로
                      const sorted = [...group].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
                      const representative = sorted[0];
                      return (
                        <div key={gi} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                          <div className="bg-[#1B2B4B]/5 px-4 py-2 flex items-center gap-3 border-b border-gray-100">
                            <span className="text-[13px] font-bold text-[#1B2B4B]">{representative.차량번호 || "차량번호 없음"}</span>
                            <span className="text-[12px] text-gray-500">{representative.이름 || ""}</span>
                            <span className="ml-auto text-[12px] text-gray-500">총 {group.length}건 (중복 {group.length - 1}건)</span>
                            <button
                              onClick={async () => {
                                const toDelete = sorted.slice(1).map(d => d.id).filter(Boolean);
                                if (!toDelete.length) return;
                                if (!await kpConfirm(`"${representative.차량번호}" 기사를 1건으로 정리합니다. 나머지 ${toDelete.length}건을 삭제하시겠습니까?`)) return;
                                await removeDriver(toDelete); // ⭐ 2026-11-05 한 번에 삭제 + 진행 창
                                showAlert(`정리를 마쳤습니다. 중복 ${toDelete.length}건을 삭제했습니다.`);
                              }}
                              className="px-3 py-1 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-bold hover:bg-[#243a60] transition">
                              이 그룹 정리
                            </button>
                          </div>
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="border-b border-gray-100">
                                <th className="px-3 py-2 text-center w-8">
                                  <input autoComplete="off" type="checkbox"
                                    checked={sorted.slice(1).every(d => d.id && cleanupSelected.has(d.id))}
                                    onChange={e => {
                                      const ids = sorted.slice(1).map(d => d.id).filter(Boolean);
                                      setCleanupSelected(prev => {
                                        const n = new Set(prev);
                                        if (e.target.checked) ids.forEach(id => n.add(id));
                                        else ids.forEach(id => n.delete(id));
                                        return n;
                                      });
                                    }} />
                                </th>
                                {["차량번호","기사명","연락처","등급","비고"].map(h => (
                                  <th key={h} className="px-3 py-2 text-[12px] font-bold text-gray-500 text-left whitespace-nowrap"><EditableText id={`driver.cleanup.dupTable.header.${h}`} defaultText={h} /></th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sorted.map((d, di) => (
                                <tr key={d.id || di} className={`border-b border-gray-50 ${di === 0 ? "bg-[#1B2B4B]/5" : ""}`}>
                                  <td className="px-3 py-2.5 text-center">
                                    {di === 0 ? (
                                      <span className="text-[11px] font-bold text-[#1B2B4B] bg-[#1B2B4B]/10 px-1.5 py-0.5 rounded">유지</span>
                                    ) : (
                                      <input autoComplete="off" type="checkbox"
                                        checked={!!d.id && cleanupSelected.has(d.id)}
                                        onChange={e => {
                                          if (!d.id) return;
                                          setCleanupSelected(prev => {
                                            const n = new Set(prev);
                                            e.target.checked ? n.add(d.id) : n.delete(d.id);
                                            return n;
                                          });
                                        }} />
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-[13px] font-semibold text-[#1B2B4B] whitespace-nowrap">{d.차량번호 || "-"}</td>
                                  <td className="px-3 py-2.5 text-[13px] text-gray-800 whitespace-nowrap">{d.이름 || "-"}</td>
                                  <td className="px-3 py-2.5 text-[13px] text-gray-600 whitespace-nowrap">{d.전화번호 || "-"}</td>
                                  <td className="px-3 py-2.5 text-[13px] text-gray-500 whitespace-nowrap">{d.등급 || "일반"}</td>
                                  <td className="px-3 py-2.5 text-[12px] text-gray-500">{di === 0 ? "대표 (최신)" : "삭제 대상"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
