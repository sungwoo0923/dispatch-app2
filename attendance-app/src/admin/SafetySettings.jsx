import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ShieldCheck, Plus, X } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import { SAFETY_MANAGER_ROLES } from "../utils/safety";

export default function SafetySettings() {
  const { profile } = useAuth();
  const [workSites, setWorkSites] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [managers, setManagers] = useState([]);
  const [assignFor, setAssignFor] = useState(null);
  const [form, setForm] = useState({ adminUid: "", role: SAFETY_MANAGER_ROLES[0] });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubSites = onSnapshot(
      query(collection(db, "workSites"), where("companyId", "==", profile.companyId)),
      (snap) => setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubAdmins = onSnapshot(
      query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "admin")),
      (snap) => setAdmins(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubManagers = onSnapshot(
      query(collection(db, "safetyManagers"), where("companyId", "==", profile.companyId)),
      (snap) => setManagers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubSites();
      unsubAdmins();
      unsubManagers();
    };
  }, [profile?.companyId]);

  const managersFor = (siteId) => managers.filter((m) => m.siteId === siteId);

  const toggleManaged = (site) => updateDoc(doc(db, "workSites", site.id), { safetyManaged: !site.safetyManaged });

  const openAssign = (site) => {
    setAssignFor(site);
    setForm({ adminUid: "", role: SAFETY_MANAGER_ROLES[0] });
  };

  const submitAssign = async (e) => {
    e.preventDefault();
    const admin = admins.find((a) => a.id === form.adminUid);
    if (!admin) return;
    await addDoc(collection(db, "safetyManagers"), {
      companyId: profile.companyId,
      siteId: assignFor.id,
      siteName: assignFor.name,
      adminUid: admin.id,
      adminName: admin.name,
      role: form.role,
      createdAt: serverTimestamp(),
    });
    setAssignFor(null);
  };

  const removeManager = (id) => deleteDoc(doc(db, "safetyManagers", id));

  return (
    <div className="space-y-6">
      <Panel icon={ShieldCheck} title="센터별 안전관리">
        <p className="mb-4 text-xs text-muted">근무지별 안전교육 적용 여부와 안전담당자를 설정합니다.</p>
        <div className="space-y-3">
        {workSites.map((site) => (
          <Card key={site.id} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-primary">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">{site.name}</p>
                  <p className="text-xs text-muted">{site.safetyManaged ? "안전교육 적용 중" : "안전교육 미적용"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleManaged(site)}
                className={`relative h-7 w-12 rounded-full transition-colors ${
                  site.safetyManaged ? "bg-primary" : "bg-slate-200"
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    site.safetyManaged ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {site.safetyManaged && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-muted">안전담당자</p>
                  <Button size="sm" variant="outline" onClick={() => openAssign(site)}>
                    <Plus size={13} /> 담당자 지정
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {managersFor(site.id).map((m) => (
                    <Badge key={m.id} tone="primary" className="pr-1">
                      {m.role} · {m.adminName}
                      <button onClick={() => removeManager(m.id)} className="ml-1 hover:opacity-70">
                        <X size={12} />
                      </button>
                    </Badge>
                  ))}
                  {managersFor(site.id).length === 0 && (
                    <p className="text-xs text-muted">지정된 안전담당자가 없습니다.</p>
                  )}
                </div>
              </div>
            )}
          </Card>
        ))}
        {workSites.length === 0 && (
          <Card className="p-6 text-center text-xs text-muted">등록된 근무지가 없습니다. 근로자 메뉴에서 근무지를 먼저 등록해주세요.</Card>
        )}
        </div>
      </Panel>

      <Modal
        open={Boolean(assignFor)}
        onClose={() => setAssignFor(null)}
        title={`${assignFor?.name} · 안전담당자 지정`}
        footer={
          <>
            <Button variant="outline" onClick={() => setAssignFor(null)}>
              취소
            </Button>
            <Button onClick={submitAssign} disabled={!form.adminUid}>
              지정
            </Button>
          </>
        }
      >
        <form onSubmit={submitAssign} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">역할</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              {SAFETY_MANAGER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">담당 관리자</span>
            <select
              required
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.adminUid}
              onChange={(e) => setForm((f) => ({ ...f, adminUid: e.target.value }))}
            >
              <option value="">선택</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-muted">
              관리자 계정 메뉴에서 전자서명을 등록해야 근로자 서명에 함께 날인됩니다.
            </p>
          </label>
        </form>
      </Modal>
    </div>
  );
}
