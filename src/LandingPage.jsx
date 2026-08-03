import React, { useState } from "react";
import { db } from "./firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import {
  Truck, MapPin, Wallet, Building2, ClipboardList, Users,
  ShieldCheck, Thermometer, PhoneCall, CheckCircle2,
} from "lucide-react";

const NAVY = "#1B2B4B";

const FEATURES = [
  { icon: ClipboardList, title: "배차관리", desc: "상/하차지, 차량, 운임까지 한 화면에서 빠르게 등록하고 배차하세요." },
  { icon: MapPin, title: "실시간 배차현황", desc: "진행 중인 오더와 기사 위치를 실시간으로 확인할 수 있습니다." },
  { icon: Truck, title: "지입차관리", desc: "지입/직영 차량의 노선, 배차 이력, 정산 내역을 한 번에 관리합니다." },
  { icon: Building2, title: "거래처관리", desc: "상/하차지 거래처 정보와 담당자 연락처를 체계적으로 관리합니다." },
  { icon: Wallet, title: "정산관리", desc: "기사운임, 거래처 정산을 자동으로 집계해 실수를 줄여줍니다." },
  { icon: Users, title: "기사관리", desc: "기사 등록부터 등급 관리, 서류 업로드까지 한곳에서 처리합니다." },
  { icon: Thermometer, title: "온도/차량 관제", desc: "냉동/냉장 차량의 온도와 적재함 상태를 원격으로 확인합니다." },
  { icon: ShieldCheck, title: "권한별 접근 관리", desc: "역할에 따라 메뉴 접근 범위를 세밀하게 설정할 수 있습니다." },
];

export default function LandingPage() {
  const [form, setForm] = useState({ companyName: "", name: "", phone: "", email: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const onField = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));

  const scrollToForm = () => {
    document.getElementById("inquiry-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!form.companyName.trim() || !form.name.trim() || !form.phone.trim()) {
      setError("회사명, 담당자명, 연락처는 필수 입력입니다.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await addDoc(collection(db, "landingInquiries"), {
        companyName: form.companyName.trim(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        message: form.message.trim(),
        status: "신규",
        createdAt: serverTimestamp(),
      });
      setSubmitted(true);
    } catch (err) {
      setError("문의 전송에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ fontFamily: "Pretendard, sans-serif", color: "#111827", background: "#fff" }}>
      {/* 상단바 */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "#fff", borderBottom: "1px solid #eef0f3" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/icons/sflow-icon.png" alt="KP-Flow" style={{ width: 30, height: 30, borderRadius: 8 }} />
            <span style={{ fontWeight: 800, fontSize: 18, color: NAVY, letterSpacing: "-0.02em" }}>KP-Flow</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={scrollToForm} style={{ padding: "8px 16px", borderRadius: 8, background: NAVY, color: "#fff", fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer" }}>
              도입 문의
            </button>
            <a href="/login" style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${NAVY}`, color: NAVY, fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
              로그인
            </a>
          </div>
        </div>
      </header>

      {/* 히어로 */}
      <section style={{ background: `linear-gradient(180deg, #f6f8fc 0%, #ffffff 100%)`, padding: "80px 20px 64px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "inline-block", padding: "6px 14px", borderRadius: 999, background: "#eef1f7", color: NAVY, fontSize: 13, fontWeight: 700, marginBottom: 20 }}>
            화물 운송사를 위한 올인원 배차관리 솔루션
          </div>
          <h1 style={{ fontSize: 40, fontWeight: 800, color: "#111827", lineHeight: 1.3, letterSpacing: "-0.02em", margin: 0 }}>
            배차부터 정산까지,<br />
            <span style={{ color: NAVY }}>KP-Flow</span> 하나로 끝내세요
          </h1>
          <p style={{ fontSize: 16, color: "#6b7280", marginTop: 20, lineHeight: 1.7 }}>
            배차관리, 실시간 추적, 지입차관리, 정산관리까지 —<br />
            운송사 운영에 필요한 모든 기능을 하나의 프로그램에서 관리하세요.
          </p>
          <div style={{ marginTop: 32, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={scrollToForm} style={{ padding: "14px 28px", borderRadius: 10, background: NAVY, color: "#fff", fontWeight: 700, fontSize: 15, border: "none", cursor: "pointer" }}>
              도입 문의하기
            </button>
            <a href="/login" style={{ padding: "14px 28px", borderRadius: 10, border: `1.5px solid ${NAVY}`, color: NAVY, fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
              로그인
            </a>
          </div>
        </div>
      </section>

      {/* 주요 기능 */}
      <section style={{ padding: "72px 20px", background: "#fff" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 8 }}>주요 기능</div>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: "#111827", margin: 0 }}>운송 업무에 꼭 필요한 기능만</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ border: "1px solid #eef0f3", borderRadius: 14, padding: 24, background: "#fafbfc" }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                  <f.icon size={22} color="#fff" />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 6 }}>{f.title}</div>
                <div style={{ fontSize: 13.5, color: "#6b7280", lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 도입 절차 */}
      <section style={{ padding: "64px 20px", background: "#f6f8fc" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "#111827", marginBottom: 40 }}>도입은 이렇게 진행돼요</h2>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
            {[
              ["1", "문의 접수", "아래 폼으로 회사 정보를 남겨주세요"],
              ["2", "상담 및 협의", "담당자가 연락드려 이용 방식을 안내합니다"],
              ["3", "계정 발급", "합의 후 전용 계정과 로그인 정보를 드립니다"],
            ].map(([num, title, desc]) => (
              <div key={num} style={{ flex: "1 1 220px", maxWidth: 260, background: "#fff", border: "1px solid #eef0f3", borderRadius: 14, padding: 24 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: NAVY, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, margin: "0 auto 14px" }}>
                  {num}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 6 }}>{title}</div>
                <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 문의 폼 */}
      <section id="inquiry-form" style={{ padding: "72px 20px", background: "#fff" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 8 }}>도입 문의</div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: "#111827", margin: 0 }}>지금 문의해 보세요</h2>
            <p style={{ fontSize: 14, color: "#6b7280", marginTop: 10 }}>담당자가 확인 후 빠르게 연락드리겠습니다.</p>
          </div>

          {submitted ? (
            <div style={{ border: `1.5px solid ${NAVY}`, borderRadius: 14, padding: "40px 24px", textAlign: "center" }}>
              <CheckCircle2 size={40} color={NAVY} style={{ margin: "0 auto 14px" }} />
              <div style={{ fontSize: 17, fontWeight: 800, color: "#111827", marginBottom: 8 }}>문의가 접수되었습니다</div>
              <div style={{ fontSize: 14, color: "#6b7280" }}>담당자 확인 후 입력하신 연락처로 안내드리겠습니다.</div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>회사명 *</label>
                <input autoComplete="off" value={form.companyName} onChange={onField("companyName")}
                  style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 14, outline: "none" }}
                  placeholder="예: 돌캐 운송" />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>담당자명 *</label>
                <input autoComplete="off" value={form.name} onChange={onField("name")}
                  style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 14, outline: "none" }}
                  placeholder="담당자 성함" />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>연락처 *</label>
                <input autoComplete="off" value={form.phone} onChange={onField("phone")}
                  style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 14, outline: "none" }}
                  placeholder="010-0000-0000" />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>이메일</label>
                <input autoComplete="off" value={form.email} onChange={onField("email")}
                  style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 14, outline: "none" }}
                  placeholder="example@company.com" />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>문의 내용</label>
                <textarea rows={4} value={form.message} onChange={onField("message")}
                  style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid #d1d5db", fontSize: 14, outline: "none", resize: "vertical" }}
                  placeholder="차량 대수, 이용 목적 등을 남겨주시면 상담에 도움이 됩니다." />
              </div>

              {error && <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 600 }}>{error}</div>}

              <button type="submit" disabled={submitting}
                style={{ marginTop: 6, padding: "14px", borderRadius: 10, background: submitting ? "#9ca3af" : NAVY, color: "#fff", fontWeight: 700, fontSize: 15, border: "none", cursor: submitting ? "not-allowed" : "pointer" }}>
                {submitting ? "전송 중..." : "문의 보내기"}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* 푸터 */}
      <footer style={{ borderTop: "1px solid #eef0f3", padding: "28px 20px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#9ca3af", fontSize: 13 }}>
            <PhoneCall size={14} />
            <span>도입 문의 및 상담은 위 폼을 이용해 주세요.</span>
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>© {new Date().getFullYear()} KP-Flow. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
