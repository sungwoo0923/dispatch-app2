import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { Plus, MapPin, Check } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { POSITION_OPTIONS, EMPLOYMENT_STATUS_OPTIONS } from "../constants/hr";

export default function EmployeeList() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [siteForm, setSiteForm] = useState({ name: "", lat: "", lng: "", radiusM: 100 });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubUsers = onSnapshot(
      query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")),
      (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubSites = onSnapshot(
      query(collection(db, "workSites"), where("companyId", "==", profile.companyId)),
      (snap) => setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubUsers();
      unsubSites();
    };
  }, [profile?.companyId]);

  const approve = (uid) => updateDoc(doc(db, "users", uid), { approved: true });

  const assignSite = (uid, workSiteId) => updateDoc(doc(db, "users", uid), { workSiteId: workSiteId || null });

  const updateField = (uid, field, value) => updateDoc(doc(db, "users", uid), { [field]: value });

  const createSite = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "workSites"), {
      companyId: profile.companyId,
      name: siteForm.name,
      lat: parseFloat(siteForm.lat),
      lng: parseFloat(siteForm.lng),
      radiusM: Number(siteForm.radiusM) || 100,
      createdAt: serverTimestamp(),
    });
    setSiteForm({ name: "", lat: "", lng: "", radiusM: 100 });
    setSiteModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-ink">근로자 관리</h1>
          <p className="text-sm text-muted">전체 {employees.length}명</p>
        </div>
        <Button variant="outline" onClick={() => setSiteModalOpen(true)}>
          <MapPin size={16} /> 근무지 추가
        </Button>
      </div>

      {workSites.length === 0 && (
        <Card className="p-4 text-xs text-warning">
          아직 등록된 근무지가 없습니다. 근무지를 먼저 추가해야 직원에게 배정하고 자동출근을 사용할 수 있습니다.
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="px-4 py-3 font-medium">이름</th>
              <th className="px-4 py-3 font-medium">연락처</th>
              <th className="px-4 py-3 font-medium">직급</th>
              <th className="px-4 py-3 font-medium">재직상태</th>
              <th className="px-4 py-3 font-medium">근무지</th>
              <th className="px-4 py-3 font-medium">승인</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 text-ink">{emp.name}</td>
                <td className="px-4 py-3 text-muted">{emp.phone}</td>
                <td className="px-4 py-3">
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    value={emp.position || ""}
                    onChange={(e) => updateField(emp.id, "position", e.target.value)}
                  >
                    <option value="">-</option>
                    {POSITION_OPTIONS.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    value={emp.employmentStatus || "재직"}
                    onChange={(e) => updateField(emp.id, "employmentStatus", e.target.value)}
                  >
                    {EMPLOYMENT_STATUS_OPTIONS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    value={emp.workSiteId || ""}
                    onChange={(e) => assignSite(emp.id, e.target.value)}
                  >
                    <option value="">미배정</option>
                    {workSites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  {emp.approved ? (
                    <Badge tone="success">
                      <Check size={12} /> 승인됨
                    </Badge>
                  ) : (
                    <Button size="sm" onClick={() => approve(emp.id)}>
                      승인
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted">
                  가입한 직원이 없습니다. 초대코드를 직원에게 공유해주세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={siteModalOpen}
        onClose={() => setSiteModalOpen(false)}
        title="근무지 추가"
        footer={
          <>
            <Button variant="outline" onClick={() => setSiteModalOpen(false)}>
              취소
            </Button>
            <Button onClick={createSite}>추가</Button>
          </>
        }
      >
        <form onSubmit={createSite} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">근무지명</span>
            <input
              required
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={siteForm.name}
              onChange={(e) => setSiteForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="물류센터1"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">위도(lat)</span>
              <input
                required
                type="number"
                step="any"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={siteForm.lat}
                onChange={(e) => setSiteForm((f) => ({ ...f, lat: e.target.value }))}
                placeholder="37.5665"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">경도(lng)</span>
              <input
                required
                type="number"
                step="any"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={siteForm.lng}
                onChange={(e) => setSiteForm((f) => ({ ...f, lng: e.target.value }))}
                placeholder="126.9780"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">자동출근 반경(m)</span>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={siteForm.radiusM}
              onChange={(e) => setSiteForm((f) => ({ ...f, radiusM: e.target.value }))}
            />
          </label>
          <p className="text-[11px] text-muted">
            위도/경도는 지도 앱(구글맵 등)에서 근무지를 검색해 좌표를 복사해 넣어주세요.
          </p>
        </form>
      </Modal>
    </div>
  );
}
