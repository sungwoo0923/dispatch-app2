import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Lock, Plus, RefreshCw, LayoutGrid } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Panel from "../components/Panel";

// 그룹등록: 이 회사의 관리자를 묶을 "권한 그룹"을 만들고 이름을 관리한다.
// 각 그룹에 어떤 메뉴를 허용할지는 권한 > 그룹별메뉴에서, 어떤 관리자를 이
// 그룹에 넣을지는 설정 > 관리자계정에서 설정한다 — 이 화면은 그룹 자체의
// 생성/이름변경/삭제만 담당해, 예전처럼 센터·소속업체 조합과 뒤섞이지 않는다.
export default function PermissionGroups() {
  const { profile } = useAuth();
  const [groups, setGroups] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "permissionGroups"), where("companyId", "==", profile.companyId)), (s) =>
        setGroups(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "admin")), (s) =>
        setAdmins(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => !a.deleted))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const rows = useMemo(
    () => groups.filter((g) => !search || g.name?.includes(search)).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [groups, search]
  );

  const memberCount = (groupId) => admins.filter((a) => a.groupId === groupId).length;
  const members = useMemo(() => admins.filter((a) => a.groupId === selectedId), [admins, selectedId]);

  const startNew = () => {
    setSelectedId(null);
    setName("");
    setDescription("");
  };

  const select = (g) => {
    setSelectedId(g.id);
    setName(g.name || "");
    setDescription(g.description || "");
  };

  const save = async () => {
    if (!name.trim()) return;
    if (selectedId) {
      await updateDoc(doc(db, "permissionGroups", selectedId), { name, description });
    } else {
      const ref = await addDoc(collection(db, "permissionGroups"), {
        companyId: profile.companyId,
        name,
        description,
        createdAt: serverTimestamp(),
      });
      setSelectedId(ref.id);
    }
  };

  const remove = async () => {
    if (!selectedId) return;
    await deleteDoc(doc(db, "permissionGroups", selectedId));
    startNew();
  };

  return (
    <div className="space-y-6">
      <Panel icon={Lock} title="그룹등록">
        <div className="mb-4 rounded-xl bg-primary-light/40 p-3.5 text-xs leading-relaxed text-primary">
          관리자 권한을 그룹 단위로 관리할 수 있습니다. 그룹을 만든 뒤 <b>권한 &gt; 그룹별메뉴</b>에서 그룹이 사용할 수 있는 메뉴를 지정하고,{" "}
          <b>설정 &gt; 관리자 계정</b>에서 각 관리자를 원하는 그룹에 배정하세요. 그룹이 지정되지 않은 관리자는 지금처럼 모든 메뉴에 제한 없이 접근합니다.
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

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="mb-2 text-xs font-medium text-muted">그룹목록 {rows.length}</p>
            <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
              <table className="w-full text-center text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-muted">
                    <th className="px-3 py-2.5 font-semibold">순번</th>
                    <th className="px-3 py-2.5 font-semibold">그룹명</th>
                    <th className="px-3 py-2.5 font-semibold">소속 관리자</th>
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
                      <td className="px-3 py-2.5 text-ink">{memberCount(g.id)}명</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-xs text-muted">
                        등록된 그룹이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <Card className="space-y-3 p-4">
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
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">설명 (선택)</span>
                <textarea
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="예: 센터 담당자용, 급여만 조회 가능 등"
                />
              </label>
              <div className="flex flex-nowrap items-center justify-end gap-2 overflow-x-auto overscroll-x-contain border-t border-slate-100 pt-3">
                <Button variant="outline" onClick={remove} disabled={!selectedId}>
                  삭제
                </Button>
                <Button onClick={save}>저장</Button>
              </div>
            </Card>

            {selectedId && (
              <Card className="mt-3 space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">이 그룹에 속한 관리자 {members.length}명</p>
                  <Link to="/permissions/menus" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    <LayoutGrid size={13} /> 메뉴 설정하러 가기
                  </Link>
                </div>
                {members.length === 0 ? (
                  <p className="text-xs text-muted">설정 &gt; 관리자 계정에서 관리자를 이 그룹에 배정할 수 있습니다.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {members.map((a) => (
                      <Badge key={a.id} tone="muted">
                        {a.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
