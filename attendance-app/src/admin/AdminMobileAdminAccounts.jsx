import { useEffect, useMemo, useRef, useState } from "react";
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { UserPlus, Copy, Search, PenLine } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import SignaturePad from "../components/SignaturePad";
import { generateInviteCode } from "../utils/ids";
import { formatDate } from "../utils/dateUtils";
import { TEAM_OPTIONS, POSITION_OPTIONS } from "../constants/hr";

// 관리자 계정의 모바일 전용 화면 — 관리자 카드 목록(검색) + 초대코드 발급
// 모달 + 관리자별 수정 모달 + 내 전자서명 등록.
export default function AdminMobileAdminAccounts() {
  const { profile, user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [admins, setAdmins] = useState([]);
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [issuedCode, setIssuedCode] = useState("");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [mySignature, setMySignature] = useState(null);
  const [savingSignature, setSavingSignature] = useState(false);
  const padRef = useRef(null);

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "admin")), (s) => setAdmins(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "permissionGroups"), where("companyId", "==", profile.companyId)), (s) => setGroups(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "adminSignatures", user.uid)).then((snap) => {
      if (snap.exists()) setMySignature(snap.data().signatureDataUrl);
    });
  }, [user]);

  const groupName_ = (id) => groups.find((g) => g.id === id)?.name || "-";
  const authOf = (a) => (a.groupId ? "그룹관리자" : "사이트관리자");

  const filtered = useMemo(() => admins.filter((a) => !search.trim() || a.name?.includes(search.trim()) || a.email?.includes(search.trim()) || a.phone?.includes(search.trim())), [admins, search]);

  const openEdit = (a) => {
    setEditing(a);
    setEditForm({ team: a.team || "", position: a.position || "", groupId: a.groupId || "", approved: a.approved !== false, active: a.active !== "미사용" });
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!(await confirm("수정하시겠습니까?", "edit"))) return;
    try {
      await updateDoc(doc(db, "users", editing.id), {
        team: editForm.team,
        position: editForm.position,
        groupId: editForm.groupId || null,
        approved: editForm.approved,
        active: editForm.active ? "사용" : "미사용",
      });
      toast.success("수정되었습니다");
      setEditing(null);
    } catch (err) {
      toast.error(`저장에 실패했습니다: ${err.code || err.message}`);
    }
  };

  const saveSignature = async () => {
    if (!padRef.current || padRef.current.isEmpty()) return;
    setSavingSignature(true);
    const dataUrl = padRef.current.getDataUrl();
    await setDoc(doc(db, "adminSignatures", user.uid), { companyId: profile.companyId, name: profile.name, signatureDataUrl: dataUrl, updatedAt: serverTimestamp() });
    setMySignature(dataUrl);
    setSavingSignature(false);
    toast.success("서명이 저장되었습니다");
    setSignatureOpen(false);
  };

  const issueInvite = async () => {
    const code = generateInviteCode(7);
    await setDoc(doc(db, "adminInvites", code), { companyId: profile.companyId, createdAt: serverTimestamp() });
    setIssuedCode(code);
    setInviteOpen(true);
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">관리자 계정</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setSignatureOpen(true)}>
            <PenLine size={13} /> 서명
          </Button>
          <Button size="sm" onClick={issueInvite}>
            <UserPlus size={13} /> 초대
          </Button>
        </div>
      </div>

      <div className="relative">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름/이메일/연락처 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm" />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">조회조건에 해당하는 관리자가 없습니다.</div>}
        {filtered.map((a) => (
          <button key={a.id} type="button" onClick={() => openEdit(a)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-ink">{a.name}</span>
                <Badge tone={a.approved === false ? "warning" : "success"}>{a.approved === false ? "대기" : "승인"}</Badge>
                <Badge tone={a.active === "미사용" ? "muted" : "success"}>{a.active === "미사용" ? "미사용" : "사용"}</Badge>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">
                {authOf(a)} · {[a.team, a.position].filter(Boolean).join(" · ") || "부서/직급 미지정"} · {groupName_(a.groupId)}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted">{a.email} · {a.phone || "-"}</p>
            </div>
          </button>
        ))}
      </div>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="관리자 초대코드 발급">
        <p className="mb-3 text-sm text-muted">아래 코드를 새 관리자에게 전달해주세요. 로그인 화면 &gt; 관리자(회사) 회원가입 &gt; "관리자 코드로 합류"에서 사용합니다.</p>
        <div className="flex items-center justify-between rounded-xl bg-primary-light px-4 py-3">
          <span className="text-2xl font-bold tracking-widest text-primary">{issuedCode}</span>
          <button className="text-primary" onClick={() => navigator.clipboard?.writeText(issuedCode)} title="복사">
            <Copy size={18} />
          </button>
        </div>
      </Modal>

      <Modal open={signatureOpen} onClose={() => setSignatureOpen(false)} title="내 전자서명 등록">
        <p className="mb-3 text-xs text-muted">안전담당자로 지정될 경우, 이 서명이 근로자의 안전교육 서명에 자동으로 함께 날인됩니다.</p>
        {mySignature && (
          <div className="mb-3">
            <p className="mb-1.5 text-[11px] text-muted">현재 등록된 서명</p>
            <img src={mySignature} alt="내 서명" className="h-14 rounded-xl border border-slate-200 bg-white" />
          </div>
        )}
        <SignaturePad ref={padRef} />
        <Button className="mt-3 w-full" onClick={saveSignature} disabled={savingSignature}>
          {savingSignature ? "저장 중..." : "서명 저장"}
        </Button>
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={`${editing?.name || ""} · 상세`}>
        {editForm && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">부서</span>
                <select className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={editForm.team} onChange={(e) => setEditForm((f) => ({ ...f, team: e.target.value }))}>
                  <option value="">선택안함</option>
                  {TEAM_OPTIONS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">직급</span>
                <select className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={editForm.position} onChange={(e) => setEditForm((f) => ({ ...f, position: e.target.value }))}>
                  <option value="">선택안함</option>
                  {POSITION_OPTIONS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">그룹 (권한그룹)</span>
              <select className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" value={editForm.groupId} onChange={(e) => setEditForm((f) => ({ ...f, groupId: e.target.value }))}>
                <option value="">없음 (사이트관리자)</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={editForm.approved} onChange={(e) => setEditForm((f) => ({ ...f, approved: e.target.checked }))} /> 승인
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={editForm.active} onChange={(e) => setEditForm((f) => ({ ...f, active: e.target.checked }))} /> 사용
              </label>
            </div>
            <p className="text-[11px] text-muted">최종접속: {editing?.lastLoginAt?.seconds ? formatDate(new Date(editing.lastLoginAt.seconds * 1000).toISOString().slice(0, 10)) : "-"}</p>
            <Button className="w-full" onClick={saveEdit}>
              저장
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
