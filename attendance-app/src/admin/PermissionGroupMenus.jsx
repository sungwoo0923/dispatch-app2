import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, setDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { LayoutGrid, RefreshCw, FileSpreadsheet, Save } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";
import { downloadCsv } from "../utils/exportCsv";
import { NAV } from "./navConfig";

const MENU_ITEMS = NAV.flatMap((item) =>
  item.children ? item.children.map((c) => ({ id: c.to, group: item.label, label: c.label })) : [{ id: item.to, group: item.label, label: item.label }]
);

export default function PermissionGroupMenus() {
  const { profile } = useAuth();
  const [groups, setGroups] = useState([]);
  const [access, setAccess] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [checked, setChecked] = useState(() => new Set());

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubGroups = onSnapshot(query(collection(db, "permissionGroups"), where("companyId", "==", profile.companyId)), (s) =>
      setGroups(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubAccess = onSnapshot(query(collection(db, "permissionGroupMenus"), where("companyId", "==", profile.companyId)), (s) =>
      setAccess(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubGroups();
      unsubAccess();
    };
  }, [profile?.companyId]);

  const rows = useMemo(
    () => groups.filter((g) => !search || g.name?.includes(search)).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [groups, search]
  );

  useEffect(() => {
    if (!selectedId) {
      setChecked(new Set());
      return;
    }
    setChecked(new Set(access.filter((a) => a.groupId === selectedId).map((a) => a.menuId)));
  }, [selectedId, access]);

  const toggle = (menuId) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(menuId)) next.delete(menuId);
      else next.add(menuId);
      return next;
    });

  const save = async () => {
    if (!selectedId) return;
    const existing = access.filter((a) => a.groupId === selectedId);
    for (const a of existing) {
      if (!checked.has(a.menuId)) await deleteDoc(doc(db, "permissionGroupMenus", a.id));
    }
    for (const menuId of checked) {
      await setDoc(doc(db, "permissionGroupMenus", `${selectedId}_${menuId.replace(/\//g, "-")}`), {
        companyId: profile.companyId,
        groupId: selectedId,
        menuId,
        createdAt: serverTimestamp(),
      });
    }
  };

  const exportCsv = () => {
    const headers = ["대메뉴", "중메뉴", "사용"];
    downloadCsv("그룹별메뉴", headers, MENU_ITEMS.map((m) => [m.group, m.label, checked.has(m.id) ? "사용" : "미사용"]));
  };

  return (
    <div className="space-y-6">
      <Panel icon={LayoutGrid} title="그룹별메뉴">
        <div className="mb-4 rounded-xl bg-primary-light/40 p-3.5 text-xs leading-relaxed text-primary">
          그룹별 사용할 수 있는 메뉴를 지정할 수 있습니다. 그룹에 적용된 관리자는 그룹 설정된 메뉴만 허용되므로 관리자 별 권한 관리를 효율적으로 할 수
          있습니다.
          <br />
          사전에 등록되어 있어야 할 항목: 권한 &gt; 그룹등록
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

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="mb-2 text-xs font-medium text-muted">그룹목록 {rows.length}</p>
            <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
              <table className="w-full text-center text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-muted">
                    <th className="px-3 py-2.5 font-semibold">순번</th>
                    <th className="px-3 py-2.5 font-semibold">그룹명</th>
                    <th className="px-3 py-2.5 font-semibold">사용</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((g, i) => (
                    <tr
                      key={g.id}
                      onClick={() => setSelectedId(g.id)}
                      className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 ${selectedId === g.id ? "bg-primary-light/40" : ""}`}
                    >
                      <td className="px-3 py-2.5 text-ink">{i + 1}</td>
                      <td className="px-3 py-2.5 text-ink">{g.name}</td>
                      <td className="px-3 py-2.5 text-ink">사용</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-xs text-muted">
                        등록된 그룹이 없습니다. 권한&gt;그룹등록에서 먼저 그룹을 만들어주세요.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
              <p className="text-xs font-medium text-muted">메뉴목록 {MENU_ITEMS.length}</p>
              <div className="flex flex-nowrap gap-2 overflow-x-auto overscroll-x-contain">
                <Button size="sm" variant="outline" onClick={exportCsv}>
                  <FileSpreadsheet size={13} /> 엑셀
                </Button>
                <Button size="sm" onClick={save} disabled={!selectedId}>
                  <Save size={13} /> 저장
                </Button>
              </div>
            </div>
            <div className="max-h-[420px] overflow-y-auto rounded-xl border border-slate-100">
              <table className="w-full text-center text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-xs text-muted">
                    <th className="w-8 px-3 py-2.5"></th>
                    <th className="px-3 py-2.5 font-semibold">순번</th>
                    <th className="px-3 py-2.5 font-semibold">대메뉴</th>
                    <th className="px-3 py-2.5 font-semibold">중메뉴</th>
                  </tr>
                </thead>
                <tbody>
                  {MENU_ITEMS.map((m, i) => (
                    <tr key={m.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={checked.has(m.id)} disabled={!selectedId} onChange={() => toggle(m.id)} />
                      </td>
                      <td className="px-3 py-2.5 text-ink">{i + 1}</td>
                      <td className="px-3 py-2.5 text-ink">{m.group}</td>
                      <td className="px-3 py-2.5 text-ink">{m.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted">그룹에 사용할 메뉴를 선택해 저장하면, 해당 그룹이 연동된 관리자는 그룹에 지정된 메뉴만 접근할 수 있습니다.</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
