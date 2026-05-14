// src/UploadPage.jsx
// ─────────────────────────────────────────────────────────────
// 공개 인수증 업로드 페이지 — 로그인 불필요, 링크만 있으면 접근 가능
// 사용: /upload?id={dispatchDocId}
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from "react";
import { db } from "./firebase";
import {
  doc,
  getDoc,
  updateDoc,
  increment,
  deleteDoc,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";


// ────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────
export default function UploadPage() {
  const [orderId, setOrderId]     = useState(null);
  const [order, setOrder]         = useState(null);
  const [status, setStatus]       = useState("loading"); // loading | ready | error | done
  const [files, setFiles]         = useState([]);
  const [previews, setPreviews]   = useState([]);
  const [progress, setProgress]   = useState({});
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded]   = useState([]);
  const [drag, setDrag]           = useState(false);
  const inputRef                  = useRef(null);

  // ── URL에서 id 추출 & 오더 조회 ──────────────────────────
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) { setStatus("error"); return; }
    setOrderId(id);
 
    (async () => {
     try {
        // orders(신규) → dispatch(기존) → dispatch_test(테스트) 순으로 검색
        let snap = await getDoc(doc(db, "orders", id));
        if (!snap.exists()) {
          snap = await getDoc(doc(db, "dispatch", id));
        }
        if (!snap.exists()) {
          snap = await getDoc(doc(db, "dispatch_test", id));
        }
        if (snap.exists()) {
          // 어느 컬렉션에서 찾았는지 저장
          setOrderId(id);
          setOrder({ _id: id, _col: snap.ref.parent.id, ...snap.data() });
          setStatus("ready");
        } else {
          setStatus("error");
        }
      } catch (e) {
        console.error(e);
        setStatus("error");
      }
    })();
  }, []);

  // ── 파일 선택 처리 ───────────────────────────────────────
  const handleFiles = useCallback((newFiles) => {
    const arr = Array.from(newFiles).filter(f => f.type.startsWith("image/") || f.type === "application/pdf");
    if (!arr.length) return;
    setFiles(prev => [...prev, ...arr]);
    arr.forEach(f => {
      const reader = new FileReader();
      reader.onload = (e) => setPreviews(prev => [...prev, { name: f.name, src: e.target.result, type: f.type }]);
      reader.readAsDataURL(f);
    });
  }, []);

  const removeFile = (i) => {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
    setPreviews(prev => prev.filter((_, idx) => idx !== i));
  };
// ✅ 이미지 압축 (최대 1200px, JPEG 75%)
  const compressImage = (file) => new Promise((resolve) => {
    if (file.type === "application/pdf") { resolve(file); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => resolve(new File([blob], file.name, { type: "image/jpeg" })), "image/jpeg", 0.75);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
  // ── 업로드 실행 ──────────────────────────────────────────
  const handleUpload = async () => {
    if (!files.length || uploading) return;
    setUploading(true);
    const results = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        // ✅ 압축
        setProgress(prev => ({ ...prev, [i]: 10 }));
        const compressed = await compressImage(file);

        // ✅ base64 변환
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(compressed);
        });

        // ✅ 크기 체크 (1MB = 1,000,000 bytes)
        const sizeKB = Math.round(base64.length * 0.75 / 1024);
        if (base64.length > 1_300_000) {
          alert(`${file.name} 파일이 너무 큽니다 (${sizeKB}KB). 사진을 더 작게 찍거나 다른 사진을 사용하세요.`);
          setProgress(prev => { const n = {...prev}; delete n[i]; return n; });
          continue;
        }

        setProgress(prev => ({ ...prev, [i]: 70 }));

        // ✅ Firestore 저장 (각 사진 = 개별 문서)
        const docRef = await addDoc(collection(db, order._col || "orders", orderId, "attachments"), {
          base64,
          name: file.name,
          type: "image/jpeg",
          sizeKB,
          uploadedAt: serverTimestamp(),
          source: "driver_upload",
        });

        setProgress(prev => ({ ...prev, [i]: 100 }));
        results.push({ name: file.name, url: base64, docId: docRef.id });

      } catch (err) {
        console.error("업로드 오류:", err);
        alert(`${file.name} 업로드 실패: ${err.message}`);
      }
    }

    // ✅ 부모 문서에 attachCount 업데이트 (실시간 카운트용)
if (results.length > 0) {
      try {
        const parentRef = doc(db, order._col || "orders", orderId);
        await updateDoc(parentRef, { attachCount: increment(results.length) });
      } catch(e) { console.error("카운트 업데이트 실패:", e); }
    }

    setUploaded(results);
    setFiles([]);
    setPreviews([]);
    setProgress({});
    setUploading(false);
    setStatus("done");
  };
  // ────────────────────────────────────────────────────────
  // 렌더
  // ────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Noto Sans KR', sans-serif", minHeight: "100vh", background: "#f0f2f5" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet" />

      {/* ── 헤더 ── */}
      <div style={{ background: "#1B2B4B", padding: "16px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, background: "rgba(255,255,255,0.15)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "white", fontSize: 20 }}>📦</span>
        </div>
        <div>
          <div style={{ color: "white", fontWeight: 900, fontSize: 16, letterSpacing: "-0.3px" }}>KP-Flow</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>인수증 / 서류 업로드</div>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px 40px" }}>

        {/* ── 로딩 ── */}
        {status === "loading" && (
          <div style={cardStyle}>
            <div style={{ textAlign: "center", padding: "40px 0", color: "#6b7280" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>배차 정보 불러오는 중...</div>
            </div>
          </div>
        )}

        {/* ── 오류 ── */}
        {status === "error" && (
          <div style={cardStyle}>
            <div style={{ textAlign: "center", padding: "40px 0", color: "#ef4444" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>링크가 올바르지 않습니다</div>
              <div style={{ color: "#9ca3af", fontSize: 13 }}>배차 담당자에게 링크를 다시 요청해주세요.</div>
            </div>
          </div>
        )}

        {/* ── 업로드 완료 ── */}
        {status === "done" && (
          <div style={cardStyle}>
            <div style={{ textAlign: "center", paddingTop: 24, paddingBottom: 8 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 900, fontSize: 18, color: "#1B2B4B", marginBottom: 4 }}>업로드 완료!</div>
              <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>
                {uploaded.length}개 파일이 전달되었습니다.
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {uploaded.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", borderRadius: 10, padding: "10px 12px" }}>
                  {f.url && (
                    <img src={f.url} alt={f.name} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0", flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#1e293b", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>업로드 완료</div>
                  </div>
                  {f.docId && (
                    <button
                      onClick={async () => {
                        if (!window.confirm("이 사진을 삭제하시겠습니까?")) return;
                        try {
                          await deleteDoc(doc(db, order._col || "orders", orderId, "attachments", f.docId));
                          await updateDoc(doc(db, order._col || "orders", orderId), { attachCount: increment(-1) });
                          setUploaded(prev => prev.filter((_, idx) => idx !== i));
                        } catch(e) { alert("삭제 실패: " + e.message); }
                      }}
                      style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid #fca5a5", background: "#fff", color: "#ef4444", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                    >
                      삭제
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => { setStatus("ready"); setUploaded([]); }}
              style={{ ...btnOutline, width: "100%", textAlign: "center" }}
            >
              추가 업로드
            </button>
          </div>
        )}

        {/* ── 메인 업로드 UI ── */}
        {status === "ready" && order && (
          <>
            {/* 오더 정보 카드 */}
            <div style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 4, height: 20, background: "#1B2B4B", borderRadius: 2 }} />
                <span style={{ fontWeight: 700, fontSize: 14, color: "#1B2B4B" }}>배차 정보</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <InfoBox label="기사명" value={order.이름 || "-"} />
                <InfoBox label="차량번호" value={order.차량번호 || "-"} />
                <InfoBox label="연락처" value={order.전화번호 || "-"} />
                <InfoBox label="상차일" value={order.상차일 || "-"} />
              </div>

              <div style={{ marginTop: 10, background: "#f8fafc", borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 2 }}>상차지</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{order.상차지명 || "-"}</div>
                </div>
                <div style={{ color: "#94a3b8", fontSize: 16 }}>→</div>
                <div style={{ flex: 1, textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 2 }}>하차지</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{order.하차지명 || "-"}</div>
                </div>
              </div>
            </div>

            {/* 안내 이미지 카드 */}
            <div style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ width: 4, height: 20, background: "#f59e0b", borderRadius: 2 }} />
                <span style={{ fontWeight: 700, fontSize: 14, color: "#1B2B4B" }}>업로드 안내</span>
              </div>
              <div style={{ background: "#f0f4f9", border: "1px solid #d1dce8", borderRadius: 10, padding: "14px 16px", marginBottom: 14, fontSize: 13, color: "#1e3a5f", lineHeight: 1.8 }}>
                아래 서류를 <strong>한 장씩 선명하게</strong> 촬영하여 업로드해주세요:
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1B2B4B", flexShrink: 0, display: "inline-block" }} />
                    <span>거래명세서</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#1B2B4B", borderRadius: 7, padding: "7px 12px" }}>
                    <span style={{ color: "#fff", fontSize: 15 }}>⚠️</span>
                    <span style={{ color: "#ffffff", fontWeight: 800, fontSize: 13 }}>파렛트 전표 — 반드시 서명 받은 후 업로드!</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1B2B4B", flexShrink: 0, display: "inline-block" }} />
                    <span>타코메타 기록지 (냉장/냉동 시)</span>
                  </div>
                </div>
              </div>
              <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #e2e8f0" }}>
                <img
                  src="/거래명세서.png"
                  alt="거래명세서 예시"
                  style={{ width: "100%", display: "block" }}
                  onError={(e) => { e.target.style.display = "none"; }}
                />
              </div>
              <div style={{ textAlign: "center", marginTop: 8, fontSize: 12, color: "#94a3b8" }}>▲ 거래명세서 예시 (이와 같이 선명하게 촬영)</div>
            </div>

            {/* 업로드 영역 */}
            <div style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 4, height: 20, background: "#3b82f6", borderRadius: 2 }} />
                <span style={{ fontWeight: 700, fontSize: 14, color: "#1B2B4B" }}>파일 선택</span>
              </div>

              {/* 드래그앤드롭 영역 */}
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
                style={{
                  border: `2px dashed ${drag ? "#3b82f6" : "#cbd5e1"}`,
                  borderRadius: 12,
                  padding: "28px 16px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: drag ? "#eff6ff" : "#f8fafc",
                  transition: "all 0.2s",
                  marginBottom: 14,
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
                <div style={{ fontWeight: 700, color: "#1B2B4B", fontSize: 15, marginBottom: 4 }}>사진을 탭하여 선택하세요</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>JPG, PNG, PDF 지원 · 여러 장 동시 선택 가능</div>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  capture="environment"
                  style={{ display: "none" }}
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </div>

              {/* 선택된 파일 미리보기 */}
              {previews.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 8 }}>선택된 파일 ({previews.length}장)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {previews.map((p, i) => (
                      <div key={i} style={{ position: "relative", borderRadius: 8, overflow: "hidden", aspectRatio: "1", background: "#f1f5f9" }}>
                        {p.type.startsWith("image/") ? (
                          <img src={p.src} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
                            📄
                            <span style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>PDF</span>
                          </div>
                        )}
                        {/* 진행률 오버레이 */}
                        {uploading && progress[i] !== undefined && progress[i] < 100 && (
                          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ color: "white", fontWeight: 700, fontSize: 16 }}>{progress[i]}%</span>
                          </div>
                        )}
                        {uploading && progress[i] === 100 && (
                          <div style={{ position: "absolute", inset: 0, background: "rgba(5,150,105,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ color: "white", fontSize: 24 }}>✓</span>
                          </div>
                        )}
                        {/* 삭제 버튼 */}
                        {!uploading && (
                          <button
                            onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                            style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.6)", color: "white", border: "none", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                          >×</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 업로드 버튼 */}
              {files.length > 0 && (
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  style={{
                    width: "100%",
                    padding: "14px",
                    borderRadius: 12,
                    border: "none",
                    background: uploading ? "#94a3b8" : "#1B2B4B",
                    color: "white",
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: uploading ? "not-allowed" : "pointer",
                    fontFamily: "'Noto Sans KR', sans-serif",
                    transition: "background 0.2s",
                  }}
                >
                  {uploading ? `⏫ 업로드 중...` : `📤 ${files.length}장 업로드하기`}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────
// 스타일 상수
// ────────────────────────────────────────
const cardStyle = {
  background: "white",
  borderRadius: 14,
  padding: "18px 16px",
  marginBottom: 14,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
};

const btnOutline = {
  padding: "10px 24px",
  borderRadius: 8,
  border: "1.5px solid #1B2B4B",
  background: "white",
  color: "#1B2B4B",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "'Noto Sans KR', sans-serif",
};

// ────────────────────────────────────────
// 서브 컴포넌트
// ────────────────────────────────────────
function InfoBox({ label, value }) {
  return (
    <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}