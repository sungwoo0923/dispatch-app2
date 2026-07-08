import { useEffect, useMemo, useRef, useState } from "react";
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { UserPlus, Copy, ShieldCheck, PenLine, Search, Download } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import SignaturePad from "../components/SignaturePad";
import { generateInviteCode } from "../utils/ids";
import { downloadCsv } from "../utils/exportCsv";
import { formatDate } from "../utils/dateUtils";
import { TEAM_OPTIONS, POSITION_OPTIONS } from "../constants/hr";
import SmsButton from "../components/SmsButton";

const AUTH_OPTIONS = ["사이트관리자", "그룹관리자"];

const emptyFilters = () => ({ team: "", position: "", auth: "", approved: "", searchField: "name", searchText: "" });

export default function AdminAccounts() {
  const { profile, user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [admins, setAdmins] = useState([]);
  const [groups, setGroups] = useState([]);
  const [open, setOpen] = useState(false);
  const [issuedCode, setIssuedCode] = useState("");
  const [mySignature, setMySignature] = useState(null);
  const [savingSignature, setSavingSignature] = useState(false);
  const padRef = useRef(null);

  const [draft, setDraft] = useState(emptyFilters());
  const [applied, setApplied] = useState(emptyFilters());
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "admin")), (snap) =>
        setAdmins(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "permissionGroups"), where("companyId", "==", profile.companyId)), (snap) =>
        setGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
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

  const filtered = useMemo(() => {
    const f = applied;
    return admins
      .filter((a) => !f.team || a.team === f.team)
      .filter((a) => !f.position || a.position === f.position)
      .filter((a) => !f.auth || authOf(a) === f.auth)
      .filter((a) => !f.approved || (f.approved === "승인" ? a.approved !== false : a.approved === false))
      .filter((a) => {
        if (!f.searchText.trim()) return true;
        const v = (f.searchField === "email" ? a.email : f.searchField === "phone" ? a.phone : a.name) || "";
        return v.toLowerCase().includes(f.searchText.trim().toLowerCase());
      });
  }, [admins, applied, groups]);

  const runSearch = () => setApplied(draft);
  const resetSearch = () => {
    setDraft(emptyFilters());
    setApplied(emptyFilters());
  };

  const exportExcel = () => {
    downloadCsv(
      "관리자계정",
      ["순번", "관리자ID", "관리자명", "권한", "관리자전화번호", "부서", "직급", "그룹", "승인", "최종접속일시", "사용"],
      filtered.map((a, i) => [
        i + 1,
        a.email || "",
        a.name || "",
        authOf(a),
        a.phone || "",
        a.team || "",
        a.position || "",
        groupName_(a.groupId),
        a.approved === false ? "대기" : "승인",
        a.lastLoginAt?.seconds ? formatDate(new Date(a.lastLoginAt.seconds * 1000).toISOString().slice(0, 10)) : "",
        a.active === "미사용" ? "미사용" : "사용",
      ])
    );
  };

  const openEdit = (a) => {
    setEditing(a);
    setEditForm({
      team: a.team || "",
      position: a.position || "",
      groupId: a.groupId || "",
      approved: a.approved !== false,
      active: a.active !== "미사용",
    });
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!(await confirm("수정하시겠습니까?", "edit"))) return;
    setEditError("");
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
      setEditError(`저장에 실패했습니다: ${err.code || err.message}`);
    }
  };

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
    toast.success("서명이 저장되었습니다");
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
        title="관리자 계정"
        actions={
          <Button onClick={issueInvite}>
            <UserPlus size={16} /> 신규
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain pb-1">
            <select className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={draft.team} onChange={(e) => setDraft((f) => ({ ...f, team: e.target.value }))}>
              <option value="">부서 전체</option>
              {TEAM_OPTIONS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={draft.position} onChange={(e) => setDraft((f) => ({ ...f, position: e.target.value }))}>
              <option value="">직급 전체</option>
              {POSITION_OPTIONS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <select className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={draft.auth} onChange={(e) => setDraft((f) => ({ ...f, auth: e.target.value }))}>
              <option value="">권한 전체</option>
              {AUTH_OPTIONS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
            <select className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={draft.approved} onChange={(e) => setDraft((f) => ({ ...f, approved: e.target.value }))}>
              <option value="">승인여부 전체</option>
              <option value="승인">승인</option>
              <option value="대기">대기</option>
            </select>
          </div>

          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain pb-1">
            <span className="shrink-0 text-xs font-medium text-muted">검색조건</span>
            <select className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={draft.searchField} onChange={(e) => setDraft((f) => ({ ...f, searchField: e.target.value }))}>
              <option value="name">관리자명</option>
              <option value="email">관리자ID</option>
              <option value="phone">전화번호</option>
            </select>
            <div className="flex shrink-0 flex-nowrap overflow-hidden rounded-xl border border-slate-200">
              <input
                className="w-32 border-0 px-3 py-2 text-sm focus:outline-none"
                placeholder="검색어"
                value={draft.searchText}
                onChange={(e) => setDraft((f) => ({ ...f, searchText: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
              <button type="button" onClick={runSearch} className="flex items-center gap-1 border-l border-slate-200 bg-slate-50 px-2.5 text-xs text-muted hover:bg-slate-100">
                <Search size={13} /> 검색
              </button>
            </div>
            <Button variant="outline" onClick={resetSearch}>
              초기화
            </Button>
            <Button variant="outline" onClick={exportExcel}>
              <Download size={16} /> 엑셀
            </Button>
          </div>
        </div>

        <p className="mb-2 mt-4 text-xs font-medium text-muted">목록 {filtered.length}건</p>
        <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[960px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-3 font-semibold">순번</th>
                <th className="px-3 py-3 font-semibold">상세</th>
                <th className="px-3 py-3 font-semibold">관리자ID</th>
                <th className="px-3 py-3 font-semibold">관리자명</th>
                <th className="px-3 py-3 font-semibold">권한</th>
                <th className="px-3 py-3 font-semibold">관리자전화번호</th>
                <th className="px-3 py-3 font-semibold">부서</th>
                <th className="px-3 py-3 font-semibold">직급</th>
                <th className="px-3 py-3 font-semibold">그룹</th>
                <th className="px-3 py-3 font-semibold">승인</th>
                <th className="px-3 py-3 font-semibold">최종접속일시</th>
                <th className="px-3 py-3 font-semibold">사용</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => (
                <tr key={a.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-3 text-ink">{i + 1}</td>
                  <td className="px-3 py-3">
                    <button className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-primary hover:bg-primary-light" onClick={() => openEdit(a)}>
                      상세
                    </button>
                  </td>
                  <td className="px-3 py-3 text-ink">{a.email}</td>
                  <td className="px-3 py-3 text-ink">{a.name}</td>
                  <td className="px-3 py-3">
                    <span className="flex items-center justify-center gap-1.5 text-xs text-primary">
                      <ShieldCheck size={13} /> {authOf(a)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-ink"><span className="inline-flex items-center gap-1">{a.phone}<SmsButton phone={a.phone} /></span></td>
                  <td className="px-3 py-3 text-ink">{a.team || "-"}</td>
                  <td className="px-3 py-3 text-ink">{a.position || "-"}</td>
                  <td className="px-3 py-3 text-ink">{groupName_(a.groupId)}</td>
                  <td className="px-3 py-3">
                    <Badge tone={a.approved === false ? "warning" : "success"}>{a.approved === false ? "대기" : "승인"}</Badge>
                  </td>
                  <td className="px-3 py-3 text-ink">
                    {a.lastLoginAt?.seconds ? formatDate(new Date(a.lastLoginAt.seconds * 1000).toISOString().slice(0, 10)) : "-"}
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={a.active === "미사용" ? "muted" : "success"}>{a.active === "미사용" ? "미사용" : "사용"}</Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-6 text-center text-xs text-muted">
                    조회조건에 해당하는 관리자가 없습니다.
                  </td>
                </tr>
              )}
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

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`${editing?.name || ""} · 상세`}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              취소
            </Button>
            <Button onClick={saveEdit}>저장</Button>
          </>
        }
      >
        {editForm && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
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
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-nowrap gap-6">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={editForm.approved} onChange={(e) => setEditForm((f) => ({ ...f, approved: e.target.checked }))} /> 승인
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={editForm.active} onChange={(e) => setEditForm((f) => ({ ...f, active: e.target.checked }))} /> 사용
              </label>
            </div>
            {editError && <p className="text-xs text-danger">{editError}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
