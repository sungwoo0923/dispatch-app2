import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { MessageSquare } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import { formatDate } from "../utils/dateUtils";

const STATUS_TONE = { 답변대기: "warning", 답변완료: "success" };

export default function Inquiries() {
  const { profile } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [replyTarget, setReplyTarget] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(query(collection(db, "inquiries"), where("companyId", "==", profile.companyId)), (snap) =>
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId]);

  const sorted = [...rows].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  const openReply = (q) => {
    setReplyTarget(q);
    setReplyText(q.reply || "");
  };

  const submitReply = async () => {
    if (!replyTarget || !replyText.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "inquiries", replyTarget.id), {
        reply: replyText,
        repliedBy: profile.name,
        repliedAt: serverTimestamp(),
        status: "답변완료",
      });
      // 답변 완료를 문의 작성자에게도 알려야 하는데, 예전에는 inquiries
      // 문서만 갱신하고 알림을 만들지 않아 직원이 모바일 알림 종/체크탭에서
      // 답변이 왔는지 알 방법이 없었다.
      await addDoc(collection(db, "notifications"), {
        companyId: profile.companyId,
        uid: replyTarget.fromUid,
        title: "문의 답변 완료",
        message: `"${replyTarget.subject}" 문의에 답변이 등록되었습니다.`,
        type: "inquiry",
        link: "/board",
        read: false,
        createdAt: serverTimestamp(),
      });
      toast.success("답변이 등록되었습니다");
      setReplyTarget(null);
    } catch (err) {
      toast.error(`답변 등록에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Panel icon={MessageSquare} title="문의함">
        <p className="mb-4 text-xs text-muted">근로자가 특정 담당자를 지정해 보낸 문의/건의 내역입니다. 답변을 등록하면 근로자 앱에 바로 표시됩니다.</p>
        <p className="mb-2 text-xs font-medium text-muted">목록 {sorted.length}</p>
        <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[760px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-3 font-semibold">순번</th>
                <th className="px-3 py-3 font-semibold">제목</th>
                <th className="px-3 py-3 font-semibold">작성자</th>
                <th className="px-3 py-3 font-semibold">받는사람</th>
                <th className="px-3 py-3 font-semibold">등록일</th>
                <th className="px-3 py-3 font-semibold">상태</th>
                <th className="px-3 py-3 font-semibold">답변</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((q, i) => (
                <tr key={q.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-3 text-ink">{i + 1}</td>
                  <td className="px-3 py-3 text-ink">{q.subject}</td>
                  <td className="px-3 py-3 text-ink">{q.fromName}</td>
                  <td className="px-3 py-3 text-ink">{q.toName}</td>
                  <td className="px-3 py-3 text-ink">{q.createdAt?.toDate ? formatDate(q.createdAt.toDate().toISOString().slice(0, 10)) : "-"}</td>
                  <td className="px-3 py-3">
                    <Badge tone={STATUS_TONE[q.status] || "muted"}>{q.status}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    <Button size="sm" variant={q.status === "답변완료" ? "outline" : "primary"} onClick={() => openReply(q)}>
                      {q.status === "답변완료" ? "답변보기" : "답변하기"}
                    </Button>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-xs text-muted">
                    접수된 문의가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal
        open={Boolean(replyTarget)}
        onClose={() => setReplyTarget(null)}
        title={replyTarget?.subject}
        footer={
          <Button className="w-full" onClick={submitReply} disabled={saving || !replyText.trim()}>
            {saving ? "등록 중..." : "답변 등록"}
          </Button>
        }
      >
        {replyTarget && (
          <div className="space-y-3">
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-muted">
              <p className="mb-1 text-ink">{replyTarget.fromName} → {replyTarget.toName}</p>
              <p className="whitespace-pre-wrap leading-relaxed text-ink">{replyTarget.message}</p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">답변</span>
              <textarea
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                rows={4}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
