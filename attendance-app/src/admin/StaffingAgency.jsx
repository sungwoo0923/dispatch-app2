import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { Building2, Plus, Trash2, Check, X, Pencil, UserCog, Ban } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Panel from "../components/Panel";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { notifyAgency } from "../utils/agencyNotify";

const SHIFT_LABEL_OPTIONS = ["7시조", "8시조", "9시조", "야간조", "기타"];
const EMPTY_REQUEST_FORM = { agencyId: "", siteId: "", date: "", shiftLabel: SHIFT_LABEL_OPTIONS[0], headcount: 1, note: "" };

// 내부 직원만으로 부족할 때 남강인력 같은 외부 인력사무소에 인원을 요청하는
// 화면 — "연동업체"에서 인력사무소를 코드로 등록해두면, "요청장"에서 날짜별
// 조(예: 7시조/야간조)로 인원을 요청하고, 인력사무소가 자기 화면(에이전시
// 전용 로그인)에서 인원/단가를 채워 배정완료로 넘긴다. 배정된 인력은
// AgencyRequests.jsx가 자동으로 users/schedules에 등록해 스케줄등록·
// 출근현황에 그대로 나타난다.
export default function StaffingAgency() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [tab, setTab] = useState("requests");
  const [links, setLinks] = useState([]);
  const [pendingAgencies, setPendingAgencies] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [requests, setRequests] = useState([]);
  const [companyName, setCompanyName] = useState("");

  const [linkCode, setLinkCode] = useState("");
  const [linking, setLinking] = useState(false);

  const [requestOpen, setRequestOpen] = useState(false);
  const [requestForm, setRequestForm] = useState(EMPTY_REQUEST_FORM);
  const [detailTarget, setDetailTarget] = useState(null);
  const [detailEditMode, setDetailEditMode] = useState(false);
  const [detailForm, setDetailForm] = useState(null);
  const [detailSaving, setDetailSaving] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    getDoc(doc(db, "companies", profile.companyId)).then((s) => setCompanyName(s.data()?.name || ""));
    const unsubs = [
      onSnapshot(query(collection(db, "companyAgencyLinks"), where("companyId", "==", profile.companyId)), (s) =>
        setLinks(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      // 도급사를 지정하지 않고 가입 신청한 인력사무소 전체 — 어느 도급사든
      // 먼저 승인하는 쪽이 그 인력사무소와 자동 연동된다.
      onSnapshot(query(collection(db, "agencies"), where("status", "==", "pending")), (s) =>
        setPendingAgencies(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) =>
        setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "staffingRequests"), where("companyId", "==", profile.companyId)), (s) =>
        setRequests(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";
  const sortedRequests = useMemo(() => [...requests].sort((a, b) => (b.date || "").localeCompare(a.date || "")), [requests]);

  // 이미(다른 도급사에서) 승인된 인력사무소를 코드로 직접 연동한다 — 아직
  // 한 번도 승인된 적 없는 인력사무소는 코드입력이 아니라 아래 "가입승인
  // 대기" 목록에서 승인해야 한다.
  const linkAgency = async () => {
    const code = linkCode.trim().toUpperCase();
    if (!code) return;
    setLinking(true);
    try {
      const snap = await getDoc(doc(db, "agencies", code));
      if (!snap.exists()) {
        toast.error("해당 연동코드의 인력사무소를 찾을 수 없습니다.");
        return;
      }
      if (snap.data().status !== "approved") {
        toast.error("아직 다른 도급사의 승인을 받지 않은 인력사무소입니다.");
        return;
      }
      const linkId = `${profile.companyId}_${code}`;
      await setDoc(doc(db, "companyAgencyLinks", linkId), {
        companyId: profile.companyId,
        agencyId: code,
        agencyName: snap.data().name,
        agencyPhone: snap.data().phone || "",
        status: "approved",
        linkedAt: serverTimestamp(),
      });
      toast.success(`${snap.data().name}가 연동되었습니다`);
      setLinkCode("");
    } catch (err) {
      toast.error(`연동에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setLinking(false);
    }
  };

  const unlinkAgency = async (link) => {
    if (!(await confirm(`${link.agencyName} 연동을 해제하시겠습니까? 기존 요청장 이력은 유지됩니다.`, "delete"))) return;
    await deleteDoc(doc(db, "companyAgencyLinks", link.id));
    toast.success("연동이 해제되었습니다");
  };

  // 인력사무소 가입 신청 승인 — 인력사무소 로그인이 즉시 열리고
  // (agencies.status: approved), 동시에 이 도급사와 자동 연동된다.
  const approveAgencyJoin = async (agency) => {
    if (!(await confirm(`${agency.name}의 가입을 승인하시겠습니까? 승인하면 우리 회사와 자동으로 연동됩니다.`, "save"))) return;
    try {
      await updateDoc(doc(db, "agencies", agency.id), { status: "approved" });
      await setDoc(doc(db, "companyAgencyLinks", `${profile.companyId}_${agency.id}`), {
        companyId: profile.companyId,
        agencyId: agency.id,
        agencyName: agency.name,
        agencyPhone: agency.phone || "",
        linkedAt: serverTimestamp(),
      });
      toast.success(`${agency.name} 가입을 승인했습니다`);
    } catch (err) {
      toast.error(`승인에 실패했습니다: ${err.code || err.message}`);
    }
  };

  const rejectAgencyJoin = async (agency) => {
    if (!(await confirm(`${agency.name}의 가입 신청을 거절하시겠습니까?`, "delete"))) return;
    try {
      await updateDoc(doc(db, "agencies", agency.id), { status: "rejected" });
      toast.success("거절했습니다");
    } catch (err) {
      toast.error(`거절 처리에 실패했습니다: ${err.code || err.message}`);
    }
  };

  const openNewRequest = () => {
    if (links.length === 0) return toast.error("먼저 연동업체를 등록해주세요.");
    setRequestForm({ ...EMPTY_REQUEST_FORM, agencyId: links[0].agencyId, date: new Date().toISOString().slice(0, 10) });
    setRequestOpen(true);
  };

  const submitRequest = async () => {
    if (!requestForm.agencyId || !requestForm.date || !requestForm.headcount) {
      return toast.error("연동업체/날짜/인원수를 입력해주세요.");
    }
    const link = links.find((l) => l.agencyId === requestForm.agencyId);
    try {
      const ref = await addDoc(collection(db, "staffingRequests"), {
        companyId: profile.companyId,
        companyName,
        agencyId: requestForm.agencyId,
        agencyName: link?.agencyName || "",
        siteId: requestForm.siteId || null,
        siteName: siteName_(requestForm.siteId),
        date: requestForm.date,
        shiftLabel: requestForm.shiftLabel,
        headcount: Number(requestForm.headcount) || 1,
        note: requestForm.note,
        status: "requested",
        pendingAction: null,
        requestedBy: profile.id,
        createdAt: serverTimestamp(),
      });
      await notifyAgency({
        agencyId: requestForm.agencyId,
        companyId: profile.companyId,
        type: "register",
        title: "새 요청장이 등록되었습니다",
        message: `${companyName} · ${requestForm.date} · ${requestForm.shiftLabel} · ${requestForm.headcount}명`,
        requestId: ref.id,
      });
      toast.success("요청장이 등록되었습니다");
      setRequestOpen(false);
    } catch (err) {
      toast.error(`등록에 실패했습니다: ${err.code || err.message}`);
    }
  };

  // "요청중"(아직 배정 전) 건만 도급사가 직접 삭제할 수 있다 — 이미 배정된
  // 건은 인력사무소가 실제로 인력을 보낸 상태이므로, 오더삭제요청을 보내
  // 인력사무소의 승인을 받아야 한다.
  const deleteRequest = async (r) => {
    if (!(await confirm("이 요청장을 삭제하시겠습니까?", "delete"))) return;
    await deleteDoc(doc(db, "staffingRequests", r.id));
    await notifyAgency({
      agencyId: r.agencyId,
      companyId: r.companyId,
      type: "delete",
      title: "요청장이 삭제되었습니다",
      message: `${r.companyName} · ${r.date} · ${r.shiftLabel || "-"}`,
      requestId: r.id,
    });
    toast.success("삭제되었습니다");
  };

  // 배정된 인력을 바꾸고 싶을 때 — 도급사가 직접 배정 인력을 지우거나
  // 바꿀 수는 없고, 인력사무소에 변경을 요청해 승인을 받아야 한다.
  // 승인되면 배정이 해제되고 다시 "요청중" 상태로 돌아가 인력사무소가
  // 새로 배정을 진행한다.
  const requestReassign = async (r) => {
    if (!(await confirm(`${r.agencyName}에 배정 인력 변경을 요청하시겠습니까? 인력사무소가 승인해야 진행됩니다.`, "save"))) return;
    try {
      await updateDoc(doc(db, "staffingRequests", r.id), { pendingAction: "reassign", pendingActionAt: serverTimestamp() });
      await notifyAgency({
        agencyId: r.agencyId,
        companyId: r.companyId,
        type: "reassign_request",
        title: "배정 변경요청이 있습니다",
        message: `${r.companyName} · ${r.date} · ${r.shiftLabel || "-"}`,
        requestId: r.id,
      });
      toast.success("배정 변경을 요청했습니다. 인력사무소의 승인을 기다려주세요.");
      closeDetail();
    } catch (err) {
      toast.error(`요청에 실패했습니다: ${err.code || err.message}`);
    }
  };

  // 이미 배정된 요청장을 통째로 취소(삭제)하고 싶을 때도 인력사무소 승인이
  // 필요하다 — 승인되면 배정 인력이 정리되고 상태가 "취소됨"으로 바뀐다.
  const requestCancelOrder = async (r) => {
    if (!(await confirm(`${r.agencyName}에 고용(요청장) 취소를 요청하시겠습니까? 인력사무소가 승인해야 진행됩니다.`, "delete"))) return;
    try {
      await updateDoc(doc(db, "staffingRequests", r.id), { pendingAction: "cancelOrder", pendingActionAt: serverTimestamp() });
      await notifyAgency({
        agencyId: r.agencyId,
        companyId: r.companyId,
        type: "cancel_request",
        title: "고용 취소 요청이 있습니다",
        message: `${r.companyName} · ${r.date} · ${r.shiftLabel || "-"}`,
        requestId: r.id,
      });
      toast.success("고용 취소를 요청했습니다. 인력사무소의 승인을 기다려주세요.");
      closeDetail();
    } catch (err) {
      toast.error(`요청에 실패했습니다: ${err.code || err.message}`);
    }
  };

  // 아직 인력사무소가 결정하지 않은 요청은 도급사가 스스로 취소(철회)할 수
  // 있다.
  const withdrawPendingAction = async (r) => {
    await updateDoc(doc(db, "staffingRequests", r.id), { pendingAction: null });
    toast.success("요청을 취소했습니다");
  };

  const openDetail = (r) => {
    setDetailTarget(r);
    setDetailEditMode(false);
    setDetailForm({
      siteId: r.siteId || "",
      date: r.date || "",
      shiftLabel: r.shiftLabel || SHIFT_LABEL_OPTIONS[0],
      headcount: r.headcount || 1,
      note: r.note || "",
    });
  };
  const closeDetail = () => {
    setDetailTarget(null);
    setDetailEditMode(false);
    setDetailForm(null);
  };

  // 요청 정보(센터/날짜/조/인원/비고)는 도급사가 직접 수정할 수 있지만,
  // 이미 배정된 인력 명단은 여기서 건드릴 수 없다 — 인력을 바꾸려면
  // 아래 "인력변경요청"으로 인력사무소의 승인을 받아야 한다.
  const saveDetailEdit = async () => {
    if (!detailTarget || !detailForm) return;
    setDetailSaving(true);
    try {
      await updateDoc(doc(db, "staffingRequests", detailTarget.id), {
        siteId: detailForm.siteId || null,
        siteName: siteName_(detailForm.siteId),
        date: detailForm.date,
        shiftLabel: detailForm.shiftLabel,
        headcount: Number(detailForm.headcount) || 1,
        note: detailForm.note,
      });
      await notifyAgency({
        agencyId: detailTarget.agencyId,
        companyId: detailTarget.companyId,
        type: "edit",
        title: "요청장 정보가 수정되었습니다",
        message: `${detailTarget.companyName} · ${detailForm.date} · ${detailForm.shiftLabel}`,
        requestId: detailTarget.id,
      });
      toast.success("저장되었습니다");
      closeDetail();
    } catch (err) {
      toast.error(`저장에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setDetailSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Panel icon={Building2} title="외부인력">
        <div className="mb-4 flex w-fit flex-nowrap gap-1 overflow-x-auto overscroll-x-contain rounded-lg bg-slate-100 p-1">
          {[
            { key: "requests", label: "요청장" },
            { key: "links", label: "연동업체" },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium ${tab === t.key ? "bg-white text-primary shadow-sm" : "text-muted"}`}
            >
              {t.label}
              {t.key === "links" && pendingAgencies.length > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                  {pendingAgencies.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "links" && (
          <div className="space-y-4">
            {pendingAgencies.length > 0 && (
              <Card className="overflow-x-auto p-0">
                <p className="px-3 pt-3 text-xs font-medium text-muted">가입승인 대기 ({pendingAgencies.length}건)</p>
                <table className="w-full min-w-[560px] text-center text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-muted">
                      <th className="px-3 py-3 font-semibold">인력사무소명</th>
                      <th className="px-3 py-3 font-semibold">담당자</th>
                      <th className="px-3 py-3 font-semibold">연락처</th>
                      <th className="px-3 py-3 font-semibold">연동코드</th>
                      <th className="px-3 py-3 font-semibold">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingAgencies.map((a) => (
                      <tr key={a.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-3 py-3 text-ink">{a.name}</td>
                        <td className="px-3 py-3 text-ink">{a.contactName || "-"}</td>
                        <td className="px-3 py-3 text-ink">{a.phone || "-"}</td>
                        <td className="px-3 py-3 font-mono text-ink">{a.id}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button type="button" onClick={() => approveAgencyJoin(a)} className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-white">
                              <Check size={13} className="inline" /> 승인
                            </button>
                            <button type="button" onClick={() => rejectAgencyJoin(a)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-danger">
                              <X size={13} className="inline" /> 거절
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
            <Card className="flex flex-wrap items-end gap-2 p-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">인력사무소 연동코드</span>
                <input
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase"
                  value={linkCode}
                  onChange={(e) => setLinkCode(e.target.value)}
                  placeholder="예: AB12CD"
                />
              </label>
              <Button onClick={linkAgency} disabled={linking}>
                <Plus size={14} /> 연동업체 등록
              </Button>
              <p className="w-full text-xs text-muted">이미 다른 도급사의 승인을 받은 인력사무소만 코드로 바로 연동할 수 있습니다.</p>
            </Card>
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[480px] text-center text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-muted">
                    <th className="px-3 py-3 font-semibold">인력사무소명</th>
                    <th className="px-3 py-3 font-semibold">연락처</th>
                    <th className="px-3 py-3 font-semibold">연동코드</th>
                    <th className="px-3 py-3 font-semibold">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((l) => (
                    <tr key={l.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-3 text-ink">{l.agencyName}</td>
                      <td className="px-3 py-3 text-ink">{l.agencyPhone || "-"}</td>
                      <td className="px-3 py-3 font-mono text-ink">{l.agencyId}</td>
                      <td className="px-3 py-3">
                        <button type="button" onClick={() => unlinkAgency(l)} className="text-danger">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {links.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-xs text-muted">등록된 연동업체가 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {tab === "requests" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button onClick={openNewRequest}>
                <Plus size={14} /> 새 요청 등록
              </Button>
            </div>
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[760px] text-center text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-muted">
                    <th className="px-3 py-3 font-semibold">인력사무소</th>
                    <th className="px-3 py-3 font-semibold">센터</th>
                    <th className="px-3 py-3 font-semibold">날짜</th>
                    <th className="px-3 py-3 font-semibold">조</th>
                    <th className="px-3 py-3 font-semibold">요청인원</th>
                    <th className="px-3 py-3 font-semibold">상태</th>
                    <th className="px-3 py-3 font-semibold">금액</th>
                    <th className="px-3 py-3 font-semibold">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRequests.map((r) => (
                    <tr key={r.id} className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50" onDoubleClick={() => openDetail(r)}>
                      <td className="px-3 py-3 text-ink">{r.agencyName}</td>
                      <td className="px-3 py-3 text-ink">{r.siteName || "-"}</td>
                      <td className="px-3 py-3 text-ink">{r.date}</td>
                      <td className="px-3 py-3 text-ink">{r.shiftLabel}</td>
                      <td className="px-3 py-3 text-ink">{r.headcount}명</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col items-center gap-1">
                          <Badge tone={r.status === "assigned" ? "success" : r.status === "cancelled" ? "danger" : "warning"}>
                            {r.status === "assigned" ? "배정완료" : r.status === "cancelled" ? "취소됨" : "요청중"}
                          </Badge>
                          {r.pendingAction && (
                            <span className="text-[10px] font-medium text-warning">
                              {r.pendingAction === "reassign" ? "변경요청 대기중" : "취소요청 대기중"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-ink">{r.totalPrice ? `${r.totalPrice.toLocaleString()}원` : "-"}</td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          {r.pendingAction ? (
                            <button type="button" onClick={() => withdrawPendingAction(r)} className="text-xs font-medium text-muted hover:text-danger">
                              요청 철회
                            </button>
                          ) : r.status === "assigned" ? (
                            <>
                              <button type="button" onClick={() => requestReassign(r)} title="인력변경요청" className="text-muted hover:text-primary">
                                <UserCog size={15} />
                              </button>
                              <button type="button" onClick={() => requestCancelOrder(r)} title="오더삭제요청" className="text-muted hover:text-danger">
                                <Ban size={15} />
                              </button>
                            </>
                          ) : (
                            <button type="button" onClick={() => deleteRequest(r)} className="text-danger">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sortedRequests.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-xs text-muted">등록된 요청장이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          </div>
        )}
      </Panel>

      <Modal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title="외부인력 요청 등록"
        footer={
          <>
            <Button variant="outline" onClick={() => setRequestOpen(false)}>취소</Button>
            <Button onClick={submitRequest}>등록</Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">연동업체 *</span>
            <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={requestForm.agencyId} onChange={(e) => setRequestForm((f) => ({ ...f, agencyId: e.target.value }))}>
              {links.map((l) => (
                <option key={l.agencyId} value={l.agencyId}>{l.agencyName}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
            <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={requestForm.siteId} onChange={(e) => setRequestForm((f) => ({ ...f, siteId: e.target.value }))}>
              <option value="">선택 안함</option>
              {workSites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">날짜 *</span>
            <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={requestForm.date} onChange={(e) => setRequestForm((f) => ({ ...f, date: e.target.value }))} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">조 *</span>
            <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={requestForm.shiftLabel} onChange={(e) => setRequestForm((f) => ({ ...f, shiftLabel: e.target.value }))}>
              {SHIFT_LABEL_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">요청인원 *</span>
            <input type="number" min={1} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={requestForm.headcount} onChange={(e) => setRequestForm((f) => ({ ...f, headcount: e.target.value }))} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">비고</span>
            <textarea className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} value={requestForm.note} onChange={(e) => setRequestForm((f) => ({ ...f, note: e.target.value }))} />
          </label>
        </div>
      </Modal>

      <Modal
        open={!!detailTarget}
        onClose={closeDetail}
        title="요청장 상세"
        footer={
          detailEditMode ? (
            <>
              <Button variant="outline" onClick={() => setDetailEditMode(false)}>취소</Button>
              <Button onClick={saveDetailEdit} disabled={detailSaving}>{detailSaving ? "저장 중..." : "저장"}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={closeDetail}>닫기</Button>
              {detailTarget?.status !== "cancelled" && !detailTarget?.pendingAction && (
                <Button onClick={() => setDetailEditMode(true)}>
                  <Pencil size={13} /> 수정
                </Button>
              )}
            </>
          )
        }
      >
        {detailTarget && detailForm && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 text-ink">
              <p><span className="text-muted">인력사무소</span> {detailTarget.agencyName}</p>
              <p>
                <span className="text-muted">상태</span>{" "}
                {detailTarget.status === "assigned" ? "배정완료" : detailTarget.status === "cancelled" ? "취소됨" : "요청중"}
              </p>
            </div>

            {detailEditMode ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
                  <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={detailForm.siteId} onChange={(e) => setDetailForm((f) => ({ ...f, siteId: e.target.value }))}>
                    <option value="">선택 안함</option>
                    {workSites.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">날짜</span>
                  <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={detailForm.date} onChange={(e) => setDetailForm((f) => ({ ...f, date: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">조</span>
                  <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={detailForm.shiftLabel} onChange={(e) => setDetailForm((f) => ({ ...f, shiftLabel: e.target.value }))}>
                    {SHIFT_LABEL_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">요청인원</span>
                  <input type="number" min={1} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={detailForm.headcount} onChange={(e) => setDetailForm((f) => ({ ...f, headcount: e.target.value }))} />
                </label>
                <label className="col-span-2 block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">비고</span>
                  <textarea className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} value={detailForm.note} onChange={(e) => setDetailForm((f) => ({ ...f, note: e.target.value }))} />
                </label>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-ink">
                <p><span className="text-muted">센터</span> {detailTarget.siteName || "-"}</p>
                <p><span className="text-muted">날짜</span> {detailTarget.date}</p>
                <p><span className="text-muted">조</span> {detailTarget.shiftLabel}</p>
                <p><span className="text-muted">요청인원</span> {detailTarget.headcount}명</p>
                {detailTarget.note && <p className="col-span-2"><span className="text-muted">비고</span> {detailTarget.note}</p>}
              </div>
            )}

            {detailTarget.workers?.length > 0 && (
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-xs font-medium text-muted">배정 인력</p>
                <p className="mb-2 text-[11px] text-muted">
                  배정 인력은 여기서 직접 바꿀 수 없습니다. 인력을 바꾸려면 아래 인력변경요청을 보내 인력사무소의 승인을 받아주세요.
                </p>
                <ul className="space-y-1">
                  {detailTarget.workers.map((w, i) => (
                    <li key={i} className="flex items-center justify-between text-ink">
                      <span>{w.name} {w.phone && `· ${w.phone}`} {w.gender && `· ${w.gender}`}</span>
                      <span className="font-medium">{(w.dailyRate || 0).toLocaleString()}원</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 border-t border-slate-100 pt-2 text-right font-semibold text-primary">
                  합계 {(detailTarget.totalPrice || 0).toLocaleString()}원
                </p>
              </div>
            )}

            {!detailEditMode && detailTarget.status === "assigned" && (
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                {detailTarget.pendingAction ? (
                  <Button variant="outline" onClick={() => withdrawPendingAction(detailTarget)}>
                    요청 철회
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => requestReassign(detailTarget)}>
                      <UserCog size={13} /> 인력변경요청
                    </Button>
                    <Button variant="danger" onClick={() => requestCancelOrder(detailTarget)}>
                      <Ban size={13} /> 오더삭제요청
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
