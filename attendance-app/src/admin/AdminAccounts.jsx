import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { UserPlus, Copy, ShieldCheck } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { generateInviteCode } from "../utils/ids";

export default function AdminAccounts() {
  const { profile } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [open, setOpen] = useState(false);
  const [issuedCode, setIssuedCode] = useState("");

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "admin")),
      (snap) => setAdmins(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId]);

  const issueInvite = async () => {
    const code = generateInviteCode(8);
    await setDoc(doc(db, "adminInvites", code), {
      companyId: profile.companyId,
      createdAt: serverTimestamp(),
    });
    setIssuedCode(code);
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-ink">관리자 계정</h1>
          <p className="text-sm text-muted">회사 관리자 목록 및 추가 관리자 초대</p>
        </div>
        <Button onClick={issueInvite}>
          <UserPlus size={16} /> 관리자 초대
        </Button>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="px-4 py-3 font-medium">이름</th>
              <th className="px-4 py-3 font-medium">연락처</th>
              <th className="px-4 py-3 font-medium">역할</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 text-ink">{a.name}</td>
                <td className="px-4 py-3 text-muted">{a.phone}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1.5 text-xs text-primary">
                    <ShieldCheck size={13} /> 관리자
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="관리자 초대코드 발급" footer={<Button onClick={() => setOpen(false)}>확인</Button>}>
        <p className="mb-2 text-sm text-muted">
          아래 코드를 새 관리자에게 전달해주세요. 로그인 화면 &gt; 관리자(회사) 회원가입 &gt; "관리자 코드로 합류"에서 사용합니다.
        </p>
        <div className="flex items-center justify-between rounded-xl bg-primary-light px-4 py-3">
          <span className="text-2xl font-bold tracking-widest text-primary">{issuedCode}</span>
          <button className="text-primary hover:opacity-70" onClick={() => navigator.clipboard?.writeText(issuedCode)} title="복사">
            <Copy size={18} />
          </button>
        </div>
      </Modal>
    </div>
  );
}
