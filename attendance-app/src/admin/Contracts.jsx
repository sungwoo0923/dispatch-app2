import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { FileSignature, Trash2, Eye, Search, Download, Printer, Send, Stamp, FileText } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import FilterDropdown from "../components/FilterDropdown";
import Pagination from "../components/Pagination";
import SignaturePad from "../components/SignaturePad";
import { usePagination } from "../hooks/usePagination";
import { downloadCsv } from "../utils/exportCsv";
import { buildDefaultContract } from "../utils/contractTemplate";
import { NATIONALITY_OPTIONS, SHIFT_TYPE_OPTIONS, EMPLOYMENT_TYPE_OPTIONS, TEAM_OPTIONS, POSITION_OPTIONS } from "../constants/hr";
import { formatDate, calculateAge } from "../utils/dateUtils";
import { contractStatus, CONTRACT_STATUS_TONE } from "../utils/contractStatus";
import SmsButton from "../components/SmsButton";
import ResignationApprovals from "./ResignationApprovals";

const TOP_TABS = ["계약서", "사직서"];

const CYCLE_OPTIONS = ["1년", "6개월", "3개월", "기간의 정함 없음"];

const emptyDraft = () => ({
  entityIds: [],
  siteIds: [],
  vendorIds: [],
  shiftTypes: [],
  employmentTypes: [],
  teams: [],
  positions: [],
  nationalities: [],
  searchField: "name",
  searchText: "",
});

const departmentOptions = TEAM_OPTIONS.map((t) => ({ value: t, label: t }));
const positionOptions = POSITION_OPTIONS.map((p) => ({ value: p, label: p }));

export default function Contracts() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [businessEntities, setBusinessEntities] = useState([]);
  const [shiftTemplates, setShiftTemplates] = useState([]);
  const [allowanceTemplates, setAllowanceTemplates] = useState([]);
  const [companyName, setCompanyName] = useState("");
  const [contracts, setContracts] = useState([]);

  const [draft, setDraft] = useState(emptyDraft());
  const [applied, setApplied] = useState(emptyDraft());
  const [selected, setSelected] = useState(() => new Set());
  const [tab, setTab] = useState(() => (new URLSearchParams(window.location.search).get("tab") === "resignation" ? "사직서" : "계약서"));

  const [signTarget, setSignTarget] = useState(null); // { emp, contract, content }
  const [docView, setDocView] = useState(null); // { emp, contract }
  const [detailView, setDetailView] = useState(null); // { emp, contract }
  const [saving, setSaving] = useState(false);
  const [signError, setSignError] = useState("");
  const padRef = useRef(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(
        query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")),
        (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (snap) =>
        setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", profile.companyId)), (snap) =>
        setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (snap) =>
        setBusinessEntities(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "shiftTemplates"), where("companyId", "==", profile.companyId)), (snap) =>
        setShiftTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "allowanceTemplates"), where("companyId", "==", profile.companyId)), (snap) =>
        setAllowanceTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "contracts"), where("companyId", "==", profile.companyId)), (snap) =>
        setContracts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    getDoc(doc(db, "companies", profile.companyId)).then((s) => setCompanyName(s.data()?.name || ""));
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const entityName_ = (id) => businessEntities.find((b) => b.id === id)?.name || "-";
  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";
  const vendorName_ = (id) => vendors.find((v) => v.id === id)?.name || "-";
  const shiftTemplateName_ = (id) => shiftTemplates.find((t) => t.id === id)?.name || "-";
  const allowanceTemplateName_ = (id) => allowanceTemplates.find((t) => t.id === id)?.name || "-";
  const stampFor = (emp) => businessEntities.find((b) => b.id === emp.businessEntityId)?.stampUrl || null;

  const latestContractFor = (uid) =>
    contracts
      .filter((c) => c.uid === uid)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0] || null;

  const rows = useMemo(() => employees.map((emp) => ({ emp, contract: latestContractFor(emp.id) })), [employees, contracts]);

  // 문자 버튼의 기본 문구는 서명 상태에 맞춰 자동으로 달라진다 — 실무에서
  // 문자를 보내는 목적이 대부분 "서명대기(=아직 근로자 서명 전)" 알림이기
  // 때문에, 그 상태에서는 서명 재촉 문구를 기본으로 채워준다.
  const smsMessageFor = (emp, contract) => {
    const status = contractStatus(contract);
    if (status === "서명대기" || status === "발송대기") {
      return `[${companyName || "회사"}] ${emp.name}님, 근로계약서 서명이 아직 완료되지 않았습니다. KP-work 앱에서 계약서를 확인하고 서명해주세요.`;
    }
    return `[${companyName || "회사"}] ${emp.name}님, 안녕하세요.`;
  };

  const filteredRows = useMemo(() => {
    const a = applied;
    return rows
      .filter((r) => !a.entityIds.length || a.entityIds.includes(r.emp.businessEntityId))
      .filter((r) => !a.siteIds.length || a.siteIds.includes(r.emp.workSiteId))
      .filter((r) => !a.vendorIds.length || a.vendorIds.includes(r.emp.vendorId))
      .filter((r) => !a.shiftTypes.length || a.shiftTypes.includes(r.emp.shiftType))
      .filter((r) => !a.employmentTypes.length || a.employmentTypes.includes(r.emp.employmentType))
      .filter((r) => !a.teams.length || a.teams.includes(r.emp.team))
      .filter((r) => !a.positions.length || a.positions.includes(r.emp.position))
      .filter((r) => !a.nationalities.length || a.nationalities.includes(r.emp.nationality || "내국인"))
      .filter((r) => {
        if (!a.searchText.trim()) return true;
        const v = (r.emp[a.searchField] || "").toString().toLowerCase();
        return v.includes(a.searchText.trim().toLowerCase());
      })
      .sort((x, y) => (x.emp.name || "").localeCompare(y.emp.name || ""));
  }, [rows, applied]);

  const { pageRows, page, pageCount, pageSize, total, setPage, changePageSize, PAGE_SIZE_OPTIONS } = usePagination(filteredRows, 10);

  const runSearch = () => setApplied(draft);
  const resetSearch = () => {
    setDraft(emptyDraft());
    setApplied(emptyDraft());
  };

  const toggleSelect = (uid) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  const toggleSelectAll = () =>
    setSelected((s) => (s.size === pageRows.length ? new Set() : new Set(pageRows.map((r) => r.emp.id))));

  const exportExcel = () => {
    downloadCsv(
      "서명계약조회",
      [
        "순번", "이름", "사업자", "센터", "전화번호", "외/내국인", "성별", "나이", "계약주기", "계약일자",
        "소속업체", "근무구분", "근무형태", "부서", "직급", "계약", "사직서", "계약서유형", "시간템플릿", "수당템플릿",
      ],
      filteredRows.map((r, i) => [
        i + 1,
        r.emp.name || "",
        entityName_(r.emp.businessEntityId),
        siteName_(r.emp.workSiteId),
        r.emp.phone || "",
        r.emp.nationality || "내국인",
        r.emp.gender || "",
        calculateAge(r.emp.residentNumberFront) ?? "",
        r.contract?.cycle || "",
        r.contract?.startDate ? formatDate(r.contract.startDate) : "",
        vendorName_(r.emp.vendorId),
        r.emp.shiftType || "",
        r.emp.employmentType || "",
        r.emp.team || "",
        r.emp.position || "",
        contractStatus(r.contract),
        r.emp.resignTemplateName || "",
        r.contract?.title || r.emp.contractTemplateName || "",
        shiftTemplateName_(r.emp.shiftTemplateId),
        allowanceTemplateName_(r.emp.allowanceTemplateId),
      ])
    );
  };

  const downloadSelected = () => {
    const targets = filteredRows.filter((r) => selected.has(r.emp.id) && r.contract);
    if (targets.length === 0) return;
    const text = targets
      .map(
        (r) =>
          `[${r.emp.name}]\n${r.contract.content || ""}\n갑(회사) 서명일: ${
            r.contract.companySignedAt ? formatDate(r.contract.companySignedAt) : "미서명"
          }\n을(근로자) 서명일: ${r.contract.employeeSignedAt ? formatDate(r.contract.employeeSignedAt) : "미서명"}\n\n`
      )
      .join("\n" + "-".repeat(40) + "\n\n");
    const blob = new Blob(["﻿" + text], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "계약서.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const printSelected = () => window.print();

  const removeSelected = async () => {
    const targets = filteredRows.filter((r) => selected.has(r.emp.id) && r.contract);
    if (targets.length === 0) return;
    if (!(await confirm(`선택된 ${targets.length}건의 계약서를 삭제하시겠습니까?`, "delete"))) return;
    await Promise.all(targets.map((r) => deleteDoc(doc(db, "contracts", r.contract.id))));
    toast.success("삭제되었습니다");
    setSelected(new Set());
  };

  const buildContentFor = (emp, contract) =>
    contract?.content ||
    buildDefaultContract({
      employeeName: emp.name,
      hireDate: emp.hireDate,
      position: emp.position,
      siteName: siteName_(emp.workSiteId),
      vendorName: vendorName_(emp.vendorId),
      companyName,
      payType: emp.payType,
      shiftType: emp.shiftType,
      employmentType: emp.employmentType,
    });

  // 보기: 회사(갑) 서명이 이미 있으면 상세(양쪽 서명 확인 + 재서명)를, 없으면
  // 바로 서명 화면을 연다 — 관리자가 PC에서 서명하는 것은 갑(회사) 서명이다.
  const openView = (emp, contract) => {
    if (contract?.companySignatureDataUrl) {
      setDocView({ emp, contract });
      return;
    }
    setSignError("");
    setSignTarget({ emp, contract, content: buildContentFor(emp, contract) });
  };

  const openResign = (emp, contract) => {
    setSignError("");
    setSignTarget({ emp, contract, content: buildContentFor(emp, contract) });
  };

  const saveCompanySignature = async ({ emp, contract, content }, signatureDataUrl) => {
    const signedAt = new Date().toISOString().slice(0, 10);
    const status = contract?.employeeSignatureDataUrl ? "signed" : "sent";
    if (contract) {
      await updateDoc(doc(db, "contracts", contract.id), { status, companySignatureDataUrl: signatureDataUrl, companySignedAt: signedAt });
      return { ...contract, status, companySignatureDataUrl: signatureDataUrl, companySignedAt: signedAt };
    }
    const payload = {
      companyId: profile.companyId,
      uid: emp.id,
      employeeName: emp.name,
      title: "표준근로계약서",
      cycle: "1년",
      startDate: signedAt,
      endDate: null,
      content,
      status,
      companySignatureDataUrl: signatureDataUrl,
      companySignedAt: signedAt,
    };
    const ref = await addDoc(collection(db, "contracts"), { ...payload, createdAt: serverTimestamp() });
    return { id: ref.id, ...payload };
  };

  const applySignature = async () => {
    if (!signTarget || !padRef.current || padRef.current.isEmpty()) return;
    setSaving(true);
    setSignError("");
    try {
      const savedContract = await saveCompanySignature(signTarget, padRef.current.getDataUrl());
      toast.success("서명이 적용되었습니다");
      setSignTarget(null);
      setDocView({ emp: signTarget.emp, contract: savedContract });
    } catch (err) {
      setSignError(`서명 적용에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const applyStampSignature = async () => {
    const stampUrl = signTarget && stampFor(signTarget.emp);
    if (!stampUrl) return;
    setSaving(true);
    setSignError("");
    try {
      const savedContract = await saveCompanySignature(signTarget, stampUrl);
      toast.success("도장이 적용되었습니다");
      setSignTarget(null);
      setDocView({ emp: signTarget.emp, contract: savedContract });
    } catch (err) {
      setSignError(`도장 적용에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const autoSend = async () => {
    const targets = filteredRows.filter((r) => selected.has(r.emp.id));
    if (targets.length === 0) return;
    const withStamp = targets.filter((r) => stampFor(r.emp));
    const withoutStamp = targets.length - withStamp.length;
    if (withStamp.length === 0) {
      toast.error("선택된 근로자의 사업자에 등록된 도장이 없습니다. 센터별리포트 > 계약서 상세에서 도장을 먼저 업로드해주세요.");
      return;
    }
    if (
      !(await confirm(
        `선택된 ${withStamp.length}명에게 사업주 도장을 적용해 계약서를 즉시 발송하시겠습니까?${withoutStamp ? ` (도장 미등록 ${withoutStamp}명 제외)` : ""}`,
        "save"
      ))
    )
      return;
    await Promise.all(withStamp.map((r) => saveCompanySignature({ emp: r.emp, contract: r.contract, content: buildContentFor(r.emp, r.contract) }, stampFor(r.emp))));
    toast.success(`${withStamp.length}건 발송되었습니다`);
    setSelected(new Set());
  };

  return (
    <div className="space-y-6">
      <Panel icon={FileSignature} title="계약관리">
        <div className="mb-4 flex flex-nowrap overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100 bg-white">
          {TOP_TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`shrink-0 px-4 py-3 text-sm font-medium ${tab === t ? "bg-primary-dark text-white" : "text-muted hover:bg-slate-50"}`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === "사직서" && <ResignationApprovals />}
        {tab === "계약서" && (
        <>
        <div className="space-y-3">
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain pb-1">
            <FilterDropdown
              label="1선택 · 사업자"
              options={businessEntities.map((b) => ({ value: b.id, label: b.name }))}
              selected={draft.entityIds}
              onChange={(v) => setDraft((f) => ({ ...f, entityIds: v }))}
            />
            <FilterDropdown
              label="2선택 · 센터"
              options={workSites.map((s) => ({ value: s.id, label: s.name }))}
              selected={draft.siteIds}
              onChange={(v) => setDraft((f) => ({ ...f, siteIds: v }))}
            />
            <FilterDropdown
              label="3선택 · 소속업체"
              options={vendors.map((v) => ({ value: v.id, label: v.name }))}
              selected={draft.vendorIds}
              onChange={(v) => setDraft((f) => ({ ...f, vendorIds: v }))}
            />
            <FilterDropdown
              label="4선택 · 근무구분"
              options={SHIFT_TYPE_OPTIONS.map((s) => ({ value: s, label: s }))}
              selected={draft.shiftTypes}
              onChange={(v) => setDraft((f) => ({ ...f, shiftTypes: v }))}
            />
            <FilterDropdown
              label="5선택 · 근무형태"
              options={EMPLOYMENT_TYPE_OPTIONS.map((s) => ({ value: s, label: s }))}
              selected={draft.employmentTypes}
              onChange={(v) => setDraft((f) => ({ ...f, employmentTypes: v }))}
            />
            <FilterDropdown
              label="6선택 · 부서"
              options={departmentOptions}
              selected={draft.teams}
              onChange={(v) => setDraft((f) => ({ ...f, teams: v }))}
            />
            <FilterDropdown
              label="7선택 · 직급"
              options={positionOptions}
              selected={draft.positions}
              onChange={(v) => setDraft((f) => ({ ...f, positions: v }))}
            />
            <FilterDropdown
              label="8선택 · 외/내국인"
              options={NATIONALITY_OPTIONS.map((n) => ({ value: n, label: n }))}
              selected={draft.nationalities}
              onChange={(v) => setDraft((f) => ({ ...f, nationalities: v }))}
            />
          </div>

          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain pb-1">
            <span className="shrink-0 text-xs font-medium text-muted">통합검색</span>
            <select
              className="shrink-0 rounded-xl border border-slate-200 px-2.5 py-2 text-sm"
              value={draft.searchField}
              onChange={(e) => setDraft((f) => ({ ...f, searchField: e.target.value }))}
            >
              <option value="name">이름</option>
              <option value="phone">전화번호</option>
            </select>
            <div className="flex shrink-0 flex-nowrap overflow-hidden rounded-xl border border-slate-200">
              <input
                className="w-28 border-0 px-3 py-2 text-sm focus:outline-none"
                placeholder="검색어"
                value={draft.searchText}
                onChange={(e) => setDraft((f) => ({ ...f, searchText: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
              <button
                type="button"
                onClick={runSearch}
                className="flex items-center gap-1 border-l border-slate-200 bg-slate-50 px-2.5 text-xs text-muted hover:bg-slate-100"
              >
                <Search size={13} /> 조회
              </button>
            </div>
            <Button variant="outline" onClick={resetSearch}>
              초기화
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-nowrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted">목록 {total}건</p>
          <div className="flex flex-nowrap items-center gap-2">
            <Button size="sm" onClick={autoSend}>
              <Send size={14} /> 자동발송
            </Button>
            <Button variant="danger" size="sm" onClick={removeSelected}>
              <Trash2 size={14} /> 삭제
            </Button>
            <Button variant="outline" size="sm" onClick={downloadSelected}>
              <Download size={14} /> 다운로드
            </Button>
            <Button variant="outline" size="sm" onClick={printSelected}>
              <Printer size={14} /> 출력
            </Button>
            <Button variant="outline" size="sm" onClick={exportExcel}>
              <Download size={14} /> 엑셀
            </Button>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-muted">
          자동발송: 선택한 근로자의 사업자에 등록된 도장을 적용해 갑(회사) 서명을 자동으로 완료하고 즉시 발송합니다. (도장은 센터별리포트 &gt; 계약서 상세에서 등록)
        </p>

        <div className="-mx-4 mt-2 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[1700px] text-center text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-2 py-2 font-semibold">순번</th>
                <th className="px-2 py-2 font-semibold">
                  <input type="checkbox" checked={selected.size > 0 && selected.size === pageRows.length} onChange={toggleSelectAll} />
                </th>
                <th className="px-2 py-2 font-semibold">계약서</th>
                <th className="px-2 py-2 font-semibold">상세</th>
                <th className="px-2 py-2 font-semibold">이름</th>
                <th className="px-2 py-2 font-semibold">사업자</th>
                <th className="px-2 py-2 font-semibold">센터</th>
                <th className="px-2 py-2 font-semibold">전화번호</th>
                <th className="px-2 py-2 font-semibold">외/내국인</th>
                <th className="px-2 py-2 font-semibold">성별</th>
                <th className="px-2 py-2 font-semibold">나이</th>
                <th className="px-2 py-2 font-semibold">계약주기</th>
                <th className="px-2 py-2 font-semibold">계약일자</th>
                <th className="px-2 py-2 font-semibold">소속업체</th>
                <th className="px-2 py-2 font-semibold">근무구분</th>
                <th className="px-2 py-2 font-semibold">근무형태</th>
                <th className="px-2 py-2 font-semibold">부서</th>
                <th className="px-2 py-2 font-semibold">직급</th>
                <th className="px-2 py-2 font-semibold">계약/사직서</th>
                <th className="px-2 py-2 font-semibold">계약서유형</th>
                <th className="px-2 py-2 font-semibold">계약</th>
                <th className="px-2 py-2 font-semibold">시간템플릿</th>
                <th className="px-2 py-2 font-semibold">수당템플릿</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(({ emp, contract }, i) => (
                <tr key={emp.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-2 py-2 text-ink">{(page - 1) * pageSize + i + 1}</td>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(emp.id)} onChange={() => toggleSelect(emp.id)} />
                  </td>
                  <td className="px-2 py-2">
                    <button
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      onClick={() => openView(emp, contract)}
                    >
                      <Eye size={14} /> 보기
                    </button>
                  </td>
                  <td className="px-2 py-2">
                    <button
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      onClick={() => setDetailView({ emp, contract })}
                    >
                      <FileText size={14} /> 상세
                    </button>
                  </td>
                  <td className="px-2 py-2 text-ink">{emp.name}</td>
                  <td className="px-2 py-2 text-ink">{entityName_(emp.businessEntityId)}</td>
                  <td className="px-2 py-2 text-ink">{siteName_(emp.workSiteId)}</td>
                  <td className="px-2 py-2 text-ink">
                    <span className="inline-flex items-center gap-1">
                      {emp.phone || "-"}
                      <SmsButton phone={emp.phone} message={smsMessageFor(emp, contract)} />
                    </span>
                  </td>
                  <td className="px-2 py-2 text-ink">{emp.nationality || "내국인"}</td>
                  <td className="px-2 py-2 text-ink">{emp.gender || "-"}</td>
                  <td className="px-2 py-2 text-ink">{calculateAge(emp.residentNumberFront) ?? "-"}</td>
                  <td className="px-2 py-2 text-ink">{contract?.cycle || "-"}</td>
                  <td className="px-2 py-2 text-ink">{contract?.startDate ? formatDate(contract.startDate) : "-"}</td>
                  <td className="px-2 py-2 text-ink">{vendorName_(emp.vendorId)}</td>
                  <td className="px-2 py-2 text-ink">{emp.shiftType || "-"}</td>
                  <td className="px-2 py-2 text-ink">{emp.employmentType || "-"}</td>
                  <td className="px-2 py-2 text-ink">{emp.team || "-"}</td>
                  <td className="px-2 py-2 text-ink">{emp.position || "-"}</td>
                  <td className="px-2 py-2 text-ink">계약 / {emp.resignTemplateName || "-"}</td>
                  <td className="px-2 py-2 text-ink">{contract?.title || emp.contractTemplateName || "표준근로계약서"}</td>
                  <td className="px-2 py-2">
                    <Badge tone={CONTRACT_STATUS_TONE[contractStatus(contract)]}>{contractStatus(contract)}</Badge>
                  </td>
                  <td className="px-2 py-2 text-ink">{shiftTemplateName_(emp.shiftTemplateId)}</td>
                  <td className="px-2 py-2 text-ink">{allowanceTemplateName_(emp.allowanceTemplateId)}</td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={23} className="px-4 py-6 text-center text-xs text-muted">
                    조회조건에 해당하는 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          total={total}
          setPage={setPage}
          changePageSize={changePageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
        />
        </>
        )}
      </Panel>

      <Modal
        open={Boolean(signTarget)}
        onClose={() => setSignTarget(null)}
        title="갑(회사) 서명"
        footer={
          <>
            <Button variant="outline" onClick={() => setSignTarget(null)}>
              취소
            </Button>
            <Button variant="outline" onClick={() => padRef.current?.clear()}>
              다시그리기
            </Button>
            <Button onClick={applySignature} disabled={saving}>
              {saving ? "적용 중..." : "서명으로 적용"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink">{signTarget?.emp?.name}님의 근로계약서에 사업주(갑)로서 서명합니다.</p>
          {signTarget && stampFor(signTarget.emp) && (
            <div className="flex flex-nowrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <img src={stampFor(signTarget.emp)} alt="등록된 도장" className="h-14 w-14 rounded-lg border border-slate-200 bg-white object-contain" />
              <div className="flex-1">
                <p className="text-xs text-ink">등록된 사업자 도장이 있습니다. 손으로 그리는 대신 바로 적용할 수 있습니다.</p>
              </div>
              <Button size="sm" variant="outline" onClick={applyStampSignature} disabled={saving}>
                <Stamp size={13} /> 도장 사용
              </Button>
            </div>
          )}
          <p className="mb-1 text-xs text-muted">또는 여기에 직접 서명을 그려주세요</p>
          <SignaturePad ref={padRef} />
          {signError && <p className="text-xs text-danger">{signError}</p>}
        </div>
      </Modal>

      <Modal
        open={Boolean(docView)}
        onClose={() => setDocView(null)}
        title={docView?.contract?.title || "표준근로계약서"}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => docView && openResign(docView.emp, docView.contract)}>
              재서명
            </Button>
            <Button onClick={() => setDocView(null)}>닫기</Button>
          </>
        }
      >
        {docView && (
          <div className="space-y-4">
            <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-sans text-xs leading-relaxed text-ink">
              {docView.contract.content}
            </pre>
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 p-4">
              <div className="text-center">
                <p className="mb-1.5 text-xs font-medium text-muted">갑 (회사) {companyName}</p>
                {docView.contract.companySignatureDataUrl ? (
                  <img
                    src={docView.contract.companySignatureDataUrl}
                    alt="회사 서명/도장"
                    className="mx-auto h-20 rounded-lg border border-slate-200 bg-white"
                  />
                ) : (
                  <p className="text-xs text-warning">서명 대기중</p>
                )}
                {docView.contract.companySignedAt && <p className="mt-1 text-xs text-muted">서명일: {formatDate(docView.contract.companySignedAt)}</p>}
              </div>
              <div className="text-center">
                <p className="mb-1.5 text-xs font-medium text-muted">을 (근로자) {docView.emp.name}</p>
                {docView.contract.employeeSignatureDataUrl ? (
                  <img
                    src={docView.contract.employeeSignatureDataUrl}
                    alt="근로자 서명"
                    className="mx-auto h-20 rounded-lg border border-slate-200 bg-white"
                  />
                ) : (
                  <p className="text-xs text-warning">서명 대기중 (근로자 모바일에서 서명 예정)</p>
                )}
                {docView.contract.employeeSignedAt && <p className="mt-1 text-xs text-muted">서명일: {formatDate(docView.contract.employeeSignedAt)}</p>}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(detailView)}
        onClose={() => setDetailView(null)}
        title="계약서 상세"
        footer={<Button onClick={() => setDetailView(null)}>닫기</Button>}
      >
        {detailView && (
          <div className="space-y-2 text-center">
            {[
              ["이름", detailView.emp.name],
              ["사업자", entityName_(detailView.emp.businessEntityId)],
              ["센터", siteName_(detailView.emp.workSiteId)],
              ["소속업체", vendorName_(detailView.emp.vendorId)],
              ["전화번호", detailView.emp.phone || "-"],
              ["계약서유형", detailView.contract?.title || detailView.emp.contractTemplateName || "표준근로계약서"],
              ["계약주기", detailView.contract?.cycle || "-"],
              ["계약일자", detailView.contract?.startDate ? formatDate(detailView.contract.startDate) : "-"],
              ["시간템플릿", shiftTemplateName_(detailView.emp.shiftTemplateId)],
              ["수당템플릿", allowanceTemplateName_(detailView.emp.allowanceTemplateId)],
              ["서명상태", contractStatus(detailView.contract)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between border-b border-slate-50 py-2 text-sm last:border-0">
                <span className="text-xs text-muted">{label}</span>
                <span className="text-ink">{value}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
