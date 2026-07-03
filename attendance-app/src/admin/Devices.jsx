import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { Smartphone, Plus, RefreshCw, FileSpreadsheet } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";
import { downloadCsv } from "../utils/exportCsv";

const DEVICE_TYPES = ["BEACON", "TABLET"];

const EMPTY_FORM = { type: "", code: "", password: "", deviceName: "", deviceId: "" };

export default function Devices() {
  const { profile } = useAuth();
  const [entities, setEntities] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [devices, setDevices] = useState([]);
  const [siteDevices, setSiteDevices] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const [assignDeviceId, setAssignDeviceId] = useState(null);
  const [assignForm, setAssignForm] = useState({ businessEntityId: "", siteId: "" });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubEntities = onSnapshot(
      query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)),
      (snap) => setEntities(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubSites = onSnapshot(
      query(collection(db, "workSites"), where("companyId", "==", profile.companyId)),
      (snap) => setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubDevices = onSnapshot(
      query(collection(db, "devices"), where("companyId", "==", profile.companyId)),
      (snap) => setDevices(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubSiteDevices = onSnapshot(
      query(collection(db, "siteDevices"), where("companyId", "==", profile.companyId)),
      (snap) => setSiteDevices(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubEntities();
      unsubSites();
      unsubDevices();
      unsubSiteDevices();
    };
  }, [profile?.companyId]);

  const rows = useMemo(
    () => devices.filter((d) => !search || d.deviceName?.includes(search)).sort((a, b) => (a.code || "").localeCompare(b.code || "")),
    [devices, search]
  );

  const startNew = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
  };

  const select = (d) => {
    setSelectedId(d.id);
    setForm({ type: d.type || "", code: d.code || "", password: d.password || "", deviceName: d.deviceName || "", deviceId: d.deviceId || "" });
  };

  const save = async () => {
    if (!form.type || !form.code.trim()) return;
    if (selectedId) {
      await updateDoc(doc(db, "devices", selectedId), form);
    } else {
      const ref_ = await addDoc(collection(db, "devices"), { companyId: profile.companyId, ...form, createdAt: serverTimestamp() });
      setSelectedId(ref_.id);
    }
  };

  const remove = async () => {
    if (!selectedId) return;
    await deleteDoc(doc(db, "devices", selectedId));
    startNew();
  };

  const siteLink = (deviceId) => siteDevices.find((sd) => sd.deviceId === deviceId);

  const openAssign = (d) => {
    setAssignDeviceId(d.id);
    const link = siteLink(d.id);
    setAssignForm({ businessEntityId: link?.businessEntityId || "", siteId: link?.siteId || "" });
  };

  const saveAssign = async () => {
    if (!assignDeviceId || !assignForm.businessEntityId || !assignForm.siteId) return;
    await setDoc(doc(db, "siteDevices", assignDeviceId), {
      companyId: profile.companyId,
      deviceId: assignDeviceId,
      businessEntityId: assignForm.businessEntityId,
      siteId: assignForm.siteId,
      createdAt: serverTimestamp(),
    });
  };

  const removeAssign = async () => {
    if (!assignDeviceId) return;
    await deleteDoc(doc(db, "siteDevices", assignDeviceId));
    setAssignForm({ businessEntityId: "", siteId: "" });
  };

  const exportCsv = () => {
    const headers = ["장치유형", "장치코드", "비밀번호", "장치명"];
    downloadCsv("디바이스", headers, rows.map((d) => [d.type, d.code, d.password || "-", d.deviceName || "-"]));
  };

  const entityName = (id) => entities.find((e) => e.id === id)?.name || "-";
  const siteName = (id) => workSites.find((s) => s.id === id)?.name || "-";

  return (
    <div className="space-y-6">
      <Panel icon={Smartphone} title="디바이스">
        <Card className="mb-4 space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-muted">검색어</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="장치명을 입력하세요."
              />
            </label>
            <div className="flex items-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50"
                title="새로고침"
                onClick={() => setSearch("")}
              >
                <RefreshCw size={16} />
              </button>
              <Button>검색</Button>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto">
              <p className="text-xs font-medium text-muted">장치 {rows.length}</p>
              <div className="flex flex-nowrap gap-2 overflow-x-auto">
                <Button size="sm" onClick={startNew}>
                  <Plus size={13} /> 신규
                </Button>
                <Button size="sm" variant="outline" onClick={exportCsv}>
                  <FileSpreadsheet size={13} /> 엑셀
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-muted">
                    <th className="px-3 py-2.5 font-medium">순번</th>
                    <th className="px-3 py-2.5 font-medium">장치유형</th>
                    <th className="px-3 py-2.5 font-medium">장치코드</th>
                    <th className="px-3 py-2.5 font-medium">비밀번호</th>
                    <th className="px-3 py-2.5 font-medium">장치명</th>
                    <th className="px-3 py-2.5 font-medium">센터등록</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d, i) => {
                    const link = siteLink(d.id);
                    return (
                      <tr
                        key={d.id}
                        onClick={() => select(d)}
                        className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 ${selectedId === d.id ? "bg-primary-light/40" : ""}`}
                      >
                        <td className="px-3 py-2.5 text-muted">{i + 1}</td>
                        <td className="px-3 py-2.5 text-muted">{d.type}</td>
                        <td className="px-3 py-2.5 text-ink">{d.code}</td>
                        <td className="px-3 py-2.5 text-muted">{d.password || "-"}</td>
                        <td className="px-3 py-2.5 text-muted">{d.deviceName || "-"}</td>
                        <td className="px-3 py-2.5 text-muted">{link ? siteName(link.siteId) : "-"}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted">
                        등록된 장치가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted">디바이스(테블릿,비콘) 수량 제한은 없습니다.</p>
          </div>

          <div className="space-y-4">
            <Card className="space-y-3 p-4">
              <p className="text-sm font-semibold text-ink">장치 상세</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">장치유형 *</span>
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  >
                    <option value="">선택</option>
                    {DEVICE_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">장치코드 *</span>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">비밀번호</span>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">장치명</span>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form.deviceName}
                    onChange={(e) => setForm((f) => ({ ...f, deviceName: e.target.value }))}
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">장치ID</span>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.deviceId}
                  onChange={(e) => setForm((f) => ({ ...f, deviceId: e.target.value }))}
                />
              </label>
              <div className="flex flex-nowrap items-center justify-end gap-2 overflow-x-auto border-t border-slate-100 pt-3">
                <Button variant="outline" onClick={remove} disabled={!selectedId}>
                  삭제
                </Button>
                <Button onClick={save}>저장</Button>
              </div>
            </Card>

            <Card className="space-y-3 p-4">
              <p className="text-sm font-semibold text-ink">디바이스 센터 등록</p>
              {selectedId ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">사업자 *</span>
                      <select
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={assignDeviceId === selectedId ? assignForm.businessEntityId : ""}
                        onChange={(e) => {
                          setAssignDeviceId(selectedId);
                          setAssignForm((f) => ({ ...f, businessEntityId: e.target.value }));
                        }}
                        onFocus={() => assignDeviceId !== selectedId && openAssign(devices.find((d) => d.id === selectedId))}
                      >
                        <option value="">선택</option>
                        {entities.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">센터 *</span>
                      <select
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={assignDeviceId === selectedId ? assignForm.siteId : ""}
                        onChange={(e) => {
                          setAssignDeviceId(selectedId);
                          setAssignForm((f) => ({ ...f, siteId: e.target.value }));
                        }}
                      >
                        <option value="">선택</option>
                        {workSites
                          .filter((s) => !assignForm.businessEntityId || s.businessEntityId === assignForm.businessEntityId)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-nowrap items-center justify-end gap-2 overflow-x-auto border-t border-slate-100 pt-3">
                    <Button variant="outline" onClick={removeAssign}>
                      삭제
                    </Button>
                    <Button onClick={saveAssign}>저장</Button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted">먼저 좌측에서 장치를 선택하세요.</p>
              )}
            </Card>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-primary-light/40 p-3.5 text-xs leading-relaxed text-primary">
          Step1. 장치 신규 클릭 → Step2. 장치유형(테블릿,비콘) 및 장치코드·장치명을 입력 → Step3. 저장. 신규 생성된 장치를 선택 후 디바이스 센터 등록에서
          사용할 사업자와 센터를 저장하면 해당 센터에 연결됩니다.
        </div>
      </Panel>
    </div>
  );
}
