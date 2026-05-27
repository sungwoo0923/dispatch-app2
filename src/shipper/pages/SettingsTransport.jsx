import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";

function Row({ label, value }) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-center py-3 border-b border-gray-100 last:border-b-0">
      <span className="text-[14px] text-gray-500 font-medium">{label}</span>
      <span className="text-[14px] text-gray-800">{value || "-"}</span>
    </div>
  );
}

export default function SettingsTransport() {
  const [userData, setUserData] = useState(null);
  const [transportDetail, setTransportDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) { setLoading(false); return; }
        const data = snap.data();
        setUserData(data);

        // Fetch transport detail from transportApplications
        const linked = data.linkedTransportCompany;
        if (linked?.companyName) {
          const q = query(
            collection(db, "transportApplications"),
            where("companyName", "==", linked.companyName),
            where("status", "==", "approved")
          );
          const tSnap = await getDocs(q);
          if (!tSnap.empty) {
            setTransportDetail(tSnap.docs[0].data());
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
        불러오는 중...
      </div>
    );
  }

  const linked = userData?.linkedTransportCompany;

  if (!linked?.companyName) {
    return (
      <div className="bg-white rounded-xl px-8 py-8">
        <h2 className="text-[18px] font-bold text-gray-800 mb-6">운송사 관리</h2>
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-6 py-10 text-center">
          <div className="text-[14px] text-gray-500">연동된 운송사가 없습니다.</div>
          <div className="text-[13px] text-gray-400 mt-1">
            가입 신청 시 운송사를 선택하지 않았거나 아직 연동이 완료되지 않았습니다.
          </div>
        </div>
      </div>
    );
  }

  const detail = transportDetail;

  return (
    <div className="bg-white rounded-xl px-8 py-8">
      <h2 className="text-[18px] font-bold text-gray-800 mb-6">운송사 관리</h2>

      <div className="mb-3">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          연동 완료
        </span>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-[#1B2B4B] px-6 py-4">
          <div className="text-white font-bold text-[16px]">{linked.companyName}</div>
          {linked.companyCode && (
            <div className="text-white/60 text-[12px] mt-0.5">코드: {linked.companyCode}</div>
          )}
        </div>
        <div className="px-6 py-2">
          <Row label="사업자번호" value={linked.businessNumber || detail?.businessNumber} />
          <Row label="대표자" value={linked.representative || detail?.name || detail?.representative} />
          <Row label="주소" value={detail?.address} />
          <Row label="연락처" value={detail?.phone || detail?.tel} />
          <Row label="이메일" value={detail?.email} />
        </div>
      </div>

      <p className="text-[12px] text-gray-400 mt-4">
        운송사 변경이 필요한 경우 운송사 관리자 또는 시스템 관리자에게 문의해 주세요.
      </p>
    </div>
  );
}
