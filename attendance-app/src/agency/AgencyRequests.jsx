import { useEffect, useMemo, useRef, useState } from "react";
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ClipboardList, Users, Search, AlertTriangle, Trash2 } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Panel from "../components/Panel";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { generateInviteCode } from "../utils/ids";

const EMPTY_WORKER = {
  name: "",
  phone: "",
  gender: "",
  dailyRate: "",
  nationality: "",
  country: "",
  residentNumberFront: "",
  address: "",
};

// 도급사가 스케줄등록/출근현황에 바로 반영되도록, 배정 시 각 근로자마다
// users(외부인력 placeholder) + schedules(출근확정) 문서를 함께 만든다 —
// EmployeeList의 "가입 전 임시승인" 패턴과 동일하게 실제 Firebase Auth
// 계정 없이 임의 코드를 uid로 쓰는 방식이라 기존 스케줄/출근현황 화면이
// 코드 수정 없이 그대로 인식한다. schedules 문서 id를 미리 만들어두면
// (setDoc) 나중에 재배정/취소 시 쿼리 없이 바로 지울 수 있다.
export async function provisionWorker({ request, worker, agencyId, agencyName, businessName }) {
  const uid = generateInviteCode(10);
  await setDoc(doc(db, "users", uid), {
    companyId: request.companyId,
    role: "employee",
    name: worker.name,
    phone: worker.phone,
    gender: worker.gender || "",
    nationality: worker.nationality || "",
    country: worker.country || "",
    residentNumberFront: worker.residentNumberFront || "",
    address: worker.address || "",
    employmentType: "외부인력",
    agencyId,
    agencyName,
    // 인력사무소가 회사관리에서 등록한 사업자등록증 상호명 — 도급사 화면의
    // "사업자" 컬럼에 그대로 표시된다. 미등록 상태면 빈 문자열로 남는다.
    businessName: businessName || "",
    dailyRate: Number(worker.dailyRate) || 0,
    workSiteId: request.siteId || null,
    shiftType: request.shiftLabel || "",
    hireDate: request.date,
    employmentStatus: "재직",
    approved: true,
    createdAt: serverTimestamp(),
  });
  const scheduleRef = doc(collection(db, "schedules"));
  await setDoc(scheduleRef, {
    companyId: request.companyId,
    agencyId,
    uid,
    name: worker.name,
    date: request.date,
    startTime: request.startTime || "",
    endTime: request.endTime || "",
    siteId: request.siteId || null,
    siteName: request.siteName || "",
    status: "출근확정",
    createdAt: serverTimestamp(),
  });
  return { uid, scheduleId: scheduleRef.id };
}

// 이미 배정됐던 근로자들의 users(placeholder)/schedules 문서를 정리한다 —
// 인력사무소가 배정을 수정(인원 교체)하거나, 도급사가 요청 자체를
// 취소했을 때 공통으로 쓴다. scheduleId가 없는(이전 버전에서 배정된)
// 데이터는 조용히 건너뛴다.
export async function deprovisionWorkers(workers) {
  for (const w of workers || []) {
    if (w.uid) await deleteDoc(doc(db, "users", w.uid)).catch(() => {});
    if (w.scheduleId) await deleteDoc(doc(db, "schedules", w.scheduleId)).catch(() => {});
  }
}

function AssignModal({ request, agencyId, agencyName, businessName, roster, onClose, onDone }) {
  const toast = useToast();
  // 이미 배정된 요청장을 다시 열면(인원 교체 등) 기존 배정 인원을 그대로
  // 채워 보여주고, 저장 시 예전 배정을 정리한 뒤 새로 배정한다.
  const isEdit = Boolean(request.workers?.length);
  const [workers, setWorkers] = useState(() =>
    isEdit
      ? request.workers.map((w) => ({ ...EMPTY_WORKER, ...w }))
      : Array.from({ length: Math.max(1, request.headcount || 1) }, () => ({ ...EMPTY_WORKER }))
  );
  const [saving, setSaving] = useState(false);
  // 이름칸에 타이핑 중인 근로자 행 인덱스 — 그 행에만 인원관리 로스터
  // 검색결과 드롭다운을 띄운다. 바깥 클릭하면 닫히도록 각 행 wrapper에
  // ref를 붙여 바깥 클릭을 감지한다.
  const [searchOpenIndex, setSearchOpenIndex] = useState(null);
  const rowRefs = useRef([]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (searchOpenIndex == null) return;
      const el = rowRefs.current[searchOpenIndex];
      if (el && !el.contains(e.target)) setSearchOpenIndex(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [searchOpenIndex]);

  const updateWorker = (i, key, value) =>
    setWorkers((w) => w.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));
  const addRow = () => setWorkers((w) => [...w, { ...EMPTY_WORKER }]);
  const removeRow = (i) => setWorkers((w) => w.filter((_, idx) => idx !== i));

  const pickFromRoster = (i, person) => {
    setWorkers((w) =>
      w.map((row, idx) =>
        idx === i
          ? {
              ...row,
              name: person.name,
              phone: person.phone || "",
              gender: person.gender || "",
              nationality: person.nationality || "",
              country: person.country || "",
              residentNumberFront: person.residentNumber ? person.residentNumber.split("-")[0] : "",
              address: person.address || "",
            }
          : row
      )
    );
    setSearchOpenIndex(null);
  };
  const rosterMatches = (i) => {
    const kw = (workers[i]?.name || "").trim();
    if (!kw) return [];
    return roster.filter((p) => p.name?.includes(kw)).slice(0, 6);
  };

  const totalPrice = workers.reduce((sum, w) => sum + (Number(w.dailyRate) || 0), 0);

  const submit = async () => {
    const valid = workers.filter((w) => w.name.trim());
    if (valid.length === 0) return toast.error("최소 1명 이상의 근로자 정보를 입력해주세요.");
    setSaving(true);
    try {
      // 수정(재배정)인 경우 사람이 바뀌었을 수 있으므로 기존에 배정됐던
      // 인력의 users/schedules 문서를 먼저 지우고 항상 새로 만든다.
      if (isEdit) await deprovisionWorkers(request.workers);
      const provisioned = [];
      for (const w of valid) {
        const { uid, scheduleId } = await provisionWorker({ request, worker: w, agencyId, agencyName, businessName });
        provisioned.push({ ...w, dailyRate: Number(w.dailyRate) || 0, uid, scheduleId });
      }
      await updateDoc(doc(db, "staffingRequests", request.id), {
        status: "assigned",
        workers: provisioned,
        totalPrice: provisioned.reduce((sum, w) => sum + w.dailyRate, 0),
        assignedAt: serverTimestamp(),
      });
      toast.success(isEdit ? "배정이 수정되었습니다" : "배정이 완료되었습니다");
      onDone();
    } catch (err) {
      toast.error(`${isEdit ? "수정" : "배정"}에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? "인력 배정 수정" : "인력 배정"} footer={
      <>
        <Button variant="outline" onClick={onClose}>취소</Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? (isEdit ? "수정 중..." : "배정 중...") : isEdit ? "수정 완료" : "배정 완료"}
        </Button>
      </>
    }>
      <div className="mb-3 rounded-xl bg-slate-50 p-3 text-xs text-muted">
        {request.companyName} · {request.siteName || "-"} · {request.date} · {request.shiftLabel || "-"} · 요청인원 {request.headcount}명
      </div>
      <div className="space-y-3">
        {workers.map((w, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-muted">인원 {i + 1}</p>
              <button type="button" onClick={() => removeRow(i)} className="text-xs text-danger">삭제</button>
            </div>
            <div className="space-y-2">
              <div ref={(el) => (rowRefs.current[i] = el)} className="relative">
                <label className="mb-1 block text-[11px] font-medium text-muted">이름</label>
                <div className="relative">
                  <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-2.5 text-sm"
                    placeholder="이름 입력 또는 인원관리에서 검색"
                    value={w.name}
                    onFocus={() => setSearchOpenIndex(i)}
                    onChange={(e) => {
                      updateWorker(i, "name", e.target.value);
                      setSearchOpenIndex(i);
                    }}
                  />
                </div>
                {searchOpenIndex === i && rosterMatches(i).length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                    {rosterMatches(i).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => pickFromRoster(i, p)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="text-ink">{p.name}</span>
                        <span className="text-xs text-muted">{p.phone || "-"} {p.jobType ? `· ${p.jobType}` : ""}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-muted">연락처</span>
                  <input className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" placeholder="연락처" value={w.phone} onChange={(e) => updateWorker(i, "phone", e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-muted">성별</span>
                  <select className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" value={w.gender} onChange={(e) => updateWorker(i, "gender", e.target.value)}>
                    <option value="">선택</option>
                    <option value="남">남</option>
                    <option value="여">여</option>
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">일당(원)</span>
                <input type="number" className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" placeholder="일당(원)" value={w.dailyRate} onChange={(e) => updateWorker(i, "dailyRate", e.target.value)} />
              </label>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Button size="sm" variant="outline" onClick={addRow}>인원 추가</Button>
        <p className="text-sm font-semibold text-ink">합계 {totalPrice.toLocaleString()}원</p>
      </div>
    </Modal>
  );
}

export default function AgencyRequests() {
  const { agency } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  const [roster, setRoster] = useState([]);
  const [assignTarget, setAssignTarget] = useState(null);

  useEffect(() => {
    if (!agency?.id) return;
    const unsub = onSnapshot(query(collection(db, "staffingRequests"), where("agencyId", "==", agency.id)), (snap) =>
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [agency?.id]);

  // 배정 팝업에서 이름검색으로 불러올 인원관리 로스터 — 여기서 한 번만
  // 구독해두고 AssignModal에 그대로 넘긴다.
  useEffect(() => {
    if (!agency?.id) return;
    const unsub = onSnapshot(query(collection(db, "agencyWorkers"), where("agencyId", "==", agency.id)), (snap) =>
      setRoster(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [agency?.id]);

  const sorted = useMemo(
    () => [...requests].sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [requests]
  );
  const cancelledCount = useMemo(() => requests.filter((r) => r.status === "cancelled").length, [requests]);

  const deleteOwnRequest = async (r) => {
    if (!(await confirm("취소된 요청을 목록에서 삭제하시겠습니까?", "delete"))) return;
    await deleteDoc(doc(db, "staffingRequests", r.id));
    toast.success("삭제되었습니다");
  };

  return (
    <div className="space-y-6">
      <Panel icon={ClipboardList} title="요청장">
        <p className="mb-3 text-xs text-muted">도급사로부터 받은 외부인력 요청입니다. 요청중 건을 눌러 인원/단가를 입력하면 배정완료로 전환됩니다.</p>
        {cancelledCount > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-danger/30 bg-red-50 px-4 py-3 text-sm text-danger">
            <AlertTriangle size={16} className="shrink-0" />
            <span>도급사가 취소한 요청이 {cancelledCount}건 있습니다. 목록에서 확인 후 삭제할 수 있습니다.</span>
          </div>
        )}
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-3 font-semibold">도급사</th>
                <th className="px-3 py-3 font-semibold">센터</th>
                <th className="px-3 py-3 font-semibold">날짜</th>
                <th className="px-3 py-3 font-semibold">조</th>
                <th className="px-3 py-3 font-semibold">요청인원</th>
                <th className="px-3 py-3 font-semibold">상태</th>
                <th className="px-3 py-3 font-semibold">비고</th>
                <th className="px-3 py-3 font-semibold">액션</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-3 text-ink">{r.companyName}</td>
                  <td className="px-3 py-3 text-ink">{r.siteName || "-"}</td>
                  <td className="px-3 py-3 text-ink">{r.date}</td>
                  <td className="px-3 py-3 text-ink">{r.shiftLabel || "-"}</td>
                  <td className="px-3 py-3 text-ink">{r.headcount}명</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-center gap-1">
                      <Badge tone={r.status === "assigned" ? "success" : r.status === "cancelled" ? "danger" : "warning"}>
                        {r.status === "assigned" ? "배정완료" : r.status === "cancelled" ? "취소됨" : "요청중"}
                      </Badge>
                      {r.pendingAction && (
                        <span className="text-[10px] font-medium text-danger">
                          {r.pendingAction === "reassign" ? "변경요청 검토중" : "취소요청 검토중"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-muted">{r.note || "-"}</td>
                  <td className="px-3 py-3">
                    {r.pendingAction ? (
                      <span className="text-xs text-muted">상단 알림에서 확인해주세요</span>
                    ) : r.status === "cancelled" ? (
                      <button type="button" onClick={() => deleteOwnRequest(r)} className="inline-flex items-center gap-1 text-xs font-medium text-danger">
                        <Trash2 size={13} /> 삭제
                      </button>
                    ) : r.status === "assigned" ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="inline-flex items-center gap-1 text-xs text-muted"><Users size={13} /> {r.workers?.length || 0}명 · {(r.totalPrice || 0).toLocaleString()}원</span>
                        <Button size="sm" variant="outline" onClick={() => setAssignTarget(r)}>수정</Button>
                      </div>
                    ) : (
                      <Button size="sm" onClick={() => setAssignTarget(r)}>배정하기</Button>
                    )}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-xs text-muted">받은 요청이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </Panel>

      {assignTarget && (
        <AssignModal
          request={assignTarget}
          agencyId={agency.id}
          agencyName={agency.name}
          businessName={agency.business?.name || ""}
          roster={roster}
          onClose={() => setAssignTarget(null)}
          onDone={() => setAssignTarget(null)}
        />
      )}
    </div>
  );
}
