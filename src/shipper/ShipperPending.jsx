// src/shipper/ShipperPending.jsx

import React, { useState, useEffect } from "react";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc, collection, query, where, onSnapshot } from "firebase/firestore";

// 방사형(GPS 레이더) 펄스 — 여러 겹의 링이 시차를 두고 퍼져나가는 효과
function RadarPulse({ active, color = "#1B2B4B" }) {
  if (!active) return null;
  return (
    <>
      {[0, 0.6, 1.2].map((delay) => (
        <span
          key={delay}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `2px solid ${color}`,
            opacity: 0,
            animation: "radarPulse 1.8s ease-out infinite",
            animationDelay: `${delay}s`,
          }}
        />
      ))}
    </>
  );
}

const STAGE_META = {
  submitted: { label: "신청 접수", desc: "화주사 가입 신청이 접수되었습니다." },
  step1: { label: "1차 승인", desc: "연동 운송사 관리자가 확인하고 있습니다." },
  step2: { label: "2차 승인", desc: "최종 승인이 완료되면 바로 이용하실 수 있습니다." },
};

export default function ShipperPending() {
  const [showContact, setShowContact] = useState(false);
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);

  // 🔥 승인 감지 → 자동 이동
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists() && snap.data().approved === true) {
        window.location.href = "/shipper";
      }
    });
    return () => unsub();
  }, []);

  // 🔥 내 신청서(companyApplications) 실시간 구독 — 1차/2차 진행 상황 표시
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      const q = query(collection(db, "companyApplications"), where("userId", "==", user.uid));
      const unsubSnap = onSnapshot(q, (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setApplication(list[0] || null);
        setLoading(false);
      });
      return unsubSnap;
    });
    return () => unsub();
  }, []);

  const logout = async () => {
    await signOut(auth);
    window.location.href = "/shipper-login";
  };

  const rejected = application?.transportApprovalStatus === "rejected" || application?.status === "rejected";
  const step1Done = application?.transportApprovalStatus === "approved";
  const step2Done = application?.status === "approved"; // 도달 시 즉시 /shipper 로 리다이렉트됨

  const currentStage = step1Done ? "step2" : "step1";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#f4f6fa] to-[#e9edf5] px-4">
      <style>{`
        @keyframes radarPulse {
          0% { transform: scale(1); opacity: 0.55; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes lineFill {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>

      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-[440px] overflow-hidden">
        {/* 헤더 */}
        <div className="px-8 pt-8 pb-6 text-center" style={{ background: rejected ? "linear-gradient(135deg,#7f1d1d,#991b1b)" : "linear-gradient(135deg,#1B2B4B,#243a60)" }}>
          <div className="text-white/60 text-[12px] font-semibold tracking-wide mb-1">KP-FLOW 화주 계정</div>
          <h1 className="text-white text-[20px] font-bold">
            {rejected ? "승인이 거절되었습니다" : "승인 진행 중입니다"}
          </h1>
          {application?.companyName && (
            <div className="text-white/70 text-[13px] mt-1.5">{application.companyName}</div>
          )}
        </div>

        <div className="px-8 py-8">
          {loading ? (
            <div className="text-center text-gray-400 text-[13px] py-10">불러오는 중...</div>
          ) : rejected ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </div>
              <div className="text-[14px] text-gray-700 font-semibold mb-1">가입 신청이 거절되었습니다</div>
              {(application?.transportRejectionReason || application?.rejectionReason) && (
                <div className="text-[12px] text-gray-500 mt-2 bg-gray-50 rounded-lg px-4 py-3">
                  {application.transportRejectionReason || application.rejectionReason}
                </div>
              )}
              <div className="text-[12px] text-gray-400 mt-3">자세한 사유는 관리자 문의를 이용해주세요.</div>
            </div>
          ) : (
            <>
              {/* 진행 단계: 1차 승인 → 2차 승인 */}
              <div className="relative flex items-center justify-between px-4 mb-2">
                {/* 연결선 (배경) */}
                <div className="absolute left-[52px] right-[52px] top-[26px] h-[3px] bg-gray-150 bg-gray-200 rounded-full" />
                {/* 연결선 (진행 채움) */}
                <div
                  className="absolute left-[52px] top-[26px] h-[3px] bg-[#1B2B4B] rounded-full transition-all duration-700 ease-out"
                  style={{ width: step1Done ? "calc(100% - 104px)" : "0%" }}
                />

                {[
                  { key: "step1", label: "1차 승인", done: step1Done, active: !step1Done },
                  { key: "step2", label: "2차 승인", done: step2Done, active: step1Done && !step2Done },
                ].map((s) => (
                  <div key={s.key} className="relative z-10 flex flex-col items-center" style={{ width: 104 }}>
                    <div className="relative w-[52px] h-[52px] flex items-center justify-center">
                      <RadarPulse active={s.active} color={"#1B2B4B"} />
                      <div
                        className={`w-[52px] h-[52px] rounded-full flex items-center justify-center font-bold text-[15px] transition-colors duration-500 ${
                          s.done ? "bg-[#1B2B4B] text-white" : s.active ? "bg-white border-2 border-[#1B2B4B] text-[#1B2B4B]" : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {s.done ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        ) : (
                          s.key === "step1" ? "1" : "2"
                        )}
                      </div>
                    </div>
                    <div className={`mt-2.5 text-[12px] font-bold ${s.done || s.active ? "text-[#1B2B4B]" : "text-gray-400"}`}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="text-center mt-6 mb-2">
                <div className="text-[14px] font-bold text-gray-800">{STAGE_META[currentStage].label} 대기 중</div>
                <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">
                  {STAGE_META[currentStage].desc}
                  <br />
                  보통 영업시간 기준 1~24시간 내 처리됩니다.
                </p>
              </div>
            </>
          )}

          <div className="flex flex-col gap-2.5 mt-7">
            <button
              onClick={() => setShowContact(true)}
              className="w-full py-3 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition"
            >
              관리자 문의
            </button>
            <button
              onClick={logout}
              className="w-full py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-[13px] font-semibold transition"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>

      {/* 관리자 문의 팝업 */}
      {showContact && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center px-4">
          <div className="bg-white w-full max-w-[360px] rounded-2xl shadow-2xl p-7 text-center">
            <div className="text-xl font-bold text-gray-800 mb-5">관리자 문의</div>
            <div className="space-y-4 text-gray-700">
              <div>
                <div className="text-sm text-gray-500">대표번호</div>
                <a href="tel:15332525" className="text-blue-600 font-bold text-2xl">1533-2525</a>
              </div>
              <div>
                <div className="text-sm text-gray-500">운영시간</div>
                <div className="text-base">평일 09:00 ~ 18:00</div>
              </div>
              <div className="text-sm text-gray-400">승인 관련 문의는 위 번호로 연락 부탁드립니다.</div>
            </div>
            <button
              onClick={() => setShowContact(false)}
              className="mt-6 w-full py-3 bg-blue-600 text-white rounded-lg text-base font-semibold"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
