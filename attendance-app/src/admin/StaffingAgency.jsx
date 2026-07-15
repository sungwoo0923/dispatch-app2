import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, addDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { Building2, Plus, Trash2 } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Panel from "../components/Panel";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";

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
  const [workSites, setWorkSites] = useState([]);
  const [requests, setRequests] = useState([]);
  const [companyName, setCompanyName] = useState("");

  const [linkCode, setLinkCode] = useState("");
  const [linking, setLinking] = useState(false);

  const [requestOpen, setRequestOpen] = useState(false);
  const [requestForm, setRequestForm] = useState(EMPTY_REQUEST_FORM);
  const [detailTarget, setDetailTarget] = useState(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    getDoc(doc(db, "companies", profile.companyId)).then((s) => setCompanyName(s.data()?.name || ""));
    const unsubs = [
      onSnapshot(query(collection(db, "companyAgencyLinks"), where("companyId", "==", profile.companyId)), (s) =>
        setLinks(s.docs.map((d) => ({ id: d.id, ...d.data() })))
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
      const linkId = `${profile.companyId}_${code}`;
      await setDoc(doc(db, "companyAgencyLinks", linkId), {
        companyId: profile.companyId,
        agencyId: code,
        agencyName: snap.data().name,
        agencyPhone: snap.data().phone || "",
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
      await addDoc(collection(db, "staffingRequests"), {
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
        requestedBy: profile.id,
        createdAt: serverTimestamp(),
      });
      toast.success("요청장이 등록되었습니다");
      setRequestOpen(false);
    } catch (err) {
      toast.error(`등록에 실패했습니다: ${err.code || err.message}`);
    }
  };

  const deleteRequest = async (r) => {
    if (!(await confirm("이 요청장을 삭제하시겠습니까?", "delete"))) return;
    await deleteDoc(doc(db, "staffingRequests", r.id));
    toast.success("삭제되었습니다");
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
            </button>
          ))}
        </div>

        {tab === "links" && (
          <div className="space-y-4">
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
                    <tr key={r.id} className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50" onDoubleClick={() => setDetailTarget(r)}>
                      <td className="px-3 py-3 text-ink">{r.agencyName}</td>
                      <td className="px-3 py-3 text-ink">{r.siteName || "-"}</td>
                      <td className="px-3 py-3 text-ink">{r.date}</td>
                      <td className="px-3 py-3 text-ink">{r.shiftLabel}</td>
                      <td className="px-3 py-3 text-ink">{r.headcount}명</td>
                      <td className="px-3 py-3">
                        <Badge tone={r.status === "assigned" ? "success" : "warning"}>{r.status === "assigned" ? "배정완료" : "요청중"}</Badge>
                      </td>
                      <td className="px-3 py-3 text-ink">{r.totalPrice ? `${r.totalPrice.toLocaleString()}원` : "-"}</td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => deleteRequest(r)} className="text-danger">
                          <Trash2 size={15} />
                        </button>
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

      <Modal open={!!detailTarget} onClose={() => setDetailTarget(null)} title="요청장 상세">
        {detailTarget && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 text-ink">
              <p><span className="text-muted">인력사무소</span> {detailTarget.agencyName}</p>
              <p><span className="text-muted">상태</span> {detailTarget.status === "assigned" ? "배정완료" : "요청중"}</p>
              <p><span className="text-muted">센터</span> {detailTarget.siteName || "-"}</p>
              <p><span className="text-muted">날짜</span> {detailTarget.date}</p>
              <p><span className="text-muted">조</span> {detailTarget.shiftLabel}</p>
              <p><span className="text-muted">요청인원</span> {detailTarget.headcount}명</p>
            </div>
            {detailTarget.note && <p className="text-muted">비고: {detailTarget.note}</p>}
            {detailTarget.workers?.length > 0 && (
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-xs font-medium text-muted">배정 인력</p>
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
          </div>
        )}
      </Modal>
    </div>
  );
}
