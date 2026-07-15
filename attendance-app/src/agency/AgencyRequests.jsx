import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, doc, setDoc, addDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ClipboardList, Users } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import Panel from "../components/Panel";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { generateInviteCode } from "../utils/ids";

const EMPTY_WORKER = { name: "", phone: "", gender: "", dailyRate: "" };

// 도급사가 스케줄등록/출근현황에 바로 반영되도록, 배정 시 각 근로자마다
// users(외부인력 placeholder) + schedules(출근확정) 문서를 함께 만든다 —
// EmployeeList의 "가입 전 임시승인" 패턴과 동일하게 실제 Firebase Auth
// 계정 없이 임의 코드를 uid로 쓰는 방식이라 기존 스케줄/출근현황 화면이
// 코드 수정 없이 그대로 인식한다.
async function provisionWorker({ request, worker, agencyId, agencyName }) {
  const uid = generateInviteCode(10);
  await setDoc(doc(db, "users", uid), {
    companyId: request.companyId,
    role: "employee",
    name: worker.name,
    phone: worker.phone,
    gender: worker.gender || "",
    employmentType: "외부인력",
    agencyId,
    agencyName,
    dailyRate: Number(worker.dailyRate) || 0,
    workSiteId: request.siteId || null,
    shiftType: request.shiftLabel || "",
    hireDate: request.date,
    employmentStatus: "재직",
    approved: true,
    createdAt: serverTimestamp(),
  });
  await addDoc(collection(db, "schedules"), {
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
  return uid;
}

function AssignModal({ request, agencyId, agencyName, onClose, onDone }) {
  const toast = useToast();
  const [workers, setWorkers] = useState(
    Array.from({ length: Math.max(1, request.headcount || 1) }, () => ({ ...EMPTY_WORKER }))
  );
  const [saving, setSaving] = useState(false);

  const updateWorker = (i, key, value) =>
    setWorkers((w) => w.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));
  const addRow = () => setWorkers((w) => [...w, { ...EMPTY_WORKER }]);
  const removeRow = (i) => setWorkers((w) => w.filter((_, idx) => idx !== i));

  const totalPrice = workers.reduce((sum, w) => sum + (Number(w.dailyRate) || 0), 0);

  const submit = async () => {
    const valid = workers.filter((w) => w.name.trim());
    if (valid.length === 0) return toast.error("최소 1명 이상의 근로자 정보를 입력해주세요.");
    setSaving(true);
    try {
      const provisioned = [];
      for (const w of valid) {
        const uid = await provisionWorker({ request, worker: w, agencyId, agencyName });
        provisioned.push({ ...w, dailyRate: Number(w.dailyRate) || 0, uid });
      }
      await updateDoc(doc(db, "staffingRequests", request.id), {
        status: "assigned",
        workers: provisioned,
        totalPrice: provisioned.reduce((sum, w) => sum + w.dailyRate, 0),
        assignedAt: serverTimestamp(),
      });
      toast.success("배정이 완료되었습니다");
      onDone();
    } catch (err) {
      toast.error(`배정에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="인력 배정" footer={
      <>
        <Button variant="outline" onClick={onClose}>취소</Button>
        <Button onClick={submit} disabled={saving}>{saving ? "배정 중..." : "배정 완료"}</Button>
      </>
    }>
      <div className="mb-3 rounded-xl bg-slate-50 p-3 text-xs text-muted">
        {request.companyName} · {request.siteName || "-"} · {request.date} · {request.shiftLabel || "-"} · 요청인원 {request.headcount}명
      </div>
      <div className="space-y-3">
        {workers.map((w, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-5">
            <input className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm sm:col-span-1" placeholder="이름" value={w.name} onChange={(e) => updateWorker(i, "name", e.target.value)} />
            <input className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm sm:col-span-1" placeholder="연락처" value={w.phone} onChange={(e) => updateWorker(i, "phone", e.target.value)} />
            <select className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm sm:col-span-1" value={w.gender} onChange={(e) => updateWorker(i, "gender", e.target.value)}>
              <option value="">성별</option>
              <option value="남">남</option>
              <option value="여">여</option>
            </select>
            <input type="number" className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm sm:col-span-1" placeholder="일당(원)" value={w.dailyRate} onChange={(e) => updateWorker(i, "dailyRate", e.target.value)} />
            <button type="button" onClick={() => removeRow(i)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-danger sm:col-span-1">삭제</button>
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
  const [requests, setRequests] = useState([]);
  const [assignTarget, setAssignTarget] = useState(null);

  useEffect(() => {
    if (!agency?.id) return;
    const unsub = onSnapshot(query(collection(db, "staffingRequests"), where("agencyId", "==", agency.id)), (snap) =>
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [agency?.id]);

  const sorted = useMemo(
    () => [...requests].sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [requests]
  );

  return (
    <div className="space-y-6">
      <Panel icon={ClipboardList} title="요청장">
        <p className="mb-3 text-xs text-muted">도급사로부터 받은 외부인력 요청입니다. 요청중 건을 눌러 인원/단가를 입력하면 배정완료로 전환됩니다.</p>
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
                    <Badge tone={r.status === "assigned" ? "success" : "warning"}>{r.status === "assigned" ? "배정완료" : "요청중"}</Badge>
                  </td>
                  <td className="px-3 py-3 text-muted">{r.note || "-"}</td>
                  <td className="px-3 py-3">
                    {r.status === "assigned" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted"><Users size={13} /> {r.workers?.length || 0}명 · {(r.totalPrice || 0).toLocaleString()}원</span>
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
          onClose={() => setAssignTarget(null)}
          onDone={() => setAssignTarget(null)}
        />
      )}
    </div>
  );
}
