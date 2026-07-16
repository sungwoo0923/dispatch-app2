// src/DriverSearchPage.jsx
// 공개 통합 업로드 링크 — 로그인 불필요, 날짜+차량번호+이름으로 오더 검색
// 사용: /driver-upload

import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

const cardStyle = {
  background: "white",
  borderRadius: 16,
  padding: "20px 20px",
  marginBottom: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  border: "1px solid #e2e8f0",
};

const btnPrimary = {
  background: "#1B2B4B",
  color: "white",
  border: "none",
  borderRadius: 12,
  padding: "13px 0",
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
  width: "100%",
  letterSpacing: "-0.2px",
};

function todayKSTStr() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

function InputField({ label, type = "text", value, onChange, placeholder, onKeyDown }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", display: "block", marginBottom: 6, letterSpacing: "0.3px" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        style={{
          width: "100%",
          padding: "11px 14px",
          borderRadius: 10,
          border: "1.5px solid #e2e8f0",
          fontSize: 14,
          fontWeight: 500,
          boxSizing: "border-box",
          outline: "none",
          background: "#f8fafc",
          color: "#1e293b",
          WebkitAppearance: "none",
        }}
        onFocus={e => { e.target.style.borderColor = "#1B2B4B"; e.target.style.background = "white"; }}
        onBlur={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.background = "#f8fafc"; }}
      />
    </div>
  );
}

export default function DriverSearchPage() {
  const params = new URLSearchParams(window.location.search);
  const sourceFixed = params.get("source") === "fixed";
  const [date, setDate] = useState(params.get("date") || todayKSTStr());
  const [vehicleNo, setVehicleNo] = useState(params.get("vehicle") || "");
  const [name, setName] = useState(params.get("name") || "");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const autoFilled = !!(params.get("date") || params.get("vehicle") || params.get("name"));

  // URL 파라미터로 자동입력된 경우 자동 검색
  useEffect(() => {
    if (autoFilled && params.get("date") && params.get("vehicle") && params.get("name")) {
      handleSearch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async () => {
    const trimVehicle = vehicleNo.trim().replace(/\s/g, "");
    const trimName = name.trim();
    if (!date) { setError("날짜를 선택해주세요."); return; }
    if (!trimVehicle) { setError("차량번호를 입력해주세요."); return; }
    if (!trimName) { setError("이름을 입력해주세요."); return; }

    setError(null);
    setLoading(true);
    setResults(null);

    try {
      const matched = [];

      if (sourceFixed) {
        // 고정거래처관리 오더만 검색 (날짜 필드 사용)
        try {
          const snap = await getDocs(
            query(collection(db, "fixedClients"), where("날짜", "==", date))
          );
          snap.forEach(d => {
            const data = d.data();
            const vn = String(data.차량번호 || "").replace(/\s/g, "");
            const nm = String(data.이름 || "").trim();
            if (vn === trimVehicle && nm === trimName) {
              matched.push({ _id: d.id, _col: "fixedClients", 상차일: data.날짜, ...data });
            }
          });
        } catch {
          // collection may not exist
        }
      } else {
        // 4/5파트 오더만 검색
        const tryCollection = async (colName) => {
          try {
            const snap = await getDocs(
              query(collection(db, colName), where("상차일", "==", date))
            );
            snap.forEach(d => {
              const data = d.data();
              // 화주사 전송 카피는 원본과 동일 오더이므로 검색결과 중복을 막기 위해 제외
              if (data.source === "transport_transmit") return;
              const vn = String(data.차량번호 || "").replace(/\s/g, "");
              const nm = String(data.이름 || "").trim();
              if (vn === trimVehicle && nm === trimName) {
                matched.push({ _id: d.id, _col: colName, ...data });
              }
            });
          } catch {
            // collection may not exist
          }
        };
        await tryCollection("orders");
        await tryCollection("dispatch");
      }

      setResults(matched);
    } catch (e) {
      console.error(e);
      setError("검색 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  const goToUpload = (id) => {
    window.location.href = `/upload?id=${id}`;
  };

  const statusLabel = (r) => {
    if (r.배차상태 === "배차완료" || r.배차상태 === "완료") return { text: "배차완료", color: "#059669", bg: "#f0fdf4" };
    if (r.배차상태 === "배차중") return { text: "배차중", color: "#d97706", bg: "#fffbeb" };
    return { text: r.배차상태 || "대기", color: "#6b7280", bg: "#f3f4f6" };
  };

  return (
    <div style={{ fontFamily: "'Noto Sans KR', sans-serif", minHeight: "100vh", background: "#f0f2f5" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet" />

      {/* 헤더 */}
      <div style={{ background: "#1B2B4B", padding: "16px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 36, height: 36,
          background: "rgba(255,255,255,0.15)", borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
        </div>
        <div>
          <div style={{ color: "white", fontWeight: 900, fontSize: 16, letterSpacing: "-0.3px" }}>KP-Flow</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>서류 업로드 — 오더 검색</div>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px 60px" }}>

        {/* 검색 카드 */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: autoFilled ? 10 : 18 }}>
            <div style={{ width: 4, height: 20, background: "#1B2B4B", borderRadius: 2 }} />
            <span style={{ fontWeight: 700, fontSize: 14, color: "#1B2B4B" }}>오더 검색</span>
          </div>
          {autoFilled && (
            <div style={{
              background: "#eff6ff", border: "1px solid #bfdbfe",
              borderRadius: 10, padding: "9px 13px", marginBottom: 14,
              fontSize: 12, color: "#1d4ed8", fontWeight: 600,
            }}>
              담당자가 정보를 자동 입력했습니다. 확인 후 검색하세요.
            </div>
          )}

          <div>
            <InputField
              label="상차일"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
            <div style={{ marginTop: -10, marginBottom: 14, fontSize: 11, color: "#ef4444", fontWeight: 600 }}>
              * 상차일 기준으로 선택하세요
            </div>
          </div>
          <InputField
            label="차량번호"
            value={vehicleNo}
            onChange={e => setVehicleNo(e.target.value)}
            placeholder="예) 12가1234"
            onKeyDown={handleKeyDown}
          />
          <InputField
            label="기사 이름"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="이름 입력"
            onKeyDown={handleKeyDown}
          />

          {error && (
            <div style={{
              background: "#fef2f2", border: "1px solid #fca5a5",
              borderRadius: 10, padding: "10px 14px", marginBottom: 14,
              fontSize: 13, color: "#ef4444", fontWeight: 600,
            }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSearch}
            disabled={loading}
            style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "검색 중..." : "검색"}
          </button>
        </div>

        {/* 검색 결과 */}
        {results !== null && (
          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ width: 4, height: 20, background: "#1B2B4B", borderRadius: 2 }} />
              <span style={{ fontWeight: 700, fontSize: 14, color: "#1B2B4B" }}>검색 결과</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
                {results.length}건
              </span>
            </div>

            {results.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <div style={{
                  width: 48, height: 48,
                  background: "#f1f5f9", borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 12px",
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                  </svg>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#374151", marginBottom: 6 }}>
                  조회 결과가 없습니다
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
                  날짜, 차량번호, 이름을 다시 확인해주세요.<br />
                  담당자에게 문의하시면 안내받으실 수 있습니다.
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {results.map(r => {
                  const st = statusLabel(r);
                  return (
                    <button
                      key={r._id}
                      onClick={() => goToUpload(r._id)}
                      style={{
                        background: "#f8fafc",
                        border: "1.5px solid #e2e8f0",
                        borderRadius: 14,
                        padding: "14px 16px",
                        textAlign: "left",
                        cursor: "pointer",
                        width: "100%",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = "#1B2B4B";
                        e.currentTarget.style.background = "#f0f4ff";
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(27,43,75,0.12)";
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = "#e2e8f0";
                        e.currentTarget.style.background = "#f8fafc";
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      {/* 상단: 날짜/차량 + 상태 + 선택 */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 3 }}>
                            {r.상차일} · {r.차량번호} · {r.이름}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>
                            {r.거래처명 || "거래처 미지정"}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                          <div style={{
                            fontSize: 10, fontWeight: 700,
                            color: st.color, background: st.bg,
                            padding: "2px 8px", borderRadius: 20,
                          }}>
                            {st.text}
                          </div>
                          <div style={{
                            fontSize: 11, background: "#1B2B4B",
                            color: "white", padding: "3px 10px",
                            borderRadius: 20, fontWeight: 700,
                          }}>
                            업로드
                          </div>
                        </div>
                      </div>

                      {/* 상/하차지 */}
                      <div style={{
                        display: "flex", alignItems: "center", gap: 8,
                        background: "white", borderRadius: 10,
                        padding: "9px 12px", border: "1px solid #f1f5f9",
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginBottom: 2 }}>상차지</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.상차지명 || "-"}
                          </div>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                        <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
                          <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginBottom: 2 }}>하차지</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.하차지명 || "-"}
                          </div>
                        </div>
                      </div>

                      {/* 화물/첨부 현황 */}
                      {(r.화물내용 || r.attachCount > 0) && (
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          {r.화물내용 && (
                            <span style={{ fontSize: 11, color: "#6b7280", background: "#f3f4f6", borderRadius: 6, padding: "2px 8px" }}>
                              {r.화물내용}
                            </span>
                          )}
                          {r.attachCount > 0 && (
                            <span style={{ fontSize: 11, color: "#059669", background: "#f0fdf4", borderRadius: 6, padding: "2px 8px", fontWeight: 600 }}>
                              사진 {r.attachCount}장 업로드됨
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
