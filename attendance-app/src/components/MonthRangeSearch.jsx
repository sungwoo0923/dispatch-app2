import { useEffect, useMemo, useState } from "react";
import { collection, addDoc, query, where, onSnapshot, serverTimestamp } from "firebase/firestore";
import { Search, Lock, Unlock, Send } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";

const MAX_MONTHS_DEFAULT = 3;

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthsBack(n) {
  const list = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    list.push(monthKey(d));
  }
  return list;
}
function monthDiff(startKey, endKey) {
  const [sy, sm] = startKey.split("-").map(Number);
  const [ey, em] = endKey.split("-").map(Number);
  return ey * 12 + em - (sy * 12 + sm) + 1;
}

// 계약관리/급여관리/휴가관리 등 모바일 조회 화면 상단에 공통으로 붙는
// 월단위 기간 검색 바. 기본 3개월까지만 조회 가능하고, 그 이상을 보려면
// 관리자에게 확장 요청을 보내 승인받아야 한다(관리자가 다시 잠그면 원복).
export default function MonthRangeSearch({ onSearch }) {
  const { user, profile } = useAuth();
  const toast = useToast();
  const options = useMemo(() => monthsBack(24), []);
  const defaultStart = options[MAX_MONTHS_DEFAULT - 1];
  const defaultEnd = options[0];
  const [startMonth, setStartMonth] = useState(defaultStart);
  const [endMonth, setEndMonth] = useState(defaultEnd);
  const [myRequest, setMyRequest] = useState(null);

  const extended = profile?.extendedHistoryAccess === true;
  const maxMonths = extended ? 36 : MAX_MONTHS_DEFAULT;
  const span = monthDiff(startMonth, endMonth);
  const overLimit = span > maxMonths;

  useEffect(() => {
    onSearch({ startMonth: defaultStart, endMonth: defaultEnd });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "historyAccessRequests"), where("uid", "==", user.uid), where("status", "==", "pending")),
      (snap) => setMyRequest(snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null)
    );
    return () => unsub();
  }, [user]);

  const runSearch = () => {
    if (overLimit) return;
    onSearch({ startMonth, endMonth });
  };

  const requestExtension = async () => {
    if (!user || myRequest) return;
    try {
      await addDoc(collection(db, "historyAccessRequests"), {
        companyId: profile.companyId,
        uid: user.uid,
        name: profile.name,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      toast.success("관리자에게 조회기간 확장을 요청했습니다.");
    } catch (err) {
      toast.error(`요청에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    }
  };

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3.5">
      <div className="flex items-center gap-1.5">
        <select
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-xs"
          value={startMonth}
          onChange={(e) => setStartMonth(e.target.value)}
        >
          {options.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <span className="shrink-0 text-xs text-muted">~</span>
        <select
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-xs"
          value={endMonth}
          onChange={(e) => setEndMonth(e.target.value)}
        >
          {options.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={runSearch}
          disabled={overLimit}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
        >
          <Search size={13} /> 조회
        </button>
      </div>
      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted">
        {extended ? <Unlock size={11} className="text-primary" /> : <Lock size={11} />}
        {extended ? "확장된 조회기간이 승인되어 있습니다." : `최대 ${MAX_MONTHS_DEFAULT}개월까지 조회할 수 있습니다.`}
      </div>
      {overLimit && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2">
          <p className="text-[11px] text-warning">선택한 기간이 {maxMonths}개월을 초과했습니다.</p>
          <button
            type="button"
            onClick={requestExtension}
            disabled={Boolean(myRequest)}
            className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-primary disabled:text-slate-400"
          >
            <Send size={11} /> {myRequest ? "요청 대기중" : "관리자에게 확장 요청"}
          </button>
        </div>
      )}
    </div>
  );
}
