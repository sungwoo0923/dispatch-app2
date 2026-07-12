import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { Trash2, Plus, MessageSquare, Pin, MessageCircleWarning, Copy, Eye, Wrench, Users } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import SidePanel from "../components/SidePanel";
import { formatDate } from "../utils/dateUtils";

const TOP_TABS = [
  { key: "notice", label: "공지사항" },
  { key: "free", label: "자유게시판" },
];

const CATEGORY_OPTIONS = [
  { value: "notice", label: "공지사항" },
  { value: "inspection", label: "점검사항" },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORY_OPTIONS.map((c) => [c.value, c.label]));
const CATEGORY_TONE = { notice: "primary", inspection: "warning" };

// 공지 제목은 사용자가 따로 입력하지 않고 "작성한 날짜 + 카테고리"로
// 자동 생성한다 (예: "2026년 07월 10일 공지사항" / "... 점검사항").
function autoTitle(d = new Date(), category = "notice") {
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일 ${CATEGORY_LABEL[category] || CATEGORY_LABEL.notice}`;
}

const EMPTY_FORM = { content: "", pinned: false, category: "notice", targetMode: "all", targetTeams: [], urgentSms: false, urgentSiteId: "" };

export default function Board() {
  const [tab, setTab] = useState("notice");
  return (
    <div className="space-y-4">
      <div className="flex flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain">
        {TOP_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.key ? "bg-primary text-white" : "border border-slate-200 bg-white text-muted hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "notice" && <NoticeTab />}
      {tab === "free" && <FreeBoardTab />}
    </div>
  );
}

function NoticeTab() {
  const { profile, user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [posts, setPosts] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [smsRecipients, setSmsRecipients] = useState(null); // { numbers, body } — 번호 일괄 복사용 fallback 팝업

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(query(collection(db, "posts"), where("companyId", "==", profile.companyId)), (snap) =>
      setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (snap) =>
        setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (snap) =>
        setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => !e.deleted))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const teamOptions = useMemo(() => {
    const set = new Set(employees.map((e) => e.team).filter(Boolean));
    return [...set].sort();
  }, [employees]);

  const sorted = useMemo(
    () =>
      [...posts].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      }),
    [posts]
  );

  const openNew = () => {
    setForm(EMPTY_FORM);
    setPanelOpen(true);
  };

  const toggleTargetTeam = (team) => {
    setForm((f) => ({
      ...f,
      targetTeams: f.targetTeams.includes(team) ? f.targetTeams.filter((t) => t !== team) : [...f.targetTeams, team],
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const now = new Date();
    const title = autoTitle(now, form.category);
    const targetTeams = form.targetMode === "teams" ? form.targetTeams : [];
    await addDoc(collection(db, "posts"), {
      companyId: profile.companyId,
      title,
      content: form.content,
      pinned: form.pinned,
      category: form.category,
      targetTeams,
      viewedBy: [],
      authorName: profile.name,
      createdAt: serverTimestamp(),
    });

    if (form.urgentSms) {
      const targets = form.urgentSiteId
        ? employees.filter((e) => e.workSiteId === form.urgentSiteId)
        : employees;
      const numbers = [...new Set(targets.map((e) => e.phone).filter(Boolean))];
      if (numbers.length === 0) {
        toast.error("문자 발송 대상자의 전화번호가 없습니다.");
      } else {
        const body = `[긴급공지] ${title}\n${form.content}`;
        // iOS는 sms:번호1,번호2,...&body= 형식으로 다중 수신자 문자앱을 지원한다
        // (안드로이드는 기기별로 지원이 다를 수 있어, 아래 팝업으로 번호
        // 전체복사 fallback도 함께 제공한다).
        window.location.href = `sms:${numbers.join(",")}&body=${encodeURIComponent(body)}`;
        setSmsRecipients({ numbers, body });
      }
    }

    setForm(EMPTY_FORM);
    setPanelOpen(false);
  };

  const copySmsNumbers = async () => {
    if (!smsRecipients) return;
    try {
      await navigator.clipboard.writeText(smsRecipients.numbers.join(", "));
      toast.success("번호가 복사되었습니다");
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  };

  const remove = async (p) => {
    if (!(await confirm(`"${p.title}" 공지를 삭제하시겠습니까?`, "delete"))) return;
    await deleteDoc(doc(db, "posts", p.id));
    setViewing(null);
  };

  const openView = (p) => {
    setViewing(p);
    if (user?.uid && !(p.viewedBy || []).includes(user.uid)) {
      updateDoc(doc(db, "posts", p.id), { viewedBy: arrayUnion(user.uid) }).catch(() => {});
    }
  };

  return (
    <div className="space-y-6">
      <Panel icon={MessageSquare} title={`공지사항 (${sorted.length}건)`}>
        <div className="mb-4 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <p className="text-xs text-muted">전 직원 또는 특정 팀을 대상으로 공지·점검사항을 작성하고 관리합니다.</p>
          <Button size="sm" onClick={openNew}>
            <Plus size={13} /> 등록
          </Button>
        </div>
        {sorted.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-sm font-medium text-ink">등록된 공지사항이 없습니다</p>
            <p className="mt-1 text-xs text-muted">새 소식이 있으면 이 곳에 안내됩니다.</p>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-dark text-xs font-semibold text-white">
                  <th className="w-24 px-4 py-3 text-center">날짜</th>
                  <th className="px-4 py-3 text-center">제목</th>
                  <th className="w-20 px-4 py-3 text-center">대상</th>
                  <th className="w-16 px-4 py-3 text-center">조회수</th>
                  <th className="w-32 px-4 py-3 text-right">작성자</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, idx) => (
                  <tr
                    key={p.id}
                    onClick={() => openView(p)}
                    className={`cursor-pointer text-center hover:bg-slate-50 ${idx > 0 ? "border-t border-slate-100" : ""}`}
                  >
                    <td className="px-4 py-3 text-xs text-muted">
                      {p.createdAt?.toDate ? formatDate(p.createdAt.toDate().toISOString().slice(0, 10)).slice(5) : ""}
                    </td>
                    <td className="px-4 py-3 text-left">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                        {p.pinned && <Pin size={13} className="shrink-0 text-primary" />}
                        <Badge tone={CATEGORY_TONE[p.category] || "primary"}>{CATEGORY_LABEL[p.category] || CATEGORY_LABEL.notice}</Badge>
                        {p.title}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {p.targetTeams?.length ? p.targetTeams.join(", ") : "전체"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      <span className="inline-flex items-center gap-1"><Eye size={12} /> {(p.viewedBy || []).length}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted">{p.authorName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <SidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title="공지 작성"
        footer={
          <>
            <Button variant="outline" onClick={() => setPanelOpen(false)}>
              취소
            </Button>
            <Button onClick={submit} disabled={!form.content.trim()}>
              등록
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="mx-auto max-w-2xl space-y-5">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">분류</span>
            <div className="flex gap-2">
              {CATEGORY_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, category: c.value }))}
                  className={`flex-1 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                    form.category === c.value ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted hover:bg-slate-50"
                  }`}
                >
                  {c.value === "inspection" && <Wrench size={13} className="mr-1 inline-block" />}
                  {c.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-muted">
              제목은 "{autoTitle(new Date(), form.category)}"처럼 등록일과 분류를 기준으로 자동 생성됩니다.
            </p>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">내용</span>
            <textarea
              required
              rows={6}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            />
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">공지 대상</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, targetMode: "all" }))}
                className={`flex-1 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                  form.targetMode === "all" ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted hover:bg-slate-50"
                }`}
              >
                전 직원
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, targetMode: "teams" }))}
                className={`flex-1 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                  form.targetMode === "teams" ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted hover:bg-slate-50"
                }`}
              >
                팀별 선택
              </button>
            </div>
            {form.targetMode === "teams" && (
              <div className="mt-2 flex flex-wrap gap-1.5 rounded-xl border border-slate-200 p-3">
                {teamOptions.length === 0 ? (
                  <p className="text-xs text-muted">등록된 팀 정보가 있는 직원이 없습니다.</p>
                ) : (
                  teamOptions.map((team) => (
                    <button
                      key={team}
                      type="button"
                      onClick={() => toggleTargetTeam(team)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        form.targetTeams.includes(team) ? "border-primary bg-primary text-white" : "border-slate-200 text-muted hover:bg-slate-50"
                      }`}
                    >
                      {team}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
            />
            상단 고정
          </label>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
            <label className="flex items-center gap-2 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                checked={form.urgentSms}
                onChange={(e) => setForm((f) => ({ ...f, urgentSms: e.target.checked }))}
              />
              <MessageCircleWarning size={15} className="text-warning" />
              긴급 문자(SMS)로도 발송
            </label>
            {form.urgentSms && (
              <label className="mt-2 block">
                <span className="mb-1.5 block text-xs font-medium text-muted">발송 대상 센터</span>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.urgentSiteId}
                  onChange={(e) => setForm((f) => ({ ...f, urgentSiteId: e.target.value }))}
                >
                  <option value="">전체 근로자</option>
                  {workSites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] text-muted">
                  등록과 동시에 문자 앱이 열려 대상자 전체에게 보낼 수 있습니다. 기기에 따라 다중 수신자가 지원되지 않으면 번호 복사 팝업을 이용해주세요.
                </p>
              </label>
            )}
          </div>
        </form>
      </SidePanel>

      <Modal
        open={Boolean(smsRecipients)}
        onClose={() => setSmsRecipients(null)}
        title="긴급 문자 발송 대상"
        footer={
          <>
            <Button variant="outline" onClick={copySmsNumbers}>
              <Copy size={14} /> 번호 전체 복사
            </Button>
            <Button onClick={() => setSmsRecipients(null)}>닫기</Button>
          </>
        }
      >
        {smsRecipients && (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted">
              문자 앱이 열리지 않았거나 일부 기기에서 다중 수신자가 지원되지 않으면, 번호를 복사해 문자/카카오톡 앱에 직접 붙여넣어 주세요.
            </p>
            <p className="rounded-xl bg-slate-50 p-3 font-mono text-xs leading-relaxed text-ink">
              {smsRecipients.numbers.join(", ")}
            </p>
            <p className="text-xs text-muted">총 {smsRecipients.numbers.length}명</p>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title="공지사항 상세"
        footer={
          <>
            <Button variant="outline" onClick={() => remove(viewing)}>
              <Trash2 size={14} /> 삭제
            </Button>
            <Button onClick={() => setViewing(null)}>닫기</Button>
          </>
        }
      >
        {viewing && (
          <div className="space-y-3 text-sm">
            <div>
              <span className="mb-1 block text-xs font-medium text-muted">제목</span>
              <p className="flex items-center gap-1.5 font-semibold text-ink">
                {viewing.pinned && <Badge tone="primary">고정</Badge>}
                <Badge tone={CATEGORY_TONE[viewing.category] || "primary"}>{CATEGORY_LABEL[viewing.category] || CATEGORY_LABEL.notice}</Badge>
                {viewing.title}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="mb-1 block text-xs font-medium text-muted">작성자</span>
                <p className="text-ink">{viewing.authorName}</p>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-muted">작성일</span>
                <p className="text-ink">
                  {viewing.createdAt?.toDate ? formatDate(viewing.createdAt.toDate().toISOString().slice(0, 10)) : "-"}
                </p>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-muted">대상</span>
                <p className="text-ink">{viewing.targetTeams?.length ? viewing.targetTeams.join(", ") : "전 직원"}</p>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-muted">조회수</span>
                <p className="inline-flex items-center gap-1 text-ink"><Eye size={13} /> {(viewing.viewedBy || []).length}명</p>
              </div>
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-muted">내용</span>
              <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 leading-relaxed text-ink">{viewing.content}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// 직원/관리자 누구나 글을 쓸 수 있는 자유게시판 — 공지사항(posts)과 별도
// 컬렉션(freePosts)을 쓰며, 본인 글은 본인이, 그 외에는 관리자만 삭제할 수 있다.
function FreeBoardTab() {
  const { profile, user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [posts, setPosts] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", content: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(query(collection(db, "freePosts"), where("companyId", "==", profile.companyId)), (snap) =>
      setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId]);

  const sorted = useMemo(() => [...posts].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)), [posts]);

  const openNew = () => {
    setForm({ title: "", content: "" });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "freePosts"), {
        companyId: profile.companyId,
        authorUid: user.uid,
        authorName: profile.name,
        authorRole: "admin",
        title: form.title.trim(),
        content: form.content.trim(),
        createdAt: serverTimestamp(),
      });
      toast.success("등록되었습니다");
      setOpen(false);
    } catch (err) {
      toast.error(`등록에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p) => {
    if (!(await confirm(`"${p.title}" 글을 삭제하시겠습니까?`, "delete"))) return;
    await deleteDoc(doc(db, "freePosts", p.id));
    setViewing(null);
  };

  return (
    <Panel icon={Users} title={`자유게시판 (${sorted.length}건)`}>
      <div className="mb-4 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
        <p className="text-xs text-muted">직원/관리자 누구나 자유롭게 글을 쓸 수 있는 게시판입니다.</p>
        <Button size="sm" onClick={openNew}>
          <Plus size={13} /> 글쓰기
        </Button>
      </div>
      {sorted.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm font-medium text-ink">등록된 글이 없습니다</p>
          <p className="mt-1 text-xs text-muted">첫 번째 글을 남겨보세요.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-dark text-xs font-semibold text-white">
                <th className="w-24 px-4 py-3 text-center">날짜</th>
                <th className="px-4 py-3 text-center">제목</th>
                <th className="w-24 px-4 py-3 text-center">작성구분</th>
                <th className="w-32 px-4 py-3 text-right">작성자</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, idx) => (
                <tr key={p.id} onClick={() => setViewing(p)} className={`cursor-pointer text-center hover:bg-slate-50 ${idx > 0 ? "border-t border-slate-100" : ""}`}>
                  <td className="px-4 py-3 text-xs text-muted">
                    {p.createdAt?.toDate ? formatDate(p.createdAt.toDate().toISOString().slice(0, 10)).slice(5) : ""}
                  </td>
                  <td className="px-4 py-3 text-left font-semibold text-ink">{p.title}</td>
                  <td className="px-4 py-3">
                    <Badge tone={p.authorRole === "admin" ? "primary" : "muted"}>{p.authorRole === "admin" ? "관리자" : "직원"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted">{p.authorName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="자유게시판 글쓰기"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={submit} disabled={saving || !form.title.trim() || !form.content.trim()}>
              {saving ? "등록 중..." : "등록"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">제목</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">내용</span>
            <textarea
              rows={6}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title="자유게시판 상세"
        footer={
          <>
            <Button variant="outline" onClick={() => remove(viewing)}>
              <Trash2 size={14} /> 삭제
            </Button>
            <Button onClick={() => setViewing(null)}>닫기</Button>
          </>
        }
      >
        {viewing && (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-1.5 font-semibold text-ink">
              <Badge tone={viewing.authorRole === "admin" ? "primary" : "muted"}>{viewing.authorRole === "admin" ? "관리자" : "직원"}</Badge>
              {viewing.title}
            </p>
            <p className="text-xs text-muted">
              {viewing.authorName} · {viewing.createdAt?.toDate ? formatDate(viewing.createdAt.toDate().toISOString().slice(0, 10)) : ""}
            </p>
            <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 leading-relaxed text-ink">{viewing.content}</p>
          </div>
        )}
      </Modal>
    </Panel>
  );
}
