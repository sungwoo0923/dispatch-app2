import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Building2, Plus, RefreshCw, FileSpreadsheet } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";
import { downloadCsv } from "../utils/exportCsv";

const EMPTY_FORM = {
  name: "",
  regNumber: "",
  phone: "",
  address: "",
  memberDetailYN: "등록",
  active: "사용",
};

export default function BusinessEntities() {
  const { profile } = useAuth();
  const [entities, setEntities] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

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
    const unsubVendors = onSnapshot(
      query(collection(db, "vendors"), where("companyId", "==", profile.companyId)),
      (snap) => setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubEntities();
      unsubSites();
      unsubVendors();
    };
  }, [profile?.companyId]);

  const rows = useMemo(
    () => entities.filter((e) => !search || e.name?.includes(search)).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [entities, search]
  );

  const inUse = (id) => workSites.some((s) => s.businessEntityId === id) || vendors.some((v) => v.businessEntityId === id);

  const startNew = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
  };

  const select = (e) => {
    setSelectedId(e.id);
    setForm({
      name: e.name || "",
      regNumber: e.regNumber || "",
      phone: e.phone || "",
      address: e.address || "",
      memberDetailYN: e.memberDetailYN || "등록",
      active: e.active || "사용",
    });
  };

  const save = async () => {
    if (!form.name.trim() || !form.regNumber.trim()) return;
    if (selectedId) {
      await updateDoc(doc(db, "businessEntities", selectedId), { ...form });
    } else {
      const ref = await addDoc(collection(db, "businessEntities"), {
        companyId: profile.companyId,
        ...form,
        createdAt: serverTimestamp(),
      });
      setSelectedId(ref.id);
    }
  };

  const remove = async () => {
    if (!selectedId || inUse(selectedId)) return;
    await deleteDoc(doc(db, "businessEntities", selectedId));
    startNew();
  };

  const exportCsv = () => {
    const headers = ["사업자", "사업자등록번호", "사업자전화번호", "사업자주소"];
    downloadCsv("사업자", headers, rows.map((e) => [e.name, e.regNumber, e.phone || "-", e.address || "-"]));
  };

  return (
    <div className="space-y-6">
      <Panel icon={Building2} title="사업자">
        <Card className="mb-4 space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-muted">검색어</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="사업자명 검색"
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
              <p className="text-xs font-medium text-muted">목록 {rows.length}</p>
              <Button size="sm" variant="outline" onClick={exportCsv}>
                <FileSpreadsheet size={13} /> 엑셀
              </Button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full min-w-[560px] text-center text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-muted">
                    <th className="px-3 py-2.5 font-semibold">순번</th>
                    <th className="px-3 py-2.5 font-semibold">사업자</th>
                    <th className="px-3 py-2.5 font-semibold">사업자등록번호</th>
                    <th className="px-3 py-2.5 font-semibold">사업자전화번호</th>
                    <th className="px-3 py-2.5 font-semibold">사업자주소</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e, i) => (
                    <tr
                      key={e.id}
                      onClick={() => select(e)}
                      className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 ${selectedId === e.id ? "bg-primary-light/40" : ""}`}
                    >
                      <td className="px-3 py-2.5 text-muted">{i + 1}</td>
                      <td className="px-3 py-2.5 text-ink">{e.name}</td>
                      <td className="px-3 py-2.5 text-muted">{e.regNumber}</td>
                      <td className="px-3 py-2.5 text-muted">{e.phone || "-"}</td>
                      <td className="px-3 py-2.5 text-muted">{e.address || "-"}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-xs text-muted">
                        등록된 사업자가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto">
              <p className="text-xs font-medium text-muted">상세</p>
              <Button size="sm" variant="outline" onClick={startNew}>
                <Plus size={13} /> 신규
              </Button>
            </div>
            <Card className="space-y-3 p-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">사업자 *</span>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">사업자등록번호 *</span>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="대시(-)를 제외하고 입력하세요"
                    value={form.regNumber}
                    onChange={(e) => setForm((f) => ({ ...f, regNumber: e.target.value }))}
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">사업자전화번호</span>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">사업자주소</span>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-muted">회원상세정보등록여부</span>
                  <div className="flex flex-nowrap gap-4 overflow-x-auto text-sm">
                    {["등록", "미등록"].map((v) => (
                      <label key={v} className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          checked={form.memberDetailYN === v}
                          onChange={() => setForm((f) => ({ ...f, memberDetailYN: v }))}
                        />
                        {v}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-muted">사용여부</span>
                  <div className="flex flex-nowrap gap-4 overflow-x-auto text-sm">
                    {["사용", "미사용"].map((v) => (
                      <label key={v} className="flex items-center gap-1.5">
                        <input type="radio" checked={form.active === v} onChange={() => setForm((f) => ({ ...f, active: v }))} />
                        {v}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-nowrap items-center justify-end gap-2 overflow-x-auto border-t border-slate-100 pt-3">
                <Button
                  variant="outline"
                  onClick={remove}
                  disabled={!selectedId || inUse(selectedId)}
                  title={selectedId && inUse(selectedId) ? "사용 이력이 있어 삭제할 수 없습니다. 미사용 처리해주세요." : ""}
                >
                  삭제
                </Button>
                <Button onClick={save}>저장</Button>
              </div>
            </Card>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-primary-light/40 p-3.5 text-xs leading-relaxed text-primary">
          사이트 하위에 있는 사업자를 등록할 수 있으며 사업자등록번호까지 필수로 입력해야 합니다. 기존 사용이력이 있는 사업자는 삭제가 불가능하며 미사용 처리로만 가능합니다.
          <br />
          회원상세정보등록여부 Y/N: 회원 상세 정보 등록여부를 '미등록'으로 선택하면, 모바일에서 회원 가입 시 상세정보에 해당하는 다음 정보를 입력하지 않고 가입할 수 있습니다. (주민번호, 주소, 급여은행, 급여계좌, 예금주)
        </div>
      </Panel>
    </div>
  );
}
