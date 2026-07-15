import { useEffect, useRef, useState } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { AlertCircle, X } from "lucide-react";
import { db } from "../firebase";
import { useToast } from "../hooks/useToast";
import { playChime } from "../utils/chime";
import Button from "../components/Button";
import { deprovisionWorkers } from "./AgencyRequests";

const ACTION_COPY = {
  reassign: {
    bannerText: "배정 변경요청이 있습니다.",
    title: "배정 변경요청",
    body: (r) => `${r.companyName}에서 ${r.date} ${r.shiftLabel || ""} 건의 배정 인력 변경을 요청했습니다. 승인하면 현재 배정된 인력이 해제되고 다시 배정할 수 있게 됩니다.`,
  },
  cancelOrder: {
    bannerText: "고용 취소 요청이 있습니다.",
    title: "고용 취소 요청",
    body: (r) => `${r.companyName}에서 ${r.date} ${r.shiftLabel || ""} 건의 고용(요청장) 취소를 요청했습니다. 승인하면 이 요청은 삭제 처리되고 배정된 인력도 함께 해제됩니다.`,
  },
};

// 도급사가 배정 변경/오더삭제를 요청하면, 인력사무소 화면 어디서든(전역)
// 이 컴포넌트가 상단 배너(업데이트 알림바와 같은 스타일)로 깜빡이며 알리고,
// 클릭하면 중앙 팝업으로 승인/거절을 받는다. 실제 데이터 정리(배정 인력
// 해제 등)는 승인했을 때만 일어난다 — 도급사가 직접 지우지 못하게 하기
// 위함이다.
export default function AgencyPendingActionCenter({ agencyId }) {
  const toast = useToast();
  const [pending, setPending] = useState([]);
  const [reviewId, setReviewId] = useState(null);
  const [ackIds, setAckIds] = useState(() => new Set());
  const [processing, setProcessing] = useState(false);
  const seenRef = useRef(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!agencyId) return;
    const unsub = onSnapshot(
      query(collection(db, "staffingRequests"), where("agencyId", "==", agencyId), where("pendingAction", "in", ["reassign", "cancelOrder"])),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (initializedRef.current) {
          const fresh = list.filter((r) => !seenRef.current.has(r.id));
          if (fresh.length > 0) {
            playChime();
            setReviewId(fresh[0].id);
          }
        }
        list.forEach((r) => seenRef.current.add(r.id));
        initializedRef.current = true;
        setPending(list);
      }
    );
    return () => unsub();
  }, [agencyId]);

  const visibleBanner = pending.filter((r) => !ackIds.has(r.id));
  const reviewTarget = pending.find((r) => r.id === reviewId) || null;

  const openBanner = () => {
    setAckIds((s) => new Set([...s, ...pending.map((r) => r.id)]));
    setReviewId(pending[0]?.id || null);
  };

  const decide = async (approve) => {
    if (!reviewTarget) return;
    setProcessing(true);
    try {
      if (reviewTarget.pendingAction === "reassign") {
        if (approve) {
          if (reviewTarget.workers?.length) await deprovisionWorkers(reviewTarget.workers);
          await updateDoc(doc(db, "staffingRequests", reviewTarget.id), {
            status: "requested",
            workers: [],
            totalPrice: 0,
            pendingAction: null,
          });
          toast.success("배정 변경요청을 승인했습니다. 다시 배정해주세요.");
        } else {
          await updateDoc(doc(db, "staffingRequests", reviewTarget.id), { pendingAction: null });
          toast.success("배정 변경요청을 거절했습니다.");
        }
      } else if (reviewTarget.pendingAction === "cancelOrder") {
        if (approve) {
          if (reviewTarget.workers?.length) await deprovisionWorkers(reviewTarget.workers);
          await updateDoc(doc(db, "staffingRequests", reviewTarget.id), {
            status: "cancelled",
            pendingAction: null,
            cancelledAt: serverTimestamp(),
          });
          toast.success("고용 취소 요청을 승인했습니다.");
        } else {
          await updateDoc(doc(db, "staffingRequests", reviewTarget.id), { pendingAction: null });
          toast.success("고용 취소 요청을 거절했습니다.");
        }
      }
      setAckIds((s) => new Set([...s, reviewTarget.id]));
      setReviewId(null);
    } catch (err) {
      toast.error(`처리에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const copy = reviewTarget ? ACTION_COPY[reviewTarget.pendingAction] : null;

  return (
    <>
      {visibleBanner.length > 0 && (
        <div
          className="fixed inset-x-0 top-0 z-[999] flex animate-[slidedown_0.35s_ease-out] items-center justify-center gap-3 bg-danger px-4 py-2.5 text-white shadow-lg"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.625rem)" }}
        >
          <style>{`
            @keyframes slidedown { from { opacity: 0; transform: translateY(-100%); } to { opacity: 1; transform: translateY(0); } }
            @keyframes agencyBannerBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
          `}</style>
          <span className="flex items-center gap-2 text-xs font-semibold" style={{ animation: "agencyBannerBlink 1.1s ease-in-out infinite" }}>
            <AlertCircle size={14} className="shrink-0" />
            {visibleBanner.length === 1 ? ACTION_COPY[visibleBanner[0].pendingAction]?.bannerText : `도급사 요청이 ${visibleBanner.length}건 있습니다.`}
          </span>
          <button
            type="button"
            onClick={openBanner}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-bold text-danger hover:bg-red-50"
          >
            확인
          </button>
        </div>
      )}

      {reviewTarget && copy && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
                <AlertCircle size={16} className="text-danger" /> {copy.title}
              </p>
              <button type="button" onClick={() => setReviewId(null)} className="text-muted hover:text-ink">
                <X size={16} />
              </button>
            </div>
            <p className="mb-5 text-sm leading-relaxed text-ink">{copy.body(reviewTarget)}</p>
            <p className="mb-4 text-sm font-semibold text-ink">승인하시겠습니까?</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => decide(false)} disabled={processing}>
                거절
              </Button>
              <Button onClick={() => decide(true)} disabled={processing}>
                {processing ? "처리 중..." : "승인"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
