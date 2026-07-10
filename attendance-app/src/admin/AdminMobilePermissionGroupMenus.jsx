import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, setDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Save } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import Button from "../components/Button";
import { NAV } from "./navConfig";

const MENU_ITEMS = NAV.flatMap((item) =>
  item.children ? item.children.map((c) => ({ id: c.to, group: item.label, label: c.label })) : [{ id: item.to, group: item.label, label: item.label }]
);
const MENU_GROUPS = [...new Set(MENU_ITEMS.map((m) => m.group))];

// 그룹별메뉴의 모바일 전용 화면 — 상단에서 그룹을 선택하고, 섹션별로 묶인
// 메뉴 체크리스트를 토글한 뒤 저장 버튼 한 번으로 반영한다.
export default function AdminMobilePermissionGroupMenus() {
  const { profile } = useAuth();
  const toast = useToast();
  const [groups, setGroups] = useState([]);
  const [access, setAccess] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [checked, setChecked] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "permissionGroups"), where("companyId", "==", profile.companyId)), (s) => setGroups(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "permissionGroupMenus"), where("companyId", "==", profile.companyId)), (s) => setAccess(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const sortedGroups = useMemo(() => [...groups].sort((a, b) => (a.name || "").localeCompare(b.name || "")), [groups]);

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
    setSaving(true);
    try {
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
      toast.success("저장되었습니다");
    } catch (err) {
      toast.error(`저장에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div>
        <p className="text-sm font-semibold text-ink">그룹별메뉴</p>
        <p className="mt-0.5 text-xs text-muted">그룹을 선택해 사용할 메뉴를 지정하세요</p>
      </div>

      {sortedGroups.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">등록된 그룹이 없습니다. 권한&gt;그룹등록에서 먼저 그룹을 만들어주세요.</div>
      ) : (
        <>
          <div className="flex flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain">
            {sortedGroups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedId(g.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${selectedId === g.id ? "bg-primary text-white" : "bg-white text-muted border border-slate-200"}`}
              >
                {g.name}
              </button>
            ))}
          </div>

          {selectedId ? (
            <>
              <div className="space-y-3">
                {MENU_GROUPS.map((group) => (
                  <div key={group} className="rounded-xl border border-slate-200 bg-white p-3.5">
                    <p className="mb-2 text-xs font-semibold text-ink">{group}</p>
                    <div className="space-y-1.5">
                      {MENU_ITEMS.filter((m) => m.group === group).map((m) => (
                        <label key={m.id} className="flex items-center gap-2.5 py-1 text-sm text-ink">
                          <input type="checkbox" checked={checked.has(m.id)} onChange={() => toggle(m.id)} />
                          {m.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="sticky bottom-16 pt-1">
                <Button className="w-full shadow-lg" onClick={save} disabled={saving}>
                  <Save size={14} /> {saving ? "저장 중..." : "저장"}
                </Button>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">위에서 그룹을 선택하세요.</div>
          )}
        </>
      )}
    </div>
  );
}
