import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { Lock, Plus, RefreshCw, FileSpreadsheet, Save } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";
import { downloadCsv } from "../utils/exportCsv";

export default function PermissionGroups() {
  const { profile } = useAuth();
  const [entities, setEntities] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [siteVendors, setSiteVendors] = useState([]);
  const [groups, setGroups] = useState([]);
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [name, setName] = useState("");
  const [checked, setChecked] = useState(() => new Set());

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (s) =>
        setEntities(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) =>
        setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", profile.companyId)), (s) =>
        setVendors(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "siteVendors"), where("companyId", "==", profile.companyId)), (s) =>
        setSiteVendors(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "permissionGroups"), where("companyId", "==", profile.companyId)), (s) =>
        setGroups(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "permissionGroupMembers"), where("companyId", "==", profile.companyId)), (s) =>
        setMembers(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const rows = useMemo(
    () => groups.filter((g) => !search || g.name?.includes(search)).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [groups, search]
  );

  const entityName = (id) => entities.find((e) => e.id === id)?.name || "-";
  const siteName = (id) => workSites.find((s) => s.id === id)?.name || "-";

  const combos = useMemo(
    () =>
      siteVendors.map((sv) => {
        const site = workSites.find((s) => s.id === sv.siteId);
        const vendor = vendors.find((v) => v.id === sv.vendorId);
        return { key: `${sv.siteId}_${sv.vendorId}`, siteId: sv.siteId, vendorId: sv.vendorId, site, vendor };
      }),
    [siteVendors, workSites, vendors]
  );

  useEffect(() => {
    if (!selectedId) {
      setChecked(new Set());
      return;
    }
    setChecked(new Set(members.filter((m) => m.groupId === selectedId).map((m) => `${m.siteId}_${m.vendorId}`)));
  }, [selectedId, members]);

  const startNew = () => {
    setSelectedId(null);
    setName("");
  };

  const select = (g) => {
    setSelectedId(g.id);
    setName(g.name || "");
  };

  const save = async () => {
    if (!name.trim()) return;
    if (selectedId) {
      await updateDoc(doc(db, "permissionGroups", selectedId), { name });
    } else {
      const ref_ = await addDoc(collection(db, "permissionGroups"), { companyId: profile.companyId, name, createdAt: serverTimestamp() });
      setSelectedId(ref_.id);
    }
  };

  const remove = async () => {
    if (!selectedId) return;
    await deleteDoc(doc(db, "permissionGroups", selectedId));
    for (const m of members.filter((mm) => mm.groupId === selectedId)) await deleteDoc(doc(db, "permissionGroupMembers", m.id));
    startNew();
  };

  const toggleCombo = (key) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const saveMembers = async () => {
    if (!selectedId) return;
    const existing = members.filter((m) => m.groupId === selectedId);
    for (const m of existing) {
      if (!checked.has(`${m.siteId}_${m.vendorId}`)) await deleteDoc(doc(db, "permissionGroupMembers", m.id));
    }
    for (const key of checked) {
      const [siteId, vendorId] = key.split("_");
      await setDoc(doc(db, "permissionGroupMembers", `${selectedId}_${key}`), {
        companyId: profile.companyId,
        groupId: selectedId,
        siteId,
        vendorId,
        createdAt: serverTimestamp(),
      });
    }
  };

  const exportCsv = () => {
    const headers = ["그룹명", "사업자", "센터", "소속업체"];
    const memberRows = members
      .filter((m) => !selectedId || m.groupId === selectedId)
      .map((m) => {
        const g = groups.find((x) => x.id === m.groupId);
        const site = workSites.find((x) => x.id === m.siteId);
        const vendor = vendors.find((x) => x.id === m.vendorId);
        return [g?.name || "-", entityName(site?.businessEntityId), site?.name || "-", vendor?.name || "-"];
      });
    downloadCsv("그룹소속", headers, memberRows);
  };

  return (
    <div className="space-y-6">
      <Panel icon={Lock} title="그룹등록">
        <div className="mb-4 rounded-xl bg-primary-light/40 p-3.5 text-xs leading-relaxed text-primary">
          사이트 관리자는 업체 환경에 맞게 관리자 메뉴와 권한을 그룹으로 설정해 센터에 적용할 수 있습니다. 그룹 설정을 통해 메뉴 접근 및 권한 관리를 보다
          효율적으로 운영할 수 있습니다.
          <br />
          사전에 등록되어 있어야 할 항목: 조직 &gt; 센터 (센터정보, 소속업체)
        </div>

        <Card className="mb-4 space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-muted">검색어</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="그룹명 검색"
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

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
              <p className="text-xs font-medium text-muted">그룹목록 {rows.length}</p>
              <Button size="sm" variant="outline" onClick={exportCsv}>
                <FileSpreadsheet size={13} /> 엑셀
              </Button>
            </div>
            <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
              <table className="w-full text-center text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-muted">
                    <th className="px-3 py-2.5 font-semibold">순번</th>
                    <th className="px-3 py-2.5 font-semibold">그룹명</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((g, i) => (
                    <tr
                      key={g.id}
                      onClick={() => select(g)}
                      className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 ${selectedId === g.id ? "bg-primary-light/40" : ""}`}
                    >
                      <td className="px-3 py-2.5 text-ink">{i + 1}</td>
                      <td className="px-3 py-2.5 text-ink">{g.name}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-3 py-6 text-center text-xs text-muted">
                        등록된 그룹이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <Card className="mt-3 space-y-3 p-4">
              <div className="flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
                <p className="text-sm font-semibold text-ink">상세</p>
                <Button size="sm" variant="outline" onClick={startNew}>
                  <Plus size={13} /> 신규
                </Button>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">그룹명</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="flex flex-nowrap items-center justify-end gap-2 overflow-x-auto overscroll-x-contain border-t border-slate-100 pt-3">
                <Button variant="outline" onClick={remove} disabled={!selectedId}>
                  삭제
                </Button>
                <Button onClick={save}>저장</Button>
              </div>
            </Card>
          </div>

          <div>
            <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
              <p className="text-xs font-medium text-muted">
                그룹소속 목록 {checked.size}
                <span className="ml-2 text-[11px]">* 조직&gt;센터에서 소속업체까지 등록해야 하위 데이터가 조회됩니다.</span>
              </p>
              <Button size="sm" onClick={saveMembers} disabled={!selectedId}>
                <Save size={13} /> 저장
              </Button>
            </div>
            <div className="max-h-[420px] overflow-y-auto rounded-xl border border-slate-100">
              <table className="w-full text-center text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-xs text-muted">
                    <th className="w-8 px-3 py-2.5"></th>
                    <th className="px-3 py-2.5 font-semibold">그룹명</th>
                    <th className="px-3 py-2.5 font-semibold">사업자</th>
                    <th className="px-3 py-2.5 font-semibold">센터</th>
                    <th className="px-3 py-2.5 font-semibold">소속업체</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedId &&
                    combos.map((c) => (
                      <tr key={c.key} className="border-b border-slate-50 last:border-0">
                        <td className="px-3 py-2.5">
                          <input type="checkbox" checked={checked.has(c.key)} onChange={() => toggleCombo(c.key)} />
                        </td>
                        <td className="px-3 py-2.5 text-ink">{name}</td>
                        <td className="px-3 py-2.5 text-ink">{entityName(c.site?.businessEntityId)}</td>
                        <td className="px-3 py-2.5 text-ink">{c.site?.name || "-"}</td>
                        <td className="px-3 py-2.5 text-ink">{c.vendor?.name || "-"}</td>
                      </tr>
                    ))}
                  {(!selectedId || combos.length === 0) && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-xs text-muted">
                        {selectedId ? "조직>센터에서 소속업체가 연결된 센터가 없습니다." : "그룹을 먼저 선택하세요."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              원하는 그룹을 생성한 뒤, 그룹 목록에서 선택하여 해당 그룹에 포함시킬 센터·소속업체를 선택하고 저장하면 해당 센터들을 그룹으로 묶어 효율적으로
              관리할 수 있습니다.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
