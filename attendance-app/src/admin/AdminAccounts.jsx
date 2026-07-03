import { useEffect, useRef, useState } from "react";
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { UserPlus, Copy, ShieldCheck, PenLine } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import SignaturePad from "../components/SignaturePad";
import { generateInviteCode } from "../utils/ids";

export default function AdminAccounts() {
  const { profile, user } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [open, setOpen] = useState(false);
  const [issuedCode, setIssuedCode] = useState("");
  const [mySignature, setMySignature] = useState(null);
  const [savingSignature, setSavingSignature] = useState(false);
  const padRef = useRef(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "admin")),
      (snap) => setAdmins(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId]);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "adminSignatures", user.uid)).then((snap) => {
      if (snap.exists()) setMySignature(snap.data().signatureDataUrl);
    });
  }, [user]);

  const saveSignature = async () => {
    if (!padRef.current || padRef.current.isEmpty()) return;
    setSavingSignature(true);
    const dataUrl = padRef.current.getDataUrl();
    await setDoc(doc(db, "adminSignatures", user.uid), {
      companyId: profile.companyId,
      name: profile.name,
      signatureDataUrl: dataUrl,
      updatedAt: serverTimestamp(),
    });
    setMySignature(dataUrl);
    setSavingSignature(false);
  };

  const issueInvite = async () => {
    const code = generateInviteCode(7);
    await setDoc(doc(db, "adminInvites", code), {
      companyId: profile.companyId,
      createdAt: serverTimestamp(),
    });
    setIssuedCode(code);
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <Panel
        icon={ShieldCheck}
        title={`관리자 계정 (${admins.length}명)`}
        actions={
          <Button onClick={issueInvite}>
            <UserPlus size={16} /> 관리자 초대
          </Button>
        }
      >
        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-medium">순번</th>
                <th className="px-4 py-3 font-medium">이름</th>
                <th className="px-4 py-3 font-medium">연락처</th>
                <th className="px-4 py-3 font-medium">역할</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a, i) => (
                <tr key={a.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 text-muted">{i + 1}</td>
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
        </div>
      </Panel>

      <Panel icon={PenLine} title="내 전자서명 등록">
        <p className="mb-3 text-xs text-muted">
          안전담당자로 지정될 경우, 이 서명이 근로자의 안전교육 서명에 자동으로 함께 날인됩니다.
        </p>
        {mySignature && (
          <div className="mb-3">
            <p className="mb-1.5 text-[11px] text-muted">현재 등록된 서명</p>
            <img src={mySignature} alt="내 서명" className="h-14 rounded-xl border border-slate-200 bg-white" />
          </div>
        )}
        <SignaturePad ref={padRef} />
        <Button className="mt-3" onClick={saveSignature} disabled={savingSignature}>
          {savingSignature ? "저장 중..." : "서명 저장"}
        </Button>
      </Panel>

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
