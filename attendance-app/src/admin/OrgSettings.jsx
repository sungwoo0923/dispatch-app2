import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc } from "firebase/firestore";
import { Plus, X, Building, KeyRound, Copy } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";

function EditableList({ title, collectionName, items }) {
  const { profile } = useAuth();
  const [value, setValue] = useState("");

  const add = async (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    await addDoc(collection(db, collectionName), { companyId: profile.companyId, name: value.trim() });
    setValue("");
  };

  const remove = (id) => deleteDoc(doc(db, collectionName, id));

  return (
    <Card className="p-5">
      <p className="mb-3 text-sm font-semibold text-ink">{title}</p>
      <form onSubmit={add} className="mb-3 flex gap-2">
        <input
          className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="이름 입력 후 추가"
        />
        <Button size="sm" type="submit">
          <Plus size={14} /> 추가
        </Button>
      </form>
      <div className="flex flex-nowrap gap-2 overflow-x-auto">
        {items.map((item) => (
          <span key={item.id} className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1.5 pl-3 pr-2 text-sm text-ink">
            {item.name}
            <button onClick={() => remove(item.id)} className="text-muted hover:text-danger">
              <X size={13} />
            </button>
          </span>
        ))}
        {items.length === 0 && <p className="text-xs text-muted">등록된 항목이 없습니다.</p>}
      </div>
    </Card>
  );
}

export default function OrgSettings() {
  const { profile, company } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [copied, setCopied] = useState(false);

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
        <p className="mb-3 text-xs text-muted">관리자 로그인 시 이메일·비밀번호와 함께 아래 회사코드를 입력해야 합니다.</p>
        <button
          onClick={copyCode}
          className="inline-flex items-center gap-2 rounded-xl bg-primary-light px-4 py-2.5 font-mono text-sm font-bold text-primary hover:bg-primary/10"
        >
          {company?.id} <Copy size={14} />
        </button>
        {copied && <span className="ml-2 text-xs text-primary">복사됨</span>}
      </Panel>

      <Panel icon={Building} title="부서 · 직급 관리">
        <p className="mb-4 text-xs text-muted">근로자 등록 시 사용할 부서와 직급 목록입니다.</p>
        <div className="space-y-4">
          <EditableList title="부서" collectionName="departments" items={departments} />
          <EditableList title="직급" collectionName="positions" items={positions} />
        </div>
      </Panel>
    </div>
  );
}
