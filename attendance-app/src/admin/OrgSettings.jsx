import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc } from "firebase/firestore";
import { Plus, X, Building, KeyRound, Copy, ChevronLeft, Users } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";

function ManageList({ title, collectionName, items, onBack }) {
  const { profile } = useAuth();
  const [value, setValue] = useState("");

  const add = async (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    await addDoc(collection(db, collectionName), { companyId: profile.companyId, name: value.trim() });
    setValue("");
  };

  const remove = (id) => {
    if (!window.confirm("삭제하시겠습니까? 이미 근로자에게 배정된 값이라면 표시가 '-'로 바뀝니다.")) return;
    deleteDoc(doc(db, collectionName, id));
  };

  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-1 text-xs text-muted hover:text-primary">
        <ChevronLeft size={14} /> 목록으로
      </button>
      <form onSubmit={add} className="mb-4 flex flex-nowrap gap-2">
        <input
          className="w-full min-w-0 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`${title} 이름 입력 후 추가`}
        />
        <Button size="sm" type="submit" className="shrink-0">
          <Plus size={14} /> 추가
        </Button>
      </form>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between px-4 py-2.5 text-sm text-ink">
            {item.name}
            <button onClick={() => remove(item.id)} className="text-muted hover:text-danger">
              <X size={14} />
            </button>
          </div>
        ))}
        {items.length === 0 && <p className="px-4 py-6 text-center text-xs text-muted">등록된 {title}이(가) 없습니다.</p>}
      </div>
    </div>
  );
}

export default function OrgSettings() {
  const { profile, company } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState(null); // null | 'dept' | 'pos'

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
        {!mode ? (
          <div className="flex flex-nowrap gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setMode("dept")}>
              <Building size={16} /> 부서관리 ({departments.length})
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setMode("pos")}>
              <Users size={16} /> 직급관리 ({positions.length})
            </Button>
          </div>
        ) : mode === "dept" ? (
          <ManageList title="부서" collectionName="departments" items={departments} onBack={() => setMode(null)} />
        ) : (
          <ManageList title="직급" collectionName="positions" items={positions} onBack={() => setMode(null)} />
        )}
      </Panel>
    </div>
  );
}
