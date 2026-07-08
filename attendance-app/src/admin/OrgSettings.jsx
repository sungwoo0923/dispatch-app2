import { useEffect, useMemo, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { Plus, Copy, KeyRound, Building, Search, Download, ChevronUp, ChevronDown } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Panel from "../components/Panel";
import { downloadCsv } from "../utils/exportCsv";
import { TEAM_OPTIONS, POSITION_OPTIONS } from "../constants/hr";

// 다른 메뉴 갔다가 부서·직급 관리로 돌아왔을 때 마지막으로 보던 탭을 그대로
// 보여주기 위한 저장소. 컴포넌트가 언마운트되면 useState는 초기화되므로
// sessionStorage에 남겨둔다.
const TAB_KEY = "kpwork_org_settings_tab";

function RankManager({ label, collectionName, presetOptions, items, companyId }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({ mode: "preset", preset: presetOptions[0], custom: "", active: true });
  const [error, setError] = useState("");

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const ao = a.order ?? 9999;
      const bo = b.order ?? 9999;
      if (ao !== bo) return ao - bo;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [items]);

  const filtered = useMemo(() => {
    if (!applied.trim()) return sorted;
    return sorted.filter((i) => i.name?.includes(applied.trim()));
  }, [sorted, applied]);

  const selected = items.find((i) => i.id === selectedId) || null;

  const startNew = () => {
    setSelectedId(null);
    setForm({ mode: "preset", preset: presetOptions[0], custom: "", active: true });
    setError("");
  };
  const selectItem = (item) => {
    setSelectedId(item.id);
    const isPreset = presetOptions.includes(item.name);
    setForm({
      mode: isPreset ? "preset" : "custom",
      preset: isPreset ? item.name : presetOptions[0],
      custom: isPreset ? "" : item.name,
      active: item.active !== "미사용",
    });
    setError("");
  };

  const currentName = (form.mode === "preset" ? form.preset : form.custom).trim();

  const save = async () => {
    if (!currentName) return;
    if (!(await confirm(selected ? `'${currentName}'(으)로 수정하시겠습니까?` : `'${currentName}'을(를) 추가하시겠습니까?`, selected ? "edit" : "save")))
      return;
    setError("");
    try {
      if (selected) {
        await updateDoc(doc(db, collectionName, selected.id), { name: currentName, active: form.active ? "사용" : "미사용" });
      } else {
        await addDoc(collection(db, collectionName), {
          companyId,
          name: currentName,
          active: form.active ? "사용" : "미사용",
          order: items.length,
          createdAt: serverTimestamp(),
        });
      }
      toast.success(selected ? "수정되었습니다" : "저장되었습니다");
      startNew();
    } catch (err) {
      setError(`저장에 실패했습니다: ${err.code || err.message}`);
    }
  };

  const remove = async () => {
    if (!selected) return;
    if (!(await confirm(`'${selected.name}'을(를) 삭제하시겠습니까? 이미 근로자에게 배정된 값이라면 표시가 '-'로 바뀝니다.`, "delete"))) return;
    setError("");
    try {
      await deleteDoc(doc(db, collectionName, selected.id));
      toast.success("삭제되었습니다");
      startNew();
    } catch (err) {
      setError(`삭제에 실패했습니다: ${err.code || err.message}`);
    }
  };

  // order 필드가 없던 예전 문서(회사 개설 시 자동 시딩된 기본값 등)가 섞여있을
  // 수 있어, 순서를 처음 바꾸는 시점에 현재 화면 순서 그대로 order를 채워넣는다.
  const move = async (item, dir) => {
    const idx = sorted.findIndex((i) => i.id === item.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const batch = writeBatch(db);
    sorted.forEach((it, i) => {
      if (it.order !== i) batch.update(doc(db, collectionName, it.id), { order: i });
    });
    batch.update(doc(db, collectionName, sorted[idx].id), { order: swapIdx });
    batch.update(doc(db, collectionName, sorted[swapIdx].id), { order: idx });
    try {
      await batch.commit();
    } catch (err) {
      setError(`순서 변경에 실패했습니다: ${err.code || err.message}`);
    }
  };

  const exportExcel = () => {
    downloadCsv(
      label,
      ["순번", "등록구분", label, "사용여부"],
      filtered.map((item, i) => [i + 1, "관리자", item.name, item.active === "미사용" ? "미사용" : "사용"])
    );
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <p className="shrink-0 text-xs font-medium text-muted">목록 {filtered.length}건</p>
          <div className="flex flex-nowrap items-center gap-2">
            <input
              className="w-32 shrink-0 rounded-lg border border-slate-200 px-2.5 py-2 text-xs"
              placeholder={`${label} 검색`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setApplied(search)}
            />
            <Button size="sm" variant="outline" onClick={() => setApplied(search)}>
              <Search size={13} /> 검색
            </Button>
            <Button size="sm" variant="outline" onClick={exportExcel}>
              <Download size={13} /> 엑셀
            </Button>
          </div>
        </div>
        <div className="-mx-4 overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100 md:-mx-0">
          <table className="w-full min-w-[420px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-xs text-muted">
                <th className="px-3 py-2.5 font-semibold">순번</th>
                <th className="px-3 py-2.5 font-semibold">등록구분</th>
                <th className="px-3 py-2.5 font-semibold">{label}</th>
                <th className="px-3 py-2.5 font-semibold">순서</th>
                <th className="px-3 py-2.5 font-semibold">사용여부</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => (
                <tr
                  key={item.id}
                  onClick={() => selectItem(item)}
                  className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 ${
                    selectedId === item.id ? "bg-primary-light/50" : ""
                  }`}
                >
                  <td className="px-3 py-2.5 text-ink">{i + 1}</td>
                  <td className="px-3 py-2.5 text-ink">관리자</td>
                  <td className="px-3 py-2.5 text-ink">{item.name}</td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => move(item, -1)} className="rounded p-1 text-muted hover:bg-slate-100 hover:text-primary">
                        <ChevronUp size={14} />
                      </button>
                      <button onClick={() => move(item, 1)} className="rounded p-1 text-muted hover:bg-slate-100 hover:text-primary">
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={item.active === "미사용" ? "muted" : "success"}>{item.active === "미사용" ? "미사용" : "사용"}</Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs text-muted">
                    등록된 {label}이(가) 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="h-fit rounded-xl border border-slate-100 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">상세</p>
          <Button size="sm" variant="outline" onClick={startNew}>
            <Plus size={13} /> 신규
          </Button>
        </div>
        <div className="space-y-3">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">{label} *</span>
            <div className="mb-2 flex flex-nowrap gap-3 text-xs text-ink">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={form.mode === "preset"} onChange={() => setForm((f) => ({ ...f, mode: "preset" }))} /> 기본목록에서 선택
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={form.mode === "custom"} onChange={() => setForm((f) => ({ ...f, mode: "custom" }))} /> 직접입력
              </label>
            </div>
            {form.mode === "preset" ? (
              <select
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={form.preset}
                onChange={(e) => setForm((f) => ({ ...f, preset: e.target.value }))}
              >
                {presetOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={form.custom}
                onChange={(e) => setForm((f) => ({ ...f, custom: e.target.value }))}
                placeholder={`${label}명 직접 입력`}
              />
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} /> 사용
          </label>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
        <div className="mt-4 flex flex-nowrap gap-2">
          {selected && (
            <Button variant="danger" className="flex-1" onClick={remove}>
              삭제
            </Button>
          )}
          <Button className="flex-1" onClick={save} disabled={!currentName}>
            저장
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function OrgSettings() {
  const { profile, company } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState(() => sessionStorage.getItem(TAB_KEY) || "dept");

  useEffect(() => {
    sessionStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  const copyCode = () => {
    if (!company?.id) return;
    navigator.clipboard?.writeText(company.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubDept = onSnapshot(query(collection(db, "departments"), where("companyId", "==", profile.companyId)), (snap) =>
      setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubPos = onSnapshot(query(collection(db, "positions"), where("companyId", "==", profile.companyId)), (snap) =>
      setPositions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubDept();
      unsubPos();
    };
  }, [profile?.companyId]);

  return (
    <div className="space-y-6">
      <Panel icon={KeyRound} title="회사 정보">
        <p className="mb-1 text-sm text-ink">{company?.name}</p>
        <p className="mb-3 text-xs text-muted">최고관리자가 이 회사로 접속할 때 필요한 고유 코드입니다.</p>
        <button
          onClick={copyCode}
          className="inline-flex items-center gap-2 rounded-xl bg-primary-light px-4 py-2.5 font-mono text-sm font-bold text-primary hover:bg-primary/10"
        >
          {company?.id} <Copy size={14} />
        </button>
        {copied && <span className="ml-2 text-xs text-primary">복사됨</span>}
      </Panel>

      <Panel icon={Building} title="부서 · 직급 관리">
        <div className="mb-4 flex flex-nowrap gap-1 border-b border-slate-100">
          <button
            onClick={() => setTab("dept")}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === "dept" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            부서관리 ({departments.length})
          </button>
          <button
            onClick={() => setTab("pos")}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === "pos" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            직급관리 ({positions.length})
          </button>
        </div>
        {tab === "dept" ? (
          <RankManager label="부서" collectionName="departments" presetOptions={TEAM_OPTIONS} items={departments} companyId={profile.companyId} />
        ) : (
          <RankManager label="직급" collectionName="positions" presetOptions={POSITION_OPTIONS} items={positions} companyId={profile.companyId} />
        )}
      </Panel>
    </div>
  );
}
