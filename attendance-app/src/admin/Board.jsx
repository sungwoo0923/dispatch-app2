import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Trash2, Plus, MessageSquare, Pin, MessageCircleWarning, Copy } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import { formatDate } from "../utils/dateUtils";

// 공지 제목은 사용자가 따로 입력하지 않고 "작성한 날짜 + 공지사항"으로
// 자동 생성한다 (예: "2026년 07월 10일 공지사항").
function autoTitle(d = new Date()) {
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일 공지사항`;
}

const EMPTY_FORM = { content: "", pinned: false, urgentSms: false, urgentSiteId: "" };

export default function Board() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [posts, setPosts] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
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
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    const now = new Date();
    const title = autoTitle(now);
    await addDoc(collection(db, "posts"), {
      companyId: profile.companyId,
      title,
      content: form.content,
      pinned: form.pinned,
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
    setModalOpen(false);
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

  return (
    <div className="space-y-6">
      <Panel icon={MessageSquare} title={`게시판 (${sorted.length}건)`}>
        <p className="mb-4 text-xs text-muted">전 직원에게 공지할 소식을 작성하고 관리합니다.</p>
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
                  <th className="w-32 px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={openNew}
                      className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/25"
                    >
                      <Plus size={13} /> 등록
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, idx) => (
                  <tr
                    key={p.id}
                    onClick={() => setViewing(p)}
                    className={`cursor-pointer text-center hover:bg-slate-50 ${idx > 0 ? "border-t border-slate-100" : ""}`}
                  >
                    <td className="px-4 py-3 text-xs text-muted">
                      {p.createdAt?.toDate ? formatDate(p.createdAt.toDate().toISOString().slice(0, 10)).slice(5) : ""}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                        {p.pinned && <Pin size={13} className="shrink-0 text-primary" />}
                        {p.title}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted">{p.authorName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="공지 작성"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              취소
            </Button>
            <Button onClick={submit} disabled={!form.content.trim()}>
              등록
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-muted">
            제목은 "{autoTitle()}"처럼 등록일 기준으로 자동 생성됩니다.
          </p>
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
      </Modal>

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
