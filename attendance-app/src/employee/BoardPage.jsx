import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, updateDoc, doc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { ChevronRight, MessageSquarePlus, Pin, Plus, Trash2 } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { formatDate } from "../utils/dateUtils";
import { notifyAdmins } from "../utils/notifyAdmins";

const TOP_TABS = ["공지", "자유게시판", "문의하기"];
const CATEGORY_LABEL = { notice: "공지사항", inspection: "점검사항" };

export default function BoardPage() {
  const [tab, setTab] = useState("공지");
  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex flex-nowrap overflow-x-auto rounded-xl border border-slate-100 bg-white">
        {TOP_TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 px-4 py-2.5 text-sm font-semibold ${tab === t ? "bg-primary-dark text-white" : "text-muted"}`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "공지" && <NoticeTab />}
      {tab === "자유게시판" && <FreeBoardTab />}
      {tab === "문의하기" && <InquiryTab />}
    </div>
  );
}

function NoticeTab() {
  const { profile, user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(query(collection(db, "posts"), where("companyId", "==", profile.companyId)), (snap) =>
      setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId]);

  const sorted = useMemo(
    () =>
      posts
        .filter((p) => !p.targetTeams?.length || p.targetTeams.includes(profile?.team))
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
        }),
    [posts, profile?.team]
  );

  const openView = (p) => {
    setViewing(p);
    if (user?.uid && !(p.viewedBy || []).includes(user.uid)) {
      updateDoc(doc(db, "posts", p.id), { viewedBy: arrayUnion(user.uid) }).catch(() => {});
    }
  };

  return (
    <div className="space-y-3">
      <div className="px-0.5">
        <p className="text-sm font-semibold text-ink">공지사항</p>
        <p className="mt-0.5 text-xs text-muted">회사의 새로운 소식과 안내를 확인하세요</p>
      </div>
      {sorted.length === 0 ? (
        <Card className="flex flex-col items-center gap-1 p-8 text-center">
          <p className="text-sm font-medium text-ink">등록된 공지사항이 없습니다</p>
          <p className="text-xs text-muted">새 소식이 있으면 이 곳에 안내됩니다.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {sorted.map((p, idx) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openView(p)}
              className={`flex w-full items-center gap-2 px-4 py-3.5 text-left active:bg-slate-50 ${idx > 0 ? "border-t border-slate-100" : ""}`}
            >
              {p.pinned && (
                <span className="shrink-0 rounded bg-primary-dark px-1.5 py-0.5 text-[10px] font-bold text-white">중요</span>
              )}
              {p.category === "inspection" && (
                <Badge tone="warning">{CATEGORY_LABEL.inspection}</Badge>
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{p.title}</span>
              <span className="shrink-0 text-xs text-muted">
                {p.createdAt?.toDate ? formatDate(p.createdAt.toDate().toISOString().slice(0, 10)) : ""}
              </span>
              <ChevronRight size={15} className="shrink-0 text-muted" />
            </button>
          ))}
        </div>
      )}

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title="공지사항 상세" footer={<Button className="w-full" onClick={() => setViewing(null)}>닫기</Button>}>
        {viewing && (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-1.5 font-semibold text-ink">
              {viewing.pinned && <Badge tone="primary">고정</Badge>}
              {viewing.category === "inspection" && <Badge tone="warning">{CATEGORY_LABEL.inspection}</Badge>}
              {viewing.title}
            </p>
            <p className="text-xs text-muted">
              {viewing.authorName} ·{" "}
              {viewing.createdAt?.toDate ? formatDate(viewing.createdAt.toDate().toISOString().slice(0, 10)) : ""}
            </p>
            <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-ink">{viewing.content}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

// 직원/관리자 누구나 글을 쓸 수 있는 자유게시판. 공지사항(posts, 관리자 전용
// 작성)과 별도 컬렉션(freePosts)을 쓴다.
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
        authorRole: "employee",
        title: form.title.trim(),
        content: form.content.trim(),
        createdAt: serverTimestamp(),
      });
      toast.success("등록되었습니다");
      setOpen(false);
    } catch (err) {
      toast.error(`등록에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
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
    <div className="space-y-3">
      <div className="px-0.5">
        <p className="text-sm font-semibold text-ink">자유게시판</p>
        <p className="mt-0.5 text-xs text-muted">직원/관리자 누구나 자유롭게 글을 쓸 수 있어요</p>
      </div>
      <Button className="w-full" onClick={openNew}>
        <Plus size={16} /> 글쓰기
      </Button>
      {sorted.length === 0 ? (
        <Card className="flex flex-col items-center gap-1 p-8 text-center">
          <p className="text-sm font-medium text-ink">등록된 글이 없습니다</p>
          <p className="text-xs text-muted">첫 번째 글을 남겨보세요.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {sorted.map((p, idx) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setViewing(p)}
              className={`flex w-full items-center gap-2 px-4 py-3.5 text-left active:bg-slate-50 ${idx > 0 ? "border-t border-slate-100" : ""}`}
            >
              <Badge tone={p.authorRole === "admin" ? "primary" : "muted"}>{p.authorRole === "admin" ? "관리자" : "직원"}</Badge>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{p.title}</span>
              <span className="shrink-0 text-xs text-muted">
                {p.createdAt?.toDate ? formatDate(p.createdAt.toDate().toISOString().slice(0, 10)) : ""}
              </span>
              <ChevronRight size={15} className="shrink-0 text-muted" />
            </button>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="자유게시판 글쓰기"
        footer={
          <Button className="w-full" onClick={submit} disabled={saving || !form.title.trim() || !form.content.trim()}>
            {saving ? "등록 중..." : "등록"}
          </Button>
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
              rows={5}
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
          <div className="flex w-full gap-2">
            {viewing?.authorUid === user?.uid && (
              <Button variant="outline" className="flex-1" onClick={() => remove(viewing)}>
                <Trash2 size={14} /> 삭제
              </Button>
            )}
            <Button className="flex-1" onClick={() => setViewing(null)}>
              닫기
            </Button>
          </div>
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
            <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-ink">{viewing.content}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

const STATUS_TONE = { 답변대기: "warning", 답변완료: "success" };

function InquiryTab() {
  const { profile, user } = useAuth();
  const toast = useToast();
  const [admins, setAdmins] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [open, setOpen] = useState(false);
  const [adminSearch, setAdminSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [form, setForm] = useState({ toUid: "", subject: "", message: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      // users 컬렉션은 관리자만 list할 수 있어(개인정보 보호) 직원 화면에서
      // 관리자 목록을 조회하면 항상 빈 배열이 되던 버그 — 이름/직책 정도만
      // 담은 chat_profiles(회사 구성원 전체가 서로 조회 가능)에서 대신
      // role이 admin인 사람만 골라온다.
      onSnapshot(query(collection(db, "chat_profiles"), where("company", "==", profile.companyId), where("role", "==", "admin")), (snap) =>
        setAdmins(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => !a.deleted))
      ),
      onSnapshot(query(collection(db, "inquiries"), where("fromUid", "==", user.uid)), (snap) =>
        setInquiries(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId, user?.uid]);

  const sorted = [...inquiries].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const filteredAdmins = admins.filter((a) => !adminSearch.trim() || a.name?.includes(adminSearch.trim()));

  const openNew = () => {
    setForm({ toUid: "", subject: "", message: "" });
    setAdminSearch("");
    setPickerOpen(false);
    setOpen(true);
  };

  const submit = async () => {
    const target = admins.find((a) => a.id === form.toUid);
    if (!target || !form.subject.trim() || !form.message.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "inquiries"), {
        companyId: profile.companyId,
        fromUid: user.uid,
        fromName: profile.name,
        toUid: target.id,
        toName: target.name,
        toPosition: target.position || "",
        toTeam: target.team || "",
        subject: form.subject,
        message: form.message,
        status: "답변대기",
        reply: "",
        createdAt: serverTimestamp(),
      });
      notifyAdmins(profile.companyId, { title: "새 문의 등록", message: `${profile.name}님이 문의를 등록했습니다: ${form.subject}`, link: "/employees/inquiries" }).catch(() => {});
      toast.success("문의가 접수되었습니다");
      setOpen(false);
    } catch (err) {
      toast.error(`문의 등록에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button className="w-full" onClick={openNew}>
        <MessageSquarePlus size={16} /> 새 문의 작성
      </Button>
      {sorted.length === 0 && <p className="text-xs text-muted">작성한 문의가 없습니다.</p>}
      {sorted.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {sorted.map((q, idx) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setViewing(q)}
              className={`flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left active:bg-slate-50 ${idx > 0 ? "border-t border-slate-100" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{q.subject}</p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {q.toName}{q.toPosition ? ` (${q.toPosition})` : ""}
                  {q.createdAt?.toDate ? ` · ${formatDate(q.createdAt.toDate().toISOString().slice(0, 10))}` : ""}
                </p>
              </div>
              <Badge tone={STATUS_TONE[q.status] || "muted"}>{q.status}</Badge>
            </button>
          ))}
        </div>
      )}

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title="문의 상세" footer={<Button className="w-full" onClick={() => setViewing(null)}>닫기</Button>}>
        {viewing && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 flex-1 truncate font-semibold text-ink">{viewing.subject}</p>
              <Badge tone={STATUS_TONE[viewing.status] || "muted"}>{viewing.status}</Badge>
            </div>
            <p className="text-xs text-muted">
              {viewing.toName}{viewing.toPosition ? ` (${viewing.toPosition})` : ""}
              {viewing.createdAt?.toDate ? ` · ${formatDate(viewing.createdAt.toDate().toISOString().slice(0, 10))}` : ""}
            </p>
            <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-ink">{viewing.message}</p>
            {viewing.reply && (
              <div className="rounded-xl bg-primary-light/40 p-3">
                <p className="mb-1 text-xs font-semibold text-primary">답변</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{viewing.reply}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="새 문의 작성"
        footer={
          <Button className="w-full" onClick={submit} disabled={saving || !form.toUid || !form.subject.trim() || !form.message.trim()}>
            {saving ? "등록 중..." : "문의 보내기"}
          </Button>
        }
      >
        <div className="space-y-3">
          <label className="relative block">
            <span className="mb-1.5 block text-xs font-medium text-muted">받는 사람</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              placeholder="이름으로 검색"
              value={adminSearch}
              onFocus={() => setPickerOpen(true)}
              onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
              onChange={(e) => {
                setAdminSearch(e.target.value);
                setForm((f) => ({ ...f, toUid: "" }));
                setPickerOpen(true);
              }}
            />
            {pickerOpen && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {filteredAdmins.length === 0 ? (
                  <p className="px-3.5 py-3 text-xs text-muted">일치하는 관리자가 없습니다.</p>
                ) : (
                  filteredAdmins.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm hover:bg-slate-50 ${form.toUid === a.id ? "bg-primary-light" : ""}`}
                      onClick={() => {
                        setForm((f) => ({ ...f, toUid: a.id }));
                        setAdminSearch(a.name);
                        setPickerOpen(false);
                      }}
                    >
                      <span className="text-ink">{a.name}</span>
                      <span className="text-xs text-muted">{[a.position, a.team].filter(Boolean).join(" / ")}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">제목</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">내용</span>
            <textarea
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              rows={4}
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            />
          </label>
          <p className="text-xs text-muted">문의 내용은 본인과 선택한 담당자만 확인할 수 있습니다.</p>
        </div>
      </Modal>
    </div>
  );
}
